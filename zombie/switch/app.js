/* A-01 도파민 스위치 — 쇼츠 켜고 싶을 때, 30초만 다른 걸.
   참고한 원리: one sec·Opal(열기 전 숨 한 번 + «3초 기다리기» 잠긴 단추 + «그래도 볼래요» 빠져나갈 길) · bless(주 단추는 «안 열기» 쪽) ·
   ScreenZen(오늘 몇 번째 충동인지 보여 주기) · QUITTR(숨 따라 커지는 원).
   핵심 인터랙션 = «좀비 → 사람» 스위치: 손잡이를 밀거나 누르면 딸깍(소리·진동) 켜지고 30초 바꾸기 흐름이 바로 이어진다. */
(function () {
  'use strict';
  const { h, $, $$, store, save, done, toast, buzz, tone, reduced, timer, coach, bars, dayKey } = Z;
  const PULLS = ['쇼츠', 'SNS', '게임', '웹툰', '쇼핑', '군것질', '그냥 폰'];
  const ACTS = [
    ['몸', '제자리 스쿼트 10번', '천천히 앉았다 일어나요. 무릎은 발끝 방향으로.'],
    ['몸', '기지개 크게 3번', '두 팔을 하늘로 쭉, 발끝까지 길게 늘여요.'],
    ['몸', '목·어깨 천천히 돌리기', '앞으로 5번, 뒤로 5번. 소리 나도 괜찮아요.'],
    ['몸', '벽 짚고 팔굽혀펴기 8번', '벽에서 한 걸음 떨어져 손바닥을 짚어요.'],
    ['몸', '일어나서 방 한 바퀴', '걸으면서 발바닥 느낌에만 집중해요.'],
    ['눈', '창밖 가장 먼 곳 보기', '30초 동안 제일 먼 건물이나 하늘을 봐요.'],
    ['눈', '파란 물건 5개 찾기', '방 안을 둘러보며 파란색만 세어 봐요.'],
    ['귀', '들리는 소리 3개 찾기', '눈을 감고 가까운 소리부터 먼 소리까지.'],
    ['손', '물 한 잔 따라 마시기', '컵에 따르는 것부터. 천천히 다 마셔요.'],
    ['손', '책상 위 물건 3개 제자리', '딱 3개만. 더 하고 싶으면 그건 덤이에요.'],
    ['손', '찬물로 손 씻고 세수', '물 온도를 손끝으로 느껴요.'],
    ['손', '지금 할 일 한 줄 적기', '종이나 메모장에 «다음에 할 한 가지»를 적어요.'],
    ['숨', '4초 들이쉬고 6초 내쉬기', '세 번 반복해요. 내쉬는 숨을 더 길게.'],
    ['숨', '숨 세며 10까지', '내쉴 때마다 하나씩. 놓치면 다시 하나부터.'],
    ['마음', '오늘 잘한 일 하나 떠올리기', '아주 작아도 돼요. «일어났다»도 잘한 일.'],
    ['마음', '고마운 사람 한 명 떠올리기', '얼굴과 고마웠던 순간 하나를 그려 봐요.'],
    ['마음', '지금 기분 한 단어로 적기', '«심심», «피곤», «불안» — 이름을 붙이면 작아져요.'],
    ['몸', '발뒤꿈치 들었다 내리기 15번', '종아리에 힘이 들어가는 걸 느껴요.'],
    ['눈', '눈 감고 눈동자 굴리기', '위·아래·왼쪽·오른쪽 천천히 두 번씩.'],
    ['손', '창문 열고 바깥 공기 맡기', '세 번 깊게 들이마셔요.']
  ];
  const FEEL = { 2: '사라졌어요', 1: '조금 남았어요', 0: '그대로예요' };
  function clean(x) { x = Object.assign({ pull: '', events: [] }, x); if (typeof x.pull !== 'string') x.pull = ''; x.events = (Array.isArray(x.events) ? x.events : []).filter(e => e && typeof e === 'object' && typeof e.t === 'number' && typeof e.f === 'number').map(e => Object.assign(e, { act: typeof e.act === 'string' ? e.act : '' })); return x; }
  let D = clean(store());
  // events: {t, pull, act, f(0|1|2|-1 그래도 봄), rr}
  const el = { home: $('#sw-home'), stage: $('#sw-stage'), sw: $('#sw-switch'), tally: $('#sw-tally'), pull: $('#sw-pull'), stats: $('#sw-stats-body') };
  const steps = ['sw-breath', 'sw-pick', 'sw-run', 'sw-check', 'sw-end'];
  let cur = null, rerolls = 0, T = null, waitIv = null;

  function persist() { D.events = D.events.slice(-500); save(D); }
  function show(id) { el.home.hidden = true; el.stage.hidden = false; steps.forEach(s => { $('#' + s).hidden = s !== id; }); window.scrollTo({ top: 0, behavior: 'auto' }); }
  function home() {
    if (T) { T.stop(); T = null; } clearInterval(waitIv);
    el.stage.hidden = true; el.home.hidden = false; setSwitch(0, false); el.sw.classList.remove('on'); el.sw.setAttribute('aria-checked', 'false');
    tally(); renderStats(); el.sw.focus({ preventScroll: true });
  }

  /* ---------- 첫 화면 ---------- */
  function tally() {
    const today = dayKey();
    const ev = D.events.filter(e => Z.dayKey(e.t) === today);
    const sw = ev.filter(e => e.f >= 0).length;
    el.tally.innerHTML = ev.length ? '오늘 충동 <b>' + ev.length + '</b>번 → 행동으로 바꾼 것 <b>' + sw + '</b>번' : '충동이 오는 순간, 여기서 30초만 바꿔요.';
  }
  function pulls() {
    el.pull.innerHTML = '';
    PULLS.forEach(p => {
      const c = h('button', { type: 'button', class: 'z-chip', role: 'radio', 'aria-checked': String(D.pull === p), text: p });
      c.addEventListener('click', () => { D.pull = D.pull === p ? '' : p; persist(); $$('.z-chip', el.pull).forEach(x => x.setAttribute('aria-checked', String(x.textContent === D.pull))); });
      el.pull.appendChild(c);
    });
  }

  /* ---------- 핵심: 스위치 ---------- */
  let drag = null, armed = true;
  function maxX() { return el.sw.clientWidth - 92; }
  function setSwitch(x, anim) { el.sw.classList.toggle('anim', !!anim); el.sw.style.setProperty('--x', Math.max(0, Math.min(maxX(), x)) + 'px'); }
  function flipOn() {
    if (!armed) return; armed = false;
    setSwitch(maxX(), !reduced());
    el.sw.classList.add('on'); el.sw.setAttribute('aria-checked', 'true');
    tone(220, 0, 0.05, 'square', 0.06); tone(1320, 0.03, 0.06, 'square', 0.04); buzz([12, 30, 40]);
    if (C) C.close();
    setTimeout(() => { armed = true; startFlow(); }, reduced() ? 120 : 420);
  }
  el.sw.addEventListener('pointerdown', e => {
    if (!armed) return;
    drag = { x0: e.clientX, x: 0, moved: false, id: e.pointerId };
    el.sw.setPointerCapture(e.pointerId); el.sw.classList.add('drag');
  });
  el.sw.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0; if (Math.abs(dx) > 6) drag.moved = true;
    drag.x = dx; setSwitch(dx, false);
    const r = dx / maxX();
    if (r > 0.5 && !drag.half) { drag.half = true; buzz(6); tone(660, 0, 0.03, 'square', 0.025); }
  });
  function release(e) {
    if (!drag) return; const d = drag; drag = null; el.sw.classList.remove('drag');
    if (!d.moved) return;          // 그냥 누른 건 click 이 처리
    if (d.x / maxX() > 0.55) flipOn(); else { setSwitch(0, true); }
    el.sw._skipClick = true; setTimeout(() => { el.sw._skipClick = false; }, 60);
  }
  el.sw.addEventListener('pointerup', release);
  el.sw.addEventListener('pointercancel', () => { drag = null; el.sw.classList.remove('drag'); setSwitch(0, true); });
  el.sw.addEventListener('click', () => { if (el.sw._skipClick) return; flipOn(); });
  addEventListener('resize', () => { if (!el.sw.classList.contains('on')) setSwitch(0, false); });

  /* ---------- 흐름 ---------- */
  function startFlow() {
    cur = { t: Date.now(), pull: D.pull, act: null, sec: 0 }; rerolls = 0;
    const today = dayKey();
    const nth = D.events.filter(e => Z.dayKey(e.t) === today).length + 1;
    $('#sw-attempt').textContent = '오늘 ' + nth + '번째 충동을 알아차렸어요' + (cur.pull ? ' · ' + cur.pull : '');
    show('sw-breath');
    const btn = $('#sw-next'); btn.disabled = true;
    const bt = $('#sw-breath-t');
    let left = 3;
    btn.textContent = left + '초만 기다려요';
    bt.textContent = '숨 한 번 들이쉬고…';
    clearInterval(waitIv);
    waitIv = setInterval(() => {
      left--;
      if (left === 1) bt.textContent = '…길게 내쉬어요';
      if (left > 0) { btn.textContent = left + '초만 기다려요'; tone(392, 0, 0.12, 'sine', 0.05); }
      else { clearInterval(waitIv); btn.disabled = false; btn.textContent = '30초 바꾸기 고르기'; tone(784, 0, 0.1, 'square', 0.04); buzz(14); btn.focus({ preventScroll: true }); }
    }, 1000);
    $('#sw-giveup').focus({ preventScroll: true });
  }
  $('#sw-next').addEventListener('click', () => { pickAct(); show('sw-pick'); $('#sw-go').focus({ preventScroll: true }); });
  $('#sw-giveup').addEventListener('click', () => {
    clearInterval(waitIv);
    D.events.push({ t: cur.t, pull: cur.pull, act: '', f: -1 }); persist();
    toast('괜찮아요. 알아차린 것만으로도 연습이에요', 3000);
    cur = null; home();
  });

  function score(name) {      // 나에게 잘 통했던 행동일수록 조금 더 자주(그래도 매번 다르게)
    const ev = D.events.filter(e => e.act === name && e.f >= 0);
    if (!ev.length) return 1;
    return 0.6 + ev.reduce((a, e) => a + e.f, 0) / ev.length;
  }
  function pickAct() {
    const recent = D.events.slice(-3).map(e => e.act);
    const pool = ACTS.filter(a => a[1] !== (cur.act && cur.act[1]) && !recent.includes(a[1]));
    const w = pool.map(a => score(a[1])); const sum = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum, i = 0; while (r > w[i] && i < pool.length - 1) { r -= w[i]; i++; }
    cur.act = pool[i];
    $('#sw-card-k').textContent = cur.act[0];
    $('#sw-card-t').textContent = cur.act[1];
    $('#sw-card-d').textContent = cur.act[2];
    Z.popEl($('#sw-card'));
    const card = $('#sw-card'); if (!reduced()) { card.classList.remove('flip'); void card.offsetWidth; card.classList.add('flip'); }
    const rr = $('#sw-reroll'); const left = 2 - rerolls;
    rr.disabled = left <= 0;
    rr.textContent = left > 0 ? '다른 걸로 (' + left + '번 남음)' : '이번엔 이걸로 해 봐요';
  }
  $('#sw-reroll').addEventListener('click', () => { if (rerolls >= 2) return; rerolls++; tone(880, 0, 0.04, 'square', 0.03); buzz(10); pickAct(); });
  $('#sw-go').addEventListener('click', () => {
    show('sw-run'); $('#sw-run-t').textContent = cur.act[1];
    const box = $('#sw-timer'); box.innerHTML = '';
    T = timer(box, {
      sec: 30, label: '30초', tickSound: true,
      onDone: () => { T = null; cur.sec = 30; ask(); },
      onStop: s => { T = null; if (s >= 10) { cur.sec = Math.round(s); ask(); } else { toast('조금만 더! 다시 해 봐요'); home(); } }
    });
    const b = box.querySelector('.z-btn'); if (b) b.focus({ preventScroll: true });
  });
  function ask() { show('sw-check'); buzz([20, 40, 20]); $('#sw-check-t').focus({ preventScroll: true }); }
  $$('.sw-f').forEach(b => b.addEventListener('click', () => {
    const f = Number(b.dataset.f);
    const sec = cur.sec || 30;
    const ev = { t: cur.t, pull: cur.pull, act: cur.act[1], f, rr: rerolls, sec };
    D.events.push(ev); D.events = D.events.slice(-500);
    const what = (cur.pull ? cur.pull + ' 충동 → ' : '충동 → ') + cur.act[1];
    const r = done(what + (sec < 30 ? ' (' + sec + '초)' : ''), { min: sec / 60, label: f === 2 ? '스위치 성공' : sec + '초 해냈어요', say: '바꾸기 성공', anchor: b, big: f > 0, data: D });
    if (!r.entry) { D.events = D.events.filter(x => x !== ev); return; }
    finish(f, sec);
  }));
  function finish(f, sec) {
    show('sw-end');
    const t = $('#sw-end-t'), d = $('#sw-end-d'), row = $('#sw-end-row'); row.innerHTML = '';
    if (f === 2) { t.textContent = '좀비 탈출 성공!'; d.textContent = '충동이 지나갔어요. 이 기세로 하려던 일 하나 시작해 볼까요?'; row.append(h('a', { class: 'z-btn primary', href: '../starter/', text: '3초 스타터로' }), h('button', { type: 'button', class: 'z-btn', text: '처음으로', onclick: home })); }
    else if (f === 1) { t.textContent = '덜해졌어요'; d.textContent = '충동은 파도처럼 줄어들어요. 한 번 더 하면 거의 사라져요.'; row.append(h('button', { type: 'button', class: 'z-btn primary', text: '한 번 더 30초', onclick: again }), h('button', { type: 'button', class: 'z-btn', text: '처음으로', onclick: home })); }
    else { t.textContent = '그래도 ' + sec + '초 버텼어요'; d.textContent = '아직 당기는 날도 있어요. 다른 행동으로 한 번만 더 해 볼까요?'; row.append(h('button', { type: 'button', class: 'z-btn primary', text: '다른 행동으로 30초', onclick: again }), h('button', { type: 'button', class: 'z-btn', text: '처음으로', onclick: home })); }
    t.focus({ preventScroll: true });
    renderStats();
  }
  function again() { cur = { t: Date.now(), pull: cur ? cur.pull : D.pull, act: cur ? cur.act : null, sec: 0 }; rerolls = 0; pickAct(); show('sw-pick'); $('#sw-go').focus({ preventScroll: true }); }

  /* ---------- 통계 ---------- */
  function renderStats() {
    const ev = D.events; el.stats.innerHTML = '';
    if (!ev.length) { el.stats.appendChild(h('p', { class: 'z-empty', text: '스위치를 몇 번 켜면, 나에게 제일 잘 통하는 30초 행동이 여기 모여요.' })); return; }
    const okd = ev.filter(e => e.f >= 0);
    const gone = okd.filter(e => e.f === 2).length;
    el.stats.appendChild(h('div', { class: 'z-stats' },
      h('div', { class: 'z-stat' }, h('b', { class: 'acc', text: okd.length }), h('span', { text: '바꾼 횟수' })),
      h('div', { class: 'z-stat' }, h('b', { text: okd.length ? Math.round((gone / okd.length) * 100) + '%' : '-' }), h('span', { text: '충동 사라짐' })),
      h('div', { class: 'z-stat' }, h('b', { text: ev.length }), h('span', { text: '알아차림' }))));
    const by = {};
    okd.forEach(e => { const b = by[e.act] = by[e.act] || { n: 0, s: 0 }; b.n++; b.s += e.f; });
    const top = Object.entries(by).map(([k, v]) => [k, v.s / v.n, v.n]).sort((a, b) => b[1] - a[1] || b[2] - a[2]).slice(0, 3);
    if (top.length) {
      el.stats.appendChild(h('p', { class: 'sw-sub', text: '잘 통한 30초 TOP 3' }));
      const ul = h('ul', { class: 'z-list sw-top' });
      top.forEach(([k, s, n], i) => ul.appendChild(h('li', null, h('span', { class: 't' }, h('span', { class: 'z-tag' + (i ? '' : ' acc'), text: 'TOP' + (i + 1) }), k), h('span', { class: 'm', text: n + '번 · ' + (s >= 1.5 ? '잘 통함' : s >= 0.75 ? '보통' : '덜 통함') }))));
      el.stats.appendChild(ul);
    }
    el.stats.appendChild(h('p', { class: 'sw-sub', text: '충동이 자주 오는 때' }));
    const slots = [['새벽', 0, 6], ['오전', 6, 12], ['오후', 12, 18], ['저녁', 18, 22], ['밤', 22, 24]];
    const cnt = slots.map(([l, a, b]) => ({ label: l, value: ev.filter(e => { const hh = new Date(e.t).getHours(); return hh >= a && hh < b; }).length }));
    const mx = Math.max(...cnt.map(c => c.value)); cnt.forEach(c => { c.hi = c.value === mx && mx > 0; });
    const box = h('div'); el.stats.appendChild(box); bars(box, cnt, { title: '시간대별 충동 횟수', unit: '번', h: 110 });
  }

  pulls(); tally(); renderStats();
  const C = coach($('#sw-coach'), 'switch', ['쇼츠·SNS가 당기면 이 화면을 열어요.', '스위치를 오른쪽으로 밀면 숨 한 번 → 30초 행동 카드가 나와요.', '30초 뒤 충동이 어떤지 고르면 기록돼요.']);
  Z.on('change', ev => { if (!ev || !ev.remote) return; D = clean(store()); if (!el.home.hidden) { tally(); renderStats(); } });
})();
