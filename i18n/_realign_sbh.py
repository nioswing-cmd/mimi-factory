# -*- coding: utf-8 -*-
"""일회용 v2: 손병호게임_friend 언어 json 재구성.
HEAD에 커밋된 (ko.json, {lang}.json) 정합 쌍을 '값→번역' 메모리로 삼아,
새로 추출한 ko.json의 키에 값 매칭으로 번역을 재배치한다.
신규 문구 2개(라운드 종료 판정 패치)는 직접 번역 주입. 실행 후 batch.py --force."""
import json
import subprocess
import sys

SLUG = "손병호게임_friend"
D = f"i18n/strings/{SLUG}"


def val(v):
    return v["t"] if isinstance(v, dict) else v


def head(path):
    raw = subprocess.run(["git", "show", f"HEAD:{path}"], capture_output=True).stdout
    return json.loads(raw.decode("utf-8"))


NEW_TR = {
    "상대도 마저 답해요": {
        "ja": " 指を5本ぜんぶ折りました！👑 相手の答えも待ちましょう",
        "en": " folded all five! 👑 Wait for the other player’s answer",
        "zh-tw": " 五根手指全部收起來了！👑 也等等對方的回答",
    },
    "둘 다 솔직왕": {
        "ja": "ふたりとも5本の指をぜんぶ折りました。<br>今日は<b style=\"color:var(--point)\">ふたりとも正直王</b>💗",
        "en": "You both folded all five fingers.<br>Today you’re <b style=\"color:var(--point)\">both Honesty Kings</b> 💗",
        "zh-tw": "兩個人都把五根手指收完了。<br>今天<b style=\"color:var(--point)\">兩位都是誠實王</b>💗",
    },
}

# 1) 새로 추출 (영문화된 주석이 반영된 소스 기준)
r = subprocess.run([sys.executable, "-X", "utf8", "i18n/extract.py",
                    f"apps/{SLUG}.html", SLUG])
if r.returncode != 0:
    sys.exit("추출 실패")
new_ko = json.load(open(f"{D}/ko.json", encoding="utf-8"))
old_ko = head(f"{D}/ko.json")

for lang in ["ja", "en", "zh-tw"]:
    old_tr = head(f"{D}/{lang}.json")
    mem = {}
    for k, v in old_ko.items():
        if k.startswith("_") or k not in old_tr:
            continue
        mem.setdefault(val(v), old_tr[k])
    out, miss = {}, []
    for k, v in new_ko.items():
        if k.startswith("_"):
            continue
        t = val(v)
        if t in mem:
            out[k] = mem[t]
        else:
            hit = next((tr[lang] for pat, tr in NEW_TR.items() if pat in t), None)
            if hit is not None:
                out[k] = hit
            else:
                miss.append((k, t[:40]))
    if "_app" in old_tr:
        out["_app"] = old_tr["_app"]
    json.dump(out, open(f"{D}/{lang}.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(lang, "keys:", len(out), "unmatched:", miss)
