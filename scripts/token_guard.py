#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""미미팩토리 토큰 상한 «강제» 장치 — 2026-08-30 사장님 지시.

지시 원문: "미미팩토리는 토큰을 너무 잡아먹는 작업이 있으면, 작업을 멈추고 나에게
보고하도록 해. 그 앱 안만들어도 되니까.. 토큰 최적화를 위한 시스템을 항시 가동해!!!"

🔴 왜 «강제»여야 하나 (2026-08-29 에 배운 것)
   8/28 에 지시문(프롬프트)에 「조사용 서브에이전트는 10개까지만」이라고 적고
   「패치 완료」라 보고했다. 다음 날 첫 실행이 **40개**를 썼다. 1억 874만 토큰.
   ─ 프롬프트 문장은 모델에 대한 «부탁»이라 강제력이 없다.
   상한은 **코드가 거부하는 자리**에 걸어야 한다. 이 파일이 그 자리다.
   생산 중인 claude 프로세스를 실제로 죽인다.

세는 방법 — /home/mimi/.claude/projects/-home-mimi-mimi-factory/ 아래
    <세션id>.jsonl                    ← 본세션
    <세션id>/subagents/agent-*.jsonl  ← 조사 에이전트
  실행 «직전»에 있던 파일 목록을 찍어두고, 그 뒤 새로 생긴 파일만 센다.
  → 이번 생산이 쓴 토큰만 정확히 잡힌다.

🔴 집계 규칙 (mimi_token_report.py 와 동일 — 줄마다 더하면 2배 넘게 부풀려진다):
   응답 1건이 thinking/text/tool_use 별로 여러 줄에 적히고 같은 message.id 로
   똑같은 usage 사본을 들고 있다.
     · input / cache_creation / cache_read → 한 번만
     · output_tokens                        → 스트리밍 중간값이라 마지막(최댓값)만
"""
import glob
import json
import os
import sys
import time
import urllib.request

BASE = os.environ.get(
    "MMF_CLAUDE_SESSIONS",
    "/home/mimi/.claude/projects/-home-mimi-mimi-factory",
)

# ── 상한값 ────────────────────────────────────────────────
# 근거(2026-08-30 실측, 최근 30일 61권):
#   권당 중앙값 951만 · 조사 에이전트를 끈 뒤 첫 성공(8/30 그릿) 1,333만
#   본세션만 쓴 역대 최대 2,618만 (8/24) — 정상 생산은 여기까지다
#   폭주는 1억~1.5억 (8/20 자본론 1.52억 · 8/24 블랙스완 1.47억 · 8/29 1.09억)
# → 3,000만에서 끊으면 정상 생산은 한 건도 안 걸리고 폭주만 잡힌다.
BUDGET = int(os.environ.get("MMF_TOKEN_BUDGET", "30000000"))
WARN = int(os.environ.get("MMF_TOKEN_WARN", "20000000"))
POLL_SECONDS = int(os.environ.get("MMF_TOKEN_POLL", "20"))
# 재시도는 «남은 예산»으로 돈다. 이보다 적게 남았으면 아예 재시도하지 않는다.
#   (조사 결과가 남아 있는 재시도는 4.2M 로도 끝난 적이 있다 — 8/25 블랙스완)
MIN_RETRY_BUDGET = int(os.environ.get("MMF_MIN_RETRY_BUDGET", "8000000"))

# 사장님께 직접 가는 통로(클로디 봇). 연우팀장 알림은 자주 놓치신다.
CLAUDI_ENV = "/etc/claudi-alert.env"
YEONWOO_ENV = "/etc/mimi-alert.env"
LEDGER = os.environ.get("MMF_TOKEN_LEDGER", "/home/mimi/mimi-token-log.jsonl")


# ── 토큰 계수기 ───────────────────────────────────────────
class TokenGuard:
    """실행 «직전» 이후 새로 생긴 claude 세션 파일의 토큰을 이어서 센다.

    poll() 을 반복 호출해도 파일을 처음부터 다시 읽지 않는다(오프셋 기억).
    """

    def __init__(self, base=BASE):
        self.base = base
        self.baseline = self._scan()
        self.files = {}          # path -> {"off":int, "buf":bytes, "groups":{mid:[tuple,int]}}
        self.started = time.time()

    def _scan(self):
        out = set()
        out.update(glob.glob(os.path.join(self.base, "*.jsonl")))
        out.update(glob.glob(os.path.join(self.base, "*", "subagents", "*.jsonl")))
        return out

    def _feed(self, path):
        st = self.files.setdefault(path, {"off": 0, "buf": b"", "groups": {}})
        try:
            with open(path, "rb") as fh:
                fh.seek(st["off"])
                chunk = fh.read()
                st["off"] = fh.tell()
        except OSError:
            return
        if not chunk:
            return
        data = st["buf"] + chunk
        lines = data.split(b"\n")
        st["buf"] = lines.pop()          # 마지막 줄은 아직 덜 쓰였을 수 있다
        groups = st["groups"]
        for raw in lines:
            if not raw.strip():
                continue
            try:
                o = json.loads(raw)
            except Exception:
                continue
            m = o.get("message") or {}
            u = m.get("usage") or {}
            if not u:
                continue
            mid = m.get("id") or ("_" + str(len(groups)))
            g = groups.setdefault(mid, [None, 0])
            if g[0] is None:
                g[0] = (int(u.get("input_tokens") or 0),
                        int(u.get("cache_creation_input_tokens") or 0),
                        int(u.get("cache_read_input_tokens") or 0))
            g[1] = max(g[1], int(u.get("output_tokens") or 0))

    def poll(self):
        """{'total','main','sub','sub_files','responses'} 를 돌려준다."""
        for path in self._scan() - self.baseline:
            self._feed(path)
        main = sub = 0
        sub_files = 0
        responses = 0
        for path, st in self.files.items():
            tot = sum(sum(g[0]) + g[1] for g in st["groups"].values() if g[0])
            if not tot:
                continue
            if os.sep + "subagents" + os.sep in path:
                sub += tot
                sub_files += 1
            else:
                main += tot
                responses += len(st["groups"])
        return {"total": main + sub, "main": main, "sub": sub,
                "sub_files": sub_files, "responses": responses}


# ── 알림 ─────────────────────────────────────────────────
def _read_env(path):
    cfg = {}
    try:
        with open(path, encoding="utf-8-sig") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                cfg[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return cfg


def _send(token, chat, text):
    body = json.dumps({"chat_id": chat, "text": text[:3800],
                       "disable_web_page_preview": True}).encode()
    req = urllib.request.Request(
        "https://api.telegram.org/bot%s/sendMessage" % token,
        data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status == 200


def alert_boss(text):
    """사장님께 직접(클로디 봇). 못 가면 연우팀장 봇으로라도 보낸다.

    🔴 알림이 못 가면 «안 멈춘 것»과 같다 — 그래서 두 통로를 다 시도하고
       결과를 (보냈나, 어느 통로로) 로 돌려준다. 「보냈다」고 우기지 않는다.
    """
    for path, who in ((CLAUDI_ENV, "클로디"), (YEONWOO_ENV, "연우팀장")):
        cfg = _read_env(path)
        token, chat = cfg.get("TELEGRAM_BOT_TOKEN", ""), (
            cfg.get("TELEGRAM_CHAT_ID") or cfg.get("TELEGRAM_HOME_CHANNEL") or "")
        if not token or not chat:
            continue
        try:
            if _send(token, chat, text):
                return True, who
        except Exception:
            continue
    return False, ""


# ── 장부 ─────────────────────────────────────────────────
def record(title, cat, stats, result, seconds=0, note=""):
    """책 한 권의 토큰을 장부에 한 줄 남긴다. 실패해도 생산을 막지 않는다."""
    row = {
        "when": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime()),
        "epoch": int(time.time()),
        "title": title, "cat": cat, "result": result,
        "total": stats.get("total", 0), "main": stats.get("main", 0),
        "sub": stats.get("sub", 0), "sub_files": stats.get("sub_files", 0),
        "responses": stats.get("responses", 0),
        "seconds": int(seconds), "budget": BUDGET, "note": note,
    }
    try:
        with open(LEDGER, "a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    except OSError as e:
        print("[토큰장부] 기록 실패(무시): %s" % e, file=sys.stderr)
    return row


def human(n):
    """1억 874만 · 1,333만 처럼 사장님이 읽는 단위로."""
    n = int(n or 0)
    if n >= 100_000_000:
        eok, rest = divmod(n, 100_000_000)
        return "%d억 %s만" % (eok, format(rest // 10_000, ",")) if rest >= 10_000 else "%d억" % eok
    if n >= 10_000:
        return "%s만" % format(n // 10_000, ",")
    return format(n, ",")


if __name__ == "__main__":
    # 자체 점검: 지금 도는 생산이 있으면 얼마나 썼는지 본다.
    g = TokenGuard()
    g.baseline = set()          # 전부 센다
    print(json.dumps(g.poll(), ensure_ascii=False, indent=2))
