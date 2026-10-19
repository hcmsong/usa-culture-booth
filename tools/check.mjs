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
for (const f of ['config.js', 'questions.js', 'core.js']) {
  vm.runInContext(readFileSync(path.join(APP, f), 'utf8'), ctx, { filename: f });
}
const C = ctx.QUIZ_CONFIG, D = ctx.QUIZ_DATA, Core = ctx.QuizCore;
const M = Object.fromEntries(D.QUESTIONS.map(q => [q.id, q]));
let fail = 0;
const ok = (cond, msg) => { if (!cond) { fail++; console.log('✗ ' + msg); } };

// 1) 문항 데이터
ok(D.QUESTIONS.length === 38, `문항 수 38 (실제 ${D.QUESTIONS.length})`);
ok(new Set(D.QUESTIONS.map(q => q.id)).size === D.QUESTIONS.length, 'id 중복 없음');
for (const q of D.QUESTIONS) {
  ok(D.CATS.includes(q.cat), `${q.id} 범주`);
  ok(['하', '중', '상'].includes(q.diff), `${q.id} 난도`);
  ok(['저', '고', '공통'].includes(q.band), `${q.id} 학년대`);
  ok(q.band === '고' ? q.choices.length === 4 : q.band === '저' ? q.choices.length === 3 : [3, 4].includes(q.choices.length), `${q.id} 보기 수(저 3, 고 4, 공통 3~4)`);
  ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length, `${q.id} 정답 위치`);
  ok(new Set(q.choices).size === q.choices.length, `${q.id} 보기 중복 없음`);
  ok(q.q.length <= 46, `${q.id} 문제 길이 ${q.q.length} ≤ 46`);
  ok(q.choices.every(c => { const m = c.match(/^(.*\S)\s+\(([^)]*)\)$/); return m ? m[1].length <= 18 && m[2].length <= 12 : c.length <= 18; }), `${q.id} 보기 길이(본문 ≤ 18, 괄호 한글 ≤ 12)`);
  ok(q.fact.length <= 40, `${q.id} 재미 사실 길이 ${q.fact.length} ≤ 40`);
  ok(q.eq && q.ea, `${q.id} 이모지`);
}

// 2) 문제 묶음·기본 세트
ok(D.POOLS.low.length === 27, `저학년 묶음 27 (실제 ${D.POOLS.low.length})`);
{
  const H = D.POOLS.high, reduced = ['Q04', 'Q17', 'Q23'];
  ok(H.length === 31 || (H.length === 28 && reduced.every(id => !H.includes(id))), `고학년 묶음 31 또는 28(Q04·Q17·Q23 제외) (실제 ${H.length})`);
}
for (const band of ['low', 'high']) {
  for (const id of D.POOLS[band]) {
    ok(M[id], `${band} 묶음 ${id} 존재`);
    ok(M[id] && M[id].diff !== '상', `${band} 묶음에 상 난도 없음(${id})`);
    if (band === 'low') ok(M[id] && M[id].band !== '고', `저학년 묶음에 고 전용 없음(${id})`);
    if (band === 'high') ok(M[id] && M[id].band !== '저', `고학년 묶음에 저 전용 없음(${id})`);
  }
  for (const hmax of [2, 1]) {
    const cfg = { ...C, HALLOWEEN_MAX: hmax };
    const ids = Core.defaultIds(band, cfg, D);
    const errs = Core.validate(ids, band, cfg, D, null);
    ok(!errs.length, `${band} 기본 세트(핼러윈 ≤${hmax}) 규칙 통과: ${errs.join(', ')}`);
  }
}

// 3) 무작위 출제 시뮬레이션
function rngFrom(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
for (const hmax of [2, 1]) {
  for (const band of ['low', 'high']) {
    const cfg = { ...C, HALLOWEEN_MAX: hmax };
    const rng = rngFrom(band === 'low' ? 11 + hmax : 97 + hmax);
    let prev = null, fallbacks = 0, bad = 0, runBad = 0;
    const seen = {}, N = 5000;
    for (let i = 0; i < N; i++) {
      const { round, fallback } = Core.buildRound(band, prev, rng, cfg, D);
      const ids = round.map(r => r.id);
      if (fallback) fallbacks++;
      else {
        const errs = Core.validate(ids, band, cfg, D, prev);
        if (errs.length) { bad++; if (bad < 4) console.log('  규칙 위반 예:', errs.join(', ')); }
      }
      if (Core.maxAnswerRun(round, M) > 3) runBad++;
      round.forEach(r => {
        ok(r.order.length === M[r.id].choices.length && new Set(r.order).size === r.order.length, `${r.id} 보기 순서 유효`);
      });
      ids.forEach(id => { seen[id] = (seen[id] || 0) + 1; });
      prev = ids;
    }
    ok(bad === 0, `${band}·핼러윈≤${hmax}: 무작위 판 규칙 위반 0 (실제 ${bad})`);
    ok(runBad === 0, `${band}·핼러윈≤${hmax}: 같은 정답 칸 4연속 0 (실제 ${runBad})`);
    ok(fallbacks / N < 0.01, `${band}·핼러윈≤${hmax}: 기본 세트 대체율 < 1% (실제 ${(100 * fallbacks / N).toFixed(2)}%)`);
    const unused = D.POOLS[band].filter(id => !seen[id]);
    console.log(`· ${band}·핼러윈≤${hmax}: ${N}판, 대체 ${fallbacks}회(${(100 * fallbacks / N).toFixed(2)}%), 묶음 ${D.POOLS[band].length}개 중 미출제 ${unused.length}개 ${unused.join(' ')}`);
    const freq = D.POOLS[band].map(id => `${id}:${Math.round(100 * (seen[id] || 0) / N)}%`).join(' ');
    console.log(`  출제 빈도 ${freq}`);
  }
}

// 4) 판 번호·저장 목록·내용 해시(sw.js)
let sw = readFileSync(path.join(APP, 'sw.js'), 'utf8');
const h = createHash('sha256');
for (const a of C.ASSETS) { if (a !== './') h.update(a).update(readFileSync(path.join(APP, a))); }
const build = h.digest('hex').slice(0, 12);
const swBuild = (sw.match(/const BUILD = '([^']*)'/) || [])[1];
if (process.argv.includes('--write')) {
  if (swBuild !== build) {
    sw = sw.replace(/const BUILD = '[^']*'/, `const BUILD = '${build}'`);
    writeFileSync(path.join(APP, 'sw.js'), sw);
    console.log(`· sw.js BUILD ${swBuild} → ${build} (판 번호 ${C.VERSION} — 이미 설치한 iPad가 있으면 VERSION도 올릴 것)`);
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

// 5) 외부 호출 0
for (const f of ['index.html', 'app.js', 'style.css', 'sw.js', 'core.js', 'config.js', 'questions.js']) {
  const t = readFileSync(path.join(APP, f), 'utf8');
  ok(!/https?:\/\//.test(t.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '')), `${f}: 외부 주소 없음`);
}

console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
