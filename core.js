// 출제 로직(화면과 분리 — tools/check.mjs가 같은 코드로 시험한다)
(function (root) {
  'use strict';

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function qmap(D) {
    if (!D._map) D._map = Object.fromEntries(D.QUESTIONS.map(q => [q.id, q]));
    return D._map;
  }

  function groupsFor(cfg, D) {
    return (D.EXCLUSIVE || []).map(g => (g.halloween ? { ids: g.ids, max: cfg.HALLOWEEN_MAX } : g));
  }

  // 기본 세트(핼러윈 상한에 맞춰 교체 적용)
  function defaultIds(band, cfg, D) {
    const ids = D.DEFAULT_SETS[band].slice();
    if (!D.HALLOWEEN_SWAP) return ids;
    const swaps = D.HALLOWEEN_SWAP[band] || {};
    if (!Object.keys(swaps).length) return ids;
    const hw = groupsFor(cfg, D).find(g => g.ids && g.ids.includes('Q07'));
    if (!hw) return ids;
    for (const [from, to] of Object.entries(swaps)) {
      if (ids.filter(id => hw.ids.includes(id)).length <= hw.max) break;
      const i = ids.indexOf(from);
      if (i >= 0) ids[i] = to;
    }
    return ids;
  }

  // 한 판(순서 포함)이 규칙을 지키는지 — 어긴 항목 목록을 돌려준다
  function validate(ids, band, cfg, D, prevIds) {
    const M = qmap(D);
    const n = cfg.QUESTIONS_PER_ROUND;
    const errs = [];
    if (ids.length !== n) errs.push('count');
    if (new Set(ids).size !== ids.length) errs.push('dup');
    ids.forEach(id => { if (!M[id]) errs.push('unknown:' + id); });
    if (errs.length) return errs;
    const pool = new Set(D.POOLS[band]);
    ids.forEach(id => { if (!pool.has(id)) errs.push('notInPool:' + id); });
    const [midMin, midMax] = D.DIFF_RULES[band].mid;
    const mid = ids.filter(id => M[id].diff === '중').length;
    if (ids.some(id => M[id].diff === '상')) errs.push('hard');
    if (mid < midMin || mid > midMax) errs.push('mid:' + mid);
    const cc = {};
    ids.forEach(id => { cc[M[id].cat] = (cc[M[id].cat] || 0) + 1; });
    D.CATS.forEach(c => {
      if (!cc[c]) errs.push('noCat:' + c);
      if (cc[c] > 2) errs.push('catMax:' + c);
    });
    groupsFor(cfg, D).forEach(g => {
      if (ids.filter(id => g.ids.includes(id)).length > g.max) errs.push('group:' + g.ids.join('/'));
    });
    [0, 1, n - 1].forEach(p => { if (M[ids[p]].diff !== '하') errs.push('edge:' + p); });
    if (prevIds && prevIds.length) {
      const ov = ids.filter(id => prevIds.includes(id)).length;
      if (ov > cfg.MAX_OVERLAP_WITH_PREV) errs.push('overlap:' + ov);
    }
    return errs;
  }

  // 1·2번과 마지막은 하 난도, 중 난도는 가운데에 흩어 둔다(§6.4 규칙 5)
  function orderIds(ids, rng, M, n) {
    const mids = shuffle(ids.filter(id => M[id].diff === '중'), rng);
    const easy = shuffle(ids.filter(id => M[id].diff !== '중'), rng);
    const inner = [];
    for (let p = 2; p <= n - 2; p++) inner.push(p);
    const out = new Array(n).fill(null);
    if (mids.length) {
      const step = inner.length / mids.length;
      mids.forEach((id, i) => { out[inner[Math.min(inner.length - 1, Math.floor(step * i + step / 2))]] = id; });
    }
    let e = 0;
    for (let p = 0; p < n; p++) if (!out[p]) out[p] = easy[e++];
    return out;
  }

  // 구성형 추첨: 범주마다 1개씩 먼저 뽑고 나머지를 채운다 → 규칙 검사 → 실패하면 다시
  function drawIds(band, prevIds, rng, cfg, D) {
    const M = qmap(D);
    const n = cfg.QUESTIONS_PER_ROUND;
    const groups = groupsFor(cfg, D);
    const [midMin, midMax] = D.DIFF_RULES[band].mid;
    for (let attempt = 0; attempt < cfg.DRAW_ATTEMPTS; attempt++) {
      const targetMid = midMin + Math.floor(rng() * (midMax - midMin + 1));
      const pool = shuffle(D.POOLS[band].filter(id => M[id].diff !== '상'), rng);
      const chosen = [];
      const overlapNow = () => (prevIds || []).filter(id => chosen.includes(id)).length;
      const can = id => {
        if (chosen.includes(id)) return false;
        const q = M[id];
        const midNow = chosen.filter(x => M[x].diff === '중').length;
        if (q.diff === '중' && midNow >= targetMid) return false;
        if (q.diff === '하' && chosen.length - midNow >= n - targetMid) return false;
        if (chosen.filter(x => M[x].cat === q.cat).length >= 2) return false;
        for (const g of groups) {
          if (g.ids.includes(id) && chosen.filter(x => g.ids.includes(x)).length >= g.max) return false;
        }
        if (prevIds && prevIds.includes(id) && overlapNow() >= cfg.MAX_OVERLAP_WITH_PREV) return false;
        return true;
      };
      for (const cat of shuffle(D.CATS, rng)) {
        const id = pool.find(x => M[x].cat === cat && can(x));
        if (id) chosen.push(id);
      }
      for (const id of pool) {
        if (chosen.length >= n) break;
        if (can(id)) chosen.push(id);
      }
      if (chosen.length !== n) continue;
      const ordered = orderIds(chosen, rng, M, n);
      if (!validate(ordered, band, cfg, D, prevIds).length) return { ids: ordered, fallback: false };
    }
    return { ids: defaultIds(band, cfg, D), fallback: true };
  }

  function answerSlot(item, M) {
    return item.order.indexOf(M[item.id].answer);
  }

  function maxAnswerRun(round, M) {
    let best = 0, cur = 0, last = -1;
    round.forEach(it => {
      const s = answerSlot(it, M);
      cur = s === last ? cur + 1 : 1;
      last = s;
      best = Math.max(best, cur);
    });
    return best;
  }

  // 한 판 만들기: 문제 10개 + 문제마다 보기 순서(정답 칸이 4번 넘게 이어지지 않게 — §6.4 규칙 6)
  function buildRound(band, prevIds, rng, cfg, D) {
    const M = qmap(D);
    const pick = cfg.RANDOM ? drawIds(band, prevIds, rng, cfg, D) : { ids: defaultIds(band, cfg, D), fallback: false };
    let round = null;
    for (let t = 0; t < 200; t++) {
      round = pick.ids.map(id => ({ id, order: shuffle(M[id].choices.map((_, i) => i), rng) }));
      if (maxAnswerRun(round, M) <= 3) break;
    }
    return { round, fallback: pick.fallback };
  }

  root.QuizCore = { shuffle, defaultIds, validate, orderIds, drawIds, buildRound, maxAnswerRun, answerSlot };
})(self);
