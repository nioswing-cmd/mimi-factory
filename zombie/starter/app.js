/* A-02 3초 스타터 — 미루기 전에 3·2·1, 그냥 시작.
   참고한 원리: 5초의 법칙(세는 동안 몸을 먼저) · Toggl(«무엇에 집중» 칸이 시계 위) · Opal(빠른 시간 칩) · Tiimo(눈금 링) · Structured(«Focus Now» 한 단추)
   핵심 인터랙션 = 전체 화면 3·2·1: 숫자가 «쿵» 들어오고, 음이 한 칸씩 올라가고(도·미·솔→높은 도), 진동이 점점 세지고, 링이 1/3씩 찬다. */
(function () {
  'use strict';
  const { h, $, store, save, done, toast, announce, buzz, tone, reduced, timer, coach, fmt } = Z;
  const SUGGEST = ['설거지', '메일 1통 답장', '책 1쪽', '운동복 입기', '책상 위 정리', '보고서 첫 줄', '빨래 개기', '영어 단어 5개'];
  const FIRST = ['자리에서 일어나기', '필요한 것 하나 꺼내기', '파일 열기', '첫 줄만 쓰기', '타이머 보며 손 움직이기'];
  const DURS = [[2, '2분'], [5, '5분'], [10, '10분'], [0, '정하지 않음']];
  function clean(x) { x = Object.assign({ recent: [], starts: [], dur: 2 }, x); x.recent = (Array.isArray(x.recent) ? x.recent : []).filter(t => typeof t === 'string').slice(0, 8); x.starts = (Array.isArray(x.starts) ? x.starts : []).filter(o => o && typeof o === 'object' && typeof o.task === 'string').map(o => Object.assign(o, { min: Number(o.min) || 0 }, typeof o.sec === 'number' ? {} : { sec: undefined })); if (![0, 2, 5, 10].includes(x.dur)) x.dur = 2; return x; }
  let D = clean(store());
  const el = {
    setup: $('#st-setup'), run: $('#st-run'), end: $('#st-end'), task: $('#st-task'), first: $('#st-first'), go: $('#st-go'),
    recent: $('#st-recent'), firstTips: $('#st-first-tips'), dur: $('#st-dur'), runT: $('#st-run-t'), runFirst: $('#st-run-first'),
    timerBox: $('#st-timer'), watch: $('#st-watch'), watchN: $('#st-watch-n'), endSub: $('#st-end-sub'), endQ: $('#st-end-q'),
    endAfter: $('#st-end-after'), stats: $('#st-stats-body')
  };
  let cur = null;   // 지금 하는 시작 {t, task, first, dur, sec, cont, logged}
  let T = null, watchIv = null, watchStart = 0;

  function persist() { D.starts = D.starts.slice(-300); save(D); }

  /* ---------- 첫 화면 ---------- */
  function chips() {
    el.recent.innerHTML = '';
    const list = D.recent.length ? D.recent.slice(0, 6) : SUGGEST.slice(0, 6);
    if (!D.recent.length) el.recent.setAttribute('aria-label', '추천 할 일 — 누르면 칸에 들어가요');
    list.forEach(t => el.recent.appendChild(h('button', { type: 'button', class: 'z-chip', text: t, onclick: () => { el.task.value = t; Z.popEl(el.task); el.go.focus(); } })));
    el.firstTips.innerHTML = '';
    FIRST.forEach(t => el.firstTips.appendChild(h('button', { type: 'button', class: 'z-chip', text: t, onclick: () => { el.first.value = t; } })));
    el.dur.innerHTML = '';
    DURS.forEach(([v, t]) => {
      const c = h('button', { type: 'button', class: 'z-chip', role: 'radio', 'aria-checked': String(D.dur === v), text: t });
      c.addEventListener('click', () => { D.dur = v; persist(); Array.from(el.dur.children).forEach(x => x.setAttribute('aria-checked', String(x === c))); });
      el.dur.appendChild(c);
    });
  }
  el.task.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); begin(); } });
  el.go.addEventListener('click', begin);

  /* ---------- 핵심: 3·2·1 ---------- */
  function countdown(task) {
    return new Promise(res => {
      const R = 47, C = 2 * Math.PI * R, gap = 6, len = C / 3 - gap;
      const segs = [0, 1, 2].map(i => `<circle class="seg" data-i="${i}" cx="50" cy="50" r="${R}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-(i * C / 3) - gap / 2}"/>`).join('');
      const wrap = h('div', { class: 'st-cd', role: 'dialog', 'aria-modal': 'true', 'aria-label': '3초 카운트다운' });
      wrap.innerHTML = `<div class="st-cd-glow" aria-hidden="true"></div><div class="st-cd-ring" aria-hidden="true"><svg viewBox="0 0 100 100">${segs}</svg><div class="st-cd-num"></div></div>`;
      const live = h('p', { class: 'sr-only', 'aria-live': 'assertive' });
      const x = h('button', { type: 'button', class: 'z-btn small ghost st-cd-x', text: '취소' });
      const tk = h('p', { class: 'st-cd-task' }, h('b', { text: task }), h('span', { text: '세는 동안 손을 먼저 움직여요' }));
      wrap.append(live, x, tk);
      document.body.appendChild(wrap);
      const others = Array.from(document.body.children).filter(n => n !== wrap && !['SCRIPT', 'STYLE'].includes(n.tagName) && n.id !== 'sr-live');
      others.forEach(n => { n.inert = true; });
      x.focus();
      const num = wrap.querySelector('.st-cd-num'), glow = wrap.querySelector('.st-cd-glow');
      const notes = [523.25, 659.25, 783.99];          // 도 미 솔
      const vib = [22, 34, 50];
      let k = 3, over = false, tm = null;
      function show(text, isGo) {
        const prev = num.querySelector('b:not(.out)');
        if (prev && !reduced()) { prev.classList.remove('in'); prev.classList.add('out'); setTimeout(() => prev.remove(), 320); } else if (prev) prev.remove();
        const b = h('b', { class: (isGo ? 'go ' : '') + (reduced() ? '' : 'in'), text });
        num.appendChild(b);
        if (!reduced()) { glow.classList.remove('hit'); void glow.offsetWidth; glow.classList.add('hit'); }
      }
      function end(ok) {
        if (over) return; over = true; clearTimeout(tm);
        others.forEach(n => { n.inert = false; });
        if (ok && !reduced()) { wrap.classList.add('wipe'); setTimeout(() => wrap.remove(), 440); } else wrap.remove();
        res(ok);
      }
      x.addEventListener('click', () => end(false));
      wrap.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); end(false); } if (e.key === 'Tab') { e.preventDefault(); x.focus(); } });
      (function step() {
        if (over) return;
        if (k > 0) {
          const i = 3 - k;
          show(String(k));
          wrap.querySelector(`.seg[data-i="${i}"]`).classList.add('on');
          live.textContent = String(k);
          tone(notes[i], 0, 0.11, 'square', 0.05); tone(notes[i] / 2, 0, 0.16, 'triangle', 0.06);
          buzz(vib[i]);
          k--; tm = setTimeout(step, 1000);
        } else {
          show('GO', true); live.textContent = '시작';
          tone(1046.5, 0, 0.22, 'square', 0.06); tone(523.25, 0, 0.3, 'triangle', 0.08); tone(1568, 0.05, 0.18, 'square', 0.03);
          buzz([60, 40, 90]);
          tm = setTimeout(() => end(true), 620);
        }
      })();
    });
  }

  async function begin() {
    if (cur) return;
    const task = el.task.value.trim() || '지금 할 일';
    const first = el.first.value.trim();
    if (C) C.close();
    const ok = await countdown(task);
    if (!ok) { toast('괜찮아요. 준비되면 다시 3초'); el.go.focus(); return; }
    D.recent = [task, ...D.recent.filter(x => x !== task)].slice(0, 8); persist();
    cur = { t: Date.now(), task, first, dur: D.dur, sec: 0, cont: false, logged: false };
    showRun();
  }

  /* ---------- 실행 ---------- */
  function showRun() {
    el.setup.hidden = true; el.end.hidden = true; el.run.hidden = false;
    el.runT.textContent = cur.task;
    if (cur.first) { el.runFirst.hidden = false; el.runFirst.innerHTML = ''; el.runFirst.append(h('b', { text: '첫 동작' }), cur.first); } else el.runFirst.hidden = true;
    el.timerBox.innerHTML = ''; el.watch.hidden = true;
    window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
    if (cur.dur > 0) runTimer(cur.dur);
    else runWatch();
  }
  function runTimer(min) {
    el.timerBox.innerHTML = '';
    const base = cur.sec;
    T = timer(el.timerBox, {
      sec: min * 60, label: cur.cont ? min + '분 더' : min + '분만 해 보기', tickSound: true,
      onDone: () => { cur.sec = base + min * 60; T = null; finishBlock(); },
      onStop: el2 => { cur.sec = base + el2; T = null; stopEarly(); }
    });
    const pb = el.timerBox.querySelector('.z-btn'); if (pb) pb.focus({ preventScroll: true });
  }
  function runWatch() {
    el.watch.hidden = false; watchStart = Date.now() - cur.sec * 1000;
    clearInterval(watchIv);
    const tick = () => { el.watchN.textContent = clock((Date.now() - watchStart) / 1000); };
    tick(); watchIv = setInterval(tick, 500);
    Z.wake(true);
    $('#st-watch-done').focus({ preventScroll: true });
  }
  function clock(s) { s = Math.floor(s); const m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); }
  $('#st-watch-done').addEventListener('click', () => {
    clearInterval(watchIv); Z.wake(false);
    cur.sec = (Date.now() - watchStart) / 1000; el.watch.hidden = true;
    showEnd(true, logIt(true));
  });

  function finishBlock() { showEnd(false, logIt(false)); }
  function stopEarly() {
    if (cur.sec >= 10) { showEnd(true, logIt(false)); }
    else { toast('10초도 안 돼서 기록하지 않았어요. 다시 3초!'); reset(); }
  }

  /* 기록은 «시작 1번 = 한 줄». 계속하면 «같은 줄»(공통 기록 id · 시작 기록 id)의 시간만 늘린다. */
  function record(sec, opt) {
    opt = opt || {};
    const min = Math.round(sec / 6) / 10;
    const label = '시작: ' + cur.task + (min >= 1 ? ' (' + Math.round(min) + '분)' : '');
    if (!cur.logId) {
      const sid = Z.uid();
      D.starts.push({ id: sid, t: cur.t, task: cur.task, first: cur.first, min, sec: Math.round(sec), cont: cur.cont });
      D.starts = D.starts.slice(-300);
      const r = done(label, { min, label: '시작 성공', say: '시작 성공', quiet: !!opt.quiet, data: D });   // 시작 기록 + 오늘 한 일을 한 번에 저장
      if (!r.entry) { D.starts = D.starts.filter(x => x.id !== sid); return false; }
      cur.logId = r.entry.id; cur.sid = sid;
      return true;
    }
    const st = startRec(); if (st) { st.min = min; st.sec = Math.round(sec); st.cont = st.cont || cur.cont; }
    if (!save(D)) return false;
    Z.amend(cur.logId, { w: label, min });
    if (opt.final && !opt.quiet) Z.celebrate(null, { big: true, label: Math.round(min) + '분 해냈어요' });
    return true;
  }
  function startRec() { return cur && cur.sid ? D.starts.find(x => x.id === cur.sid) : null; }
  function logIt(final) { return record(cur.sec, { final }); }

  function showEnd(stopped, saved) {
    el.run.hidden = true; el.end.hidden = false;
    $('#st-retry').hidden = saved !== false;
    if (saved === false) {                         // 저장 실패 — 시간·할 일을 쥔 채 다시 저장하게(F3)
      $('#st-end-t').textContent = '기록이 저장되지 않았어요'; el.endSub.textContent = '저장 공간이나 사생활 보호 모드를 확인한 뒤 «다시 저장»을 눌러 주세요.';
      el.endQ.hidden = true; el.endAfter.hidden = true; $('#st-retry').dataset.stopped = stopped ? '1' : ''; $('#st-retry').focus({ preventScroll: true }); return;
    }
    const m = Math.floor(cur.sec / 60), s = Math.round(cur.sec % 60);
    const tm = m ? m + '분' + (s ? ' ' + s + '초' : '') : s + '초';
    $('#st-end-t').textContent = stopped ? (cur.cont ? '오늘 몫 끝!' : '시작은 해냈어요') : '시작 성공!';
    el.endSub.textContent = '«' + cur.task + '» ' + tm + ' 했어요.' + (stopped ? '' : ' 여기서 멈춰도 성공이에요.');
    el.endQ.hidden = stopped; el.endAfter.hidden = !stopped;
    if (stopped) { renderStats(); cur = null; }
    el.end.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  $('#st-more5').addEventListener('click', () => { cur.cont = true; const st = startRec(); if (st) { st.cont = true; persist(); } el.end.hidden = true; el.run.hidden = false; runTimer(5); });
  $('#st-open').addEventListener('click', () => { cur.cont = true; const st = startRec(); if (st) { st.cont = true; persist(); } el.end.hidden = true; el.run.hidden = false; el.timerBox.innerHTML = ''; runWatch(); });
  $('#st-stop').addEventListener('click', () => { el.endQ.hidden = true; el.endAfter.hidden = false; $('#st-end-t').textContent = '오늘 몫 끝!'; renderStats(); cur = null; $('#st-again').focus(); });
  $('#st-again').addEventListener('click', reset);
  $('#st-retry').addEventListener('click', () => { if (!cur) return; const st = $('#st-retry').dataset.stopped === '1'; showEnd(st, logIt(st)); });
  function reset() {
    cur = null; if (T) { T.stop(); T = null; } clearInterval(watchIv); Z.wake(false);
    el.run.hidden = true; el.end.hidden = true; el.setup.hidden = false; el.task.value = ''; el.first.value = '';
    chips(); renderStats(); el.task.focus();
  }
  /* 실행 중에 창을 닫아도 10초 넘게 했으면 «시작»은 남긴다 */
  window.addEventListener('pagehide', () => {
    if (!cur) return;
    const sec = T ? (T.elapsed() + cur.sec) : (!el.watch.hidden && watchStart ? (Date.now() - watchStart) / 1000 : cur.sec);
    if (sec >= 10) record(sec, { quiet: true });      // 뒤로 가기로 돌아와 이어 해도 같은 줄을 늘린다
  });

  /* ---------- 통계 ---------- */
  function renderStats() {
    const S = D.starts; el.stats.innerHTML = '';
    if (!S.length) { el.stats.appendChild(h('p', { class: 'z-empty', text: '첫 시작을 하면 «시작한 일 중 몇 %를 계속했는지»가 여기 보여요.' })); return; }
    const went = s => (typeof s.sec === 'number' ? s.sec > 125 : !!s.cont);   // 실제로 2분을 넘겨 이어 간 것만(F9)
    const cont = S.filter(went).length;
    const pct = Math.round((cont / S.length) * 100);
    const total = Math.round(S.reduce((a, s) => a + (s.min || 0), 0));
    el.stats.appendChild(h('p', { class: 'st-insight', html: S.length >= 3 ? '시작한 일의 <b>' + pct + '%</b>는 2분을 넘겨 이어 갔어요.' : '시작 <b>' + S.length + '번</b>. 세 번 쌓이면 나만의 «계속 비율»이 보여요.' }));
    el.stats.appendChild(h('div', { class: 'z-stats' },
      h('div', { class: 'z-stat' }, h('b', { class: 'acc', text: S.length }), h('span', { text: '시작' })),
      h('div', { class: 'z-stat' }, h('b', { text: cont }), h('span', { text: '이어 감' })),
      h('div', { class: 'z-stat' }, h('b', { text: total }), h('span', { text: '해 본 분' }))));
    const cnt = {}; S.forEach(s => { cnt[s.task] = (cnt[s.task] || 0) + 1; });
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (top.length) {
      el.stats.appendChild(h('p', { class: 'z-label', style: { margin: '16px 0 4px' }, text: '자주 시작한 일' }));
      const ul = h('ul', { class: 'z-list st-top' });
      top.forEach(([t, n], i) => ul.appendChild(h('li', null, h('span', { class: 't' }, h('span', { class: 'z-tag' + (i ? '' : ' acc'), text: 'TOP' + (i + 1) }), ' ' + t), h('span', { class: 'm', text: n + '번' }))));
      el.stats.appendChild(ul);
    }
  }

  chips(); renderStats();
  const C = coach($('#st-coach'), 'starter', ['할 일을 한 줄 적거나 아래 칩을 눌러요.', '«3초 뒤 시작» → 3·2·1 세는 동안 손을 먼저 움직여요.', '2분만 해 보고, 계속할지는 그때 정해요.']);
  Z.on('change', ev => { if (!ev || !ev.remote) return; D = clean(store()); if (!cur) { chips(); renderStats(); } });
})();
