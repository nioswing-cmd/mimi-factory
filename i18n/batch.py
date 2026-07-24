#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""미미팩토리 i18n — 전체 로컬라이즈 배치 오케스트레이터.

큐: 랜딩(index/quiz/friend) → 테스트관·피크닉 앱 전체 → 밤의 서재 티저 전체.
(밤의 서재 풀버전은 저작권 규칙상 제외 — 퍼블릭 도메인 화이트리스트는 추후)

항목마다: extract → claude 단발 번역(언어별 JSON을 stdout으로 받아 파이썬이 저장)
→ build×3 → verify×3 (실패 시 단발 수정 재시도 최대 2회) → 폰트 서브셋 → manifest → commit.
push는 3개 항목마다. 로그: i18n_batch.log

2026-07-24 비용 개편: 종전에는 번역이 도구 사용 에이전트 세션(--max-turns 40,
파일 읽기/쓰기)이라 언어판 1개당 수십만 토큰이 들었다. 이제 필요한 파일 내용을
프롬프트에 인라인하고 JSON 출력만 받아 파이썬이 검증·저장한다(도구 없음, 1턴).
모델은 I18N_MODEL 환경변수로 지정(기본 claude-sonnet-5). 호출별 비용을 로그에 남긴다.

사용: python i18n/batch.py            (전체 큐)
      python i18n/batch.py --limit 2  (앞 2개만 — 테스트)
      python i18n/batch.py --file apps/xxx.html  (단건 — 신작 실시간 훅)
"""
import datetime, glob, json, os, re, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANGS = ["ja", "en", "zh-tw"]
CLAUDE = os.environ.get("CLAUDE_BIN") or (
    r"C:\Users\넥사05\AppData\Roaming\npm\claude.cmd" if os.name == "nt" else "claude")
MODEL = os.environ.get("I18N_MODEL", "claude-sonnet-5")
LOG = os.path.join(ROOT, "i18n_batch.log")
LANDING_OUT = {"hall_index": "index", "hall_quiz": "quiz", "hall_friend": "friend", "hall_test": "test"}


def log(msg):
    line = f"[{datetime.datetime.now():%m-%d %H:%M:%S}] {msg}"
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8", newline="") as f:
        f.write(line + "\n")


def run(cmd, timeout=600, stdin_text=None, env=None):
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                          encoding="utf-8", errors="replace",
                          timeout=timeout, input=stdin_text, env=env)


def build_queue():
    q = [("index.html", "hall_index"), ("quiz.html", "hall_quiz"), ("friend.html", "hall_friend")]
    for pat in ("apps/*_test.html", "apps/*_friend.html", "apps/*_teaser.html"):
        for p in sorted(glob.glob(os.path.join(ROOT, pat))):
            rel = os.path.relpath(p, ROOT).replace("\\", "/")
            slug = os.path.splitext(os.path.basename(p))[0]
            q.append((rel, slug))
    return q


def done_already(slug):
    d = os.path.join(ROOT, "i18n", "strings", slug)
    if not all(os.path.isfile(os.path.join(d, f"{l}.json")) for l in ["ko"] + LANGS):
        return False
    out = outname_of(slug)
    if not out:
        return False
    for l in LANGS:
        p = os.path.join(ROOT, l, f"{out}.html") if slug in LANDING_OUT \
            else os.path.join(ROOT, l, "apps", f"{out}.html")
        if not os.path.isfile(p):
            return False
    return True


def outname_of(slug):
    if slug in LANDING_OUT:
        return LANDING_OUT[slug]
    p = os.path.join(ROOT, "i18n", "strings", slug, "ja.json")
    if os.path.isfile(p):
        j = json.load(open(p, encoding="utf-8"))
        return (j.get("_app") or {}).get("file")
    return None


# ── 단발 번역 하네스 ──────────────────────────────────────────────


def claude_oneshot(prompt, timeout=900):
    """도구 없는 단발 호출. JSON 출력 모드로 결과 텍스트와 비용을 받는다.
    사용량 한도로 보이는 실패는 30분 대기 후 1회 재시도. 반환: 텍스트 or None."""
    for attempt in (1, 2):
        try:
            # 번역은 기계적 작업 — extended thinking을 꺼서 출력 토큰 낭비 방지
            env = dict(os.environ, MAX_THINKING_TOKENS="0")
            r = run([CLAUDE, "-p", "--model", MODEL, "--output-format", "json"],
                    timeout=timeout, stdin_text=prompt, env=env)
        except subprocess.TimeoutExpired:
            if attempt == 1:
                log("    ⏳ 시간 초과 — 사용량 창 회복 대기(30분) 후 재시도")
                time.sleep(1800)
                continue
            log("    ✗ 시간 초과 재발")
            return None
        combined = (r.stdout or "") + (r.stderr or "")
        if r.returncode != 0:
            if attempt == 1 and re.search(r"limit|overload|rate", combined, re.I):
                log("    ⏳ 사용량 한도 감지 — 30분 대기 후 재시도")
                time.sleep(1800)
                continue
            log(f"    ✗ claude 종료코드 {r.returncode}: {combined[-300:]}")
            return None
        try:
            resp = json.loads(r.stdout)
        except Exception:
            # --output-format json 이 아닌 순수 텍스트가 온 경우 그대로 사용
            return r.stdout
        cost = resp.get("total_cost_usd")
        if cost is not None:
            log(f"    💰 호출 비용 ${cost:.4f} ({MODEL})")
        if resp.get("is_error"):
            if attempt == 1 and re.search(r"limit|overload", str(resp.get("result", "")), re.I):
                log("    ⏳ 사용량 한도 응답 — 30분 대기 후 재시도")
                time.sleep(1800)
                continue
            log(f"    ✗ 오류 응답: {str(resp.get('result'))[:300]}")
            return None
        return resp.get("result") or ""
    return None


CHUNK_CHARS = int(os.environ.get("I18N_CHUNK_CHARS", "12000"))


def chunk_items(slim_map):
    """{키: 원문} 매핑을 문자량 기준 청크 목록으로 분할 (순서 유지)."""
    chunks, cur, size = [], {}, 0
    for k, t in slim_map.items():
        item = len(k) + len(t) + 8
        if cur and size + item > CHUNK_CHARS:
            chunks.append(cur); cur, size = {}, 0
        cur[k] = t
        size += item
    if cur:
        chunks.append(cur)
    return chunks


def save_raw(slug, lang, ci, text):
    """파싱 실패한 원시 출력을 디버깅용으로 남긴다."""
    try:
        p = os.path.join(ROOT, "i18n", "strings", slug, f"{lang}.chunk{ci}.raw.txt")
        with open(p, "w", encoding="utf-8", newline="") as f:
            f.write(text or "(빈 출력)")
    except Exception:
        pass


def parse_json_out(text):
    """모델 출력에서 JSON 오브젝트 하나를 추출."""
    if not text:
        return None
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z-]*\s*", "", t)
        t = re.sub(r"\s*```\s*$", "", t)
    i, j = t.find("{"), t.rfind("}")
    if i < 0 or j <= i:
        return None
    try:
        return json.loads(t[i:j + 1])
    except Exception:
        return None


def write_lang_json(slug, lang, obj, ko_keys, is_landing):
    """검증 후 저장. 문제가 있으면 사유 문자열 반환, 정상이면 None."""
    if not isinstance(obj, dict):
        return "JSON 오브젝트가 아님"
    obj.pop("_meta", None)
    out_keys = {k for k in obj if not k.startswith("_")}
    missing = ko_keys - out_keys
    if missing:
        return f"누락 키 {len(missing)}개 (예: {sorted(missing)[:5]})"
    for k in list(obj.keys()):
        if not k.startswith("_") and k not in ko_keys:
            obj.pop(k)  # 잉여 키 제거
    for k in ko_keys:
        if not isinstance(obj[k], str):
            return f"값이 문자열이 아님: {k}"
    if not is_landing:
        app = obj.get("_app")
        if not isinstance(app, dict) or not app.get("file"):
            return "_app 블록 누락"
    path = os.path.join(ROOT, "i18n", "strings", slug, f"{lang}.json")
    with open(path, "w", encoding="utf-8", newline="") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    return None


def translate_prompt(slug, is_landing, lang, ko_text, rules, glossary, app_file, ident_keys=None,
                     want_app=False, part=None):
    if not want_app:
        app_rule = '"_app" 블록은 넣지 마라.'
    elif app_file:
        app_rule = (f'"_app" 블록을 포함하라: {{"id": "{slug}", "file": "{app_file}", '
                    f'"title": "<현지어 앱 제목>", "desc": "<현지어 한 줄 소개>"}} — file 값은 반드시 "{app_file}" 그대로 쓴다.')
    else:
        app_rule = (f'"_app" 블록을 포함하라: {{"id": "{slug}", "file": "<영문 소문자 ascii 슬러그(하이픈만, _test/_teaser 접미사 제외)>", '
                    '"title": "<현지어 앱 제목>", "desc": "<현지어 한 줄 소개>"}}')
    part_note = f" (전체 문자열의 {part[0]}/{part[1]} 부분이다 — 주어진 키만 처리하라)" if part and part[1] > 1 else ""
    ident_rule = ""
    if ident_keys:
        ident_rule = f"\n- 다음 키의 값은 JS 식별자로 유효해야 한다(공백·특수문자 금지): {', '.join(ident_keys[:30])}"
    return f"""너는 미미팩토리의 로컬라이즈 담당이다. 아래 [ko.json]의 한국어 문자열을 {lang}로 로컬라이즈하라.{part_note}

출력 규칙 (반드시 준수):
- 다른 설명·코드펜스 없이 JSON 오브젝트 하나만 출력한다.
- 키는 ko.json과 1:1 동일하게, 각 키에 번역된 문자열을 넣는다.
- 원문 속 <b>·<br> 태그, 이모지, 선행 공백, 리터럴 \\n(백슬래시+n 두 글자)은 그대로 보존.
- 곧은따옴표(" ')와 백슬래시를 새로 추가하지 마라 — 인용은 「」·컬리(’)를 사용.
- manual_* 키의 값은 JS 식별자로 유효하게(공백·특수문자 금지).{ident_rule}
- URL이 든 문자열은 경로를 해당 언어로: /apps/... → /{lang}/apps/<file슬러그>.html
- 정답형 퀴즈(options에 ok:true 구조)라면 번역 후에도 정답이 유독 긴 선택지가 되지 않게 길이 균형 유지.
- {app_rule}
- 번역은 직역이 아니라 로컬라이즈다. 한국 고유 소재는 등가의 현지 소재로.

[로컬라이즈 규칙 — {lang}]
{rules}

[용어집 — 임의 변경 금지]
{glossary}

[ko.json]
{ko_text}"""


def fix_prompt(slug, lang, cur_text, fail_msg, rules):
    return f"""아래는 미미팩토리 앱({slug})의 {lang} 번역 JSON과 검증 실패 내역이다.
문제가 된 키만 고쳐서, {{"키": "수정된 문자열"}} 형태의 패치 JSON 하나만 출력하라
(설명·코드펜스 금지, 문제 없는 키는 포함하지 마라).

필수 규칙: <b>·<br>·이모지·리터럴 \\n 보존, 곧은따옴표(" ')·백슬래시 금지(「」·컬리 사용), 한글 잔존 금지.

[로컬라이즈 규칙 — {lang}]
{rules}

[현재 {lang}.json]
{cur_text}

[검증 실패]
{fail_msg}"""


# ── 파이프라인 ────────────────────────────────────────────────────


def build_and_verify(slug, out):
    """반환: [(lang, 실패메시지), ...]"""
    fails = []
    for lang in LANGS:
        b = run([sys.executable, "-X", "utf8", "i18n/build.py", slug, lang, out])
        if b.returncode != 0:
            fails.append((lang, f"[빌드 실패]\n{b.stdout[-600:]}{b.stderr[-400:]}"))
            continue
        html = f"{lang}/{out}.html" if slug in LANDING_OUT else f"{lang}/apps/{out}.html"
        v = run([sys.executable, "-X", "utf8", "i18n/verify_i18n.py", slug, lang, html])
        if v.returncode != 0:
            fail_lines = "\n".join(l for l in v.stdout.splitlines() if "FAIL" in l)
            fails.append((lang, f"[검증 실패]\n{fail_lines}"))
    return fails


def process(rel, slug):
    is_landing = slug in LANDING_OUT
    # 1) 추출
    r = run([sys.executable, "-X", "utf8", "i18n/extract.py", rel, slug])
    if r.returncode != 0:
        log(f"  ✗ 추출 실패: {r.stderr[-200:]}"); return False
    d = os.path.join(ROOT, "i18n", "strings", slug)
    ko_obj = json.load(open(os.path.join(d, "ko.json"), encoding="utf-8"))
    ko_keys = {k for k in ko_obj if not k.startswith("_")}
    # 프롬프트에는 ctx를 뺀 슬림 매핑만 보낸다 (입력 토큰 절약).
    # 식별자로 유효해야 하는 키는 따로 목록으로 전달한다.
    ko_slim = {k: v["t"] if isinstance(v, dict) else v for k, v in ko_obj.items() if not k.startswith("_")}
    ident_keys = sorted(k for k, v in ko_obj.items()
                        if not k.startswith("_") and isinstance(v, dict) and "식별자" in v.get("ctx", ""))
    glossary = open(os.path.join(ROOT, "i18n", "glossary.json"), encoding="utf-8").read()

    # 2) 번역 — 언어별·청크별 단발 호출 (이미 json 있으면 생략).
    # 큰 앱은 문자열을 청크로 나눠 호출한다(출력 잘림·타임아웃 방지).
    # _app.file은 첫 언어가 정하고 이후 언어에 강제.
    chunks = chunk_items(ko_slim)
    app_file = None
    for lang in LANGS:
        p = os.path.join(d, f"{lang}.json")
        if os.path.isfile(p):
            if not is_landing and not app_file:
                j = json.load(open(p, encoding="utf-8"))
                app_file = (j.get("_app") or {}).get("file")
            continue
        rules = open(os.path.join(ROOT, "i18n", "prompts", f"{lang}.md"), encoding="utf-8").read()
        merged = {}
        failed = None
        for ci, chunk in enumerate(chunks):
            chunk_text = json.dumps(chunk, ensure_ascii=False, indent=0)
            want_app = (not is_landing) and ci == 0
            prompt = translate_prompt(slug, is_landing, lang, chunk_text, rules, glossary,
                                      app_file, ident_keys, want_app=want_app,
                                      part=(ci + 1, len(chunks)))
            obj = None
            for tries in range(2):  # 청크 단위 재시도 1회
                text = claude_oneshot(prompt, timeout=600)
                obj = parse_json_out(text)
                if obj is not None:
                    break
                save_raw(slug, lang, ci, text)
                log(f"    ↻ {lang} 청크 {ci + 1}/{len(chunks)} 파싱 실패 — 재시도")
            if obj is None:
                failed = f"청크 {ci + 1}/{len(chunks)} 출력 파싱 실패"
                break
            merged.update(obj)
        if failed:
            log(f"  ✗ {lang} 번역 실패: {failed}"); return False
        err = write_lang_json(slug, lang, merged, ko_keys, is_landing)
        if err:
            log(f"  ✗ {lang} 번역 실패: {err}"); return False
        if not is_landing and not app_file:
            app_file = (merged.get("_app") or {}).get("file")
            if app_file:
                app_file = str(app_file)

    out = outname_of(slug)
    if not out:
        log("  ✗ _app.file 슬러그 없음"); return False

    # 3) 빌드+검증 (+단발 수정 재시도 2회)
    for attempt in range(3):
        fails = build_and_verify(slug, out)
        if not fails:
            break
        if attempt == 2:
            log("  ✗ 검증 최종 실패:\n" + "\n".join(m for _, m in fails)[:800]); return False
        log(f"  ↻ 수정 재시도 {attempt + 1}")
        fixed_any = False
        for lang in {l for l, _ in fails}:
            msg = "\n".join(m for l2, m in fails if l2 == lang)[:3000]
            cur_path = os.path.join(d, f"{lang}.json")
            cur_obj = json.load(open(cur_path, encoding="utf-8"))
            cur_text = json.dumps(cur_obj, ensure_ascii=False, indent=0)
            rules = open(os.path.join(ROOT, "i18n", "prompts", f"{lang}.md"), encoding="utf-8").read()
            text = claude_oneshot(fix_prompt(slug, lang, cur_text, msg, rules), timeout=600)
            patch = parse_json_out(text)
            if not isinstance(patch, dict) or not patch:
                log(f"    ✗ {lang} 수정 실패: 패치 파싱 실패"); continue
            # 패치 병합 — 기존에 없는 키는 무시
            applied = 0
            for k, v in patch.items():
                if k in cur_obj and isinstance(v, str):
                    cur_obj[k] = v; applied += 1
                elif k == "_app" and isinstance(v, dict):
                    cur_obj["_app"] = v; applied += 1
            err = write_lang_json(slug, lang, cur_obj, ko_keys, is_landing)
            if err:
                log(f"    ✗ {lang} 수정 실패: {err}")
            else:
                log(f"    ✓ {lang} 패치 적용 {applied}개 키")
                fixed_any = True
        if not fixed_any:
            log("  ✗ 수정 호출 전부 실패"); return False

    # 4) 폰트 서브셋 + 매니페스트
    for lang in LANGS:
        files = glob.glob(os.path.join(ROOT, lang, "apps", "*.html")) + \
                glob.glob(os.path.join(ROOT, lang, "*.html"))
        rels = [os.path.relpath(f, ROOT) for f in files]
        run([sys.executable, "-X", "utf8", "i18n/fontsubset.py", lang] + rels, timeout=300)
    run([sys.executable, "-X", "utf8", "i18n/manifest.py", "all"])
    return True


def git_push():
    run(["git", "pull", "--rebase"], timeout=120)
    r = run(["git", "push"], timeout=120)
    log("  ⇡ push " + ("OK" if r.returncode == 0 else "실패: " + r.stderr[-200:]))


def main():
    limit = 0
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    if "--file" in sys.argv:
        # 단건 모드 — 새벽 생산 훅(신작 실시간 다국어화)용
        rel = sys.argv[sys.argv.index("--file") + 1].replace("\\", "/")
        slug = os.path.splitext(os.path.basename(rel))[0]
        queue = [] if done_already(slug) else [(rel, slug)]
    else:
        queue = [(rel, slug) for rel, slug in build_queue() if not done_already(slug)]
    if limit:
        queue = queue[:limit]
    log(f"═══ 배치 시작: {len(queue)}개 항목 (모델 {MODEL}, 단발 호출) ═══")
    ok = bad = 0
    since_push = 0
    for i, (rel, slug) in enumerate(queue, 1):
        log(f"[{i}/{len(queue)}] {slug}")
        t0 = time.time()
        try:
            success = process(rel, slug)
        except Exception as e:
            log(f"  ✗ 예외: {e}"); success = False
        if success:
            ok += 1
            run(["git", "add", "-A", "i18n", "ja", "en", "zh-tw", "reports"])
            run(["git", "commit", "-m", f"🌏 i18n 배치: {slug} (ja/en/zh-TW)\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"])
            since_push += 1
            if since_push >= 3:
                git_push(); since_push = 0
            log(f"  ✓ 완료 ({int(time.time() - t0)}초)")
        else:
            bad += 1
    if since_push:
        git_push()
    log(f"═══ 배치 종료: 성공 {ok} / 실패 {bad} ═══")


if __name__ == "__main__":
    main()
