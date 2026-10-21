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
  // Variants: 'even' (every hand passes the average), 'bids' (each player's total is
  // split by their own two bids), 'original' (fixed ✕ ‖ ✕ swaps; the symbol only rounds).
  const VARIANTS = {
    even: 'Even split',
    bids: 'Split by your bids',
    original: 'Original (✕ ‖ ✕ swaps)',
    own: 'Pass your bid',
  };
  const ORIGINAL_DIRS = ['X', 'P', 'X'];
  const bidLabel = (b, variant) => b[0] + (variant === 'original' ? (b[1] === 'P' ? '●' : '▲') : (b[1] === 'P' ? '‖' : '✕'));
  const dirLabel = d => (d === 'P' ? '‖' : '✕');
  // ‖ goes straight across to the mirror hand, ✕ crosses the midline to the other one.
  const target = (h, dir) => (dir[dir.length - 1] === 'P' ? h : 1 - h);
  // Which opponent hand a hand passes to, given the variant and this pass's bid.
  const passTarget = (variant, phase, h, bid) => target(h, variant === 'original' ? ORIGINAL_DIRS[phase - 1] : bid);

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
  // Best five of any number of cards; ties broken by the leftover cards, highest first.
  function bestHand(cards) {
    if (cards.length === 6) { const b = bestOfSix(cards); b.leftovers = [b.left]; return b; }
    let best = null;
    for (const c of combos(cards, 5)) {
      const sc = eval5(c), left = cards.filter(x => !c.includes(x)).sort((a, b) => rv(b) - rv(a));
      const d = best ? cmp(sc, best.score) || cmp(left.map(rv), best.leftovers.map(rv)) : 1;
      if (d > 0) best = { score: sc, cards: c, leftovers: left, left: left[0] };
    }
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
  function newGame(names, variant, opts = {}) {
    const s = { names: names.slice(), variant: VARIANTS[variant] ? variant : 'even', spoils: !!opts.spoils, priority: ['low', 'high'].includes(opts.priority) ? opts.priority : null, offer: ['same', 'other'].includes(opts.offer) ? opts.offer : opts.offer ? 'same' : null, swap: !!opts.swap, round: 0, kept: [[], []], logs: [[], []], rounds: [] };
    startRound(s);
    return s;
  }
  function log(s, p, msg) { s.logs[p].push({ r: s.round, msg }); }
  function logBoth(s, msg) { log(s, 0, msg); log(s, 1, msg); }
  function resetPending(s) { s.pending = { bid: [null, null], pass: [null, null], alloc: [false, false], prio: [null, null], choose: [null, null], swap: [null, null], discard: [null, null] }; s.allocNeed = [null, null]; }

  function startRound(s) {
    s.round++;
    const kept = new Set([...s.kept[0], ...s.kept[1]]);
    s.deck = shuffle(fullDeck().filter(c => !kept.has(c)));
    s.hands = [0, 1].map(() => [0, 1].map(() => s.deck.splice(0, 5)));
    s.bidsLeft = [ALL_BIDS.slice(), ALL_BIDS.slice()];
    s.phase = 1; s.step = 'bid';
    s.phaseInfo = null; s.lastPhaseInfo = null;
    s.known = [{}, {}];  // known[p][card] = opponent hand index (0/1) or 'either'
    s.showdown = null; s.draft = null; s.final = null; s.ready = [false, false]; s.swapPhase = null; s.discards = []; s.discardNeed = [[0, 0], [0, 0]];
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
        const cs = a.cards || [];
        for (const h of [0, 1]) {
          const x = cs[h], n = offerSize(s, p, h);
          if (!Array.isArray(x) || x.length !== n || new Set(x).size !== n || !x.every(c => s.hands[p][h].includes(c)))
            return err(`Choose ${n} card${n === 1 ? '' : 's'} from your ${HN[h]}`);
        }
        s.pending.pass[p] = [cs[0].slice(), cs[1].slice()];
        if (s.pending.pass[o]) resolvePass(s);
        return OK;
      }
      case 'discard': {
        if (s.step !== 'discard' || s.pending.discard[p]) return err('Nothing to discard');
        const cs = a.cards || [];
        for (const h of [0, 1]) {
          const k = s.discardNeed[p][h], x = cs[h] || [];
          if (x.length !== k || new Set(x).size !== k || !x.every(c => s.hands[p][h].includes(c))) return err(`Discard ${k} from your ${HN[h]}`);
        }
        s.pending.discard[p] = [(cs[0] || []).slice(), (cs[1] || []).slice()];
        if (s.pending.discard[o]) {
          for (const q of [0, 1]) {
            const d = s.pending.discard[q];
            if (d === true) continue;
            for (const h of [0, 1]) if (d[h].length) {
              s.hands[q][h] = s.hands[q][h].filter(c => !d[h].includes(c));
              s.discards.push(...d[h]);
              log(s, q, `You discarded ${fmtList(d[h])} from your ${HN[h]} (face up).`);
              log(s, 1 - q, `They discarded ${fmtList(d[h])} from their ${HN[h]} (face up).`);
            }
          }
          refreshKnown(s);
          nextPhase(s);
        }
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
        if (d.idx >= d.order.length && s.priority && d.auctions.length < 3) startAuction(s);
        else if (d.idx >= d.order.length) {
          if (s.round === 1) { s.step = 'between'; [0, 1].forEach(q => log(s, q, `Round 1 done. You keep ${s.kept[q].length} cards; they keep ${s.kept[1 - q].length}.`)); }
          else finish(s);
        }
        return OK;
      }
      case 'choose': {
        if (s.step !== 'choose' || s.pending.choose[p]) return err('Nothing to send back');
        const ret = a.returns || [];
        for (const m of s.offers.filter(m => m.p === o && m.extra)) {
          if (!m.cards.includes(ret[m.h])) return err(`Choose one card to send back to their ${HN[m.h]}`);
        }
        s.pending.choose[p] = [ret[0] || null, ret[1] || null];
        if ([0, 1].every(q => s.pending.choose[q] || !s.offers.some(m => m.p === 1 - q && m.extra))) applyOffers(s);
        return OK;
      }
      case 'swap': {
        if (s.step !== 'swap' || s.pending.swap[p]) return err('Not time to swap');
        if (a.skip) { s.pending.swap[p] = { skip: true }; }
        else {
          const [ca, cb] = a.cards || [], pay = a.pay || [], need = a.secret ? 2 : 1;
          if (!s.hands[p][0].includes(ca) || !s.hands[p][1].includes(cb)) return err('Pick one card from each of your hands');
          if (pay.length !== need || new Set(pay).size !== need || !pay.every(b => s.bidsLeft[p].includes(b))) return err(`Pick ${need} bid card${need > 1 ? 's' : ''} to spend`);
          if (s.bidsLeft[p].length - need < 2 * (3 - s.phase)) return err('You need to keep enough bid cards for the passes left');
          s.pending.swap[p] = { cards: [ca, cb], pay: pay.slice(), secret: !!a.secret };
        }
        if (s.pending.swap[o]) resolveSwaps(s);
        return OK;
      }
      case 'prio': {
        if (s.step !== 'prio' || s.pending.prio[p]) return err('Not time to play a bid card');
        if (!s.bidsLeft[p].includes(a.card)) return err('Play one of your leftover bid cards');
        s.pending.prio[p] = a.card;
        if (s.pending.prio[o]) resolveAuction(s);
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
        Object.assign(s, newGame(s.names, s.variant, { spoils: s.spoils, priority: s.priority, offer: s.offer, swap: s.swap }));
        return OK;
      }
    }
    return err('Unknown action');
  }

  function resolveBids(s) {
    const bids = s.pending.bid, v = s.variant, num = b => +b[0];
    [0, 1].forEach(p => (s.bidsLeft[p] = s.bidsLeft[p].filter(b => !bids[p].includes(b))));
    const sum = bids.flat().reduce((t, b) => t + num(b), 0);
    const targets = [0, 1].map(p => [0, 1].map(h => passTarget(v, s.phase, h, bids[p][h])));
    let counts, summary;
    if (v === 'even') {
      const n = Math.max(0, Math.ceil(sum / 4 - 0.5)); // nearest whole number, .5 rounds down
      counts = [[n, n], [n, n]];
      summary = `Total ${sum} ÷ 4 = ${+(sum / 4).toFixed(2)}, so each hand passes ${n}.`;
    } else if (v === 'own') {
      // each hand passes exactly its own bid; overflow is discarded face up, shortfall drawn from the deck
      counts = [0, 1].map(p => [0, 1].map(h => num(bids[p][h])));
      summary = 'Each hand passes its own bid.';
    } else if (v === 'bids') {
      const total = Math.floor(sum / 2);
      counts = [0, 1].map(p => splitByBids(total, bids[p]));
      summary = `Total ${sum} ÷ 2 = ${+(sum / 2).toFixed(1)}, so each player passes ${total}.`;
    } else {
      // Each of my hands swaps with one of theirs; the pair passes the average of its two bids.
      // A .5 rounds down if the two cards share a symbol, up if they differ.
      counts = [[0, 0], [0, 0]];
      const parts = [];
      for (const h of [0, 1]) {
        const t = targets[0][h], b0 = bids[0][h], b1 = bids[1][t];
        const avg = (num(b0) + num(b1)) / 2;
        const n = avg % 1 ? (b0[1] === b1[1] ? Math.floor(avg) : Math.ceil(avg)) : avg;
        counts[0][h] = n; counts[1][t] = n;
        parts.push([h, t, b0, b1, avg, n]);
      }
      s.swapParts = parts;
    }
    s.phaseInfo = { phase: s.phase, bids: bids.map(x => x.slice()), sum, counts, targets };
    [0, 1].forEach(p => {
      const me = bids[p], th = bids[1 - p], L = b => bidLabel(b, v);
      let line = `Pass ${s.phase} bids: you A ${L(me[0])}, B ${L(me[1])}; them A ${L(th[0])}, B ${L(th[1])}. `;
      if (v === 'original') {
        line += `Direction ${dirLabel(ORIGINAL_DIRS[s.phase - 1])}. ` + s.swapParts.map(([h, t, b0, b1, avg, n]) => {
          const [mh, th2, mb, tb] = p === 0 ? [h, t, b0, b1] : [t, h, b1, b0];
          return `Your ${HN[mh]} ↔ their ${HN[th2]}: (${num(mb)}+${num(tb)})÷2 = ${avg}` +
            (avg % 1 ? ` → ${mb[1] === tb[1] ? 'same symbol, down' : 'different symbols, up'}` : '') + ` = ${n} each way`;
        }).join('; ') + '.';
      } else {
        line += summary + (v === 'bids' || v === 'own' ? ` You pass ${counts[p][0]} from A and ${counts[p][1]} from B; they pass ${counts[1 - p][0]} from A and ${counts[1 - p][1]} from B.` : '');
      }
      log(s, p, line);
    });
    if (counts.flat().every(n => n === 0)) { logBoth(s, 'Nobody passes this time.'); nextPhase(s); }
    else s.step = 'pass';
  }

  // Split a player's total between their hands in proportion to their two bids.
  // Exact halves: the higher bid passes the extra; equal bids → the ✕ hand. Max 5 per hand.
  function splitByBids(total, bids) {
    const a = +bids[0][0], b = +bids[1][0];
    const share = a + b ? total * a / (a + b) : total / 2;
    let x;
    if (share % 1 === 0.5) {
      const extraToA = a !== b ? a > b : bids[0][1] === 'X';
      x = extraToA ? Math.ceil(share) : Math.floor(share);
    } else x = Math.round(share);
    x = Math.min(5, Math.max(total - 5, x));
    return [x, total - x];
  }

  // Offer-one-extra: on the 3rd pass each passing hand offers n+1 and the receiver sends one back.
  function offerSize(s, p, h) {
    const n = s.phaseInfo.counts[p][h];
    return s.offer && s.phase === 3 && n >= 1 && n + 1 <= s.hands[p][h].length ? n + 1 : n;
  }

  function resolvePass(s) {
    const moves = [];
    for (const p of [0, 1]) for (const h of [0, 1]) {
      const cards = s.pending.pass[p][h];
      if (!cards.length) continue;
      s.hands[p][h] = s.hands[p][h].filter(c => !cards.includes(c));
      moves.push({ p, h, t: s.phaseInfo.targets[p][h], cards, extra: cards.length > s.phaseInfo.counts[p][h] });
    }
    if (moves.some(m => m.extra)) {
      s.offers = moves;
      s.pending.choose = [null, null];
      s.step = 'choose';
      moves.filter(m => m.extra).forEach(m => {
        log(s, m.p, `You offered ${fmtList(m.cards)} from your ${HN[m.h]} to their ${HN[m.t]}; they’ll send one back.`);
        log(s, 1 - m.p, `They offered ${fmtList(m.cards)} from their ${HN[m.h]} to your ${HN[m.t]}. Choose one to send back.`);
      });
      return;
    }
    finishMoves(s, moves);
  }

  function applyOffers(s) {
    const moves = s.offers;
    for (const m of moves) {
      if (!m.extra) continue;
      // 'other': the rejected card lands in the passer's other hand, a sneaky way to move a card across.
      const back = s.pending.choose[1 - m.p][m.h], dest = s.offer === 'other' ? 1 - m.h : m.h;
      m.cards = m.cards.filter(c => c !== back);
      s.hands[m.p][dest].push(back);
      s.known[1 - m.p][back] = dest; // the receiver knows where their rejected card went
      log(s, m.p, `They sent back ${fmt(back)}; it goes to your ${HN[dest]}.`);
      log(s, 1 - m.p, `You sent back ${fmt(back)}; it’s in their ${HN[dest]}.`);
    }
    s.offers = null;
    finishMoves(s, moves);
  }

  function finishMoves(s, moves) {
    for (const m of moves) {
      s.hands[1 - m.p][m.t].push(...m.cards);
      m.cards.forEach(c => (s.known[m.p][c] = m.t));
      log(s, m.p, `You${m.extra ? ' passed' : ' sent'} ${fmtList(m.cards)} from your ${HN[m.h]} to their ${HN[m.t]}.`);
      log(s, 1 - m.p, `You got ${fmtList(m.cards)} in your ${HN[m.t]} (from their ${HN[m.h]}).`);
    }
    refreshKnown(s);
    if (s.variant === 'own') return settleOwn(s);
    for (const p of [0, 1]) for (const h of [0, 1]) if (s.hands[p][h].length > 5) s.allocNeed[p] = h;
    if (s.allocNeed.some(x => x !== null)) {
      s.step = 'alloc';
      [0, 1].forEach(p => {
        const h = s.allocNeed[p];
        if (h !== null) log(s, p, `Your ${HN[h]} has ${s.hands[p][h].length} cards. Choose 5 to keep; the rest go to your ${HN[1 - h]}.`);
      });
    } else nextPhase(s);
  }

  // Pass your bid: short hands draw from the deck (face down); long hands discard down to 5 (face up).
  function settleOwn(s) {
    s.discardNeed = [[0, 0], [0, 0]];
    for (const p of [0, 1]) for (const h of [0, 1]) {
      const n = s.hands[p][h].length;
      if (n < 5) {
        s.hands[p][h].push(...s.deck.splice(0, 5 - n));
        log(s, p, `Your ${HN[h]} drew ${5 - n} from the deck.`);
        log(s, 1 - p, `Their ${HN[h]} drew ${5 - n} from the deck.`);
      } else if (n > 5) s.discardNeed[p][h] = n - 5;
    }
    if (s.discardNeed.flat().some(x => x)) {
      s.step = 'discard';
      s.pending.discard = [0, 1].map(p => s.discardNeed[p].some(x => x) ? null : true);
      [0, 1].forEach(p => s.discardNeed[p].forEach((k, h) => { if (k) log(s, p, `Your ${HN[h]} has ${5 + k} cards. Discard ${k} face up.`); }));
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
    if (s.swap && s.phase < 3 && s.swapPhase !== s.phase) {
      s.swapPhase = s.phase; s.step = 'swap';
      logBoth(s, 'Swap: you may swap one card between your own hands (1 bid card open, 2 to keep it secret).');
      return;
    }
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
    // Spoils: the winner of each matchup picks first and third (takes two), the loser picks once.
    if (s.priority) {
      // Each matchup's pick order is settled by a sealed leftover-bid-card auction just before its draft.
      s.draft = { order: [], idx: 0, taken: {}, auctions: [] };
      startAuction(s);
    } else {
      s.draft = { order: matches.flatMap((mt, m) => [{ m, seat: mt.winner }, { m, seat: 1 - mt.winner }].concat(s.spoils ? [{ m, seat: mt.winner }] : [])), idx: 0, taken: {} };
      s.step = 'draft';
    }
    matches.forEach(mt => {
      const tb = mt.tie ? ` (tied; flipped ${fmt(mt.tie.card)}${mt.tie.coin !== undefined ? ', still tied, coin flip' : ''})` : '';
      [0, 1].forEach(p => log(s, p, `${mt.name}: ${mt.sides[p].name} vs ${mt.sides[1 - p].name}. ${mt.winner === p ? 'You win' : 'They win'}${tb}.`));
    });
    logBoth(s, s.priority ? `Draft: before each matchup, both play a leftover bid card; the ${s.priority}er number picks first${s.spoils ? ' and the matchup winner takes two' : ''}.`
      : s.spoils ? 'Draft: each matchup’s winner picks first and third.' : 'Draft: each matchup’s winner picks first.');
  }

  function resolveSwaps(s) {
    for (const p of [0, 1]) {
      const sw = s.pending.swap[p], o = 1 - p;
      if (sw.skip) { log(s, p, 'You didn’t swap.'); log(s, o, 'They didn’t swap.'); continue; }
      const [ca, cb] = sw.cards;
      s.hands[p][0] = s.hands[p][0].filter(c => c !== ca).concat(cb);
      s.hands[p][1] = s.hands[p][1].filter(c => c !== cb).concat(ca);
      s.bidsLeft[p] = s.bidsLeft[p].filter(b => !sw.pay.includes(b));
      const paid = sw.pay.map(b => bidLabel(b, s.variant)).join(' ');
      log(s, p, `You swapped ${fmt(ca)} (A → B) and ${fmt(cb)} (B → A)${sw.secret ? ' in secret' : ' openly'}, spending ${paid}.`);
      if (sw.secret) {
        // they know a swap happened, so anything they knew about in your hands could have moved
        for (const c of Object.keys(s.known[o])) s.known[o][c] = 'either';
        log(s, o, `They swapped a card between their hands in secret, spending ${paid}.`);
      } else {
        s.known[o][ca] = 1; s.known[o][cb] = 0;
        log(s, o, `They openly swapped ${fmt(ca)} into their B and ${fmt(cb)} into their A, spending ${paid}.`);
      }
    }
    nextPhase(s);
  }

  function startAuction(s) {
    s.step = 'prio';
    s.pending.prio = [null, null];
    if (!s.bidsLeft[0].length || !s.bidsLeft[1].length) resolveAuction(s); // someone has nothing left to play
  }

  // Lower (or higher) leftover bid card picks first; ties go to the matchup winner.
  // With spoils the matchup winner still takes two cards.
  function resolveAuction(s) {
    const d = s.draft, m = d.auctions.length, mt = s.showdown.matches[m], cards = s.pending.prio.slice();
    [0, 1].forEach(p => { if (cards[p]) s.bidsLeft[p] = s.bidsLeft[p].filter(b => b !== cards[p]); });
    let first = mt.winner;
    const has = [0, 1].map(p => s.bidsLeft[p].length > 0 || !!cards[p]);
    if (has[0] !== has[1]) first = has[0] ? 0 : 1; // only one player has a card left: they pick first for free
    else if (cards[0] && cards[1] && cards[0][0] !== cards[1][0]) {
      const zeroLower = +cards[0][0] < +cards[1][0];
      first = (s.priority === 'low') === zeroLower ? 0 : 1;
    }
    d.auctions.push({ m, cards, first });
    const second = 1 - first;
    d.order.push({ m, seat: first }, { m, seat: second });
    if (s.spoils) d.order.push({ m, seat: mt.winner });
    s.pending.prio = [null, null];
    s.step = 'draft';
    [0, 1].forEach(p => log(s, p, `${mt.name} auction: you played ${cards[p] ? bidLabel(cards[p], s.variant) : 'nothing'}, they played ${cards[1 - p] ? bidLabel(cards[1 - p], s.variant) : 'nothing'}. ${first === p ? 'You pick' : 'They pick'} first.`));
  }

  function finish(s) {
    const res = [0, 1].map(p => bestHand(s.kept[p]));
    let c = cmp(res[0].score, res[1].score), by = 'hand';
    if (c === 0) { c = cmp(res[0].leftovers.map(rv), res[1].leftovers.map(rv)); by = 'sixth card'; }
    s.final = { res, winner: c > 0 ? 0 : c < 0 ? 1 : null, by };
    s.step = 'final';
    [0, 1].forEach(p => log(s, p, s.final.winner === null ? 'Final: a split.' :
      `Final: ${s.final.winner === p ? 'you win' : 'they win'} (${res[s.final.winner].name}${by === 'sixth card' ? (s.spoils ? ', on the leftover cards' : ', on the 6th card') : ''}).`));
  }

  function viewFor(s, seat) {
    const o = 1 - seat, known = [[], [], []];
    for (const c of Object.keys(s.known[seat])) { const v = s.known[seat][c]; known[v === 'either' ? 2 : v].push(c); }
    return JSON.parse(JSON.stringify({
      seat, names: s.names, variant: s.variant, spoils: s.spoils, priority: s.priority,
      discards: s.discards || [], discardNeed: s.discardNeed ? s.discardNeed[seat] : [0, 0],
      myDiscardDone: !!s.pending.discard[seat], oppDiscardDone: !!s.pending.discard[o],
      swap: s.swap, mySwapDone: !!s.pending.swap[seat], oppSwapDone: !!s.pending.swap[o],
      swapBudget: s.step === 'swap' ? s.bidsLeft[seat].length - 2 * (3 - s.phase) : 0,
      myPrio: s.pending.prio[seat], oppPrioDone: !!s.pending.prio[o], offer: s.offer,
      passSizes: s.step === 'pass' ? [0, 1].map(h => offerSize(s, seat, h)) : null,
      offersIn: s.step === 'choose' ? s.offers.filter(m => m.p === o && m.extra) : [],
      offersOut: s.step === 'choose' ? s.offers.filter(m => m.p === seat && m.extra) : [],
      myChooseDone: !!s.pending.choose[seat] || (s.step === 'choose' && !s.offers.some(m => m.p === o && m.extra)),
      oppChooseDone: !!s.pending.choose[o] || (s.step === 'choose' && !s.offers.some(m => m.p === seat && m.extra)),
      dir: s.variant === 'original' ? ORIGINAL_DIRS[s.phase - 1] : null, round: s.round, phase: s.phase, step: s.step,
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

  root.PassPoker = { newGame, act, viewFor, eval5, best5, bestOfSix, bestHand, handName, cmp, fmt, fmtList, bidLabel, dirLabel, target, passTarget, VARIANTS, ORIGINAL_DIRS, splitByBids, offerSize, rv, HN, MATCH_NAMES, ALL_BIDS };
  if (typeof module !== 'undefined') module.exports = root.PassPoker;
})(typeof window !== 'undefined' ? window : globalThis);
