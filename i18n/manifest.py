#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""미미팩토리 i18n — 언어별 앱 매니페스트({lang}/apps.json) 생성.

i18n/strings/*/{lang}.json 중 "_app" 블록이 있는 앱만 모아
로컬라이즈 랜딩이 읽는 {lang}/apps.json 을 만든다.
색·유형·날짜는 ko apps.json 의 같은 슬러그(원본 id) 항목에서 승계한다.

{lang}.json 의 "_app" 형식:
  "_app": { "id": "타로_심리카드", "file": "tarot", "title": "…", "desc": "…" }
  - id   : ko apps.json 의 원본 id (색·유형 승계용)
  - file : /{lang}/apps/{file}.html 산출 파일명

사용: python i18n/manifest.py ja  (또는 en, zh-tw, all)
"""
import datetime, glob, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANGS = ("ja", "en", "zh-tw")


def build_one(lang):
    ko_manifest = json.load(open(os.path.join(ROOT, "apps.json"), encoding="utf-8"))
    by_id = {a["id"]: a for a in ko_manifest["apps"]}
    entries = []
    for path in sorted(glob.glob(os.path.join(ROOT, "i18n", "strings", "*", f"{lang}.json"))):
        j = json.load(open(path, encoding="utf-8"))
        app = j.get("_app")
        if not app:
            continue
        base = by_id.get(app.get("id"), {})
        f = app.get("file") or os.path.basename(os.path.dirname(path))
        entries.append({
            "id": f,
            "type": base.get("type", "test"),
            "title": app["title"],
            "author": "MIMI FACTORY",
            "date": base.get("date", datetime.date.today().isoformat()),
            "color1": base.get("color1", "#7aa6ff"),
            "color2": base.get("color2", "#b78bf5"),
            "teaser": f"apps/{f}.html",
            "premium": f"apps/{f}.html",
            "desc": app.get("desc", ""),
        })
    out_dir = os.path.join(ROOT, lang)
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "apps.json")
    with open(out, "w", encoding="utf-8", newline="") as fp:
        json.dump({"apps": entries, "updated": datetime.date.today().isoformat()},
                  fp, ensure_ascii=False, indent=1)
    print(f"{lang}/apps.json — {len(entries)}개 앱")


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "all"
    for lg in (LANGS if target == "all" else [target]):
        build_one(lg)
