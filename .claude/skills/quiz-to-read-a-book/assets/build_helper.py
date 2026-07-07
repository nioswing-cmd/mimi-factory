#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_helper.py — 퀴즈로읽는책 안전 빌더 (v1.8)

reference-template.html 을 fresh copy 한 뒤, 데이터 블록(const X = [...]/{...})과
홈/리포트 고유 텍스트만 1회 교체한다. 디자인·엔진·푸터·인라인 번들은 절대 손대지 않는다.

사용 패턴 (Claude가 이 모듈을 import 해서 호출):

    from build_helper import fresh_copy, replace_block, replace_text

    html = fresh_copy(REF, OUT)                 # ① 항상 새 복사본에서 시작
    html = replace_block(html, "QUESTIONS", new_questions, "[", "]")
    html = replace_block(html, "SOURCES",   new_sources,   "{", "}")
    ... (EXTRA, MILESTONES, CONCEPTS, TOC, CASES, ASKS)
    html = replace_text(html, [(old1, new1), (old2, new2), ...])  # 홈/리포트 카피
    save(html, OUT)

규칙 (SKILL.md '흔한 함정과 안전 빌드 절차'와 1:1 대응):
  ① 곡선따옴표 보존 — old 문자열은 템플릿에서 그대로 복사. replace_text가 매칭 실패를 보고.
  ② SOURCES.ebs 키 필수 유지 (verify_quiz.py ④에서 재확인).
  ③ 데이터 블록은 bracket-depth 파싱으로 교체 (문자열 내부 괄호/따옴표 무시).
  ④ 반드시 fresh_copy 에서 시작, 각 블록 1회만 교체.
"""
import shutil


def fresh_copy(ref_path: str, out_path: str) -> str:
    """① reference-template.html 을 out_path 로 새로 복사하고 내용을 반환."""
    shutil.copy(ref_path, out_path)
    with open(out_path, "r", encoding="utf-8") as f:
        return f.read()


def replace_block(html: str, var_name: str, new_code: str,
                  open_ch: str = "[", close_ch: str = "]") -> str:
    """③ const VAR = [ ... ];  블록을 bracket-depth 파싱으로 정확히 교체.

    new_code 는 'const VAR = [...];' 전체(세미콜론 포함)를 담아야 한다.
    문자열 리터럴(" ' `) 내부의 괄호는 깊이 계산에서 제외한다.
    """
    marker = f"const {var_name} ="
    idx = html.rfind(marker)  # 번들 뒤 실제 코드의 선언(보통 1개지만 안전하게 마지막)
    if idx == -1:
        raise RuntimeError(f"[replace_block] NOT FOUND: {marker}")

    open_pos = html.find(open_ch, idx)
    if open_pos == -1:
        raise RuntimeError(f"[replace_block] open bracket missing for {var_name}")

    depth = 0
    i = open_pos
    in_str = False
    str_ch = ""
    while i < len(html):
        c = html[i]
        if in_str:
            if c == "\\":
                i += 2
                continue
            if c == str_ch:
                in_str = False
        else:
            if c in ('"', "'", "`"):
                in_str = True
                str_ch = c
            elif c == open_ch:
                depth += 1
            elif c == close_ch:
                depth -= 1
                if depth == 0:
                    end = i + 1
                    semi = html.find(";", end)
                    block_end = semi + 1 if (semi != -1 and semi - end < 3) else end
                    return html[:idx] + new_code.strip() + html[block_end:]
        i += 1
    raise RuntimeError(f"[replace_block] unbalanced brackets for {var_name}")


def replace_text(html: str, pairs, strict: bool = True) -> str:
    """① 홈/리포트 고유 텍스트 교체. pairs = [(old, new), ...]

    old 는 템플릿에서 그대로 복사해 곡선따옴표를 보존할 것.
    strict=True 면 매칭 실패한 항목을 RuntimeError 로 보고(조용한 실패 방지).
    """
    missing = []
    for old, new in pairs:
        if old in html:
            html = html.replace(old, new)
        else:
            missing.append(old[:60])
    if missing and strict:
        msg = "\n".join(f"  - {m}" for m in missing)
        raise RuntimeError(f"[replace_text] 매칭 실패(곡선따옴표 확인):\n{msg}")
    return html


def assert_clean_start(html: str):
    """④ 빌드 시작 직후, 새 복사본이 오염되지 않았는지 확인(홈 화면 1개)."""
    n = html.count('class="hero"')
    if n != 1:
        raise RuntimeError(f"[assert_clean_start] hero={n} (1이어야 함). 오염된 파일에서 시작됨.")


def save(html: str, out_path: str):
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
