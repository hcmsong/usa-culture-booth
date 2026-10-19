// 미국 문화 퀴즈 — 화면·상태(기획서 §5)
(() => {
  'use strict';
  const C = self.QUIZ_CONFIG, D = self.QUIZ_DATA, Core = self.QuizCore;
  const Q = Object.fromEntries(D.QUESTIONS.map(q => [q.id, q]));
  const N = C.QUESTIONS_PER_ROUND;
  const NUM = ['①', '②', '③', '④'];
  const SHAPE = ['▲', '●', '■', '★'];
  const KEY = { state: 'usaQuiz.state', counters: 'usaQuiz.counters', device: 'usaQuiz.device', prev: 'usaQuiz.prev', sound: 'usaQuiz.sound' };

  // ---------- 저장(기기 안 localStorage, 개인정보 0) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가여도 진행 */ } },
  };
  const freshCounters = () => ({ starts: 0, finishes: 0, perfects: 0, hist: new Array(N + 1).fill(0) });
  let counters = Object.assign(freshCounters(), store.get(KEY.counters, {}));
  let deviceNo = store.get(KEY.device, 0);
  let soundOn = store.get(KEY.sound, C.SOUND);
  // 저장된 판 복원: 판 번호가 다르거나, 구조가 맞지 않거나, 무입력 시간보다 오래된 진행 판은 버린다(만점 화면은 유지)
  const validState = s => s && typeof s.screen === 'string' &&
    (!s.round || (Array.isArray(s.round) && s.round.length === N && s.round.every(r => Q[r.id] && Array.isArray(r.order) && r.order.length === Q[r.id].choices.length))) &&
    (!['question', 'feedback'].includes(s.screen) || (s.round && Number.isInteger(s.idx) && s.idx >= 0 && s.idx < N && Array.isArray(s.answers)));
  let state = store.get(KEY.state, null);
  let discarded = false;
  if (!validState(state)) { state = { screen: 'start' }; discarded = true; }
  else if (state.screen !== 'perfect' && state.screen !== 'start') {
    const limit = state.screen === 'grade' ? C.GRADE_IDLE_MS : C.IDLE_RESET_MS;
    if (state.ver !== C.VERSION || !state.savedAt || Date.now() - state.savedAt > limit) { state = { screen: 'start' }; discarded = true; }
  }
  const saveState = () => { state.ver = C.VERSION; state.savedAt = Date.now(); store.set(KEY.state, state); };
  if (discarded) saveState();
  const saveCounters = () => store.set(KEY.counters, counters);

  // ---------- 공통 ----------
  const app = document.getElementById('app');
  const overlay = document.getElementById('overlay');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => performance.now();
  let guardUntil = 0;
  let lastInput = Date.now();
  let timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const every = (fn, ms) => { const t = setInterval(fn, ms); timers.push(t); return t; };
  const clearTimers = () => { timers.forEach(t => { clearTimeout(t); clearInterval(t); }); timers = []; };
  const choiceText = s => (C.SHOW_HANGUL_SOUND ? s : s.replace(/\s*\([^)]*\)\s*$/, ''));
  const factText = s => (C.SHOW_HANGUL_SOUND ? s : s.replace(/([A-Za-z])\([가-힣]+\)/g, '$1'));
  // «George Washington (조지 워싱턴)» → 영어는 크게, 괄호 속 한글은 아랫줄 작게
  const choiceHtml = s => {
    const m = String(s).match(/^(.*\S)\s+\(([^)]*)\)$/);
    if (!m || !C.SHOW_HANGUL_SOUND) return `<span>${esc(choiceText(s))}</span>`;
    return `<span class="ct">${esc(m[1])}<small>${esc(m[2])}</small></span>`;
  };
  const isStandalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

  // 입력 막기: 확대·길게 누르기 메뉴·끌어서 새로 고침
  ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', e => { if (e.touches.length > 1 || !e.target.closest('.panel')) e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerdown', () => { lastInput = Date.now(); unlockAudio(); if (!wakeLock || wakeLock.released) keepAwake(); }, true);
  document.addEventListener('click', () => { if (!wakeLock || wakeLock.released) keepAwake(); }, true);

  // ---------- 화면 켜짐 유지(지원하는 버전에서만) ----------
  let wakeLock = null;
  async function keepAwake() {
    try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* 무시 */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    keepAwake();
    if (overlay.hidden) render();
  });

  // ---------- 효과음(파일 없이 Web Audio로 생성) ----------
  let actx = null;
  function unlockAudio() {
    try {
      if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = new AC(); }
      if (actx.state !== 'running') actx.resume();
      const b = actx.createBuffer(1, 1, 22050), s = actx.createBufferSource();
      s.buffer = b; s.connect(actx.destination); s.start(0);
    } catch (e) { /* 소리는 보조 */ }
  }
  function tone(t0, f, start, dur, type) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + start);
    g.gain.exponentialRampToValueAtTime(C.SOUND_VOLUME, t0 + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(t0 + start); o.stop(t0 + start + dur + 0.05);
  }
  function sfx(kind) {
    if (!soundOn || !actx) return;
    try {
      if (actx.state !== 'running') actx.resume();
      const t0 = actx.currentTime + 0.01;
      if (kind === 'ok') { tone(t0, 784, 0, 0.16); tone(t0, 1047, 0.13, 0.28); }
      else if (kind === 'ng') { tone(t0, 330, 0, 0.22, 'triangle'); tone(t0, 247, 0.18, 0.32, 'triangle'); }
      else if (kind === 'win') { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(t0, f, i * 0.12, 0.3)); }
    } catch (e) { /* 무시 */ }
  }

  // ---------- 읽어 주기(설정 TTS=true일 때만) ----------
  function speak(text) {
    try {
      if (!('speechSynthesis' in window)) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR'; u.rate = 0.9;
      const v = speechSynthesis.getVoices().find(x => /ko/i.test(x.lang));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) { /* 무시 */ }
  }

  // ---------- 오프라인 준비 상태 ----------
  let offline = { ready: false, checked: false };
  async function checkOffline() {
    let ok = false;
    try {
      const name = 'usa-booth-' + C.VERSION;
      if ('caches' in window && navigator.serviceWorker && navigator.serviceWorker.controller && await caches.has(name)) {
        const cache = await caches.open(name);
        const hits = await Promise.all(C.ASSETS.map(a => cache.match(a)));
        ok = hits.every(Boolean);
      }
    } catch (e) { ok = false; }
    offline = { ready: ok, checked: true };
    const el = document.querySelector('.status');
    if (el) el.textContent = statusText();
  }
  const statusText = () => `${C.VERSION} · ${isStandalone() ? '웹 앱' : 'Safari'} · 오프라인 준비 ${offline.ready ? '✓' : offline.checked ? '✗' : '…'}`;
  // 새 판이 설치되면(이미 옛 판으로 돌던 경우만) 시작·학년 화면에서 바로 새로 불러온다. 문제를 푸는 중이면 다음 시작 화면에서.
  let reloadPending = false;
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.update().catch(() => {});
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) {
        if (state.screen === 'start' || state.screen === 'grade') { location.reload(); return; }
        reloadPending = true;
      }
      setTimeout(checkOffline, 300);
    });
  }

  // ---------- 길게 누르기 ----------
  function holdable(el, ms, onDone, showFrom) {
    let t0 = 0, raf = 0, active = false;
    const target = el.querySelector('[data-progress]') || el;
    const set = p => target.style.setProperty('--p', p);
    const tick = () => {
      if (!active || !el.isConnected) { active = false; return; }
      const t = now() - t0;
      const from = showFrom || 0;
      set(Math.max(0, Math.min(1, (t - from) / (ms - from))));
      if (t >= ms) { active = false; set(0); onDone(); } else raf = requestAnimationFrame(tick);
    };
    el.addEventListener('pointerdown', e => { e.preventDefault(); active = true; t0 = now(); raf = requestAnimationFrame(tick); });
    const stop = () => { active = false; cancelAnimationFrame(raf); set(0); };
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, stop));
  }

  function tap(el, fn) {
    el.addEventListener('click', e => {
      if (now() < guardUntil) return;
      fn(e);
    });
  }

  // ---------- 화면 공통 틀 ----------
  function frame(cls, inner) {
    return `<section class="screen ${cls}"><div class="stripe"></div>${inner}
      <div class="badge" id="badge"><span class="ring" data-progress></span>${deviceNo ? esc(deviceNo) : '?'}</div></section>`;
  }
  function bindBadge() {
    const b = document.getElementById('badge');
    if (b) holdable(b, C.STAFF_HOLD_MS, openPin, 1000);
  }

  // ---------- 흐름 ----------
  function go(screen, extra) {
    state = Object.assign({}, state, extra || {}, { screen });
    saveState();
    render();
  }
  function goStart() {
    state = { screen: 'start' };
    saveState();
    if (reloadPending) { location.reload(); return; }
    render();
  }
  function beginRound(band) {
    const prevAll = store.get(KEY.prev, {});
    const { round } = Core.buildRound(band, prevAll[band] || null, Math.random, C, D);
    prevAll[band] = round.map(r => r.id);
    store.set(KEY.prev, prevAll);
    counters.starts++;
    saveCounters();
    state = { screen: 'question', band, round, idx: 0, answers: [], score: 0, roundNo: counters.starts };
    saveState();
    render();
  }
  function answer(k) {
    if (state.screen !== 'question') return;
    const item = state.round[state.idx];
    const pick = item.order[k];
    const correct = pick === Q[item.id].answer;
    state.answers = state.answers.concat([{ id: item.id, pick, correct }]);
    if (correct) state.score++;
    sfx(correct ? 'ok' : 'ng');
    go('feedback');
  }
  function next() {
    if (state.screen !== 'feedback') return;
    if (state.idx + 1 < N) { go('question', { idx: state.idx + 1 }); return; }
    counters.finishes++;
    counters.hist[state.score] = (counters.hist[state.score] || 0) + 1;
    const perfect = state.score === N;
    if (perfect) counters.perfects++;
    saveCounters();
    if (perfect) sfx('win');
    go(perfect ? 'perfect' : 'result', { finishedAt: Date.now() });
  }

  // ---------- 그리기 ----------
  function render() {
    clearTimers();
    guardUntil = now() + C.INPUT_GUARD_MS;
    const fn = { start: viewStart, grade: viewGrade, question: viewQuestion, feedback: viewFeedback, perfect: viewPerfect, result: viewResult }[state.screen] || viewStart;
    try { fn(); } catch (e) {
      clearTimers();
      state = { screen: 'start' }; saveState();
      viewStart();
    }
    bindBadge();
  }

  function viewStart() {
    app.innerHTML = frame('start', `
      <div class="flag">🇺🇸</div>
      <h1 class="title">${esc(C.TITLE)}</h1>
      <p class="lead">${C.START_LEAD}</p>
      <button class="btn-start" id="go">시작하기 ▶</button>
      <div class="status">${esc(statusText())}</div>`);
    tap(document.getElementById('go'), () => {
      unlockAudio(); keepAwake();
      if (C.GRADE_MODE === 'choose') go('grade'); else beginRound('low');
    });
    checkOffline();
    let n = 0;
    every(() => { if (++n <= 20 && !offline.ready) checkOffline(); }, 3000);
  }

  function viewGrade() {
    app.innerHTML = frame('grade', `
      <h2 class="ask">몇 학년이에요?</h2>
      <div class="grades">
        <button class="btn-grade" data-band="low"><span class="em">🐣</span>1·2·3학년<small>동생도 여기!</small></button>
        <button class="btn-grade" data-band="high"><span class="em">🦅</span>4·5·6학년</button>
      </div>`);
    app.querySelectorAll('.btn-grade').forEach(b => tap(b, () => beginRound(b.dataset.band)));
  }

  function dotsHtml(i) {
    let h = '';
    for (let k = 0; k < N; k++) h += `<i class="${k < i ? 'done' : k === i ? 'now' : ''}"></i>`;
    return h;
  }

  function viewQuestion() {
    const item = state.round[state.idx];
    const q = Q[item.id];
    const n = item.order.length;
    const btns = item.order.map((orig, k) => `
      <button class="btn-choice" data-k="${k}"><span class="mark s${k}"><b>${NUM[k]}</b><i>${SHAPE[k]}</i></span>${choiceHtml(q.choices[orig])}</button>`).join('');
    app.innerHTML = frame('q', `
      <div class="progress"><div class="num">${state.idx + 1} / ${N}</div><div class="dots">${dotsHtml(state.idx)}</div></div>
      <div class="q-main"><div class="q-emoji">${q.eq}</div>
      <p class="q-text">${esc(q.q)}</p></div>
      <div class="choices n${n}">${btns}</div>
      ${C.TTS ? '<button class="tts" id="tts" aria-label="읽어 주기">🔊</button>' : ''}`);
    app.querySelectorAll('.btn-choice').forEach(b => {
      const k = Number(b.dataset.k);
      // 손가락을 조금 끌어도 버튼 안에서 떼면 확정(아이 터치). click은 마우스·보조 경로.
      b.addEventListener('pointerup', e => {
        if (now() < guardUntil) return;
        const r = b.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) answer(k);
      });
      tap(b, () => answer(k));
    });
    if (C.TTS) tap(document.getElementById('tts'), () => speak(q.q + ' ' + item.order.map((o, k) => `${k + 1}번, ${choiceText(q.choices[o])}`).join('. ')));
  }

  function viewFeedback() {
    const item = state.round[state.idx];
    const q = Q[item.id];
    const last = state.answers[state.answers.length - 1];
    const ok = last && last.correct;
    const slot = item.order.indexOf(q.answer);
    const answerLine = !ok && C.SHOW_ANSWER_ON_WRONG
      ? `<p class="fb-answer">정답은 ${NUM[slot]} ${choiceHtml(q.choices[q.answer])}</p>` : '';
    app.innerHTML = frame('fb', `
      <div class="fb-band ${ok ? 'ok' : 'ng'}">
        <div class="fb-mark">${ok ? '⭕' : '❌'}</div>
        <p class="fb-word">${ok ? '정답!' : '아쉬워요!'}</p>
      </div>
      <div class="fb-body">
        ${answerLine}
        <div class="fb-ea">${ok || C.SHOW_ANSWER_ON_WRONG ? q.ea : ''}</div>
        ${ok || C.SHOW_ANSWER_ON_WRONG ? `<p class="fb-fact">${esc(factText(q.fact))}</p>` : ''}
      </div>
      <p class="fb-next">${state.idx + 1 < N ? '화면을 누르면 다음 문제' : '화면을 누르면 결과 보기'}</p>
      <div class="timebar"><i style="animation-duration:${C.FEEDBACK_MS}ms"></i></div>`);
    const shown = now();
    later(next, C.FEEDBACK_MS);
    app.querySelector('.screen').addEventListener('click', e => {
      if (e.target.closest('#badge')) return;
      if (now() - shown >= C.TAP_ADVANCE_AFTER_MS) next();
    });
  }

  function confettiHtml() {
    const icons = ['⭐', '🇺🇸', '🎉', '✨', '🌟'];
    let h = '';
    for (let i = 0; i < 26; i++) {
      h += `<span style="left:${(i * 37) % 100}%;animation-delay:${(i % 9) * 0.18}s">${icons[i % icons.length]}</span>`;
    }
    return `<div class="confetti">${h}</div>`;
  }
  const clockText = () => new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  function viewPerfect() {
    app.innerHTML = frame('perfect', `
      ${confettiHtml()}
      <h1 class="big-win">10문제 모두 정답! 🎉</h1>
      <p class="win-sub">${esc(C.WIN_SUB)}</p>
      <p class="win-tell">선생님께 이 화면을 보여 주세요</p>
      ${C.WIN_NOTE ? `<p class="win-note">${esc(C.WIN_NOTE)}</p>` : ''}
      <div class="proof">
        <div class="dev">${deviceNo ? esc(deviceNo) + '번' : '?번'}</div>
        <div class="meta">회차 #${String(state.roundNo || 0).padStart(3, '0')}<div class="clock" id="clock">${clockText()}</div></div>
      </div>
      <button class="staff-ok" id="staffok"><span class="fill" data-progress></span><span>직원 확인</span></button>`);
    every(() => { const c = document.getElementById('clock'); if (c) c.textContent = clockText(); }, 1000);
    const confetti = app.querySelector('.confetti');
    later(() => { if (confetti) confetti.remove(); }, 4500);
    holdable(document.getElementById('staffok'), C.PERFECT_RELEASE_HOLD_MS, goStart, 500);
  }

  function viewResult() {
    const s = state.score;
    const cheer = s >= N - 2 ? '정말 잘했어요! 거의 다 맞혔어요!' : s >= Math.ceil(N / 2) ? '잘했어요! 미국 박사에 한 걸음 더!' : '도전해 줘서 고마워요!';
    const notes = [C.PARTICIPATION_MESSAGE, C.RETRY_MESSAGE].filter(Boolean).map(t => `<p class="note">${esc(t)}</p>`).join('');
    app.innerHTML = frame('result', `
      <p class="score">${N}문제 중 <b>${s}개</b> 정답!</p>
      <div class="stars" aria-label="${s}개 정답">${'⭐'.repeat(s)}<span class="off">${'☆'.repeat(N - s)}</span></div>
      <p class="cheer">${cheer}</p>
      ${notes}
      <button class="btn-home" id="home" disabled>처음으로</button>`);
    const home = document.getElementById('home');
    later(() => { home.disabled = false; }, C.RESULT_BUTTON_AFTER_MS);
    tap(home, () => { if (!home.disabled) goStart(); });
    later(goStart, C.RESULT_AUTO_MS);
  }

  // ---------- 무입력 처음으로 ----------
  setInterval(() => {
    if (!overlay.hidden) return;
    const idle = Date.now() - lastInput;
    if (state.screen === 'grade' && idle > C.GRADE_IDLE_MS) goStart();
    else if ((state.screen === 'question' || state.screen === 'feedback') && idle > C.IDLE_RESET_MS) goStart();
  }, 1000);

  // ---------- 직원 메뉴 ----------
  let menuTimer = 0;
  // 직원 창을 여는 동안 아래 화면 타이머를 멈추고, 닫으면 지금 화면을 다시 그린다(정답 화면 4초·결과 12초는 처음부터)
  function closeOverlay() {
    if (overlay.hidden) return;
    overlay.hidden = true; overlay.innerHTML = ''; clearTimeout(menuTimer);
    lastInput = Date.now();
    render();
  }
  function armMenuIdle() { clearTimeout(menuTimer); menuTimer = setTimeout(closeOverlay, C.STAFF_MENU_IDLE_MS); }
  overlay.addEventListener('pointerdown', armMenuIdle);

  function openPin() {
    let typed = '';
    let shakeTimer = 0;
    clearTimers();
    overlay.hidden = false;
    overlay.innerHTML = `<div class="panel"><h2>직원 PIN</h2><div class="pin-dots" id="pd">&nbsp;</div>
      <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<button data-d="${d}">${d}</button>`).join('')}
      <button data-d="x">취소</button><button data-d="0">0</button><button data-d="b">지움</button></div></div>`;
    armMenuIdle();
    const pd = document.getElementById('pd');
    const show = () => { pd.textContent = typed ? '●'.repeat(typed.length) : ' '; };
    overlay.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => {
      const d = b.dataset.d;
      if (d === 'x') return closeOverlay();
      if (d === 'b') { typed = typed.slice(0, -1); return show(); }
      typed += d; show();
      if (typed.length >= C.STAFF_PIN.length) {
        if (typed === C.STAFF_PIN) openMenu();
        else {
          typed = ''; show();
          pd.classList.add('shake');
          clearTimeout(shakeTimer);
          shakeTimer = setTimeout(() => pd.classList.remove('shake'), 400);
        }
      }
    }));
  }

  function openMenu() {
    let armed = false;
    const draw = () => {
      const h = counters.hist.map((c, i) => `${i}점 ${c}`).join(' · ');
      overlay.innerHTML = `<div class="panel">
        <h2>직원 메뉴 — ${deviceNo ? deviceNo + '번 기기' : '기기 번호 없음'}</h2>
        <div class="stats">시작 ${counters.starts} · 완주 ${counters.finishes} · 만점 ${counters.perfects}<small>점수 분포: ${h}</small>
          <small>${esc(statusText())}</small></div>
        <div class="row"><button id="m-home">지금 판 처음으로</button><button id="m-sound" class="${soundOn ? 'on' : ''}">소리 ${soundOn ? '켜짐' : '꺼짐'}</button></div>
        <div class="label">기기 번호</div>
        <div class="row">${[1, 2, 3, 4, 5].map(n => `<button data-dev="${n}" class="${deviceNo === n ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="row"><button id="m-reset" class="warn ${armed ? 'armed' : ''}">${armed ? '한 번 더 누르면 0으로' : '카운터 0으로'}</button><button id="m-close">닫기</button></div>
      </div>`;
      document.getElementById('m-home').onclick = () => { state = { screen: 'start' }; saveState(); closeOverlay(); };
      document.getElementById('m-sound').onclick = () => { armed = false; soundOn = !soundOn; store.set(KEY.sound, soundOn); draw(); };
      document.getElementById('m-close').onclick = closeOverlay;
      document.getElementById('m-reset').onclick = () => {
        if (!armed) { armed = true; draw(); return; }
        counters = freshCounters(); saveCounters(); store.set(KEY.prev, {}); armed = false;
        if (state.screen !== 'perfect') { state = { screen: 'start' }; saveState(); }
        draw();
      };
      overlay.querySelectorAll('[data-dev]').forEach(b => b.onclick = () => {
        armed = false; deviceNo = Number(b.dataset.dev); store.set(KEY.device, deviceNo); draw();
      });
    };
    draw();
    armMenuIdle();
  }

  render();
})();
