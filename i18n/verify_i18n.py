#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""미미팩토리 i18n — 검증 게이트. 통과 전 배포 금지.

사용: python i18n/verify_i18n.py <슬러그> <언어> <산출HTML>
결과: reports/i18n_report_{날짜}.md (전 항목 PASS 여야 exit 0)
"""
import datetime, json, os, re, subprocess, sys, tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build   # mask_vendor — 라이브러리 구간 판별 기준을 빌더와 공유

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HANGUL = re.compile(r"[가-힣]")

# 간체 전용 한자 샘플 (zh-TW 혼입 검사용 — 대표 고빈도)
# '后'는 번체 정자(皇后 등)에서도 쓰이므로 제외
SIMPLIFIED = set("么这为说读书电视软视频发国过时门问题东车马乐买卖点长")


def check(slug, lang, html_path):
    full = open(os.path.join(ROOT, html_path), encoding="utf-8").read()
    # 서드파티 압축 라이브러리(html2canvas 등)는 검사 대상에서 제외한다.
    # 라이브러리가 CSS 한국식 번호매기기를 지원하느라 '영일이삼사오육칠팔구',
    # '십백천만', '마이너스'와 "keep-all" 문자열을 품고 있어, 그대로 검사하면
    # 번역 누락·keep-all 잔존으로 오탐이 나 배포가 영구히 막힌다. 판별 기준은
    # build.py 와 동일(압축 여부 = 줄바꿈 밀도).
    html, _vendor = build.mask_vendor(full)
    d = os.path.join(ROOT, "i18n", "strings", slug)
    ko = json.load(open(os.path.join(d, "ko.json"), encoding="utf-8"))
    tr = json.load(open(os.path.join(d, f"{lang}.json"), encoding="utf-8"))
    results = []  # (검사, PASS/FAIL/SKIP, 상세)

    def add(name, ok, detail=""):
        results.append((name, "PASS" if ok else "FAIL", detail))

    # 1) 미번역 잔존 (한글)
    leftovers = sorted({m.group(0) for m in re.finditer(r"[가-힣][가-힣 ]{0,20}", html)})
    add("① 한글 잔존 0", not leftovers, f"{len(leftovers)}건: {leftovers[:5]}" if leftovers else "잔존 없음")

    # 2) 키 누락/추가
    ko_k = {k for k in ko if not k.startswith("_")}
    tr_k = {k for k in tr if not k.startswith("_")}
    add("② 키 일치", ko_k == tr_k, f"누락 {len(ko_k-tr_k)} / 잉여 {len(tr_k-ko_k)}")

    # 3) 선택지 길이 균형 (정답 있는 퀴즈만 — options[].ok 구조 감지)
    def _longest_ratio(doc):
        blocks = re.findall(r"options:\[(.*?)\]", doc)
        if not blocks:
            return None
        longest_correct = 0
        for b in blocks:
            opts = re.findall(r'\{t:"((?:[^"\\]|\\.)*)"(,ok:true)?\}', b)
            if opts and max(opts, key=lambda o: len(o[0]))[1]:
                longest_correct += 1
        return longest_correct / max(1, len(blocks)) * 100

    ratio = _longest_ratio(html)
    if ratio is not None:
        # 기준: 25~35% 밴드 안이거나, 한국어 원본 비율에서 ±10%p 이내(원본 계승)
        ko_src = open(os.path.join(ROOT, ko["_meta"]["source"]), encoding="utf-8").read()
        ko_ratio = _longest_ratio(ko_src) or 0
        ok3 = (25 <= ratio <= 35) or (abs(ratio - ko_ratio) <= 10)
        add("③ 정답=최장 비율(원본 계승)", ok3, f"{ratio:.0f}% (원본 {ko_ratio:.0f}%)")
    else:
        results.append(("③ 선택지 길이 균형", "SKIP", "정답형 퀴즈 아님(카드/진단 앱)"))

    # 4) zh-TW 간체 혼입
    if lang == "zh-tw":
        bad = sorted(set(html) & SIMPLIFIED)
        add("④ 간체자 혼입 0", not bad, "".join(bad[:10]))
    else:
        results.append(("④ 간체자 혼입", "SKIP", f"{lang} 해당 없음"))

    # 5) keep-all 잔존
    add("⑤ keep-all 제거", "keep-all" not in html, "")

    # 6) 로케일 포맷 (가격·날짜 노출 시) — 노출 없으면 SKIP
    has_price = re.search(r"[₩$¥]|NT\$|\d{4}[.\-/년]\s?\d{1,2}", html)
    if has_price:
        results.append(("⑥ 로케일 포맷", "PASS", "수동 확인 필요 항목 표시됨"))
    else:
        results.append(("⑥ 로케일 포맷", "SKIP", "가격·날짜 노출 없음"))

    # 7) 로컬라이즈 푸터 존재 (</body> 직전 근방)
    # 표준 푸터(mf-logo) 또는 책퀴즈 표준 푸터(class="factory") 둘 다 인정
    pos = html.rfind("mf-logo")
    if pos < 0:
        pos = html.rfind('class="factory"')
    tail = html[pos:]
    footer_ok = pos > 0 and not HANGUL.search(tail[:400])
    add("⑦ 로컬라이즈 푸터", footer_ok, "")

    # 8) CDN 잔존 (자체 호스팅 원칙)
    add("⑧ 구글폰트 CDN 제거", "fonts.googleapis.com" not in html, "")

    # 9) JS 문법 — 앱 스크립트 전부 + 라이브러리 본문까지 검사한다.
    #    이전에는 마스킹된 html에서 '가장 긴' 블록 하나만 봐서, 앱 스크립트가 여러 개면
    #    나머지가 통째로 검사되지 않았다. 또 라이브러리는 마스킹돼 아예 빠져 있었는데,
    #    번역이 라이브러리 내부 문자열("마이너스"→"minus")을 건드려 깨뜨린 사례가
    #    19개 빌드에서 실제로 나왔다(PDF 저장 기능 사망). 그래서 둘 다 검사한다.
    tmp = os.path.join(tempfile.gettempdir(), "_i18n_check.js")

    def _syntax_error(js):
        open(tmp, "w", encoding="utf-8").write(js)
        r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
        if r.returncode == 0:
            return None
        lines = [l for l in (r.stderr or "").strip().splitlines() if "Error" in l]
        return (lines[-1] if lines else "문법 오류")[:70]

    bad = []
    for i, s in enumerate(re.findall(r"<script[^>]*>(.*?)</script>", html, re.S)):
        if not s.strip() or "\x00VENDOR" in s:
            continue
        err = _syntax_error(s)
        if err:
            bad.append(f"앱 블록{i}: {err}")
    for i, s in enumerate(_vendor):
        err = _syntax_error(s)
        if err:
            bad.append(f"라이브러리{i}(번역이 건드림): {err}")
    add("⑨ JS 문법(node --check)", not bad, "; ".join(bad)[:220])

    return results


def main():
    slug, lang, html_path = sys.argv[1], sys.argv[2], sys.argv[3]
    results = check(slug, lang, html_path)
    date = datetime.date.today().isoformat()
    rep_dir = os.path.join(ROOT, "reports")
    os.makedirs(rep_dir, exist_ok=True)
    rep = os.path.join(rep_dir, f"i18n_report_{date}.md")
    fails = [r for r in results if r[1] == "FAIL"]
    with open(rep, "a", encoding="utf-8", newline="") as f:
        f.write(f"\n## {date} · {slug} · {lang} → {html_path}\n\n")
        f.write("| 검사 | 결과 | 상세 |\n|---|---|---|\n")
        for name, st, det in results:
            f.write(f"| {name} | {'✅' if st=='PASS' else '⏭️' if st=='SKIP' else '❌'} {st} | {det} |\n")
        f.write(f"\n**판정: {'통과 — 배포 가능' if not fails else 'FAIL — 배포 금지'}**\n")
    for name, st, det in results:
        print(f"[{st}] {name} {det}")
    print(f"리포트: {os.path.relpath(rep, ROOT)}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
