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
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired:
        log(f"  장면 묘사 시간초과: {app.get('id')}")
        return None, None
    if r.returncode != 0:
        log(f"  장면 묘사 실패(코드 {r.returncode}): {r.stderr[-300:]}")
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
def gen_image(prompt, timeout=300):
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
    im.save(out_path, "WEBP", quality=80, method=6)
    return os.path.getsize(out_path)


# ── 3. 본체 ───────────────────────────────────────────────────────────────
def needs_cover(app):
    out = os.path.join(COVERS, app["id"] + ".webp")
    # 미니멀 스타일은 평평해서 1~3KB 로도 정상이다. 문턱을 낮게 잡는다.
    return not (os.path.exists(out) and os.path.getsize(out) > 800)


def main():
    args = sys.argv[1:]
    dry = "--dry-run" in args
    only = None
    if "--only" in args:
        only = [a for a in args[args.index("--only") + 1:] if not a.startswith("--")]

    os.makedirs(COVERS, exist_ok=True)
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
                blob = gen_image(prompt)
                if len(blob) < 10000:
                    raise RuntimeError(f"이미지가 너무 작다 ({len(blob)}B)")
                size = save_webp(blob, out)
                a["cover"] = "covers/" + aid + ".webp"
                a["cover_style"] = style
                log(f"[{i}/{len(todo)}] OK  {aid} {size//1024}KB {time.time()-t0:.0f}초")
                ok += 1
                break
            except Exception as e:
                log(f"[{i}/{len(todo)}] {'재시도' if attempt == 1 else '실패'} {aid}: "
                    f"{type(e).__name__} {str(e)[:150]}")
                if attempt == 2:
                    fail.append(aid)
                else:
                    time.sleep(5)

    if ok and not dry:
        with open(APPS_JSON, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        log(f"apps.json 갱신: cover 항목 {ok}개 추가")

    log(f"===== 완료: 성공 {ok} / 실패 {len(fail)} =====")
    if fail:
        log("실패 목록: " + ", ".join(fail))
    # 표지는 부가 기능이다 — 일부 실패해도 생산 전체를 실패로 만들지 않는다
    return 0


if __name__ == "__main__":
    sys.exit(main())
