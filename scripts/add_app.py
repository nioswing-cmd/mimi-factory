#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
미미팩토리 — 완성된 앱 간편 등록 도구
─────────────────────────────────────
이미 만들어진 HTML 앱을 홈페이지에 등록합니다.

사용법 1 (대화형 — 추천):
    python scripts/add_app.py
    → 질문에 답하면 끝. 파일 경로는 탐색기에서 파일을 터미널로 드래그하면 됩니다.

사용법 2 (한 줄):
    python scripts/add_app.py "경로/파일.html" --title "제목" --author "작가" --type quiz

하는 일:
 1. HTML 파일을 apps/ 폴더로 복사 (티저 파일이 있으면 함께)
 2. apps.json에 카드 항목 추가 (같은 id가 있으면 교체)
 3. git commit + push → 1~2분 뒤 홈페이지에 카드 등장
"""

import argparse, json, os, re, shutil, subprocess, sys
from datetime import datetime, timezone, timedelta

# Windows 콘솔(cp949)에서도 이모지·한글이 깨지지 않도록
for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

KST = timezone(timedelta(hours=9))
TODAY = datetime.now(KST).strftime("%Y-%m-%d")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS_DIR = os.path.join(ROOT, "apps")
MANIFEST = os.path.join(ROOT, "apps.json")

# build_from_sheet.py와 동일한 카드 색 순환
PALETTES = [
    ("#7aa6ff", "#b78bf5"), ("#5ee7d8", "#7aa6ff"), ("#ff8ad0", "#b78bf5"),
    ("#ffd36e", "#ff8a5c"), ("#8affc1", "#5ee7d8"), ("#c3a1ff", "#ff8ad0"),
]


def slugify(title):
    s = re.sub(r"[^\w가-힣]+", "_", title).strip("_").lower()
    return s or "app"


def clean_path(p):
    """드래그앤드롭 시 붙는 따옴표 제거"""
    return p.strip().strip('"').strip("'")


def ask(question, default=""):
    hint = f" [{default}]" if default else ""
    try:
        answer = input(f"{question}{hint}: ").strip()
    except EOFError:
        return default
    return answer or default


def main():
    ap = argparse.ArgumentParser(description="완성된 앱을 홈페이지에 등록")
    ap.add_argument("html", nargs="?", help="등록할 HTML 파일 경로")
    ap.add_argument("--teaser", help="티저(무료 미리보기) HTML 경로 (선택)")
    ap.add_argument("--title", help="앱 제목")
    ap.add_argument("--author", help="작가/설명")
    ap.add_argument("--desc", help="카드에 표시할 한 줄 소개")
    ap.add_argument("--type", choices=["quiz", "test", "friend"],
                    help="quiz(독서퀴즈) / test(진단테스트) / friend(친해지기)")
    ap.add_argument("--no-push", action="store_true", help="GitHub 업로드 생략 (로컬 등록만)")
    args = ap.parse_args()

    print("🏭 미미팩토리 앱 등록 도우미")
    print("─" * 40)

    # ── 입력 수집 (없는 항목만 물어봄) ──
    html = clean_path(args.html or ask("등록할 HTML 파일 (터미널에 드래그)"))
    if not os.path.isfile(html):
        print(f"❌ 파일을 찾을 수 없습니다: {html}"); sys.exit(1)

    title = args.title or ask("앱 제목 (예: 데미안)")
    if not title:
        print("❌ 제목은 필수입니다."); sys.exit(1)

    atype = args.type or {"2": "test", "3": "friend"}.get(
        ask("종류 — 1: 독서퀴즈, 2: 진단테스트, 3: 친해지기", "1"), "quiz")
    author = args.author or ask("작가/설명 (예: 헤르만 헤세)", "미미팩토리 오리지널")
    desc = args.desc or ask("카드 한 줄 소개 (엔터 = 자동)", f"{title} — 미미팩토리")

    # CLI로 파일을 지정했으면 티저는 --teaser 옵션으로만 받는다 (대화형일 때만 질문)
    teaser_src = clean_path(args.teaser or ("" if args.html else ask("티저 HTML 경로 (없으면 엔터)")))
    if teaser_src and not os.path.isfile(teaser_src):
        print(f"❌ 티저 파일을 찾을 수 없습니다: {teaser_src}"); sys.exit(1)

    # ── 파일 복사 ──
    slug = slugify(title)
    os.makedirs(APPS_DIR, exist_ok=True)
    main_name = f"{slug}_{atype}.html"
    shutil.copy2(html, os.path.join(APPS_DIR, main_name))
    teaser_name = None
    if teaser_src:
        teaser_name = f"{slug}_teaser.html"
        shutil.copy2(teaser_src, os.path.join(APPS_DIR, teaser_name))

    # ── apps.json 갱신 ──
    with open(MANIFEST, encoding="utf-8") as f:
        m = json.load(f)
    c1, c2 = PALETTES[len(m["apps"]) % len(PALETTES)]
    entry = {
        "id": slug,
        "type": atype,
        "title": title,
        "author": author,
        "date": TODAY,
        "color1": c1, "color2": c2,
        "teaser": f"apps/{teaser_name or main_name}",
        "premium": f"apps/{main_name}",
        "desc": desc[:80],
    }
    m["apps"] = [a for a in m["apps"] if a["id"] != slug] + [entry]
    m["updated"] = TODAY
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=2)
    print(f"✅ 등록 완료: {title} → apps/{main_name}" + (f" (+티저)" if teaser_name else ""))

    # ── git 업로드 ──
    if args.no_push:
        print("ℹ️ --no-push: GitHub 업로드는 생략했습니다. 직접 commit/push 하세요.")
        return
    try:
        subprocess.run(["git", "add", "apps/", "apps.json"], cwd=ROOT, check=True)
        r = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT)
        if r.returncode == 0:
            print("ℹ️ 변경 사항이 없어 업로드를 생략합니다."); return
        subprocess.run(["git", "commit", "-m", f"📦 수동 등록: {title}"], cwd=ROOT, check=True)
        subprocess.run(["git", "push"], cwd=ROOT, check=True)
        print("🚀 GitHub 업로드 완료! 1~2분 뒤 홈페이지에 카드가 나타납니다.")
        print("   https://nioswing-cmd.github.io/mimi-factory/")
    except subprocess.CalledProcessError as e:
        print(f"❌ git 업로드 실패: {e}\n   등록 자체는 완료됐으니 나중에 commit/push만 하면 됩니다.")
        sys.exit(1)


if __name__ == "__main__":
    main()
