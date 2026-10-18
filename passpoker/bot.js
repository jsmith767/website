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
  if (n >= 5) { const b = G.bestHand(cards); return b.score[0] + (b.score[1] || 0) / 15; }
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
    const [A, B] = v.myHands, base = pctScore(G.eval5(A)) + pctScore(G.eval5(B));
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
    const imps = [0, 1, 2].filter(m => m >= cur).map(imp);
    const card = imps[0] >= Math.max(...imps) ? sorted[0] : sorted[sorted.length - 1];
    return { type: 'prio', card };
  }
  if (s.step === 'between' && !s.ready[p]) return { type: 'ready' };
  return null;
}
const LEVELS = {
  easy: { draft: 1 },
  medium: { draft: 1, pass: 1, choose: 1, bid: 1 },
  hard: { draft: 1, pass: 1, choose: 1, bid: 1, deny: 1, auction: 1, swap: 1 },
};
window.PassPokerBot = { decide, LEVELS };
})();
