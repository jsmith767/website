// Pass Poker UI + networking. Modes: 'playtest' (both seats on one screen),
// 'host' (owns the state, seat 0) and 'guest' (seat 1, receives views over PeerJS).
(function () {
  const G = window.PassPoker;
  const { HN, fmt, MATCH_NAMES, VARIANTS } = G;
  let curVariant = 'even';
  const bidLabel = b => G.bidLabel(b, curVariant);
  const $ = s => document.querySelector(s);
  const PREFIX = 'passpoker-v1-';
  const HOST_KEY = 'passpoker-host', NAME_KEY = 'passpoker-name';

  let mode = null, state = null, guestView = null;
  let peer = null, conn = null, room = null, myName = '';
  const freshUI = () => ({ bid: [null, null], pass: [[], []], keep: [], prio: null, ret: [null, null], disc: [[], []], sw: { c: [null, null], secret: false, pay: [] } });
  const ui = [freshUI(), freshUI()], uiKey = ['', ''];

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.style.display = 'block';
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = 'none'), 2600);
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // ---------- card bits ----------
  function cardHTML(c, o = {}) {
    const red = c[1] === 'H' || c[1] === 'D';
    const label = fmt(c), rank = label.slice(0, -1), suit = label.slice(-1);
    const cls = ['card', red && 'red', o.sel && 'sel', o.cls].filter(Boolean).join(' ');
    const attrs = o.act ? `data-act="${o.act}" data-c="${c}"${o.h != null ? ` data-h="${o.h}"` : ''}` : 'disabled';
    return `<button class="${cls}" ${attrs} title="${label}">${rank}<span>${suit}</span>${o.tag ? `<i>${esc(o.tag)}</i>` : ''}</button>`;
  }
  const backHTML = () => '<div class="card back"></div>';
  const bidChip = (b, o = {}) => `<button class="bid ${o.cls || ''}" ${o.act ? `data-act="${o.act}" data-b="${b}" data-h="${o.h}"` : 'disabled'}>${bidLabel(b)}</button>`;

  // ---------- one player's screen ----------
  function seatHTML(v) {
    const me = v.seat, op = 1 - me, opName = esc(v.names[op]);
    const key = `${v.round}.${v.phase}.${v.step}`;
    if (uiKey[me] !== key) { uiKey[me] = key; ui[me] = freshUI(); }
    const u = ui[me];
    curVariant = v.variant;
    const pi = v.phaseInfo;
    const cnt = pi ? pi.counts[me] : [0, 0];
    const sizes = v.passSizes || cnt; // with offer-one-extra, the 3rd pass sends one more than the count
    const xtra = hh => sizes[hh] > cnt[hh] ? ' (one extra they’ll send back)' : '';
    // Where my hand hh would send cards with bid b (in 'original' the pass number sets direction).
    const tgt = (hh, b) => G.passTarget(v.variant, v.phase, hh, b || '0P');
    const playing = ['bid', 'pass', 'alloc', 'choose', 'swap', 'discard'].includes(v.step);

    // status line
    let status = '', waiting = false;
    if (v.step === 'bid') {
      if (v.myBid) { status = `Waiting for ${opName} to choose bids…`; waiting = true; }
      else status = `Pass ${v.phase} of 3${v.dir ? ` (${G.dirLabel(v.dir)})` : ''}: choose a bid card for each hand.` + (v.oppBidDone ? ` (${opName} is ready)` : '');
    } else if (v.step === 'pass') {
      if (v.myPassDone) { status = `Waiting for ${opName} to choose cards to pass…`; waiting = true; }
      else status = `Choose ${sizes[0]} from your A and ${sizes[1]} from your B to pass${sizes.some((x, i) => x > cnt[i]) ? ', including one extra per hand that they’ll send one back from' : ''}.` + (v.oppPassDone ? ` (${opName} is ready)` : '');
    } else if (v.step === 'discard') {
      if (!v.myDiscardDone) status = 'Discard down to 5 in ' + [0, 1].filter(hh => v.discardNeed[hh]).map(hh => `your ${HN[hh]} (${v.discardNeed[hh]})`).join(' and ') + '. Discards are face up.' + (v.oppDiscardDone ? ` (${opName} is ready)` : '');
      else { status = `Waiting for ${opName} to discard…`; waiting = true; }
    } else if (v.step === 'swap') {
      if (v.mySwapDone) { status = `Waiting for ${opName} to decide on a swap…`; waiting = true; }
      else status = 'Optional swap: trade one card between your hands. Open costs 1 bid card; secret costs 2.' + (v.oppSwapDone ? ` (${opName} is ready)` : '');
    } else if (v.step === 'choose') {
      const dest = v.offer === 'other' ? 'their other hand' : 'the hand it came from';
      if (!v.myChooseDone) status = `Choose one card from each offer to send back. It goes to ${dest}.` + (v.oppChooseDone ? ` (${opName} is ready)` : '');
      else { status = `Waiting for ${opName} to choose which card to send back…`; waiting = true; }
    } else if (v.step === 'alloc') {
      if (v.allocNeed !== null && !v.allocDone) status = `Your ${HN[v.allocNeed]} has ${v.myHands[v.allocNeed].length} cards. Choose the 5 to keep there; the rest go to your ${HN[1 - v.allocNeed]}.`;
      else { status = `Waiting for ${opName} to rearrange their hands…`; waiting = true; }
    } else if (v.step === 'prio') {
      const m = v.draft.auctions.length;
      if (v.myPrio) { status = `Waiting for ${opName} to play a bid card for ${MATCH_NAMES[m]}…`; waiting = true; }
      else status = `${MATCH_NAMES[m]}: play a leftover bid card. The ${v.priority}er number picks first; a tie goes to the matchup winner.` + (v.oppPrioDone ? ` (${opName} is ready)` : '');
    } else if (v.step === 'draft') {
      const t = v.draft.order[v.draft.idx], total = 3 * (v.spoils ? 3 : 2);
      if (t.seat === me) status = `Your pick (${v.draft.idx + 1} of ${total}): take a card from ${MATCH_NAMES[t.m]}.`;
      else { status = `${opName} is picking from ${MATCH_NAMES[t.m]}…`; waiting = true; }
    } else if (v.step === 'between') {
      if (v.ready[me]) { status = `Waiting for ${opName} to start round 2…`; waiting = true; }
      else status = 'Round 1 is done. Start round 2 when you’re ready.';
    } else if (v.step === 'final') {
      const f = v.final;
      status = f.winner === null ? 'It’s a split!' : f.winner === me ? 'You win the game!' : `${opName} wins the game.`;
    }

    let h = `<div class="status ${waiting ? 'wait' : ''}">Round ${v.round} of 2 · ${status}</div>`;
    if (v.variant === 'own') h += discardPileHTML(v);
    h += `<div class="info muted">Version: ${v.spoils ? (v.variant === 'even' ? 'Spoils (even split, winner takes two)' : `${esc(VARIANTS[v.variant])}, winner takes two`) : esc(VARIANTS[v.variant])}${v.offer ? ` + offer one extra (${v.offer === 'other' ? 'to the other hand' : 'back to the same hand'})` : ''}${v.priority ? ` + first-pick auction (${v.priority}er wins)` : ''}${v.swap ? ' + swaps' : ''}</div>`;

    // opponent row
    h += `<div class="info"><b>${opName}</b><span>Bid cards left: ${v.bidsLeft[op].map(b => bidChip(b, { cls: 'small' })).join(' ') || 'none'}</span>` +
      (v.kept[op].length ? `<span>Kept: ${v.kept[op].map(c => cardHTML(c)).join(' ')}</span>` : '') + '</div>';
    if (playing) {
      h += '<div class="hands">' + [0, 1].map(hh => {
        const known = v.known[hh], unknown = Math.max(0, v.oppCounts[hh] - known.length);
        let note = '';
        if (pi) note = `Their bid <b>${bidLabel(pi.bids[op][hh])}</b> → passes ${pi.counts[op][hh]} to your ${HN[pi.targets[op][hh]]}`;
        return `<div class="hand opp"><div class="lab"><b>Their ${HN[hh]}</b><span class="muted">${v.oppCounts[hh]} card${v.oppCounts[hh] === 1 ? "" : "s"}</span></div>
          <div class="cards">${known.map(c => cardHTML(c, { cls: 'known', tag: 'yours' })).join('')}${backHTML().repeat(unknown)}</div>
          ${note ? `<div class="note">${note}</div>` : ''}</div>`;
      }).join('') + '</div>';
      if (v.known[2].length) h += `<div class="hand opp"><div class="lab"><b>Yours, somewhere in their hands</b><span class="muted">they sorted an overflow</span></div><div class="cards">${v.known[2].map(c => cardHTML(c, { cls: 'known' })).join('')}</div></div>`;
      if (pi) h += `<div class="info muted"><span>${passSummary(pi, me, v.variant)}</span></div>`;
      else if (v.lastPhaseInfo) {
        const lp = v.lastPhaseInfo;
        h += `<div class="info muted">Last pass: you ${lp.bids[me].map(bidLabel).join(' / ')} passed ${lp.counts[me].join(' / ')}; them ${lp.bids[op].map(bidLabel).join(' / ')} passed ${lp.counts[op].join(' / ')}</div>`;
      }


      // offers waiting on a send-back choice
      if (v.step === 'choose') {
        const destOf = m => v.offer === 'other' ? 1 - m.h : m.h;
        h += v.offersIn.map(m => `<div class="hand"><div class="lab"><b>Offer from their ${HN[m.h]} → your ${HN[m.t]}</b><span class="muted">keep ${m.cards.length - 1}, send 1 back to their ${HN[destOf(m)]}</span></div>
          <div class="cards">${m.cards.map(c => cardHTML(c, v.myChooseDone ? {} : { act: 'retpick', h: m.h, sel: u.ret[m.h] === c, tag: u.ret[m.h] === c ? 'back' : '' })).join('')}</div></div>`).join('');
        h += v.offersOut.map(m => `<div class="note">You offered ${m.cards.map(fmt).join(' ')} from your ${HN[m.h]}; they’ll send one back to your ${HN[destOf(m)]}.</div>`).join('');
      }

      // my hands
      h += '<div class="hands">' + [0, 1].map(hh => {
        const cards = v.myHands[hh];
        const evName = cards.length === 5 ? G.handName(G.eval5(cards)) : `${cards.length} card${cards.length === 1 ? "" : "s"}`;
        let cardsHTML, extra = '';
        if (v.step === 'pass' && !v.myPassDone) {
          cardsHTML = cards.map(c => cardHTML(c, { act: 'passcard', h: hh, sel: u.pass[hh].includes(c) })).join('');
          extra = `<div class="note">Your bid <b>${bidLabel(pi.bids[me][hh])}</b> → their ${HN[pi.targets[me][hh]]} · selected ${u.pass[hh].length}/${sizes[hh]}${xtra(hh)}</div>`;
        } else if (v.step === 'discard' && !v.myDiscardDone && v.discardNeed[hh]) {
          cardsHTML = cards.map(c => cardHTML(c, { act: 'discardcard', h: hh, sel: u.disc[hh].includes(c), tag: u.disc[hh].includes(c) ? 'discard' : '' })).join('');
          extra = `<div class="note">Discard ${v.discardNeed[hh]} · selected ${u.disc[hh].length}/${v.discardNeed[hh]}</div>`;
        } else if (v.step === 'swap' && !v.mySwapDone && v.swapBudget >= 1) {
          cardsHTML = cards.map(c => cardHTML(c, { act: 'swapcard', h: hh, sel: u.sw.c[hh] === c, tag: u.sw.c[hh] === c ? `→ ${HN[1 - hh]}` : '' })).join('');
          extra = `<div class="note">${u.sw.c[hh] ? `${fmt(u.sw.c[hh])} moves to your ${HN[1 - hh]}` : `Pick a card to move to your ${HN[1 - hh]}`}</div>`;
        } else if (v.step === 'alloc' && v.allocNeed === hh && !v.allocDone) {
          cardsHTML = cards.map(c => cardHTML(c, { act: 'keepcard', h: hh, sel: u.keep.includes(c) })).join('');
          extra = `<div class="note">Keeping ${u.keep.length}/5</div>`;
        } else {
          cardsHTML = cards.map(c => cardHTML(c)).join('');
          if (pi) extra = `<div class="note">Your bid <b>${bidLabel(pi.bids[me][hh])}</b> → passes ${cnt[hh]} to their ${HN[pi.targets[me][hh]]}</div>`;
        }
        if (v.step === 'bid' && !v.myBid) {
          extra = `<div class="bids">${v.bidsLeft[me].map(b => bidChip(b, { act: 'bidpick', h: hh, cls: u.bid[hh] === b ? 'sel' : u.bid[1 - hh] === b ? 'other' : '' })).join('')}</div>` +
            (u.bid[hh] ? `<div class="note">${bidLabel(u.bid[hh])} → passes to their ${HN[tgt(hh, u.bid[hh])]}</div>` : `<div class="note">Pick a bid card for this hand${v.dir ? ` (goes to their ${HN[tgt(hh)]})` : ''}</div>`);
        } else if (v.step === 'bid' && v.myBid) {
          extra = `<div class="note">Locked: <b>${bidLabel(v.myBid[hh])}</b> → their ${HN[tgt(hh, v.myBid[hh])]}</div>`;
        }
        return `<div class="hand"><div class="lab"><b>Your ${HN[hh]}</b><span class="muted">${evName}</span></div><div class="cards">${cardsHTML}</div>${extra}</div>`;
      }).join('') + '</div>';

      // action button
      let btn = '';
      if (v.step === 'bid' && !v.myBid) btn = `<button class="btn" data-act="bidlock" ${u.bid[0] && u.bid[1] ? '' : 'disabled'}>Lock in bids</button>`;
      if (v.step === 'pass' && !v.myPassDone) btn = `<button class="btn" data-act="passlock" ${u.pass.every((x, i) => x.length === sizes[i]) ? '' : 'disabled'}>Pass these cards</button>`;
      if (v.step === 'choose' && !v.myChooseDone) btn = `<button class="btn" data-act="retlock" ${v.offersIn.every(m => u.ret[m.h]) ? '' : 'disabled'}>Send these back</button>`;
      if (v.step === 'alloc' && v.allocNeed !== null && !v.allocDone) btn = `<button class="btn" data-act="keeplock" ${u.keep.length === 5 ? '' : 'disabled'}>Keep these 5</button>`;
      if (v.step === 'discard' && !v.myDiscardDone) btn = `<button class="btn" data-act="discardlock" ${[0, 1].every(hh => u.disc[hh].length === v.discardNeed[hh]) ? '' : 'disabled'}>Discard</button>`;
      if (v.step === 'swap' && !v.mySwapDone) {
        const need = u.sw.secret ? 2 : 1, ready = u.sw.c[0] && u.sw.c[1] && u.sw.pay.length === need;
        if (v.swapBudget < 1) btn = `<span class="muted">You need your bid cards for the passes left, so no swap this time.</span> <button class="btn" data-act="swapskip">Continue</button>`;
        else btn = `<div style="width:100%">
            <div class="bids">
              <button class="bid ${!u.sw.secret ? 'sel' : ''}" data-act="swapmode" data-b="open">Open (1 card)</button>
              <button class="bid ${u.sw.secret ? 'sel' : ''}" data-act="swapmode" data-b="secret" ${v.swapBudget >= 2 ? '' : 'disabled'}>Secret (2 cards)</button>
            </div>
            <div class="note">Spend ${need} bid card${need > 1 ? 's' : ''}:</div>
            <div class="bids">${v.bidsLeft[me].map(b => bidChip(b, { act: 'swappay', h: 0, cls: u.sw.pay.includes(b) ? 'sel' : '' })).join('')}</div>
          </div>
          <button class="btn" data-act="swaplock" ${ready ? '' : 'disabled'}>Swap</button>
          <button class="btn ghost" data-act="swapskip">Don’t swap</button>`;
      }
      if (btn) h += `<div class="actions">${btn}</div>`;
    }

    h += `<div class="info"><b>You</b><span>Bid cards left: ${v.bidsLeft[me].map(b => bidChip(b, { cls: 'small' })).join(' ') || 'none'}</span>` +
      (v.kept[me].length ? `<span>Kept: ${v.kept[me].map(c => cardHTML(c)).join(' ')}</span>` : '') + '</div>';

    if (v.step === 'prio' && !v.myPrio) {
      h += `<div class="panel"><h3>Play a bid card for ${MATCH_NAMES[v.draft.auctions.length]}</h3><div class="bids">${v.bidsLeft[me].map(b => bidChip(b, { act: 'priopick', h: 0, cls: u.prio === b ? 'sel' : '' })).join('')}</div>
        <div class="actions" style="margin-top:10px"><button class="btn" data-act="priolock" ${u.prio ? '' : 'disabled'}>Play this card</button></div></div>`;
    }
    if (v.showdown && ['prio', 'draft', 'between'].includes(v.step)) h += showdownHTML(v);
    if (v.step === 'between' && !v.ready[me]) h += `<div class="actions"><button class="btn" data-act="ready">Start round 2</button></div>`;
    if (v.step === 'final') h += finalHTML(v);

    const log = v.log.slice().reverse().map(l => `<li class="${/^Round \d dealt|^Pass \d of 3/.test(l.msg) ? 'r' : ''}">${esc(l.msg)}</li>`).join('');
    h += `<details class="journal panel" open><summary><b>What you know</b> <span class="muted">(newest first)</span></summary><ol reversed>${log}</ol></details>`;
    return `<div class="seat" data-seat="${me}">${h}</div>`;
  }

  // Pass your bid: every discarded card stays visible all game.
  function discardPileHTML(v) {
    const pile = (label, cards) => `<div class="hand opp"><div class="lab"><b>${label}</b><span class="muted">${cards.length} card${cards.length === 1 ? '' : 's'}</span></div>
      <div class="cards">${cards.length ? cards.map(c => cardHTML(c)).join('') : '<span class="muted" style="font-size:13px">None yet</span>'}</div></div>`;
    return pile(`Discarded in round ${v.round} (face up)`, v.discards) +
      (v.round === 2 && v.prevDiscards.length ? pile('Discarded in round 1 (shuffled back into the deck)', v.prevDiscards) : '');
  }

  function passSummary(pi, me, variant) {
    const op = 1 - me, c = pi.counts;
    if (variant === 'even') return `Bids total ${pi.sum} ÷ 4 = ${+(pi.sum / 4).toFixed(2)} → <b>each hand passes ${c[me][0]}</b>`;
    if (variant === 'own') return `<b>Each hand passes its own bid</b>: you ${c[me][0]} from A, ${c[me][1]} from B; them ${c[op][0]} from A, ${c[op][1]} from B. Over 5 → discard face up; under 5 → draw.`;
    if (variant === 'bids') return `Bids total ${pi.sum} ÷ 2 → <b>each player passes ${c[me][0] + c[me][1]}</b>: you ${c[me][0]} from A, ${c[me][1]} from B; them ${c[op][0]} from A, ${c[op][1]} from B`;
    return [0, 1].map(h => `Your ${HN[h]} ↔ their ${HN[pi.targets[me][h]]}: <b>${c[me][h]} each way</b>`).join(' · ');
  }

  function showdownHTML(v) {
    const me = v.seat, op = 1 - me, d = v.draft;
    const turn = v.step === 'draft' ? d.order[d.idx] : null;
    const rows = v.showdown.matches.map((mt, m) => {
      const current = turn ? turn.m === m : v.step === 'prio' && d.auctions.length === m, canPick = turn && turn.m === m && turn.seat === me;
      const au = d.auctions && d.auctions[m];
      const auction = au ? `<div class="note">Auction: you ${au.cards[me] ? bidLabel(au.cards[me]) : '—'} vs ${esc(v.names[op])} ${au.cards[op] ? bidLabel(au.cards[op]) : '—'} → <b>${au.first === me ? 'you pick' : esc(v.names[op]) + ' picks'} first</b></div>` : '';
      const side = (p, who) => {
        const sd = mt.sides[p];
        const cards = sd.cards.map(c => {
          const taken = d.taken[c];
          if (taken !== undefined) return cardHTML(c, { cls: 'dim', tag: taken === me ? 'you' : 'them' });
          return cardHTML(c, canPick ? { act: 'pick' } : {});
        }).join('');
        const handLabel = sd.hand === null ? '' : ` (${HN[sd.hand]})`;
        return `<div class="side"><span class="${mt.winner === p ? 'win' : ''}">${who}${handLabel}</span><div><div class="cards">${cards}</div><div class="note">${esc(sd.name)}</div></div></div>`;
      };
      const tie = mt.tie ? `<div class="note">Tied, so ${fmt(mt.tie.card)} was flipped: ${esc(mt.tie.names[me])} vs ${esc(mt.tie.names[op])}${mt.tie.coin !== undefined ? '. Still tied, so a coin flip decided it.' : '.'}</div>` : '';
      return `<div class="match ${current ? 'current' : ''}"><h3>${mt.name}: <span class="win">${mt.winner === me ? 'you win' : esc(v.names[op]) + ' wins'}</span></h3>
        ${side(me, 'You')}${side(op, esc(v.names[op]))}${tie}${auction}</div>`;
    }).join('');
    return `<div class="panel"><h3>Round ${v.round} showdown and draft</h3>${rows}</div>`;
  }

  function finalHTML(v) {
    const me = v.seat, op = 1 - me, f = v.final;
    const side = (p, who) => {
      const r = f.res[p];
      const six = v.kept[p].length === 6;
      const cards = v.kept[p].map(c => cardHTML(c, r.cards.includes(c) ? { cls: 'best' } : { cls: 'dim', tag: six ? '6th' : '' })).join('');
      const extra = six ? `6th card ${fmt(r.left)}` : `${v.kept[p].length} cards; tiebreakers ${r.leftovers.map(fmt).join(' ')}`;
      return `<div class="match"><div class="side"><span class="${f.winner === p ? 'win' : ''}">${who}</span><div><div class="cards">${cards}</div><div class="note">${esc(r.name)} · ${extra}</div></div></div></div>`;
    };
    const res = f.winner === null ? 'Split: same hand and same tiebreak cards.' :
      `${f.winner === me ? 'You win' : esc(v.names[op]) + ' wins'}${f.by === 'sixth card' ? (v.spoils ? ' on the leftover cards' : ' on the 6th card') : ''}.`;
    return `<div class="panel"><div class="big">${res}</div>${side(me, 'You')}${side(op, esc(v.names[op]))}
      <div class="actions"><button class="btn" data-act="newgame">New game</button></div></div>`;
  }

  // ---------- rendering + input ----------
  function render() {
    const seats = $('#seats');
    seats.className = mode === 'playtest' ? 'two' : '';
    if (mode === 'playtest') {
      seats.innerHTML = [0, 1].map(s => `<div><div class="seathead">Seat ${s + 1}: ${esc(state.names[s])}</div>${seatHTML(G.viewFor(state, s))}</div>`).join('');
    } else if (mode === 'host' || mode === 'bot') {
      seats.innerHTML = state ? seatHTML(G.viewFor(state, 0)) : '';
    } else if (mode === 'guest') {
      seats.innerHTML = guestView ? seatHTML(guestView) : '';
    }
  }

  function currentView(seat) { return mode === 'guest' ? guestView : G.viewFor(state, seat); }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const seatEl = el.closest('[data-seat]'); if (!seatEl) return;
    const seat = +seatEl.dataset.seat, u = ui[seat], d = el.dataset;
    const v = currentView(seat);
    switch (d.act) {
      case 'bidpick': {
        const hh = +d.h;
        if (u.bid[hh] === d.b) u.bid[hh] = null;
        else { if (u.bid[1 - hh] === d.b) u.bid[1 - hh] = null; u.bid[hh] = d.b; }
        return render();
      }
      case 'passcard': {
        const sel = u.pass[+d.h], n = (v.passSizes || v.phaseInfo.counts[seat])[+d.h], i = sel.indexOf(d.c);
        if (i >= 0) sel.splice(i, 1); else if (n) { sel.push(d.c); if (sel.length > n) sel.shift(); }
        return render();
      }
      case 'keepcard': {
        const i = u.keep.indexOf(d.c);
        if (i >= 0) u.keep.splice(i, 1); else { u.keep.push(d.c); if (u.keep.length > 5) u.keep.shift(); }
        return render();
      }
      case 'bidlock': return dispatch(seat, { type: 'bid', bids: u.bid.slice() });
      case 'passlock': return dispatch(seat, { type: 'pass', cards: u.pass.map(x => x.slice()) });
      case 'keeplock': return dispatch(seat, { type: 'alloc', keep: u.keep.slice() });
      case 'pick': return dispatch(seat, { type: 'pick', card: d.c });
      case 'discardcard': {
        const sel = u.disc[+d.h], k = v.discardNeed[+d.h], i = sel.indexOf(d.c);
        if (i >= 0) sel.splice(i, 1); else if (k) { sel.push(d.c); if (sel.length > k) sel.shift(); }
        return render();
      }
      case 'discardlock': return dispatch(seat, { type: 'discard', cards: u.disc.map(x => x.slice()) });
      case 'swapcard': u.sw.c[+d.h] = u.sw.c[+d.h] === d.c ? null : d.c; return render();
      case 'swapmode': u.sw.secret = d.b === 'secret'; u.sw.pay = u.sw.pay.slice(0, u.sw.secret ? 2 : 1); return render();
      case 'swappay': {
        const i = u.sw.pay.indexOf(d.b), need = u.sw.secret ? 2 : 1;
        if (i >= 0) u.sw.pay.splice(i, 1); else { u.sw.pay.push(d.b); if (u.sw.pay.length > need) u.sw.pay.shift(); }
        return render();
      }
      case 'swaplock': return dispatch(seat, { type: 'swap', cards: u.sw.c.slice(), pay: u.sw.pay.slice(), secret: u.sw.secret });
      case 'swapskip': return dispatch(seat, { type: 'swap', skip: true });
      case 'retpick': u.ret[+d.h] = u.ret[+d.h] === d.c ? null : d.c; return render();
      case 'retlock': return dispatch(seat, { type: 'choose', returns: u.ret.slice() });
      case 'priopick': u.prio = u.prio === d.b ? null : d.b; return render();
      case 'priolock': return dispatch(seat, { type: 'prio', card: u.prio });
      case 'ready': return dispatch(seat, { type: 'ready' });
      case 'newgame': return dispatch(seat, { type: 'newGame' });
    }
  });

  function dispatch(seat, action) {
    action.seat = seat;
    if (mode === 'guest') {
      if (conn && conn.open) conn.send({ t: 'act', action }); else toast('Not connected');
      return;
    }
    const r = G.act(state, action);
    if (!r.ok) toast(r.err);
    changed();
  }

  function changed() {
    if (mode === 'host') { store.set(HOST_KEY, { room, name: myName, state }); sendView(); }
    if (mode === 'bot') scheduleBot();
    render();
  }

  // ---------- networking ----------
  function netbar(html) { const b = $('#netbar'); b.hidden = false; b.innerHTML = html; }
  function newCode() { const L = 'ABCDEFGHJKMNPQRSTUVWXYZ'; let c = ''; for (let i = 0; i < 4; i++) c += L[Math.floor(Math.random() * L.length)]; return c; }
  function hostBar(msg) {
    const link = location.origin + location.pathname + '?join=' + room;
    netbar(`<span>Room</span><span class="code">${room}</span><button class="btn ghost" id="copyLink">Copy invite link</button><span class="muted">${esc(msg)}</span>`);
    $('#copyLink').onclick = () => navigator.clipboard.writeText(link).then(() => toast('Link copied'), () => prompt('Copy this link', link));
  }

  function startHost(resume) {
    mode = 'host';
    room = resume ? resume.room : newCode();
    state = resume ? resume.state : null;
    hideLobby();
    hostBar('Connecting…');
    const open = () => {
      peer = new Peer(PREFIX + room);
      peer.on('open', () => hostBar(state ? (conn && conn.open ? 'Connected' : 'Waiting for your opponent to rejoin…') : 'Waiting for your opponent to join…'));
      peer.on('connection', c => {
        if (conn) try { conn.close(); } catch (e) {}
        conn = c;
        c.on('data', onHostData);
        c.on('close', () => { if (conn === c) hostBar('Opponent disconnected; they can rejoin with the same code.'); });
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
      peer.on('error', e => {
        if (e.type === 'unavailable-id') { hostBar('Reclaiming the room code…'); peer.destroy(); setTimeout(open, 4000); }
        else hostBar('Connection problem: ' + e.type);
      });
    };
    open();
    render();
  }

  function onHostData(m) {
    if (m.t === 'hello') {
      const guestName = String(m.name || 'Guest').slice(0, 16);
      if (!state) state = newGameFromChoice([myName, guestName]); else state.names[1] = guestName;
      hostBar('Connected to ' + guestName);
      changed();
    } else if (m.t === 'act' && state) {
      const action = Object.assign({}, m.action, { seat: 1 });
      const r = G.act(state, action);
      if (!r.ok && conn) conn.send({ t: 'err', err: r.err });
      changed();
    }
  }
  function sendView() { if (conn && conn.open && state) conn.send({ t: 'view', view: G.viewFor(state, 1) }); }

  function startGuest(code) {
    mode = 'guest'; room = code;
    hideLobby();
    netbar(`<span>Room</span><span class="code">${room}</span><span class="muted" id="gstat">Connecting…</span>`);
    const gstat = msg => { const el = $('#gstat'); if (el) el.textContent = msg; };
    peer = new Peer();
    let retry = null;
    const connect = () => {
      clearTimeout(retry);
      const c = peer.connect(PREFIX + room, { reliable: true });
      conn = c;
      c.on('open', () => { gstat('Connected'); c.send({ t: 'hello', name: myName }); });
      c.on('data', m => {
        if (m.t === 'view') { guestView = m.view; render(); }
        else if (m.t === 'err') toast(m.err);
      });
      c.on('close', () => { if (conn === c) { gstat('Disconnected, retrying…'); retry = setTimeout(connect, 3000); } });
    };
    peer.on('open', connect);
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
    peer.on('error', e => {
      if (e.type === 'peer-unavailable') { gstat('Room not found yet, retrying…'); retry = setTimeout(connect, 3000); }
      else gstat('Connection problem: ' + e.type);
    });
  }

  function startPlaytest() {
    mode = 'playtest';
    hideLobby();
    state = newGameFromChoice([myName || 'Player 1', 'Player 2']);
    netbar('<span class="muted">Playtest: you control both seats.</span><button class="btn ghost" id="restart">Restart</button>');
    $('#restart').onclick = () => { state = G.newGame(state.names, state.variant, { spoils: state.spoils, priority: state.priority, offer: state.offer, swap: state.swap }); render(); };
    render();
  }

  // ---------- computer opponent (seat 1) ----------
  let botLevel = 'hard', botTimer = null;
  function scheduleBot() {
    clearTimeout(botTimer);
    botTimer = setTimeout(() => {
      const a = window.PassPokerBot.decide(state, 1, window.PassPokerBot.LEVELS[botLevel]);
      if (!a) return;
      a.seat = 1;
      G.act(state, a);
      render();
      scheduleBot(); // it may have more to do (e.g. two draft picks in a row)
    }, 450);
  }
  function startBot() {
    mode = 'bot';
    hideLobby();
    botLevel = $('#botLevel').value;
    const label = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' }[botLevel];
    state = newGameFromChoice([myName || 'You', `Computer (${label})`]);
    netbar(`<span class="muted">Playing the computer (${label}).</span><button class="btn ghost" id="restart">Restart</button>`);
    $('#restart').onclick = () => { state = G.newGame(state.names, state.variant, { spoils: state.spoils, priority: state.priority, offer: state.offer, swap: state.swap }); changed(); };
    changed();
  }

  function hideLobby() { $('#lobby').hidden = true; }

  function newGameFromChoice(names) {
    const el = document.querySelector('input[name=variant]:checked'), val = el ? el.value : 'even';
    // 'spoils' = even split passing + winner of each matchup takes two cards
    const priority = $('#auction').checked ? 'low' : null, offer = $('#offer').value || null, swap = $('#swap').checked;
    const spoils = val === 'spoils' || $('#spoilsRule').checked;
    return G.newGame(names, val === 'spoils' ? 'even' : val, { spoils, priority, offer, swap });
  }

  // ---------- lobby ----------
  const params = new URLSearchParams(location.search);
  $('#name').value = store.get(NAME_KEY) || '';
  if (params.get('join')) $('#joinCode').value = params.get('join').toUpperCase();
  const saved = store.get(HOST_KEY);
  if (saved && saved.state && saved.state.variant && saved.state.step !== 'final') {
    $('#resumeRow').hidden = false;
    $('#resumeBtn').textContent = `Resume hosting room ${saved.room} (round ${saved.state.round})`;
  }
  function needName() {
    myName = $('#name').value.trim();
    if (!myName) { toast('Enter your name first'); $('#name').focus(); return false; }
    store.set(NAME_KEY, myName);
    return true;
  }
  $('#hostBtn').onclick = () => { if (needName()) { store.del(HOST_KEY); startHost(null); } };
  $('#resumeBtn').onclick = () => { if (needName()) startHost(saved); };
  $('#joinBtn').onclick = () => {
    const code = $('#joinCode').value.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) return toast('Enter the 4-letter room code');
    if (needName()) startGuest(code);
  };
  $('#playtestBtn').onclick = () => { myName = $('#name').value.trim(); startPlaytest(); };
  $('#botBtn').onclick = () => { myName = $('#name').value.trim(); startBot(); };

  window.PassPokerDebug = { get state() { return state; } };
})();
