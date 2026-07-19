#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""미미팩토리 i18n — 언어별 HTML 빌더.

원본 HTML의 사본(shutil.copy)에서 작업한다. 원본은 절대 수정하지 않는다.
ko.json + {lang}.json 을 읽어 문자열을 치환하고(긴 것부터),
lang 속성·폰트·CSS(keep-all)·경로를 언어에 맞게 바꿔
/{lang}/apps/{out}.html 로 출력한다.

사용: python i18n/build.py tarot ja [출력파일명(기본 slug)]
"""
import json, os, re, shutil, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FONT_FACE = {
    "ja": """<style id="i18nFonts">
/* self-hosted subset fonts (OFL) — reuse original family names */
@font-face{font-family:'Noto Sans KR';src:url('{FP}NotoSansJP-sub.woff2') format('woff2');font-weight:100 900;font-display:swap;}
@font-face{font-family:'Jua';src:url('{FP}MPLUSRounded1c-Bold-sub.woff2') format('woff2');font-weight:400;font-display:swap;}
</style>""",
    "en": """<style id="i18nFonts">
/* self-hosted subset fonts (OFL) — reuse original family names */
@font-face{font-family:'Noto Sans KR';src:url('{FP}NotoSans-sub.woff2') format('woff2');font-weight:100 900;font-display:swap;}
@font-face{font-family:'Jua';src:url('{FP}Fredoka-sub.woff2') format('woff2');font-weight:100 900;font-display:swap;}
</style>""",
    "zh-tw": """<style id="i18nFonts">
/* self-hosted subset fonts (OFL) — reuse original family names */
@font-face{font-family:'Noto Sans KR';src:url('{FP}NotoSansTC-sub.woff2') format('woff2');font-weight:100 900;font-display:swap;}
@font-face{font-family:'Jua';src:url('{FP}NotoSansTC-sub.woff2') format('woff2');font-weight:700;font-display:swap;}
</style>""",
}


def load(slug, lang):
    d = os.path.join(ROOT, "i18n", "strings", slug)
    ko = json.load(open(os.path.join(d, "ko.json"), encoding="utf-8"))
    tr = json.load(open(os.path.join(d, f"{lang}.json"), encoding="utf-8"))
    return ko, tr


def validate(ko, tr):
    ko_keys = {k for k in ko if not k.startswith("_")}
    tr_keys = {k for k in tr if not k.startswith("_")}
    missing = ko_keys - tr_keys
    extra = tr_keys - ko_keys
    if missing or extra:
        raise SystemExit(f"키 불일치 — 누락 {sorted(missing)[:5]} / 잉여 {sorted(extra)[:5]}")
    for k in ko_keys:
        t = tr[k] if isinstance(tr[k], str) else tr[k].get("t", "")
        for ch in ('"', "'", "\\"):
            if ch in t and ch not in ko[k]["t"]:
                raise SystemExit(f"{k}: 번역문에 원문에 없는 {ch!r} 포함 — 「」로 바꿔주세요: {t[:40]}")


def build(slug, lang, outname=None):
    ko, tr = load(slug, lang)
    validate(ko, tr)
    src = os.path.join(ROOT, ko["_meta"]["source"])
    outname = outname or slug

    # 사본에서 작업 (원본 불변)
    tmp = os.path.join(tempfile.gettempdir(), f"i18n_{slug}_{lang}.html")
    shutil.copy(src, tmp)
    html = open(tmp, encoding="utf-8").read()

    # 1) 문자열 치환 — 긴 원문부터 (부분 문자열 충돌 방지)
    pairs = []
    for k, v in ko.items():
        if k.startswith("_"):
            continue
        t = tr[k] if isinstance(tr[k], str) else tr[k]["t"]
        pairs.append((v["t"], t))
    pairs.sort(key=lambda p: -len(p[0]))
    miss = []
    for src_t, dst_t in pairs:
        if src_t not in html:
            miss.append(src_t[:30]); continue
        html = html.replace(src_t, dst_t)
    if miss:
        print(f"⚠ 원본에서 못 찾은 문자열 {len(miss)}개: {miss[:3]}")

    # 2) 한글 포함 주석 제거 (JS 블록주석·HTML 주석 — 사용자 비노출이지만 잔존 한글 방지)
    def _strip_ko_comments(m):
        return "" if re.search(r"[가-힣]", m.group(0)) else m.group(0)
    html = re.sub(r"/\*[\s\S]*?\*/", _strip_ko_comments, html)
    html = re.sub(r"<!--[\s\S]*?-->", _strip_ko_comments, html)

    # 3) lang 속성
    html = html.replace('<html lang="ko">', f'<html lang="{lang}">')

    # 3) keep-all 제거 (ja/zh-tw), en은 break-word
    if lang in ("ja", "zh-tw"):
        html = re.sub(r"word-break:\s*keep-all;?", "", html)
    elif lang == "en":
        html = re.sub(r"word-break:\s*keep-all;?", "overflow-wrap:break-word;", html)

    # 4-0) 앱/랜딩 구분 — 랜딩(리포 루트 html)은 /{lang}/ 바로 아래로
    is_landing = "apps/" not in ko["_meta"]["source"]
    font_prefix = "fonts/" if is_landing else "../fonts/"

    # 4-1) 내부 랜딩 절대링크를 언어 경로로 재작성 (앱 hall-nav 등)
    for hall in ("test", "quiz", "friend", "index"):
        html = html.replace(f"mimifactory.vibekr.com/{hall}.html",
                            f"mimifactory.vibekr.com/{lang}/{hall}.html")

    # 4-2) 구글폰트 CDN 제거 → 자체 호스팅 서브셋 @font-face
    html = re.sub(r'<link rel="preconnect"[^>]*>\s*', "", html)
    html = re.sub(r'<link href="https://fonts\.googleapis\.com[^"]*"[^>]*>\s*', "", html)
    face = FONT_FACE.get(lang)
    if face:
        face = face.replace("{FP}", font_prefix)
        i = html.find("<style>")
        assert i > 0, "<style> 블록을 찾지 못함"
        html = html[:i] + face + "\n" + html[i:]

    # 5) 출력 (repo /{lang}/... = 배포 경로)
    out_dir = os.path.join(ROOT, lang) if is_landing else os.path.join(ROOT, lang, "apps")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"{outname}.html")
    with open(out, "w", encoding="utf-8", newline="") as f:
        f.write(html)
    os.remove(tmp)
    print(f"빌드 완료 → {os.path.relpath(out, ROOT)}")
    return out


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("사용: build.py <슬러그> <언어> [출력명]"); sys.exit(1)
    build(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
