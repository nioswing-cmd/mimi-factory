#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""미미팩토리 i18n — 사용자 노출 문자열 추출기.

원본 HTML에서 한글이 포함된 사용자 노출 문자열만 뽑아
i18n/strings/{app}/ko.json 을 만든다. HTML 구조·클래스·스크립트 로직은
절대 건드리지 않는다(읽기 전용).

사용: python i18n/extract.py apps/타로_심리카드_test.html tarot
"""
import json, os, re, sys

HANGUL = re.compile(r"[가-힣]")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 사용자 노출 문자열의 현실적인 상한. 압축된 JS 라이브러리(html2canvas 등)는 따옴표
# 짝이 어긋나 있어서, 4)의 문자열 리터럴 정규식이 따옴표 하나부터 한참 뒤 따옴표까지
# 수만 자를 통째로 집어삼킨다. 그 안에 한글이 하나라도 있으면 "번역 대상"으로 등록돼
# 번역 모델에 그대로 전달되고, 모델은 (정당하게) 번역을 거부해 항목 전체가 실패한다.
# 실측: 앱 86개의 정상 문자열 최대 길이는 101자, 혼입된 코드 덩어리는 24,662자였다.
MAX_TEXT = int(os.environ.get("I18N_MAX_TEXT", "800"))
dropped = []      # (kind, 길이, 앞부분) — main()에서 요약 출력


def split_scripts(html):
    """(비스크립트 조각들, 스크립트 본문들) — style은 비번역으로 제외."""
    scripts = re.findall(r"<script[^>]*>(.*?)</script>", html, re.S)
    rest = re.sub(r"<script[^>]*>.*?</script>", "\x00SCRIPT\x00", html, flags=re.S)
    rest = re.sub(r"<style[^>]*>.*?</style>", "\x00STYLE\x00", rest, flags=re.S)
    return rest, scripts


def extract(html):
    """추출 순서 고정 → 키 안정성 확보. 반환: [(kind, text, ctx), ...]"""
    found = []          # (kind, text, ctx)
    seen = set()

    def add(kind, text, ctx):
        text = text.strip()
        if not text or not HANGUL.search(text):
            return
        if len(text) > MAX_TEXT:      # 코드 덩어리 오탐 — 번역 대상 아님
            dropped.append((kind, len(text), text[:60].replace("\n", " ")))
            return
        if text in seen:
            return
        seen.add(text)
        found.append((kind, text, ctx[:60].replace("\n", " ")))

    # 1) title / meta
    m = re.search(r"<title>(.*?)</title>", html, re.S)
    if m:
        add("title", m.group(1), "<title>")
    for mm in re.finditer(r'<meta[^>]+content="([^"]*)"[^>]*>', html):
        add("meta", mm.group(1), mm.group(0)[:50])

    rest, scripts = split_scripts(html)

    # 2) HTML 텍스트 노드 (태그 사이 텍스트)
    for mm in re.finditer(r">([^<>]+)<", rest):
        add("html", mm.group(1), rest[max(0, mm.start() - 40):mm.start()])

    # 3) 속성 (placeholder, aria-*, alt)
    for mm in re.finditer(r'(placeholder|aria-label|alt)="([^"]*)"', rest):
        add("attr", mm.group(2), mm.group(0)[:50])

    # 4) JS 문자열 리터럴
    strlit = re.compile(r'(["\'])((?:\\.|(?!\1).)*?)\1')
    for s in scripts:
        for mm in strlit.finditer(s):
            add("js", mm.group(2), s[max(0, mm.start() - 40):mm.start()])

    # 5) JS 백틱 템플릿 리터럴 등 나머지 한글 런(run) — 따옴표 문자열 제거 후 스캔
    run = re.compile(r"[가-힣][가-힣0-9 ,.!?…·%~—\-]*")
    for s in scripts:
        cleaned = strlit.sub(" ", s)
        cleaned = re.sub(r"/\*[\s\S]*?\*/", " ", cleaned)      # 블록 주석 제외
        cleaned = re.sub(r"(?m)^\s*//[^\n]*", " ", cleaned)    # 행 주석 제외
        for mm in run.finditer(cleaned):
            add("jst", mm.group(0), cleaned[max(0, mm.start() - 40):mm.start()])
    return found


def main():
    if len(sys.argv) < 3:
        print("사용: extract.py <원본.html> <앱슬러그>"); sys.exit(1)
    src, slug = sys.argv[1], sys.argv[2]
    html = open(src, encoding="utf-8").read()
    found = extract(html)

    counters = {}
    out = {"_meta": {"source": src.replace("\\", "/"), "slug": slug}}

    # 기존 ko.json의 수동 키(manual_*)는 보존 — 내부 토큰(data-*값 등) 수기 등록용
    dst_dir = os.path.join(ROOT, "i18n", "strings", slug)
    prev_path = os.path.join(dst_dir, "ko.json")
    if os.path.isfile(prev_path):
        prev = json.load(open(prev_path, encoding="utf-8"))
        for k, v in prev.items():
            if k.startswith("manual_"):
                out[k] = v
    for kind, text, ctx in found:
        counters[kind] = counters.get(kind, 0) + 1
        key = f"{kind}_{counters[kind]:03d}"
        out[key] = {"t": text, "ctx": ctx}

    dst_dir = os.path.join(ROOT, "i18n", "strings", slug)
    os.makedirs(dst_dir, exist_ok=True)
    dst = os.path.join(dst_dir, "ko.json")
    with open(dst, "w", encoding="utf-8", newline="") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"추출 {len(found)}개 → {os.path.relpath(dst, ROOT)}")
    if dropped:
        tot = sum(n for _, n, _ in dropped)
        print(f"제외 {len(dropped)}개 ({tot:,}자, {MAX_TEXT}자 초과 — 코드 덩어리로 판단):")
        for kind, n, head in dropped:
            print(f"  - {kind} {n:,}자: {head}...")


if __name__ == "__main__":
    main()
