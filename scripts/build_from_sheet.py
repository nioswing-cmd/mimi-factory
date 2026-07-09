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

import csv, io, json, os, re, subprocess, sys, urllib.request, urllib.parse
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
              ("완료일", "done"), ("자료", "material"))
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


def load_material(item, slug):
    """자료 우선순위: ① 시트 I열의 구글독스 URL ② 자료/ 폴더 파일.
    URL이 있는데 읽지 못하면 근거 없는 생산을 막기 위해 즉시 중단한다."""
    murl = item.get("material_url", "")
    if murl:
        try:
            text = fetch_gdoc(murl)
        except RuntimeError as e:
            log(f"자료 URL 읽기 실패 — 생산 중단: {e}")
            sys.exit(1)
        log(f"제공 자료(구글독스) 사용: {len(text)}자")
        return text
    title = item["title"]
    for name in (f"{title}.md", f"{title}.txt", f"{slug}.md"):
        path = os.path.join(MATERIAL_DIR, name)
        if os.path.isfile(path):
            text = open(path, encoding="utf-8").read().strip()
            if text:
                log(f"제공 자료 사용: {name} ({len(text)}자)")
                return text[:MATERIAL_MAX]
    return ""


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
        p = (
            f"mimi-factory-webapp 스킬로 '{item['title']}' 웹앱을 만들어줘. "
            f"둘이 함께(친구·연인·가족) 나란히 보면서 즐기는 '친해지기' 앱이다. 컨셉: {item['author']}. "
            f"완성 파일은 반드시 {OUT_DIR}/{slug}_friend.html 에 저장하고, "
            f"앱 설명 한 줄을 {OUT_DIR}/{slug}_desc.txt 에 저장해."
        )
    else:
        p = (
            f"mimi-factory-webapp 스킬(필요시 dopamine-assessment-builder 스킬 병용)로 "
            f"'{item['title']}' 테스트 웹앱을 만들어줘. 컨셉: {item['author']}. "
            f"완성 파일은 반드시 {OUT_DIR}/{slug}_test.html 에 저장하고, "
            f"앱 설명 한 줄을 {OUT_DIR}/{slug}_desc.txt 에 저장해."
        )

    mat = load_material(item, slug)
    if mat:
        p += (
            " 아래 [제공 자료]가 이 책(주제)에 대해 확인된 전부다. "
            "문제·해설·리포트는 반드시 이 자료에 명시된 내용만 근거로 만들고, "
            "자료에 없는 세부 내용을 창작하지 마라. "
            "자료가 얇으면 문항 수를 줄이는 대신 자료 내 핵심을 반복 변형해 출제하라.\n\n"
            f"[제공 자료]\n{mat}"
        )
    return p, slug


def slugify(title):
    s = re.sub(r"[^\w가-힣]+", "_", title).strip("_").lower()
    return s or "app"


# ── 3. Claude Code 실행 ──────────────────────────────────
def run_claude(prompt):
    os.makedirs(OUT_DIR, exist_ok=True)
    log("Claude Code 실행 시작 (수 분 소요)…")
    try:
        r = subprocess.run(
            ["claude", "-p", prompt, "--dangerously-skip-permissions",
             "--max-turns", "150"],
            cwd=ROOT, capture_output=True, text=True, timeout=3600,
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

    desc = ""
    if os.path.exists(desc_f):
        desc = open(desc_f, encoding="utf-8").read().strip()[:80]

    with open(MANIFEST, encoding="utf-8") as f:
        m = json.load(f)
    c1, c2 = PALETTES[len(m["apps"]) % len(PALETTES)]
    entry = {
        "id": slug,
        "type": cat,
        "title": item["title"],
        "author": item["author"],
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
