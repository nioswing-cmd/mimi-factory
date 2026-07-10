#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""통계와 나 — 문항별 실제 출처 검증 배치 (1회성)
BANK 100문항을 10개 단위로 Claude(웹검색)에 보내 실제 조사 출처를 검증하고,
확인된 것만 src를 달아 앱 파일의 BANK를 갱신한다. 불확실한 출처는 절대 추가하지 않는다."""
import json, os, re, subprocess, sys, time

ROOT = "/home/mimi/mimi-factory"
APP = os.path.join(ROOT, "apps", "통계와_나_test.html")
OUT = os.path.join(ROOT, "output")

def log(m): print(f"[출처검증] {m}", flush=True)

def wait_idle():
    while subprocess.run(["pgrep","-f","[b]uild_from_sheet.py"],capture_output=True).returncode==0:
        log("정기 생산 진행 중 — 대기"); time.sleep(120)

def load_bank():
    t = open(APP, encoding="utf-8").read()
    m = re.search(r"const BANK=(\[[\s\S]*?\n\]);", t)
    # JS 배열 → JSON (홑따옴표 없음, 이미 JSON 호환)
    return json.loads(m.group(1)), t, m.span(1)

def run_chunk(n, chunk):
    dst = os.path.join(OUT, f"srcchunk_{n}.json")
    if os.path.exists(dst): os.remove(dst)
    prompt = (
        "아래는 한국 대중 취향/습관에 대한 이지선다 통계 문항들이다(JSON 배열, 각 항목 [카테고리, 질문, [[선택지,퍼센트],...]]). "
        "각 문항에 대해 web_search로 실제 한국 설문조사·여론조사·공공통계를 찾아 검증해라. 규칙: "
        "(1) 신뢰할 수 있는 실제 조사(기관명·연도 확인 가능)를 찾은 경우에만 4번째 요소로 출처 문자열을 추가한다. 형식: '기관명 연도' 또는 '기관명 연도 조사명'. "
        "(2) 실제 조사 수치가 현재 값과 8%p 이상 다르면 실제 조사값(정수, 합계 100 근처)으로 교체한다. "
        "(3) 확실히 확인되지 않으면 출처를 절대 추가하지 말고 항목을 원본 그대로 둔다. 출처를 지어내는 것은 최악의 실패다. "
        "(4) 문항 수·순서·형식을 유지하고, 결과 전체를 유효한 JSON 배열로만 "
        f"{dst} 파일에 저장해라(설명 텍스트 없이 JSON만). 문항들: " + json.dumps(chunk, ensure_ascii=False)
    )
    cmd=["claude","-p",prompt,"--dangerously-skip-permissions","--max-turns","80"]
    model=os.environ.get("CLAUDE_MODEL","").strip()
    if model: cmd+=["--model",model]
    try:
        r=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=2400)
    except subprocess.TimeoutExpired:
        log(f"{n}차 — 시간 초과, 원본 유지"); return chunk
    if not os.path.exists(dst):
        log(f"{n}차 — 결과 파일 없음(코드 {r.returncode}), 원본 유지"); return chunk
    try:
        got=json.load(open(dst,encoding="utf-8"))
        assert isinstance(got,list) and len(got)==len(chunk)
        for it in got:
            assert isinstance(it,list) and len(it) in (3,4) and isinstance(it[2],list)
        srced=sum(1 for it in got if len(it)==4)
        log(f"{n}차 — 검증 완료, 출처 확보 {srced}/{len(chunk)}")
        return got
    except Exception as e:
        log(f"{n}차 — 결과 검증 실패({e}), 원본 유지"); return chunk

def main():
    os.makedirs(OUT,exist_ok=True)
    bank, t, span = load_bank()
    log(f"대상 {len(bank)}문항, 10문항씩 처리")
    result=[]
    for n in range(0, len(bank), 10):
        wait_idle()
        result += run_chunk(n//10+1, bank[n:n+10])
    total_src=sum(1 for it in result if len(it)==4)
    log(f"전체 완료 — 출처 확보 {total_src}/{len(result)}문항")
    # BANK 재조립 (한 줄씩 보기 좋게)
    lines=",\n ".join(json.dumps(it,ensure_ascii=False) for it in result)
    new_bank="[\n "+lines+"\n]"
    subprocess.run(["git","pull","--rebase"],cwd=ROOT)
    t = open(APP, encoding="utf-8").read()  # rebase 후 재로드
    m = re.search(r"const BANK=(\[[\s\S]*?\n\]);", t)
    t = t[:m.start(1)] + new_bank + t[m.end(1):]
    open(APP,"w",encoding="utf-8").write(t)
    subprocess.run(["git","add","apps/"],cwd=ROOT)
    subprocess.run(["git","commit","-m",f"📚 통계와 나: 문항 출처 검증 배치 결과 반영 (출처 확보 {total_src}/100)"],cwd=ROOT)
    subprocess.run(["git","push"],cwd=ROOT)
    log("배포 완료")

main()
