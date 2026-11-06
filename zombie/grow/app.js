/* B-07 성장 시각화 — 해낸 만큼 나무가 자라고 도시에 불이 켜진다.
   참고한 원리: Forest(집중 = 나무 한 그루, 숲으로 쌓임) · Finch(돌봄 행동이 정원을 바꿈, 벌 없음) · Plant Nanny(«물 주기» 한 동작) ·
   Streaks·GitHub 잔디(쉰 날도 빈칸일 뿐 지워지지 않음) · 타임랩스 되감기 — 자세한 참고는 설계서 2차.
   🔴 결정적 성장: 같은 기록이면 언제 열어도 같은 나무(씨앗 = 처음 기록한 날). 잎 하나 = 좀비탈출 모든 앱의 기록 한 줄, 잎 색 = 행동 종류(Z.kindOf).
   🔴 시들기·벌 없음 — 쉰 날은 그대로 기다린다.
   핵심 인터랙션 = 물 주기: 물방울이 떨어져 새 가지 끝에 닿으면 물결이 퍼지고 잎이 펴진다(도시 모드는 불꽃이 올라가 창 하나에 불이 켜진다). */
(function () {
  'use strict';
  const { h, $, $$, store, save, done, toast, buzz, tone, reduced, coach, dayKey, addDays, dayLabel, timeLabel, kinds, kindOf, meta, fxLevel } = Z;
  const KM = {}; kinds.forEach(k => { KM[k.k] = k; });
  const W = 360, H = 320, GY = 288;
  const MS = [30, 100, 300, 1000];
  const ST_T = [[0, '씨앗'], [1, '새싹'], [10, '묘목'], [30, '어린 나무'], [100, '큰 나무'], [300, '작은 숲'], [1000, '큰 숲']];
  const ST_C = [[0, '빈 땅'], [1, '오두막'], [10, '마을'], [30, '작은 도시'], [100, '도시'], [300, '대도시'], [1000, '빛의 도시']];
  const EX = ['점심 먹고 10분 걸었다', '미루던 메일 하나 보냈다', '물 두 잔 챙겨 마셨다', '친구 안부를 물었다'];
  function clean(x) { x = Object.assign({ mode: 'tree', ms: 0 }, x); if (x.mode !== 'tree' && x.mode !== 'city') x.mode = 'tree'; x.ms = Math.max(0, Number(x.ms) || 0); return x; }
  let D = clean(store());
  let leafKind = 'auto';

  /* ---------- 씨앗(결정적 난수) ---------- */
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  let SEED = 0, MAIN = null, COMP = [], CITYP = [], CREATED = '';

  /* ---------- 나무 뼈대: 가지(너비 우선 순서) + 잎 자리(안쪽 가지부터) ---------- */
  function skeleton(seed, maxD, len0) {
    const R = rng(seed), br = [], q = [{ x: 0, y: 0, a: -Math.PI / 2, len: len0, d: 0, p: -1 }];
    while (q.length) {
      const b = q.shift(), x2 = b.x + Math.cos(b.a) * b.len, y2 = b.y + Math.sin(b.a) * b.len;
      const node = { x1: b.x, y1: b.y, x2, y2, a: b.a, d: b.d, p: b.p, i: br.length }; br.push(node);
      if (b.d < maxD) {
        const nc = b.d === 0 ? 3 : (R() < 0.3 ? 3 : 2);
        for (let c = 0; c < nc; c++) {
          const side = nc === 3 ? c - 1 : (c === 0 ? -0.62 : 0.62);
          let a = b.a + side * (0.42 + R() * 0.3) + (R() - 0.5) * 0.16; a = a * 0.86 + (-Math.PI / 2) * 0.14;
          const t = b.d === 0 ? 0.52 + c * 0.2 : 1;
          q.push({ x: b.x + (x2 - b.x) * t, y: b.y + (y2 - b.y) * t, a, len: b.len * (0.68 + R() * 0.12), d: b.d + 1, p: node.i });
        }
      }
    }
    const slots = [];
    br.forEach(b => {
      if (b.d < 1) return;
      const ts = b.d >= maxD ? [0.45, 0.75, 1, 1.08] : [0.5, 0.82];
      ts.forEach(t => {
        const px = b.x1 + (b.x2 - b.x1) * Math.min(1, t), py = b.y1 + (b.y2 - b.y1) * Math.min(1, t);
        const off = (R() - 0.5) * 10, nx = -Math.sin(b.a), ny = Math.cos(b.a);
        slots.push({ x: px + nx * off + (t > 1 ? (R() - 0.5) * 9 : 0), y: py + ny * off + (t > 1 ? (R() - 0.5) * 9 : 0), r: b.a + (off > 0 ? 0.7 : -0.7) + (R() - 0.5) * 0.9, b: b.i, o: b.d + R() * 1.7 });
      });
    });
    slots.sort((s1, s2) => s1.o - s2.o);
    let minX = 0, maxX = 0, minY = 0; br.forEach(b => { minX = Math.min(minX, b.x2); maxX = Math.max(maxX, b.x2); minY = Math.min(minY, b.y2); });
    return { br, slots, w: maxX - minX + 30, hgt: -minY + 20, cx: (minX + maxX) / 2 };
  }
  const MAIN_CAP = 300, COMP_CAP = 150;
  /* 씨앗(처음 기록한 날)이 바뀌면(백업 불러오기 등) 모양을 다시 만든다 — 새로고침 전후가 같게(F7) */
  function geom() {
    CREATED = Z.created || 'zombie';
    SEED = Z.hash('grow|' + CREATED);
    MAIN = skeleton(SEED, 6, 70);
    COMP = [0, 1, 2, 3].map(i => Object.assign(skeleton(SEED + 17 * (i + 1), 4, 44), { x: [W * 0.17, W * 0.83, W * 0.06, W * 0.94][i] }));
    CITYP = [];
  }

  /* ---------- 도시 계획: 구역마다 건물 22채(가운데부터 양옆), 창 순서는 건물마다 섞음.
     한 구역이 다 차면 다음 구역이 같은 규칙으로 생긴다 — 기록 한 줄마다 늘 창 하나(F8) ---------- */
  function cityPlan(k) { while (CITYP.length <= k) CITYP.push(makeCity(SEED ^ ((0x9E3779B9 + CITYP.length * 7919) >>> 0))); return CITYP[k]; }
  function makeCity(seed) {
    const R = rng(seed), bs = [];
    for (let i = 0; i < 22; i++) {
      const w = 28 + Math.floor(R() * 24), hgt = 56 + Math.floor(R() * (i < 5 ? 150 : 120));
      const cols = Math.max(2, Math.floor((w - 8) / 8)), rows = Math.max(3, Math.floor((hgt - 14) / 11));
      const order = []; for (let k = 0; k < cols * rows; k++) order.push(k);
      for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(R() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
      bs.push({ w, h: hgt, cols, rows, order, roof: R() < 0.35 ? 'ant' : R() < 0.5 ? 'step' : 'flat' });
    }
    let right = 0, left = 0; bs[0].x = -bs[0].w / 2; right = bs[0].w / 2; left = -bs[0].w / 2;
    for (let i = 1; i < bs.length; i++) { const gap = 3 + (i % 3) * 2; if (i % 2) { bs[i].x = right + gap; right = bs[i].x + bs[i].w; } else { bs[i].x = left - gap - bs[i].w; left = bs[i].x; } }
    let acc = 0; bs.forEach(b => { b.start = acc; acc += b.order.length; }); bs.total = acc;
    return bs;
  }
  geom();

  /* ---------- 기록 → 장면 ---------- */
  function entriesUpTo(day) { return Z.log().slice().sort((a, b) => a.t - b.t).filter(e => !day || e.d <= day); }
  function stageName(n, mode) { const L = mode === 'city' ? ST_C : ST_T; let s = L[0]; L.forEach(x => { if (n >= x[0]) s = x; }); return { name: s[1], i: L.indexOf(s) }; }
  function treeScene(L, today) {
    const items = [], branches = [];
    const n = L.length;
    function place(sk, list, baseX, cap, scaleMax, off) {
      const k = list.length; if (!k) return;
      const used = new Set([0]);
      list.forEach((e, j) => { let b = sk.br[sk.slots[j % sk.slots.length].b]; while (b && !used.has(b.i)) { used.add(b.i); b = b.p >= 0 ? sk.br[b.p] : null; } });
      // 보이는 가지만으로 틀을 채우되(작을 땐 크게), 어린 나무가 너무 커 보이지 않게 상한·성장 배율을 둔다
      let half = 20, top = 20; used.forEach(i => { const b = sk.br[i]; half = Math.max(half, Math.abs(b.x2) + 10); top = Math.max(top, -b.y2 + 12); });
      const fitFull = Math.min((GY - 26) / sk.hgt, (W - 24) / sk.w), fitUsed = Math.min((GY - 34) / top, (W / 2 - 14) / half);
      const g = 0.6 + 0.4 * Math.pow(Math.min(1, k / (cap * 0.5)), 0.6);
      const s = Math.min(fitUsed, fitFull * 1.8) * g * scaleMax;
      list.forEach((e, j) => {
        const sl = sk.slots[j % sk.slots.length], lap = Math.floor(j / sk.slots.length);
        const jx = lap ? Math.sin(j * 12.9898) * 5 : 0, jy = lap ? Math.cos(j * 78.233) * 5 : 0;
        items.push({ gi: off + j, x: baseX + (sl.x + jx) * s, y: GY + (sl.y + jy) * s, r: sl.r, s: Math.max(0.75, Math.sqrt(s)), e, k: kindOf(e), today: e.d === today });
      });
      sk.br.forEach(b => { if (used.has(b.i)) branches.push({ x1: baseX + b.x1 * s, y1: GY + b.y1 * s, x2: baseX + b.x2 * s, y2: GY + b.y2 * s, w: Math.max(1.1, (7 - b.d) * 1.9 * s) }); });
    }
    place(MAIN, L.slice(0, MAIN_CAP), W / 2, MAIN_CAP, 1, 0);
    let rest = L.slice(MAIN_CAP), ci = 0, off = MAIN_CAP;
    while (rest.length && ci < COMP.length) { place(COMP[ci], rest.slice(0, COMP_CAP), COMP[ci].x, COMP_CAP, 0.42, off); rest = rest.slice(COMP_CAP); off += COMP_CAP; ci++; }
    if (rest.length) { const n0 = items.length; rest.forEach((e, j) => { const base = items[(j * 7) % n0]; items.push({ gi: off + j, x: base.x + Math.sin(j) * 6, y: base.y + Math.cos(j) * 6, r: base.r + 1, s: base.s, e, k: kindOf(e), today: e.d === today }); }); }
    return { items, branches, n };
  }
  function cityScene(Lall, today) {
    const items = [], blds = [];
    let lastK = 0, s0 = 0; while (s0 + cityPlan(lastK).total < Lall.length) { s0 += cityPlan(lastK).total; lastK++; }
    const k = dist == null ? lastK : Math.max(0, Math.min(dist, lastK));
    let start = 0; for (let i = 0; i < k; i++) start += cityPlan(i).total;
    const CITY = cityPlan(k), L = Lall.slice(start, start + CITY.total), n = L.length;
    let need = 0; for (let i = 0; i < CITY.length; i++) { if (CITY[i].start < n) need = i; }
    const shown = n >= CITY.total ? CITY.length - 1 : Math.min(CITY.length - 1, n ? need + 1 : 0);   // 다음에 지을 건물 하나는 점선으로
    let minX = 0, maxX = 0; for (let i = 0; i <= shown; i++) { minX = Math.min(minX, CITY[i].x); maxX = Math.max(maxX, CITY[i].x + CITY[i].w); }
    const s = Math.min(1.35, (W - 20) / Math.max(120, maxX - minX)), cx = W / 2 - ((minX + maxX) / 2) * s;
    for (let i = 0; i <= shown; i++) {
      const b = CITY[i], lit = Math.max(0, Math.min(b.order.length, n - b.start));
      const bx = cx + b.x * s, bw = b.w * s, bh = b.h * s, by = GY - bh;
      blds.push({ x: bx, y: by, w: bw, h: bh, roof: b.roof, ghost: i > need || !n });
      const cw = (b.w - 8) / b.cols;
      for (let k2 = 0; k2 < b.order.length; k2++) {
        const slot = b.order[k2], c = slot % b.cols, r = Math.floor(slot / b.cols);
        const wx = bx + (4 + c * cw + 1.2) * s, wy = by + (8 + r * 11) * s, ww = (cw - 2.4) * s, wh = 6.4 * s;
        if (k2 < lit) { const e = L[b.start + k2]; items.push({ gi: start + b.start + k2, x: wx + ww / 2, y: wy + wh / 2, w: ww, h: wh, e, k: kindOf(e), today: e.d === today }); }
        else if (i <= need) blds[blds.length - 1].dark = (blds[blds.length - 1].dark || []).concat([[wx, wy, ww, wh]]);
      }
    }
    return { items, blds, n, k, lastK };
  }

  /* ---------- 그리기 ---------- */
  const cv = $('#gr-cv'), wrap = $('#gr-cv-wrap');
  let ctx = cv.getContext('2d'), scale = 1, scene = null, view = { day: null, L: [] }, anim = null, dist = null;   // dist = 보고 있는 도시 구역(null = 가장 최근)
  function size() {
    const cw = wrap.clientWidth || 320, ch = Math.round(cw * (H / W));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); cv.style.height = ch + 'px';
    scale = cw / W; ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  }
  function stars(n) {
    const R = rng(SEED ^ 0x51ED27); ctx.fillStyle = 'rgba(238,241,246,.55)';
    for (let i = 0; i < Math.min(70, n); i++) { const x = R() * W, y = R() * (GY - 120); const r = R() < 0.15 ? 1.3 : 0.75; ctx.globalAlpha = 0.35 + R() * 0.5; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  function ground() {
    ctx.fillStyle = '#121722'; ctx.fillRect(0, GY, W, H - GY);
    ctx.strokeStyle = '#2B3448'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, GY + 0.5); ctx.lineTo(W, GY + 0.5); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
    for (let x = 6; x < W; x += 14) { ctx.beginPath(); ctx.moveTo(x, GY + 8 + (x % 3) * 4); ctx.lineTo(x + 5, GY + 8 + (x % 3) * 4); ctx.stroke(); }
  }
  function leaf(it, sc) {
    const c = KM[it.k].color;
    ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.r); ctx.scale(it.s * sc, it.s * sc);
    if (it.today) { ctx.shadowColor = c; ctx.shadowBlur = 9; }
    ctx.fillStyle = c; ctx.globalAlpha = it.today ? 1 : 0.86;
    ctx.beginPath(); ctx.ellipse(0, 0, 6, 3.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.globalAlpha = 0.5; ctx.strokeStyle = '#0A0C11'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-4.6, 0); ctx.lineTo(4.6, 0); ctx.stroke();
    ctx.restore();
  }
  function emptyText(t1, t2) {
    ctx.textAlign = 'center'; ctx.fillStyle = '#EEF1F6'; ctx.font = '700 15px "IBM Plex Sans KR", sans-serif'; ctx.fillText(t1, W / 2, 112);
    ctx.fillStyle = '#A6AFBF'; ctx.font = '400 12.5px "IBM Plex Sans KR", sans-serif'; ctx.fillText(t2, W / 2, 136); ctx.textAlign = 'start';
  }
  function drawTree(sc, hideIdx) {
    if (!sc.n) {   // 씨앗
      ctx.fillStyle = '#1B2230'; ctx.beginPath(); ctx.ellipse(W / 2, GY + 2, 46, 12, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#8A6A3A'; ctx.beginPath(); ctx.ellipse(W / 2, GY - 6, 7, 4.6, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(92,240,140,.55)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(W / 2, GY - 12); ctx.quadraticCurveTo(W / 2 + 8, GY - 34, W / 2 + 2, GY - 52); ctx.stroke(); ctx.setLineDash([]);
      emptyText('첫 기록 하나면 싹이 터요', '아래에서 물을 주거나, 3초 스타터로 하나 시작해요');
      return;
    }
    ctx.lineCap = 'round'; ctx.strokeStyle = '#7A6550';
    sc.branches.forEach(b => { ctx.lineWidth = b.w; ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke(); });
    sc.items.forEach(it => { if (it.gi === hideIdx) return; leaf(it, 1); });
  }
  function drawCity(sc, hideIdx) {
    // 달
    ctx.fillStyle = '#E8EDF5'; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(W - 46, 46, 15, 0, 7); ctx.fill();
    ctx.fillStyle = '#0A0C11'; ctx.beginPath(); ctx.arc(W - 40, 41, 13, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    if (!sc.n) { ctx.setLineDash([4, 4]); ctx.strokeStyle = '#36405A'; ctx.lineWidth = 1.4; ctx.strokeRect(W / 2 - 18, GY - 46, 36, 46); ctx.setLineDash([]); emptyText('첫 기록 하나면 첫 창에 불이 켜져요', '아래에서 오늘 잘한 일을 적어 봐요'); return; }
    sc.blds.forEach(b => {
      if (b.ghost) { ctx.setLineDash([4, 4]); ctx.strokeStyle = '#36405A'; ctx.lineWidth = 1.2; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1); ctx.setLineDash([]); return; }
      ctx.fillStyle = '#141A26'; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = '#2A3346'; ctx.lineWidth = 1; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
      if (b.roof === 'ant') { ctx.strokeStyle = '#3A4560'; ctx.beginPath(); ctx.moveTo(b.x + b.w / 2, b.y); ctx.lineTo(b.x + b.w / 2, b.y - 12); ctx.stroke(); ctx.fillStyle = '#FF6378'; ctx.fillRect(b.x + b.w / 2 - 1, b.y - 14, 2, 2); }
      if (b.roof === 'step') { ctx.fillStyle = '#141A26'; ctx.fillRect(b.x + b.w * 0.2, b.y - 7, b.w * 0.6, 7); }
      ctx.fillStyle = '#1C2333'; (b.dark || []).forEach(d => ctx.fillRect(d[0], d[1], d[2], d[3]));
    });
    sc.items.forEach(it => {
      if (it.gi === hideIdx) return;
      const c = KM[it.k].color; ctx.fillStyle = c; ctx.globalAlpha = it.today ? 1 : 0.78;
      if (it.today) { ctx.shadowColor = c; ctx.shadowBlur = 8; }
      ctx.fillRect(it.x - it.w / 2, it.y - it.h / 2, it.w, it.h); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    });
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0B0E15'; ctx.fillRect(0, 0, W, H);
    stars(new Set(view.L.map(e => e.d)).size * 2);
    ground();
    const today = dayKey();
    scene = D.mode === 'city' ? cityScene(view.L, today) : treeScene(view.L, today);
    const hide = anim ? anim.idx : -1;   // 전역 번호(gi)
    if (D.mode === 'city') drawCity(scene, hide); else drawTree(scene, hide);
    if (anim) drawAnim();
    paintDist();
  }
  /* ---------- 핵심: 물 주기 연출 ---------- */
  function drawAnim() {
    const it = scene.items.find(x => x.gi === anim.idx); if (!it) return;
    const p = Math.min(1, (performance.now() - anim.t0) / anim.dur), c = KM[it.k].color;
    const fall = Math.min(1, p / 0.45), e1 = fall * fall;
    if (p < 0.45) {   // 물방울(도시는 불꽃)이 떨어진다/올라간다
      const y = D.mode === 'city' ? GY - (GY - it.y) * e1 : -10 + (it.y + 10) * e1, x = it.x;
      ctx.fillStyle = D.mode === 'city' ? c : '#9FD8FF'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
      ctx.beginPath(); if (D.mode === 'city') ctx.arc(x, y, 2.6, 0, 7); else { ctx.moveTo(x, y - 7); ctx.quadraticCurveTo(x + 5, y, x, y + 3.5); ctx.quadraticCurveTo(x - 5, y, x, y - 7); } ctx.fill(); ctx.shadowBlur = 0;
      return;
    }
    const q = (p - 0.45) / 0.55, back = 1 + 2.2 * Math.pow(q - 1, 3) + 1.2 * Math.pow(q - 1, 2);   // 살짝 넘쳤다 돌아오기
    ctx.strokeStyle = c; ctx.globalAlpha = Math.max(0, 1 - q); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(it.x, it.y, 4 + q * 22, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    if (D.mode === 'city') { ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 14 * (1 - q) + 6; const k = Math.max(0.2, back); ctx.fillRect(it.x - it.w * k / 2, it.y - it.h * k / 2, it.w * k, it.h * k); ctx.shadowBlur = 0; }
    else leaf(Object.assign({}, it, { today: true }), Math.max(0.05, back));
  }
  function runAnim(idx) {
    if (reduced() || fxLevel() === 'off') { anim = null; draw(); return; }
    const light = fxLevel() === 'light';   // 14일 뒤 «작게» — 물방울 없이 잎만 짧게 펴짐
    anim = { idx, t0: performance.now() - (light ? 0.45 * 1150 : 0), dur: 1150 }; let popped = false;
    (function fr() {
      if (!anim) return; draw();
      const p = (performance.now() - anim.t0) / anim.dur;
      if (p >= 0.45 && !popped) { popped = true; tone(D.mode === 'city' ? 1175 : 880, 0, 0.09, 'triangle', 0.06); tone(D.mode === 'city' ? 1568 : 1320, 0.06, 0.12, 'sine', 0.05); buzz([10, 30, 16]); }
      if (p < 1) requestAnimationFrame(fr); else { anim = null; draw(); }
    })();
    if (!light) { tone(1600, 0, 0.05, 'sine', 0.04); tone(900, 0.03, 0.08, 'sine', 0.03); }
  }

  /* ---------- 날짜 되감기 ---------- */
  let DAYS = [];
  function buildDays() {
    const L = Z.log(); const today = dayKey();
    let first = L.length ? L.reduce((m, e) => (e.d < m ? e.d : m), today) : today;
    DAYS = []; let k = first, guard = 0; while (k <= today && guard++ < 4000) { DAYS.push(k); k = addDays(k, 1); }
    const r = $('#gr-day'); r.max = String(DAYS.length - 1); r.disabled = DAYS.length < 2;
  }
  function setDay(i, quiet) {
    i = Math.max(0, Math.min(DAYS.length - 1, i));
    $('#gr-day').value = String(i);
    const d = DAYS[i], atToday = i === DAYS.length - 1;
    view = { day: atToday ? null : d, L: entriesUpTo(atToday ? null : d) };
    $('#gr-day-l').textContent = atToday ? '오늘' : dayLabel(d);
    $('#gr-day').setAttribute('aria-valuetext', (atToday ? '오늘' : dayLabel(d)) + ' — ' + view.L.length + (D.mode === 'city' ? '개 불빛' : '장 잎'));
    paintMeta(); if (!quiet) draw();
  }
  $('#gr-day').addEventListener('input', () => { stopPlay(); setDay(Number($('#gr-day').value)); });
  let playT = null;
  function stopPlay() { if (playT) { clearInterval(playT); playT = null; $('#gr-play span').textContent = '자라 온 모습'; $('#gr-play').setAttribute('aria-label', '자라 온 모습 처음부터 재생'); } }
  $('#gr-play').addEventListener('click', () => {
    if (playT) { stopPlay(); return; }
    if (DAYS.length < 2) { toast('하루 넘게 기록이 쌓이면 자라 온 모습을 볼 수 있어요'); return; }
    if (reduced()) { setDay(DAYS.length - 1); toast('움직임 줄이기 중이라 바로 오늘 모습을 보여 줘요'); return; }
    let i = 0; setDay(0);
    $('#gr-play span').textContent = '멈춤'; $('#gr-play').setAttribute('aria-label', '재생 멈춤');
    const step = Math.max(70, Math.min(500, 2800 / DAYS.length));
    playT = setInterval(() => { i++; setDay(i); tone(520 + Math.min(i, 40) * 14, 0, 0.04, 'triangle', 0.025); if (i >= DAYS.length - 1) { stopPlay(); Z.announce('오늘 모습까지 다 자랐어요'); } }, step);
  });

  /* ---------- 글·숫자 ---------- */
  function paintDist() {
    const nav = $('#gr-dist'); if (!nav) return;
    const sc = D.mode === 'city' && scene && scene.lastK != null ? scene : null;
    nav.hidden = !sc || sc.lastK < 1;
    if (nav.hidden) return;
    $('#gr-dist-l').textContent = '구역 ' + (sc.k + 1) + ' / ' + (sc.lastK + 1);
    $('#gr-dist-prev').disabled = sc.k <= 0; $('#gr-dist-next').disabled = sc.k >= sc.lastK;
  }
  function paintMeta() {
    const n = view.L.length, st = stageName(n, D.mode);
    $('#gr-stage').textContent = st.name; $('#gr-k').textContent = 'STAGE ' + st.i + (view.day ? ' · ' + dayLabel(view.day) + ' 모습' : '');
    $('#gr-n').textContent = n; $('#gr-unit').textContent = D.mode === 'city' ? '개 불빛' : '장 잎';
    const all = Z.log(), today = dayKey();
    let rest = '';
    if (!view.day && all.length) { const last = all.reduce((m, e) => (e.d > m ? e.d : m), '0'); const gap = Math.round((new Date(today) - new Date(last)) / 864e5); if (gap >= 2) rest = '마지막 기록 ' + gap + '일 전 — 시들지 않고 그대로 기다려요'; else rest = '오늘 ' + Z.countOn(today) + '개 더 났어요'; }
    $('#gr-rest').textContent = rest;
    const by = {}; view.L.forEach(e => { const k = kindOf(e); by[k] = (by[k] || 0) + 1; });
    const lg = $('#gr-legend'); lg.innerHTML = '';
    kinds.forEach(k => lg.appendChild(h('li', { class: 'z-kind', style: { '--k': k.color } }, k.name + ' ', h('b', { class: 'z-tnum', text: by[k.k] || 0 }))));
    cv.setAttribute('aria-label', (D.mode === 'city' ? '내 도시 — 불 켜진 창 ' : '내 나무 — 잎 ') + n + '개, 단계 ' + st.name + (n ? ': ' + kinds.filter(k => by[k.k]).map(k => k.name + ' ' + by[k.k]).join(', ') : ' — 첫 기록이면 싹이 터요'));
  }
  function paintMs() {
    const n = Z.log().length, next = MS.find(m => n < m) || MS[MS.length - 1], prev = [0].concat(MS).filter(m => m <= n).pop() || 0;
    const row = $('#gr-ms-row'); row.innerHTML = '';
    MS.forEach(m => row.appendChild(h('li', { class: n >= m ? 'on' : '', 'aria-label': m + (n >= m ? ' 도달' : ' 아직') }, h('b', { class: 'z-num', text: m }), h('span', { text: stageName(m, D.mode).name }))));
    const bar = $('#gr-ms-bar'); const span = Math.max(1, next - prev), into = Math.min(span, n - prev);
    bar.setAttribute('aria-valuemax', String(span)); bar.setAttribute('aria-valuenow', String(into)); bar.querySelector('i').style.width = (n >= MS[MS.length - 1] ? 100 : (into / span) * 100) + '%';
    $('#gr-ms-now').textContent = n + (D.mode === 'city' ? '개 불빛' : '장 잎');
    $('#gr-ms-left').textContent = n >= MS[MS.length - 1] ? '모든 이정표 도달' : next + '까지 ' + (next - n);
    $('#gr-ms-r').textContent = '다음 «' + stageName(next, D.mode).name + '»';
  }
  function paintRecent() {
    const ul = $('#gr-recent'); ul.innerHTML = ''; const mods = meta.mods || {};
    const L = Z.log().slice().sort((a, b) => b.t - a.t).slice(0, 6);
    if (!L.length) { ul.appendChild(h('li', { class: 'z-empty', text: '아직 잎이 없어요. 위에서 물을 주거나 3초 스타터로 하나 시작하면 첫 잎이 나요.' })); return; }
    L.forEach(e => { const m = mods[e.m] || mods.hub; const k = KM[kindOf(e)];
      ul.appendChild(h('li', null, h('span', { class: 'z-src', style: { '--c': m.color }, title: m.name, text: m.code }), h('span', { class: 't' }, String(e.w || m.name).replace(/^(힘|지혜|체력|매력|의지) · /, '') + ' ', h('span', { class: 'z-kind', style: { '--k': k.color }, text: k.name })), h('span', { class: 'm', text: (e.d === dayKey() ? '오늘 ' : dayLabel(e.d) + ' ') + timeLabel(e.t) }))); });
  }
  function all(redrawDays) { if (redrawDays) buildDays(); setDay(DAYS.length - 1, true); paintMs(); paintRecent(); size(); draw(); }

  $('#gr-dist-prev').addEventListener('click', () => { if (!scene || scene.k == null) return; dist = Math.max(0, scene.k - 1); draw(); });
  $('#gr-dist-next').addEventListener('click', () => { if (!scene || scene.k == null) return; dist = scene.k + 1 >= scene.lastK ? null : scene.k + 1; draw(); });

  /* ---------- 보기 바꾸기 ---------- */
  $$('#gr-mode .z-chip').forEach(b => b.addEventListener('click', () => {
    D.mode = b.dataset.mode; $$('#gr-mode .z-chip').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    save(D); paintMeta(); paintMs(); draw(); $('#gr-tip').hidden = true; tone(D.mode === 'city' ? 660 : 523, 0, 0.06, 'triangle', 0.04);
  }));
  function syncMode() { $$('#gr-mode .z-chip').forEach(x => x.setAttribute('aria-checked', String(x.dataset.mode === D.mode))); }

  /* ---------- 잎·창 눌러 보기 ---------- */
  function hit(ev) {
    if (!scene) return null; const r = cv.getBoundingClientRect(); const x = (ev.clientX - r.left) / scale, y = (ev.clientY - r.top) / scale;
    let best = null, bd = 15 * 15; scene.items.forEach(it => { const d = (it.x - x) ** 2 + (it.y - y) ** 2; if (d < bd) { bd = d; best = it; } });
    return best ? { it: best, x: best.x * scale, y: best.y * scale } : null;
  }
  function showTip(ev) {
    const t = hit(ev), tip = $('#gr-tip'); if (!t) { tip.hidden = true; return; }
    const m = (meta.mods || {})[t.it.e.m] || (meta.mods || {}).hub; const k = KM[t.it.k];
    tip.innerHTML = ''; tip.append(h('b', { text: k.name + ' · ' + dayLabel(t.it.e.d) + ' ' + timeLabel(t.it.e.t) }), h('span', { text: m.code + ' ' + m.name + ' — ' + String(t.it.e.w || '해냄').replace(/^(힘|지혜|체력|매력|의지) · /, '') }));
    tip.style.setProperty('--k', k.color);
    tip.hidden = false; const tw = tip.offsetWidth; tip.style.left = Math.max(4, Math.min(wrap.clientWidth - tw - 4, t.x - tw / 2)) + 'px'; tip.style.top = Math.max(4, t.y - tip.offsetHeight - 14) + 'px';
  }
  cv.addEventListener('pointerdown', showTip);
  cv.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') showTip(e); });
  cv.addEventListener('pointerleave', () => { $('#gr-tip').hidden = true; });

  /* ---------- 물 주기 ---------- */
  function guess() {
    const t = $('#gr-in').value.trim(); const k = leafKind === 'auto' ? kindOf({ m: 'grow', w: t }) : leafKind;
    const g = $('#gr-guess'); g.innerHTML = '';
    g.append(t ? '이 잎은 ' : '적은 낱말을 보고 잎 색이 정해져요 — 지금은 ', h('span', { class: 'z-kind', style: { '--k': KM[k].color }, text: KM[k].name }), t ? ' 색이 돼요 ' : ' ');
    const b = h('button', { type: 'button', class: 'gr-kbtn', text: '색 바꾸기' });
    b.addEventListener('click', () => { const order = ['auto'].concat(kinds.map(x => x.k)); leafKind = order[(order.indexOf(leafKind) + 1) % order.length]; guess(); toast(leafKind === 'auto' ? '잎 색: 글을 보고 자동' : '잎 색: ' + KM[leafKind].name); });
    g.appendChild(b);
    return k;
  }
  EX.forEach(t => $('#gr-ex').appendChild(h('button', { type: 'button', class: 'z-chip', text: t, onclick: () => { $('#gr-in').value = t; guess(); $('#gr-go').focus(); } })));
  $('#gr-in').addEventListener('input', guess);
  $('#gr-form').addEventListener('submit', e => {
    e.preventDefault(); stopPlay();
    const text = $('#gr-in').value.trim();
    if (text.length < 2) { toast('오늘 잘한 일을 한 줄 적어 주세요 — 아주 작아도 돼요'); $('#gr-in').focus(); return; }
    const k = guess();
    const r = done(KM[k].name + ' · ' + text, { quiet: true, data: D, say: D.mode === 'city' ? '불이 하나 켜졌어요' : '물을 줬어요. 잎이 하나 났어요' });
    if (!r.entry) return;
    $('#gr-in').value = ''; leafKind = 'auto'; guess();
    buildDays(); dist = null; setDay(DAYS.length - 1, true); paintMs(); paintRecent();
    const idx = view.L.findIndex(x => x.id === r.entry.id);
    $('#gr-cv-wrap').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
    setTimeout(() => runAnim(idx < 0 ? view.L.length - 1 : idx), reduced() ? 0 : 280);
    milestone();
  });
  function milestone() {
    const n = Z.log().length, hitM = MS.filter(m => n >= m && m > D.ms).pop();
    if (hitM) { D.ms = hitM; save(D); setTimeout(() => Z.celebrate(null, { big: true, label: '이정표 ' + hitM + ' — ' + stageName(hitM, D.mode).name }), reduced() ? 0 : 1200); }
    else if (!D.ms) { const reached = MS.filter(m => n >= m).pop(); if (reached) { D.ms = reached; save(D); } }
  }

  /* ---------- 시작 ---------- */
  syncMode(); guess(); all(true);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!anim) draw(); });   // 글꼴이 늦게 오면 캔버스 글자를 다시
  if (!D.ms) { const reached = MS.filter(m => Z.log().length >= m).pop(); if (reached) { D.ms = reached; save(D); } }   // 처음 열 때 이미 넘은 이정표는 조용히 표시만
  coach($('#gr-coach'), 'grow', ['좀비탈출 어느 앱에서든 해낸 일 하나가 잎 하나가 돼요.', '오늘 잘한 일을 한 줄 적고 «물 주기»를 누르면 잎이 하나 더 나요.', '«자라 온 모습»이나 날짜 막대로 지난 모습을 되감아 봐요.']);
  if ('ResizeObserver' in window) { let rw = 0; new ResizeObserver(() => { if (wrap.clientWidth !== rw) { rw = wrap.clientWidth; size(); draw(); } }).observe(wrap); }
  Z.on('change', ev => {
    if (!ev || !ev.remote) return;
    if ((Z.created || 'zombie') !== CREATED) { stopPlay(); anim = null; dist = null; geom(); }   // 백업 불러오기로 씨앗이 바뀌면 모양부터 다시
    D = clean(store()); syncMode(); all(true);
  });
})();
