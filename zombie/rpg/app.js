/* B-06 도파민 RPG — 현실에서 한 일이 캐릭터의 경험치가 된다.
   참고한 원리: Habitica(현실 할 일 = 경험치, 능력치 막대) · Finch(돌봄 행동이 캐릭터 성장으로) · Duolingo(획득 XP 를 바로 숫자로 튀어 올림, 레벨업 전체 화면) ·
   Pokémon Sleep(지난 기록이 «결과 연출»로 한 번에 정산) — 자세한 참고는 설계서 2차.
   🔴 경험치의 대부분은 «다른 좀비탈출 앱 기록»에서 온다(Z.growth 가 공통 기록을 읽는다 — 기록 형식은 그대로).
   핵심 인터랙션 = 레벨 업: 막대가 끝까지 차면 화면이 어두워지며 빛살 + 캐릭터 점프 + 숫자가 굴러 넘어가고, 좀비 → 사람 → 모험가로 모습이 바뀐다. */
(function () {
  'use strict';
  const { h, $, $$, store, save, done, toast, buzz, tone, reduced, coach, uid, dayKey, growth, kinds, fxLevel, countUp, meta } = Z;
  const KS = kinds, KM = {}; KS.forEach(k => { KM[k.k] = k; });
  const ACTS = {
    body: ['팔굽혀펴기 10개', '10분 걷기', '스트레칭 5분', '계단으로 올라가기'],
    mind: ['책 10쪽 읽기', '단어 10개 외우기', '미루던 업무 30분', '강의 하나 듣기'],
    life: ['물 한 잔 마시기', '방 5분 정리', '밥 제대로 챙겨 먹기', '12시 전에 눕기'],
    people: ['안부 연락 하나', '고맙다고 말하기', '누군가 도와주기', '가족과 대화 10분'],
    grit: ['쇼츠 대신 다른 일', '미루던 일 시작', '야식 참기', '폰 내려놓고 25분 집중']
  };
  const CLASS = { body: ['전사', 'WARRIOR'], mind: ['현자', 'SAGE'], life: ['수호자', 'GUARDIAN'], people: ['음유시인', 'BARD'], grit: ['수도승', 'MONK'] };
  const TIER = ['탈출 중인 좀비', '견습', '모험가', '영웅', '전설'];
  const tierOf = L => (L < 3 ? 0 : L < 6 ? 1 : L < 10 ? 2 : L < 15 ? 3 : 4);

  function clean(x) {
    x = Object.assign({ name: '', seenLv: 0, acts: [], tab: 'body' }, x);
    x.name = typeof x.name === 'string' ? x.name.slice(0, 12) : '';
    x.seenLv = Math.max(0, Math.floor(Number(x.seenLv)) || 0);
    x.acts = (Array.isArray(x.acts) ? x.acts : []).filter(a => a && typeof a.w === 'string' && KM[a.k]).slice(-200);
    if (!KM[x.tab]) x.tab = 'body';
    return x;
  }
  let D = clean(store());
  let pick = '';   // 고른 예시 행동

  /* ---------- 능력치 레벨 (능력치마다 40 → 60 → 80 … 경험치) ---------- */
  function statLv(xp) { let lv = 1, need = 40; while (xp >= need) { xp -= need; lv++; need += 20; } return { lv, into: xp, need }; }
  function topKind(stats) { let best = 'grit', v = 0; KS.forEach(k => { if (stats[k.k] > v) { v = stats[k.k]; best = k.k; } }); return best; }

  /* ---------- 픽셀 캐릭터 (16×18, 이모지 없이 사각형만) ---------- */
  const HUMAN = ['................', '......hhhh......', '.....hhhhhh.....', '....hhhhhhhh....', '....hssssssh....', '....ssessess....', '....ssssssss....', '.....ssmmss.....', '......ssss......',
    '....cccccccc....', '...cccccccccc...', '..sccccccccccs..', '..s.cccccccc.s..', '..s.wwwwwwww.s..', '....pppppppp....', '....ppp..ppp....', '....ppp..ppp....', '....bbb..bbb....'];
  const ZOMBIE = ['................', '................', '......hhh.h.....', '.....hhhhhhh....', '....hssssssh....', '....soossoos....', '....ssssssss....', '.....smmmms.....', '......ssss......',
    'ssssccccccccssss', '...cccc.ccccc...', '....cccccc.cc...', '....cc.ccccccc..', '....wwwwwwww....', '....pppppppp....', '....ppp..pp.....', '....ppp..ppp....', '...bbb...bbb....'];
  const CAPE = ['', '', '', '', '', '', '', '', '', '...kkkkkkkkkk...', '.kkkkkkkkkkkkkk.', '.kkkkkkkkkkkkkk.', '.kkkkkkkkkkkkkk.', '.kkkkkkkkkkkkkk.', '.kkkkkkkkkkkkkk.', '.kkkkkkkkkkkkkk.', '.kkkkkkkkkkkkkk.', '..kk........kk..'];
  const BAND = { 3: '....aaaaaaaa....', 4: '............aa..' };
  const CROWN = { 0: '....y.y..y.y....', 1: '....yyyyyyyy....' };
  const ITEM = {   // 손에 든 것(견습부터) — [x, y, 색 키]
    body: [[14, 5, 'I'], [14, 6, 'I'], [14, 7, 'I'], [14, 8, 'I'], [14, 9, 'I'], [13, 10, 'G'], [14, 10, 'G'], [15, 10, 'G'], [14, 11, 'G']],
    mind: [[14, 3, 'Y'], [13, 4, 'Y'], [14, 4, 'Y'], [15, 4, 'Y'], [14, 5, 'T'], [14, 6, 'T'], [14, 7, 'T'], [14, 8, 'T'], [14, 9, 'T'], [14, 10, 'T'], [14, 11, 'T'], [14, 12, 'T'], [14, 13, 'T'], [14, 14, 'T']],
    life: [[0, 10, 'I'], [1, 10, 'I'], [2, 10, 'I'], [0, 11, 'I'], [1, 11, 'A'], [2, 11, 'I'], [0, 12, 'I'], [1, 12, 'A'], [2, 12, 'I'], [1, 13, 'I']],
    people: [[14, 7, 'A'], [15, 7, 'A'], [15, 8, 'A'], [15, 9, 'A'], [14, 9, 'A'], [13, 10, 'A'], [14, 10, 'A']],
    grit: []
  };
  function mix(hex, other, t) {
    const p = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
    const a = p(hex), b = p(other);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  function avatarSVG(level, top) {
    const t = tierOf(level), kc = KM[top].color;
    const z = t === 0;
    const pal = {
      h: z ? '#3C4A35' : '#2B2230', s: z ? '#8FB57A' : '#F1C8A0', e: '#0A0C11', o: '#1C2418', m: z ? '#4A1F25' : '#B5535C',
      c: z ? '#5A6270' : kc, w: z ? '#3B414C' : mix(kc, '#000000', 0.45), p: '#2B3348', b: '#151A24',
      k: mix(kc, '#000000', 0.55), a: kc, y: '#FFE27A', I: '#D9DEE8', G: '#8A6A3A', T: '#8A6A3A', Y: kc, A: kc
    };
    const rows = (z ? ZOMBIE : HUMAN).slice();
    const px = [];
    function run(row, y) { let x = 0; while (x < 16) { const ch = row[x]; if (ch && ch !== '.') { let x2 = x; while (x2 + 1 < 16 && row[x2 + 1] === ch) x2++; px.push('<rect x="' + x + '" y="' + y + '" width="' + (x2 - x + 1) + '" height="1" fill="' + pal[ch] + '"/>'); x = x2 + 1; } else x++; } }
    if (t >= 2) CAPE.forEach((r, y) => r && run(r, y));
    rows.forEach((r, y) => run(r, y));
    if (t >= 2) Object.keys(BAND).forEach(y => run(BAND[y], +y));
    if (t >= 3) Object.keys(CROWN).forEach(y => run(CROWN[y], +y));
    if (t >= 1) (ITEM[top] || []).forEach(([x, y, c]) => px.push('<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + pal[c] + '"/>'));
    return '<svg viewBox="0 0 16 18" shape-rendering="crispEdges" aria-hidden="true">' + px.join('') + '</svg>';
  }
  /* 받침 있으면 «이», 없으면 «가» (한글 끝 글자 기준) */
  function iga(w) { const c = w.charCodeAt(w.length - 1); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? '이' : '가'; }
  function title(level, top) { const t = tierOf(level); return t === 0 ? TIER[0] : TIER[t] + ' ' + CLASS[top][0]; }

  /* ---------- 그리기 ---------- */
  let G = growth();
  const lastPct = {};
  function render(opt) {
    opt = opt || {};
    const g = G = growth(), top = topKind(g.stats);
    $('#rp-avatar').innerHTML = avatarSVG(g.level, top);
    $('#rp-avatar').dataset.tier = tierOf(g.level);
    $('#rp-class').textContent = title(g.level, top) + (tierOf(g.level) ? ' · ' + CLASS[top][1] : ' · ZOMBIE');
    $('#rp-nick').textContent = D.name || '이름 없는 모험가';
    const lvEl = $('#rp-lv'); if (opt.from && opt.from.level === g.level) countUp(lvEl, opt.from.level, g.level, 0); else lvEl.textContent = g.level;
    const bar = $('#rp-xpbar'); bar.setAttribute('aria-valuemax', String(g.need)); bar.setAttribute('aria-valuenow', String(g.into));
    bar.setAttribute('aria-valuetext', g.into + ' / ' + g.need + ' 경험치');
    bar.querySelector('i').style.width = Math.min(100, (g.into / g.need) * 100) + '%';
    if (opt.from && opt.from.level === g.level) countUp($('#rp-xp-now'), opt.from.into, g.into, 700, v => Math.round(v) + ' / ' + g.need + ' XP'); else $('#rp-xp-now').textContent = g.into + ' / ' + g.need + ' XP';
    $('#rp-xp-left').textContent = '다음 레벨까지 ' + (g.need - g.into);
    const today = dayKey(); const tr = g.rows.filter(r => r.e.d === today);
    $('#rp-today').textContent = tr.length ? '오늘 +' + tr.reduce((a, r) => a + r.xp, 0) + ' XP · 행동 ' + tr.length + '개' : '오늘은 아직 경험치가 없어요';
    // 능력치 막대 — 막대 색 = 행동 종류 색(성장 시각화의 잎·성취 발견기의 별과 같은 색)
    const ul = $('#rp-stats'); ul.innerHTML = '';
    const grow = [];
    KS.forEach(k => {
      const v = g.stats[k.k], s = statLv(v), pct = Math.min(100, (s.into / s.need) * 100);
      const was = lastPct[k.k] == null ? pct : lastPct[k.k]; lastPct[k.k] = pct;
      const li = h('li', { class: 'rp-stat' + (k.k === top && v ? ' top' : '') + (opt.bump === k.k ? ' up' : ''), style: { '--acc': k.color } },
        h('span', { class: 'nm' }, h('b', { text: k.name }), h('span', { class: 'en', text: k.en }), k.k === top && v ? h('span', { class: 'sr-only', text: ' (주 능력)' }) : null),
        h('span', { class: 'z-bar thin', role: 'progressbar', 'aria-label': k.name + ' 능력치 ' + s.lv + '레벨', 'aria-valuemin': '0', 'aria-valuemax': String(s.need), 'aria-valuenow': String(s.into) }, h('i', { style: { width: (was > pct ? 0 : was) + '%' } })),
        h('span', { class: 'lv z-tnum', text: 'Lv ' + s.lv }));
      ul.appendChild(li);
      grow.push([li.querySelector('.z-bar i'), pct]);
    });
    requestAnimationFrame(() => requestAnimationFrame(() => grow.forEach(([el, p]) => { el.style.width = p + '%'; })));   // 지난 값 → 새 값으로 차오르게
    renderFeed(g);
  }
  function renderFeed(g) {
    const ul = $('#rp-feed'); ul.innerHTML = '';
    const rows = g.rows.slice(-12).reverse();
    const fromOthers = g.rows.filter(r => r.e.m !== 'rpg').length;
    $('#rp-feed-r').textContent = '다른 앱에서 ' + fromOthers + '줄';
    if (!rows.length) { ul.appendChild(h('li', { class: 'z-empty', text: '아직 없어요. 위에서 하나 올리거나, 3초 스타터·도파민 스위치에서 해낸 일도 여기로 들어와요.' })); return; }
    const mods = meta.mods || {};
    rows.forEach(r => {
      const m = mods[r.e.m] || mods.hub || { code: 'Z', color: '#8590A3', name: '' };
      const w = String(r.e.w || m.name).replace(/^(힘|지혜|체력|매력|의지) · /, '');
      ul.appendChild(h('li', null,
        h('span', { class: 'z-src', style: { '--c': m.color }, title: m.name, text: m.code }),
        h('span', { class: 't' }, h('span', { class: 'rp-fw', text: w }), h('span', { class: 'z-kind', style: { '--k': KM[r.k].color }, text: KM[r.k].name })),
        h('span', { class: 'm rp-fx' + (r.xp < 10 ? ' tired' : ''), text: '+' + r.xp })));
    });
  }

  /* ---------- 고르기 ---------- */
  function renderTabs() {
    const tb = $('#rp-tabs'); tb.innerHTML = '';
    KS.forEach(k => {
      const c = h('button', { type: 'button', class: 'z-chip rp-tab', role: 'radio', 'aria-checked': String(D.tab === k.k), style: { '--acc': k.color } }, h('span', { text: k.name }), h('span', { class: 'en', text: k.en }));
      c.addEventListener('click', () => { D.tab = k.k; pick = ''; renderTabs(); renderActs(); });
      c.addEventListener('keydown', e => { const i = KS.findIndex(x => x.k === D.tab); if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); D.tab = KS[(i + (e.key === 'ArrowRight' ? 1 : KS.length - 1)) % KS.length].k; pick = ''; renderTabs(); renderActs(); $('.rp-tab[aria-checked="true"]').focus(); } });
      tb.appendChild(c);
    });
    $('#rp-tab-what').textContent = KM[D.tab].name + ' = ' + KM[D.tab].what;
  }
  function renderActs() {
    const box = $('#rp-acts'); box.innerHTML = '';
    ACTS[D.tab].forEach(a => {
      const b = h('button', { type: 'button', class: 'z-chip rp-act', 'aria-pressed': String(pick === a), text: a, style: { '--acc': KM[D.tab].color } });
      b.addEventListener('click', () => { pick = pick === a ? '' : a; $('#rp-in').value = pick; renderActs(); updGo(); if (pick) $('#rp-go').focus(); });
      box.appendChild(b);
    });
    updGo();
  }
  function minsIn(t) { const m = /(\d+)\s*분/.exec(t); return m ? Math.min(240, Number(m[1])) : 0; }
  function nextXp(t) { const nth = Z.countOn(dayKey()) + 1; return Z.xpOf({ n: minsIn(t) }, nth); }
  function updGo() {
    const t = $('#rp-in').value.trim();
    $('#rp-go-t').textContent = KM[D.tab].name + ' 경험치 받기';
    $('#rp-go-xp').textContent = '+' + nextXp(t) + ' XP';
    $('#rp-go').style.setProperty('--acc', KM[D.tab].color);
  }
  $('#rp-in').addEventListener('input', () => { const v = $('#rp-in').value.trim(); if (pick && v !== pick) { pick = ''; renderActs(); } updGo(); });

  /* ---------- 올리기 ---------- */
  $('#rp-form').addEventListener('submit', e => {
    e.preventDefault();
    const text = $('#rp-in').value.trim();
    if (text.length < 2) { toast('무엇을 했는지 골라 주거나 한 줄 적어 주세요'); $('#rp-in').focus(); return; }
    const last = D.acts[D.acts.length - 1];
    if (last && last.w === text && last.k === D.tab && Date.now() - last.t < 60e3) { toast('방금 올린 일이에요. 다른 일을 해낸 뒤에 올려요'); return; }
    const k = D.tab, before = growth();
    const a = { id: uid(), t: Date.now(), k, w: text };
    D.acts.push(a); D.acts = D.acts.slice(-200);
    const r = done(KM[k].name + ' · ' + text, { quiet: true, data: D, min: minsIn(text) || undefined, say: KM[k].name + ' 경험치를 받았어요' });
    if (!r.entry) { D.acts = D.acts.filter(x => x !== a); return; }
    const after = growth(), gain = after.xp - before.xp;
    floatXp('+' + gain + ' XP', KM[k].color);
    if (fxLevel() !== 'off') { tone(660, 0, 0.06, 'square', 0.035); tone(990, 0.06, 0.09, 'square', 0.035); if (gain >= 10) tone(1320, 0.14, 0.08, 'square', 0.025); }
    if (fxLevel() !== 'off') buzz(14);
    $('#rp-in').value = ''; pick = ''; renderActs();
    if (after.level > before.level) {
      render({ bump: k });
      $('#rp-xpbar i').style.width = '100%';   // 막대가 끝까지 차오른 뒤 레벨 업
      setTimeout(() => levelUp(before, after, 'act'), reduced() ? 0 : 650);
    } else {
      render({ from: before, bump: k });
    }
  });
  function floatXp(text, color) {
    if (reduced() || fxLevel() === 'off') return;
    const btn = $('#rp-go'), r = btn.getBoundingClientRect();
    const f = h('span', { class: 'rp-float', 'aria-hidden': 'true', text, style: { left: (r.left + r.width / 2) + 'px', top: (r.top + scrollY) + 'px', '--k': color } });
    document.body.appendChild(f); setTimeout(() => f.remove(), 1100);
  }

  /* ---------- 핵심: 레벨 업 ---------- */
  let luOpen = false;
  function levelUp(from, to, why) {
    if (luOpen) return; luOpen = true;
    D.seenLv = to.level; save(D);
    const lv = fxLevel(), calm = lv !== 'full' || reduced();
    const top = topKind(to.stats), tOld = tierOf(from.level), tNew = tierOf(to.level);
    if (lv === 'off') { toast('레벨 업! Lv ' + to.level + ' · ' + title(to.level, top), 3200); Z.announce('레벨 업, ' + to.level + '레벨'); luOpen = false; render(); return; }
    const gains = [];
    if (from.stats) KS.forEach(k => { const a = statLv(from.stats[k.k] || 0).lv, b = statLv(to.stats[k.k]).lv; if (b > a) gains.push(k.name + ' Lv ' + a + ' → ' + b); });
    const reason = why === 'welcome' ? '좀비탈출 기록 ' + to.n + '개에서 경험치 ' + to.xp + '를 찾았어요'
      : why === 'other' ? '다른 앱에서 해낸 일로 경험치가 쌓였어요' : '오늘 한 일로 막대가 가득 찼어요';
    const wrap = h('div', { class: 'rp-lu' + (calm ? ' calm' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rp-lu-h', 'aria-describedby': 'rp-lu-d' });
    const roll = h('span', { class: 'rp-roll', 'aria-hidden': 'true' }, h('span', { class: 'o', text: from.level }), h('span', { class: 'n', text: to.level }));
    const card = h('div', { class: 'rp-lu-card' },
      h('div', { class: 'rp-rays', 'aria-hidden': 'true' }),
      h('div', { class: 'rp-lu-av', html: avatarSVG(to.level, top), 'aria-hidden': 'true' }),
      h('p', { class: 'rp-lu-k', text: why === 'welcome' ? 'WELCOME' : 'LEVEL UP' }),
      h('h2', { id: 'rp-lu-h', class: 'rp-lu-h' }, h('span', { class: 'sr-only', text: '레벨 ' + to.level + '로 올랐어요' }), h('span', { 'aria-hidden': 'true', text: 'Lv ' }), roll),
      h('p', { class: 'rp-lu-t', text: tNew > tOld ? (tOld === 0 ? '좀비에서 사람으로! ' : '') + title(to.level, top) + iga(title(to.level, top)) + ' 됐어요' : title(to.level, top) }),
      h('p', { class: 'rp-lu-d', id: 'rp-lu-d', text: reason + (gains.length ? ' · ' + gains.join(' · ') : '') }),
      h('p', { class: 'rp-lu-next z-small', text: '다음 레벨까지 ' + (to.need - to.into) + ' XP — 조금씩 멀어져요' }));
    const ok = h('button', { type: 'button', class: 'z-btn primary rp-lu-ok', text: '계속' });
    card.appendChild(ok); wrap.appendChild(card);
    const others = Array.from(document.body.children).filter(el => el !== wrap && !el.inert && !['SCRIPT', 'STYLE'].includes(el.tagName) && el.id !== 'sr-live' && el.id !== 'z-toast');
    function close() { wrap.remove(); others.forEach(el => { el.inert = false; }); luOpen = false; const bi = $('#rp-xpbar i'); bi.style.transition = 'none'; bi.style.width = '0%'; void bi.offsetWidth; bi.style.transition = ''; render(); $('#rp-go').focus({ preventScroll: true }); }
    ok.addEventListener('click', close);
    wrap.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } if (e.key === 'Tab') { e.preventDefault(); ok.focus(); } });
    document.body.appendChild(wrap); others.forEach(el => { el.inert = true; });
    ok.focus({ preventScroll: true });
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.075, 0.1, 'square', 0.04));
    tone(1047, 0.42, 0.5, 'triangle', 0.05); tone(1319, 0.42, 0.5, 'triangle', 0.04); tone(1568, 0.42, 0.5, 'triangle', 0.035);
    buzz([30, 40, 30, 40, 90]);
    if (!calm) setTimeout(() => Z.confetti(card.querySelector('.rp-lu-av'), true), 380);
    Z.announce('레벨 업! ' + to.level + '레벨, ' + title(to.level, top));
  }

  /* ---------- 이름 ---------- */
  $('#rp-rename').addEventListener('click', () => {
    const inp = h('input', { class: 'z-input', id: 'rp-name-in', maxlength: '12', value: D.name, placeholder: '예: 새벽 기사' });
    Z.sheet({ title: '캐릭터 이름', body: h('div', { class: 'z-field' }, h('label', { for: 'rp-name-in', text: '12자까지' }), inp),
      actions: [{ label: '취소' }, { label: '저장', primary: true, onClick: () => { const prev = D.name; D.name = inp.value.trim().slice(0, 12); if (!save(D)) { D.name = prev; return false; } render(); } }] });
  });

  /* ---------- 시작 ---------- */
  renderTabs(); renderActs(); render();
  coach($('#rp-coach'), 'rpg', ['능력치를 고르고 오늘 한 일을 골라요(직접 적어도 돼요).', '«경험치 받기»를 누르면 막대가 차고, 가득 차면 레벨 업!', '3초 스타터·스위치 같은 다른 앱에서 해낸 일도 저절로 경험치가 돼요.']);
  // 처음 열었을 때 이미 쌓인 기록이 있으면 «환영» 정산, 다른 앱 기록으로 레벨이 올랐으면 그 자리에서 레벨 업
  setTimeout(() => {
    const g = growth();
    if (!D.seenLv) {
      if (g.level > 1) levelUp({ level: 1, stats: null }, g, 'welcome');
      else { D.seenLv = g.level; save(D); }
    } else if (g.level > D.seenLv) levelUp({ level: D.seenLv, stats: null }, g, 'other');
  }, reduced() ? 50 : 700);
  Z.on('change', ev => { if (!ev || !ev.remote) return; D = clean(store()); renderTabs(); renderActs(); render(); });
})();
