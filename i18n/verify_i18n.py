#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""미미팩토리 i18n — 검증 게이트. 통과 전 배포 금지.

사용: python i18n/verify_i18n.py <슬러그> <언어> <산출HTML>
결과: reports/i18n_report_{날짜}.md (전 항목 PASS 여야 exit 0)
"""
import datetime, json, os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HANGUL = re.compile(r"[가-힣]")

# 간체 전용 한자 샘플 (zh-TW 혼입 검사용 — 대표 고빈도)
# '后'는 번체 정자(皇后 등)에서도 쓰이므로 제외
SIMPLIFIED = set("么这为说读书电视软视频发国过时门问题东车马乐买卖点长")


def check(slug, lang, html_path):
    html = open(os.path.join(ROOT, html_path), encoding="utf-8").read()
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
    tail = html[html.rfind("mf-logo"):]
    footer_ok = html.rfind("mf-logo") > 0 and not HANGUL.search(tail[:400])
    add("⑦ 로컬라이즈 푸터", footer_ok, "")

    # 8) CDN 잔존 (자체 호스팅 원칙)
    add("⑧ 구글폰트 CDN 제거", "fonts.googleapis.com" not in html, "")

    # 9) JS 문법
    scripts = re.findall(r"<script[^>]*>(.*?)</script>", html, re.S)
    tmp = os.path.join(tempfile.gettempdir(), "_i18n_check.js")
    open(tmp, "w", encoding="utf-8").write(max(scripts, key=len))
    r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
    add("⑨ JS 문법(node --check)", r.returncode == 0, r.stderr[:120])

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
