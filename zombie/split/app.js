/* A-03 미션 쪼개기 — 큰 일을 1분짜리 조각으로.
   참고한 원리: Goblin Tools Magic ToDo(«얼마나 잘게» 매운맛 단계 · 조각을 다시 쪼개기) · Numo(ADHD 앱: 큰 제목 + 조각 목록 + 완료 막대) ·
   Cursor·Manus 할 일 목록(«지금 조각» 표시 → 남은 조각은 흐리게) · Todoist(조각 순서 바꾸기).
   🔴 AI 없이 규칙으로 쪼갠다: 일의 종류(낱말)를 보고 검증된 순서 틀을 고른 뒤, 사용자가 직접 고친다.
   핵심 인터랙션 = 조각을 오른쪽으로 «밀어서 해치우기»(손가락을 따라오는 색 꼬리 + 절반 넘으면 딸깍 + 놓으면 착 붙음). */
(function () {
  'use strict';
  const { h, $, $$, store, save, done, toast, buzz, tone, reduced, timer, coach, uid, confirm, dayKey } = Z;
  /* 조각 틀: [단계, 글] — 단계 1=늘, 2=보통 이상, 3=아주 잘게만. {t}=적은 일 */
  const TPL = [
    { k: /청소|정리|치우|빨래|설거지|방|집안|대청소|분리수거|쓰레기|옷장|냉장고/, s: [
      [3, '쓰레기봉투 하나 가져오기'], [1, '눈에 보이는 쓰레기만 봉투에 담기'], [2, '제자리 없는 물건을 한곳에 모으기'], [1, '바닥에 있는 물건부터 제자리에'],
      [3, '책상·식탁 위 왼쪽 절반만 치우기'], [2, '책상·식탁 위 닦기'], [1, '바닥 한 번 훑기(청소기·밀대)'], [3, '모은 물건 중 3개만 제자리'], [2, '다 쓴 도구 넣고 손 씻기']] },
    { k: /공부|시험|과제|숙제|강의|복습|예습|자격증|암기|수업|단어|문제집/, s: [
      [3, '책상 위를 공부할 것만 남기고 치우기'], [1, '오늘 볼 범위(쪽·강의 번호) 정하기'], [2, '목차나 제목만 1분 훑어보기'], [1, '첫 쪽(첫 문제) 하나만 하기'],
      [3, '모르는 낱말 하나 표시하기'], [2, '방금 본 것 세 줄로 요약'], [1, '다음 쪽(문제) 하나 더'], [3, '틀린 것 하나 다시 보기'], [2, '내일 이어 볼 곳에 표시하기']] },
    { k: /보고서|기획서|문서|에세이|논문|블로그|원고|제안서|발표|ppt|자소서|글쓰기|글 |기사|리포트|정리본/i, s: [
      [3, '{t} 파일(또는 빈 문서) 열기'], [1, '이 글의 목적을 한 줄로 적기'], [2, '떠오르는 내용 낱말로 5개 적기'], [1, '목차(제목 3개)만 적기'],
      [3, '첫 제목 아래 아무 문장 하나 쓰기'], [1, '첫 문단을 대충 끝까지 쓰기'], [2, '다음 제목 아래 문장 두 개'], [3, '자료가 필요한 곳에 [자료] 표시'], [2, '처음부터 한 번 읽고 저장']] },
    { k: /메일|이메일|답장|연락|전화|문자|카톡|DM|회신/i, s: [
      [3, '메일함(대화방) 열기'], [1, '답할 것 하나만 고르기'], [2, '받은 내용 다시 한 번 읽기'], [1, '첫 문장 «안녕하세요, ○○입니다»만 쓰기'],
      [1, '하고 싶은 말 핵심 한 줄 쓰기'], [3, '필요한 날짜·숫자 확인하기'], [2, '끝인사 쓰고 한 번 읽기'], [1, '보내기 누르기']] },
    { k: /운동|헬스|러닝|달리기|조깅|요가|스트레칭|산책|홈트|필라테스|자전거/, s: [
      [3, '물 한 잔 마시기'], [1, '운동복(편한 옷)으로 갈아입기'], [2, '운동화 신거나 매트 깔기'], [1, '제자리에서 1분 몸 풀기'],
      [3, '오늘 할 동작·거리 하나 정하기'], [1, '첫 세트(첫 5분)만 하기'], [2, '물 마시고 한 세트 더'], [2, '마무리 스트레칭 1분']] },
    { k: /서류|신청|등록|예약|세금|정산|은행|보험|계약|민원|연말정산|환불|반품|계좌/, s: [
      [3, '필요한 사이트·앱 열어 두기'], [1, '무엇을 내야 하는지 목록 보기'], [2, '필요한 서류 이름을 종이에 적기'], [1, '첫 칸(이름·번호)만 채우기'],
      [3, '모르는 칸에 표시만 하기'], [2, '파일·사진 하나 찾아서 올리기'], [1, '나머지 칸 채우기'], [2, '모르는 것은 고객센터에 물을 질문 한 줄'], [1, '제출 누르고 확인 화면 캡처']] },
    { k: /요리|밥|식사|도시락|반찬|장보기|장 보기|베이킹|국|찌개/, s: [
      [3, '앞치마 두르거나 손 씻기'], [1, '만들 것 하나 정하기'], [2, '냉장고에서 재료 꺼내 늘어놓기'], [1, '첫 재료 하나 씻거나 썰기'],
      [3, '냄비·팬 올려 두기'], [1, '불 켜고 첫 단계 시작'], [2, '쓴 도구 하나씩 바로 씻기'], [1, '담고 한 입 맛보기']] },
    { k: /책|독서|읽기|소설/, s: [
      [3, '책과 연필 꺼내 두기'], [1, '오늘 읽을 쪽수 정하기'], [1, '첫 한 쪽만 읽기'], [2, '마음에 든 문장 하나 표시'], [1, '다음 다섯 쪽'], [3, '읽은 내용 한 줄 메모'], [2, '책갈피 꽂고 덮기']] },
    { k: /이사|짐|여행|캐리어|준비물|출장|캠핑/, s: [
      [3, '가방(상자) 하나 펼쳐 두기'], [1, '필요한 물건 목록 5개 적기'], [2, '목록에서 이미 있는 것 체크'], [1, '첫 물건 하나 넣기'],
      [3, '충전기·약 같은 작은 것 챙기기'], [1, '옷부터 차례로 넣기'], [2, '빠진 것 사러 갈 목록 만들기'], [1, '가방 닫고 문 앞에 두기']] }
  ];
  const GEN = [[3, '«{t}» 관련 물건·파일 하나 꺼내 열기'], [1, '다 끝난 모습을 한 줄로 적기'], [2, '해야 할 것들을 낱말로 쭉 적기'], [1, '그중 가장 쉬운 것 하나 고르기'],
    [1, '그것을 1분만 하기'], [3, '막히는 점을 질문 한 줄로 적기'], [2, '다음 조각 하나 정해서 하기'], [2, '한 것 저장·정리하기'], [1, '체크하고 잠깐 쉬기']];
  const LV = [[1, '조금', '3~4조각', 2], [2, '보통', '5~6조각', 3], [3, '아주 잘게', '8조각 이상', 5]];
  const EX = ['방 청소', '기획서 쓰기', '시험 공부', '메일 답장', '운동하기', '서류 신청'];
  const TIPS = [
    ['동사로 끝내기', '«자료»가 아니라 «자료 파일 열기». 무엇을 할지 손이 알아야 해요.'],
    ['1분 크기', '1분 안에 못 끝낼 것 같으면 «더 쪼개기»를 눌러요.'],
    ['첫 조각은 바보같이 쉽게', '«의자에 앉기»도 훌륭한 첫 조각이에요.'],
    ['고민도 조각', '정해야 할 게 있으면 «A와 B 중 고르기»를 조각으로 만들어요.'],
    ['물어볼 것도 조각', '혼자 못 하는 부분은 «○○에게 물어볼 질문 쓰기»로.']
  ];
  function clean(x) {
    x = Object.assign({ lv: 2, missions: [], history: [] }, x); if (![1, 2, 3].includes(x.lv)) x.lv = 2;
    x.missions = (Array.isArray(x.missions) ? x.missions : []).filter(m => m && typeof m === 'object' && typeof m.title === 'string' && Array.isArray(m.pieces))
      .map(m => Object.assign(m, { id: String(m.id || uid()), logged: Array.isArray(m.logged) ? m.logged : [], pieces: m.pieces.filter(p => p && typeof p.t === 'string').map(p => Object.assign(p, { id: String(p.id || uid()), done: !!p.done })) }))
      .filter(m => m.pieces.length);
    x.history = (Array.isArray(x.history) ? x.history : []).filter(h0 => h0 && typeof h0.title === 'string').map(h0 => Object.assign(h0, { n: Number(h0.n) || 0, t: Number(h0.t) || Date.now() }));
    return x;
  }
  let D = clean(store());
  let M = null;   // 지금 미션
  let T = null;

  const el = { nw: $('#sp-new'), edit: $('#sp-edit'), run: $('#sp-run'), end: $('#sp-end'), task: $('#sp-task'), lv: $('#sp-lv'), pieces: $('#sp-pieces'), board: $('#sp-board'), stats: $('#sp-stats-body') };
  const MAXM = 12;
  function persist() { D.history = D.history.slice(-200); save(D); }
  /* 다른 창에서 저장돼 객체가 바뀌어도 «지금 미션»의 진짜 조각을 찾는다(F8) */
  function exists() { return !!M && (!M.saved || D.missions.some(x => x.id === M.id)); }
  function gone() { if (T) { T.stop(); T = null; } M = null; toast('다른 창에서 지운 미션이에요', 3000); show('nw'); renderNew(); renderStats(); }
  function live(p) { return (M && M.pieces.find(x => x.id === p.id)) || p; }
  function show(k) { ['nw', 'edit', 'run', 'end'].forEach(x => { el[x].hidden = x !== k; }); window.scrollTo({ top: 0, behavior: 'auto' }); }

  /* ---------- 쪼개는 규칙 ---------- */
  function breakdown(title, lv) {
    const tpl = (TPL.find(t => t.k.test(title)) || { s: GEN }).s;
    const name = title.replace(/하기$|하자$|해야\s*함$|해야\s*해$/, '').trim() || title;
    let s = tpl.filter(([l]) => l <= lv).map(([, t]) => t.replace('{t}', name));
    if (lv === 1 && s.length > 4) s = s.slice(0, 4);
    return s.map(t => ({ id: uid(), t, done: false }));
  }
  function splitPiece(t) {
    t = t.replace(/^준비 — /, '').replace(/에 필요한 것 꺼내기$/, '').replace(/\s*—\s*(준비만|하기|앞쪽 절반|나머지 마무리)$/, '').trim();
    if (t.length < 9) return ['준비 — ' + t + '에 필요한 것 꺼내기', t];
    return ['준비 — ' + t + '에 필요한 것 꺼내기', t + ' — 앞쪽 절반', t + ' — 나머지 마무리'];
  }

  /* ---------- 새 미션 ---------- */
  function renderNew() {
    const ex = $('#sp-ex'); ex.innerHTML = '';
    EX.forEach(t => ex.appendChild(h('button', { type: 'button', class: 'z-chip', text: t, onclick: () => { el.task.value = t; Z.popEl(el.task); $('#sp-go').focus(); } })));
    el.lv.innerHTML = '';
    LV.forEach(([v, name, sub, cuts]) => {
      const b = h('button', { type: 'button', class: 'sp-knife', role: 'radio', 'aria-checked': String(D.lv === v), 'aria-label': name + ' · ' + sub },
        h('span', { class: 'cuts', 'aria-hidden': 'true' }, Array.from({ length: cuts }, () => h('i'))), h('b', { text: name }), h('span', { text: sub }));
      b.addEventListener('click', () => { D.lv = v; persist(); $$('.sp-knife', el.lv).forEach(x => x.setAttribute('aria-checked', String(x === b))); tone(700 + v * 120, 0, 0.04, 'square', 0.03); });
      el.lv.appendChild(b);
    });
    const act = D.missions.filter(m => !m.doneAt);
    $('#sp-active').hidden = !act.length;
    const ul = $('#sp-missions'); ul.innerHTML = '';
    act.slice().reverse().forEach(m => {
      const n = m.pieces.filter(p => p.done).length;
      const li = h('li', { class: 'sp-mi' },
        h('div', null, h('b', { text: m.title }), h('div', { class: 'm', text: n + ' / ' + m.pieces.length + ' 조각' })),
        h('div', { class: 'z-row' },
          h('button', { type: 'button', class: 'z-btn small primary', text: '이어서', onclick: () => { M = m; M.saved = true; openRun(); } }),
          h('button', { type: 'button', class: 'z-btn small ghost', 'aria-label': m.title + ' 지우기', text: '지우기', onclick: async () => { if (await confirm('이 미션을 지울까요?', '«' + m.title + '» 조각 목록이 지워져요. 이미 «오늘 한 일»에 남은 기록은 그대로예요.', '지우기')) { const id = m.id; const prev = D.missions; D.missions = D.missions.filter(x => x.id !== id); if (!save(D)) { D.missions = prev; return; } renderNew(); } } })),
        h('div', { class: 'z-bar thin', role: 'progressbar', 'aria-label': m.title + ' 진행', 'aria-valuemin': '0', 'aria-valuemax': String(m.pieces.length), 'aria-valuenow': String(n) }, h('i', { style: { width: (n / m.pieces.length) * 100 + '%' } })));
      ul.appendChild(li);
    });
  }
  el.task.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); make(); } });
  $('#sp-go').addEventListener('click', make);
  function make() {
    const title = el.task.value.trim();
    if (!title) { el.task.focus(); el.task.classList.remove('z-pop'); void el.task.offsetWidth; el.task.classList.add('z-pop'); toast('막막한 일을 한 줄만 적어 주세요'); return; }
    if (D.missions.filter(m => !m.doneAt).length >= MAXM) { toast('하던 미션이 ' + MAXM + '개예요. 하나를 끝내거나 지운 뒤 새로 쪼개요', 3400); $('#sp-active').scrollIntoView({ behavior: 'auto', block: 'start' }); return; }
    if (C) C.close();
    M = { id: uid(), title, created: Date.now(), pieces: breakdown(title, D.lv), logged: [] };
    // 쪼개는 소리: 칼질 딸깍딸깍
    M.pieces.forEach((_, i) => tone(900 + i * 60, i * 0.045, 0.03, 'square', 0.025)); buzz([8, 30, 8, 30, 8]);
    openEdit(true);
  }

  /* ---------- 다듬기 ---------- */
  function openEdit(fresh) {
    show('edit'); $('#sp-edit-t').textContent = M.title; renderPieces(fresh);
    const tip = Z.pick(TIPS); $('#sp-tip').innerHTML = ''; $('#sp-tip').append(h('b', { text: '쪼개는 요령 · ' + tip[0] }), tip[1]);
    $('#sp-edit-t').focus({ preventScroll: true });
  }
  const GRIP = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="5" cy="3" r="1.4"/><circle cx="11" cy="3" r="1.4"/><circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/><circle cx="5" cy="13" r="1.4"/><circle cx="11" cy="13" r="1.4"/></svg>';
  function renderPieces(fresh) {
    el.pieces.innerHTML = '';
    M.pieces.forEach((p, i) => {
      const inp = h('input', { value: p.t, maxlength: '60', 'aria-label': (i + 1) + '번 조각' });
      inp.addEventListener('input', () => { live(p).t = inp.value; });
      inp.addEventListener('change', () => { const q = live(p); if (!q.t.trim() && M.pieces.length > 1) { M.pieces.splice(M.pieces.indexOf(q), 1); renderPieces(); } });
      const li = h('li', { class: 'sp-p' + (fresh && !reduced() ? ' new' : ''), style: fresh ? { animationDelay: (i * 45) + 'ms' } : null, 'data-id': p.id },
        h('button', { type: 'button', class: 'grip', html: GRIP, 'aria-label': (i + 1) + '번 조각 끌어서 옮기기 (키보드: 위·아래 화살표)' }),
        h('span', { class: 'no', 'aria-hidden': 'true' }), inp,
        h('span', { class: 'tools' },
          h('button', { type: 'button', class: 'tb cut', text: '더 쪼개기', 'aria-label': (i + 1) + '번 조각 더 쪼개기', onclick: () => { const q = live(p), at = M.pieces.indexOf(q); if (at < 0) return; const parts = splitPiece(q.t).map(t => ({ id: uid(), t, done: false })); M.pieces.splice(at, 1, ...parts); tone(1100, 0, 0.03, 'square', 0.03); tone(1300, 0.05, 0.03, 'square', 0.03); buzz([6, 20, 6]); renderPieces(); } }),
          h('button', { type: 'button', class: 'tb', text: '✕', 'aria-label': (i + 1) + '번 조각 빼기', onclick: () => { if (M.pieces.length <= 1) { toast('조각이 하나는 있어야 해요'); return; } const at = M.pieces.indexOf(live(p)); if (at >= 0) M.pieces.splice(at, 1); renderPieces(); } })));
      el.pieces.appendChild(li);
      dragify(li, li.querySelector('.grip'), p);
    });
    $('#sp-start').textContent = M.pieces.length + '조각 — 첫 조각 시작';
  }
  /* 끌어서 순서 바꾸기 (손잡이) + 키보드 ↑↓ */
  function dragify(li, grip, p) {
    grip.addEventListener('keydown', e => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault(); const q = live(p), i = M.pieces.indexOf(q), j = e.key === 'ArrowUp' ? i - 1 : i + 1; if (i < 0) return;
      if (j < 0 || j >= M.pieces.length) return;
      M.pieces.splice(i, 1); M.pieces.splice(j, 0, q); renderPieces();
      const g = el.pieces.querySelector(`[data-id="${p.id}"] .grip`); if (g) g.focus();
      Z.announce((j + 1) + '번째로 옮겼어요');
    });
    grip.addEventListener('pointerdown', e => {
      e.preventDefault(); grip.setPointerCapture(e.pointerId);
      const items = Array.from(el.pieces.children); const rects = items.map(x => x.getBoundingClientRect());
      const y0 = e.clientY; li.classList.add('dragging'); let to = items.indexOf(li); const from = to;
      function mv(ev) {
        const dy = ev.clientY - y0; li.style.transform = 'translateY(' + dy + 'px)';
        const mid = rects[from].top + rects[from].height / 2 + dy;
        let k = rects.findIndex(r => mid < r.top + r.height / 2); if (k < 0) k = items.length - 1;
        if (k !== to) { to = k; buzz(5); }
        items.forEach((x, idx) => { if (x === li) return; let s = 0; const hgt = rects[from].height + 8; if (from < to && idx > from && idx <= to) s = -hgt; if (from > to && idx < from && idx >= to) s = hgt; x.style.transform = s ? 'translateY(' + s + 'px)' : ''; x.style.transition = 'transform .15s'; });
      }
      function up() {
        grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
        items.forEach(x => { x.style.transform = ''; x.style.transition = ''; }); li.classList.remove('dragging');
        if (to !== from) { const q = live(p), fi = M.pieces.indexOf(q); if (fi >= 0) { M.pieces.splice(fi, 1); M.pieces.splice(to, 0, q); } tone(660, 0, 0.03, 'square', 0.03); }
        renderPieces();
      }
      grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });
  }
  $('#sp-add').addEventListener('submit', e => { e.preventDefault(); const v = $('#sp-add-in').value.trim(); if (!v) return; M.pieces.push({ id: uid(), t: v, done: false }); $('#sp-add-in').value = ''; renderPieces(); });
  $('#sp-cancel').addEventListener('click', () => {
    if (M && M.saved) {                                // 저장된 미션을 고치던 중이면 고친 것을 id 로 저장(F7)
      const at = D.missions.findIndex(x => x.id === M.id);
      if (at < 0) { gone(); return; }
      const prev = D.missions[at]; D.missions[at] = M;
      if (!save(D)) { D.missions[at] = prev; return; }
    }
    M = null; show('nw'); renderNew(); el.task.focus();
  });
  $('#sp-start').addEventListener('click', () => {
    M.pieces = M.pieces.filter(p => p.t.trim()); if (!M.pieces.length) { toast('조각이 하나는 있어야 해요'); return; }
    if (M.saved) {                                   // 이미 저장된 미션을 고친 경우 — 다른 창에서 지웠으면 되살리지 않는다(F5)
      const at = D.missions.findIndex(x => x.id === M.id);
      if (at < 0) { gone(); return; }
      D.missions[at] = M;
    } else { M.saved = true; D.missions.push(M); }
    if (!save(D)) { return; }
    openRun(true);
  });

  /* ---------- 한 조각씩 ---------- */
  function openRun(first) { show('run'); renderRun(); if (first) { tone(523, 0, 0.08); tone(784, 0.08, 0.1); } $('#sp-now-t').focus({ preventScroll: true }); }
  function nowPiece() { return M.pieces.find(p => !p.done); }
  function renderRun(keepTimer) {
    const n = M.pieces.filter(p => p.done).length, N = M.pieces.length;
    $('#sp-run-t').textContent = M.title;
    const bar = $('#sp-bar'); bar.setAttribute('aria-valuemax', String(N)); bar.setAttribute('aria-valuenow', String(n)); bar.setAttribute('aria-label', '조각 ' + N + '개 중 ' + n + '개 해치움');
    bar.querySelector('i').style.width = (n / N) * 100 + '%';
    $('#sp-bar-l').textContent = n + ' / ' + N + ' 조각'; $('#sp-bar-r').textContent = Math.round((n / N) * 100) + '%';
    const cur = nowPiece();
    $('#sp-now-t').textContent = cur ? cur.t : '모두 해치웠어요';
    if (!keepTimer) { $('#sp-now-timer').innerHTML = ''; if (T) { T.stop(); T = null; } }
    el.board.innerHTML = '';
    M.pieces.forEach((p, i) => {
      const isNow = p === cur;
      const chk = h('button', { type: 'button', class: 'z-check', 'aria-pressed': String(p.done), 'aria-label': (i + 1) + '번 ' + p.t + (p.done ? ' — 해치움, 누르면 되돌리기' : ' — 누르면 해치움') },
        h('span', { class: 'bx', html: Z.icon.check }), h('span', { class: 'lb', text: p.t }), h('span', { class: 'cl', text: 'CLEAR' }));
      chk.addEventListener('click', () => { const q = live(p); if (q.done) { q.done = false; delete q.at; persist(); renderRun(true); } else complete(q, li); });
      const li = h('li', { class: 'sp-b' + (p.done ? ' did' : '') + (isNow ? ' now' : '') }, h('span', { class: 'trail', 'aria-hidden': 'true' }),
        h('div', { class: 'row' }, h('span', { class: 'no', 'aria-hidden': 'true', text: String(i + 1).padStart(2, '0') }), chk, isNow ? h('span', { class: 'nowtag', text: 'NOW' }) : null));
      if (!p.done) swipe(li, p);
      el.board.appendChild(li);
    });
  }
  /* 핵심: 밀어서 해치우기 */
  function swipe(li, p) {
    const row = li.querySelector('.row'), trail = li.querySelector('.trail');
    let s = null;
    li.addEventListener('pointerdown', e => { if (e.button > 0) return; s = { x0: e.clientX, y0: e.clientY, dx: 0, on: false, half: false, id: e.pointerId }; });
    li.addEventListener('pointermove', e => {
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
      if (!s.on) { if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s = null; return; } if (dx > 10) { s.on = true; li.setPointerCapture(e.pointerId); li.classList.remove('snap'); } else return; }
      s.dx = Math.max(0, dx); const w = li.clientWidth, r = s.dx / w;
      row.style.setProperty('--dx', s.dx + 'px'); trail.style.width = s.dx + 'px'; trail.style.setProperty('--o', Math.min(1, r * 2.2));
      if (r > 0.42 && !s.half) { s.half = true; buzz(8); tone(990, 0, 0.03, 'square', 0.03); } else if (r < 0.42 && s.half) s.half = false;
    });
    function end() {
      if (!s) return; const was = s; s = null; if (!was.on) return;
      li.classList.add('snap');
      if (was.dx / li.clientWidth > 0.42) { row.style.setProperty('--dx', li.clientWidth + 'px'); trail.style.width = '100%'; setTimeout(() => complete(p, li), reduced() ? 0 : 200); }
      else { row.style.setProperty('--dx', '0px'); trail.style.width = '0'; }
      li._noClick = true; setTimeout(() => { li._noClick = false; }, 80);
    }
    li.addEventListener('pointerup', end); li.addEventListener('pointercancel', end);
    li.addEventListener('click', e => { if (li._noClick) { e.stopPropagation(); e.preventDefault(); } }, true);
  }
  function complete(p, li) {
    if (!exists()) { gone(); return; }
    p = live(p);
    if (p.done) return;
    p.done = true; p.at = Date.now();
    const n = M.pieces.filter(x => x.done).length, N = M.pieces.length;
    if (n === N) { if (finishMission() === false) { p.done = false; delete p.at; renderRun(true); } return; }   // 마지막 조각 = 완료 기록과 한 번에 저장(F4)
    if (!save(D)) { p.done = false; delete p.at; return; }
    tone(660 + n * 40, 0, 0.06); tone(990 + n * 40, 0.06, 0.08); buzz(16);
    Z.celebrate(li || null, { big: false });
    renderRun();
    if (!reduced()) { const nowLi = el.board.querySelector('.sp-b.now'); if (nowLi) { nowLi.classList.add('zap'); } }
    Z.announce('해치웠어요. ' + n + ' / ' + N + '. 다음 조각: ' + (nowPiece() ? nowPiece().t : ''));
    $('#sp-now-t').focus({ preventScroll: true });
  }
  $('#sp-done1').addEventListener('click', () => { const c = nowPiece(); if (c) complete(c, $('#sp-now')); });
  $('#sp-min1').addEventListener('click', () => {
    const box = $('#sp-now-timer'); box.innerHTML = ''; if (T) T.stop();
    T = timer(box, { sec: 60, label: '1분', controls: false, tickSound: true, onDone: () => { T = null; toast('1분! 해치웠으면 «해치움»'); $('#sp-done1').focus(); } });
  });
  $('#sp-pause').addEventListener('click', () => {
    if (!exists()) { gone(); return; }
    const today = dayKey(); const n = M.pieces.filter(p => p.done && p.at && dayKey(p.at) === today).length;
    if (n && !(M.logged || []).includes(today)) {
      M.logged = (M.logged || []).concat(today);
      done('쪼개기: ' + M.title + ' ' + M.pieces.filter(p => p.done).length + '/' + M.pieces.length + '조각', { label: '오늘 몫 해냄', big: false });
    } else if (n) toast('오늘 몫은 이미 기록했어요'); else toast('조각을 하나라도 해치우면 기록돼요');
    persist(); M = null; if (T) { T.stop(); T = null; } show('nw'); renderNew(); renderStats();
  });
  $('#sp-back').addEventListener('click', () => { if (T) { T.stop(); T = null; } openEdit(false); });
  function finishMission() {
    if (!exists()) { gone(); return; }
    const prevH = D.history, prevM = D.missions, now = Date.now();
    D.history = D.history.concat({ title: M.title, n: M.pieces.length, t: now, min: Math.max(1, Math.round((now - M.created) / 60000)) }).slice(-200);
    D.missions = D.missions.filter(x => x.id !== M.id);
    const r = done('쪼개서 끝냄: ' + M.title + ' (' + M.pieces.length + '조각)', { label: 'MISSION CLEAR', say: '미션 완료', data: D });   // 미션 기록 + 오늘 한 일 한 번에
    if (!r.entry) { D.history = prevH; D.missions = prevM; return false; }
    M.doneAt = now;
    show('end');
    $('#sp-end-t').textContent = M.title + ' 끝!';
    $('#sp-end-d').textContent = '막막하던 일을 ' + M.pieces.length + '조각으로 해치웠어요. 큰 일도 결국 작은 조각이에요.';
    $('#sp-end-t').focus({ preventScroll: true });
    M = null; renderStats();
    return true;
  }
  $('#sp-another').addEventListener('click', () => { show('nw'); el.task.value = ''; renderNew(); el.task.focus(); });

  /* ---------- 기록 ---------- */
  function renderStats() {
    el.stats.innerHTML = '';
    const H = D.history; const pieces = D.missions.reduce((a, m) => a + m.pieces.filter(p => p.done).length, 0) + H.reduce((a, x) => a + x.n, 0);
    if (!H.length && !pieces) { el.stats.appendChild(h('p', { class: 'z-empty', text: '첫 미션을 끝내면 «몇 조각으로 끝냈는지»가 여기 쌓여요.' })); return; }
    el.stats.appendChild(h('div', { class: 'z-stats' },
      h('div', { class: 'z-stat' }, h('b', { class: 'acc', text: H.length }), h('span', { text: '끝낸 미션' })),
      h('div', { class: 'z-stat' }, h('b', { text: pieces }), h('span', { text: '해치운 조각' })),
      h('div', { class: 'z-stat' }, h('b', { text: H.length ? Math.round(H.reduce((a, x) => a + x.n, 0) / H.length) : '-' }), h('span', { text: '평균 조각' }))));
    if (H.length) {
      el.stats.appendChild(h('p', { class: 'sp-sub', text: '끝낸 미션' }));
      const ul = h('ul', { class: 'z-list' });
      H.slice(-5).reverse().forEach(x => ul.appendChild(h('li', null, h('span', { class: 't', text: x.title }), h('span', { class: 'm', text: x.n + '조각 · ' + Z.dayLabel(dayKey(x.t)) }))));
      el.stats.appendChild(ul);
    }
  }

  renderNew(); renderStats();
  const C = coach($('#sp-coach'), 'split', ['막막한 일을 통째로 적고 «얼마나 잘게»를 골라요.', '나온 조각은 눌러 고치고, 너무 크면 «더 쪼개기».', '«지금 조각»만 보고 하나씩 — 오른쪽으로 밀면 해치워져요.']);
  Z.on('change', ev => {
    if (!ev || !ev.remote) return;
    D = clean(store());
    if (M && !el.edit.hidden) return;                 // 다듬는 중인 초안은 그대로 둔다(시작할 때 맞춘다)(F4)
    if (M && !el.run.hidden) {
      const m = D.missions.find(x => x.id === M.id);
      if (!m) { gone(); return; }
      M = m; M.saved = true; renderRun(true); return;
    }
    if (!el.nw.hidden) { renderNew(); renderStats(); }
  });
})();
