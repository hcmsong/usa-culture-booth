// 확정 문항(JSON) → topics/<key>.js 생성: node tools/build_topics.mjs <final.json>
// final.json = [{ topic, name, cats, final: { questions: [...], exclusive: [{ids, reason}] } }, ...]
// 문제 묶음(POOLS)은 band 규칙으로, 기본 세트(DEFAULT_SETS)는 core.js 출제 로직으로 계산한다.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const META = {
  japan: { title: '일본 퀴즈 도전!', emoji: '🇯🇵' },
  korea: { title: '한국 퀴즈 도전!', emoji: '🇰🇷' },
  vietnam: { title: '베트남 퀴즈 도전!', emoji: '🇻🇳' },
  world: { title: '세계 퀴즈 도전!', emoji: '🌏' },
  animals: { title: '동물 퀴즈 도전!', emoji: '🐾' },
  sports: { title: '운동 퀴즈 도전!', emoji: '⚽' },
};
const ctx = { console }; ctx.self = ctx; vm.createContext(ctx);
for (const f of ['config.js', 'core.js']) vm.runInContext(readFileSync(path.join(APP, f), 'utf8'), ctx, { filename: f });
const C = ctx.QUIZ_CONFIG, Core = ctx.QuizCore;
const rngFrom = seed => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; };

const items = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const SOURCES = [], CHANGES = [];
for (const it of items) {
  const key = it.topic, meta = META[key];
  if (!meta) throw new Error('알 수 없는 주제 ' + key);
  const Qs = it.final.questions.map(q => ({
    id: q.id, cat: q.cat, diff: q.diff, band: q.band, q: q.q, choices: q.choices, answer: q.answer,
    fact: q.fact, eq: q.eq, ea: q.ea,
  }));
  SOURCES.push(`## ${it.name}\n\n| id | 문제 | 정답 | 확인 출처 |\n|---|---|---|---|\n` + it.final.questions.map(q => `| ${q.id} | ${q.q.replace(/\|/g, '/')} | ${String(q.choices[q.answer]).replace(/\|/g, '/')} | ${(q.source || '').replace(/\|/g, ' · ')} |`).join('\n') + '\n');
  CHANGES.push(`## ${it.name}\n\n` + (it.final.change_log || []).map(c => '- ' + c).join('\n') + '\n');
  const ids = new Set(Qs.map(q => q.id));
  const CATS = it.cats.filter(c => Qs.some(q => q.cat === c));
  const extra = [...new Set(Qs.map(q => q.cat))].filter(c => !CATS.includes(c));
  if (extra.length) throw new Error(`${key}: 범주 목록 밖 ${extra.join(',')}`);
  const POOLS = {
    low: Qs.filter(q => (q.band === '저' || q.band === '공통') && q.diff !== '상').map(q => q.id),
    high: Qs.filter(q => (q.band === '고' || q.band === '공통') && q.diff !== '상').map(q => q.id),
  };
  const seen = new Set();
  const EXCLUSIVE = (it.final.exclusive || [])
    .map(g => ({ ids: [...new Set(g.ids)].filter(id => ids.has(id)).sort(), max: 1, why: g.reason || '' }))
    .filter(g => g.ids.length >= 2 && !seen.has(g.ids.join()) && seen.add(g.ids.join()));
  const D = { key, CATS, QUESTIONS: Qs, POOLS, DEFAULT_SETS: { low: [], high: [] }, DIFF_RULES: { low: { mid: [1, 2] }, high: { mid: [4, 5] } }, EXCLUSIVE };
  for (const band of ['low', 'high']) {
    let got = null;
    for (let seed = 1; seed < 500 && !got; seed++) {
      const r = Core.drawIds(band, null, rngFrom(seed * 7919), C, D);
      if (!r.fallback) got = r.ids;
    }
    if (!got) throw new Error(`${key}/${band}: 규칙을 지키는 기본 세트를 찾지 못함`);
    D.DEFAULT_SETS[band] = got;
    delete D._map;
  }
  const qLines = Qs.map(q => '    ' + JSON.stringify(q) + ',').join('\n');
  const excLines = EXCLUSIVE.map(g => `    { ids: ${JSON.stringify(g.ids)}, max: 1 },  // ${g.why.replace(/\n/g, ' ').slice(0, 80)}`).join('\n');
  const out = `// ${it.name} 퀴즈 문제 은행 — 2026-10-24 생성(웹 사실 검증 + 초등 교사 관점 검토, 2회 반영)
// answer = choices 안의 정답 위치(0부터). eq = 문제 화면 이모지, ea = 정답 화면 이모지. 확인 출처는 «문제출처_주제확장.md».
// 범주마다 공통 3(하 2·중 1) + 저학년 1(하) + 고학년 1(중). 묶음·기본 세트는 tools/build_topics.mjs가 계산.
self.QUIZ_TOPICS = self.QUIZ_TOPICS || {};
self.QUIZ_TOPICS.${key} = {
  key: '${key}', name: '${it.name}', title: '${meta.title}', emoji: '${meta.emoji}',
  CATS: ${JSON.stringify(CATS)},
  QUESTIONS: [
${qLines}
  ],
  POOLS: {
    low: ${JSON.stringify(POOLS.low)},
    high: ${JSON.stringify(POOLS.high)},
  },
  DEFAULT_SETS: {
    low: ${JSON.stringify(D.DEFAULT_SETS.low)},
    high: ${JSON.stringify(D.DEFAULT_SETS.high)},
  },
  DIFF_RULES: { low: { mid: [1, 2] }, high: { mid: [4, 5] } },
  EXCLUSIVE: [
${excLines}
  ],
};
`;
  writeFileSync(path.join(APP, 'topics', key + '.js'), out);
  console.log(`· ${key}: 문항 ${Qs.length} · 묶음 저 ${POOLS.low.length}/고 ${POOLS.high.length} · 금지 묶음 ${EXCLUSIVE.length} · 기본 세트 계산 완료`);
}

const DOC = path.join(APP, '..', '문제출처_주제확장.md');
writeFileSync(DOC, `# 주제 확장 문제 출처·검증 변경 기록(2026-10-24)\n\n- 생성 → 1차 사실 검증(웹 출처) → 2차 초등 교사 관점 검토 → 최종 반영. 앱 파일에는 출처를 넣지 않는다(외부 주소 0 원칙).\n\n# 확인 출처\n\n${SOURCES.join('\n')}\n# 검증 반영 변경 기록\n\n${CHANGES.join('\n')}`);
console.log('· 출처·변경 기록 → ' + DOC);
