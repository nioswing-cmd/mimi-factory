/* B-09 어제의 나를 이겨라 — 남이 아니라 어제의 나와만 겨룬다.
   참고한 원리: Strava(지난 기록 «고스트»와 같은 구간 비교, 개인 기록 PR) · Apple Fitness(링이 닫히는 만족, 어제 대비) ·
   Nike Run Club(개인 최고 기록 축하) · Gentler Streak(못한 날을 탓하지 않는 말투) — 자세한 참고는 설계서 2차.
   🔴 비교 상대는 «어제 이 시각의 나» — 하루가 다 안 끝났는데 어제 하루 전체와 비교해 지는 느낌을 주지 않는다. 타인·순위 없음.
   🔴 1차 다섯 앱의 기록(공통 log)이 그대로 오늘·어제 숫자가 된다.
   핵심 인터랙션 = 링 + 고스트 경주: 세 링에 어제 이 시각(점선 고스트)과 오늘(빛 링)을 겹치고, «다시 겨루기»를 누르면 0시부터 지금까지 나와 고스트가 함께 달린다. */
(function () {
  'use strict';
  const { h, $, $$, store, save, done, amend, toast, buzz, tone, reduced, coach, uid, dayKey, addDays, dayLabel, daySum, kindOf, fxLevel, countUp, meta } = Z;
  const PRESETS = [['팔굽혀펴기', '회'], ['스쿼트', '회'], ['물', '잔'], ['책', '쪽'], ['걸음', '천 보'], ['집중', '분']];
  function clean(x) {
    x = Object.assign({ metric: null, recs: [], win: '', mwin: '' }, x);
    if (!x.metric || typeof x.metric.name !== 'string' || !x.metric.name.trim()) x.metric = null;
    else x.metric = { name: x.metric.name.slice(0, 16), unit: typeof x.metric.unit === 'string' ? x.metric.unit.slice(0, 6) : '' };
    x.recs = (Array.isArray(x.recs) ? x.recs : []).filter(r => r && typeof r.d === 'string' && Number.isFinite(Number(r.v))).map(r => Object.assign(r, { v: Math.max(0, Math.min(99999, Math.round(Number(r.v)))), k: typeof r.k === 'string' ? r.k : '', u: typeof r.u === 'string' ? r.u : '' })).slice(-400);
    return x;
  }
  let D = clean(store());
  const pad = n => String(n).padStart(2, '0');
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

  /* ---------- 세 링 ---------- */
  function compare() {
    const t = dayKey(), y = addDays(t, -1), m = nowMin();
    return { t, y, m, today: daySum(t), yNow: daySum(y, m), yAll: daySum(y) };
  }
  const RINGS = [['n', '행동', '개'], ['kinds', '종류', '가지'], ['min', '해 본 시간', '분']];
  function ringSVG(today, ghost, target) {
    const R = 40, C = 2 * Math.PI * R;
    const f = v => Math.max(0, Math.min(1, v / target));
    const win = today >= target;
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="trk" cx="50" cy="50" r="' + R + '"/>' +
      '<circle class="gh" cx="50" cy="50" r="' + R + '" stroke-dasharray="' + (C * f(ghost)).toFixed(1) + ' ' + C.toFixed(1) + '"/>' +
      '<circle class="me' + (win ? ' win' : '') + '" cx="50" cy="50" r="' + R + '" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - f(today))).toFixed(1) + '"/>' +
      '<circle class="dot" cx="' + (50 + R * Math.cos(2 * Math.PI * f(ghost))).toFixed(1) + '" cy="' + (50 + R * Math.sin(2 * Math.PI * f(ghost))).toFixed(1) + '" r="3.4"/></svg>';
  }
  let firstPaint = true;
  function paintRings(c) {
    const ul = $('#bt-rings'); ul.innerHTML = '';
    RINGS.forEach(([key, label, unit]) => {
      const tv = c.today[key], gv = c.yNow[key], all = c.yAll[key], target = Math.max(1, all + (key === 'min' ? 1 : 1));
      const win = tv >= target;
      const li = h('li', { class: 'bt-ring' + (win ? ' win' : '') },
        h('div', { class: 'bt-rsvg', html: ringSVG(firstPaint && !reduced() ? 0 : tv, gv, target) }, h('div', { class: 'bt-rnum', 'aria-hidden': 'true' }, h('b', { class: 'z-num z-tnum', text: fmtv(tv, key) }), h('span', { class: 'u', text: unit }))),
        h('p', { class: 'bt-rl', text: label }),
        h('p', { class: 'bt-rg', text: '어제 이 시각 ' + fmtv(gv, key) }),
        win ? h('span', { class: 'bt-win', text: 'WIN' }) : null,
        h('span', { class: 'sr-only', text: label + ': 오늘 ' + fmtv(tv, key) + unit + ', 어제 이 시각 ' + fmtv(gv, key) + unit + ', 어제 하루 ' + fmtv(all, key) + unit + (win ? ' — 이겼어요' : '') }));
      ul.appendChild(li);
      if (firstPaint && !reduced()) { const me = li.querySelector('.me'), R = 40, C = 2 * Math.PI * R; requestAnimationFrame(() => requestAnimationFrame(() => { me.setAttribute('stroke-dashoffset', (C * (1 - Math.max(0, Math.min(1, tv / target)))).toFixed(1)); })); }
    });
    firstPaint = false;
  }
  const fmtv = (v, key) => (key === 'min' ? (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10) : v);
  function verdict(c) {
    const T = c.today.n, Y = c.yAll.n, YN = c.yNow.n;
    let s;
    if (Y === 0 && T === 0) s = '어제도 오늘도 아직 0 — 지금 하나면 바로 이겨요.';
    else if (T > Y) s = '오늘은 이미 이겼어요! 어제 하루 ' + Y + '개 → 오늘 ' + T + '개.';
    else if (T > YN) s = '어제 이 시각보다 ' + (T - YN) + '개 앞서요. ' + (Y + 1 - T) + '개 더 하면 어제 하루를 넘어요.';
    else if (T === YN) s = '어제 이 시각과 나란히 ' + T + '개. 하나만 더 하면 앞서요.';
    else s = '어제 이 시각엔 ' + YN + '개였어요. ' + (YN - T) + '개면 따라잡아요 — 지는 게 아니라 아직 안 한 거예요.';
    $('#bt-verdict').textContent = s;
    $('#bt-clock').textContent = pad(Math.floor(c.m / 60)) + ':' + pad(c.m % 60) + ' 기준';
  }

  /* ---------- 고스트 경주 ---------- */
  const X0 = 24, X1 = 312, Y0 = 18, Y1 = 132;
  function cum(list) { return list.map((e, i) => ({ m: new Date(e.t).getHours() * 60 + new Date(e.t).getMinutes(), c: i + 1 })); }
  function race(c, upto) {
    const yl = cum(c.yAll.list), tl = cum(c.today.list).filter(p => p.m <= c.m);
    const max = Math.max(3, c.yAll.n, c.today.n);
    const X = m => X0 + (X1 - X0) * (m / 1440), Y = v => Y1 - (Y1 - Y0) * (v / max);
    const step = (pts, end) => { let d = 'M' + X(0) + ' ' + Y(0), v = 0; pts.forEach(p => { d += ' H' + X(p.m).toFixed(1) + ' V' + Y(p.c).toFixed(1); v = p.c; }); d += ' H' + X(end).toFixed(1); return d; };
    const lim = upto == null ? c.m : upto;
    const at = (pts, m) => pts.filter(p => p.m <= m).length;
    const gy = at(yl, lim), ty = at(tl, lim);
    let s = '';
    [0, 6, 12, 18, 24].forEach(hh => { s += '<line class="gr" x1="' + X(hh * 60) + '" x2="' + X(hh * 60) + '" y1="' + Y0 + '" y2="' + Y1 + '"/><text class="ax" x="' + X(hh * 60) + '" y="' + (Y1 + 16) + '" text-anchor="middle">' + hh + '시</text>'; });
    for (let v = 0; v <= max; v += Math.max(1, Math.ceil(max / 4))) s += '<text class="ax" x="' + (X0 - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + v + '</text>';
    s += '<defs><clipPath id="bt-clip"><rect x="0" y="0" width="' + X(lim).toFixed(1) + '" height="156"/></clipPath></defs>';
    s += '<path class="ghost-full" d="' + step(yl, 1440) + '"/>';
    s += '<g clip-path="url(#bt-clip)"><path class="ghost" d="' + step(yl, 1440) + '"/><path class="mine" d="' + step(tl, c.m) + '"/></g>';
    s += '<line class="now" x1="' + X(lim) + '" x2="' + X(lim) + '" y1="' + (Y0 - 8) + '" y2="' + Y1 + '"/><text class="nowt" x="' + X(lim) + '" y="' + (Y0 - 10) + '" text-anchor="middle">' + (upto == null ? '지금' : pad(Math.floor(lim / 60)) + ':' + pad(lim % 60)) + '</text>';
    const left = X(lim) > 170, tx = left ? -11 : 11, an = left ? 'end' : 'start';   // 이름표는 화면 안쪽으로
    s += '<g class="gdot" transform="translate(' + X(lim) + ' ' + Y(gy) + ')"><circle r="7"/><text x="' + tx + '" y="' + (gy >= ty ? -6 : 14) + '" text-anchor="' + an + '">어제 ' + gy + '</text></g>';
    s += '<g class="mdot" transform="translate(' + X(lim) + ' ' + Y(ty) + ')"><circle r="6.5"/><text x="' + tx + '" y="' + (gy >= ty ? 14 : -6) + '" text-anchor="' + an + '">나 ' + ty + '</text></g>';
    $('#bt-race').innerHTML = s;
    $('#bt-race').setAttribute('aria-label', '0시부터 지금까지 쌓인 행동 수 — 오늘 ' + ty + '개, 어제 같은 시각 ' + gy + '개, 어제 하루 ' + c.yAll.n + '개');
    return { gy, ty };
  }
  let racing = 0;
  $('#bt-replay').addEventListener('click', () => {
    const c = compare();
    if (reduced()) { race(c); return; }
    cancelAnimationFrame(racing);
    const t0 = performance.now(), dur = 2600; let lead = 0;
    tone(392, 0, 0.08, 'square', 0.035); tone(523, 0.1, 0.08, 'square', 0.035); tone(784, 0.2, 0.14, 'square', 0.04);
    (function fr(t) {
      const p = Math.min(1, (t - t0) / dur), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const r = race(c, Math.round(c.m * e));
      const nl = Math.sign(r.ty - r.gy);
      if (nl !== lead) { if (nl > 0) { tone(1046, 0, 0.06, 'square', 0.035); buzz(10); } else if (nl < 0) tone(330, 0, 0.06, 'triangle', 0.04); lead = nl; }
      if (p < 1) racing = requestAnimationFrame(fr);
      else { race(c); if (r.ty > r.gy) { tone(784, 0, 0.08); tone(1175, 0.08, 0.14); Z.announce('어제 이 시각보다 ' + (r.ty - r.gy) + '개 앞섰어요'); } else Z.announce(r.ty === r.gy ? '어제와 나란히 왔어요' : '어제 이 시각까지 ' + (r.gy - r.ty) + '개 남았어요'); }
    })(t0);
  });

  /* ---------- 내 종목 ---------- */
  // 종목 = 이름 + 단위(«집중 분»과 «집중 회»는 다른 종목 — F5). 단위가 없는 옛 기록은 단위 없는 종목에만 맞춘다
  function recOf(d) { return D.metric ? D.recs.find(r => r.d === d && r.k === D.metric.name && (r.u || '') === D.metric.unit) : null; }
  let inputDay = dayKey();   // 입력 칸 숫자가 어느 날 것인지 — 자정을 넘기면 비운다(F4)
  function dayTurned() { if (inputDay === dayKey()) return false; inputDay = dayKey(); const tr = recOf(inputDay); $('#bt-v').value = String(tr ? tr.v : 0); paintAll(); toast('날짜가 바뀌었어요 — 오늘 숫자를 새로 적어요', 3200); return true; }
  function paintMine() {
    const has = !!D.metric;
    $('#bt-setup').hidden = has; $('#bt-play').hidden = !has;
    if (!has) {
      const pb = $('#bt-presets'); pb.innerHTML = '';
      PRESETS.forEach(([n, u]) => pb.appendChild(h('button', { type: 'button', class: 'z-chip', text: n + ' (' + u + ')', onclick: () => { $('#bt-name').value = n; $('#bt-unit').value = u; $('#bt-set-ok').focus(); } })));
      return;
    }
    const t = dayKey(), y = addDays(t, -1), tr = recOf(t), yr = recOf(y);
    $('#bt-mname').textContent = D.metric.name;
    $('#bt-yv').textContent = yr ? yr.v : '–'; $('#bt-yu').textContent = yr ? D.metric.unit : '기록 없음';
    $('#bt-tu').textContent = D.metric.unit;
    if (document.activeElement !== $('#bt-v')) { $('#bt-v').value = String(tr ? tr.v : 0); inputDay = t; }
    paintDelta();
  }
  function curV() { return Math.max(0, Math.min(99999, parseInt(($('#bt-v').value || '0').replace(/[^\d]/g, ''), 10) || 0)); }
  function paintDelta() {
    const yr = recOf(addDays(dayKey(), -1)), v = curV(), el = $('#bt-delta');
    el.className = 'bt-delta';
    if (!yr) { el.textContent = '어제 기록이 없어요 — 오늘 기록이 내일의 상대가 돼요.'; return; }
    const d = v - yr.v;
    if (d > 0) { el.textContent = '+' + d + ' — 어제의 나를 넘어요!'; el.classList.add('up'); }
    else if (d === 0) el.textContent = '어제와 같아요. 하나만 더!';
    else el.textContent = (-d) + ' 남았어요. 어제 ' + yr.v + D.metric.unit + '를 넘으면 이겨요.';
  }
  function bump(n) { if (dayTurned()) return; const v = Math.max(0, curV() + n); $('#bt-v').value = String(v); tone(n > 0 ? 880 : 520, 0, 0.04, 'square', 0.03); buzz(6); Z.popEl($('#bt-v')); paintDelta(); }
  $('#bt-plus').addEventListener('click', () => bump(1)); $('#bt-minus').addEventListener('click', () => bump(-1));
  $('#bt-v').addEventListener('input', paintDelta);
  $('#bt-v').addEventListener('keydown', e => { if (e.key === 'ArrowUp') { e.preventDefault(); bump(1); } if (e.key === 'ArrowDown') { e.preventDefault(); bump(-1); } });
  $('#bt-set-ok').addEventListener('click', () => {
    const n = $('#bt-name').value.trim(), u = $('#bt-unit').value.trim();
    if (n.length < 1) { toast('종목 이름을 적거나 예시를 골라 주세요'); $('#bt-name').focus(); return; }
    const prev = D.metric; D.metric = { name: n.slice(0, 16), unit: u.slice(0, 6) };
    if (!save(D)) { D.metric = prev; return; }
    paintMine(); $('#bt-v').focus(); toast('«' + n + '» 로 어제의 나와 겨뤄요');
  });
  $('#bt-mchange').addEventListener('click', () => { $('#bt-name').value = D.metric ? D.metric.name : ''; $('#bt-unit').value = D.metric ? D.metric.unit : ''; D.metric = null; paintMine(); $('#bt-name').focus(); });
  $('#bt-save').addEventListener('click', e => {
    if (dayTurned()) return;
    const t = dayKey(), y = addDays(t, -1), v = curV(), yr = recOf(y), old = recOf(t);
    const w = '어제의 나 · ' + D.metric.name + ' ' + v + D.metric.unit + (yr ? ' (어제 ' + yr.v + ')' : '');
    const min = D.metric.unit === '분' ? v : undefined;   // 0분으로 고치면 해 본 시간도 지운다(F3)
    const prevRecs = JSON.parse(JSON.stringify(D.recs)), prevWin = D.mwin;
    const win = !!(yr && v > yr.v && D.mwin !== t);
    if (win) D.mwin = t;
    let ok;
    if (old && old.id && Z.hasLog(old.id)) {   // 오늘 이미 남겼으면 같은 줄을 고친다 — 종목 값과 공통 기록을 한 번에 저장(F4)
      old.v = v;
      ok = amend(old.id, { w, min }, { data: D });
      if (ok) toast('오늘 기록을 ' + v + D.metric.unit + '로 고쳤어요');
    } else {   // 새로 남기기 — 기록 id 를 미리 정해 종목 자료에 함께 담는다
      const id = uid(), rec = old || { d: t, v, k: D.metric.name, u: D.metric.unit, id: '' };
      rec.v = v; rec.id = id; if (!old) D.recs.push(rec);
      ok = !!done(w, { quiet: true, data: D, min: min || undefined, id, say: '오늘 기록을 남겼어요' }).entry;
    }
    if (!ok) { D.recs = prevRecs; D.mwin = prevWin; return; }   // 저장 실패 — 화면 값은 그대로 두고 아무것도 바꾸지 않음
    if (win) Z.celebrate(e.currentTarget, { big: true, label: D.metric.name + ' ' + yr.v + ' → ' + v + ' · 어제의 나를 이김' });
    else if (!old) Z.celebrate(e.currentTarget, { big: false });
    paintAll();
  });

  /* ---------- 7일 ---------- */
  function paintWeek() {
    const ol = $('#bt-days'); ol.innerHTML = ''; let w = 0, cnt = 0;
    for (let i = 6; i >= 0; i--) {
      const d = addDays(dayKey(), -i), p = addDays(d, -1), a = daySum(d).n, b = daySum(p).n;
      const res = i === 0 ? (a > b ? 'w' : 'live') : (a > b ? 'w' : a === b ? 'd' : 'l');
      if (res === 'w') w++; if (i > 0 || res === 'w') cnt++;
      const [, mm, dd] = d.split('-').map(Number);
      ol.appendChild(h('li', { class: 'bt-day ' + res, 'aria-label': (i === 0 ? '오늘' : mm + '월 ' + dd + '일') + ' ' + a + '개, 전날 ' + b + '개 — ' + ({ w: '이김', d: '같음', l: '전날이 더 많음', live: '진행 중' })[res] },
        h('span', { class: 'dl', text: i === 0 ? '오늘' : mm + '/' + dd }), h('b', { class: 'z-num', text: a }), h('span', { class: 'rs', text: ({ w: 'WIN', d: '=', l: '·', live: '…' })[res] })));
    }
    $('#bt-wsum').textContent = '7일 중 ' + w + '일 전날의 나를 넘었어요. 진 날은 실패가 아니라 쉬어 간 날이에요.';
  }

  /* ---------- 어제보다 나은 한 가지 ---------- */
  function paintBetter(c) {
    const ul = $('#bt-better'); ul.innerHTML = ''; const out = [];
    const T = c.today, Y = c.yAll, YN = c.yNow;
    if (T.n > YN.n) out.push(['행동', '어제 이 시각보다 ' + (T.n - YN.n) + '개 더 했어요']);
    if (T.kinds > Y.kinds) out.push(['종류', '어제보다 ' + (T.kinds - Y.kinds) + '가지 더 다양하게 움직였어요']);
    if (T.min > YN.min) out.push(['시간', '해 본 시간이 어제 이 시각보다 ' + Math.round((T.min - YN.min) * 10) / 10 + '분 길어요']);
    if (T.list.length && (!Y.list.length || new Date(T.list[0].t).getHours() * 60 + new Date(T.list[0].t).getMinutes() < new Date(Y.list[0].t).getHours() * 60 + new Date(Y.list[0].t).getMinutes())) out.push(['시작', '첫 행동이 어제보다 빨랐어요(' + Z.timeLabel(T.list[0].t) + ')']);
    const mods = meta.mods || {};
    Object.keys(mods).forEach(s => { const a = T.list.filter(e => e.m === s).length, b = Y.list.filter(e => e.m === s).length; if (a > b && a > 0 && s !== 'beat') out.push([mods[s].code, mods[s].name + ' ' + a + '번 (어제 ' + b + ')']); });
    const tr = recOf(c.t), yr = recOf(c.y); if (tr && yr && tr.v > yr.v) out.push(['종목', D.metric.name + ' ' + yr.v + ' → ' + tr.v + D.metric.unit]);
    if (!out.length) {
      ul.appendChild(h('li', { class: 'z-empty' }, '아직 어제보다 나은 게 안 보여요. 지금 하나만 해도 «행동» 링이 움직여요 — ', h('a', { href: '../starter/', text: '3초 스타터' }), ' · ', h('a', { href: '../switch/', text: '도파민 스위치' })));
      return;
    }
    out.slice(0, 6).forEach(([k, t]) => ul.appendChild(h('li', null, h('span', { class: 'z-tag acc', text: k }), h('span', { class: 't', text: t }))));
  }

  function paintAll() { const c = compare(); paintRings(c); verdict(c); race(c); paintMine(); paintWeek(); paintBetter(c); return c; }
  const c0 = paintAll();
  // 오늘이 어제 하루를 넘었으면 하루 한 번 «WIN»
  if (c0.today.n > c0.yAll.n && c0.today.n > 0 && D.win !== c0.t) { D.win = c0.t; save(D); setTimeout(() => Z.celebrate($('#bt-rings'), { big: true, label: '어제의 나를 넘었어요 · ' + c0.yAll.n + ' → ' + c0.today.n }), reduced() ? 0 : 900); }
  coach($('#bt-coach'), 'beat', ['좀비탈출 앱에서 해낸 일이 저절로 «오늘의 나»가 되고, 어제 같은 시각의 나와 겨뤄요.', '링 세 개 중 하나라도 어제 하루를 넘기면 WIN이에요.', '내 종목(팔굽혀펴기·물 잔 등)을 정하면 어제 숫자와 나란히 겨룰 수 있어요.']);
  setInterval(() => { if (document.activeElement && document.activeElement.id === 'bt-v') return; if (inputDay !== dayKey()) { paintAll(); return; } const c = compare(); paintRings(c); verdict(c); race(c); }, 60000);
  Z.on('change', ev => { if (!ev || !ev.remote) return; D = clean(store()); paintAll(); });
})();
