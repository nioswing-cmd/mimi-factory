/* 좀비탈출 처음 화면 — 오늘의 인간 회복 · 앱 카드 · 오늘 한 일 · 7일 · 백업 */
(function () {
  'use strict';
  const { h, $, $$, meta, log, countOn, dayKey, dayLabel, timeLabel, streak, done, bars, week, toast, backup, confirm } = Z;
  const MODS = meta.mods, ORDER = meta.order;
  const GOAL = 5;
  const MSG = ['한 번이면 시작이에요.', '좋아요, 몸이 깨어나는 중.', '좀비 탈출 반쯤 왔어요.', '이제 사람 쪽이 더 커요.', '거의 다 왔어요.', '오늘은 완전 사람 모드!'];

  function render() {
    const today = dayKey();
    const L = log();
    const n = countOn(today);
    $('#h-date').textContent = dayLabel(today);
    $('#h-count').textContent = n;
    $('#h-streak').textContent = streak();
    $('#h-msg').textContent = MSG[Math.min(n, MSG.length - 1)];
    const bar = $('#h-bar'); bar.setAttribute('aria-valuenow', String(Math.min(n, GOAL)));
    bar.setAttribute('aria-valuetext', '오늘 ' + n + '번 행동 — 목표 ' + GOAL + '번');
    bar.querySelector('i').style.width = Math.min(100, (n / GOAL) * 100) + '%';
    const lights = $('#h-lights'); lights.innerHTML = '';
    ORDER.forEach(s => {
      const m = MODS[s]; const c = countOn(today, s);
      lights.appendChild(h('li', { class: c ? 'on' : '', style: { '--c': m.color } }, h('i', { 'aria-hidden': 'true' }), h('span', { text: m.code }), h('span', { class: 'sr-only', text: ' ' + m.name + (c ? ' 오늘 ' + c + '번' : ' 아직') })));
    });
    $$('[data-count]').forEach(el => {
      const s = el.getAttribute('data-count'); const c = countOn(today, s); const all = L.filter(e => e.m === s).length;
      el.textContent = c ? '오늘 ' + c : (all ? '모두 ' + all : '');
      el.classList.toggle('on', !!c);
    });
    // 오늘 한 일
    const tl = $('#h-timeline'); tl.innerHTML = '';
    const mine = L.filter(e => e.d === today).reverse();
    if (!mine.length) tl.appendChild(h('li', { class: 'z-empty', text: '아직 없어요. 위 «지금 3초 시작»이 제일 빨라요.' }));
    mine.slice(0, 30).forEach(e => {
      const m = MODS[e.m] || MODS.hub;
      tl.appendChild(h('li', null, h('span', { class: 'who', style: { '--c': m.color, background: m.color }, text: m.code }), h('span', { class: 't', text: e.w || m.name }), h('span', { class: 'm', text: timeLabel(e.t) })));
    });
    // 7일
    const wk = week(null);
    bars($('#h-week-chart'), wk, { title: '최근 7일 모든 앱 행동 수', unit: '번' });
    $('#h-week-sum').textContent = '합계 ' + wk.reduce((a, x) => a + x.value, 0) + '번';
  }

  $('#h-offline').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#h-off-in').value.trim();
    if (!v) { $('#h-off-in').focus(); toast('무엇을 했는지 한 줄만 적어 주세요'); return; }
    const r = done('hub', v, { label: '앱 없이 해냈어요', anchor: e.submitter || null });
    if (!r.entry) return;
    $('#h-off-in').value = '';
    render();
  });
  $('#h-export').addEventListener('click', backup.exportAll);
  $('#h-import-b').addEventListener('click', () => $('#h-import').click());
  $('#h-import').addEventListener('change', async e => { const f = e.target.files && e.target.files[0]; if (f) { await backup.importAll(f); render(); } e.target.value = ''; });
  $('#h-reset').addEventListener('click', async () => {
    const ok = await confirm('기록을 모두 지울까요?', '모든 앱의 기록과 설정이 이 폰에서 지워져요. 되돌릴 수 없어요. 먼저 백업 파일을 저장해 두면 안전해요.', '모두 지우기');
    if (ok && backup.resetAll()) { render(); toast('모두 지웠어요. 새로 시작!'); } else if (ok) toast('지우지 못했어요. 다시 해 주세요');
  });
  Z.on('change', render);
  render();
})();
