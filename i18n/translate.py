#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""미미팩토리 i18n — 번역(로컬라이즈) 하네스.

VPS 자동화 단계에서 claude CLI(구독 토큰)로 ko.json → {lang}.json 을 만든다.
파일럿/수동 단계에서는 세션의 Claude가 직접 {lang}.json 을 작성해도 된다
(같은 프롬프트 규칙: i18n/prompts/{lang}.md).

사용: python i18n/translate.py tarot ja
"""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    if len(sys.argv) < 3:
        print("사용: translate.py <슬러그> <언어>"); sys.exit(1)
    slug, lang = sys.argv[1], sys.argv[2]
    d = os.path.join(ROOT, "i18n", "strings", slug)
    ko_path = os.path.join(d, "ko.json")
    out_path = os.path.join(d, f"{lang}.json")
    prompt_md = open(os.path.join(ROOT, "i18n", "prompts", f"{lang}.md"), encoding="utf-8").read()
    glossary = open(os.path.join(ROOT, "i18n", "glossary.json"), encoding="utf-8").read()
    ko = open(ko_path, encoding="utf-8").read()

    prompt = (
        "다음은 미미팩토리 웹앱의 한국어 문자열 JSON이다. 아래 로컬라이즈 규칙과 "
        "용어집을 정확히 지켜, 같은 키 구조의 번역 JSON을 만들어 "
        f"{out_path} 경로에 저장하라. 값은 문자열로만( {{\"key\": \"번역\"}} 형식, _meta 는 제외). "
        "원문 안의 <b>·<br> 태그와 이모지는 보존하고, 곧은따옴표(\"')와 백슬래시는 쓰지 마라.\n\n"
        f"[로컬라이즈 규칙]\n{prompt_md}\n\n[용어집 — 임의 변경 금지]\n{glossary}\n\n[ko.json]\n{ko}"
    )
    r = subprocess.run(["claude", "-p", prompt, "--dangerously-skip-permissions",
                        "--max-turns", "30"], cwd=ROOT, capture_output=True, text=True, timeout=1800)
    if r.returncode != 0 or not os.path.exists(out_path):
        print(r.stdout[-2000:]); print(r.stderr[-1000:])
        sys.exit("번역 실패")
    json.load(open(out_path, encoding="utf-8"))  # 유효성
    print(f"번역 완료 → {os.path.relpath(out_path, ROOT)}")


if __name__ == "__main__":
    main()
