#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_quiz.py — 퀴즈로읽는책 산출물 최종 검증 게이트 (v2.1)

present 직전에 반드시 실행하고, 종료 코드 0을 확인한 뒤에만 사용자에게 보여준다.

검사 항목:
  ① 구조 무결성(DOM 중복) — 번들 내부 문자열 리터럴 오탐을 피하기 위해
     번들이 없는 마커(hero / section id=home / div.wrap)로 판정
  ② 문항 30개 · 레벨 분포 · 난이도 오름차순(블록 순서) · 정답 정확히 1개
  ③ '정답=최장보기' 비율 25~35%
  ④ SOURCES 참조키 존재 (엔진이 참조하는 src 키가 SOURCES에 모두 있는가, ebs 포함)
  ⑤ 레퍼런스/직전 책 잔존 텍스트 0 (주석·랭크 문구 포함)
  ⑥ 브랜드 푸터 정식 표기

사용법:
  python3 verify_quiz.py <완성본.html> [--extra-markers "총·균·쇠" "재레드 다이아몬드" ...]
"""
import sys
import re
import argparse


def body_only(html: str) -> str:
    """번들이 몰려 있는 <head> 영역을 잘라내고 실제 DOM/엔진 영역만 반환.
    번들 내부 문자열 리터럴이 카운트를 오염시키는 것을 줄인다."""
    i = html.find("<body>")
    # <body>가 번들 문자열로도 등장하므로, 마지막(실제 DOM) 것을 쓴다
    last = html.rfind("<body>")
    return html[last:] if last != -1 else html[i:] if i != -1 else html


def check_structure(html: str):
    """① DOM 중복 — 번들 영향 없는 마커로 판정"""
    body = body_only(html)
    markers = {
        'class="hero"': body.count('class="hero"'),
        '<section id="home"': body.count('<section id="home"'),
        '<div class="wrap">': body.count('<div class="wrap">'),
    }
    ok = all(v == 1 for v in markers.values())
    return ok, markers


def check_questions(html: str):
    """② 문항 수·레벨 분포·오름차순·정답 1개"""
    body = body_only(html)
    qs = re.findall(r"\{id:\s*(\d+),\s*level:\s*(\d)", body)
    n = len(qs)
    levels = [int(lv) for _, lv in qs]
    dist = {1: levels.count(1), 2: levels.count(2), 3: levels.count(3)}
    ascending = all(levels[i] <= levels[i + 1] for i in range(len(levels) - 1)) if levels else False

    # 정답 개수: options:[ ... ] 블록마다 ok:true 가 정확히 1개
    blocks = re.findall(r"options:\[(.*?)\],\s*\n", body, re.DOTALL)
    bad_answers = [i + 1 for i, b in enumerate(blocks) if b.count("ok:true") != 1]

    # v2.1: teaser 빌드는 freeLimit 개수만 포함하는 것이 정석 → 기대 개수를 모드에 따라 결정
    m = re.search(r"const\s+APP_CONFIG\s*=\s*\{(.*?)\};", body, re.DOTALL)
    expected = 30
    if m and re.search(r"""mode:\s*["']teaser["']""", m.group(1)):
        lm = re.search(r"freeLimit:\s*(\d+)", m.group(1))
        expected = int(lm.group(1)) if lm else 10
    # dist는 정보성(정석 템플릿 실측 분포 10/12/8 — 10/10/10 강제는 오탐)
    ok = (n == expected and ascending and not bad_answers)
    return ok, {"count": n, "expected": expected, "dist": dist, "ascending": ascending, "bad_answers": bad_answers}


def check_length_balance(html: str):
    """③ 정답=최장보기 비율 25~35%"""
    body = body_only(html)
    blocks = re.findall(r"options:\[(.*?)\],\s*\n", body, re.DOTALL)
    total = 0
    longest = 0
    for b in blocks:
        # {t:"...",ok:true} / {t:'...'} 양쪽 따옴표 모두 파싱
        opts = re.findall(r"""\{t:\s*["']([^"']*)["'](,ok:true)?\}""", b)
        if not opts:
            continue
        total += 1
        L = [(len(t), bool(ok)) for t, ok in opts]
        mx = max(l for l, _ in L)
        cl = next((l for l, ok in L if ok), 0)
        if cl == mx:
            longest += 1
    ratio = (longest / total * 100) if total else 0
    # v2.1: teaser(부분 데이터)는 부분집합 특성상 비율이 흔들릴 수 있어 경고성 통과(15~45%)
    teaser = bool(re.search(r"""mode:\s*["']teaser["']""", body))
    lo, hi = (15, 45) if teaser else (25, 35)
    ok = lo <= ratio <= hi
    return ok, {"total": total, "longest_correct": longest, "ratio": round(ratio, 1), "band": f"{lo}~{hi}%"}


def check_sources(html: str):
    """④ 엔진이 참조하는 src 키가 SOURCES에 모두 존재 (ebs 포함)"""
    body = body_only(html)
    src_keys = set(re.findall(r"(\w+):\s*\{label:", body))
    used = set(re.findall(r"""src:\s*["'](\w+)["']""", body))
    # 엔진 하드코딩 참조 (SOURCES.xxx)
    hard = set(re.findall(r"SOURCES\.(\w+)", body))
    need = used | hard
    missing = need - src_keys
    has_ebs = "ebs" in src_keys
    ok = (not missing) and has_ebs
    return ok, {"defined": sorted(src_keys), "used": sorted(need),
                "missing": sorted(missing), "has_ebs": has_ebs}


def check_leftovers(html: str, extra_markers):
    """⑤ 레퍼런스(총·균·쇠) + 직전 책 잔존 텍스트 0"""
    body = body_only(html)
    default_markers = [
        "총·균·쇠", "재레드 다이아몬드", "얄리", "동서 축", "채집·사냥",
        "문명의 설계자", "대항해 탐험가", "농경 개척자", "수렵채집인",
        "지리·환경의 운", "비옥한 초승달", "퓰리처상", "카하마르카",
        "모리오리", "안나 카레니나", "뉴기니",
    ]
    markers = default_markers + list(extra_markers or [])
    found = {m: body.count(m) for m in markers if body.count(m) > 0}
    ok = len(found) == 0
    return ok, found


def check_footer(html: str):
    """⑥ 브랜드 푸터 정식 표기 (곡선/곧은 따옴표 모두 허용)"""
    body = body_only(html)
    f1 = ('"의미와재미공장" 미미팩토리' in body) or ("“의미와재미공장” 미미팩토리" in body)
    f2 = "(주식회사 연:결 패밀리회사)" in body
    ok = f1 and f2
    return ok, {"factory_label": f1, "affiliation": f2}


def check_app_config(html: str):
    """⑦ 수익화 APP_CONFIG (v2.1) — 존재하면 모드 유효성/필수값 검사.
    APP_CONFIG가 없으면 free 취급으로 통과(하위호환)."""
    body = body_only(html)
    m = re.search(r"const\s+APP_CONFIG\s*=\s*\{(.*?)\};", body, re.DOTALL)
    if not m:
        return True, {"present": False, "note": "APP_CONFIG 없음 → free 취급(하위호환 통과)"}
    block = m.group(1)
    mode_m = re.search(r"""mode:\s*["'](\w+)["']""", block)
    mode = mode_m.group(1) if mode_m else None
    sub_m = re.search(r"""subscribeUrl:\s*["']([^"']*)["']""", block)
    sub = sub_m.group(1) if sub_m else ""
    valid_mode = mode in ("free", "teaser", "premium")
    needs_url = mode in ("teaser", "premium")
    url_ok = (not needs_url) or bool(sub.strip())
    warn = None
    if mode == "teaser":
        # teaser 빌드에 잠금 이후 정답 데이터가 통째로 들어있으면 소스보기로 유출됨 → 경고(실패는 아님)
        lim_m = re.search(r"freeLimit:\s*(\d+)", block)
        lim = int(lim_m.group(1)) if lim_m else 10
        n_q = len(re.findall(r"\{id:\s*\d+,\s*level:", body))
        if n_q > lim:
            warn = f"teaser인데 문항 데이터 {n_q}개 포함(freeLimit={lim}) — 소스보기 유출 가능, 데이터 분리 빌드 권장"
    ok = valid_mode and url_ok
    return ok, {"present": True, "mode": mode, "subscribeUrl_set": bool(sub.strip()),
                "valid_mode": valid_mode, "url_ok": url_ok, "warning": warn}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("html", help="검증할 완성본 HTML 경로")
    ap.add_argument("--extra-markers", nargs="*", default=[],
                    help="직전에 만든 다른 책의 고유명사(잔존 검사에 추가)")
    ap.add_argument("--skip-leftovers", action="store_true",
                    help="검증 대상이 총·균·쇠 원조본 자체일 때 ⑤ 잔존 검사를 건너뜀")
    args = ap.parse_args()

    with open(args.html, "r", encoding="utf-8") as f:
        html = f.read()

    checks = [
        ("① 구조 무결성(DOM 중복)", *check_structure(html)),
        ("② 문항·레벨·정답", *check_questions(html)),
        ("③ 보기 길이 균형(25~35%)", *check_length_balance(html)),
        ("④ SOURCES 참조키", *check_sources(html)),
        ("⑤ 레퍼런스 잔존 텍스트", *((True, {"skipped": "총·균·쇠 원조본"}) if args.skip_leftovers else check_leftovers(html, args.extra_markers))),
        ("⑥ 브랜드 푸터", *check_footer(html)),
        ("⑦ 수익화 APP_CONFIG(v2.1)", *check_app_config(html)),
    ]

    print("=" * 60)
    print("퀴즈로읽는책 — 최종 검증 게이트 (verify_quiz.py)")
    print("=" * 60)
    all_ok = True
    for name, ok, detail in checks:
        mark = "✅" if ok else "❌"
        print(f"{mark} {name}: {detail}")
        if not ok:
            all_ok = False

    print("=" * 60)
    if all_ok:
        print("🎉 전체 통과 — present 진행 가능 (exit 0)")
        sys.exit(0)
    else:
        print("⚠️ 실패 항목 있음 — 수정 후 재검증 (exit 1)")
        sys.exit(1)


if __name__ == "__main__":
    main()
