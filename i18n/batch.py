#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""미미팩토리 i18n — 전체 로컬라이즈 배치 오케스트레이터.

큐: 랜딩(index/quiz/friend) → 테스트관·피크닉 앱 전체 → 밤의 서재 티저 전체.
(밤의 서재 풀버전은 저작권 규칙상 제외 — 퍼블릭 도메인 화이트리스트는 추후)

항목마다: extract → claude CLI 번역(3개 언어 json) → build×3 → verify×3
(실패 시 claude 수정 재시도 최대 2회) → 폰트 서브셋 → manifest → commit.
push는 3개 항목마다. 로그: i18n_batch.log

사용: python i18n/batch.py            (전체 큐)
      python i18n/batch.py --limit 2  (앞 2개만 — 테스트)
"""
import datetime, glob, json, os, re, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANGS = ["ja", "en", "zh-tw"]
CLAUDE = os.environ.get("CLAUDE_BIN") or (
    r"C:\Users\넥사05\AppData\Roaming\npm\claude.cmd" if os.name == "nt" else "claude")
MODEL = "claude-opus-4-8"
LOG = os.path.join(ROOT, "i18n_batch.log")
LANDING_OUT = {"hall_index": "index", "hall_quiz": "quiz", "hall_friend": "friend", "hall_test": "test"}


def log(msg):
    line = f"[{datetime.datetime.now():%m-%d %H:%M:%S}] {msg}"
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8", newline="") as f:
        f.write(line + "\n")


def run(cmd, timeout=600, stdin_text=None):
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                          encoding="utf-8", errors="replace",
                          timeout=timeout, input=stdin_text)


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


def translate_prompt(slug, is_landing):
    app_rule = ("랜딩 페이지이므로 \"_app\" 블록은 넣지 마라."
                if is_landing else
                f"각 언어 json에 \"_app\" 블록을 넣어라: {{\"id\": \"{slug}\", \"file\": \"<영문 소문자 ascii 슬러그(하이픈만, _test/_teaser 접미사 제외)>\", \"title\": \"<현지어 앱 제목>\", \"desc\": \"<현지어 한 줄 소개>\"}} — file 값은 3개 언어 모두 동일해야 한다.")
    return f"""너는 미미팩토리의 로컬라이즈 담당이다. 지금 리포 루트에서 작업한다.

다음 파일들을 읽어라:
1. i18n/strings/{slug}/ko.json — 원문 (키-문자열)
2. i18n/prompts/ja.md, i18n/prompts/en.md, i18n/prompts/zh-tw.md — 언어별 톤·규칙 (절대 준수)
3. i18n/glossary.json — 브랜드 고정 용어 (임의 변경 금지)
4. 모범 예시: i18n/strings/tarot/ja.json, en.json, zh-tw.json

그 다음 i18n/strings/{slug}/ 에 ja.json, en.json, zh-tw.json 3개 파일을 작성하라.

필수 규칙:
- 키는 ko.json과 1:1 동일(_meta 제외, 값은 문자열만).
- 원문 속 <b>·<br> 태그, 이모지, 선행 공백, 리터럴 \\n(백슬래시+n 두 글자)은 그대로 보존.
- 곧은따옴표(" ')와 백슬래시를 새로 추가하지 마라 — 인용은 「」·컬리(’) 사용.
- manual_* 키나 ctx에 '식별자'가 언급된 키는 JS 식별자로 유효하게(공백·특수문자 금지).
- URL이 든 문자열은 경로를 해당 언어로: /apps/... → /{{lang}}/apps/<file슬러그>.html
- 정답형 퀴즈(options에 ok:true 구조)라면 번역 후에도 정답이 유독 긴 선택지가 되지 않게 길이 균형 유지.
- {app_rule}
- 번역은 직역이 아니라 로컬라이즈다. 한국 고유 소재는 등가의 현지 소재로.

파일 3개 저장 후 다른 출력 없이 종료하라."""


def claude_call(prompt, timeout=1200):
    r = run([CLAUDE, "-p", "--dangerously-skip-permissions", "--max-turns", "40",
             "--model", MODEL], timeout=timeout, stdin_text=prompt)
    return r.returncode


def build_and_verify(slug, out):
    fails = []
    for lang in LANGS:
        b = run([sys.executable, "-X", "utf8", "i18n/build.py", slug, lang, out])
        if b.returncode != 0:
            fails.append(f"[{lang} 빌드 실패]\n{b.stdout[-600:]}{b.stderr[-400:]}")
            continue
        html = f"{lang}/{out}.html" if slug in LANDING_OUT else f"{lang}/apps/{out}.html"
        v = run([sys.executable, "-X", "utf8", "i18n/verify_i18n.py", slug, lang, html])
        if v.returncode != 0:
            fail_lines = "\n".join(l for l in v.stdout.splitlines() if "FAIL" in l)
            fails.append(f"[{lang} 검증 실패]\n{fail_lines}")
    return fails


def process(rel, slug):
    is_landing = slug in LANDING_OUT
    # 1) 추출
    r = run([sys.executable, "-X", "utf8", "i18n/extract.py", rel, slug])
    if r.returncode != 0:
        log(f"  ✗ 추출 실패: {r.stderr[-200:]}"); return False
    # 2) 번역 (이미 3개 언어 json 있으면 생략)
    d = os.path.join(ROOT, "i18n", "strings", slug)
    if not all(os.path.isfile(os.path.join(d, f"{l}.json")) for l in LANGS):
        if claude_call(translate_prompt(slug, is_landing)) != 0:
            log("  ✗ 번역 호출 실패"); return False
    out = outname_of(slug)
    if not out:
        log("  ✗ _app.file 슬러그 없음"); return False
    # 3) 빌드+검증 (+수정 재시도 2회)
    for attempt in range(3):
        fails = build_and_verify(slug, out)
        if not fails:
            break
        if attempt == 2:
            log(f"  ✗ 검증 최종 실패:\n" + "\n".join(fails)[:800]); return False
        fix = (f"i18n/strings/{slug}/ 의 번역 json에 문제가 있다. 아래 실패를 고쳐 해당 언어 json을 수정 저장하라.\n"
               f"규칙은 i18n/prompts/*.md 와 동일(키 1:1, 태그·\\n 보존, 곧은따옴표 금지, 한글 잔존 금지).\n\n"
               + "\n\n".join(fails)[:3000])
        log(f"  ↻ 수정 재시도 {attempt+1}")
        claude_call(fix, timeout=900)
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
    queue = [(rel, slug) for rel, slug in build_queue() if not done_already(slug)]
    if limit:
        queue = queue[:limit]
    log(f"═══ 배치 시작: {len(queue)}개 항목 ═══")
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
            log(f"  ✓ 완료 ({int(time.time()-t0)}초)")
        else:
            bad += 1
    if since_push:
        git_push()
    log(f"═══ 배치 종료: 성공 {ok} / 실패 {bad} ═══")


if __name__ == "__main__":
    main()
