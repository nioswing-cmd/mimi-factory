#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""미미팩토리 i18n — 폰트 서브셋 생성기 (자체 호스팅, CDN 금지 원칙).

산출 HTML에서 실제 사용되는 문자만 추려 woff2 서브셋을 만든다.
원본 폰트(TTF, OFL 라이선스)는 i18n/fonts_src/ 에 1회 다운로드해 둔다.

사용: python i18n/fontsubset.py ja ja/apps/tarot.html
필요: pip install fonttools brotli
"""
import os, re, string, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "i18n", "fonts_src")

# 언어별: (원본 TTF, 출력 woff2 이름)
FONTS = {
    "ja": [
        ("NotoSansJP[wght].ttf", "NotoSansJP-sub.woff2"),
        ("MPLUSRounded1c-Bold.ttf", "MPLUSRounded1c-Bold-sub.woff2"),
    ],
}


def used_chars(paths):
    chars = set(string.printable)
    for p in paths:
        t = open(p, encoding="utf-8").read()
        t = re.sub(r"<style[^>]*>.*?</style>", "", t, flags=re.S)  # CSS 제외
        chars |= set(t)
    chars |= set("「」『』（）。、・…％→←↑↓")  # 안전 여분
    return "".join(sorted(c for c in chars if c.isprintable()))


def main():
    if len(sys.argv) < 3:
        print("사용: fontsubset.py <언어> <산출HTML...>"); sys.exit(1)
    lang, htmls = sys.argv[1], sys.argv[2:]
    text = used_chars([os.path.join(ROOT, h) for h in htmls])
    txt_path = os.path.join(SRC, f"_chars_{lang}.txt")
    os.makedirs(SRC, exist_ok=True)
    open(txt_path, "w", encoding="utf-8", newline="").write(text)

    out_dir = os.path.join(ROOT, lang, "fonts")
    os.makedirs(out_dir, exist_ok=True)
    for src_name, out_name in FONTS[lang]:
        src = os.path.join(SRC, src_name)
        if not os.path.isfile(src):
            sys.exit(f"원본 폰트 없음: {src} — i18n/fonts_src/에 내려받아 주세요")
        out = os.path.join(out_dir, out_name)
        subprocess.run([sys.executable, "-m", "fontTools.subset", src,
                        f"--text-file={txt_path}",
                        "--flavor=woff2", f"--output-file={out}",
                        "--layout-features=*", "--no-hinting"], check=True)
        print(f"{out_name}: {os.path.getsize(out)//1024}KB ({len(text)}자 서브셋)")


if __name__ == "__main__":
    main()
