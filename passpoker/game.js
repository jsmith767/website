// Pass Poker game engine: pure state + actions. The host (or playtest page) owns
// the full state; each player only ever receives viewFor(state, seat).
(function (root) {
  const RANKS = '23456789TJQKA', SUITS = 'SHDC';
  const HN = ['A', 'B'];
  const CAT = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
  const MATCH_NAMES = ['High hands', 'Low hands', 'Best five of ten'];
  const ALL_BIDS = ['0P', '0X', '1P', '1X', '2P', '2X', '3P', '3X', '4P', '4X'];

  const rv = c => RANKS.indexOf(c[0]) + 2;
  const rn = v => ({ 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[v] || String(v);
  const SUIT_SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const fmt = c => rn(rv(c)) + SUIT_SYM[c[1]];
  const fmtList = cs => cs.map(fmt).join(' ');
  const bidLabel = b => b[0] + (b[1] === 'P' ? '‖' : '✕');
  // ‖ goes straight across to the mirror hand, ✕ crosses the midline to the other one.
  const target = (h, bid) => (bid[1] === 'P' ? h : 1 - h);

  function randInt(n) {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] % n;
    }
    return Math.floor(Math.random() * n);
  }
  function fullDeck() { const d = []; for (const s of SUITS) for (const r of RANKS) d.push(r + s); return d; }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function eval5(cs) {
    const vals = cs.map(rv).sort((a, b) => b - a);
    const flush = cs.every(c => c[1] === cs[0][1]);
    const cnt = {}; vals.forEach(v => (cnt[v] = (cnt[v] || 0) + 1));
    const groups = Object.entries(cnt).map(([v, n]) => [n, +v]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    const g = groups.map(x => x[1]);
    let sh = 0;
    if (groups.length === 5) {
      if (vals[0] - vals[4] === 4) sh = vals[0];
      else if (vals.join() === '14,5,4,3,2') sh = 5;
    }
    if (sh && flush) return [8, sh];
    if (groups[0][0] === 4) return [7, ...g];
    if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...g];
    if (flush) return [5, ...vals];
    if (sh) return [4, sh];
    if (groups[0][0] === 3) return [3, ...g];
    if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...g];
    if (groups[0][0] === 2) return [1, ...g];
    return [0, ...vals];
  }
  function cmp(a, b) { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return Math.sign(d); } return 0; }
  function combos(arr, k, start = 0, cur = [], out = []) {
    if (cur.length === k) { out.push(cur.slice()); return out; }
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]); combos(arr, k, i + 1, cur, out); cur.pop(); }
    return out;
  }
  function best5(cards) {
    let best = null;
    for (const c of combos(cards, 5)) { const sc = eval5(c); if (!best || cmp(sc, best.score) > 0) best = { score: sc, cards: c }; }
    best.name = handName(best.score);
    return best;
  }
  // Best five of six, keeping the highest possible leftover as the tiebreaking 6th card.
  function bestOfSix(cards) {
    let best = null;
    cards.forEach((left, i) => {
      const rest = cards.filter((_, j) => j !== i), sc = eval5(rest);
      const c = best ? cmp(sc, best.score) : 1;
      if (c > 0 || (c === 0 && rv(left) > rv(best.left))) best = { score: sc, cards: rest, left };
    });
    best.name = handName(best.score);
    return best;
  }
  function handName(sc) {
    const [c, a, b] = sc;
    switch (c) {
      case 0: return `High card ${rn(a)}`;
      case 1: return `Pair of ${rn(a)}s`;
      case 2: return `Two pair, ${rn(a)}s and ${rn(b)}s`;
      case 3: return `Three ${rn(a)}s`;
      case 4: return `Straight to ${rn(a)}`;
      case 5: return `Flush, ${rn(a)} high`;
      case 6: return `Full house, ${rn(a)}s over ${rn(b)}s`;
      case 7: return `Four ${rn(a)}s`;
      case 8: return a === 14 ? 'Royal flush' : `Straight flush to ${rn(a)}`;
    }
  }

  // ---------- state ----------
  function newGame(names) {
    const s = { names: names.slice(), round: 0, kept: [[], []], logs: [[], []], rounds: [] };
    startRound(s);
    return s;
  }
  function log(s, p, msg) { s.logs[p].push({ r: s.round, msg }); }
  function logBoth(s, msg) { log(s, 0, msg); log(s, 1, msg); }
  function resetPending(s) { s.pending = { bid: [null, null], pass: [null, null], alloc: [false, false] }; s.allocNeed = [null, null]; }

  function startRound(s) {
    s.round++;
    const kept = new Set([...s.kept[0], ...s.kept[1]]);
    s.deck = shuffle(fullDeck().filter(c => !kept.has(c)));
    s.hands = [0, 1].map(() => [0, 1].map(() => s.deck.splice(0, 5)));
    s.bidsLeft = [ALL_BIDS.slice(), ALL_BIDS.slice()];
    s.phase = 1; s.step = 'bid';
    s.phaseInfo = null; s.lastPhaseInfo = null;
    s.known = [{}, {}];  // known[p][card] = opponent hand index (0/1) or 'either'
    s.showdown = null; s.draft = null; s.final = null; s.ready = [false, false];
    resetPending(s);
    logBoth(s, `Round ${s.round} dealt. Pass 1 of 3: choose your bids.`);
  }

  function err(msg) { return { ok: false, err: msg }; }
  const OK = { ok: true };

  function act(s, a) {
    const p = a.seat, o = 1 - p;
    if (p !== 0 && p !== 1) return err('Unknown seat');
    switch (a.type) {
      case 'bid': {
        if (s.step !== 'bid' || s.pending.bid[p]) return err('Not time to bid');
        const [b0, b1] = a.bids || [];
        const left = s.bidsLeft[p];
        if (!b0 || !b1 || b0 === b1 || !left.includes(b0) || !left.includes(b1)) return err('Pick a different bid card for each hand');
        s.pending.bid[p] = [b0, b1];
        if (s.pending.bid[o]) resolveBids(s);
        return OK;
      }
      case 'pass': {
        if (s.step !== 'pass' || s.pending.pass[p]) return err('Not time to pass');
        const n = s.phaseInfo.n, cs = a.cards || [];
        for (const h of [0, 1]) {
          const x = cs[h];
          if (!Array.isArray(x) || x.length !== n || new Set(x).size !== n || !x.every(c => s.hands[p][h].includes(c)))
            return err(`Choose exactly ${n} card${n > 1 ? 's' : ''} from each hand`);
        }
        s.pending.pass[p] = [cs[0].slice(), cs[1].slice()];
        if (s.pending.pass[o]) resolvePass(s);
        return OK;
      }
      case 'alloc': {
        const h = s.allocNeed[p];
        if (s.step !== 'alloc' || h === null || s.pending.alloc[p]) return err('Nothing to rearrange');
        const keep = a.keep || [];
        if (keep.length !== 5 || new Set(keep).size !== 5 || !keep.every(c => s.hands[p][h].includes(c))) return err('Choose exactly 5 cards to keep');
        const moved = s.hands[p][h].filter(c => !keep.includes(c));
        s.hands[p][h] = keep.slice();
        s.hands[p][1 - h].push(...moved);
        s.pending.alloc[p] = true;
        log(s, p, `You kept ${fmtList(keep)} in your ${HN[h]} and moved ${fmtList(moved)} to your ${HN[1 - h]}.`);
        // The passer can't see which cards stayed, so anything they knew in that hand is now "either".
        const blurred = Object.keys(s.known[o]).filter(c => s.known[o][c] === h);
        blurred.forEach(c => (s.known[o][c] = 'either'));
        log(s, o, `They chose 5 to keep in their ${HN[h]} and moved ${moved.length} to their ${HN[1 - h]}.` +
          (blurred.length ? ` Your ${fmtList(blurred)} could now be in either hand.` : ''));
        if ([0, 1].every(q => s.allocNeed[q] === null || s.pending.alloc[q])) nextPhase(s);
        return OK;
      }
      case 'pick': {
        const d = s.draft;
        if (s.step !== 'draft') return err('Not drafting');
        const turn = d.order[d.idx];
        if (turn.seat !== p) return err('Not your pick');
        if (!s.showdown.matches[turn.m].pool.includes(a.card) || d.taken[a.card] !== undefined) return err(`Pick a card from ${MATCH_NAMES[turn.m]}`);
        d.taken[a.card] = p;
        s.kept[p].push(a.card);
        log(s, p, `You took ${fmt(a.card)} from ${MATCH_NAMES[turn.m]}.`);
        log(s, o, `They took ${fmt(a.card)} from ${MATCH_NAMES[turn.m]}.`);
        d.idx++;
        if (d.idx >= d.order.length) {
          if (s.round === 1) { s.step = 'between'; logBoth(s, 'Round 1 done. Each of you keeps 3 cards.'); }
          else finish(s);
        }
        return OK;
      }
      case 'ready': {
        if (s.step !== 'between') return err('Not between rounds');
        s.ready[p] = true;
        if (s.ready[o]) startRound(s);
        return OK;
      }
      case 'newGame': {
        if (s.step !== 'final') return err('Game still running');
        Object.assign(s, newGame(s.names));
        return OK;
      }
    }
    return err('Unknown action');
  }

  function resolveBids(s) {
    const bids = s.pending.bid;
    [0, 1].forEach(p => (s.bidsLeft[p] = s.bidsLeft[p].filter(b => !bids[p].includes(b))));
    const sum = bids.flat().reduce((t, b) => t + +b[0], 0);
    const n = Math.max(0, Math.ceil(sum / 4 - 0.5)); // nearest whole number, .5 rounds down
    s.phaseInfo = { phase: s.phase, bids: bids.map(x => x.slice()), sum, n };
    [0, 1].forEach(p => {
      const me = bids[p], th = bids[1 - p];
      log(s, p, `Pass ${s.phase} bids: you A ${bidLabel(me[0])}, B ${bidLabel(me[1])}; them A ${bidLabel(th[0])}, B ${bidLabel(th[1])}. ` +
        `Total ${sum} ÷ 4 = ${+(sum / 4).toFixed(2)}, so each hand passes ${n}.`);
    });
    if (n === 0) { logBoth(s, 'Nobody passes this time.'); nextPhase(s); }
    else s.step = 'pass';
  }

  function resolvePass(s) {
    const bids = s.phaseInfo.bids, moves = [];
    for (const p of [0, 1]) for (const h of [0, 1]) {
      const cards = s.pending.pass[p][h];
      s.hands[p][h] = s.hands[p][h].filter(c => !cards.includes(c));
      moves.push({ p, h, t: target(h, bids[p][h]), cards });
    }
    for (const m of moves) {
      s.hands[1 - m.p][m.t].push(...m.cards);
      m.cards.forEach(c => (s.known[m.p][c] = m.t));
      log(s, m.p, `You sent ${fmtList(m.cards)} from your ${HN[m.h]} to their ${HN[m.t]}.`);
      log(s, 1 - m.p, `You got ${fmtList(m.cards)} in your ${HN[m.t]} (from their ${HN[m.h]}).`);
    }
    refreshKnown(s);
    for (const p of [0, 1]) for (const h of [0, 1]) if (s.hands[p][h].length > 5) s.allocNeed[p] = h;
    if (s.allocNeed.some(x => x !== null)) {
      s.step = 'alloc';
      [0, 1].forEach(p => {
        const h = s.allocNeed[p];
        if (h !== null) log(s, p, `Both batches landed in your ${HN[h]}. Choose 5 to keep; the rest go to your ${HN[1 - h]}.`);
      });
    } else nextPhase(s);
  }

  // Forget cards that have come back out of the opponent's hands.
  function refreshKnown(s) {
    for (const p of [0, 1]) {
      const opp = new Set([...s.hands[1 - p][0], ...s.hands[1 - p][1]]);
      for (const c of Object.keys(s.known[p])) if (!opp.has(c)) delete s.known[p][c];
    }
  }

  function nextPhase(s) {
    s.lastPhaseInfo = s.phaseInfo; s.phaseInfo = null;
    resetPending(s);
    if (s.phase < 3) { s.phase++; s.step = 'bid'; logBoth(s, `Pass ${s.phase} of 3: choose your bids.`); }
    else showdown(s);
  }

  function showdown(s) {
    const info = [0, 1].map(p => {
      const ev = s.hands[p].map(eval5);
      const hi = cmp(ev[0], ev[1]) >= 0 ? 0 : 1;
      return { hi, lo: 1 - hi, best: best5([...s.hands[p][0], ...s.hands[p][1]]) };
    });
    const sides = [
      info.map((x, p) => ({ hand: x.hi, cards: s.hands[p][x.hi].slice() })),
      info.map((x, p) => ({ hand: x.lo, cards: s.hands[p][x.lo].slice() })),
      info.map(x => ({ hand: null, cards: x.best.cards.slice() })),
    ];
    const matches = sides.map((side, m) => {
      side.forEach(sd => { sd.score = eval5(sd.cards); sd.name = handName(sd.score); });
      let c = cmp(side[0].score, side[1].score), tie = null;
      if (c === 0) {
        // Flip the top card; add it to both hands. Still tied → coin flip.
        const card = s.deck.shift();
        const tb = side.map(sd => best5([...sd.cards, card]));
        c = cmp(tb[0].score, tb[1].score);
        tie = { card, names: tb.map(x => x.name) };
        if (c === 0) { tie.coin = randInt(2); c = tie.coin === 0 ? 1 : -1; }
      }
      const winner = c > 0 ? 0 : 1;
      return { name: MATCH_NAMES[m], sides: side, winner, tie, pool: [...side[0].cards, ...side[1].cards] };
    });
    s.showdown = { matches };
    s.draft = { order: matches.flatMap((mt, m) => [{ m, seat: mt.winner }, { m, seat: 1 - mt.winner }]), idx: 0, taken: {} };
    s.step = 'draft';
    matches.forEach(mt => {
      const tb = mt.tie ? ` (tied; flipped ${fmt(mt.tie.card)}${mt.tie.coin !== undefined ? ', still tied, coin flip' : ''})` : '';
      [0, 1].forEach(p => log(s, p, `${mt.name}: ${mt.sides[p].name} vs ${mt.sides[1 - p].name}. ${mt.winner === p ? 'You win' : 'They win'}${tb}.`));
    });
    logBoth(s, 'Draft: each matchup’s winner picks first.');
  }

  function finish(s) {
    const res = [0, 1].map(p => bestOfSix(s.kept[p]));
    let c = cmp(res[0].score, res[1].score), by = 'hand';
    if (c === 0) { c = Math.sign(rv(res[0].left) - rv(res[1].left)); by = 'sixth card'; }
    s.final = { res, winner: c > 0 ? 0 : c < 0 ? 1 : null, by };
    s.step = 'final';
    [0, 1].forEach(p => log(s, p, s.final.winner === null ? 'Final: a split.' :
      `Final: ${s.final.winner === p ? 'you win' : 'they win'} (${res[s.final.winner].name}${by === 'sixth card' ? ', on the 6th card' : ''}).`));
  }

  function viewFor(s, seat) {
    const o = 1 - seat, known = [[], [], []];
    for (const c of Object.keys(s.known[seat])) { const v = s.known[seat][c]; known[v === 'either' ? 2 : v].push(c); }
    return JSON.parse(JSON.stringify({
      seat, names: s.names, round: s.round, phase: s.phase, step: s.step,
      myHands: s.hands[seat], oppCounts: s.hands[o].map(h => h.length), known,
      bidsLeft: s.bidsLeft, phaseInfo: s.phaseInfo, lastPhaseInfo: s.lastPhaseInfo,
      myBid: s.pending.bid[seat], oppBidDone: !!s.pending.bid[o],
      myPassDone: !!s.pending.pass[seat], oppPassDone: !!s.pending.pass[o],
      allocNeed: s.allocNeed[seat], allocDone: s.pending.alloc[seat],
      oppAllocWaiting: s.allocNeed[o] !== null && !s.pending.alloc[o],
      showdown: s.showdown, draft: s.draft, kept: s.kept, final: s.final, ready: s.ready,
      log: s.logs[seat],
    }));
  }

  root.PassPoker = { newGame, act, viewFor, eval5, best5, bestOfSix, handName, cmp, fmt, fmtList, bidLabel, target, rv, HN, MATCH_NAMES, ALL_BIDS };
  if (typeof module !== 'undefined') module.exports = root.PassPoker;
})(typeof window !== 'undefined' ? window : globalThis);
