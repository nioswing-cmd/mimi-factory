# -*- coding: utf-8 -*-
"""일회용: 손병호게임_friend 재추출로 밀린 js_* 키를 옛 번역과 값 매칭으로 재정렬하고,
신규 2문구(라운드 종료 판정 패치)는 직접 번역 주입. 실행 후 batch.py --force 재실행."""
import json, subprocess, collections

SLUG = "손병호게임_friend"
D = f"i18n/strings/{SLUG}"

new_ko = json.load(open(f"{D}/ko.json", encoding="utf-8"))
old_raw = subprocess.run(["git", "show", f"HEAD:{D}/ko.json"], capture_output=True).stdout
old_ko = json.loads(old_raw.decode("utf-8"))

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

def val(v):
    return v["t"] if isinstance(v, dict) else v

for lang in ["ja", "en", "zh-tw"]:
    old_tr = json.load(open(f"{D}/{lang}.json", encoding="utf-8"))
    by_val = collections.defaultdict(list)
    for k, v in old_ko.items():
        if k.startswith("_"):
            continue
        by_val[val(v)].append(k)
    out, miss = {}, []
    for k, v in new_ko.items():
        if k.startswith("_"):
            if k in old_tr:
                out[k] = old_tr[k]
            continue
        ok = None
        cand = by_val.get(val(v), [])
        while cand:
            c = cand.pop(0)
            if c in old_tr:
                ok = c
                break
        if ok is not None:
            out[k] = old_tr[ok]
        else:
            hit = next((tr[lang] for pat, tr in NEW_TR.items() if pat in val(v)), None)
            if hit is not None:
                out[k] = hit
            else:
                miss.append((k, val(v)[:40]))
    json.dump(out, open(f"{D}/{lang}.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(lang, "keys:", len(out), "unmatched:", miss)
