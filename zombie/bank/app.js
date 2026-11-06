/* B-08 도파민 저금통 — 참은 즉각 보상을 동전처럼 저금한다.
   참고한 원리: 토스 저금통·Monzo Pots·Revolut Vaults(눈에 보이는 «통»에 따로 모으기, 넣는 순간을 작은 의식으로) ·
   Qapital(«규칙»처럼 상황 → 저금) · I Am Sober·QUITTR(참은 시간·돈을 누적 숫자로) · One Sec(참은 횟수를 셈) — 자세한 참고는 설계서 2차.
   🔴 목표 금액·벌금 없음. 모은 «시간»이 주인공. 1차 «도파민 스위치»로 넘긴 충동도 은빛 동전으로 함께 쌓인다(공통 기록 읽기만).
   핵심 인터랙션 = 동전 넣기: 동전을 손가락으로 저금통 쪽으로 밀어 올리면(또는 누르면) 틈으로 날아 들어가 떨어지고, 쌓인 동전 위에서 두어 번 튀며 «짤랑». */
(function () {
  'use strict';
  const { h, $, $$, store, save, done, toast, buzz, tone, reduced, coach, uid, dayKey, addDays, dayLabel, timeLabel, fxLevel, countUp, hash } = Z;
  const CAP = 600;   // 통 하나 = 10시간
  const WHAT = ['쇼츠·릴스', 'SNS 넘기기', '게임 한 판', '배달 음식', '야식·군것질', '충동 구매', '늦잠', '단 음료', '술 한 잔', '직접 적기'];
  const INST = ['산책', '직접 요리', '책 읽기', '운동', '일찍 잠', '사람과 대화', '할 일 하기'];
  const MINS = [5, 15, 30, 60];
  function clean(x) {
    x = Object.assign({ coins: [], min: 15 }, x);
    x.coins = (Array.isArray(x.coins) ? x.coins : []).filter(c => c && typeof c.what === 'string' && Number.isFinite(Number(c.min))).map(c => Object.assign(c, { id: String(c.id || uid()), min: Math.max(1, Math.min(600, Number(c.min))), t: Number(c.t) || Date.now(), won: Math.max(0, Math.floor(Number(c.won) || 0)), inst: typeof c.inst === 'string' ? c.inst : '' }));   // 자르지 않는다 — 오래된 동전이 사라지면 모은 시간이 줄어든다
    if (!MINS.includes(x.min)) x.min = 15;
    return x;
  }
  let D = clean(store());
  let what = '', inst = '';

  /* ---------- 동전 목록(내가 넣은 것 + 스위치에서 넘긴 충동) ---------- */
  function allCoins() {
    const sw = Z.log('switch').map(e => ({ id: 'sw-' + (e.id || e.t), t: e.t, what: '충동 넘김', inst: String(e.w || '').replace(/ \(\d+초\)$/, ''), min: 1, auto: true }));
    return D.coins.map(c => Object.assign({}, c)).concat(sw).sort((a, b) => a.t - b.t);
  }
  const rOf = c => { const m = c.size || c.min; return c.auto ? 11 : m <= 5 ? 13 : m <= 15 ? 16 : m <= 30 ? 19 : 22; };
  /* 통마다 나누기 — 통이 넘치면 동전의 남은 시간을 다음 통으로 넘긴다(조각). 원본 동전 수·돈은 원본 목록으로 센다(F6) */
  function jars(list) {
    const out = [[]]; let room = CAP, cum = 0;
    list.forEach(c => {
      let rest = c.min, part = 0;
      while (rest > 0) {
        if (room <= 0) { out.push([]); room = CAP; }
        const take = Math.min(room, rest);
        out[out.length - 1].push(Object.assign({}, c, { id: part ? c.id + '~' + part : c.id, src: c.id, min: take, size: c.min }));
        rest -= take; room -= take; cum += take; part++;
      }
    });
    return { jars: out, cum };
  }
  /* 쌓기 — 높이 지도 위에 떨어뜨린다. 같은 동전이면 늘 같은 자리(동전 id 로 정함) */
  const L0 = 38, R0 = 162, BOT = 232, TOP = 58;
  function pile(coins) {
    const hm = new Array(R0 - L0 + 1).fill(BOT), out = [];
    coins.forEach(c => {
      const r = rOf(c), base = hash(c.id);
      let best = null;
      for (let k = 0; k < 3; k++) {
        const span = R0 - L0 - 2 * r, cx = L0 + r + ((base >>> (k * 7)) % Math.max(1, span));
        let top = BOT; for (let x = Math.round(cx - r); x <= Math.round(cx + r); x++) top = Math.min(top, hm[x - L0] ?? BOT);
        if (!best || top > best.top) best = { cx, top };
      }
      const ry = r * 0.42, y = best.top - ry;
      for (let x = Math.round(best.cx - r * 0.85); x <= Math.round(best.cx + r * 0.85); x++) if (hm[x - L0] != null) hm[x - L0] = Math.min(hm[x - L0], y - ry * 0.55);
      out.push({ c, x: best.cx, y, r, ry, tilt: ((base % 21) - 10) * 0.9 });
    });
    return out;
  }
  function coinSVG(p, cls) {
    const c = p.c;
    return '<g class="bk-c' + (c.auto ? ' auto' : '') + (cls ? ' ' + cls : '') + '" data-id="' + Z.esc(c.id) + '" transform="translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ') rotate(' + p.tilt.toFixed(1) + ')">' +
      '<ellipse class="side" cx="0" cy="' + (p.ry * 0.5).toFixed(1) + '" rx="' + p.r + '" ry="' + p.ry.toFixed(1) + '"/>' +
      '<ellipse class="face" cx="0" cy="0" rx="' + p.r + '" ry="' + p.ry.toFixed(1) + '"/>' +
      '<ellipse class="rim" cx="0" cy="0" rx="' + (p.r * 0.62).toFixed(1) + '" ry="' + (p.ry * 0.62).toFixed(1) + '"/></g>';
  }
  const JAR = 'M58 40 C58 54 30 60 30 88 L30 216 C30 232 42 242 58 242 L142 242 C158 242 170 232 170 216 L170 88 C170 60 142 54 142 40 Z';
  let lastPile = [];
  function drawJar(hideId) {
    const list = allCoins(), J = jars(list), cur = J.jars[J.jars.length - 1];
    const jarMin = cur.reduce((a, c) => a + c.min, 0);
    lastPile = pile(cur);
    const lvl = Math.min(1, jarMin / CAP), fy = BOT + 6 - (BOT + 6 - TOP) * lvl;
    $('#bk-jar').innerHTML =
      '<defs><clipPath id="bk-clip"><path d="' + JAR + '"/></clipPath></defs>' +
      '<path class="bk-glass" d="' + JAR + '"/>' +
      '<g clip-path="url(#bk-clip)"><rect class="bk-level" x="20" y="' + fy.toFixed(1) + '" width="160" height="' + (260 - fy).toFixed(1) + '"/>' +
      '<line class="bk-line" x1="30" x2="170" y1="' + fy.toFixed(1) + '" y2="' + fy.toFixed(1) + '"/>' +
      '<g id="bk-pile">' + lastPile.map(p => coinSVG(p, p.c.src === hideId ? 'hide' : '')).join('') + '</g></g>' +
      '<path class="bk-shine" d="M44 96 C42 130 42 180 46 214"/>' +
      '<rect class="bk-lid" x="48" y="16" width="104" height="26" rx="7"/><rect class="bk-slot" x="78" y="25" width="44" height="7" rx="3.5"/>' +
      '<text class="bk-jartxt" x="100" y="150" text-anchor="middle">' + (cur.length ? '' : '첫 동전을 넣어요') + '</text>';
    $('#bk-jar').setAttribute('aria-label', (J.jars.length) + '번 통 — ' + Math.round(jarMin) + '분 찼어요, 동전 ' + cur.length + '개' + (J.jars.length > 1 ? ', 가득 찬 통 ' + (J.jars.length - 1) + '개' : ''));
    return { J, jarMin };
  }

  /* ---------- 숫자 ---------- */
  function fmtMin(m) { m = Math.round(m); if (m < 60) return [m, '분']; const hh = Math.floor(m / 60), mm = m % 60; return [hh + (mm ? '시간 ' + mm : ''), mm ? '분' : '시간']; }
  let shown = null;
  function paint(anim) {
    const { J, jarMin } = drawJar(anim ? anim.hide : null);
    const list = allCoins(), total = list.reduce((a, c) => a + c.min, 0);
    const wk = addDays(dayKey(), -6), week = list.filter(c => dayKey(c.t) >= wk).reduce((a, c) => a + c.min, 0);
    const [tv, tu] = fmtMin(total);
    if (anim && shown != null && total < 60 && shown < 60) countUp($('#bk-total'), shown, total, 700); else $('#bk-total').textContent = tv;
    $('#bk-total-u').textContent = tu; shown = total;
    $('#bk-week').textContent = fmtMin(week).join(''); $('#bk-coins').textContent = list.length + '개';
    const won = D.coins.reduce((a, c) => a + (c.won || 0), 0); $('#bk-money-li').hidden = !won; $('#bk-money').textContent = won.toLocaleString('ko-KR') + '원';
    const bar = $('#bk-fill'); bar.setAttribute('aria-valuenow', String(Math.round(jarMin))); bar.setAttribute('aria-valuetext', Math.round(jarMin) + '분 / 600분');
    bar.querySelector('i').style.width = Math.min(100, (jarMin / CAP) * 100) + '%';
    $('#bk-jar-n').textContent = J.jars.length + '번 통 · ' + Math.round(jarMin) + '분';
    $('#bk-jar-left').textContent = '가득까지 ' + fmtMin(CAP - jarMin).join('');
    const sh = $('#bk-shelf'); sh.innerHTML = ''; sh.hidden = J.jars.length < 2;
    J.jars.slice(0, -1).forEach((j, i) => { const last = j[j.length - 1]; sh.appendChild(h('li', null, h('span', { class: 'bk-mj', 'aria-hidden': 'true' }), h('b', { text: (i + 1) + '번 통' }), h('span', { text: '10시간 · ' + dayLabel(dayKey(last.t)) }))); });
    paintLists(list);
  }
  function top3(arr) { const m = {}; arr.forEach(x => { if (x) m[x] = (m[x] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 3); }
  function paintLists(list) {
    const mine = D.coins;
    const t1 = top3(mine.map(c => c.what)), t2 = top3(mine.map(c => c.inst));
    const fill = (el, rows, empty, label) => { el.innerHTML = ''; el.appendChild(h('li', { class: 'cap', text: label })); if (!rows.length) el.appendChild(h('li', { class: 'z-empty', text: empty })); rows.forEach(([k, n], i) => el.appendChild(h('li', null, h('span', { class: 'rk', text: String(i + 1) }), h('span', { class: 't', text: k }), h('b', { class: 'z-num', text: n + '번' })))); };
    fill($('#bk-top'), t1, '아직 없어요', '참은 것');
    fill($('#bk-top2'), t2, '«대신 한 일»을 고르면 보여요', '대신 한 것');
    $('#bk-top-r').textContent = '내가 넣은 동전 ' + mine.length + '개';
    const ul = $('#bk-recent'); ul.innerHTML = '';
    const rec = list.slice(-6).reverse();
    if (!rec.length) ul.appendChild(h('li', { class: 'z-empty', text: '첫 동전은 아주 작아도 돼요 — 쇼츠 5분 참기부터.' }));
    rec.forEach(c => ul.appendChild(h('li', null, h('span', { class: 'bk-dot' + (c.auto ? ' auto' : ''), 'aria-hidden': 'true' }), h('span', { class: 't', text: c.what + (c.inst ? ' → ' + c.inst : '') }), h('span', { class: 'm', text: (c.auto ? '' : c.min + '분 · ') + (dayKey(c.t) === dayKey() ? '오늘 ' : dayLabel(dayKey(c.t)) + ' ') + timeLabel(c.t) }))));
    const sw = list.filter(c => c.auto);
    const swt = sw.filter(c => dayKey(c.t) === dayKey()).length;
    $('#bk-sw').innerHTML = '';
    $('#bk-sw').append(sw.length ? h('span', null, '충동을 다른 행동으로 바꾼 ', h('b', { class: 'z-num', text: sw.length + '번' }), '이 은빛 동전(1분씩)으로 함께 들어 있어요' + (swt ? ' — 오늘 ' + swt + '번' : '') + '. ') : h('span', { text: '충동이 올 때 도파민 스위치로 30초를 바꾸면, 그 한 번이 은빛 동전이 되어 여기 쌓여요. ' }), h('a', { href: '../switch/', text: '도파민 스위치 열기' }));
  }

  /* ---------- 고르기 ---------- */
  function radio(box, items, get, set, labelOf) {
    box.innerHTML = '';
    items.forEach(v => {
      const c = h('button', { type: 'button', class: 'z-chip', role: 'radio', 'aria-checked': String(get() === v), text: labelOf ? labelOf(v) : v });
      c.addEventListener('click', () => { set(get() === v && box.id === 'bk-inst' ? '' : v); radio(box, items, get, set, labelOf); updCoin(); });
      box.appendChild(c);
    });
  }
  function renderPick() {
    radio($('#bk-what'), WHAT, () => what, v => { what = v; $('#bk-what-in').hidden = v !== '직접 적기'; if (v === '직접 적기') $('#bk-what-in').focus(); });
    radio($('#bk-inst'), INST, () => inst, v => { inst = v; });
    radio($('#bk-min'), MINS, () => D.min, v => { D.min = v; }, v => v + '분');
  }
  function curWhat() { return what === '직접 적기' ? $('#bk-what-in').value.trim() : what; }
  function updCoin() {
    const coin = $('#bk-coin'); $('#bk-coin-v').textContent = D.min;
    coin.dataset.size = D.min <= 5 ? 's' : D.min <= 15 ? 'm' : D.min <= 30 ? 'l' : 'xl';
    const ok = !!curWhat();
    coin.classList.toggle('ready', ok);
    coin.setAttribute('aria-label', ok ? D.min + '분 동전 넣기 — ' + curWhat() + ' 참음' : '동전 넣기 — 먼저 무엇을 참았는지 골라요');
    $('#bk-dock-t').textContent = ok ? '동전을 위 저금통으로 밀어 올리거나 눌러요' : '① 무엇을 참았는지 고르면 동전이 빛나요';
  }
  $('#bk-what-in').addEventListener('input', updCoin);

  /* ---------- 핵심: 동전 넣기(끌어 올리기 · 누르기 · 키보드) ---------- */
  const coin = $('#bk-coin');
  let drag = null, busy = false, pending = false;
  coin.addEventListener('pointerdown', e => {
    if (busy) return; e.preventDefault(); coin.setPointerCapture(e.pointerId);
    drag = { x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moved: false, vy: 0, lt: performance.now(), ly: e.clientY }; coin.classList.add('grab');
    if (curWhat() && fx() === 'full') tone(1200, 0, 0.03, 'sine', 0.025);
  });
  coin.addEventListener('pointermove', e => {
    if (!drag) return; drag.dx = e.clientX - drag.x0; drag.dy = e.clientY - drag.y0;
    const now = performance.now(), dt = Math.max(1, now - drag.lt); drag.vy = drag.vy * 0.6 + ((e.clientY - drag.ly) / dt) * 0.4; drag.lt = now; drag.ly = e.clientY;
    if (Math.abs(drag.dx) + Math.abs(drag.dy) > 8) drag.moved = true;
    if (drag.moved) coin.style.transform = 'translate(' + drag.dx + 'px,' + drag.dy + 'px) rotate(' + (drag.dx * 0.2) + 'deg)';
  });
  function release(e) {
    if (!drag) return; const d = drag; drag = null; coin.classList.remove('grab');
    if (e && e.type === 'pointercancel') { coin.style.transform = ''; return; }
    if (!d.moved || d.dy < -50 || (d.dy < -20 && d.vy < -0.5)) commit(d.moved ? { dx: d.dx, dy: d.dy } : null);   // 위로 휙 던져도 들어감
    else { coin.style.transition = 'transform .35s var(--pop)'; coin.style.transform = ''; setTimeout(() => { coin.style.transition = ''; }, 360); }
  }
  coin.addEventListener('pointerup', release); coin.addEventListener('pointercancel', release);
  coin.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) commit(null); } });
  coin.addEventListener('click', e => { if (e.detail === 0) commit(null); });   // 화면 읽기 도구의 «누르기»

  function refuse() { coin.classList.remove('bk-shake'); void coin.offsetWidth; coin.classList.add('bk-shake'); coin.style.transform = ''; buzz([10, 40, 10]); toast('무엇을 참았는지 먼저 골라 주세요'); const f = what === '직접 적기' ? $('#bk-what-in') : $('#bk-what .z-chip'); if (f) f.focus(); }
  let lastCommit = 0;
  function commit(off) {
    if (busy || Date.now() - lastCommit < 700) return;   // 키보드 누름 + 클릭이 겹쳐 두 번 들어가지 않게
    lastCommit = Date.now();
    const w = curWhat(); if (!w) { lastCommit = 0; refuse(); return; }
    D = Object.assign(clean(store()), { min: D.min }); pending = false;   // 다른 창에서 넣은 동전을 덮지 않게 최신 저장본 위에 더한다(F2)
    const before = jars(allCoins()).cum;
    const won = Math.max(0, Math.min(99999999, parseInt(($('#bk-won-in').value || '').replace(/[^\d]/g, ''), 10) || 0));
    const c = { id: uid(), t: Date.now(), what: w.slice(0, 30), inst, min: D.min, won };
    D.coins.push(c);
    const r = done('참음 · ' + c.what + (inst ? ' → ' + inst : '') + ' (' + c.min + '분)', { quiet: true, data: D, min: c.min, say: c.min + '분 저금했어요' });
    if (!r.entry) { D.coins = D.coins.filter(x => x !== c); coin.style.transform = ''; lastCommit = 0; return; }
    busy = true;
    fly(off, () => {
      paint({ hide: c.id });
      drop(c.id, () => {
        if (pending) { D = Object.assign(clean(store()), { min: D.min }); pending = false; renderPick(); updCoin(); }
        busy = false; paint({ added: true });
        const after = jars(allCoins()).cum, full = Math.floor(after / CAP);
        if (full > Math.floor(before / CAP)) Z.celebrate(null, { big: true, label: full + '번 통 가득 — 10시간 저금' });
        else if (fx() === 'full') Z.celebrate($('#bk-jarwrap'), { big: false, xp: '+' + c.min + '분' });
      });
    });
    // 다음 입력 준비(무엇을 참았나는 그대로 둔다 — 같은 것을 자주 참으니까)
    $('#bk-won-in').value = ''; inst = ''; renderPick(); updCoin();
  }
  /* 동전이 틈까지 날아간다(손가락에서 놓은 자리부터) */
  const fx = () => (reduced() ? (fxLevel() === 'off' ? 'off' : 'light') : fxLevel());   // full · light · off (보상은 점점 줄인다 — 14일 규칙)
  function fly(off, then) {
    if (fx() !== 'full') { coin.style.transition = ''; coin.style.transform = ''; if (fx() === 'light') tone(2093, 0, 0.05, 'sine', 0.04); then(); return; }
    // 저금통이 화면 밖이면 먼저 보이게 올린 뒤 날린다(떨어지는 걸 봐야 손맛이 산다)
    const jr0 = $('#bk-jar').getBoundingClientRect();
    if ((jr0.top < 50 || jr0.top > innerHeight * 0.55)) {
      coin.style.transform = ''; coin.classList.add('spent');
      window.scrollBy({ top: jr0.top - 80, behavior: 'smooth' });
      setTimeout(() => { coin.classList.remove('spent'); flyNow(off, then, true); }, 420);
      return;
    }
    flyNow(off, then);
  }
  function flyNow(off, then, fromBottom) {
    const cr = coin.getBoundingClientRect(), jr = $('#bk-jar').getBoundingClientRect();
    const sx = cr.left + cr.width / 2, sy = cr.top + cr.height / 2;
    const tx = jr.left + jr.width * 0.5, ty = jr.top + jr.height * (28 / 250);
    coin.style.transition = ''; coin.style.transform = '';
    const ghost = h('span', { class: 'bk-fly', 'aria-hidden': 'true', text: D.min });
    ghost.style.left = sx + 'px'; ghost.style.top = sy + 'px'; document.body.appendChild(ghost);
    coin.classList.add('spent');
    const t0 = performance.now(), dur = 420;
    (function fr(t) {
      const p = Math.min(1, (t - t0) / dur), e = p * p * (3 - 2 * p);
      const x = sx + (tx - sx) * e, y = sy + (ty - sy) * e - Math.sin(p * Math.PI) * 60;
      ghost.style.transform = 'translate(-50%,-50%) translate(' + (x - sx) + 'px,' + (y - sy) + 'px) scale(' + (1 - 0.45 * p) + ') rotateX(' + (p * 70) + 'deg)';
      if (p < 1) requestAnimationFrame(fr);
      else { ghost.remove(); tone(2093, 0, 0.05, 'sine', 0.055); tone(2637, 0.045, 0.08, 'sine', 0.045); then(); setTimeout(() => { coin.classList.remove('spent'); Z.popEl(coin); }, 380); }
    })(t0);
  }
  /* 통 안에서 떨어져 두어 번 튄다 */
  function drop(id, then) {
    const p = lastPile.slice().reverse().find(x => x.c.src === id);   // 통이 넘쳤으면 지금 통에 들어간 조각
    const g = p ? Array.from(document.querySelectorAll('#bk-pile .bk-c')).find(el => el.getAttribute('data-id') === p.c.id) : null;
    const lv = fx();
    if (!g || !p || lv !== 'full') { if (g) g.classList.remove('hide'); if (lv === 'light') land(true); then(); return; }
    g.classList.remove('hide');
    let y = 30, vy = 0, x = 100, bounces = 0; const t0 = performance.now(); let last = t0;
    (function fr(t) {
      const dt = Math.min(32, t - last) / 16.7; last = t;
      vy += 0.9 * dt; y += vy * dt; x += (p.x - x) * 0.12 * dt;
      if (y >= p.y) { y = p.y; if (Math.abs(vy) > 2.2 && bounces < 3) { vy = -vy * 0.32; bounces++; if (bounces === 1) land(); else tone(1700 - bounces * 200, 0, 0.03, 'sine', 0.03); } else { g.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ') rotate(' + p.tilt.toFixed(1) + ')'); then(); return; } }
      g.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + (p.tilt + (y < p.y ? vy * 4 : 0)).toFixed(1) + ')');
      if (t - t0 > 2500) { then(); return; }
      requestAnimationFrame(fr);
    })(t0);
  }
  function land(small) { if (fx() === 'off') return; tone(330, 0, 0.07, 'triangle', 0.06); if (small) { buzz(8); return; } tone(1760, 0.01, 0.05, 'sine', 0.035); tone(2349, 0.05, 0.05, 'sine', 0.025); buzz(14); }

  /* ---------- 시작 ---------- */
  renderPick(); updCoin(); paint();
  coach($('#bk-coach'), 'bank', ['쇼츠·배달·야식처럼 바로 하고 싶던 걸 참았으면, 무엇을 참았는지 골라요.', '대신 한 일과 아낀 시간을 고르고, 동전을 저금통으로 밀어 올려요(눌러도 돼요).', '10시간이 모이면 통 하나가 가득 차요. 도파민 스위치로 넘긴 충동도 함께 쌓여요.']);
  Z.on('change', ev => { if (!ev || !ev.remote) return; if (busy) { pending = true; return; } D = Object.assign(clean(store()), { min: D.min }); renderPick(); updCoin(); paint(); });
})();
