/* ==========================================================================
   도파민 좀비탈출 — 공통 부품 Z (모든 화면이 같은 것을 쓴다)
   🔴 모듈은 이 파일을 고치지 않는다. 필요한 건 Z.* 로 부른다.
   저장: localStorage 'zb:v1' 한 곳(같은 출처 → 허브·30개 앱·홈 화면 아이콘 어디서 열어도 같은 기록)
   ========================================================================== */
(function () {
  'use strict';
  const KEY = 'zb:v1';
  const MAX_LOG = 6000;
  const doc = document, root = doc.documentElement;
  const body = () => doc.body;
  const META = (() => { try { return JSON.parse(doc.getElementById('z-meta').textContent); } catch (e) { return {}; } })();
  const BASE = META.base || '/zombie/';

  /* ---------- 날짜 ---------- */
  const pad = n => String(n).padStart(2, '0');
  function dayKey(d) { d = d ? new Date(d) : new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(key, n) { const [y, m, dd] = key.split('-').map(Number); const d = new Date(y, m - 1, dd + n); return dayKey(d); }
  function dayLabel(key) { const [y, m, d] = key.split('-').map(Number); const w = '일월화수목금토'[new Date(y, m - 1, d).getDay()]; return m + '/' + d + ' ' + w; }
  function timeLabel(t) { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  /* ---------- 저장소 ---------- */
  const DEF_SET = { sound: true, vib: true, fx: 'auto', motion: 'system' };
  function blank() { return { v: 1, created: dayKey(), log: [], mods: {}, set: Object.assign({}, DEF_SET) }; }
  function valid(s) { return s && typeof s === 'object' && s.v === 1 && Array.isArray(s.log) && s.mods && typeof s.mods === 'object'; }
  /* 모듈 자료 모양 — 불러올 때·가져올 때 같은 규칙으로 검사(F3) */
  const str = x => typeof x === 'string';
  const num = x => typeof x === 'number' && isFinite(x);
  const SCHEMA = {   // 필드: 항목 검사 함수 — 가져오기(strict)는 하나라도 틀리면 통째로 거부, 불러오기는 틀린 항목만 버림
    switch: { events: e => num(e.t) && num(e.f) },
    starter: { recent: str, starts: o => str(o.task) },
    split: { missions: m => str(m.title) && Array.isArray(m.pieces) && m.pieces.length > 0 && m.pieces.every(p => p && str(p.t)), history: o => str(o.title) },
    roulette: { items: it => str(it.name) && it.name.trim().length > 0, spins: o => str(o.name) },
    promise: { active: o => str(o.what) && num(Number(o.due)), hist: o => str(o.what) && num(Number(o.due)) }
  };
  const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
  function normalize(s, strict) {
    if (!valid(s)) throw new Error('shape');
    s.set = Object.assign({}, DEF_SET, isObj(s.set) ? s.set : {});
    s.seen = isObj(s.seen) ? s.seen : {};
    const validLog = e => isObj(e) && typeof e.m === 'string' && num(e.t) && (e.w === undefined || str(e.w));
    if (strict && !s.log.every(validLog)) throw new Error('log');
    s.log = s.log.filter(validLog).map(e => {
      const o = { t: e.t, d: typeof e.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.d) ? e.d : dayKey(e.t), m: e.m.slice(0, 20), w: typeof e.w === 'string' ? e.w.slice(0, 160) : '' };
      if (typeof e.n === 'number' && isFinite(e.n) && e.n > 0) o.n = e.n;
      if (typeof e.id === 'string') o.id = e.id.slice(0, 40);
      return o;
    }).slice(-MAX_LOG);
    const mods = {};
    for (const k in s.mods) {
      const v = s.mods[k];
      if (!isObj(v)) { if (strict) throw new Error('mod ' + k); continue; }
      const sc = SCHEMA[k] || {};
      for (const f in sc) {
        if (v[f] === undefined) continue;
        if (!Array.isArray(v[f])) { if (strict) throw new Error('field ' + k + '.' + f); delete v[f]; continue; }
        const good = v[f].filter(x => x !== null && (typeof x === 'object' || typeof x === 'string') && (() => { try { return sc[f](x); } catch (e) { return false; } })());
        if (good.length !== v[f].length) { if (strict) throw new Error('item ' + k + '.' + f); v[f] = good; }
      }
      mods[k] = v;
    }
    s.mods = mods;
    return s;
  }
  let S = load();
  let saveOk = true;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      return normalize(JSON.parse(raw), false);
    } catch (e) { return blank(); }
  }
  /* 🔴 여러 창(허브·앱·홈 화면 아이콘)이 같은 저장소를 쓴다 — 통째로 덮지 않고 «최신 저장본 + 이 창에서 바꾼 것»을 합쳐 쓴다(F2).
     기록 줄은 id 로 합치고, 모듈 자료는 이 창이 바꾼 모듈만 내 것으로, 설정은 바꿨을 때만 내 것으로. 한 번의 동기 실행 안에서 읽고-합치고-쓴다. */
  const dirty = { mods: new Set(), set: false, log: new Set() };
  const lkey = e => e.id || (e.t + '|' + e.m + '|' + e.w);
  function merged() {
    let latest = null;
    try { const raw = localStorage.getItem(KEY); latest = raw ? normalize(JSON.parse(raw), false) : null; } catch (e) { latest = null; }
    if (!latest) return JSON.parse(JSON.stringify(S));
    const out = latest;
    const map = new Map(out.log.map(e => [lkey(e), e]));
    S.log.forEach(e => { const k = lkey(e); if (!map.has(k) || dirty.log.has(k)) map.set(k, e); });
    out.log = Array.from(map.values()).sort((a, b) => a.t - b.t).slice(-MAX_LOG);
    dirty.mods.forEach(k => { if (S.mods[k] !== undefined) out.mods[k] = S.mods[k]; });
    if (dirty.set) out.set = S.set;
    out.seen = Object.assign({}, out.seen || {}, S.seen || {});
    return out;
  }
  function save(replace) {
    let next;
    try { next = replace ? S : merged(); localStorage.setItem(KEY, JSON.stringify(next)); }
    catch (e) { if (saveOk) toast('기록이 저장되지 않았어요. 저장 공간이나 사생활 보호 모드를 확인해 주세요.', 4200); saveOk = false; return false; }
    if (next !== S) S = JSON.parse(JSON.stringify(next));
    dirty.mods.clear(); dirty.set = false; dirty.log.clear(); saveOk = true; return true;
  }
  const listeners = {};
  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }
  function emit(ev, x) { (listeners[ev] || []).forEach(fn => { try { fn(x); } catch (e) { console.error(e); } }); }
  window.addEventListener('storage', e => { if (e.key === KEY) { S = load(); applyMotion(); emit('change', { remote: true }); renderRecord(); } });

  function store(slug) { slug = slug || META.slug; const v = S.mods[slug]; return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : {}; }
  function saveStore(slug, obj) { if (typeof slug === 'object') { obj = slug; slug = META.slug; } const prev = S.mods[slug], wasDirty = dirty.mods.has(slug); S.mods[slug] = JSON.parse(JSON.stringify(obj)); dirty.mods.add(slug); if (!save()) { S.mods[slug] = prev; if (!wasDirty) dirty.mods.delete(slug); return false; } emit('change', { remote: false }); return true; }
  function log(slug) { const L = S.log.slice(); return slug ? L.filter(e => e.m === slug) : L; }
  function countOn(day, slug) { return S.log.reduce((n, e) => n + (e.d === day && (!slug || e.m === slug) ? 1 : 0), 0); }
  function activeDays() { return new Set(S.log.map(e => e.d)).size; }
  function streak() {
    const days = new Set(S.log.map(e => e.d));
    let k = dayKey(); if (!days.has(k)) k = addDays(k, -1);
    let n = 0; while (days.has(k)) { n++; k = addDays(k, -1); }
    return n;
  }

  /* ---------- 오늘 한 일 기록 (모든 모듈 공통 입구) ---------- */
  function done(slug, what, opt) {
    if (typeof slug !== 'string' || !META.mods || !(slug in (META.mods || {}))) { opt = what; what = slug; slug = META.slug; }
    opt = opt || {};
    const t = Date.now();
    const e = { t, d: dayKey(t), m: slug, w: String(what || '').slice(0, 160), id: uid() };
    if (typeof opt.min === 'number' && isFinite(opt.min) && opt.min > 0) e.n = Math.round(opt.min * 10) / 10;
    const prevMod = S.mods[slug];
    const wasDirty = dirty.mods.has(slug);
    if (opt.data !== undefined) { S.mods[slug] = JSON.parse(JSON.stringify(opt.data)); dirty.mods.add(slug); }   // 모듈 기록과 공통 기록을 한 번에 저장
    S.log.push(e); dirty.log.add(lkey(e));
    if (S.log.length > MAX_LOG) S.log = S.log.slice(-MAX_LOG);
    if (!save()) { S.log = S.log.filter(x => x !== e); dirty.log.delete(lkey(e)); if (opt.data !== undefined) { S.mods[slug] = prevMod; if (!wasDirty) dirty.mods.delete(slug); } return { entry: null, failed: true, today: countOn(dayKey(), slug), all: countOn(dayKey()) }; }
    const today = countOn(e.d, slug), all = countOn(e.d);
    if (!opt.quiet) celebrate(opt.anchor || null, { big: opt.big !== false, label: opt.label });
    announce((opt.say || '기록했어요') + ' — 오늘 ' + all + '번째 행동');
    renderRecord(); emit('done', e); emit('change', { remote: false });
    return { entry: e, today, all };
  }

  /* 같은 기록 한 줄을 고친다(계속해서 늘어난 시간 등) — 새 줄을 만들지 않는다(F9) */
  function amend(id, patch) {
    const e = S.log.find(x => x.id === id); if (!e) return false;
    if (patch && typeof patch.w === 'string') e.w = patch.w.slice(0, 160);
    if (patch && typeof patch.min === 'number' && isFinite(patch.min) && patch.min > 0) e.n = Math.round(patch.min * 10) / 10;
    dirty.log.add(lkey(e)); if (!save()) return false; renderRecord(); emit('change', { remote: false }); return true;
  }

  /* ---------- 접근성: 화면 읽기 알림 ---------- */
  function announce(msg) { const el = doc.getElementById('sr-live'); if (!el) return; el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 40); }

  /* ---------- 토스트 ---------- */
  let tT = null;
  function toast(msg, ms) { const el = doc.getElementById('z-toast'); if (!el) return; el.textContent = msg; el.classList.add('show'); clearTimeout(tT); tT = setTimeout(() => el.classList.remove('show'), ms || 2300); }

  /* ---------- 움직임·소리·진동 ---------- */
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  function reduced() { return S.set.motion === 'reduce' || (S.set.motion !== 'full' && mq.matches); }
  function applyMotion() { root.classList.toggle('z-reduce', S.set.motion === 'reduce'); }
  /* 보상은 점점 줄인다(기획 원칙): 자동 = 처음 14일 «크게», 그 뒤 «작게» */
  function fxLevel() { if (S.set.fx !== 'auto') return S.set.fx; return activeDays() <= 14 ? 'full' : 'light'; }
  let actx = null;
  function ac() { if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { actx = new C(); } catch (e) { return null; } } if (actx.state === 'suspended') actx.resume().catch(() => {}); return actx; }
  function tone(f, t0, dur, type, vol) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, c.currentTime + t0);
    g.gain.setValueAtTime(0.0001, c.currentTime + t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.05, c.currentTime + t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
    o.connect(g).connect(c.destination); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.03);
  }
  const SND = {
    tap: () => tone(880, 0, 0.05, 'square', 0.03),
    tick: () => tone(1046, 0, 0.06, 'square', 0.04),
    go: () => { tone(523, 0, 0.08); tone(1046, 0.08, 0.16); },
    done: () => { tone(660, 0, 0.07); tone(990, 0.07, 0.12); },
    big: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.11)); },
    soft: () => tone(392, 0, 0.5, 'sine', 0.08)
  };
  function sound(k) { if (!S.set.sound) return; try { (SND[k] || SND.tap)(); } catch (e) { } }
  function buzz(p) { if (!S.set.vib || !navigator.vibrate) return; if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; try { navigator.vibrate(p == null ? 18 : p); } catch (e) { } }
  function cssVar(n) { return getComputedStyle(root).getPropertyValue(n).trim() || '#C6FF3D'; }

  function celebrate(anchor, opt) {
    opt = opt || {}; const big = !!opt.big; const lv = fxLevel();
    if (lv === 'off') return;
    sound(big && lv === 'full' ? 'big' : 'done');
    buzz(big ? [20, 40, 20] : 16);
    if (lv !== 'full' || reduced()) { if (big) toast(opt.label || 'CLEAR — 해냈어요'); return; }
    const f = doc.createElement('div'); f.className = 'z-fx-flash'; f.setAttribute('aria-hidden', 'true'); body().appendChild(f); setTimeout(() => f.remove(), 700);
    if (big) {
      const c = doc.createElement('div'); c.className = 'z-fx-clear'; c.setAttribute('aria-hidden', 'true');
      c.innerHTML = 'CLEAR<small></small>'; c.querySelector('small').textContent = opt.label || '해냈어요';
      body().appendChild(c); setTimeout(() => c.remove(), 1200);
    }
    confetti(anchor, big);
    if (anchor) xpPop(anchor, opt.xp || '+1');
  }
  function confetti(anchor, big) {
    const cv = doc.createElement('canvas'); cv.className = 'z-fx-canvas'; cv.setAttribute('aria-hidden', 'true');
    const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    body().appendChild(cv); const g = cv.getContext('2d'); if (!g) { cv.remove(); return; } g.scale(dpr, dpr);
    const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight * 0.42, width: 0, height: 0 };
    const ox = r.left + r.width / 2, oy = r.top + r.height / 2;
    const acc = cssVar('--acc'); const cols = [acc, acc, '#EEF1F6', '#C6FF3D', '#FFC23D', '#3DE8FF', '#FF8A5C', '#FF7AC0'];
    const n = big ? 80 : 22;
    const ps = Array.from({ length: n }, () => ({ x: ox, y: oy, vx: (Math.random() - .5) * (big ? 13 : 7), vy: -Math.random() * (big ? 13 : 7) - 2, w: 4 + Math.random() * 6, h: 2 + Math.random() * 3, c: cols[(Math.random() * cols.length) | 0], a: Math.random() * 6, va: (Math.random() - .5) * .35 }));
    const t0 = performance.now(), life = big ? 1500 : 1000;
    (function fr(t) {
      const el = t - t0; g.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of ps) { p.vy += .34; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va; g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.globalAlpha = Math.max(0, 1 - el / life); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); }
      if (el < life) requestAnimationFrame(fr); else cv.remove();
    })(t0);
  }
  function xpPop(anchor, text) {
    if (reduced() || !anchor || !anchor.getBoundingClientRect) return;
    const r = anchor.getBoundingClientRect(); const p = doc.createElement('span');
    p.className = 'z-xp'; p.textContent = text; p.setAttribute('aria-hidden', 'true');
    p.style.left = Math.max(8, Math.min(innerWidth - 60, r.left + r.width / 2 - 14)) + 'px'; p.style.top = (r.top + scrollY - 8) + 'px';
    body().appendChild(p); setTimeout(() => p.remove(), 950);
  }
  function popEl(el) { if (!el || reduced()) return; el.classList.remove('z-pop'); void el.offsetWidth; el.classList.add('z-pop'); }

  /* ---------- DOM 도우미 ---------- */
  function h(tag, attrs) {
    const el = doc.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (let i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(x => add(el, x)); else el.appendChild(c.nodeType ? c : doc.createTextNode(String(c))); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function $(sel, r) { return (r || doc).querySelector(sel); }
  function $$(sel, r) { return Array.from((r || doc).querySelectorAll(sel)); }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function hash(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
  /* 날짜로 하루 하나 고정(오늘의 카드) */
  function daily(arr, salt, day) { return arr[hash((day || dayKey()) + '|' + (salt || META.slug || '')) % arr.length]; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  const ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="square" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 7v7M9 11l3 3 3-3"/></svg>'
  };

  /* ---------- 시트(창) ---------- */
  function sheet(opt) {
    const wrap = h('div', { class: 'z-sheet-wrap' });
    const tid = 'zs-' + uid();
    const box = h('div', { class: 'z-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': tid });
    box.appendChild(h('h2', { id: tid, text: opt.title || '' }));
    if (opt.body) { if (typeof opt.body === 'string') box.appendChild(h('div', { html: opt.body })); else box.appendChild(opt.body); }
    const row = h('div', { class: 'z-row end' });
    const prev = doc.activeElement;
    const others = Array.from(body().children).filter(el => el !== wrap && !el.inert && !['SCRIPT', 'STYLE'].includes(el.tagName) && el.id !== 'sr-live' && el.id !== 'z-toast');
    function close(v) { wrap.remove(); others.forEach(el => { el.inert = false; }); if (prev && prev.focus && doc.contains(prev)) prev.focus(); if (opt.onClose) opt.onClose(v); }
    (opt.actions || [{ label: '닫기' }]).forEach(a => {
      row.appendChild(h('button', { type: 'button', class: 'z-btn small' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : ''), text: a.label, onclick: () => { const keep = a.onClick && a.onClick(box) === false; if (!keep) close(a.value); } }));
    });
    box.appendChild(row);
    wrap.appendChild(box);
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    wrap.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') {
        const f = $$('button,a[href],input,textarea,select,[tabindex]:not([tabindex="-1"])', box).filter(x => !x.disabled && x.offsetParent !== null);
        if (!f.length) return; const i = f.indexOf(doc.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
    body().appendChild(wrap); others.forEach(el => { el.inert = true; });
    const first = box.querySelector('input,textarea,select') || row.querySelector('.primary') || row.querySelector('button');
    if (first) first.focus();
    return { close, box };
  }
  function confirmBox(title, msg, okLabel) {
    return new Promise(res => sheet({ title, body: h('p', { class: 'z-muted', text: msg || '' }), actions: [{ label: '취소', value: false }, { label: okLabel || '네', primary: true, value: true }], onClose: v => res(v === true) }));
  }

  /* ---------- 링 타이머 ---------- */
  function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); const m = Math.floor(sec / 60), s = sec % 60; return m ? m + ':' + pad(s) : String(s); }
  function timer(container, opt) {
    opt = Object.assign({ sec: 60, label: '남은 시간', controls: true, autoStart: true, tickSound: false }, opt || {});
    const R = 52, C = 2 * Math.PI * R;
    const el = h('div', { class: 'z-timer' });
    const ring = h('div', { class: 'z-ring', role: 'timer', 'aria-label': opt.label });
    ring.innerHTML = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="trk" cx="60" cy="60" r="' + R + '" fill="none" stroke-width="10"/><circle class="fil" cx="60" cy="60" r="' + R + '" fill="none" stroke-width="10" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '"/></svg>';
    const lbl = h('div', { class: 'lbl' }, h('b', { text: fmt(opt.sec) }), h('span', { text: opt.label }));
    ring.appendChild(lbl);
    const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });
    el.appendChild(ring); el.appendChild(live);
    const fil = ring.querySelector('.fil'), num = lbl.querySelector('b');
    let total = opt.sec * 1000, left = total, endAt = 0, running = false, iv = null, lastSec = -1, finished = false;
    const pauseBtn = h('button', { type: 'button', class: 'z-btn small', text: '잠깐 멈춤' });
    const stopBtn = h('button', { type: 'button', class: 'z-btn small ghost', text: '그만하기' });
    if (opt.controls) { el.appendChild(h('div', { class: 'z-row' }, pauseBtn, stopBtn)); }
    pauseBtn.addEventListener('click', () => { running ? pause() : resume(); });
    stopBtn.addEventListener('click', () => { stop(); if (opt.onStop) opt.onStop(elapsed()); });
    function remainingMs() { return running ? Math.max(0, Math.min(total, endAt - Date.now())) : left; }
    function elapsed() { return (total - remainingMs()) / 1000; }
    function paint() {
      const frac = 1 - left / total; fil.setAttribute('stroke-dashoffset', String(C * (1 - frac)));
      const s = Math.ceil(left / 1000); num.textContent = fmt(left / 1000);
      if (s !== lastSec) { lastSec = s; if (opt.onTick) opt.onTick(s); if (opt.tickSound && s <= 3 && s > 0) sound('tick'); if (s > 0 && (s % 60 === 0 || s === 10 || s === 30 && total > 60000)) live.textContent = fmt(s) + (s >= 60 ? '분' : '초') + ' 남음'; }
    }
    function loop() { if (!running) return; left = Math.max(0, endAt - Date.now()); paint(); if (left <= 0) finish(); }
    function start() { finished = false; el.classList.remove('done'); left = total; resume(); }
    function resume() { if (finished) return; running = true; endAt = Date.now() + left; clearInterval(iv); iv = setInterval(loop, 200); pauseBtn.textContent = '잠깐 멈춤'; loop(); wake(true); }
    function pause() { left = remainingMs(); running = false; clearInterval(iv); pauseBtn.textContent = '이어서'; paint(); wake(false); }
    function stop() { left = remainingMs(); running = false; clearInterval(iv); wake(false); }
    function finish() { running = false; finished = true; clearInterval(iv); left = 0; paint(); el.classList.add('done'); num.textContent = opt.doneText || '끝'; live.textContent = '시간이 끝났어요'; wake(false); if (opt.controls) pauseBtn.disabled = true; sound('go'); buzz([30, 60, 30]); if (opt.onDone) opt.onDone(); }
    function setSec(s) { total = s * 1000; left = total; lastSec = -1; paint(); }
    container.appendChild(el);
    paint(); if (opt.autoStart) start();
    return { el, start, pause, resume, stop, finish, setSec, elapsed, get running() { return running; }, get left() { return left / 1000; } };
  }
  let wl = null;
  async function wake(onoff) { try { if (onoff && 'wakeLock' in navigator && !wl) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); } else if (!onoff && wl) { await wl.release(); wl = null; } } catch (e) { wl = null; } }

  /* ---------- 3·2·1 카운트다운 (전체 화면) ---------- */
  function countdown(n, opt) {
    opt = opt || {};
    return new Promise(res => {
      const wrap = h('div', { class: 'z-count', role: 'dialog', 'aria-modal': 'true', 'aria-label': '카운트다운' });
      const b = h('b', { 'aria-hidden': 'true' }); const live = h('p', { class: 'sr-only', 'aria-live': 'assertive' });
      const x = h('button', { type: 'button', class: 'z-btn small ghost x', text: '취소' });
      wrap.append(b, live, x); if (opt.sub) wrap.appendChild(h('p', { class: 'sub', text: opt.sub }));
      body().appendChild(wrap); x.focus();
      let k = n, iv = null, over = false;
      function end(ok) { if (over) return; over = true; clearTimeout(iv); wrap.remove(); res(ok); }
      x.addEventListener('click', () => end(false));
      wrap.addEventListener('keydown', e => { if (e.key === 'Escape') end(false); if (e.key === 'Tab') { e.preventDefault(); x.focus(); } });
      (function step() {
        if (over) return;
        if (k > 0) { b.textContent = k; b.className = 'bump'; live.textContent = String(k); sound('tick'); buzz(25); k--; iv = setTimeout(step, 900); }
        else { b.textContent = opt.go || 'GO'; b.className = 'go bump'; live.textContent = '시작'; sound('go'); buzz([40, 30, 40]); iv = setTimeout(() => end(true), 650); }
      })();
    });
  }

  /* ---------- 막대 그래프 ---------- */
  function bars(container, items, opt) {
    opt = opt || {}; const W = 320, H = opt.h || 120, pb = 20, pt = 16; const n = items.length || 1;
    const max = Math.max(opt.max || 0, ...items.map(i => i.value), 1);
    const bw = (W / n) * 0.62, gap = W / n;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opt.title || '기록 그래프') + '">';
    items.forEach((it, i) => {
      const hh = Math.round(((H - pb - pt) * it.value) / max); const x = i * gap + (gap - bw) / 2, y = H - pb - hh;
      s += '<rect class="b' + (it.hi ? ' on' : '') + '" x="' + x.toFixed(1) + '" y="' + (it.value ? y : H - pb - 2) + '" width="' + bw.toFixed(1) + '" height="' + (it.value ? Math.max(hh, 3) : 2) + '" rx="2"/>';
      if (it.value) s += '<text class="v" x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 4) + '" text-anchor="middle">' + esc(it.value) + '</text>';
      s += '<text class="l" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 5) + '" text-anchor="middle">' + esc(it.label) + '</text>';
    });
    s += '</svg>';
    const wrap = h('div', { class: 'z-chart', html: s });
    wrap.appendChild(h('p', { class: 'sr-only', text: (opt.title || '기록') + ': ' + items.map(i => i.label + ' ' + i.value + (opt.unit || '')).join(', ') }));
    container.innerHTML = ''; container.appendChild(wrap); return wrap;
  }
  function week(slug, days) {
    days = days || 7; const out = []; const t = dayKey();
    for (let i = days - 1; i >= 0; i--) { const k = addDays(t, -i); const [, m, d] = k.split('-').map(Number); out.push({ key: k, label: i === 0 ? '오늘' : (m + '/' + d), value: countOn(k, slug), hi: i === 0 }); }
    return out;
  }

  /* ---------- 공통 기록 카드 (#z-record) ---------- */
  function renderRecord() {
    const box = doc.getElementById('z-record'); if (!box || !META.slug || META.slug === 'hub') return;
    const slug = META.slug; const mine = log(slug); const today = countOn(dayKey(), slug);
    const mins = mine.reduce((a, e) => a + (e.n || 0), 0);
    box.innerHTML = '';
    box.appendChild(h('h2', null, '이 앱 기록', h('span', { class: 'r', text: '내 폰에만 저장' })));
    box.appendChild(h('div', { class: 'z-stats' },
      h('div', { class: 'z-stat' }, h('b', { class: 'acc', text: today }), h('span', { text: '오늘' })),
      h('div', { class: 'z-stat' }, h('b', { text: mine.length }), h('span', { text: '모두' })),
      h('div', { class: 'z-stat' }, h('b', { text: mins ? (mins >= 100 ? Math.round(mins) : Math.round(mins * 10) / 10) : streak() }), h('span', { text: mins ? '모은 분' : '연속 일(전체)' }))));
    if (mine.length) { const ch = h('div'); box.appendChild(ch); bars(ch, week(slug), { title: '최근 7일 이 앱 기록' }); }
    const ul = h('ul', { class: 'z-list' });
    const rec = mine.slice(-5).reverse();
    if (!rec.length) ul.appendChild(h('li', { class: 'z-empty', text: '아직 기록이 없어요. 위 단추 하나면 첫 기록이 생겨요.' }));
    rec.forEach(e => ul.appendChild(h('li', null, h('span', { class: 't', text: e.w || '해냄' }), h('span', { class: 'm', text: (e.d === dayKey() ? '오늘 ' : dayLabel(e.d) + ' ') + timeLabel(e.t) }))));
    box.appendChild(ul);
  }

  /* ---------- 설정 창 ---------- */
  function sw(label, sub, get, set) {
    const b = h('button', { type: 'button', class: 'z-switch', role: 'switch', 'aria-checked': String(!!get()), 'aria-label': label });
    b.addEventListener('click', () => { const v = !get(); set(v); dirty.set = true; b.setAttribute('aria-checked', String(v)); save(); if (v) buzz(12); });
    return h('div', { class: 'z-set' }, h('div', { class: 't' }, h('b', { text: label }), h('span', { text: sub })), b);
  }
  function radios(label, sub, opts, get, set) {
    const g = h('div', { class: 'z-chips', role: 'radiogroup', 'aria-label': label });
    opts.forEach(([v, t]) => {
      const c = h('button', { type: 'button', class: 'z-chip', role: 'radio', 'aria-checked': String(get() === v), text: t });
      c.addEventListener('click', () => { set(v); dirty.set = true; save(); $$('.z-chip', g).forEach(x => x.setAttribute('aria-checked', String(x === c))); applyMotion(); });
      g.appendChild(c);
    });
    return h('div', { class: 'z-set', style: { display: 'block' } }, h('div', { class: 't', style: { marginBottom: '8px' } }, h('b', { text: label }), h('span', { text: sub })), g);
  }
  function openSettings() {
    const b = h('div');
    b.appendChild(sw('소리', '완료·카운트다운 소리', () => S.set.sound, v => { S.set.sound = v; }));
    b.appendChild(sw('진동', '폰에서 짧게 떨림', () => S.set.vib, v => { S.set.vib = v; }));
    b.appendChild(radios('축하 연출', '처음엔 크게, 익숙해지면 작게 — 앱 없이도 하게 되는 게 목표예요', [['auto', '자동'], ['full', '크게'], ['light', '작게'], ['off', '끄기']], () => S.set.fx, v => { S.set.fx = v; }));
    b.appendChild(radios('움직임', '어지러우면 «줄이기»', [['system', '폰 설정대로'], ['reduce', '줄이기'], ['full', '켜기']], () => S.set.motion, v => { S.set.motion = v; }));
    b.appendChild(h('p', { class: 'z-small', text: '지금 축하 연출: ' + ({ full: '크게', light: '작게', off: '꺼짐' })[fxLevel()] + ' · 기록한 날 ' + activeDays() + '일' }));
    sheet({ title: '설정', body: b, actions: [{ label: '시험 축하', onClick: () => { celebrate(null, { big: true, label: '이렇게 보여요' }); return false; } }, { label: '닫기', primary: true }] });
  }

  /* ---------- 백업 ---------- */
  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime || 'application/json' }); const a = h('a', { href: URL.createObjectURL(blob), download: name });
    body().appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  function exportAll() { download('좀비탈출-백업-' + dayKey() + '.json', JSON.stringify(Object.assign({ app: 'zombie-escape', exported: new Date().toISOString() }, S), null, 1)); toast('백업 파일을 저장했어요'); }
  function importAll(file) {
    return new Promise(res => {
      const fr = new FileReader();
      fr.onload = async () => {
        let cand;
        try { cand = JSON.parse(fr.result); delete cand.app; delete cand.exported; cand = normalize(cand, true); }
        catch (e) { toast('이 파일은 좀비탈출 백업이 아니거나 망가졌어요. 지금 기록은 그대로예요', 3600); res(false); return; }
        const ok = await confirmBox('백업으로 바꿀까요?', '지금 이 폰의 모든 앱 기록·하던 미션·봉인한 약속이 백업 파일 내용(기록 ' + cand.log.length + '개)으로 «바뀌어요». 지금 기록을 남기려면 먼저 «백업 파일 저장»을 하세요.', '백업으로 바꾸기');
        if (!ok) { toast('불러오기를 취소했어요'); res(false); return; }
        try { localStorage.setItem(KEY, JSON.stringify(cand)); }
        catch (e) { toast('저장 공간이 부족해 불러오지 못했어요. 지금 기록은 그대로예요', 4000); res(false); return; }
        S = cand; saveOk = true; applyMotion(); emit('change', { remote: true }); renderRecord(); toast('백업을 불러왔어요 — 기록 ' + S.log.length + '개'); res(true);
      };
      fr.onerror = () => { toast('파일을 읽지 못했어요'); res(false); };
      fr.readAsText(file);
    });
  }
  function resetAll() { const keep = S; S = blank(); if (!save(true)) { S = keep; return false; } emit('change', { remote: true }); renderRecord(); return true; }

  /* ---------- 설치(홈 화면에 놓기) ---------- */
  let bip = null;
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); bip = e; });
  window.addEventListener('appinstalled', () => { bip = null; toast('홈 화면에 놓았어요'); $$('.z-install').forEach(b => { b.hidden = true; }); });
  async function install() {
    if (bip) { try { bip.prompt(); const r = await bip.userChoice; bip = null; if (r && r.outcome === 'accepted') return; } catch (e) { } }
    const name = META.short || META.name || '좀비탈출';
    const b = h('div');
    if (isIOS()) {
      b.appendChild(h('p', { class: 'z-muted', text: '아이폰은 사파리에서 두 번만 누르면 «' + name + '» 아이콘이 홈 화면에 생겨요.' }));
      b.appendChild(h('ol', { class: 'z-steps' }, h('li', null, '아래쪽(또는 위쪽) ', h('b', { text: '공유 단추' }), ' — 네모에서 화살표가 위로 나온 모양 — 를 눌러요.'), h('li', null, '목록을 내려 ', h('b', { text: '«홈 화면에 추가»' }), ' 를 누르고, 오른쪽 위 «추가»를 눌러요.')));
      b.appendChild(h('div', { html: '<svg class="z-ios-art" viewBox="0 0 300 120" role="img" aria-label="공유 단추와 홈 화면에 추가 메뉴 그림"><rect x="1" y="1" width="298" height="118" rx="14" fill="#11151D" stroke="#36405A"/><rect x="24" y="34" width="52" height="52" rx="10" fill="none" stroke="' + esc(cssVar('--acc')) + '" stroke-width="3"/><path d="M50 26v34M38 38l12-12 12 12" fill="none" stroke="' + esc(cssVar('--acc')) + '" stroke-width="3.5"/><path d="M92 60h26M110 52l8 8-8 8" fill="none" stroke="#A6AFBF" stroke-width="3"/><rect x="132" y="38" width="150" height="44" rx="10" fill="#181D28" stroke="#36405A"/><rect x="146" y="50" width="20" height="20" rx="4" fill="none" stroke="#EEF1F6" stroke-width="2.4"/><path d="M156 54v12M150 60h12" stroke="#EEF1F6" stroke-width="2.4"/><text x="176" y="66" fill="#EEF1F6" font-size="15" font-weight="700" font-family="IBM Plex Sans KR, sans-serif">홈 화면에 추가</text></svg>' }));
      b.appendChild(h('p', { class: 'z-small', text: '크롬 등 다른 앱에서 열었다면 사파리로 열어 주세요.' }));
    } else {
      b.appendChild(h('p', { class: 'z-muted', text: '이 브라우저는 바로 설치 창을 띄우지 못했어요. 메뉴에서 직접 놓을 수 있어요.' }));
      b.appendChild(h('ol', { class: 'z-steps' }, h('li', null, '크롬 오른쪽 위 ', h('b', { text: '⋮ 메뉴' }), ' 를 눌러요.'), h('li', null, h('b', { text: '«홈 화면에 추가»' }), ' 또는 ', h('b', { text: '«앱 설치»' }), ' 를 눌러요.'), h('li', null, '아이콘 이름이 «' + name + '» 인지 보고 «추가».')));
      b.appendChild(h('p', { class: 'z-small', text: '어느 아이콘으로 열어도 기록은 이어져요(같은 폰·같은 브라우저 안에 저장).' }));
    }
    sheet({ title: '홈 화면에 «' + name + '» 놓기', body: b, actions: [{ label: '알겠어요', primary: true }] });
  }


  /* ---------- 처음 10초 안내 (한 번 보면 접힘, 설정에서 다시) ---------- */
  function coach(container, key, steps, opt) {
    S.seen = S.seen || {};
    if (!container || S.seen[key]) return null;
    const box = h('section', { class: 'z-coach z-in', 'aria-labelledby': 'zc-' + key });
    box.appendChild(h('h2', { id: 'zc-' + key, text: (opt && opt.title) || '처음이세요? 10초 사용법' }));
    const ol = h('ol', { class: 'z-steps' }); steps.forEach(s => ol.appendChild(h('li', { text: s }))); box.appendChild(ol);
    const x = h('button', { type: 'button', class: 'z-btn small ghost x', text: '알겠어요' });
    function close() { if (!box.isConnected) return; S.seen[key] = 1; save(); box.remove(); }
    x.addEventListener('click', () => { close(); });
    box.appendChild(x);
    container.prepend(box);
    return { close, el: box };
  }
  function seen(key) { S.seen = S.seen || {}; return !!S.seen[key]; }
  function markSeen(key, v) { S.seen = S.seen || {}; if (v === false) delete S.seen[key]; else S.seen[key] = 1; save(); }

  /* ---------- 시작 ---------- */
  function boot() {
    applyMotion();
    const ib = $$('.z-install'); if (isStandalone()) ib.forEach(b => { b.hidden = true; }); else ib.forEach(b => b.addEventListener('click', install));
    $$('[data-z-settings]').forEach(b => b.addEventListener('click', openSettings));
    renderRecord();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).catch(() => {});
  }

  window.Z = {
    meta: META, base: BASE, dayKey, addDays, dayLabel, timeLabel, fmt,
    store, save: saveStore, log, countOn, activeDays, streak, done, amend, on, emit,
    celebrate, confetti, popEl, sound, buzz, tone: (f, t0, d, ty, v) => { if (S.set.sound) try { tone(f, t0 || 0, d || 0.1, ty, v); } catch (e) { } }, toast, announce, reduced, fxLevel,
    h, esc, $, $$, shuffle, pick, daily, hash, uid, icon: ICON,
    sheet, confirm: confirmBox, timer, countdown, bars, week, wake,
    settings: openSettings, install, coach, seen, markSeen, isStandalone, renderRecord,
    backup: { exportAll, importAll, resetAll, download }, get state() { return JSON.parse(JSON.stringify(S)); }
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})();
