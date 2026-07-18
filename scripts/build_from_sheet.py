#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
미미팩토리 자동 생산 스크립트
─────────────────────────────
매일 GitHub Actions가 이 스크립트를 실행합니다.

하는 일:
 1. 구글 시트(웹에 게시된 CSV)를 읽는다
 2. 상태가 '대기'인 첫 번째 줄을 고른다
 3. 유형에 맞는 스킬 프롬프트로 Claude Code를 실행해 HTML을 만든다
 4. (독서퀴즈면) verify_quiz.py 검증 게이트를 통과시킨다
 5. apps/ 폴더에 저장하고 apps.json에 새 항목을 추가한다
 6. (선택) Apps Script 웹훅으로 시트 상태를 갱신하고 텔레그램 알림을 보낸다

필요한 환경변수 (GitHub Secrets에 등록):
  SHEET_CSV_URL        시트 '웹에 게시' CSV 주소 (필수)
  ANTHROPIC_API_KEY    Claude API 키 (Actions에서 claude 명령이 사용, 필수)
  WEBHOOK_URL          Apps Script 웹앱 주소 (선택 — 시트 상태/URL 자동 기록용)
"""

import csv, html, http.cookiejar, io, json, os, re, subprocess, sys, tempfile
import urllib.request, urllib.parse
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
TODAY = datetime.now(KST).strftime("%Y-%m-%d")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS_DIR = os.path.join(ROOT, "apps")
MANIFEST = os.path.join(ROOT, "apps.json")
OUT_DIR = os.path.join(ROOT, "output")   # Claude가 결과물을 두는 작업 폴더

# 카드 색 팔레트 (book-palette-12 느낌의 그라디언트 페어를 순환 사용)
PALETTES = [
    ("#7aa6ff", "#b78bf5"), ("#5ee7d8", "#7aa6ff"), ("#ff8ad0", "#b78bf5"),
    ("#ffd36e", "#ff8a5c"), ("#8affc1", "#5ee7d8"), ("#c3a1ff", "#ff8ad0"),
]


def log(msg):
    print(f"[미미팩토리] {msg}", flush=True)


# ── 1. 시트 읽기 ──────────────────────────────────────────
def sheet_tabs():
    """SHEET_TABS 환경변수 파싱: 'quiz=0,test=123,friend=456' → [(카테고리, gid), ...]
    미설정 시 첫 탭(gid=0)을 독서퀴즈로만 읽는다 (하위 호환)."""
    spec = os.environ.get("SHEET_TABS", "quiz=0")
    tabs = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        cat, _, gid = part.partition("=")
        tabs.append((cat.strip(), gid.strip() or "0"))
    return tabs


def fetch_rows(gid):
    base = os.environ.get("SHEET_CSV_URL")
    if not base:
        log("SHEET_CSV_URL이 없습니다. 환경변수를 확인하세요."); sys.exit(1)
    url = re.sub(r"([?&]gid=)\d+", r"\g<1>" + gid, base)
    if f"gid={gid}" not in url:
        url += ("&" if "?" in url else "?") + "gid=" + gid
    with urllib.request.urlopen(url) as r:
        text = r.read().decode("utf-8")
    return list(csv.reader(io.StringIO(text)))


def read_sheet():
    """모든 탭을 읽어 [(카테고리, gid, rows), ...] 반환."""
    return [(cat, gid, fetch_rows(gid)) for cat, gid in sheet_tabs()]


def header_map(header):
    """1행 머리글에서 각 필드의 열 위치를 찾는다 — 열 순서가 바뀌어도 동작."""
    m = {}
    fields = (("제목", "title"), ("작가", "author"), ("팔레트", "palette"),
              ("에디션", "edition"), ("상태", "status"), ("url", "url"),
              ("완료일", "done"), ("자료", "material"), ("프롬프트", "extra"))
    for j, cell in enumerate(header):
        c = str(cell).strip().lower()
        for key, field in fields:
            if key in c and field not in m:
                m[field] = j
    return m


def pick_waiting(tabs):
    """생산 대상 행을 찾는다. 탭이 곧 유형(quiz/test/friend)이다.
    우선순위:
      1) 모든 탭에서 상태가 '긴급'인 첫 줄 (탭 순서: SHEET_TABS 정의 순)
      2) 상태가 '대기'인 줄, 또는 상태·URL·완료일이 모두 빈칸인 신규 줄(제목 필수)
         → 제목·작가만 적어도 생산된다.
    '중지'(또는 그 외 임의 텍스트)가 상태에 있으면 건너뛴다.
    열 위치는 1행 머리글 이름으로 찾으므로 열을 추가·삭제해도 동작한다.
    자료 열에 구글독스 URL이 있으면 자료 기반 생산에 사용한다.
    """
    parsed = []
    for cat, gid, rows in tabs:
        if not rows:
            continue
        cm = header_map(rows[0])
        if "title" not in cm:
            log(f"탭(gid={gid}): '제목' 머리글이 없어 건너뜁니다.")
            continue

        def cell(row, field):
            j = cm.get(field, -1)
            return row[j].strip() if 0 <= j < len(row) else ""

        for i, row in enumerate(rows[1:], start=2):  # i = 시트 기준 행 번호
            title = cell(row, "title")
            if not title:
                continue
            parsed.append({"row": i, "gid": gid, "type": cat, "title": title,
                           "author": cell(row, "author"),
                           "palette": cell(row, "palette"),
                           "edition": cell(row, "edition") or "프리미엄+티저",
                           "material_url": cell(row, "material"),
                           "extra": cell(row, "extra"),
                           "_status": cell(row, "status"),
                           "_url": cell(row, "url"), "_done": cell(row, "done")})

    # 1차: 긴급
    for it in parsed:
        if it["_status"] == "긴급":
            return it
    # 2차: 대기 또는 빈칸 신규
    for it in parsed:
        fresh = it["_status"] == "" and it["_url"] == "" and it["_done"] == ""
        if it["_status"] == "대기" or fresh:
            return it
    return None


# ── 2. 프롬프트 구성 ──────────────────────────────────────
def category_of(ytype):
    """시트 유형(A열) → 카테고리: 독서퀴즈→quiz, 친해지기→friend, 그 외→test"""
    if ytype.startswith("독서") or ytype == "quiz":
        return "quiz"
    if "친해" in ytype or ytype == "friend":
        return "friend"
    return "test"


MATERIAL_DIR = os.path.join(ROOT, "자료")
MATERIAL_MAX = 20000


def fetch_gdoc(url):
    """링크 공유(뷰어)된 구글독스 본문을 텍스트로 받아온다. 실패 시 RuntimeError."""
    m = re.search(r"docs\.google\.com/document/d/([\w-]+)", url)
    if not m:
        raise RuntimeError("구글독스 문서 주소가 아닙니다 (docs.google.com/document/... 만 지원)")
    export = f"https://docs.google.com/document/d/{m.group(1)}/export?format=txt"
    req = urllib.request.Request(export, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            text = r.read().decode("utf-8", errors="replace")
    except Exception as e:
        raise RuntimeError(f"문서 다운로드 실패 — 공유 설정(링크 있는 모든 사용자·뷰어)을 확인하세요: {e}")
    text = text.lstrip("﻿").strip()
    if not text or text[:1] == "<":
        raise RuntimeError("문서 대신 로그인 페이지가 왔습니다 — 공유 설정(링크 있는 모든 사용자·뷰어)을 확인하세요")
    return text[:MATERIAL_MAX]


# PDF·이미지 자료 지원 — Claude가 Read 도구로 직접 읽으므로 텍스트 추출 불필요
MATERIAL_FILE_EXTS = (".pdf", ".png", ".jpg", ".jpeg", ".webp")
MAGIC_EXT = ((b"%PDF", ".pdf"), (b"\x89PNG", ".png"),
             (b"\xff\xd8", ".jpg"), (b"RIFF", ".webp"))

_opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def _http_get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with _opener.open(req, timeout=60) as r:
        return r.read()


def fetch_drive_file(url, slug):
    """링크 공유(뷰어)된 구글 드라이브 파일(PDF/이미지)을 임시 폴더에 내려받아 경로 반환.
    실패 시 RuntimeError — 근거 없는 생산을 막기 위해 호출부에서 중단한다."""
    m = re.search(r"drive\.google\.com/(?:file/d/([\w-]+)|(?:open|uc)\?[^\s\"]*?id=([\w-]+))", url)
    if not m:
        raise RuntimeError("드라이브 파일 주소가 아닙니다 (drive.google.com/file/d/… 만 지원)")
    fid = m.group(1) or m.group(2)
    data = _http_get(f"https://drive.google.com/uc?export=download&id={fid}")
    if data[:200].lstrip()[:1] == b"<":  # HTML — 대용량 확인 페이지 또는 공유설정 오류
        page = data.decode("utf-8", "replace")
        fm = re.search(r'action="(https://drive\.usercontent\.google\.com/download[^"]*)"', page)
        if fm:
            base = html.unescape(fm.group(1))
            hidden = re.findall(r'<input type="hidden" name="([^"]+)" value="([^"]*)"', page)
            q = urllib.parse.urlencode(dict(hidden))
            data = _http_get(base + ("&" if "?" in base else "?") + q)
    ext = next((e for magic, e in MAGIC_EXT if data[:8].startswith(magic)), None)
    if ext is None:
        raise RuntimeError("PDF/이미지가 아닌 응답이 왔습니다 — 공유 설정(링크 있는 모든 사용자·뷰어)과 파일 형식(PDF/PNG/JPG/WEBP)을 확인하세요")
    dl_dir = os.path.join(tempfile.gettempdir(), "mimi_material")
    os.makedirs(dl_dir, exist_ok=True)
    path = os.path.join(dl_dir, slug + ext)
    with open(path, "wb") as f:
        f.write(data)
    return path


def load_material(item, slug):
    """자료 우선순위: ① 시트 자료 열 URL(구글독스→텍스트, 드라이브 파일→PDF/이미지)
    ② 자료/ 폴더 파일(제목.md/.txt → 텍스트, 제목.pdf/이미지 또는 자료/제목/ 폴더 → 파일).
    URL이 있는데 읽지 못하면 근거 없는 생산을 막기 위해 즉시 중단한다.
    반환: {"text": str} | {"files": [경로, …]} | None"""
    murl = item.get("material_url", "")
    if murl:
        try:
            if "docs.google.com/document" in murl:
                text = fetch_gdoc(murl)
                log(f"제공 자료(구글독스) 사용: {len(text)}자")
                return {"text": text}
            if "drive.google.com" in murl:
                path = fetch_drive_file(murl, slug)
                log(f"제공 자료(드라이브 파일) 사용: {os.path.basename(path)} "
                    f"({os.path.getsize(path)//1024}KB)")
                return {"files": [path]}
            raise RuntimeError("지원하지 않는 주소입니다 (구글독스 문서 또는 드라이브 파일 링크만 지원)")
        except RuntimeError as e:
            log(f"자료 URL 읽기 실패 — 생산 중단: {e}")
            sys.exit(1)
    title = item["title"]
    for name in (f"{title}.md", f"{title}.txt", f"{slug}.md"):
        path = os.path.join(MATERIAL_DIR, name)
        if os.path.isfile(path):
            text = open(path, encoding="utf-8").read().strip()
            if text:
                log(f"제공 자료 사용: {name} ({len(text)}자)")
                return {"text": text[:MATERIAL_MAX]}
    for ext in MATERIAL_FILE_EXTS:
        path = os.path.join(MATERIAL_DIR, title + ext)
        if os.path.isfile(path):
            log(f"제공 자료 파일 사용: {title}{ext}")
            return {"files": [path]}
    folder = os.path.join(MATERIAL_DIR, title)
    if os.path.isdir(folder):
        files = sorted(os.path.join(folder, n) for n in os.listdir(folder)
                       if n.lower().endswith(MATERIAL_FILE_EXTS))
        if files:
            log(f"제공 자료 폴더 사용: {title}/ ({len(files)}개 파일)")
            return {"files": files}
    return None


def make_prompt(item):
    slug = slugify(item["title"])
    cat = category_of(item["type"])
    if cat == "quiz":
        p = (
            f"quiz-to-read-a-book 스킬을 사용해서 『{item['title']}』({item['author']}) "
            f"독서퀴즈 웹앱을 만들어줘. "
        )
        if item["palette"]:
            p += f"book-palette-12 스킬의 '{item['palette']}' 팔레트를 적용해. "
        if "티저" in item["edition"]:
            p += "프리미엄 버전과 티저 버전 두 개를 모두 만들어(수익화 빌드 모드). "
        p += (
            f"완성 파일은 반드시 {OUT_DIR}/{slug}_quiz.html "
            f"(티저는 {OUT_DIR}/{slug}_teaser.html) 경로에 저장하고, "
            f"스킬의 verify_quiz.py 검증을 반드시 통과시켜. "
            f"마지막에 앱 설명 한 줄을 {OUT_DIR}/{slug}_desc.txt 에 저장해."
        )
    elif cat == "friend":
        concept = f"컨셉: {item['author']}. " if item["author"] else ""
        p = (
            f"mimi-factory-webapp 스킬로 '{item['title']}' 웹앱을 만들어줘. "
            f"둘이 함께(친구·연인·가족) 나란히 보면서 즐기는 '친해지기' 앱이다. {concept}"
            f"완성 파일은 반드시 {OUT_DIR}/{slug}_friend.html 에 저장하고, "
            f"앱 설명 한 줄을 {OUT_DIR}/{slug}_desc.txt 에 저장해."
        )
    else:
        concept = f"컨셉: {item['author']}. " if item["author"] else ""
        p = (
            f"mimi-factory-webapp 스킬(필요시 dopamine-assessment-builder 스킬 병용)로 "
            f"'{item['title']}' 테스트 웹앱을 만들어줘. {concept}"
            f"완성 파일은 반드시 {OUT_DIR}/{slug}_test.html 에 저장하고, "
            f"앱 설명 한 줄을 {OUT_DIR}/{slug}_desc.txt 에 저장해."
        )

    if item.get("extra"):
        p += f" 추가 지시: {item['extra']}"

    # 홍보 초안 (블로그 포스트 + 인스타 캡션) — 채널 운영 반자동화
    site = os.environ.get("SITE_URL", "https://mimifactory.vibekr.com").rstrip("/")
    if cat == "quiz" and "티저" in item["edition"]:
        app_link = f"{site}/apps/{slug}_teaser.html"
    else:
        app_link = f"{site}/apps/{slug}_{cat}.html"
    p += (
        f" 그리고 홍보 초안을 {OUT_DIR}/{slug}_promo.md 에 저장해. 구성: "
        f"① 네이버 블로그 포스트 초안 — 제목 3안, 본문 600자 내외(소개 + 맛보기 문항 3개 + "
        f"앱 링크 {app_link}?utm_source=blog&utm_medium=post + 해시태그 5개), "
        f"② 인스타그램 캡션 — 2줄 훅 + 해시태그 10개, "
        f"③ 페이스북 짧은 글 2안 — 핵심 통찰 하나를 3~5줄의 여운 있는 단문으로, "
        f"광고 문구·링크 금지, 마지막 줄은 독자에게 던지는 질문 "
        f"(댓글에 달 링크는 별도 1줄로: {app_link}?utm_source=fb&utm_medium=comment)."
    )

    mat = load_material(item, slug)
    ground_rule = (
        "문제·해설·리포트는 반드시 이 자료에 명시된 내용만 근거로 만들고, "
        "자료에 없는 세부 내용을 창작하지 마라. "
        "자료가 얇으면 문항 수를 줄이는 대신 자료 내 핵심을 반복 변형해 출제하라."
    )
    if mat and mat.get("text"):
        p += (
            " 아래 [제공 자료]가 이 책(주제)에 대해 확인된 전부다. "
            + ground_rule
            + f"\n\n[제공 자료]\n{mat['text']}"
        )
    elif mat and mat.get("files"):
        flist = "\n".join(mat["files"])
        p += (
            " 아래 [제공 자료 파일]이 이 책(주제)에 대해 확인된 전부다. "
            "작업을 시작하기 전에 이 파일들을 Read 도구로 반드시 전부 읽어라. "
            "PDF는 pages 파라미터로 20쪽씩 나눠 끝까지 읽고, 이미지는 한 장씩 읽어라. "
            + ground_rule
            + f"\n\n[제공 자료 파일]\n{flist}"
        )
    return p, slug


def slugify(title):
    s = re.sub(r"[^\w가-힣]+", "_", title).strip("_").lower()
    return s or "app"


# ── 3. Claude Code 실행 ──────────────────────────────────
def run_claude(prompt):
    os.makedirs(OUT_DIR, exist_ok=True)
    log("Claude Code 실행 시작 (수 분 소요)…")
    cmd = ["claude", "-p", prompt, "--dangerously-skip-permissions",
           "--max-turns", "150"]
    model = os.environ.get("CLAUDE_MODEL", "").strip()
    if model:
        cmd += ["--model", model]
        log(f"생산 모델: {model}")
    try:
        r = subprocess.run(
            cmd, cwd=ROOT, capture_output=True, text=True, timeout=3600,
        )
    except subprocess.TimeoutExpired:
        log("Claude 실행이 1시간을 초과해 중단되었습니다.")
        return False
    log(f"Claude 종료 코드: {r.returncode}")
    if r.returncode != 0:
        log(f"stderr: {r.stderr[-2000:]}")
        log(f"stdout: {r.stdout[-2000:]}")
    return r.returncode == 0


# ── 4. 산출물 수거 + apps.json 갱신 ──────────────────────
PROMO_SNIPPET = '''<script id="promoBanner">
/* 프로모션/VIP/책별 풀버전 오픈 배너 (관리실 admin.html에서 토글) */
(function(){
  function full(){ try{ return localStorage.getItem("mf_vip")==="1"; }catch(e){ return false; } }
  var slug = decodeURIComponent(location.pathname).split("/").pop().replace("_teaser.html","");
  function show(vip){
    if(document.getElementById("promoBar")) return;
    var full_url = location.pathname.replace("_teaser.html","_quiz.html");
    var d=document.createElement("div");
    d.id="promoBar";
    d.style.cssText="position:sticky;top:0;z-index:99;text-align:center;padding:10px 14px;font-size:13.5px;font-weight:700;color:#241505;background:linear-gradient(100deg,#ffd166,#e8b45f);cursor:pointer;";
    d.textContent=(vip?"💌 VIP 초대 — ":"🎁 지금 이 책 풀버전 무료 오픈 중! ")+"전체판(잠금 없음)으로 이동 →";
    d.onclick=function(){ location.href=full_url; };
    document.body.prepend(d);
  }
  if(full()){ show(true); return; }
  try{
    fetch("../promo-api.php?action=get&t="+Date.now()).then(function(r){return r.json();}).then(function(j){
      if(j && (j.open || (j.books && j.books.indexOf(slug)>=0))) show(false);
    }).catch(function(){});
  }catch(e){}
})();
</script>
'''


def inject_promo_banner(path):
    """티저 파일에 프로모션 배너 스니펫 주입 (멱등 — 이미 있으면 스킵)."""
    try:
        t = open(path, encoding="utf-8").read()
        if "promoBanner" in t:
            return
        i = t.rfind("</body>")
        if i < 0:
            return
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(t[:i] + PROMO_SNIPPET + t[i:])
        log("티저에 프로모션 배너 주입 완료")
    except Exception as e:
        log(f"프로모션 배너 주입 실패(무시): {e}")


def collect(item, slug):
    cat = category_of(item["type"])
    main = os.path.join(OUT_DIR, f"{slug}_{cat}.html")
    teaser = os.path.join(OUT_DIR, f"{slug}_teaser.html")
    desc_f = os.path.join(OUT_DIR, f"{slug}_desc.txt")

    if not os.path.exists(main):
        log(f"결과 파일이 없습니다: {main}"); return None

    os.makedirs(APPS_DIR, exist_ok=True)
    final_main = os.path.join(APPS_DIR, os.path.basename(main))
    os.replace(main, final_main)
    final_teaser = None
    if os.path.exists(teaser):
        final_teaser = os.path.join(APPS_DIR, os.path.basename(teaser))
        os.replace(teaser, final_teaser)
        inject_promo_banner(final_teaser)

    desc = ""
    if os.path.exists(desc_f):
        desc = open(desc_f, encoding="utf-8").read().strip()[:80]

    # 홍보 초안 수거 (선택 산출물 — 없어도 실패 아님)
    promo = os.path.join(OUT_DIR, f"{slug}_promo.md")
    if os.path.exists(promo):
        promo_dir = os.path.join(ROOT, "홍보초안")
        os.makedirs(promo_dir, exist_ok=True)
        os.replace(promo, os.path.join(promo_dir, f"{slug}_promo.md"))
        log(f"홍보 초안 저장: 홍보초안/{slug}_promo.md")

    with open(MANIFEST, encoding="utf-8") as f:
        m = json.load(f)
    c1, c2 = PALETTES[len(m["apps"]) % len(PALETTES)]
    entry = {
        "id": slug,
        "type": cat,
        "title": item["title"],
        "author": item["author"] or "미미팩토리 오리지널",
        "date": TODAY,
        "color1": c1, "color2": c2,
        "teaser": f"apps/{os.path.basename(final_teaser)}" if final_teaser
                  else f"apps/{os.path.basename(final_main)}",
        "premium": f"apps/{os.path.basename(final_main)}",
        "desc": desc or f"{item['title']} — 미미팩토리 신작",
    }
    m["apps"] = [a for a in m["apps"] if a["id"] != slug] + [entry]
    m["updated"] = TODAY
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=2)
    log(f"apps.json 갱신 완료: {entry['title']}")
    return entry


# ── 5. 시트 상태/알림 웹훅 (선택) ────────────────────────
def notify(item, status, url=""):
    hook = os.environ.get("WEBHOOK_URL")
    if not hook:
        return
    data = urllib.parse.urlencode({
        "row": item["row"], "gid": item.get("gid", "0"),
        "status": status, "url": url, "date": TODAY,
        "title": item["title"],
    }).encode()
    try:
        urllib.request.urlopen(urllib.request.Request(hook, data=data), timeout=30)
        log(f"웹훅 전송: {status}")
    except Exception as e:
        log(f"웹훅 실패(무시): {e}")


# ── 메인 ─────────────────────────────────────────────────
def main():
    tabs = read_sheet()
    item = pick_waiting(tabs)
    if not item:
        log("오늘 만들 '대기' 항목이 없습니다. 시트에 등록해 주세요. (정상 종료)")
        return
    log(f"오늘의 생산: [{item['type']}] {item['title']} — {item['author']}")

    prompt, slug = make_prompt(item)
    ok = run_claude(prompt)
    entry = collect(item, slug) if ok else None

    if entry:
        site = os.environ.get("SITE_URL", "").rstrip("/")
        notify(item, "완료", f"{site}/{entry['teaser']}" if site else entry["teaser"])
        log("✅ 생산 완료!")
    else:
        # 1회 재시도
        log("⚠️ 실패 — 1회 재시도합니다.")
        if run_claude(prompt):
            entry = collect(item, slug)
        if entry:
            notify(item, "완료", entry["teaser"]); log("✅ 재시도 성공!")
        else:
            notify(item, "실패"); log("❌ 최종 실패 — 시트에 '실패' 기록")
            sys.exit(1)


if __name__ == "__main__":
    main()
