/* A-04 행동 룰렛 — 고르기 귀찮을 땐 돌려서 나온 걸.
   참고한 원리: Me+(«작은 자기돌봄 하나 뽑기» — 보상이 아니라 행동을 뽑는다) · Thrive·Yazio(맨 위 바늘 한 개로 결과가 분명) ·
   SHEIN·Octopus(테두리 불빛이 돌며 기대감) · 실제 룰렛의 «딸깍이»(칸을 지날 때마다 바늘이 튕기는 촉감).
   🔴 상품·확률·포인트 없음. 나오는 건 «5분짜리 성장 행동»뿐.
   핵심 인터랙션 = 감속 물리 룰렛: 손가락으로 휙 돌리면 그 세기만큼 돌고, 칸을 지날 때마다 바늘이 튕기며 딸깍(소리·진동), 점점 느려져 멈춘다. */
(function () {
  'use strict';
  const { h, $, $$, store, save, done, toast, buzz, tone, reduced, timer, coach, uid, shuffle } = Z;
  const DEF = [
    ['책 5쪽 읽기', '책 5쪽', 5], ['스트레칭', '스트레칭', 5], ['방 한 구석 정리', '한 구석 정리', 5], ['영어 단어 5개', '단어 5개', 5],
    ['산책 한 바퀴', '산책', 10], ['감사한 일 3줄 쓰기', '감사 3줄', 3], ['내일 할 일 3개 적기', '내일 3개', 3], ['팔굽혀펴기 10번', '팔굽혀펴기', 2],
    ['물 마시고 창문 열기', '물·창문', 2], ['사진·메모 정리', '사진 정리', 5], ['좋아하는 노래 따라 부르기', '노래 한 곡', 3], ['안부 문자 한 통', '안부 문자', 3]
  ].map(([name, short, min]) => ({ id: uid(), name, short, min }));
  function clean(x) {
    x = Object.assign({ items: DEF, spins: [], addMin: 5 }, x);
    x.items = (Array.isArray(x.items) ? x.items : []).filter(it => it && typeof it.name === 'string' && it.name.trim()).map(it => ({ id: String(it.id || uid()), name: it.name.slice(0, 24), short: typeof it.short === 'string' && it.short ? it.short.slice(0, 8) : it.name.slice(0, 7), min: [1, 2, 3, 5, 10, 15].includes(Number(it.min)) ? Number(it.min) : 5 })).slice(0, 12);
    if (x.items.length < 3) x.items = DEF.map(d => Object.assign({}, d));
    x.spins = (Array.isArray(x.spins) ? x.spins : []).filter(z => z && typeof z.name === 'string').map(z => Object.assign(z, { id: String(z.id || uid()), did: z.did === undefined ? 'old' : z.did }));
    if (![2, 3, 5, 10].includes(x.addMin)) x.addMin = 5;
    return x;
  }
  let D = clean(store());
  const N = 8, CX = 200, R = 178;
  let face = [];            // 지금 바퀴에 올라간 8칸
  let rot = 0;              // 바퀴 각도(도, 시계 방향)
  let spinning = false, result = null, respins = 0, T = null, idleIv = null, round = 0, spinId = null;
  /* 지금 판의 기록 — 마지막 줄이 아니라 id 로 찾는다(F6). 없거나 이미 처리됐으면 null */
  function curSpin() { const z = spinId ? D.spins.find(x => x.id === spinId) : null; return z && z.did === null ? z : null; }   // spinning = 돌기 시작~결과 화면이 뜰 때까지 잠금(F13)
  const disc = $('#ro-disc'), lights = $('#ro-lights'), flap = $('#ro-flap'), wheel = $('#ro-wheel'), stage = $('.ro-stage');
  function persist() { D.spins = D.spins.slice(-400); save(D); }

  /* ---------- 바퀴 그리기 ---------- */
  function pickFace() {
    if (D.items.length <= N) { face = D.items.slice(); while (face.length < N) face = face.concat(D.items).slice(0, N); }
    else face = shuffle(D.items).slice(0, N);
  }
  function pt(a, r) { const t = (a - 90) * Math.PI / 180; return [CX + r * Math.cos(t), CX + r * Math.sin(t)]; }
  function drawDisc() {
    const seg = 360 / N; let s = '';
    face.forEach((it, i) => {
      const a0 = i * seg, a1 = a0 + seg; const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R);
      s += `<path class="${i % 2 ? 'ro-seg-b' : 'ro-seg-a'}" d="M${CX} ${CX}L${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z"/>`;
    });
    face.forEach((_, i) => { const [x, y] = pt(i * seg, R); s += `<line class="ro-sep" x1="${CX}" y1="${CX}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}"/>`; const [px, py] = pt(i * seg, R - 6); s += `<circle class="ro-peg" cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="4"/>`; });
    face.forEach((it, i) => {
      const c = i * seg + seg / 2; const lab = it.short.length > 7 ? it.short.slice(0, 6) + '…' : it.short;
      s += `<g transform="rotate(${c} ${CX} ${CX})"><text class="ro-lab ${i % 2 ? 'b' : 'a'}" x="${CX}" y="${CX - 112}" text-anchor="middle" transform="rotate(${c > 180 ? 90 : -90} ${CX} ${CX - 112})">${Z.esc(lab)}</text></g>`;
    });
    s += `<circle cx="${CX}" cy="${CX}" r="${R}" fill="none" stroke="var(--ink)" stroke-width="4"/>`;
    disc.innerHTML = s;
    setRot(rot);
  }
  function drawLights() {
    let s = `<circle class="rim" cx="${CX}" cy="${CX}" r="197"/>`;
    for (let i = 0; i < 24; i++) { const [x, y] = pt(i * 15, 189); s += `<circle data-i="${i}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4.6"/>`; }
    lights.innerHTML = s;
  }
  function setRot(d) { rot = d; disc.style.transform = `rotate(${d}deg)`; disc.style.transformOrigin = '50% 50%'; }
  function idxAt(d) { const a = (((-d) % 360) + 360) % 360; return Math.floor(a / (360 / N)) % N; }
  function lightsAt(k, n) { $$('circle[data-i]', lights).forEach(c => { const i = +c.dataset.i; c.classList.toggle('on', n ? ((i - k) % 24 + 24) % 24 < n : (i + k) % 2 === 0); }); }
  function idle(on) { clearInterval(idleIv); if (!on) return; let k = 0; lightsAt(0); idleIv = setInterval(() => { k++; lightsAt(k); }, 700); }

  /* ---------- 핵심: 감속 물리 ---------- */
  let lastTick = 0;
  function kick(v) {
    const now = performance.now();
    const deg = Math.max(-28, Math.min(-8, -6 - Math.abs(v) * 14)) * Math.sign(v || 1);
    flap.classList.remove('back'); flap.classList.add('kick'); flap.style.transform = `rotate(${deg}deg)`;
    requestAnimationFrame(() => { flap.classList.remove('kick'); flap.classList.add('back'); flap.style.transform = 'rotate(0deg)'; });
    if (now - lastTick > 30) { lastTick = now; tone(1700 + Math.random() * 120, 0, 0.012, 'square', 0.02); buzz(4); }
  }
  function chooseTarget() {
    const last = D.spins.slice(-2).map(s => s.name);
    const banned = last.length === 2 && last[0] === last[1] ? last[0] : null;   // 같은 활동 연속 3번 방지
    const cand = face.map((it, i) => i).filter(i => face[i].name !== banned && !(result && face[i].name === result.name && respins));
    return Z.pick(cand.length ? cand : face.map((_, i) => i));
  }
  function spin(power, dir) {
    if (spinning) return;
    spinning = true; $('#ro-spin').disabled = true; $('#ro-hub').disabled = true; idle(false); stage.classList.remove('win');
    if (C) C.close();
    const seg = 360 / N, t = chooseTarget(); const j = (Math.random() * 0.7 - 0.35) * seg; const aT = (t + 0.5) * seg + j;
    const turns = Math.round(Math.max(3, Math.min(8, 3 + power * 3)));
    const mod = x => ((x % 360) + 360) % 360;
    const r0 = rot;
    const delta = dir >= 0 ? mod(-aT - r0) + turns * 360 : -mod(r0 + aT) - turns * 360;
    const dur = reduced() ? 0 : Math.max(3200, Math.min(5600, 3400 + power * 1200));
    tone(392, 0, 0.08, 'triangle', 0.06); buzz(20);
    if (!dur) { setRot(r0 + delta); land(t); return; }
    const t0 = performance.now(); let prevIdx = idxAt(r0), prevD = r0;
    const ease = x => 1 - Math.pow(1 - x, 3.2);
    (function fr(now) {
      const x = Math.min(1, (now - t0) / dur); const d = r0 + delta * ease(x);
      setRot(d);
      const v = (d - prevD) / 16; prevD = d;               // 대략 도/ms
      const k = idxAt(d); if (k !== prevIdx) { prevIdx = k; kick(v); }
      lightsAt(Math.floor(x * 140), 3);
      if (x < 1) requestAnimationFrame(fr); else land(t);
    })(t0);
  }
  function land(t) {
    const my = ++round;
    stage.classList.add('win'); setTimeout(() => { stage.classList.remove('win'); }, 1400);
    result = face[idxAt(rot)] || face[t];
    tone(784, 0, 0.09); tone(1046, 0.09, 0.14); buzz([18, 30, 30]);
    spinId = uid(); D.spins.push({ id: spinId, t: Date.now(), name: result.name, did: null }); persist();
    $('#ro-live').textContent = '나왔어요: ' + result.name + ', ' + result.min + '분';
    setTimeout(() => { if (my !== round) return; spinning = false; $('#ro-spin').disabled = false; $('#ro-hub').disabled = false; showResult(); }, reduced() ? 0 : 520);
  }

  /* 손가락으로 휙 돌리기 */
  let g = null;
  function ang(e) { const r = wheel.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; }
  wheel.addEventListener('pointerdown', e => { if (spinning) return; wheel.setPointerCapture(e.pointerId); wheel.classList.add('grab'); g = { a: ang(e), r: rot, s: [[performance.now(), rot]], prevIdx: idxAt(rot) }; idle(false); });
  wheel.addEventListener('pointermove', e => {
    if (!g) return; let da = ang(e) - g.a; if (da > 180) da -= 360; if (da < -180) da += 360;
    g.a += da; const d = rot + da; setRot(d); const k = idxAt(d); if (k !== g.prevIdx) { g.prevIdx = k; kick(da / 16); }
    g.s.push([performance.now(), d]); if (g.s.length > 6) g.s.shift();
  });
  function up() {
    if (!g) return; const s = g.s; g = null; wheel.classList.remove('grab');
    const a = s[0], b = s[s.length - 1]; const dt = Math.max(1, b[0] - a[0]); const v = (b[1] - a[1]) / dt; // 도/ms
    if (Math.abs(v) > 0.25) spin(Math.min(2, Math.abs(v)), Math.sign(v)); else { idle(true); }
  }
  wheel.addEventListener('pointerup', up); wheel.addEventListener('pointercancel', up);
  $('#ro-spin').addEventListener('click', () => spin(0.6 + Math.random() * 0.6, 1));
  $('#ro-hub').addEventListener('click', () => spin(0.6 + Math.random() * 0.6, 1));

  /* ---------- 결과 ---------- */
  function showResult() {
    if (T) { T.stop(); T = null; }
    $('#ro-home').hidden = true; $('#ro-result').hidden = false;
    $('#ro-res-t').textContent = result.name; $('#ro-res-m').textContent = result.min + '분 · 지금 바로';
    const card = $('#ro-card'); if (!reduced()) { card.classList.remove('pop-in'); void card.offsetWidth; card.classList.add('pop-in'); }
    $('#ro-start').textContent = result.min + '분 시작';
    const ag = $('#ro-again'); ag.disabled = respins >= 1;
    ag.textContent = respins >= 1 ? '고르기 귀찮을 땐 나온 걸 해요' : '한 번만 다시 돌리기';
    $('#ro-timer').innerHTML = ''; $('#ro-res-btns').hidden = false; $('#ro-done-btns').hidden = true;
    window.scrollTo({ top: 0, behavior: 'auto' }); $('#ro-res-t').focus({ preventScroll: true });
  }
  function backHome(keepRespin) {
    if (T) { T.stop(); T = null; }
    if (!keepRespin) respins = 0;
    $('#ro-result').hidden = true; $('#ro-home').hidden = false; pickFace(); drawDisc(); idle(true); renderStats();
  }
  $('#ro-again').addEventListener('click', () => { const last = curSpin(); if (last) { last.did = 'skip'; persist(); } respins++; backHome(true); setTimeout(() => spin(0.8 + Math.random() * 0.5, 1), 120); });
  $('#ro-later').addEventListener('click', () => { const last = curSpin(); if (last) { last.did = 'later'; persist(); } toast('좋아요. 하고 싶을 때 다시 돌려요'); backHome(); $('#ro-spin').focus(); });
  $('#ro-start').addEventListener('click', () => {
    $('#ro-res-btns').hidden = true; const box = $('#ro-timer'); box.innerHTML = '';
    T = timer(box, { sec: result.min * 60, label: result.min + '분', tickSound: true,
      onDone: () => { T = null; askDid(true); },
      onStop: s => { T = null; if (s >= 60) askDid(false, s); else { $('#ro-res-btns').hidden = false; box.innerHTML = ''; toast('1분도 안 됐어요. 다시 시작해도 좋아요'); } } });
    const b = box.querySelector('.z-btn'); if (b) b.focus({ preventScroll: true });
  });
  let doneSec = 0;
  function askDid(full, s) { doneSec = full ? result.min * 60 : s; $('#ro-done-btns').hidden = false; $('#ro-did').focus({ preventScroll: true }); }
  $('#ro-did').addEventListener('click', e => {
    const last = curSpin(); if (!last) { toast('이 판은 이미 기록됐어요'); backHome(); return; }
    last.did = 'yes';
    const r = done('룰렛: ' + result.name, { min: Math.round(doneSec / 6) / 10, label: result.name, anchor: e.currentTarget, say: '룰렛 활동 완료', data: D });
    if (!r.entry) { last.did = null; return; }
    backHome(); toast('한 판 더? 아니면 이 기세로 하던 일로!', 2600); $('#ro-spin').focus();
  });
  $('#ro-not').addEventListener('click', () => { const last = curSpin(); if (last) { last.did = 'no'; persist(); } toast('괜찮아요. 시도한 것도 근육이에요'); backHome(); });

  /* ---------- 칸 고치기 ---------- */
  function renderItems() {
    const ul = $('#ro-items'); ul.innerHTML = '';
    $('#ro-edit-n').textContent = D.items.length + '칸';
    D.items.forEach(it => ul.appendChild(h('li', null, h('span', { class: 't', text: it.name }), h('span', { class: 'm', text: it.min + '분' }),
      h('button', { type: 'button', class: 'z-btn small ghost', text: '빼기', 'aria-label': it.name + ' 빼기', onclick: () => { if (D.items.length <= 3) { toast('칸은 3개 이상 있어야 해요'); return; } D.items = D.items.filter(x => x !== it); persist(); renderItems(); pickFace(); drawDisc(); } }))));
    const mm = $('#ro-add-m'); mm.innerHTML = '';
    [2, 3, 5, 10].forEach(m => { const c = h('button', { type: 'button', class: 'z-chip', role: 'radio', 'aria-checked': String(D.addMin === m), text: m + '분' }); c.addEventListener('click', () => { D.addMin = m; persist(); $$('.z-chip', mm).forEach(x => x.setAttribute('aria-checked', String(x === c))); }); mm.appendChild(c); });
  }
  $('#ro-add').addEventListener('submit', e => {
    e.preventDefault(); const v = $('#ro-add-in').value.trim();
    if (!v) { $('#ro-add-in').focus(); return; }
    if (D.items.length >= 12) { toast('칸은 12개까지예요. 하나 빼고 넣어 주세요'); return; }
    D.items.push({ id: uid(), name: v, short: v.length > 7 ? v.slice(0, 7) : v, min: D.addMin }); persist();
    $('#ro-add-in').value = ''; renderItems(); pickFace(); drawDisc(); toast('«' + v + '» 칸을 넣었어요');
  });
  $('#ro-reset').addEventListener('click', async () => { if (await Z.confirm('처음 목록으로 돌릴까요?', '내가 넣은 칸은 빠지고 기본 12칸으로 돌아가요. 기록은 그대로예요.', '돌리기')) { D.items = DEF.map(x => Object.assign({}, x, { id: uid() })); persist(); renderItems(); pickFace(); drawDisc(); } });

  /* ---------- 기록 ---------- */
  function renderStats() {
    const box = $('#ro-stats-body'); box.innerHTML = '';
    const S = D.spins; if (!S.length) { box.appendChild(h('p', { class: 'z-empty', text: '한 판 돌리면 «나온 것 중 몇 개를 해냈는지»가 여기 쌓여요.' })); return; }
    const yes = S.filter(s => s.did === 'yes');
    box.appendChild(h('div', { class: 'z-stats' },
      h('div', { class: 'z-stat' }, h('b', { class: 'acc', text: yes.length }), h('span', { text: '해낸 판' })),
      h('div', { class: 'z-stat' }, h('b', { text: S.length }), h('span', { text: '돌린 판' })),
      h('div', { class: 'z-stat' }, h('b', { text: Math.round((yes.length / S.length) * 100) + '%' }), h('span', { text: '실행률' }))));
    const cnt = {}; yes.forEach(s => { cnt[s.name] = (cnt[s.name] || 0) + 1; });
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (top.length) {
      box.appendChild(h('p', { class: 'ro-sub', text: '가장 많이 해낸 활동' }));
      const ul = h('ul', { class: 'z-list' }); top.forEach(([k, n], i) => ul.appendChild(h('li', null, h('span', { class: 't' }, h('span', { class: 'z-tag' + (i ? '' : ' acc'), text: 'TOP' + (i + 1) }), ' ' + k), h('span', { class: 'm', text: n + '번' })))); box.appendChild(ul);
    }
  }

  pickFace(); drawLights(); drawDisc(); idle(true); renderItems(); renderStats();
  const C = coach($('#ro-coach'), 'roulette', ['«룰렛 돌리기»를 누르거나 바퀴를 손가락으로 휙 돌려요.', '나온 활동을 그 자리에서 정해진 분만큼 해요.', '다시 돌리기는 한 번만 — 고르기 귀찮을 땐 나온 걸 해요.']);
  Z.on('change', ev => { if (!ev || !ev.remote) return; D = clean(store()); renderItems(); renderStats(); if (!spinning && !$('#ro-home').hidden) { pickFace(); drawDisc(); } });
})();
