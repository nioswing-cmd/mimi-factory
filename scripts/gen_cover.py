#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""미미팩토리 표지 자동 생성기 (상시 파이프라인용).

2026-07-31 에 84장을 만든 일회성 스크립트(scratchpad/gen_covers.py + scenes.py)를
리포 정식 도구로 이관한 것. 그때는 책마다 장면 묘사를 손으로 적어둔 SCENES 사전을
썼기 때문에 신작에는 쓸 수 없었다 — 여기서는 장면 묘사를 claude 가 즉석에서 짓는다.

하는 일:
 1. apps.json 에서 표지가 없는 항목을 찾는다
 2. 유형별 스타일을 정한다 (사장님 2026-07-31 확정:
    밤의 서재=책마다 1·2·3번 중 선택 / 도파민 실험실=2번 미니멀 / 둘의 피크닉=콜라주)
 3. claude 로 영어 장면 묘사를 짓는다 (quiz 는 스타일도 claude 가 고른다)
 4. 헤르메스 무료 이미지 프록시로 그린다 (크레딧 0)
 5. 400x600 WebP 로 covers/ 에 저장하고 apps.json 에 cover/cover_style 을 적는다

이미 표지가 있으면 건너뛴다(재실행 안전).

사용:
  python3 scripts/gen_cover.py                # 표지 없는 것만
  python3 scripts/gen_cover.py --only 일리아스 오디세이아
  python3 scripts/gen_cover.py --dry-run      # 장면 묘사만 뽑고 그리지는 않는다

환경변수:
  MMF_IMAGE_API   이미지 프록시 주소 (기본 http://127.0.0.1:8645/v1/chat/completions)
  MMF_IMAGE_MODEL 이미지 모델 (기본 google/gemini-3-pro-image)
  CLAUDE_MODEL    장면 묘사를 지을 모델 (기본 claude-opus-5)
"""
import base64, io, json, os, re, subprocess, sys, time

import re
import shutil
import requests
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS_JSON = os.path.join(ROOT, "apps.json")
COVERS = os.path.join(ROOT, "covers")

# 🔴 2026-08-13 이후 이 주소는 죽어 있다 (404 Not Found).
#    헤르메스 무료 이미지 프록시(Nous 통로)가 막혔다. 그 뒤로 이 스크립트는 신작마다
#    조용히 실패했고, 로그에 「성공 0 / 실패 1」 만 찍혀 3일 동안 아무도 몰랐다.
#    지금은 build_from_sheet.py 의 cover_alert() 가 그 실패를 텔레그램으로 알린다.
#
#    대안: 표지는 힉스필드 MCP(gpt_image_2 · quality=medium · resolution=1k · 2:3)로 만든다.
#          단 MCP 는 클로드 세션에서만 부를 수 있어 서버 크론이 직접 못 쓴다 —
#          알림을 받으면 클로디 세션에서 그려 covers/<id>.webp 로 넣고
#          scripts/inject_cover_bg.py 까지 돌려야 끝난다.
#    되살리는 법: 쓸 수 있는 이미지 API 가 생기면 MMF_IMAGE_API / MMF_IMAGE_MODEL 로 지정한다.
API = os.environ.get("MMF_IMAGE_API", "http://127.0.0.1:8645/v1/chat/completions")
MODEL = os.environ.get("MMF_IMAGE_MODEL", "google/gemini-3-pro-image")
HDRS = {"Authorization": "Bearer local", "Content-Type": "application/json"}

# ── 스타일 (2026-07-31 사장님 승인본 그대로) ─────────────────────────────
S1 = "1-내용화"     # painterly narrative scene
S2 = "2-미니멀"     # single bold symbol, extreme minimalism
S3 = "3-인쇄질감"   # risograph two-color print
SC = "콜라주"       # bright surreal collage (friend)

STYLE_BLOCK = {
    S1: ("Painterly narrative book-cover illustration, oil-painting texture with visible brushwork, "
         "cinematic dramatic lighting, rich atmospheric color, moody and evocative."),
    S2: ("EXTREME MINIMALISM. Exactly one bold simple symbol, flat vector, clean geometric shapes, "
         "no detail, no scenery, no background clutter. Vast flat empty negative space around it. "
         "Poster-like, graphic, uncluttered."),
    S3: ("Risograph print aesthetic: two-color spot-ink printing with visible mis-registration offset, "
         "coarse paper grain, halftone dot texture, slightly faded flat ink, limited retro palette, "
         "screen-printed vintage poster feel."),
    SC: ("Bright playful surreal paper-collage illustration, cut-paper layers with soft drop shadows, "
         "airy pastel palette, cheerful and light, mixed-media scrapbook feel."),
}

COMMON = ("Vertical 2:3 book-cover composition. NO text, no letters, no numbers, no words, "
          "no watermark, no logo, no signature, no lettering of any kind anywhere. "
          "Keep the LOWER HALF calm and uncluttered so a Korean title can be overlaid later.")

# 유형별 스타일 규칙. quiz 만 claude 가 책에 맞춰 고른다.
FIXED_STYLE = {"test": S2, "friend": SC}


# claude 가 "3" 처럼 번호만, 또는 "콜라주" 같은 별칭으로 돌려줄 때가 있다.
# 정식 코드로 맞춰준다 — 안 맞추면 장면 묘사(리소그래프)와 스타일 블록(미니멀)이 어긋난다.
STYLE_ALIAS = {
    "1": S1, "2": S2, "3": S3,
    "내용화": S1, "미니멀": S2, "인쇄질감": S3, "콜라주": SC,
    "S1": S1, "S2": S2, "S3": S3, "SC": SC,
}


def norm_style(v):
    v = (v or "").strip()
    if v in STYLE_BLOCK:
        return v
    if v in STYLE_ALIAS:
        return STYLE_ALIAS[v]
    head = v.split("-", 1)[0].strip()      # "3-리소" -> "3"
    return STYLE_ALIAS.get(head)


def log(msg):
    print(f"[표지] {msg}", flush=True)


def build_prompt(scene, style, c1, c2):
    return (f"{scene}. {STYLE_BLOCK[style]} "
            f"Color palette built around {c1} and {c2}. {COMMON}")


# ── 1. 장면 묘사 짓기 (claude) ────────────────────────────────────────────
SCENE_BRIEF = """너는 책 표지 아트디렉터다. 아래 앱의 표지 그림을 위한 "장면 묘사"를 짓는다.

제목: {title}
지은이: {author}
설명: {desc}
분류: {type_ko}

규칙:
- 장면 묘사는 **영어 한 문장**. 이미지 생성기에 그대로 넣을 것이라 구체적인 사물·배경·빛을 적는다.
- **글자·문자·숫자·기호를 그리라고 하지 마라.** 그림만으로 책을 떠올리게 한다.
- 사람 얼굴을 클로즈업하지 마라. 실루엣이나 멀리 보이는 인물은 괜찮다.
- 스타일 선택({style_rule})
  · 1-내용화: 책의 한 장면을 유화풍으로. 이야기가 뚜렷한 소설·역사서에 어울린다.
  · 2-미니멀: 상징 하나만. 개념서·자기계발서처럼 장면이 없는 책에 어울린다.
    이 스타일로 지을 때는 반드시 "ONE single ..." 로 시작하고 배경을 텅 비운다.
  · 3-인쇄질감: 리소그래프 2색 인쇄 느낌. 문학·고전에 어울린다.

아래 두 줄만 출력한다. 다른 말·설명·코드펜스·따옴표 금지.
STYLE: <스타일코드>
SCENE: <영어 장면 묘사 한 문장>"""

TYPE_KO = {"quiz": "밤의 서재(독서 퀴즈)", "test": "도파민 실험실(심리 테스트)",
           "friend": "둘의 피크닉(친구와 하는 게임)"}


def make_scene(app):
    """claude 로 (style, scene) 을 짓는다. 실패하면 (None, None)."""
    fixed = FIXED_STYLE.get(app.get("type"))
    style_rule = (f'반드시 "{fixed}" 로 한다' if fixed
                  else f'"{S1}" · "{S2}" · "{S3}" 중 이 책에 가장 맞는 것을 고른다')
    prompt = SCENE_BRIEF.format(
        title=app.get("title", ""), author=app.get("author", ""),
        desc=(app.get("desc") or "")[:400],
        type_ko=TYPE_KO.get(app.get("type"), app.get("type", "")),
        style_rule=style_rule)

    cmd = ["claude", "-p", prompt, "--dangerously-skip-permissions", "--max-turns", "3"]
    model = os.environ.get("CLAUDE_MODEL", "claude-opus-5").strip()
    if model:
        cmd += ["--model", model]
    try:
        # 🔴 stdin 을 막아둔다. 안 그러면 claude 가 «파이프로 뭔가 들어오나» 기다리다
        #    "no stdin data received in 3s" 로 헛돌고 종료코드 1 로 죽는다(2026-08-26).
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=600,
                           stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        log(f"  장면 묘사 시간초과: {app.get('id')}")
        return None, None
    if r.returncode != 0:
        # 🔴 2026-10-16: claude 는 한도 초과(«You've hit your weekly limit»)를 stderr 가 아니라
        #    stdout 에 쓴다. stderr 만 찍어서 10/15 「페스트」 표지 실패 원인이 로그에 빈칸이었다.
        why = (r.stderr or "").strip()[-300:] or (r.stdout or "").strip()[-300:]
        log(f"  장면 묘사 실패(코드 {r.returncode}): {why}")
        return None, None

    out = (r.stdout or "").strip()
    # 줄 단위로 판다. 자유 문장이라 JSON 으로 받으면 따옴표·줄바꿈에서 깨진다
    # (2026-08-04 '강대국의 흥망' 에서 실제로 Unterminated string 이 났다).
    m_style = re.search(r"^\s*STYLE\s*:\s*(.+)$", out, re.M | re.I)
    m_scene = re.search(r"^\s*SCENE\s*:\s*(.+(?:\n(?!\s*STYLE\s*:).*)*)$", out, re.M | re.I)
    if not m_scene:
        log(f"  장면 묘사 형식 이상: {out[:200]}")
        return None, None
    d = {"style": (m_style.group(1).strip().strip('"').strip("'") if m_style else None),
         "scene": " ".join(m_scene.group(1).split()).strip().strip('"').strip("'")}

    raw_style = d.get("style")
    style = fixed or norm_style(raw_style)
    if style not in STYLE_BLOCK:
        log(f"  알 수 없는 스타일 '{raw_style}' — 미니멀로 대체")
        style = S2
    scene = (d.get("scene") or "").strip()
    if len(scene) < 20:
        log(f"  장면 묘사가 너무 짧다: '{scene}'")
        return None, None
    return style, scene


# ── 2. 이미지 생성 ────────────────────────────────────────────────────────
# 🔴 2026-08-26: 사장님 PC 가 41시간 꺼져 있는 동안 표지 요청 6건이 전부 시간초과로
#    버려졌다. 그런데 PC 가 켜지자 밀린 그림을 **실제로 만들어 갖다 놨다** —
#    받을 쪽이 이미 포기하고 임시폴더를 지운 뒤라 그림만 버려진 것이다.
#    그래서 ① 임시폴더를 지우지 않고 ② 「누구의 어떤 요청이었는지」를 적어두고
#    ③ `--pickup` 으로 나중에 도착한 그림을 주워 담는다.
PENDING = os.path.join(ROOT, ".tmp", "cover_pending.json")
# 🔴 2026-10-11(오만과 편견): 장부는 «요청을 낸 그 순간» 적는다.
#    예전엔 15분 대기가 시간초과로 끝날 때만 적었다. 그런데 생산 쪽(build_from_sheet)이
#    gen_cover 를 1800초에 강제 종료한다 — 15분×2 회와 같은 길이라, 2차 요청은 대기 중에
#    죽어서 장부에 못 올라갔다. 장부엔 이미 error 난 1차만 남았고, --pickup 은 그걸
#    «아직 안 왔다»로 영원히 기다렸다(그 사이 2차 그림은 PC 에 와 있었다).
# 장부는 생산(gen_cover)과 20분 크론(--pickup)이 같이 고친다 — 잠그고 고친다.
PENDING_LOCK = PENDING + ".lock"
# apps.json 도 생산(gen_cover)과 --pickup 이 같이 고친다 — 잠그고, 쓰기 직전에 다시 읽어
# 그 책의 cover 칸만 얹는다(.tmp 는 gitignore 라 잠금 파일이 저장소에 안 섞인다).
APPS_LOCK = os.path.join(ROOT, ".tmp", "apps_json.lock")
# --pickup 이 error·만료 요청을 PC 요청함에 «다시» 내는 횟수 상한(대상 하나당).
#   그림은 PC 요청함(힉스필드)으로만 만든다 — 여기서 다른 유료 통로를 부르지 않는다.
PICKUP_RETRIES = int(os.environ.get("MMF_COVER_PICKUP_RETRIES", "2"))
MIN_IMAGE_BYTES = 10000            # 이보다 작은 원본 그림은 빈·깨진 그림으로 본다


class _FileLock:
    def __init__(self, path):
        self.path = path

    def __enter__(self):
        import fcntl
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        self.fh = open(self.path, "a+")
        fcntl.flock(self.fh, fcntl.LOCK_EX)
        return self

    def __exit__(self, *a):
        import fcntl
        fcntl.flock(self.fh, fcntl.LOCK_UN)
        self.fh.close()


def _PendingLock():
    return _FileLock(PENDING_LOCK)


def _pending_put(key, info):
    with _PendingLock():
        d = _pending_load()
        d[key] = info
        _pending_save(d)


def _pending_drop(key, rid=None):
    """장부에서 뺀다. rid 를 주면 그 요청일 때만 뺀다(다른 쪽이 새 요청으로 바꿔 놨으면 둔다).
    반환: 실제로 뺐는가."""
    with _PendingLock():
        d = _pending_load()
        if key in d and (rid is None or d[key].get("rid") == rid):
            del d[key]
            _pending_save(d)
            return True
    return False


def _owner_alive(info):
    """이 장부 줄을 적은 gen_cover 가 아직 살아서 기다리는 중인가(생산 중)."""
    pid = info.get("pid")
    if not pid or pid == os.getpid():
        return False
    try:
        with open(f"/proc/{int(pid)}/cmdline", "rb") as fh:
            return b"gen_cover" in fh.read()
    except (OSError, ValueError, TypeError):
        return False


def _entry_ok(v):
    """장부 한 줄의 꼴이 맞나 (pid·rid·retries·bad_rids 의 자료형)."""
    if not isinstance(v, dict):
        return False
    pid = v.get("pid")
    if pid is not None and not (type(pid) is int and pid > 0):
        return False
    if not isinstance(v.get("rid", ""), str):
        return False
    if v.get("retries") is not None and type(v.get("retries")) is not int:
        return False
    bad = v.get("bad_rids", [])
    return isinstance(bad, list) and all(isinstance(r, str) for r in bad)


def _pending_load():
    """장부 읽기. 파일 없음만 «빈 장부». 깨진 장부(JSON 오류·구조 이상)는 원본을 .broken-* 로
    보관하고 멀쩡한 줄만 남겨 다시 쓴다. 읽기 권한 오류 등은 예외를 낸다(모르는 채 덮어쓰지 않게).
    🔴 잠금(_PendingLock) 안에서만 부른다 — 깨진 장부를 치우는 일이 다른 쪽 저장과 엇갈리지 않게."""
    try:
        with open(PENDING, encoding="utf-8") as fh:
            d = json.load(fh)
    except FileNotFoundError:
        return {}
    except ValueError as e:
        d, why = None, str(e)
    else:
        why = "구조가 이상함"
    good = ({k: v for k, v in d.items() if _entry_ok(v)} if isinstance(d, dict) else {})
    if isinstance(d, dict) and len(good) == len(d):
        return d
    keep = f"{PENDING}.broken-{time.strftime('%Y%m%d-%H%M%S')}"
    shutil.copy2(PENDING, keep)
    _pending_save(good)
    log(f"🔴 표지 장부가 깨져 있다({why[:80]}) — 원본은 {keep} 에 보관, 멀쩡한 줄 {len(good)}개로 다시 쓴다")
    return good


def _pending_save(d):
    os.makedirs(os.path.dirname(PENDING), exist_ok=True)
    tmp = PENDING + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(d, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, PENDING)


def _older_than_days(stamp, days):
    """장부에 적어둔 시각이 며칠 넘었나. 시각을 못 읽으면 «오래됐다»로 본다."""
    try:
        t = time.mktime(time.strptime(stamp, "%Y-%m-%d %H:%M:%S"))
    except (ValueError, TypeError):
        return True
    return (time.time() - t) > days * 86400


def _imgq():
    import sys as _sys
    if "/opt/shared" not in _sys.path:
        _sys.path.insert(0, "/opt/shared")
    import imgq
    return imgq


def _gen_image_via_pc(prompt, aid=None, style=None):
    """서버는 «그림 주세요» 쪽지만 남기고 사장님 PC 가 힉스필드로 만들어 갖다 놓는다.
    (2026-08-23~ · 옛 무료 통로 8645 는 2026-08-13 에 막혔다)"""
    imgq = _imgq()
    dest = os.path.join(ROOT, ".tmp", "covers", aid or "unknown")
    os.makedirs(dest, exist_ok=True)
    rid = imgq.submit(who="mimifactory", prompt=prompt, raw=True, n=1,
                      dest_dir=dest, aspect="2:3")
    key = aid or rid
    # 🔴 요청을 내자마자 장부에 적는다(1차·2차 모두). 대기 중에 강제 종료돼도
    #    «마지막 요청»이 장부에 남아 --pickup 이 주워 담는다. pid 는 «지금 기다리는 중»
    #    표시 — 살아 있는 동안은 --pickup 이 이 줄을 건드리지 않는다.
    #    prompt 는 --pickup 이 error 난 요청을 다시 낼 때 쓴다.
    _pending_put(key, {"rid": rid, "dest": dest, "style": style, "prompt": prompt,
                       "pid": os.getpid(), "retries": 0,
                       "since": time.strftime("%Y-%m-%d %H:%M:%S")})
    log(f"  PC 에 표지 요청 {rid} (최대 15분) — 장부에 적었다")
    try:
        files = imgq.wait(rid, timeout_s=int(os.environ.get("IMGQ_WAIT_SECONDS", "900")))
    except TimeoutError:
        # 🔴 여기서 포기하되 **요청은 살려둔다.** imgq.wait 은 시간초과를 error 로
        #    표시해 버리는데, 그러면 PC 가 켜져도 그 요청을 다시 안 본다.
        #    장부 줄은 요청 때 이미 적었다.
        imgq.update(rid, status="pending", error="")
        log(f"  PC 가 아직 안 만들었다 — 요청 {rid} 은 살려뒀다. "
            f"나중에 `gen_cover.py --pickup` 이 주워 담는다")
        raise
    # (PC 가 error 를 낸 경우 imgq.wait 이 RuntimeError 를 낸다 — 장부 줄은 남겨 둔다.
    #  다음 시도가 새 요청으로 덮어쓰거나, 끝내 실패하면 --pickup 이 재탐색·재요청한다)
    # 🔴 원본 폴더와 장부 줄은 여기서 지우지 않는다 — 부르는 쪽(main)이 표지 저장과
    #    apps.json 기록까지 끝낸 «뒤에» 지운다. 그 사이 죽어도 --pickup 이 다시 챙긴다.
    with open(files[0], "rb") as fh:
        return fh.read()


def _mark_apply(aid, style):
    """표지 저장·apps.json 기록이 끝났다 → 장부 줄을 «반영 대기(stage=apply)» 로 바꾼다.
    첫 화면 배경까지 확인되면 finish_cover() 가(생산 쪽), 아니면 --pickup 2단계가 정리한다.
    (그 사이 죽거나 배경 주입이 실패해도 --pickup 이 배경을 다시 깔고 정리한다)"""
    with _PendingLock():
        d = _pending_load()
        info = d.get(aid) or {"rid": "", "dest": os.path.join(ROOT, ".tmp", "covers", aid),
                              "since": time.strftime("%Y-%m-%d %H:%M:%S")}
        info.update(stage="apply", style=style, pid=None)
        d[aid] = info
        _pending_save(d)


def finish_cover(aid):
    """배경까지 끝난 «반영 대기» 줄과 원본 폴더를 정리한다(반영 대기가 아니면 손대지 않는다)."""
    with _PendingLock():
        d = _pending_load()
        info = d.get(aid)
        if not info or info.get("stage") != "apply" or not _has_valid_cover(aid):
            return                     # 표지가 깨졌으면 --pickup 2단계가 다시 챙기게 둔다
        del d[aid]
        _pending_save(d)
    _cleanup_dest(info)


def _has_valid_cover(aid):
    """covers/<id>.webp 가 실제로 풀리는 그림인가(복구·배경 경로의 판정 — 크기만 보지 않는다)."""
    return _valid_image(os.path.join(COVERS, aid + ".webp"))


def _cleanup_dest(info):
    """장부 줄의 원본 그림만 지운다(<요청번호>_N.png). 🔴 책 폴더째 지우지 않는다 — 같은 책의
    새 요청(재생산·재요청)이 같은 폴더를 쓰므로, 폴더째 지우면 막 도착한 새 원본까지 날아간다."""
    # 정리는 부가 일이다 — 어떤 이유로든 실패해도 장부 처리를 멈추지 않는다(기록만 한다)
    try:
        dest = info.get("dest") or ""
        rids = {r for r in [info.get("rid")] + list(info.get("bad_rids") or [])
                if isinstance(r, str) and r}
        if not rids or not os.path.isdir(dest):
            return
        for name in os.listdir(dest):
            if any(name.startswith(r + "_") for r in rids):
                os.remove(os.path.join(dest, name))
    except Exception as e:                                       # noqa: BLE001
        log(f"  원본 정리 실패(무시) — {type(e).__name__} {str(e)[:120]}")


def _valid_image(path):
    """PC 가 갖다 놓은 원본이 진짜 그림인가 (빈 파일·깨진 파일 거르기).
    verify() 는 머리만 본다 — 잘린 JPEG 도 통과하므로 실제로 끝까지 풀어 본다.
    (파일 크기로는 거르지 않는다 — 단순한 그림은 작아도 정상이다)"""
    try:
        with Image.open(path) as im:
            im.verify()
        with Image.open(path) as im:
            im.load()
            im.convert("RGB")
        return True
    except Exception:                                            # noqa: BLE001
        return False


def gen_image(prompt, timeout=300, aid=None, style=None):
    # ① 먼저 PC 요청함. 안 되면 예전 통로로 내려간다(그쪽은 지금 401 로 죽어 있다).
    if os.environ.get("MMF_IMAGE_BACKEND", "pc").lower() in ("pc", "auto", "queue"):
        try:
            return _gen_image_via_pc(prompt, aid=aid, style=style)
        except Exception as e:                                   # noqa: BLE001
            log(f"  PC 요청함 실패 → 옛 통로로: {str(e)[:160]}")
    body = {"model": MODEL, "messages": [{"role": "user", "content": prompt}]}
    r = requests.post(API, headers=HDRS, json=body, timeout=timeout)
    r.raise_for_status()
    msg = r.json()["choices"][0]["message"]
    imgs = msg.get("images") or []
    if not imgs:
        raise RuntimeError("응답에 이미지가 없다: " + json.dumps(msg)[:200])
    url = imgs[0]["image_url"]["url"]
    if url.startswith("data:"):
        return base64.b64decode(url.split(",", 1)[1])
    rr = requests.get(url, timeout=120)
    rr.raise_for_status()
    return rr.content


def save_webp(raw_bytes, out_path):
    im = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    # 2:3 세로로 센터 크롭 + 리사이즈. 위쪽 주제를 살리려고 살짝 위 기준(0.45).
    im = ImageOps.fit(im, (400, 600), Image.LANCZOS, centering=(0.5, 0.45))
    tmp = f"{out_path}.{os.getpid()}.tmp"      # 반쯤 쓰인 표지가 남지 않게 다 쓴 뒤 바꿔 끼운다
    try:
        im.save(tmp, "WEBP", quality=80, method=6)
        os.replace(tmp, out_path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return os.path.getsize(out_path)


# ── 3. 본체 ───────────────────────────────────────────────────────────────
def needs_cover(app):
    out = os.path.join(COVERS, app["id"] + ".webp")
    # 미니멀 스타일은 평평해서 1~3KB 로도 정상이다. 문턱을 낮게 잡는다.
    return not (os.path.exists(out) and os.path.getsize(out) > 800)


def _write_apps(data, note=""):
    """🔴 성공할 때마다 즉시 적는다. 예전에는 13편을 다 돌린 **뒤에야** 한 번 적었는데,
    중간에 죽으면 만들어 놓은 표지까지 통째로 잃었다(2026-08-26 실제로 그랬다).
    직접 부르지 말고 _set_covers() 를 쓴다(잠금 + 다시 읽기)."""
    tmp = f"{APPS_JSON}.{os.getpid()}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, APPS_JSON)
    if note:
        log(note)


def _set_covers(changes, only_missing=False, note=""):
    """apps.json 에 표지 칸만 얹는다. changes = {aid: style 또는 None}. 반환: apps.json 에 없는 aid 목록.
    🔴 잠근 채로 **지금 것을 다시 읽어** 고친다 — 오래전에 읽은 사본을 통째로 덮어쓰면
       그 사이 다른 쪽이 적은 신작·표지가 조용히 사라진다(긴 그림 대기 동안 실제로 겹친다).
    only_missing=True 면 cover 칸이 비어 있을 때만 채운다."""
    with _FileLock(APPS_LOCK):
        with open(APPS_JSON, encoding="utf-8") as f:
            fresh = json.load(f)
        by_id = {a["id"]: a for a in fresh["apps"]}
        absent, changed = [], False
        for aid, style in changes.items():
            a = by_id.get(aid)
            if a is None:
                absent.append(aid)
                continue
            if only_missing and a.get("cover"):
                continue
            a["cover"] = "covers/" + aid + ".webp"
            if style:
                a["cover_style"] = style
            changed = True
        if changed:
            _write_apps(fresh, note)
    return absent


def _find_alt(imgq, info, exclude):
    """장부 요청이 error·만료일 때 PC 요청함에서 «같은 대상»(같은 dest_dir)의 다른 요청을 찾는다.
    완성(done, 진짜 그림 파일 있음)된 것이 있으면 그중 가장 새것, 없으면 아직 대기(pending) 중인 가장 새것.
    exclude = 제외할 요청 번호들(지금 장부 요청·깨진 그림으로 판정된 요청).
    (받아 간 그림은 dest 폴더째 지우므로, 파일이 남아 있는 done 은 «아직 안 받아 간» 그림이다)"""
    dest = info.get("dest")
    if not dest:
        return None
    # imgq 에 «전체 목록» 공개 함수가 없어 _read 를 쓴다(읽기만 한다).
    rows = [r for r in imgq._read()
            if r.get("who") == "mimifactory" and r.get("dest_dir") == dest
            and r.get("id") not in exclude]
    newest = lambda rs: max(rs, key=lambda r: r.get("created") or "")  # noqa: E731
    done = [r for r in rows if r.get("status") == "done" and _first_valid(r)]
    if done:
        return newest(done)
    pend = [r for r in rows if r.get("status") == "pending"]
    return newest(pend) if pend else None


def _first_valid(row):
    """요청함 줄의 파일 중 진짜 그림인 첫 파일. 없으면 None."""
    for f in (row.get("files") or []):
        if os.path.exists(f) and _valid_image(f):
            return f
    return None


def _pickup_decide(imgq, aid, info):
    """장부 줄 하나를 판정한다. 반환 (할 일, 새 장부 줄).
    할 일: keep(장부에 둔다 — 새 요청으로 바뀌었을 수 있다) · drop(뺀다) · pick(info['src'] 를 챙긴다)

    🔴 2026-10-11: 장부 요청이 error(PC 실패)·만료(요청함에서 사라짐)·깨진 그림이면 더는
       «아직 안 왔다»로 기다리지 않는다 →
         ① PC 요청함에서 같은 대상의 다른 요청을 찾는다 (done 이면 그걸 챙기고,
            pending 이면 장부를 그 요청으로 바꿔 기다린다)
         ② 없으면 PC 요청함에 다시 낸다 — 대상 하나당 PICKUP_RETRIES 회까지.
            넘으면 장부에서 빼고 크게 적는다(checkall «표지 없는 신작»이 잡는다).
       그림은 PC 요청함으로만 낸다. 여기서 다른(유료) 이미지 통로는 부르지 않는다."""
    rid = info.get("rid", "")
    bad = set(info.get("bad_rids") or [])
    r = imgq.get(rid)
    st = r.get("status")
    if st == "pending":
        # 마지막 요청은 아직이지만 같은 대상의 앞선 요청이 먼저 완성됐으면 그걸 챙긴다
        # (생산이 1차를 살려 둔 채 2차를 내고 죽은 경우 — PC 가 1차만 만들고 꺼질 수 있다)
        alt = _find_alt(imgq, info, exclude=bad | {rid})
        if alt and alt.get("status") == "done":
            log(f"  {aid}: 장부 요청 {rid} 은 아직이지만 같은 대상의 완성된 요청 {alt['id']} 을 챙긴다")
            return "pick", dict(info, rid=alt["id"], src=_first_valid(alt))
        log(f"  {aid}: 아직 안 왔다 (상태 pending)")
        return "keep", info
    if st == "done" and rid not in bad:
        src = _first_valid(r)
        if src:
            return "pick", dict(info, src=src)
        if any(os.path.exists(f) for f in (r.get("files") or [])):
            # 빈·깨진 그림 — 이 요청은 다시 보지 않는다(같은 파일만 영원히 다시 읽지 않게)
            bad.add(rid)
            info = dict(info, bad_rids=sorted(bad))
            why = "완성됐지만 그림이 비었거나 깨짐"
        else:
            why = "완성됐지만 파일이 없음"
    else:
        why = f"상태 {st}" if r else "요청이 사라짐"

    alt = _find_alt(imgq, info, exclude=bad | {rid})
    if alt and alt.get("status") == "done":
        log(f"  {aid}: 장부 요청 {rid} 은 {why} — 같은 대상의 완성된 요청 {alt['id']} 을 대신 챙긴다")
        return "pick", dict(info, rid=alt["id"], src=_first_valid(alt))
    if alt:
        log(f"  {aid}: 장부 요청 {rid} 은 {why} — 같은 대상의 대기 중 요청 {alt['id']} 으로 바꿔 기다린다")
        return "keep", dict(info, rid=alt["id"])
    if _has_valid_cover(aid):
        # 표지 파일은 있다 — 다만 저장 직후 죽었으면 apps.json·배경 반영이 빠졌을 수 있으니
        # 바로 빼지 않고 «반영 대기»로 돌려 2단계가 확인·정리하게 한다.
        log(f"  {aid}: 장부 요청 {rid} 은 {why}, 표지 파일은 이미 있다 — 반영만 확인한다")
        return "keep", dict(info, stage="apply", pid=None)
    prompt = info.get("prompt") or r.get("prompt") or ""
    tries = int(info.get("retries") or 0)
    if not prompt:
        # 옛 장부 줄(prompt 없음) + 요청도 사라짐 → 다시 낼 재료가 없다.
        # 요청함은 끝난 요청을 3일만 보관한다(imgq.KEEP_DAYS) — 오래되면 뺀다.
        if not r and _older_than_days(info.get("since"), 4):
            log(f"  {aid}: 요청이 사라졌고 오래돼서 장부에서 뺀다 ({info.get('since')})")
            return "drop", info
        log(f"  {aid}: 장부 요청 {rid} 은 {why} — 다시 낼 그림 지시가 없어 기다리기만 한다")
        return "keep", info
    if tries >= PICKUP_RETRIES:
        log(f"  🔴 {aid}: 장부 요청 {rid} 은 {why} — 재요청 {tries}회 다 썼다. "
            f"장부에서 빼고 포기한다(표지 없는 신작으로 checkall 에 잡힌다)")
        return "drop", info
    dest = info.get("dest") or os.path.join(ROOT, ".tmp", "covers", aid)
    os.makedirs(dest, exist_ok=True)
    nrid = imgq.submit(who="mimifactory", prompt=prompt, raw=True, n=1,
                       dest_dir=dest, aspect="2:3")
    log(f"  {aid}: 장부 요청 {rid} 은 {why} — PC 요청함에 다시 냈다 {nrid} "
        f"({tries + 1}/{PICKUP_RETRIES})")
    return "keep", dict(info, rid=nrid, dest=dest, prompt=prompt, retries=tries + 1, pid=None,
                        since=time.strftime("%Y-%m-%d %H:%M:%S"))


def _app_targets(aid):
    with open(APPS_JSON, encoding="utf-8") as f:
        for a in json.load(f)["apps"]:
            if a.get("id") == aid:
                return [a[k] for k in ("teaser", "premium") if a.get(k)]
    return []


def pickup():
    """PC 가 늦게 갖다 놓은 표지를 주워 담는다. 반환: 새로 챙긴 개수.

    1단계(장부 잠금 안): 장부 줄마다 판정(_pickup_decide) — 챙길 그림은 covers/ 에 저장하고
       그 줄을 «반영 대기(stage=apply)» 로 바꾼다. 🔴 줄 하나 처리할 때마다 장부를 바로 적는다
       (재요청 번호·횟수를 쥔 채 뒤 줄에서 죽어도 잃지 않게).
    2단계(잠금 밖): 반영 대기 줄마다 apps.json 의 cover 칸 + 첫 화면 표지 배경까지 끝낸 «뒤에»
       장부에서 뺀다. 실패하면 줄이 남아 다음 차례에 다시 한다.

    🔴 apps.json 은 _set_covers 가 잠근 채 **다시 읽어** 그 책 칸만 얹는다. 20분마다 도는
       크론이라 생산과 겹칠 수 있는데, 오래전에 읽어둔 사본을 통째로 덮어쓰면 그 사이 나온
       신작이 조용히 사라진다."""
    got = 0
    with _PendingLock():               # 생산 쪽 gen_cover 가 동시에 장부를 고치지 못하게
        work = _pending_load()
        if not work:
            # 🔴 20분마다 도는 크론이다 — 할 일이 없을 땐 **아무것도 적지 않는다.**
            #    안 그러면 생산 로그가 «주워 담을 것 없음» 으로 뒤덮여
            #    진짜 오류를 찾는 점검기가 눈이 먼다.
            return 0
        imgq = _imgq()
        for aid in list(work):
            info = work[aid]
            try:
                if info.get("stage") == "apply" or _owner_alive(info):
                    # 반영 대기는 2단계에서, 생산 중인 gen_cover 가 직접 기다리는 줄은 손대지 않는다
                    continue
                act, new = _pickup_decide(imgq, aid, info)
                if act == "pick":
                    with open(new["src"], "rb") as fh:
                        blob = fh.read()
                    size = save_webp(blob, os.path.join(COVERS, aid + ".webp"))
                    new = {k: v for k, v in new.items() if k != "src"}
                    new["stage"] = "apply"
                    got += 1
                    log(f"  ✅ {aid}: 늦게 도착한 표지를 챙겼다 ({size//1024}KB)")
            except Exception as e:                               # noqa: BLE001
                log(f"  {aid}: 처리 실패(다음 차례에 다시) — {type(e).__name__} {str(e)[:120]}")
                continue
            if act == "drop":
                work.pop(aid, None)
                _cleanup_dest(info)
            else:
                work[aid] = new
            _pending_save(work)
        apply = {aid: dict(i) for aid, i in work.items() if i.get("stage") == "apply"}

    # 2단계 — 🔴 늦게 온 표지는 첫 화면 배경에도 깐다. 예전엔 표지 파일만 챙기고 배경 주입을
    #    안 해서, 페이지엔 표지가 없거나(21세기 자본) 남의 표지가 그대로 남았다(오만과 편견).
    for aid, info in apply.items():
        try:
            if not _has_valid_cover(aid):
                # 표지 파일이 사라졌거나 깨졌다 — 반영 대기를 풀어 다음 차례에 처음부터 다시 챙긴다
                with _PendingLock():
                    d = _pending_load()
                    if d.get(aid, {}).get("rid") == info.get("rid"):
                        d[aid].pop("stage", None)
                        _pending_save(d)
                log(f"  {aid}: 반영 대기인데 표지 파일이 없다 — 다음 차례에 다시 챙긴다")
                continue
            absent = _set_covers({aid: info.get("style")}, note=f"apps.json 갱신: 늦게 온 표지 {aid}")
            if absent:
                log(f"  {aid}: apps.json 에 없다 — 표지 파일만 두고 장부에서 뺀다")
                _pending_drop(aid, info.get("rid"))
                continue
            bad = fix_cover_bg(aid, _app_targets(aid))
            if bad:
                log(f"  🔴 {aid}: 첫 화면 표지 배경을 못 바로잡았다(다음 차례에 다시) — {bad}")
                continue
            if _pending_drop(aid, info.get("rid")):
                _cleanup_dest(info)
            log(f"  ✅ {aid}: apps.json·첫 화면 배경까지 반영 끝")
        except Exception as e:                                   # noqa: BLE001
            log(f"  {aid}: 반영 실패(다음 차례에 다시) — {type(e).__name__} {str(e)[:120]}")
    return got


# ── 4. 첫 화면 표지 배경 점검·교정 ────────────────────────────────────────
# 🔴 2026-10-11: 생산 때 앞 책 HTML 을 틀로 베끼면서 «남의 표지» 배경 블록이 통째로 따라온
#    책이 4권 있었다(돈키호테 표지를 깐 오만과 편견 등). inject_cover_bg.py 는 블록이
#    이미 있으면 건너뛰므로(재실행 안전) 남의 블록이 영영 안 바뀐다.
#    판정 = 블록 안 표지 주소가 «그 책 자기 표지(apps/ 에서 ../covers/<id>.webp)» 인가.
# 세기(사장님 2026-08-01 승인값)는 build_from_sheet.COVER_BG_ENV 와 같은 값 — 한쪽만 바꾸지 말 것.
COVER_BG_ENV = {"MMF_GK": "0.40", "MMF_SK": "0.70", "MMF_IMGOP": "0.70", "MMF_SM": "1.5"}
_BG_START = "<!-- mmf-cover-bg:start -->"
_BG_END = "<!-- mmf-cover-bg:end -->"
_BG_BLOCK_RE = re.compile(re.escape(_BG_START) + r".*?" + re.escape(_BG_END) + r"\s*", re.S)
_BG_URL_RE = re.compile(r'--mmf-cover:url\("([^"]+)"\)')


def cover_bg_state(html_rel, aid):
    """반환 (상태, 블록 안 표지 주소들). 상태: ok · foreign(남의 표지·틀린 주소) · missing · nofile
    ok = 모든 블록의 주소가 «그 HTML 에서 본 covers/<id>.webp 상대경로»(예: ../covers/<id>.webp)."""
    from urllib.parse import unquote, urlsplit
    full = os.path.join(ROOT, html_rel)
    try:
        with open(full, encoding="utf-8") as fh:
            s = fh.read()
    except OSError:
        return "nofile", set()
    want = os.path.relpath(os.path.join(COVERS, aid + ".webp"),
                           os.path.dirname(full)).replace(os.sep, "/")
    blocks = _BG_BLOCK_RE.findall(s)
    if s.count(_BG_START) != len(blocks) or s.count(_BG_END) != len(blocks):
        # 시작·끝 표시 짝이 안 맞는 블록 — 경계를 확정할 수 없어 자동으로 고치지 않는다(문제로 보고)
        return "broken", set()
    urls = set()
    for blk in blocks:
        for u in _BG_URL_RE.findall(blk):
            p = urlsplit(u)
            # 다른 호스트·절대 주소는 남의 것으로 본다(주소 전체를 그대로 남겨 비교에서 떨어지게)
            urls.add(u if (p.scheme or p.netloc) else unquote(p.path))
        if not _BG_URL_RE.search(blk):
            urls.add("?")                # 블록은 있는데 주소를 못 읽음 → 남의 것으로 본다
    if not urls:
        return "missing", urls
    return ("ok" if urls == {want} else "foreign"), urls


def _strip_bg(html_rel):
    full = os.path.join(ROOT, html_rel)
    with open(full, encoding="utf-8", newline="") as fh:
        s = fh.read()
    s2 = _BG_BLOCK_RE.sub("", s)
    if s2 != s:
        tmp = full + ".mmftmp"
        with open(tmp, "w", encoding="utf-8", newline="") as fh:
            fh.write(s2)
        os.replace(tmp, full)


def fix_cover_bg(aid, targets, env=None):
    """첫 화면 표지 배경이 그 책 자기 표지가 되게 한다. 반환: 고친 뒤에도 문제인 [(파일, 상태)].
      · 표지가 있으면: apps.json cover 칸을 covers/<id>.webp 로 바로잡고,
        남의 블록 → inject_cover_bg.py --force, 블록 없음 → 보통 주입
      · 표지가 없으면: 남의 블록만 걷어낸다(남의 표지를 까느니 없는 게 낫다 —
        표지가 늦게 오면 --pickup 이 그때 깐다). 블록 없음은 문제로 치지 않는다.
    🔴 책별 잠금 안에서 «상태 읽기 → 고치기 → 최종 확인»을 한 번에 한다. 생산(make_cover)과
       20분 크론(--pickup)이 같은 책을 동시에 만지면, 한쪽이 «표지 없음»으로 읽고 걷어내는 사이
       다른 쪽이 깐 자기 표지 배경까지 지울 수 있다."""
    targets = [t for t in targets if t]
    with _FileLock(os.path.join(ROOT, ".tmp", "cover_bg", aid + ".lock")):
        have = _has_valid_cover(aid)
        if have:
            # inject_cover_bg.py 는 apps.json 의 cover 칸으로 표지를 고른다 — 비어 있으면
            # «NO COVER» 로 건너뛰고, 남의 표지를 가리키면 --force 로도 남의 표지를 다시 깐다.
            # 자기 표지 파일이 있으니 칸을 먼저 바로잡는다(cover_style 은 그대로).
            if _set_covers({aid: None}):
                return [(aid, "apps.json 에 없음")]
        if not targets:
            return []
        states = {t: cover_bg_state(t, aid) for t in targets}
        foreign = [t for t, (st, _) in states.items() if st == "foreign"]
        for t in foreign:
            log(f"  {t}: 남의 표지 배경 블록 발견 {sorted(states[t][1])} → "
                + ("이 책 표지로 교체" if have else "걷어냄(표지 아직 없음)"))
        run_env = dict(os.environ, **(env or COVER_BG_ENV))

        def _inject(extra, files):
            r = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "inject_cover_bg.py")]
                               + extra + ["--only"] + files,
                               cwd=ROOT, capture_output=True, text=True, timeout=600, env=run_env)
            sys.stdout.write(r.stdout or "")
            if r.returncode != 0:
                log(f"  배경 주입 실패(코드 {r.returncode}): {(r.stderr or '')[-300:]}")

        if have:
            if foreign:
                _inject(["--force"], foreign)
            missing = [t for t, (st, _) in states.items() if st == "missing"]
            if missing:
                _inject([], missing)
        else:
            for t in foreign:
                _strip_bg(t)
        bad = []
        for t in targets:
            st = cover_bg_state(t, aid)[0]
            if st in ("foreign", "broken") or (have and st != "ok"):
                bad.append((t, st))
        return bad


def main():
    args = sys.argv[1:]
    dry = "--dry-run" in args
    only = None
    if "--only" in args:
        only = [a for a in args[args.index("--only") + 1:] if not a.startswith("--")]

    os.makedirs(COVERS, exist_ok=True)
    if "--pickup" in args:
        pickup()                       # apps.json 은 pickup 이 직접 다시 읽는다
        return 0                       # 주워 담을 게 없어도 실패가 아니다

    with open(APPS_JSON, encoding="utf-8") as f:
        data = json.load(f)
    apps = data["apps"]

    todo = [a for a in apps
            if (a["id"] in only if only else needs_cover(a))]
    if not todo:
        log("표지가 없는 항목이 없습니다. (정상 종료)")
        return 0

    log(f"===== 시작: 전체 {len(apps)}개 중 대상 {len(todo)}개 =====")
    ok, fail = 0, []
    for i, a in enumerate(todo, 1):
        aid = a["id"]
        t0 = time.time()
        style, scene = make_scene(a)
        if not scene:                      # 한 번은 다시 물어본다
            log(f"  {aid}: 장면 묘사 재시도")
            style, scene = make_scene(a)
        if not scene:
            log(f"[{i}/{len(todo)}] 실패 {aid}: 장면 묘사를 못 지었다")
            fail.append(aid)
            continue
        log(f"[{i}/{len(todo)}] {aid} ({style}) — {scene[:90]}")
        if dry:
            continue

        prompt = build_prompt(scene, style, a.get("color1", "#888"), a.get("color2", "#444"))
        out = os.path.join(COVERS, aid + ".webp")
        for attempt in (1, 2):
            try:
                blob = gen_image(prompt, aid=aid, style=style)
                if len(blob) < MIN_IMAGE_BYTES:
                    raise RuntimeError(f"이미지가 너무 작다 ({len(blob)}B)")
                size = save_webp(blob, out)
                ok += 1
                _set_covers({aid: style})  # 한 장 될 때마다 바로 적는다(잠금 + 다시 읽기)
                _mark_apply(aid, style)    # 배경까지 확인된 «뒤에» 장부 줄·원본을 정리한다
                log(f"[{i}/{len(todo)}] OK  {aid} {size//1024}KB {time.time()-t0:.0f}초")
                break
            except Exception as e:
                log(f"[{i}/{len(todo)}] {'재시도' if attempt == 1 else '실패'} {aid}: "
                    f"{type(e).__name__} {str(e)[:150]}")
                if attempt == 2:
                    fail.append(aid)
                else:
                    time.sleep(5)

    if ok and not dry:
        log(f"apps.json 갱신: cover 항목 {ok}개 추가")

    log(f"===== 완료: 성공 {ok} / 실패 {len(fail)} =====")
    if fail:
        log("실패 목록: " + ", ".join(fail))
    # 표지는 부가 기능이다 — 일부 실패해도 생산 전체를 실패로 만들지 않는다
    return 0


if __name__ == "__main__":
    sys.exit(main())
