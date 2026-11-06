/* B-10 성취 발견기 — 모르고 지나친 오늘의 해냄을 찾는다. 🔴 AI 호출 0 — 질문 카드·낱말 규칙·기록 패턴만(비용 0).
   참고한 원리: Reflectly(한 번에 질문 하나, 카드를 넘기며 답함) · Day One(프롬프트가 쓰기 시작을 도움) · Daylio(누르기만 하는 빠른 답) ·
   Stoic·5 Minute Journal(«오늘 잘한 일 세 가지» 정리 카드) — 자세한 참고는 설계서 2차.
   🔴 1차 다섯 앱 기록이 «단서»가 된다 — «미루던 설거지를 3초 만에 시작했어요» 처럼 기록 패턴을 성취 문장으로 바꿔 근거와 함께 보여 준다.
   핵심 인터랙션 = 질문 카드 넘기기(오른쪽 = 네, 왼쪽 = 아니요, 카드가 손가락을 따라 기울고 도장이 비침) → «오늘 놓친 성취 3개» 증명 카드 → 별자리. */
(function () {
  'use strict';
  const { h, $, $$, store, save, done, toast, buzz, tone, reduced, coach, uid, dayKey, addDays, dayLabel, timeLabel, kinds, kindOf, meta, hash } = Z;
  const KM = {}; kinds.forEach(k => { KM[k.k] = k; });
  const lvl = () => Z.fxLevel();   // full · light · off — 보상 소리·연출은 14일 축소 규칙과 «끄기»를 따른다
  const Q = [
    ['body', '앉아 있다가 일부러 일어나 몸을 움직인 적이 있나요?', ['자리에서 일어나 스트레칭했다', '엘리베이터 대신 계단을 탔다']],
    ['body', '평소보다 조금이라도 더 걸었나요?', ['한 정거장 걸어갔다', '점심 먹고 동네 한 바퀴 걸었다']],
    ['body', '굽은 자세를 알아차리고 펴 준 순간이 있었나요?', ['허리를 펴고 앉았다', '목 스트레칭을 했다']],
    ['body', '땀이 조금이라도 나는 일을 했나요?', ['짐을 날랐다', '빠르게 걸었다']],
    ['body', '몸이 무거운데도 움직여 본 순간이 있었나요?', ['피곤했지만 산책 나갔다', '귀찮아도 청소기를 돌렸다']],
    ['mind', '오늘 새로 알게 된 것이 하나라도 있나요?', ['새 단어 하나를 알았다', '몰랐던 기능을 써 봤다']],
    ['mind', '미뤄 둔 일을 조금이라도 건드렸나요?', ['미루던 메일을 보냈다', '보고서 첫 줄을 썼다']],
    ['mind', '실수했지만 다시 해 본 일이 있나요?', ['틀린 걸 고쳐서 다시 냈다', '한 번 더 시도했다']],
    ['mind', '글·메모를 몇 줄이라도 썼나요?', ['할 일을 정리해 적었다', '오늘 생각을 메모했다']],
    ['mind', '어려운 걸 끝까지 읽거나 들은 적이 있나요?', ['긴 글을 끝까지 읽었다', '강의 하나를 다 들었다']],
    ['mind', '문제를 내 방식으로 풀어낸 순간이 있었나요?', ['막힌 일을 다른 방법으로 풀었다', '복잡한 걸 쉽게 정리했다']],
    ['life', '끼니를 제때 챙겨 먹었나요?', ['아침을 챙겨 먹었다', '배달 대신 밥을 해 먹었다']],
    ['life', '물을 일부러 챙겨 마셨나요?', ['물을 세 잔 넘게 마셨다', '커피 대신 물을 마셨다']],
    ['life', '주변을 조금이라도 치우거나 정리했나요?', ['책상을 정리했다', '설거지를 바로 했다']],
    ['life', '귀찮았지만 씻고 단정히 했나요?', ['귀찮아도 샤워했다', '옷을 개어 두었다']],
    ['life', '피곤할 때 무리하지 않고 쉬어 줬나요?', ['10분 눈을 감고 쉬었다', '무리한 약속을 미뤘다']],
    ['life', '잘 준비를 조금 일찍 시작했나요?', ['폰을 일찍 내려놨다', '어제보다 일찍 누웠다']],
    ['people', '누군가에게 고맙다고 말했나요?', ['동료에게 고맙다고 했다', '가게 직원에게 감사 인사를 했다']],
    ['people', '누군가의 이야기를 끝까지 들어 줬나요?', ['친구 고민을 끝까지 들어 줬다', '가족 이야기를 들어 줬다']],
    ['people', '먼저 인사하거나 안부를 물었나요?', ['오랜만에 안부 연락을 했다', '먼저 인사했다']],
    ['people', '누군가를 도와준 순간이 있었나요?', ['길을 알려 줬다', '동료 일을 거들었다']],
    ['people', '불편한 말을 정중하게 해냈나요?', ['거절을 정중하게 했다', '서운한 걸 차분히 말했다']],
    ['people', '누군가를 웃게 만들었나요?', ['친구를 웃게 했다', '가족에게 농담을 건넸다']],
    ['grit', '하고 싶은 걸 참고 해야 할 일을 먼저 했나요?', ['쇼츠 대신 할 일부터 했다', '게임 전에 숙제를 끝냈다']],
    ['grit', '폰을 보고 싶을 때 한 번이라도 내려놨나요?', ['폰을 뒤집어 두고 집중했다', '알림을 끄고 일했다']],
    ['grit', '귀찮았지만 결국 해낸 일이 있나요?', ['미루던 전화를 했다', '귀찮던 서류를 냈다']],
    ['grit', '정한 시간을 지켰나요?', ['약속 시간에 늦지 않았다', '정한 시간에 일어났다']],
    ['grit', '포기하고 싶었지만 버틴 순간이 있었나요?', ['끝까지 마무리했다', '힘들어도 하루를 버텼다']],
    ['grit', '기분이 안 좋아도 할 일을 해냈나요?', ['우울했지만 출근했다', '짜증 나도 할 일을 끝냈다']],
    ['grit', '충동구매·야식 같은 걸 한 번 미뤘나요?', ['장바구니만 담고 안 샀다', '야식을 참았다']]
  ];
  const DECK = 5;
  function clean(x) {
    x = Object.assign({ stars: [], off: 0 }, x);
    x.stars = (Array.isArray(x.stars) ? x.stars : []).filter(s => s && typeof s.w === 'string' && KM[s.k]).map(s => Object.assign(s, { id: String(s.id || uid()), d: typeof s.d === 'string' ? s.d : dayKey(s.t), src: typeof s.src === 'string' ? s.src : '' }));
    x.off = Math.max(0, Math.floor(Number(x.off)) || 0);
    return x;
  }
  let D = clean(store());
  let deck = [], qi = 0, found = [], state = 'start';
  const mods = meta.mods || {};
  const code = s => (mods[s] ? mods[s].code + ' ' + mods[s].name : '');
  /* 받침에 따라 을/를 (한글 끝 글자 기준, 숫자·영문이면 «을(를)» 대신 숫자 읽기 대충 맞춤) */
  function eul(w) { w = String(w); const c = w.charCodeAt(w.length - 1); if (c >= 0xAC00 && c <= 0xD7A3) return (c - 0xAC00) % 28 ? '을' : '를'; return /[013678]$/.test(w) ? '을' : '를'; }
  const q = w => '«' + w + '»' + eul(w);

  /* ---------- 기록 속 단서(규칙·패턴) ---------- */
  function clues() {
    const t = dayKey(), L = Z.log().filter(e => e.d === t).sort((a, b) => a.t - b.t), out = [];
    const strip = w => String(w || '').replace(/^(힘|지혜|체력|매력|의지) · /, '');
    if (!L.length) return out;
    const first = L[0], fm = new Date(first.t).getHours();
    if (fm < 9) out.push({ k: 'grit', w: '아침 ' + timeLabel(first.t) + '에 첫 행동을 시작했어요', src: code(first.m) + ' ' + timeLabel(first.t) });
    const st = L.filter(e => e.m === 'starter');
    if (st.length) { const m = /^시작: (.+?)(?: \(\d+분\))?$/.exec(st[0].w || ''); out.push({ k: kindOf(st[0]), w: '미루던 ' + q(m ? m[1] : '일') + ' 3초 만에 시작했어요', src: code('starter') + ' ' + timeLabel(st[0].t) }); }
    const sw = L.filter(e => e.m === 'switch').length;
    if (sw) out.push({ k: 'grit', w: '충동을 ' + sw + '번 다른 행동으로 바꿨어요', src: code('switch') + ' 오늘 ' + sw + '번' });
    const sp = L.filter(e => e.m === 'split');
    if (sp.length) { const e = sp[sp.length - 1], m = /^쪼개서 끝냄: (.+?) \(/.exec(e.w || '') || /^쪼개기: (.+?) \d+\/\d+조각/.exec(e.w || ''); out.push({ k: 'mind', w: '큰 일 ' + q(m ? m[1] : '미션') + ' 조각내서 해치웠어요', src: code('split') + ' ' + timeLabel(e.t) }); }
    const pr = L.filter(e => e.m === 'promise' && /^약속 지킴/.test(e.w || ''));
    if (pr.length) out.push({ k: 'grit', w: '과거의 나와 한 약속을 지켰어요 — ' + String(pr[0].w).replace(/^약속 지킴: /, ''), src: code('promise') + ' ' + timeLabel(pr[0].t) });
    const ro = L.filter(e => e.m === 'roulette');
    if (ro.length) out.push({ k: kindOf(ro[0]), w: '룰렛이 고른 ' + q(String(ro[0].w).replace(/^룰렛: /, '')) + ' 끝까지 했어요', src: code('roulette') + ' ' + timeLabel(ro[0].t) });
    const hb = L.filter(e => e.m === 'hub');
    if (hb.length) out.push({ k: kindOf(hb[0]), w: '앱 없이 ' + q(hb[0].w) + ' 해냈어요', src: '처음 화면 · 앱 없이 해낸 일' });
    const bk = L.filter(e => e.m === 'bank').reduce((a, e) => a + (e.n || 0), 0);
    if (bk) out.push({ k: 'grit', w: '즉각 보상을 ' + Math.round(bk) + '분 미뤘어요', src: code('bank') });
    const kn = new Set(L.map(kindOf)).size;
    if (kn >= 3) out.push({ k: 'life', w: '오늘 ' + kn + '가지 종류의 행동을 고르게 했어요', src: '좀비탈출 오늘 기록 ' + L.length + '개' });
    const yN = Z.countOn(addDays(t, -1));
    if (L.length > yN && yN > 0) out.push({ k: 'grit', w: '어제의 나보다 ' + (L.length - yN) + '개 더 움직였어요', src: code('beat') + ' · 어제 ' + yN + '개' });
    const days = Array.from(new Set(Z.log().map(e => e.d))).filter(d => d < t).sort();
    const prev = days[days.length - 1];
    if (prev && Math.round((new Date(t) - new Date(prev)) / 864e5) >= 3) out.push({ k: 'grit', w: '며칠 쉬고 다시 돌아왔어요 — 다시 시작한 것도 성취예요', src: '마지막 기록 ' + dayLabel(prev) });
    const st2 = Z.streak(); if (st2 >= 3) out.push({ k: 'grit', w: st2 + '일 연속으로 무언가를 해냈어요', src: '좀비탈출 연속 기록' });
    const todayStars = new Set(D.stars.filter(s => s.d === t).map(s => s.w));
    return out.filter(c => !todayStars.has(c.w)).map(c => Object.assign(c, { from: 'clue' }));
  }

  /* ---------- 카드 고르기: 오늘 기록이 없는 종류부터, 날마다 다른 순서 ---------- */
  function buildDeck() {
    const t = dayKey(), byK = Z.daySum(t).byKind;
    const order = Q.map((q, i) => ({ q, i, s: (byK[q[0]] ? 1 : 0) * 10 + (hash(t + '|' + D.off + '|' + i) % 1000) / 1000 }));
    order.sort((a, b) => a.s - b.s);
    const picked = [], usedK = {};
    order.forEach(o => { if (picked.length < DECK && (usedK[o.q[0]] || 0) < 2) { picked.push(o.q); usedK[o.q[0]] = (usedK[o.q[0]] || 0) + 1; } });
    return picked;
  }

  /* ---------- 화면 상태 ---------- */
  function show(s) {
    state = s;
    $('#fd-start').hidden = s !== 'start'; $('#fd-play').hidden = s !== 'deck' && s !== 'answer'; $('#fd-result').hidden = s !== 'result';
    $('#fd-yn').hidden = s !== 'deck'; $('#fd-answer').hidden = s !== 'answer'; $('#fd-deck').hidden = s === 'answer'; $('#fd-deck-hint').hidden = s !== 'deck';
    $('#fd-prog').textContent = s === 'deck' || s === 'answer' ? '카드 ' + Math.min(qi + 1, deck.length) + ' / ' + deck.length : s === 'result' ? '찾음' : '';
  }
  function paintStart() {
    const ul = $('#fd-clues'); ul.innerHTML = ''; const c = clues();
    if (!c.length) ul.appendChild(h('li', { class: 'z-empty', text: '오늘 좀비탈출 기록 속 단서는 아직 없어요. 질문 카드로 찾아봐요.' }));
    else { ul.appendChild(h('li', { class: 'fd-ccap', text: '기록에서 찾은 단서 ' + c.length + '개' })); c.slice(0, 3).forEach(x => ul.appendChild(h('li', null, h('span', { class: 'z-kind', style: { '--k': KM[x.k].color }, text: KM[x.k].name }), h('span', { class: 't', text: x.w })))); }
  }
  function paintTray() {
    const ol = $('#fd-tray'); ol.innerHTML = '';
    for (let i = 0; i < 3; i++) { const f = found[i]; ol.appendChild(h('li', { class: f ? 'on' : '', style: f ? { '--k': KM[f.k].color } : null, 'aria-label': f ? '찾음: ' + f.w : '빈칸' }, h('span', { 'aria-hidden': 'true', html: STAR }))); }
    if (found.length > 3) ol.appendChild(h('li', { class: 'more', text: '+' + (found.length - 3) }));
  }
  const STAR = '<svg viewBox="0 0 24 24"><path d="M12 1.5l2.6 7.9 7.9 2.6-7.9 2.6L12 22.5l-2.6-7.9L1.5 12l7.9-2.6z"/></svg>';

  /* ---------- 핵심: 카드 넘기기 ---------- */
  function paintDeck() {
    const box = $('#fd-deck'); box.innerHTML = '';
    for (let j = Math.min(deck.length - 1, qi + 2); j >= qi; j--) {
      const [k, q] = deck[j], depth = j - qi;
      const card = h('div', { class: 'fd-card' + (depth === 0 ? ' top' : ' d' + depth), style: { '--d': depth, '--k': KM[k].color }, 'aria-hidden': depth ? 'true' : null },
        h('span', { class: 'z-kind', style: { '--k': KM[k].color }, text: KM[k].name + ' · ' + KM[k].what }),
        h('p', { class: 'fd-q', text: q }),
        h('p', { class: 'fd-no-n', text: 'Q' + String(j + 1).padStart(2, '0') }),
        h('span', { class: 'fd-stamp yes', 'aria-hidden': 'true', text: '네' }), h('span', { class: 'fd-stamp no', 'aria-hidden': 'true', text: '아니요' }));
      box.appendChild(card);
    }
    const top = box.querySelector('.fd-card.top');
    if (top) { box.setAttribute('aria-label', '질문 ' + (qi + 1) + ' / ' + deck.length + ': ' + deck[qi][1]); drag(top); }
    show('deck');
  }
  function drag(card) {
    let s = null;
    card.addEventListener('pointerdown', e => { if (state !== 'deck') return; s = { x: e.clientX, y: e.clientY, dx: 0, id: e.pointerId, vx: 0, lt: performance.now(), lx: e.clientX }; card.setPointerCapture(e.pointerId); card.classList.add('grab'); });
    card.addEventListener('pointermove', e => {
      if (!s) return; s.dx = e.clientX - s.x; const dy = (e.clientY - s.y) * 0.2;
      const now = performance.now(), dt = Math.max(1, now - s.lt); s.vx = s.vx * 0.6 + ((e.clientX - s.lx) / dt) * 0.4; s.lt = now; s.lx = e.clientX;
      card.style.transform = 'translate(' + s.dx + 'px,' + dy + 'px) rotate(' + (s.dx * 0.06) + 'deg)';
      card.style.setProperty('--yes', Math.max(0, Math.min(1, s.dx / 110))); card.style.setProperty('--no', Math.max(0, Math.min(1, -s.dx / 110)));
      if (Math.abs(s.dx) > 90 && !s.ticked) { s.ticked = true; tone(s.dx > 0 ? 880 : 440, 0, 0.03, 'square', 0.025); buzz(6); } else if (Math.abs(s.dx) < 90) s.ticked = false;
    });
    const end = () => {
      if (!s) return; const dx = s.dx, vx = s.vx; s = null; card.classList.remove('grab');
      // 멀리 밀었거나, 짧아도 휙 빠르게 던졌으면(속도) 결정 — 손가락의 기세를 존중
      if (dx > 90 || (dx > 36 && vx > 0.55)) answer(true, card); else if (dx < -90 || (dx < -36 && vx < -0.55)) answer(false, card);
      else { card.style.transition = 'transform .35s var(--pop)'; card.style.transform = ''; card.style.setProperty('--yes', 0); card.style.setProperty('--no', 0); setTimeout(() => { card.style.transition = ''; }, 360); }
    };
    card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
  }
  function flyOut(card, yes, then) {
    if (!card || reduced()) { then(); return; }
    card.style.transition = 'transform .32s cubic-bezier(.3,.6,.4,1), opacity .32s';
    card.style.setProperty(yes ? '--yes' : '--no', 1);
    card.style.transform = 'translate(' + (yes ? 1 : -1) * (innerWidth * 0.9) + 'px,-20px) rotate(' + (yes ? 22 : -22) + 'deg)'; card.style.opacity = '0';
    setTimeout(then, 260);
  }
  let turn = 0;
  function answer(yes, card) {
    if (state !== 'deck') return;
    state = 'moving'; const my = ++turn, at = qi;   // 넘어가는 동안 입력 잠금 — 두 번 눌러 두 장을 건너뛰지 않게(F5)
    $('#fd-yes').disabled = true; $('#fd-no').disabled = true;
    card = card || $('#fd-deck .fd-card.top');
    tone(yes ? 784 : 392, 0, 0.06, 'triangle', 0.045); buzz(yes ? 12 : 6);
    flyOut(card, yes, () => {
      if (my !== turn || at !== qi || !deck[qi]) return;
      $('#fd-yes').disabled = false; $('#fd-no').disabled = false;
      if (yes) openAnswer();
      else next();
    });
  }
  function next() { if (!deck[qi]) return; qi++; if (qi >= deck.length) toResult(); else { paintDeck(); $('#fd-deck').focus({ preventScroll: true }); } }
  $('#fd-yes').addEventListener('click', () => answer(true)); $('#fd-no').addEventListener('click', () => answer(false));
  $('#fd-deck').addEventListener('keydown', e => { if (e.key === 'ArrowRight') { e.preventDefault(); answer(true); } if (e.key === 'ArrowLeft') { e.preventDefault(); answer(false); } });

  /* ---------- 답 적기 ---------- */
  function openAnswer() {
    if (!deck[qi]) { toResult(); return; }
    const [k, q, ex] = deck[qi];
    $('#fd-aq').textContent = q;
    $('#fd-in').value = ''; $('#fd-in').placeholder = '예: ' + ex[0];
    const sg = $('#fd-sugg'); sg.innerHTML = ''; ex.forEach(t => sg.appendChild(h('button', { type: 'button', class: 'z-chip', text: t, onclick: () => { $('#fd-in').value = t; guess(); $('#fd-make').focus(); } })));
    show('answer'); guess(); $('#fd-in').focus();
  }
  function guess() {
    const t = $('#fd-in').value.trim(), qk = deck[qi] ? deck[qi][0] : 'grit';
    const k = t ? (kindOf({ m: 'none', w: t }) !== 'grit' || /참|미루|약속|시작|충동|버티|버텼/.test(t) ? kindOf({ m: 'none', w: t }) : qk) : qk;
    const past = /(했|었|았|였|냈|봤|줬|갔|왔|썼|챙겼|참았|끝냈|마쳤|해냈)다?\.?$|함\.?$|음\.?$/.test(t);
    const el = $('#fd-kind'); el.innerHTML = '';
    el.append('이건 ', h('span', { class: 'z-kind', style: { '--k': KM[k].color }, text: KM[k].name }), ' 성취예요' + (t && !past ? ' · «~했다»로 끝내면 더 해낸 일처럼 읽혀요' : ''));
    return k;
  }
  $('#fd-in').addEventListener('input', guess);
  $('#fd-answer').addEventListener('submit', e => {
    e.preventDefault();
    if (state !== 'answer' || !deck[qi]) return;
    const t = $('#fd-in').value.trim();
    if (t.length < 2) { toast('한 줄만 적거나 예시를 골라 주세요'); $('#fd-in').focus(); return; }
    const k = guess();
    found.push({ k, w: t.slice(0, 60), src: '내 답 · ' + deck[qi][1], from: 'q' });
    starPop(); paintTray(); next();
  });
  $('#fd-skip').addEventListener('click', () => { if (state === 'answer') next(); });
  function starPop() {
    const l = lvl(); if (l === 'off') return;
    tone(1175, 0, 0.07, 'sine', 0.05); if (l === 'light') return;
    tone(1568, 0.07, 0.12, 'sine', 0.045); buzz([8, 30, 12]);
    const li = $$('#fd-tray li')[Math.min(found.length, 3) - 1]; if (li) Z.popEl(li);
  }

  /* ---------- 결과: 오늘 놓친 성취 3개 ---------- */
  let pickList = [];
  function toResult() {
    const c = clues();
    // 내 답은 모두 담는다(버리지 않음) + 3개가 안 되면 기록 단서로 채운다. 큰 카드는 앞의 3개, 나머지는 «함께 찾은 것»
    pickList = found.slice().concat(c.slice(0, Math.max(0, 3 - found.length)));
    const ol = $('#fd-rlist'); ol.innerHTML = '';
    $('#fd-rdate').textContent = 'FOUND · ' + dayLabel(dayKey());
    $('#fd-rt').textContent = pickList.length ? '오늘 놓친 성취 ' + Math.min(3, pickList.length) + '개' : '오늘은 아직 못 찾았어요';
    if (!pickList.length) ol.appendChild(h('li', { class: 'z-empty', text: '괜찮아요. 질문을 더 받아 보거나, 작은 일 하나를 하고 다시 와요 — 3초 스타터가 제일 빨라요.' }));
    pickList.slice(0, 3).forEach((f, i) => ol.appendChild(h('li', { style: { '--k': KM[f.k].color, '--i': i } },
      h('span', { class: 'fd-rs', 'aria-hidden': 'true', html: STAR }),
      h('div', { class: 'fd-rb' }, h('p', { class: 'fd-rw', text: f.w }), h('p', { class: 'fd-rsrc' }, h('span', { class: 'z-kind', style: { '--k': KM[f.k].color }, text: KM[f.k].name }), ' 근거 · ' + f.src)))));
    const extra = $('#fd-extra'); extra.innerHTML = ''; extra.hidden = pickList.length <= 3;
    if (pickList.length > 3) { extra.appendChild(h('p', { class: 'fd-xcap', text: '함께 찾은 것 ' + (pickList.length - 3) + '개 — 같이 별이 돼요' })); pickList.slice(3).forEach(f => extra.appendChild(h('p', { class: 'fd-x' }, h('span', { class: 'z-kind', style: { '--k': KM[f.k].color }, text: KM[f.k].name }), ' ' + f.w))); }
    $('#fd-save').hidden = !pickList.length;
    show('result');
    $('#fd-ticket').focus({ preventScroll: false });
    if (pickList.length && lvl() === 'full') { [0, 1, 2].slice(0, pickList.length).forEach(i => tone([880, 1046, 1318][i], 0.18 * i + 0.1, 0.12, 'sine', 0.05)); }
  }
  $('#fd-more').addEventListener('click', () => { D.off++; save(D); deck = buildDeck(); qi = 0; paintTray(); paintDeck(); $('#fd-deck').focus({ preventScroll: true }); });
  $('#fd-save').addEventListener('click', e => {
    if (!pickList.length) return;
    const t = dayKey(), now = Date.now();
    const add = pickList.map((f, i) => ({ id: uid(), t: now + i, d: t, k: f.k, w: f.w, src: f.src }));
    const prev = D.stars.slice(); D.stars = D.stars.concat(add);
    const todayLogs = Z.log('found').filter(x => x.d === t).length;
    let ok;
    if (todayLogs < 3) ok = !!done('찾은 성취 ' + add.length + '개 · ' + add.map(a => a.w).join(' / '), { data: D, label: '성취 ' + add.length + '개 발견', say: '별자리에 넣었어요', anchor: e.currentTarget }).entry;
    else { ok = save(D); if (ok) toast('오늘 기록은 3번까지만 세요 — 별은 별자리에 넣었어요', 3200); }
    if (!ok) { D.stars = prev; return; }
    found = []; pickList = []; D.off++; save(D);
    paintSky(add.map(a => a.id)); paintStart(); show('start');
    $('#fd-sky').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
  });
  $('#fd-go').addEventListener('click', () => { deck = buildDeck(); qi = 0; found = []; paintTray(); paintDeck(); $('#fd-deck').focus({ preventScroll: true }); tone(523, 0, 0.06, 'triangle', 0.04); });

  /* ---------- 별자리(최근 30개) ---------- */
  function paintSky(fresh) {
    fresh = lvl() === 'full' ? (fresh || []) : [];   // 새 별이 태어나는 연출도 «크게»일 때만
    const sky = $('#fd-sky'); $$('.fd-star', sky).forEach(x => x.remove());
    const S = D.stars.slice(-30), pos = [];
    S.forEach(s => {
      const hv = hash(s.id); let best = null;
      for (let k = 0; k < 8; k++) {
        const x = 7 + ((hv >>> (k * 3)) % 860) / 10, y = 9 + ((Math.imul(hv, k + 7) >>> 4) % 780) / 10;
        const d = pos.reduce((m, p) => Math.min(m, Math.hypot((p.x - x) * 1.0, (p.y - y) * 0.62)), 99);
        if (!best || d > best.d) best = { x, y, d };
        if (d > 11) break;
      }
      pos.push({ x: best.x, y: best.y, s });
    });
    let lines = '';
    const byDay = {}; pos.forEach(p => { (byDay[p.s.d] = byDay[p.s.d] || []).push(p); });
    Object.values(byDay).forEach(ps => { for (let i = 1; i < ps.length; i++) lines += '<line x1="' + ps[i - 1].x + '" y1="' + (ps[i - 1].y * 0.62) + '" x2="' + ps[i].x + '" y2="' + (ps[i].y * 0.62) + '"/>'; });
    $('#fd-lines').innerHTML = lines;
    pos.forEach((p, i) => {
      const k = KM[p.s.k], isNew = fresh.includes(p.s.id);
      const b = h('button', { type: 'button', class: 'fd-star' + (isNew ? ' new' : '') + (i >= pos.length - 3 && !isNew ? ' recent' : ''), style: { left: p.x + '%', top: p.y + '%', '--k': k.color, '--i': fresh.indexOf(p.s.id) }, 'aria-label': dayLabel(p.s.d) + ' ' + k.name + ' 성취: ' + p.s.w, html: STAR });
      b.addEventListener('click', () => { $$('.fd-star', sky).forEach(x => x.classList.toggle('sel', x === b)); const info = $('#fd-starinfo'); info.innerHTML = ''; info.append(h('span', { class: 'z-kind', style: { '--k': k.color }, text: k.name }), ' ' + dayLabel(p.s.d) + ' — ', h('b', { text: p.s.w }), h('span', { class: 'z-small', text: p.s.src ? ' · ' + p.s.src : '' })); tone(1318, 0, 0.05, 'sine', 0.03); });
      sky.appendChild(b);
    });
    if (!S.length) sky.appendChild(h('p', { class: 'fd-star fd-empty', text: '아직 별이 없어요. 첫 발견을 넣으면 여기서 반짝여요.' }));
    $('#fd-sky-r').textContent = '별 ' + D.stars.length + '개' + (D.stars.length > 30 ? ' · 최근 30개' : '');
    const kl = $('#fd-kinds'); kl.innerHTML = '';
    kinds.forEach(k => kl.appendChild(h('li', { class: 'z-kind', style: { '--k': k.color } }, k.name + ' ', h('b', { class: 'z-tnum', text: D.stars.filter(s => s.k === k.k).length }))));
    if (fresh.length && !reduced()) fresh.forEach((_, i) => tone([1046, 1318, 1568][i % 3], 0.25 + i * 0.18, 0.16, 'sine', 0.045));
  }

  /* ---------- 시작 ---------- */
  paintStart(); paintSky(); show('start');
  coach($('#fd-coach'), 'found', ['«발견 시작»을 누르면 질문 카드 5장이 나와요.', '오른쪽으로 밀면 «네» — 무엇을 했는지 한 줄 적으면 별이 돼요.', '좀비탈출 기록 속 단서까지 합쳐 «오늘 놓친 성취 3개»를 별자리에 넣어요.']);
  Z.on('change', ev => { if (!ev || !ev.remote) return; D = clean(store()); paintSky(); if (state === 'start') paintStart(); });
})();
