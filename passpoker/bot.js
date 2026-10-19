// Pass Poker computer opponent. It decides from public information plus its own hand:
// it reads the shared state only for things both players can see (bids, kept cards, showdown, draft).
(function () {
const G = PassPoker;
const RV = c => '23456789TJQKA'.indexOf(c[0]) + 2;
const CATSTART = [0, .501, .924, .972, .993, .997, .999, .9997, .99999, 1];
const pctScore = sc => CATSTART[sc[0]] + (CATSTART[sc[0] + 1] - CATSTART[sc[0]]) * ((sc[1] || 2) - 2) / 12;
function partialScore(cs) {
  if (cs.length === 5) return G.eval5(cs);
  const cnt = {}; cs.forEach(c => cnt[RV(c)] = (cnt[RV(c)] || 0) + 1);
  const g = Object.entries(cnt).map(([v, n]) => [n, +v]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const top = g[0] || [0, 2], sec = g[1] || [0, 0];
  const cat = top[0] >= 4 ? 7 : top[0] === 3 && sec[0] >= 2 ? 6 : top[0] === 3 ? 3 : top[0] === 2 && sec[0] === 2 ? 2 : top[0] === 2 ? 1 : 0;
  return [cat, ...g.map(x => x[1])];
}
const strength = cs => cs.length ? pctScore(partialScore(cs)) : 0;
function combos(a, k, s = 0, cur = [], out = []) { if (cur.length === k) { out.push(cur.slice()); return out; } for (let i = s; i < a.length; i++) { cur.push(a[i]); combos(a, k, i + 1, cur, out); cur.pop(); } return out; }
const pick = (a, k) => a.slice().sort(() => Math.random() - .5).slice(0, k);
function pot(cards, target = 6) {
  const n = cards.length, rem = Math.max(0, target - n);
  if (n >= 5) { const b = bestMemo(cards); return b.score[0] + (b.score[1] || 0) / 15; }
  const sc = partialScore(cards); let v = sc[0] + (sc[1] || 0) / 15;
  const cnt = {}; cards.forEach(c => cnt[c[0]] = (cnt[c[0]] || 0) + 1);
  const mx = Math.max(...Object.values(cnt)), P = 0.55;
  if (rem >= 1) { const up = mx === 1 ? 1 : mx === 2 ? 3 : 7; v = Math.max(v, up * P * 0.8 + (sc[1] || 0) / 15); }
  const suits = {}; cards.forEach(c => suits[c[1]] = (suits[c[1]] || 0) + 1);
  const sm = Math.max(...Object.values(suits)); if (5 - sm <= rem) v = Math.max(v, 5 * Math.pow(P, 5 - sm));
  const rs = new Set(cards.map(RV)); if (rs.has(14)) rs.add(1);
  for (let w = 1; w <= 10; w++) { let h = 0; for (let r = w; r < w + 5; r++) if (rs.has(r)) h++; if (5 - h <= rem) v = Math.max(v, 4 * Math.pow(P, 5 - h)); }
  return v;
}
// 0..1: how good a bid card is for winning a first-pick auction
function auctionPower(s, b) { const n = +b[0]; return s.priority === 'low' ? (4 - n) / 4 : n / 4; }
function decide(s, p, sk) {
  const v = G.viewFor(s, p), o = 1 - p, tgt = s.spoils ? 8 : 6;
  if (s.step === 'bid' && !v.myBid) {
    if (!sk.bid) return { type: 'bid', bids: pick(v.bidsLeft[p], 2) };
    const st = v.myHands.map(strength), want = st.map(x => x > .9 ? 0 : x > .5 ? 1.5 : 3.5);
    let best = null;
    for (const a of v.bidsLeft[p]) for (const b of v.bidsLeft[p]) {
      if (a === b) continue;
      let cost = Math.abs(+a[0] - want[0]) + Math.abs(+b[0] - want[1]);
      if (s.variant !== 'original' && G.target(0, a) === G.target(1, b)) cost += 1.5;
      if (sk.auction && s.priority) cost += 1.2 * (auctionPower(s, a) + auctionPower(s, b));
      cost += Math.random() * 0.6;
      if (!best || cost < best.c) best = { c: cost, bids: [a, b] };
    }
    return { type: 'bid', bids: best.bids };
  }
  if (s.step === 'pass' && !v.myPassDone) {
    const c = [0, 1].map(h => G.offerSize(s, p, h));
    if (!sk.pass) return { type: 'pass', cards: v.myHands.map((h, i) => pick(h, c[i])) };
    const base = s.phaseInfo.counts[p];
    if (sk.equity) return { type: 'pass', cards: expertPass(s, p, v, c) };
    const plan = (h, i, k) => {
      let best = null;
      for (const keep of combos(h, h.length - k)) {
        const out = h.filter(x => !keep.includes(x));
        let val = strength(keep) + keep.reduce((t, x) => t + RV(x), 0) / 2000;
        if (sk.deny && s.kept[o].length) val -= 0.05 * out.reduce((t, x) => t + (pot([...s.kept[o], x], tgt) - pot(s.kept[o], tgt)), 0);
        if (!best || val > best.v) best = { v: val, out };
      }
      return best.out;
    };
    return { type: 'pass', cards: v.myHands.map((h, i) => {
      if (!(sk.sneak && s.offer === 'other' && c[i] > base[i])) return plan(h, i, c[i]);
      // pass the normal cards, then add as the extra the card that would most help my other hand if it's sent back
      const out = plan(h, i, base[i]), rest = h.filter(x => !out.includes(x)), other = v.myHands[1 - i];
      let best = null;
      for (const x of rest) {
        // if x comes back it joins my other hand (6 cards → I keep the best 5); x also leaves this hand
        const gain = pctScore(G.best5([...other, x]).score) - pctScore(G.eval5(other));
        const loss = strength(rest) - strength(rest.filter(y => y !== x));
        const val = gain - loss;
        if (!best || val > best.v) best = { v: val, x };
      }
      return [...out, best.x];
    }) };
  }
  if (s.step === 'alloc' && v.allocNeed !== null && !v.allocDone) {
    const h = v.myHands[v.allocNeed], other = v.myHands[1 - v.allocNeed];
    if (!sk.pass) return { type: 'alloc', keep: pick(h, 5) };
    if (sk.equity) { const samples = sampleOpponents(s, p, v, 40); return { type: 'alloc', keep: bestSplit(h, other, samples)[0] }; }
    let best = null;
    for (const keep of combos(h, 5)) {
      const rest = [...other, ...h.filter(x => !keep.includes(x))];
      const val = pctScore(G.eval5(keep)) + pctScore(G.eval5(rest));
      if (!best || val > best.v) best = { v: val, keep };
    }
    return { type: 'alloc', keep: best.keep };
  }
  if (s.step === 'draft' && s.draft.order[s.draft.idx].seat === p) {
    const m = s.draft.order[s.draft.idx].m;
    const avail = s.showdown.matches[m].pool.filter(c => s.draft.taken[c] === undefined);
    if (!sk.draft) return { type: 'pick', card: pick(avail, 1)[0] };
    if (sk.search) return { type: 'pick', card: searchRound(s, p, tgt) };
    const mine = s.kept[p], theirs = s.kept[o], b0 = pot(mine, tgt), t0 = pot(theirs, tgt);
    let best = null;
    for (const c of avail) {
      let val = pot([...mine, c], tgt) - b0;
      if (sk.deny) val += 0.7 * (pot([...theirs, c], tgt) - t0);
      val += Math.random() * 1e-6;
      if (!best || val > best.v) best = { v: val, c };
    }
    return { type: 'pick', card: best.c };
  }
  if (s.step === 'swap' && !v.mySwapDone) {
    if (!sk.swap || v.swapBudget < 1) return { type: 'swap', skip: true };
    const [A, B] = v.myHands;
    if (sk.equity) {
      const samples = sampleOpponents(s, p, v, 40), base = matchupWins(A, B, samples);
      let best = null;
      for (const ca of A) for (const cb of B) {
        const w = matchupWins(A.filter(x => x !== ca).concat(cb), B.filter(x => x !== cb).concat(ca), samples);
        if (!best || w > best.w) best = { w, cards: [ca, cb] };
      }
      if (best.w - base < 0.12) return { type: 'swap', skip: true };
      const keepValue = b => s.priority ? auctionPower(s, b) : Math.abs(+b[0] - 2);
      const pay = s.bidsLeft[p].slice().sort((x, y) => keepValue(x) - keepValue(y) || Math.random() - .5).slice(0, 1);
      return { type: 'swap', cards: best.cards, pay, secret: false };
    }
    const base = pctScore(G.eval5(A)) + pctScore(G.eval5(B));
    let best = null;
    for (const ca of A) for (const cb of B) {
      const A2 = A.filter(x => x !== ca).concat(cb), B2 = B.filter(x => x !== cb).concat(ca);
      const val = pctScore(G.eval5(A2)) + pctScore(G.eval5(B2));
      if (!best || val > best.v) best = { v: val, cards: [ca, cb] };
    }
    if (best.v - base < (sk.swapMin || 0.1)) return { type: 'swap', skip: true };
    const secret = !!sk.swapSecret && v.swapBudget >= 2;
    // spend the cards least useful to keep: middling numbers (or weakest for the auction)
    const keepValue = b => s.priority ? auctionPower(s, b) : Math.abs(+b[0] - 2);
    const pay = s.bidsLeft[p].slice().sort((x, y) => keepValue(x) - keepValue(y) || Math.random() - .5).slice(0, secret ? 2 : 1);
    return { type: 'swap', cards: best.cards, pay, secret };
  }
  if (s.step === 'choose' && !v.myChooseDone) {
    const returns = [null, null];
    for (const m of v.offersIn) {
      if (!sk.choose) { returns[m.h] = pick(m.cards, 1)[0]; continue; }
      // incoming cards to the same hand from the other batch (assume all of them arrive)
      const others = v.offersIn.filter(x => x !== m && x.t === m.t).flatMap(x => x.cards.slice(1));
      let best = null;
      for (const back of m.cards) {
        const hand = [...v.myHands[m.t], ...others, ...m.cards.filter(x => x !== back)];
        const val = hand.length >= 5 ? pctScore(G.best5(hand).score) : strength(hand);
        if (!best || val > best.v) best = { v: val, back };
      }
      returns[m.h] = best.back;
    }
    return { type: 'choose', returns };
  }
  if (s.step === 'prio' && !v.myPrio) {
    const left = s.bidsLeft[p];
    if (!sk.auction) return { type: 'prio', card: pick(left, 1)[0] };
    const sorted = left.slice().sort((a, b) => auctionPower(s, b) - auctionPower(s, a)); // strongest first
    const cur = s.draft.auctions.length;
    const imp = m => {
      const avail = s.showdown.matches[m].pool.filter(c => s.draft.taken[c] === undefined);
      const mine = s.kept[p], theirs = s.kept[o], b0 = pot(mine, tgt), t0 = pot(theirs, tgt);
      const g = avail.map(c => pot([...mine, c], tgt) - b0 + (sk.deny ? 0.7 * (pot([...theirs, c], tgt) - t0) : 0)).sort((a, b) => b - a);
      return (g[0] || 0) - (g[1] || 0);
    };
    // Expert: how much is picking first worth here, found by playing out the matchup both ways
    const impSearch = m => {
      const mt = s.showdown.matches[m], avail = mt.pool.filter(c => s.draft.taken[c] === undefined);
      const orderFor = first => [{ m, seat: first }, { m, seat: 1 - first }].concat(s.spoils ? [{ m, seat: mt.winner }] : []);
      return searchDraft(s, p, orderFor(p), avail, tgt).v - searchDraft(s, p, orderFor(o), avail, tgt).v;
    };
    const imps = [0, 1, 2].filter(m => m >= cur).map(sk.search ? impSearch : imp);
    const card = imps[0] >= Math.max(...imps) ? sorted[0] : sorted[sorted.length - 1];
    return { type: 'prio', card };
  }
  if (s.step === 'between' && !s.ready[p]) return { type: 'ready' };
  return null;
}
// ---------- Expert: matchup estimator ----------
const DECK = (() => { const d = []; for (const su of 'SHDC') for (const r of '23456789TJQKA') d.push(r + su); return d; })();
const shuffled = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
// Deal plausible opponent hands from what this seat can't see, honoring cards it knows are there.
function sampleOpponents(s, p, v, K) {
  const seen = new Set([...v.myHands[0], ...v.myHands[1], ...s.kept[0], ...s.kept[1]]);
  const known = v.known, knownAll = new Set([...known[0], ...known[1], ...known[2]]);
  const pool = DECK.filter(c => !seen.has(c) && !knownAll.has(c));
  const out = [];
  for (let k = 0; k < K; k++) {
    const sh = shuffled(pool), either = shuffled(known[2]);
    const A = known[0].slice(), B = known[1].slice();
    for (const c of either) (A.length < B.length ? A : B).push(c);
    let i = 0;
    while (A.length < 5) A.push(sh[i++]);
    while (B.length < 5) B.push(sh[i++]);
    const ea = G.eval5(A), eb = G.eval5(B), hiA = G.cmp(ea, eb) >= 0;
    out.push({ hi: hiA ? ea : eb, lo: hiA ? eb : ea, rest: sh.slice(i) });
  }
  return out;
}
// Expected matchups won (high + low) by my two 5-card hands against the sampled opponents.
function matchupWins(A, B, samples) {
  const ea = G.eval5(A), eb = G.eval5(B), hiA = G.cmp(ea, eb) >= 0, hi = hiA ? ea : eb, lo = hiA ? eb : ea;
  let w = 0;
  for (const o of samples) {
    const a = G.cmp(hi, o.hi), b = G.cmp(lo, o.lo);
    w += (a > 0 ? 1 : a === 0 ? 0.5 : 0) + (b > 0 ? 1 : b === 0 ? 0.5 : 0);
  }
  return w / samples.length;
}
// Split 10 cards into two hands when one is over 5: keep the best split for matchups.
function bestSplit(big, small, samples) {
  if (big.length <= 5) return [big, small];
  let best = null;
  for (const keep of combos(big, 5)) {
    const other = small.concat(big.filter(x => !keep.includes(x)));
    const w = matchupWins(keep, other, samples);
    if (!best || w > best.w) best = { w, hands: [keep, other] };
  }
  return best.hands;
}

// ---------- Expert look-ahead ----------
const handMemo = new Map();
function bestMemo(cards) {
  const k = cards.slice().sort().join();
  let b = handMemo.get(k);
  if (!b) { b = G.bestHand(cards); if (handMemo.size > 200000) handMemo.clear(); handMemo.set(k, b); }
  return b;
}
// Final comparison of two kept sets: +1 win, -1 loss, 0 split (same rule as the game's finish)
function finalResult(mine, theirs) {
  if (mine.length < 5 || theirs.length < 5) return 0;
  const a = bestMemo(mine), b = bestMemo(theirs);
  const c = G.cmp(a.score, b.score) || G.cmp(a.leftovers.map(G.rv), b.leftovers.map(G.rv));
  return Math.sign(c);
}
// Play out the remaining picks of one matchup (both sides pick well) and score the result for p.
function searchDraft(s, p, order, avail, tgt) {
  const kept = [s.kept[0].slice(), s.kept[1].slice()];
  // the very last picks of the game can be scored exactly
  const lastOfGame = s.round === 2 && order.length && order[0].m === 2 && kept[0].length + kept[1].length + order.length >= 10;
  const leaf = () => lastOfGame ? finalResult(kept[p], kept[1 - p]) * 10 + (pot(kept[p], tgt) - pot(kept[1 - p], tgt)) * 0.01
    : pot(kept[p], tgt) - pot(kept[1 - p], tgt);
  const go = (i, pool) => {
    if (i >= order.length || !pool.length) return { v: leaf() };
    const who = order[i].seat; let best = null;
    for (const c of pool) {
      kept[who].push(c);
      const r = go(i + 1, pool.filter(x => x !== c));
      kept[who].pop();
      const v = r.v + Math.random() * 1e-9;
      if (!best || (who === p ? v > best.v : v < best.v)) best = { v, card: c };
    }
    return best;
  };
  return go(0, avail);
}

// Choose which cards leave each hand: try every combination, fill the gaps with plausible
// incoming cards, sort any overflow, and count matchups won.
function expertPass(s, p, v, sizes) {
  const o = 1 - p, samples = sampleOpponents(s, p, v, 24);
  const incoming = [0, 0];
  for (const h of [0, 1]) incoming[s.phaseInfo.targets[o][h]] += s.phaseInfo.counts[o][h];
  const optsA = combos(v.myHands[0], sizes[0]), optsB = combos(v.myHands[1], sizes[1]);
  let best = null;
  for (const outA of optsA) for (const outB of optsB) {
    const keepA = v.myHands[0].filter(x => !outA.includes(x)), keepB = v.myHands[1].filter(x => !outB.includes(x));
    let w = 0;
    for (const smp of samples) {
      const inc = smp.rest; // cards this seat can't see, in random order
      const A = keepA.concat(inc.slice(0, incoming[0])), B = keepB.concat(inc.slice(incoming[0], incoming[0] + incoming[1]));
      const [h0, h1] = A.length > 5 ? bestSplit(A, B, [smp]) : B.length > 5 ? bestSplit(B, A, [smp]) : [A, B];
      w += matchupWins(h0.slice(0, 5), h1.slice(0, 5), [smp]);
    }
    w += Math.random() * 1e-6;
    if (!best || w > best.w) best = { w, out: [outA, outB] };
  }
  return best.out;
}

// Plan the rest of this round's draft (every pool is visible): both sides pick well.
// Wide at the top, narrower deeper down, so it stays fast.
function searchRound(s, p, tgt) {
  const order = s.draft.order.slice(s.draft.idx);
  // with the auction, later matchups' pick order isn't settled yet: assume each winner picks first
  if (s.priority) for (let m = s.draft.auctions.length; m < 3; m++) {
    const W = s.showdown.matches[m].winner;
    order.push({ m, seat: W }, { m, seat: 1 - W }, ...(s.spoils ? [{ m, seat: W }] : []));
  }
  const pools = s.showdown.matches.map(mt => mt.pool);
  const taken = new Set(Object.keys(s.draft.taken));
  const kept = [s.kept[0].slice(), s.kept[1].slice()];
  // the game ends with this round's draft when it's round 2 and the whole order is known
  const endsGame = s.round === 2 && order.length && order[order.length - 1].m === 2;
  const leaf = () => endsGame ? finalResult(kept[p], kept[1 - p]) * 10 + (pot(kept[p], tgt) - pot(kept[1 - p], tgt)) * 0.01
    : pot(kept[p], tgt) - pot(kept[1 - p], tgt);
  const widths = [6, 4, 3, 2, 2, 2, 1, 1, 1];
  const go = (i) => {
    if (i >= order.length) return { v: leaf() };
    const { m, seat: who } = order[i];
    let avail = pools[m].filter(c => !taken.has(c));
    if (!avail.length) return go(i + 1);
    const w = widths[Math.min(i, widths.length - 1)];
    if (avail.length > w) {
      // keep the most promising picks for whoever is choosing (their gain plus what it denies)
      const me = kept[who], them = kept[1 - who], b0 = pot(me, tgt), t0 = pot(them, tgt);
      avail = avail.map(c => ({ c, g: pot([...me, c], tgt) - b0 + 0.7 * (pot([...them, c], tgt) - t0) }))
        .sort((x, y) => y.g - x.g).slice(0, w).map(x => x.c);
    }
    let best = null;
    for (const c of avail) {
      kept[who].push(c); taken.add(c);
      const r = go(i + 1);
      kept[who].pop(); taken.delete(c);
      const v = r.v + Math.random() * 1e-9;
      if (!best || (who === p ? v > best.v : v < best.v)) best = { v, card: c };
    }
    return best;
  };
  return go(0).card;
}

const LEVELS = {
  easy: { draft: 1 },
  medium: { draft: 1, pass: 1, choose: 1, bid: 1 },
  hard: { draft: 1, pass: 1, choose: 1, bid: 1, deny: 1, auction: 1, swap: 1 },
  expert: { draft: 1, pass: 1, choose: 1, bid: 1, deny: 1, auction: 1, swap: 1, search: 1 },
};
window.PassPokerBot = { decide, LEVELS };
})();
