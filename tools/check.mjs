// 데이터·출제 규칙 검사: node tools/check.mjs  (app 폴더에서)
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { console };
ctx.self = ctx;
vm.createContext(ctx);

// config.js 먼저 로드 → TOPIC_ORDER 파악
vm.runInContext(readFileSync(path.join(APP, 'config.js'), 'utf8'), ctx, { filename: 'config.js' });
const C = ctx.QUIZ_CONFIG;
vm.runInContext(readFileSync(path.join(APP, 'core.js'), 'utf8'), ctx, { filename: 'core.js' });
for (const key of C.TOPIC_ORDER) {
  vm.runInContext(readFileSync(path.join(APP, 'topics', key + '.js'), 'utf8'), ctx, { filename: 'topics/' + key + '.js' });
}
const TOPICS = ctx.QUIZ_TOPICS, Core = ctx.QuizCore;

let fail = 0;
const ok = (cond, msg) => { if (!cond) { fail++; console.log('✗ ' + msg); } };

// ── 1) 문항 데이터 (주제별) ──────────────────────────────────────────────────
const allIds = [];
for (const key of C.TOPIC_ORDER) {
  const D = TOPICS[key];
  ok(!!D, `주제 ${key} 로드됨`);
  if (!D) continue;

  if (D.placeholder) {
    console.log(`· ${key}(${D.name}): 건너뜀 (placeholder)`);
    continue;
  }

  const M = Object.fromEntries(D.QUESTIONS.map(q => [q.id, q]));
  const expectedCount = key === 'usa' ? 38 : 30;
  ok(D.QUESTIONS.length === expectedCount, `${key}: 문항 수 ${expectedCount} (실제 ${D.QUESTIONS.length})`);
  ok(new Set(D.QUESTIONS.map(q => q.id)).size === D.QUESTIONS.length, `${key}: id 중복 없음`);

  for (const q of D.QUESTIONS) {
    ok(D.CATS.includes(q.cat), `${key}/${q.id} 범주`);
    ok(['하', '중', '상'].includes(q.diff), `${key}/${q.id} 난도`);
    ok(['저', '고', '공통'].includes(q.band), `${key}/${q.id} 학년대`);
    ok(q.band === '고' ? q.choices.length === 4 : q.band === '저' ? q.choices.length === 3 : [3, 4].includes(q.choices.length), `${key}/${q.id} 보기 수`);
    ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length, `${key}/${q.id} 정답 위치`);
    ok(new Set(q.choices).size === q.choices.length, `${key}/${q.id} 보기 중복 없음`);
    ok(q.q.length <= 46, `${key}/${q.id} 문제 길이 ${q.q.length} ≤ 46`);
    ok(q.choices.every(c => { const m = c.match(/^(.*\S)\s+\(([^)]*)\)$/); return m ? m[1].length <= 18 && m[2].length <= 12 : c.length <= 18; }), `${key}/${q.id} 보기 길이`);
    ok(q.fact.length <= 40, `${key}/${q.id} 재미 사실 길이 ${q.fact.length} ≤ 40`);
    ok(q.eq && q.ea, `${key}/${q.id} 이모지`);
    allIds.push(q.id);
  }

  // 새 주제(usa 아닌 비-placeholder) 분포 검사
  if (key !== 'usa') {
    for (const cat of D.CATS) {
      const catQ = D.QUESTIONS.filter(q => q.cat === cat);
      ok(catQ.length === 5, `${key}/${cat}: 문항 수 5 (실제 ${catQ.length})`);
      const common = catQ.filter(q => q.band === '공통');
      ok(common.length === 3, `${key}/${cat}: 공통 3 (실제 ${common.length})`);
      ok(common.filter(q => q.diff === '하').length === 2, `${key}/${cat}: 공통·하 2`);
      ok(common.filter(q => q.diff === '중').length === 1, `${key}/${cat}: 공통·중 1`);
      const low = catQ.filter(q => q.band === '저');
      ok(low.length === 1 && low[0].diff === '하', `${key}/${cat}: 저·하 1`);
      const high = catQ.filter(q => q.band === '고');
      ok(high.length === 1 && high[0].diff === '중', `${key}/${cat}: 고·중 1`);
    }
  }
}

// 전체 id 유일성
ok(new Set(allIds).size === allIds.length, `전체 id 중복 없음 (총 ${allIds.length}개)`);

// ── 2) 문제 묶음·기본 세트 ────────────────────────────────────────────────────
for (const key of C.TOPIC_ORDER) {
  const D = TOPICS[key];
  if (!D || D.placeholder) continue;
  const M = Object.fromEntries(D.QUESTIONS.map(q => [q.id, q]));

  if (key === 'usa') {
    ok(D.POOLS.low.length === 27, `${key}: 저학년 묶음 27 (실제 ${D.POOLS.low.length})`);
    const H = D.POOLS.high, reduced = ['Q04', 'Q17', 'Q23'];
    ok(H.length === 31 || (H.length === 28 && reduced.every(id => !H.includes(id))), `${key}: 고학년 묶음 31 또는 28 (실제 ${H.length})`);
  } else {
    ok(D.POOLS.low.length === 24, `${key}: 저학년 묶음 24 (실제 ${D.POOLS.low.length})`);
    ok(D.POOLS.high.length === 24, `${key}: 고학년 묶음 24 (실제 ${D.POOLS.high.length})`);
  }

  for (const band of ['low', 'high']) {
    for (const id of D.POOLS[band]) {
      ok(M[id], `${key}: ${band} 묶음 ${id} 존재`);
      ok(M[id] && M[id].diff !== '상', `${key}: ${band} 묶음에 상 난도 없음(${id})`);
      if (band === 'low') ok(M[id] && M[id].band !== '고', `${key}: 저학년 묶음에 고 전용 없음(${id})`);
      if (band === 'high') ok(M[id] && M[id].band !== '저', `${key}: 고학년 묶음에 저 전용 없음(${id})`);
    }
    // usa는 핼러윈 상한 2·1 둘 다 검사
    const hmaxValues = D.HALLOWEEN_SWAP ? [2, 1] : [C.HALLOWEEN_MAX];
    for (const hmax of hmaxValues) {
      const cfg = { ...C, HALLOWEEN_MAX: hmax };
      const ids = Core.defaultIds(band, cfg, D);
      const errs = Core.validate(ids, band, cfg, D, null);
      ok(!errs.length, `${key}: ${band} 기본 세트(핼러윈 ≤${hmax}) 규칙 통과: ${errs.join(', ')}`);
    }
  }
}

// ── 3) 무작위 출제 시뮬레이션 ─────────────────────────────────────────────────
function rngFrom(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
let seedBase = 11;
for (const key of C.TOPIC_ORDER) {
  const D = TOPICS[key];
  if (!D || D.placeholder) continue;
  const M = Object.fromEntries(D.QUESTIONS.map(q => [q.id, q]));
  const hmaxValues = D.HALLOWEEN_SWAP ? [2, 1] : [C.HALLOWEEN_MAX];
  const ROUNDS = 2000;
  for (const hmax of hmaxValues) {
    for (const band of ['low', 'high']) {
      const cfg = { ...C, HALLOWEEN_MAX: hmax };
      const rng = rngFrom(seedBase++);
      let prev = null, fallbacks = 0, bad = 0, runBad = 0;
      const seen = {};
      for (let i = 0; i < ROUNDS; i++) {
        const { round, fallback } = Core.buildRound(band, prev, rng, cfg, D);
        const ids = round.map(r => r.id);
        if (fallback) fallbacks++;
        else {
          const errs = Core.validate(ids, band, cfg, D, prev);
          if (errs.length) { bad++; if (bad < 4) console.log(`  ${key}/${band}/h≤${hmax} 규칙 위반:`, errs.join(', ')); }
        }
        if (Core.maxAnswerRun(round, M) > 3) runBad++;
        round.forEach(r => {
          ok(r.order.length === M[r.id].choices.length && new Set(r.order).size === r.order.length, `${key}/${r.id} 보기 순서 유효`);
        });
        ids.forEach(id => { seen[id] = (seen[id] || 0) + 1; });
        prev = ids;
      }
      ok(bad === 0, `${key}/${band}/핼러윈≤${hmax}: 무작위 판 규칙 위반 0 (실제 ${bad})`);
      ok(runBad === 0, `${key}/${band}/핼러윈≤${hmax}: 같은 정답 칸 4연속 0 (실제 ${runBad})`);
      ok(fallbacks / ROUNDS < 0.01, `${key}/${band}/핼러윈≤${hmax}: 기본 세트 대체율 < 1% (실제 ${(100 * fallbacks / ROUNDS).toFixed(2)}%)`);
      const unused = D.POOLS[band].filter(id => !seen[id]);
      console.log(`· ${key}/${band}/h≤${hmax}: ${ROUNDS}판, 대체 ${fallbacks}회(${(100 * fallbacks / ROUNDS).toFixed(2)}%), 미출제 ${unused.length}개 ${unused.join(' ')}`);
    }
  }
}

// ── 4) 판 번호·저장 목록·내용 해시(sw.js) ─────────────────────────────────────
let sw = readFileSync(path.join(APP, 'sw.js'), 'utf8');
const h = createHash('sha256');
for (const a of C.ASSETS) { if (a !== './') h.update(a).update(readFileSync(path.join(APP, a))); }
const build = h.digest('hex').slice(0, 12);
const swBuild = (sw.match(/const BUILD = '([^']*)'/) || [])[1];
if (process.argv.includes('--write')) {
  if (swBuild !== build) {
    sw = sw.replace(/const BUILD = '[^']*'/, `const BUILD = '${build}'`);
    writeFileSync(path.join(APP, 'sw.js'), sw);
    console.log(`· sw.js BUILD ${swBuild} → ${build} (판 번호 ${C.VERSION})`);
  }
} else {
  ok(swBuild === build, `sw.js BUILD(${swBuild}) = 현재 내용 해시(${build}) — 다르면 node tools/check.mjs --write 실행`);
}
const swVer = (sw.match(/const VERSION = '([^']+)'/) || [])[1];
ok(swVer === C.VERSION, `sw.js VERSION(${swVer}) = config.js VERSION(${C.VERSION})`);
const swBlock = (sw.match(/const ASSETS = \[([\s\S]*?)\];/) || [])[1] || '';
const swAssets = JSON.stringify([...swBlock.matchAll(/'(\.\/[^']*)'/g)].map(m => m[1]));
ok(swAssets === JSON.stringify(C.ASSETS), `sw.js ASSETS = config.js ASSETS`);
for (const a of C.ASSETS) {
  if (a === './') continue;
  try { readFileSync(path.join(APP, a)); } catch { ok(false, `저장 대상 파일 있음: ${a}`); }
}

// ── 5) 외부 호출 0 ─────────────────────────────────────────────────────────────
const checkFiles = [
  'index.html', 'app.js', 'style.css', 'sw.js', 'core.js', 'config.js',
  ...C.TOPIC_ORDER.map(k => 'topics/' + k + '.js'),
];
for (const f of checkFiles) {
  const t = readFileSync(path.join(APP, f), 'utf8');
  ok(!/https?:\/\//.test(t.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '')), `${f}: 외부 주소 없음`);
}

console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
