// 헤드리스 Chrome(CDP) e2e 시험 — v3 주제 선택형 퀴즈 앱
// 사용: node tools/e2e.mjs <URL> <online|offline> [profileDir]
// 환경변수: CHROME_EXTRA (Chrome 추가 인수)
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL0 = process.argv[2] || 'http://localhost:8765/';
const PHASE = process.argv[3] || 'online';
const PROFILE = process.argv[4] || mkdtempSync(path.join(os.tmpdir(), 'quiz-e2e-'));
const PORT = 9334;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=1180,820',
  '--disable-web-security', '--disable-features=TranslateUI',
  ...(process.env.CHROME_EXTRA ? process.env.CHROME_EXTRA.split(' ') : []),
  'about:blank',
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
}
const log = (...a) => console.log(...a);
let testsFailed = 0;
function assert(cond, msg) {
  if (!cond) { testsFailed++; log('✗ FAIL:', msg); }
  else { log('  ✓', msg); }
}

try {
  // Chrome 연결 대기
  let tgt;
  for (let t = 0; t < 40; t++) {
    try { tgt = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(x => x.type === 'page'); if (tgt) break; } catch { }
    await sleep(250);
  }
  if (!tgt) throw new Error('Chrome 연결 실패');
  ws = new WebSocket(tgt.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', m => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
  });
  await send('Page.enable'); await send('Runtime.enable');

  const nav = async () => { await send('Page.navigate', { url: URL0 }); await sleep(2500); };
  const screen = () => ev(`JSON.parse(localStorage.getItem('usaQuiz.state')||'{}').screen || 'start'`);
  const statusEl = () => ev(`document.querySelector('.status')?.textContent || ''`);
  const topicBtnVisible = key => ev(`!!document.querySelector('.btn-topic[data-key="${key}"]')`);
  const bigWin = () => ev(`document.querySelector('.big-win')?.textContent || ''`);

  // ── 온라인 1차 로드 ─────────────────────────────────────────────────────────
  await nav();
  if (PHASE === 'offline') {
    // 오프라인 모드: 상태 비우고 다시 열기
    log('[O] 오프라인 모드: 상태 비우고 재탐색');
    await ev(`localStorage.removeItem('usaQuiz.state')`);
    await nav();
    log('    상태 비우고 다시 열기:', await statusEl());
    const fetchResult = await ev(`fetch('/__none__?'+Date.now()).then(r => r.status).catch(e => 'fetch 실패(오프라인)')`);
    log('    서버 응답 없음 확인:', fetchResult);
    assert(String(fetchResult).includes('실패') || fetchResult === 0, '오프라인에서 fetch 실패');
  }

  log('[1] 첫 화면 상태 줄:', await statusEl());

  // SW 등록 확인
  const swRegs = await ev(`navigator.serviceWorker.getRegistrations().then(r => r.map(x => x.scope + (x.active ? ' active' : '')))`);
  log('    SW 등록:', swRegs);
  assert(Array.isArray(swRegs) && swRegs.length > 0, 'SW 등록됨');

  // 캐시 목록 (온라인에서 첫 로드 후 잠시 기다림)
  if (PHASE === 'online') {
    await sleep(3000);
    const cacheKeys = await ev(`caches.open('usa-booth-' + QUIZ_CONFIG.VERSION).then(c => c.keys()).then(k => k.map(r => new URL(r.url).pathname).join(' ')).catch(() => '(캐시 없음)')`);
    log('[2] 캐시 항목:', cacheKeys);
    assert(typeof cacheKeys === 'string' && cacheKeys.includes('usa.js'), 'usa.js 캐시됨');
  }

  // 첫 화면 상태 줄 오프라인 준비 확인 (2차 nav 후 확인)
  await nav();
  await sleep(3000);
  const status2 = await statusEl();
  log('[3] 재탐색 후 상태 줄:', status2);
  if (PHASE === 'offline') {
    assert(status2.includes('✓'), '오프라인 준비 ✓');
  }

  // 활성 주제 목록 파악
  const activeTopics = await ev(`
    Object.entries(self.QUIZ_TOPICS || {})
      .filter(([k, v]) => v.QUESTIONS && v.QUESTIONS.length > 0 && !v.placeholder)
      .map(([k, v]) => ({ key: k, name: v.name, emoji: v.emoji }))
  `);
  log('[4] 활성 주제:', activeTopics.map(t => t.emoji + t.name).join(', '));
  assert(activeTopics.length >= 1, '활성 주제 1개 이상');

  // 각 활성 주제: 선택 → 저학년 → 10문제 정답 → 만점 화면 → 직원 확인 → 처음
  for (const T of activeTopics) {
    log(`\n[5:${T.key}] 주제 '${T.name}' 만점 경로`);

    // 처음 화면으로
    await ev(`(() => { const s = JSON.parse(localStorage.getItem('usaQuiz.state') || '{}'); if (s.screen !== 'start') { localStorage.setItem('usaQuiz.state', JSON.stringify({screen:'start'})); } })()`);
    await nav(); await sleep(600);

    const btnVisible = await topicBtnVisible(T.key);
    assert(btnVisible, `${T.key} 버튼 표시됨`);

    // 주제 선택
    await ev(`document.querySelector('.btn-topic[data-key="${T.key}"]').click()`);
    await sleep(700);
    assert(await screen() === 'grade', `${T.key}: grade 화면`);

    // 학년 선택(저학년)
    await ev(`document.querySelector('.btn-grade[data-band="low"]').click()`);
    await sleep(700);
    assert(await screen() === 'question', `${T.key}: question 화면`);

    // 10문제 정답
    for (let i = 0; i < 10; i++) {
      const k = await ev(`(() => {
        const s = JSON.parse(localStorage.getItem('usaQuiz.state'));
        const topicKey = s.topic;
        const it = s.round[s.idx];
        const q = self.QUIZ_TOPICS[topicKey].QUESTIONS.find(x => x.id === it.id);
        return it.order.indexOf(q.answer);
      })()`);
      await ev(`(() => {
        const b = document.querySelector('.btn-choice[data-k="${k}"]');
        const r = b.getBoundingClientRect();
        b.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, clientX: r.left + 20, clientY: r.top + 20, pointerType: 'touch'}));
        b.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, clientX: r.left + 45, clientY: r.top + 30, pointerType: 'touch'}));
      })()`);
      await sleep(650);
      const fb = await ev(`document.querySelector('.fb-word')?.textContent || 'none'`);
      assert(fb === '정답!', `${T.key} 문제 ${i + 1} 정답`);
      await ev(`document.querySelector('.screen').click()`);
      await sleep(650);
    }

    // 만점 화면
    assert(await screen() === 'perfect', `${T.key}: perfect 화면`);
    const winTitle = await bigWin();
    log(`    만점 화면 제목: ${winTitle}`);
    assert(winTitle.includes(T.name), `만점 화면에 주제 이름 '${T.name}' 포함`);
    assert(winTitle.includes('10문제 모두 정답'), '만점 화면 문구 정확');

    // 직원 확인 2초 → 처음으로
    await ev(`(() => { const b = document.getElementById('staffok'); b.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true})); })()`);
    await sleep(2400);
    assert(await screen() === 'start', `${T.key}: 직원 확인 후 처음으로`);
  }

  // ── 오답 경로 (첫 활성 주제로) ────────────────────────────────────────────
  if (activeTopics.length > 0) {
    const T = activeTopics[0];
    log(`\n[6] 오답 경로 (${T.name})`);
    await nav(); await sleep(600);
    await ev(`document.querySelector('.btn-topic[data-key="${T.key}"]').click()`);
    await sleep(700);
    await ev(`document.querySelector('.btn-grade[data-band="high"]').click()`);
    await sleep(700);

    // 첫 문제 오답
    const k0 = await ev(`(() => {
      const s = JSON.parse(localStorage.getItem('usaQuiz.state'));
      const it = s.round[s.idx];
      const q = self.QUIZ_TOPICS[s.topic].QUESTIONS.find(x => x.id === it.id);
      return (it.order.indexOf(q.answer) + 1) % it.order.length;
    })()`);
    await ev(`document.querySelector('.btn-choice[data-k="${k0}"]').click()`);
    await sleep(650);
    const fbWord = await ev(`document.querySelector('.fb-word')?.textContent`);
    const fbAnswer = await ev(`document.querySelector('.fb-answer')?.textContent || ''`);
    log('    오답 피드백:', fbWord, '/', fbAnswer.slice(0, 30));
    assert(fbWord === '아쉬워요!', '오답 피드백 표시');
    assert(fbAnswer.includes('정답은'), '오답 후 정답 공개');

    // 직원 PIN 창이 열린 동안 타이머 정지 확인
    await ev(`document.getElementById('badge').dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}))`);
    await sleep(3300);
    const pinOpen = await ev(`!document.getElementById('overlay').hidden`);
    const screenAfterBadge = await screen();
    log('    배지 3초 → PIN 창:', pinOpen, '| 화면:', screenAfterBadge);
    assert(pinOpen, 'PIN 창 열림');
    assert(screenAfterBadge === 'feedback', 'PIN 창 동안 feedback 화면 유지(타이머 정지)');

    // 틀린 PIN 입력 → 즉시 비움
    await ev(`(() => { for (const d of ['1','2','3']) document.querySelector('#overlay [data-d="'+d+'"]').click(); document.querySelector('#overlay [data-d="4"]').click(); })()`);
    await sleep(200);
    const pdText = await ev(`document.getElementById('pd')?.textContent?.trim() || ''`);
    log('    틀린 PIN → 입력 비움:', JSON.stringify(pdText));
    assert(pdText === '' || pdText === ' ', '틀린 PIN 후 입력 비움');

    // 맞는 PIN → 메뉴
    await ev(`(() => { for (const d of QUIZ_CONFIG.STAFF_PIN) document.querySelector('#overlay [data-d="'+d+'"]').click(); })()`);
    await sleep(300);
    const menuTitle = await ev(`document.querySelector('.panel h2')?.textContent || ''`);
    log('    맞는 PIN → 메뉴:', menuTitle);
    assert(menuTitle.includes('직원 메뉴'), '직원 메뉴 열림');

    // 닫기 → feedback 화면 복원
    await ev(`document.getElementById('m-close').click()`);
    await sleep(400);
    const screenAfterClose = await screen();
    const fbVisible = await ev(`!!document.querySelector('.fb-word')`);
    log('    닫기 → 화면:', screenAfterClose, '피드백 요소:', fbVisible);
    assert(screenAfterClose === 'feedback', '메뉴 닫기 후 feedback 화면');
    assert(fbVisible, '피드백 요소 표시');

    // 4초 자동 넘김
    await sleep(4400);
    const screenAfterAuto = await screen();
    log('    4초 자동 →', screenAfterAuto);
    assert(screenAfterAuto === 'question', '4초 후 다음 문제');

    // 나머지 9문제 (오답으로 채워 result 화면)
    for (let i = 1; i < 10; i++) {
      await ev(`document.querySelector('.btn-choice[data-k="0"]').click()`);
      await sleep(650);
      await ev(`document.querySelector('.screen').click()`);
      await sleep(650);
    }
    assert(await screen() === 'result', '결과 화면');
    const scoreText = await ev(`document.querySelector('.score')?.textContent || ''`);
    log('    결과 화면:', scoreText);

    // 12초 자동 처음으로
    await sleep(12500);
    assert(await screen() === 'start', '12초 후 처음으로');
  }

  // ── 오래된 진행 판 폐기 ─────────────────────────────────────────────────────
  log('\n[7] 오래된 진행 판 폐기');
  if (activeTopics.length > 0) {
    const T = activeTopics[0];
    const D_js = `self.QUIZ_TOPICS['${T.key}']`;
    await ev(`(() => {
      const D = ${D_js};
      const round = QuizCore.buildRound('low', null, Math.random, QUIZ_CONFIG, D).round;
      const s = {screen:'question', topic:'${T.key}', band:'low', round, idx:3, answers:[{},{},{}], score:3,
        roundNo:9, ver:QUIZ_CONFIG.VERSION, savedAt:Date.now()-10*60*1000};
      localStorage.setItem('usaQuiz.state', JSON.stringify(s));
    })()`);
    await nav();
    const s7 = await screen();
    log('    10분 전 진행 판 →', s7);
    assert(s7 === 'start', '10분 전 진행 판 → 처음으로');

    await ev(`(() => {
      const D = ${D_js};
      const round = QuizCore.buildRound('low', null, Math.random, QUIZ_CONFIG, D).round;
      const s = {screen:'question', topic:'${T.key}', band:'low', round, idx:3, answers:[{},{},{}], score:3,
        roundNo:9, ver:QUIZ_CONFIG.VERSION, savedAt:Date.now()};
      localStorage.setItem('usaQuiz.state', JSON.stringify(s));
    })()`);
    await nav();
    const s7b = await screen();
    log('    방금 진행 판 →', s7b);
    assert(s7b === 'question', '방금 진행 판 → 이어서');

    await ev(`(() => {
      const s = JSON.parse(localStorage.getItem('usaQuiz.state'));
      s.ver = 'v0'; s.savedAt = Date.now();
      localStorage.setItem('usaQuiz.state', JSON.stringify(s));
    })()`);
    await nav();
    const s7c = await screen();
    log('    옛 판 번호 →', s7c);
    assert(s7c === 'start', '옛 판 번호 진행 판 → 처음으로');
  }

  log('\n────────────────────────────────────');
  log(testsFailed === 0 ? `모두 통과 (PHASE=${PHASE})` : `실패 ${testsFailed}건 (PHASE=${PHASE})`);

} catch (e) {
  log('오류:', e.message);
  testsFailed++;
} finally {
  try { ws && ws.close(); } catch { }
  chrome.kill('SIGTERM');
  process.exit(testsFailed > 0 ? 1 : 0);
}
