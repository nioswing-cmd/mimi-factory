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


if __name__ == "__main__":
    main()
