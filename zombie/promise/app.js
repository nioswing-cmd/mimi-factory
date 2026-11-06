/* A-05 미래의 나와 약속 — 오늘 밤의 나에게 지금 약속 하나.
   참고한 원리: FutureMe(봉인한 편지는 정한 날까지 못 연다) · Headway(«미래의 나»가 보낸 편지 카드) · Once(날짜가 적힌 테이프 라벨) ·
   Quo(«오늘 저녁·내일 아침» 빠른 시각 고르기) · Stickk(약속을 «계약»처럼 무겁게 서명) · Beeminder(지킨 기록이 한 줄로 쌓이는 선).
   🔴 알림을 보내지 않는다(앱을 열 때 묻는다) — 필요하면 .ics 로 사용자 캘린더에 직접 넣게.
   핵심 인터랙션 = «꾹 눌러 봉인»(1초 누르는 동안 고리가 차고 손끝이 눌리며 쿵 — 도장) → 정한 시각이 지나면 봉투가 떨리고, 열면 봉인이 깨지며 편지가 올라온다. */
(function () {
  'use strict';
  const { h, $, $$, store, save, done, toast, buzz, tone, reduced, coach, uid, confirm, dayKey } = Z;
  const EX = ['오늘 밤 11시 전에 폰을 거실에 두고 자기', '내일 아침 눈뜨면 물 한 잔 먼저', '퇴근하고 10분 걷기', '저녁 먹고 설거지 바로 하기', '자기 전에 내일 할 일 3개 적기'];
  const SEAL = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4l5.6 6.1 8.2-.9.9 8.2L44.8 23l-6.1 5.6.9 8.2-8.2.9L26 44.8 24 44l-5.6-6.1-8.2.9-.9-8.2L3.2 25l6.1-5.6-.9-8.2 8.2-.9L22 3.2z"/></svg>';
  function clean(x) {
    x = Object.assign({ active: [], hist: [], seq: 0, when: '2h' }, x);
    const okP = p => p && typeof p === 'object' && typeof p.what === 'string' && Number.isFinite(Number(p.due));
    const fix = p => Object.assign(p, { id: String(p.id || uid()).slice(0, 40), no: Math.max(1, Math.floor(Number(p.no)) || 1), due: Number(p.due), at: Number(p.at) || Number(p.due), why: typeof p.why === 'string' ? p.why : '' });
    x.active = (Array.isArray(x.active) ? x.active : []).filter(okP).map(fix).slice(0, 20);
    x.hist = (Array.isArray(x.hist) ? x.hist : []).filter(okP).map(fix).map(p => Object.assign(p, { res: ['k', 'p', 'm'].includes(p.res) ? p.res : 'm' }));
    x.seq = Math.max(0, Math.floor(Number(x.seq)) || 0);
    if (typeof x.when !== 'string') x.when = '2h';
    return x;
  }
  let D = clean(store());
  const MAX = 5;
  function persist() { D.hist = D.hist.slice(-300); save(D); }
  const pad = n => String(n).padStart(2, '0');

  /* ---------- 시각 ---------- */
  function at(hh, mm, plusDay) { const d = new Date(); d.setDate(d.getDate() + (plusDay || 0)); d.setHours(hh, mm, 0, 0); return d.getTime(); }
  function in2h() { const t = Date.now() + 2 * 3600e3; return Math.ceil(t / 600e3) * 600e3; }
  function opts() {
    const now = Date.now(), o = [['2h', '2시간 뒤', in2h()]];
    if (at(21, 0) - now > 30 * 60e3) o.push(['t21', '오늘 밤 9시', at(21, 0)]);
    if (at(23, 0) - now > 30 * 60e3) o.push(['t23', '오늘 밤 11시', at(23, 0)]);
    o.push(['m9', '내일 아침 9시', at(9, 0, 1)]);
    o.push(['m21', '내일 밤 9시', at(21, 0, 1)]);
    o.push(['custom', '직접 정하기', null]);
    return o;
  }
  function label(t) {
    const d = new Date(t), today = dayKey(), k = dayKey(t);
    const hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (k === today) return '오늘 ' + hm;
    if (k === Z.addDays(today, 1)) return '내일 ' + hm;
    return (d.getMonth() + 1) + '/' + d.getDate() + '(' + '일월화수목금토'[d.getDay()] + ') ' + hm;
  }
  function left(t) {
    let m = Math.max(0, Math.round((t - Date.now()) / 60e3)); if (m < 1) return '곧 열려요';
    const d = Math.floor(m / 1440); m -= d * 1440; const hh = Math.floor(m / 60), mm = m % 60;
    return (d ? d + '일 ' : '') + (hh ? hh + '시간 ' : '') + (d ? '' : mm + '분 ') + '뒤 열려요';
  }
  function chosenDue() {
    if (D.when === 'custom') { const v = $('#pr-dt').value; if (!v) return null; const t = new Date(v).getTime(); return isFinite(t) ? t : null; }
    const o = opts().find(x => x[0] === D.when); return o ? o[2] : null;
  }

  /* ---------- 쓰기 ---------- */
  function renderCompose() {
    const ex = $('#pr-ex'); ex.innerHTML = '';
    EX.slice(0, 3).forEach(t => ex.appendChild(h('button', { type: 'button', class: 'z-chip', text: t, onclick: () => { $('#pr-what').value = t; Z.popEl($('#pr-what')); showWhen(); } })));
    const w = $('#pr-when'); w.innerHTML = '';
    const list = opts(); if (!list.find(x => x[0] === D.when)) D.when = '2h';
    list.forEach(([k, t]) => {
      const c = h('button', { type: 'button', class: 'z-chip', role: 'radio', 'aria-checked': String(D.when === k), text: t });
      c.addEventListener('click', () => { D.when = k; persist(); $$('.z-chip', w).forEach(x => x.setAttribute('aria-checked', String(x === c))); $('#pr-custom').hidden = k !== 'custom'; if (k === 'custom') { const dt = $('#pr-dt'); if (!dt.value) { const d = new Date(in2h()); dt.value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); } dt.focus(); } showWhen(); });
      w.appendChild(c);
    });
    $('#pr-custom').hidden = D.when !== 'custom';
    const now = new Date(); $('#pr-dt').min = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
    showWhen();
  }
  function showWhen() { const t = chosenDue(); $('#pr-when-show').textContent = t ? '확인 시각: ' + label(t) + ' · ' + left(t).replace(' 열려요', '') : '날짜와 시각을 골라 주세요'; }
  $('#pr-dt').addEventListener('input', showWhen);

  /* ---------- 핵심: 꾹 눌러 봉인 ---------- */
  const sealBtn = $('#pr-seal'), fil = $('#pr-seal-fil'), C0 = 339.3, HOLD = 1000;
  let hold = null;
  function check() {
    const what = $('#pr-what').value.trim(), due = chosenDue();
    if (what.length < 2) return ['무엇을 할지 한 줄 적어 주세요', $('#pr-what')];
    if (!due || due < Date.now() + 60e3) return ['확인 시각은 지금보다 뒤여야 해요', D.when === 'custom' ? $('#pr-dt') : $('#pr-when')];
    if (D.active.length >= MAX) return ['봉인된 약속은 ' + MAX + '개까지예요. 하나를 열고 나서 걸어요', null];
    return null;
  }
  function refuse(msg, focusEl) { toast(msg, 2800); sealBtn.classList.remove('pr-shake'); void sealBtn.offsetWidth; sealBtn.classList.add('pr-shake'); buzz([10, 40, 10]); if (focusEl && focusEl.focus) focusEl.focus(); }
  function startHold() {
    if (hold || sealBtn.classList.contains('sealed')) return;
    const bad = check(); if (bad) { refuse(bad[0], bad[1]); return; }
    sealBtn.classList.add('hold'); fil.style.transition = 'none';
    const t0 = performance.now(); let half = false;
    tone(196, 0, 0.12, 'triangle', 0.06); buzz(10);
    hold = { raf: 0 };
    (function fr(now) {
      if (!hold) return;
      const p = Math.min(1, (now - t0) / HOLD);
      fil.style.strokeDashoffset = String(C0 * (1 - p));
      if (p > 0.5 && !half) { half = true; tone(294, 0, 0.08, 'triangle', 0.05); buzz(8); }
      if (p >= 1) { hold = null; sealIt(); return; }
      hold.raf = requestAnimationFrame(fr);
    })(t0);
  }
  function cancelHold() {
    if (!hold) return; cancelAnimationFrame(hold.raf); hold = null;
    sealBtn.classList.remove('hold'); fil.style.transition = 'stroke-dashoffset .3s ease'; fil.style.strokeDashoffset = String(C0);
  }
  sealBtn.addEventListener('pointerdown', e => { e.preventDefault(); sealBtn.setPointerCapture(e.pointerId); startHold(); });
  sealBtn.addEventListener('pointerup', cancelHold); sealBtn.addEventListener('pointercancel', cancelHold); sealBtn.addEventListener('lostpointercapture', cancelHold);
  sealBtn.addEventListener('contextmenu', e => e.preventDefault());
  sealBtn.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); startHold(); } else if (e.key === ' ' || e.key === 'Enter') e.preventDefault(); });
  sealBtn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cancelHold(); } });
  /* 누르고 있기 어려운 사람·화면 읽기 도구: 일반 단추로도 봉인(F15) */
  $('#pr-seal-alt').addEventListener('click', () => {
    if (hold || sealBtn.classList.contains('sealed')) return;
    const bad = check(); if (bad) { refuse(bad[0], bad[1]); return; }
    fil.style.transition = 'stroke-dashoffset .4s ease'; fil.style.strokeDashoffset = '0'; sealIt();
  });
  function sealIt() {
    const what = $('#pr-what').value.trim(), why = $('#pr-why').value.trim(), due = chosenDue();
    D.seq = (D.seq || 0) + 1;
    const p = { id: uid(), no: D.seq, what, why, at: Date.now(), due };
    D.active.push(p);
    if (!save(D)) { D.active = D.active.filter(x => x !== p); D.seq--; cancelHold(); sealBtn.classList.remove('hold'); fil.style.strokeDashoffset = String(C0); return; }   // 저장 실패면 입력 그대로(F3)
    sealBtn.classList.remove('hold'); sealBtn.classList.add('sealed');
    if (!reduced()) { sealBtn.classList.remove('stamp'); void sealBtn.offsetWidth; sealBtn.classList.add('stamp'); }
    $('.pr-seal-t').textContent = '봉인 완료';
    tone(130, 0, 0.22, 'triangle', 0.12); tone(65, 0, 0.3, 'sine', 0.12); tone(988, 0.12, 0.09, 'square', 0.03); buzz([40, 30, 70]);
    Z.announce('봉인했어요. ' + label(due) + '에 열려요.');
    toast('봉인! ' + label(due) + '에 열려요', 2600);
    setTimeout(() => {
      $('#pr-what').value = ''; $('#pr-why').value = '';
      sealBtn.classList.remove('sealed', 'stamp'); $('.pr-seal-t').textContent = '꾹 눌러 봉인'; fil.style.transition = 'none'; fil.style.strokeDashoffset = String(C0);
      renderAll();
      const card = document.querySelector('[data-pid="' + p.id + '"]'); if (card) { card.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); Z.popEl(card); }
    }, 1100);
  }

  /* ---------- 봉투 ---------- */
  function tape(p) { return 'PROMISE ' + String(p.no).padStart(2, '0') + ' · ' + label(p.due) + ' 개봉'; }
  function env(p, due) {
    const li = h('li', { class: 'pr-env' + (due ? ' due' : ''), 'data-pid': p.id });
    li.innerHTML = '<div class="pr-env-top" aria-hidden="true"><div class="pr-env-flap"></div></div><div class="pr-env-seal" aria-hidden="true">' + SEAL + '</div>';
    li.querySelector('.pr-env-seal').appendChild(h('b', { text: String(p.no).padStart(2, '0') }));
    const body = h('div', { class: 'pr-env-body' }, h('span', { class: 'pr-tape', text: tape(p) }));
    if (due) {
      body.append(h('p', { class: 'pr-env-t', text: label(p.at) + '의 내가 보낸 약속이 열렸어요' }));
      body.append(h('div', { class: 'z-row' }, h('button', { type: 'button', class: 'z-btn primary', text: '봉투 열기', onclick: e => openEnv(p, li, e.currentTarget) })));
    } else {
      body.append(h('p', { class: 'pr-env-t locked', text: '봉인됨 — 내용은 그 시각에 열려요' }), h('p', { class: 'pr-left', 'data-left': p.id, text: left(p.due) }));
      body.append(h('div', { class: 'z-row' },
        h('button', { type: 'button', class: 'z-btn small', text: '캘린더에 넣기', onclick: () => ics(p) }),
        h('button', { type: 'button', class: 'z-btn small ghost', text: '봉인 깨기', onclick: async () => { if (await confirm('봉인을 깰까요?', '이 약속은 기록 없이 사라져요. «나와의 신뢰» 점수에는 들어가지 않아요.', '봉인 깨기')) { const id = p.id; if (!D.active.some(x => x.id === id)) { toast('이미 없는 약속이에요'); renderAll(); return; } const prev = D.active; D.active = D.active.filter(x => x.id !== id); if (!save(D)) { D.active = prev; return; } renderAll(); toast('봉인을 깼어요'); } } })));
    }
    li.appendChild(body);
    return li;
  }
  function openEnv(p, li, btn) {
    btn.remove();
    li.classList.add('open'); tone(523, 0, 0.08, 'sine', 0.08); tone(784, 0.1, 0.12, 'sine', 0.07); buzz([15, 40, 15]);
    const body = li.querySelector('.pr-env-body');
    const letter = h('div', { class: 'pr-letter' },
      h('p', { class: 'from', text: 'FROM · ' + label(p.at) + '의 나' }),
      h('p', { class: 'what', text: p.what }),
      p.why ? h('p', { class: 'why', text: '왜냐면 — ' + p.why }) : null);
    const q = h('p', { class: 'z-label', style: { margin: '12px 0 0' }, id: 'q-' + p.id, tabindex: '-1', text: '지켰나요?' });
    const res = h('div', { class: 'pr-res', role: 'group', 'aria-labelledby': 'q-' + p.id },
      h('button', { type: 'button', class: 'z-btn primary', text: '지켰어요', onclick: e => resolve(p, 'k', e.currentTarget) }),
      h('button', { type: 'button', class: 'z-btn', text: '절반쯤 지켰어요', onclick: e => resolve(p, 'p', e.currentTarget) }),
      h('button', { type: 'button', class: 'z-btn ghost', text: '못 지켰어요', onclick: e => resolve(p, 'm', e.currentTarget) }));
    body.append(letter, q, res);
    setTimeout(() => q.focus({ preventScroll: true }), reduced() ? 0 : 500);
    Z.announce('봉투를 열었어요. ' + p.what + '. 지켰나요?');
  }
  function resolve(p, r, anchor) {
    const live = D.active.find(x => x.id === p.id);
    if (!live) { toast('이 약속은 이미 열어서 기록됐어요'); renderAll(); return; }      // 다른 창에서 처리됨(F7)
    const prevA = D.active, prevH = D.hist;
    D.active = D.active.filter(x => x.id !== p.id);
    D.hist = D.hist.concat({ id: p.id, no: p.no, what: p.what, at: p.at, due: p.due, res: r, t: Date.now() }).slice(-300);
    let ok = true;
    if (r === 'k') ok = !!done('약속 지킴: ' + p.what, { label: '약속 지킴', say: '약속을 지켰어요', anchor, data: D }).entry;
    else if (r === 'p') ok = !!done('약속 절반: ' + p.what, { label: '절반도 전진', big: false, anchor, data: D }).entry;
    else ok = save(D);
    if (!ok) { D.active = prevA; D.hist = prevH; return; }
    if (r === 'm') {
      Z.sheet({ title: '괜찮아요, 다음엔 더 작게', body: h('div', null, h('p', { class: 'z-muted', text: '못 지킨 약속은 «너무 컸다»는 신호예요. 시간을 줄이거나 첫 동작만 약속해 보세요.' }), h('p', { class: 'z-small', text: '예: «30분 운동» → «운동복 입기»' })),
        actions: [{ label: '그냥 닫기' }, { label: '더 작게 다시 걸기', primary: true, onClick: () => { $('#pr-what').value = p.what; setTimeout(() => { $('#pr-compose').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' }); $('#pr-what').focus(); $('#pr-what').select(); }, 50); } }] });
    }
    renderAll();
  }
  function ics(p) {
    const f = t => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const s = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//mimifactory//zombie-escape//KO', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', 'UID:' + p.id + '@mimifactory.vibekr.com',
      'DTSTAMP:' + f(Date.now()), 'DTSTART:' + f(p.due), 'DTEND:' + f(p.due + 10 * 60e3), 'SUMMARY:미래의 나와 약속 — 봉투 열 시간',
      'DESCRIPTION:좀비탈출 «미래의 나와 약속»을 열어 봉인된 약속 ' + String(p.no).padStart(2, '0') + '번을 확인하세요.', 'URL:' + location.origin + Z.base + 'promise/',
      'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:봉인된 약속을 열 시간이에요', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
    Z.backup.download('약속-' + String(p.no).padStart(2, '0') + '.ics', s, 'text/calendar');
    toast('캘린더 파일을 받았어요. 열면 캘린더에 들어가요 (약속 내용은 비밀로 둬요)', 3600);
  }

  /* ---------- 신뢰 ---------- */
  function renderTrust() {
    const last = D.hist.slice(-14);
    const sc = last.reduce((a, x) => a + (x.res === 'k' ? 1 : x.res === 'p' ? 0.5 : 0), 0);
    const pct = last.length ? Math.round((sc / last.length) * 100) : 0;
    const R = 42, C = 2 * Math.PI * R;
    $('#pr-ring').innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="trk" cx="50" cy="50" r="' + R + '" fill="none" stroke-width="9"/><circle class="fil" cx="50" cy="50" r="' + R + '" fill="none" stroke-width="9" stroke-dasharray="' + C + '" stroke-dashoffset="' + (C * (1 - pct / 100)) + '"/><text x="50" y="50" text-anchor="middle" dominant-baseline="central" transform="rotate(90 50 50)">' + (last.length ? pct : '–') + '</text></svg>';
    $('#pr-ring').setAttribute('aria-label', last.length ? '최근 약속 ' + last.length + '개 중 지킨 비율 ' + pct + '%' : '아직 연 약속이 없어요');
    $('#pr-trust-big').innerHTML = last.length ? '나와의 신뢰 <b>' + pct + '%</b>' + (pct >= 80 ? ' — 믿을 만한 나!' : pct >= 50 ? ' — 쌓이는 중' : ' — 약속을 더 작게') : '첫 약속을 봉인해 보세요.<br><span class="z-small">지킨 약속이 쌓이면 «나를 믿는 힘»이 보여요.</span>';
    const ol = $('#pr-line'); ol.innerHTML = '';
    for (let i = 0; i < 14; i++) { const x = last[i]; ol.appendChild(h('li', { class: x ? x.res : '', title: x ? x.what : '', 'aria-label': x ? (x.res === 'k' ? '지킴' : x.res === 'p' ? '절반' : '못 지킴') : '비어 있음' })); }
  }
  function renderHist() {
    const box = $('#pr-hist-body'); box.innerHTML = '';
    if (!D.hist.length) { box.appendChild(h('p', { class: 'z-empty', text: '연 약속이 여기 쌓여요. 첫 봉투는 정한 시각이 지나야 열려요.' })); return; }
    const k = D.hist.filter(x => x.res === 'k').length;
    box.appendChild(h('div', { class: 'z-stats' },
      h('div', { class: 'z-stat' }, h('b', { class: 'acc', text: k }), h('span', { text: '지킨 약속' })),
      h('div', { class: 'z-stat' }, h('b', { text: D.hist.filter(x => x.res === 'p').length }), h('span', { text: '절반' })),
      h('div', { class: 'z-stat' }, h('b', { text: D.hist.length }), h('span', { text: '연 약속' }))));
    const ul = h('ul', { class: 'z-list' });
    D.hist.slice(-8).reverse().forEach(x => ul.appendChild(h('li', null, h('span', { class: 'z-tag pr-hist-tag' + (x.res === 'k' ? ' acc' : ''), text: x.res === 'k' ? '지킴' : x.res === 'p' ? '절반' : '못함' }), h('span', { class: 't', text: x.what }), h('span', { class: 'm', text: Z.dayLabel(dayKey(x.due)) }))));
    box.appendChild(h('p', { class: 'pr-sub', text: '최근 연 약속' })); box.appendChild(ul);
  }
  function renderLists() {
    const now = Date.now();
    const due = D.active.filter(p => p.due <= now).sort((a, b) => a.due - b.due), seal = D.active.filter(p => p.due > now).sort((a, b) => a.due - b.due);
    $('#pr-due').hidden = !due.length; $('#pr-sealed').hidden = !seal.length;
    const dl = $('#pr-due-list'); dl.innerHTML = ''; due.forEach(p => dl.appendChild(env(p, true)));
    const sl = $('#pr-sealed-list'); sl.innerHTML = ''; seal.forEach(p => sl.appendChild(env(p, false)));
    $('#pr-sealed-n').textContent = seal.length + ' / ' + MAX;
    if (due.length && !renderLists.told) { renderLists.told = true; buzz([20, 60, 20]); Z.announce('열 수 있는 약속이 ' + due.length + '개 있어요'); }
  }
  function renderAll() { renderTrust(); renderLists(); renderHist(); renderCompose(); }
  setInterval(() => {
    let flip = false;
    D.active.forEach(p => { const el = document.querySelector('[data-left="' + p.id + '"]'); if (el) el.textContent = left(p.due); if (p.due <= Date.now() && el) flip = true; });
    if (flip && !document.querySelector('.pr-env.open')) renderLists();
    showWhen();
  }, 20000);

  renderAll();
  const C = coach($('#pr-coach'), 'promise', ['지킬 약속을 한 줄 적고 확인 시각을 골라요.', '«꾹 눌러 봉인»을 1초 누르면 봉인돼요 — 그때까지 못 열어요.', '시각이 지나 앱을 열면 봉투를 열고 «지켰나요?»에 답해요.']);
  Z.on('change', ev => { if (!ev || !ev.remote) return; D = clean(store()); renderTrust(); const op = document.querySelector('.pr-env.open'); if (!op || !D.active.some(x => x.id === op.dataset.pid)) renderLists(); renderHist(); });
})();
