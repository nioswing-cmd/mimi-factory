#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
미미팩토리 — 티저 일괄 제작 (1회성 배치)
─────────────────────────────────────────
티저가 없는 독서퀴즈(teaser == premium인 quiz 항목)를 찾아,
기존 본편 HTML을 원본으로 티저 버전을 순차 생성한다.

사용: python3 scripts/make_teasers.py          # 전체
      python3 scripts/make_teasers.py --limit 2  # 앞 2권만 (시험용)

정기 생산(build_from_sheet.py)이 돌고 있으면 끝날 때까지 기다렸다가 진행.
전부 끝나면 apps.json의 teaser 경로를 갱신하고 commit/push 한다.
"""

import argparse, json, os, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS_DIR = os.path.join(ROOT, "apps")
MANIFEST = os.path.join(ROOT, "apps.json")
OUT_DIR = os.path.join(ROOT, "output")


def log(msg):
    print(f"[티저배치] {msg}", flush=True)


def wait_for_idle():
    """정기 생산이 돌고 있으면 끝날 때까지 대기 (충돌 방지)."""
    waited = False
    while True:
        r = subprocess.run(["pgrep", "-f", "[b]uild_from_sheet.py"], capture_output=True)
        if r.returncode != 0:
            break
        if not waited:
            log("정기 생산 진행 중 — 끝날 때까지 대기…"); waited = True
        time.sleep(120)
    if waited:
        log("정기 생산 종료 확인 — 배치 재개")


def targets():
    m = json.load(open(MANIFEST, encoding="utf-8"))
    out = []
    for a in m["apps"]:
        if a["type"] == "quiz" and a["teaser"] == a["premium"]:
            slug = a["id"]
            if os.path.isfile(os.path.join(APPS_DIR, f"{slug}_quiz.html")):
                out.append(slug)
    return out


def make_one(slug):
    src = f"apps/{slug}_quiz.html"
    dst = os.path.join(OUT_DIR, f"{slug}_teaser.html")
    prompt = (
        f"quiz-to-read-a-book 스킬의 수익화 빌드(teaser 모드) 규칙으로, "
        f"기존 완성본 {src} 를 원본으로 삼아 무료 티저 버전을 만들어줘. "
        f"원본의 콘텐츠·문항·디자인·팔레트를 그대로 유지하되: "
        f"무료로 풀 수 있는 문항은 앞 10개, 이후 잠금 오버레이, 리포트는 부분 공개(블러+CTA), "
        f"잠금 이후 구간의 정답·해설 데이터는 번들에서 제거(티저 빌드 보안 규칙). "
        f"APP_CONFIG의 subscribeUrl/catalogUrl 값은 원본 그대로. "
        f"완성 파일은 반드시 {OUT_DIR}/{slug}_teaser.html 에 저장해. "
        f"스킬의 verify_quiz.py 검증(teaser 모드)을 통과시켜."
    )
    cmd = ["claude", "-p", prompt, "--dangerously-skip-permissions", "--max-turns", "100"]
    model = os.environ.get("CLAUDE_MODEL", "").strip()
    if model:
        cmd += ["--model", model]
    log(f"{slug} — 티저 생성 시작 (모델: {model or '기본'})")
    try:
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=2400)
    except subprocess.TimeoutExpired:
        log(f"{slug} — 40분 초과, 건너뜀"); return False
    if r.returncode != 0 or not os.path.isfile(dst):
        log(f"{slug} — 실패 (코드 {r.returncode}) stderr: {r.stderr[-300:]} stdout: {r.stdout[-300:]}")
        return False
    log(f"{slug} — ✅ 완료 ({os.path.getsize(dst)//1024}KB)")
    return True


def publish(done):
    """완성된 티저를 apps/로 옮기고 apps.json 갱신 후 commit/push."""
    if not done:
        log("성공한 티저가 없어 배포 생략"); return
    subprocess.run(["git", "pull", "--rebase"], cwd=ROOT)
    m = json.load(open(MANIFEST, encoding="utf-8"))
    for slug in done:
        os.replace(os.path.join(OUT_DIR, f"{slug}_teaser.html"),
                   os.path.join(APPS_DIR, f"{slug}_teaser.html"))
        for a in m["apps"]:
            if a["id"] == slug:
                a["teaser"] = f"apps/{slug}_teaser.html"
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=2)
    subprocess.run(["git", "add", "apps/", "apps.json"], cwd=ROOT)
    subprocess.run(["git", "commit", "-m", f"🎫 티저 일괄 제작 ({len(done)}권): " + ", ".join(done)], cwd=ROOT)
    subprocess.run(["git", "push"], cwd=ROOT)
    log(f"배포 완료 — {len(done)}권 티저 반영")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    todo = targets()
    if args.limit:
        todo = todo[:args.limit]
    log(f"대상 {len(todo)}권: {', '.join(todo)}")

    done = []
    for slug in todo:
        wait_for_idle()
        if make_one(slug):
            done.append(slug)
    publish(done)
    log(f"배치 종료 — 성공 {len(done)}/{len(todo)}")
    if len(done) < len(todo):
        sys.exit(1)


if __name__ == "__main__":
    main()
