// Draws the timeline described in data.js into #tl and the key into #legend.
(function () {
  const D = STIMELINE;
  const DAY = 864e5;
  const root = document.getElementById('tl');

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // dates may be a full day (2024-09-30), a month (2024-09) or just a year (2024);
  // a month is placed at its middle and a year at its middle
  const time = d => { const [y, m, day] = String(d).split('-'); return Date.UTC(+y, m ? m - 1 : 6, day ? +day : m ? 15 : 1); };
  const colorOf = who => who === 'me' ? D.me.color : (D.partners[who] || { color: '#888' }).color;

  // ---------- pictograms ----------
  function tubeShapes(fill) {
    let g = '';
    for (let y = -9; y <= 9; y += 3) g += `<line x1="-6" y1="${y}" x2="-1.5" y2="${y}" stroke="#000" stroke-width=".7"/>`;
    return `<g transform="rotate(24)"><path d="M-6 -14V8a6 6 0 0 0 12 0V-14" fill="${fill}" stroke="#000" stroke-width="1.6"/>${g}` +
      `<line x1="-9.5" y1="-14" x2="9.5" y2="-14" stroke="#000" stroke-width="2.4" stroke-linecap="round"/></g>`;
  }
  function syringeShapes() {
    return `<g transform="rotate(30)" fill="#fff" stroke="#000" stroke-width="1.2" stroke-linecap="round">` +
      `<line x1="0" y1="-10" x2="0" y2="-17"/><line x1="-3.5" y1="-17" x2="3.5" y2="-17"/>` +
      `<rect x="-3.6" y="-10" width="7.2" height="17"/><line x1="-6" y1="-10" x2="6" y2="-10"/>` +
      `<path d="M-1.8 7h3.6l-1 3h-1.6z"/><line x1="0" y1="10" x2="0" y2="20" stroke-width=".7"/></g>`;
  }
  const leftIcon = kind => kind === 'vaccine' ? syringeShapes() : tubeShapes('#fff');

  function pict(part, color, mods) {
    mods = mods || [];
    const o = color === 'outline';
    const f = o ? 'fill="#fff" stroke="#444" stroke-width="1"' : `fill="${color}"`;
    if (part === 'penis') {
      return `<svg class="pic penis" viewBox="0 0 39 18"><g ${f}><path d="M5 4h23v9H5z"/>` +
        `<path d="M27 3.2h3.5a5.3 5.3 0 0 1 0 10.6H27z"/><circle cx="6" cy="12.5" r="5"/></g>` +
        (mods.includes('condom') ? `<rect x="12" y="1.5" width="26" height="14" rx="7" fill="#c4c4c4" fill-opacity=".75" stroke="#8a8a8a" stroke-width=".8"/>` : '') +
        `</svg>`;
    }
    if (part === 'vagina') {
      return `<svg class="pic vagina" viewBox="0 0 16 26"><path d="M8 1C15 7 15 19 8 25C1 19 1 7 8 1Z" ${o ? f : `fill="${color}" stroke="rgba(0,0,0,.5)" stroke-width=".8"`}/>` +
        `<path d="M8 4.5C12 9.5 12 16.5 8 21.5C4 16.5 4 9.5 8 4.5ZM8 7V19" fill="none" stroke="rgba(0,0,0,.38)" stroke-width=".8"/></svg>`;
    }
    if (part === 'hand') {
      return `<svg class="pic hand" viewBox="0 0 16 23"><path d="M4 12V5.5a1.2 1.2 0 0 1 2.4 0V10M6.4 10V3.2a1.2 1.2 0 0 1 2.4 0V10M8.8 10V3.8a1.2 1.2 0 0 1 2.4 0V10.5M11.2 10.5V6a1.2 1.2 0 0 1 2.4 0V14c0 3-1.6 5-4.6 5H8.6c-2 0-3.2-1-4.2-2.8L2 12.4c-.5-1 .8-2 1.7-1L4 12M6 19v3M11.4 18.6V22" ` +
        `fill="none" stroke="${o ? '#222' : color}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }
    if (part === 'mouth') {
      const m = `<svg class="pic mouth" viewBox="0 0 18 18"><polyline points="3,3 15,9 3,15" fill="none" stroke="${o ? '#000' : color}" stroke-width="2.6"/></svg>`;
      return mods.includes('hand') ? `<span class="stack">${pict('hand', color).replace('pic hand', 'pic hand small')}${m}</span>` : m;
    }
    return '';
  }
  const TESTED = `<svg class="pic tested" viewBox="-13 -19 26 40">${tubeShapes('#0a9a0a')}</svg>`;
  const NOSTI = `<span class="nosti"><b>-</b>STI</span>`;
  const rich = s => esc(s).replace(/\{nosti\}/g, NOSTI).replace(/\{tested\}/g, TESTED);

  function rowHTML(row) {
    return '<div class="row">' + row.trim().split(/\s+/).map(tok => {
      const [who, rest] = tok.split(':');
      const [part, ...mods] = rest.split('+');
      return pict(part, colorOf(who), mods);
    }).join('') + '</div>';
  }
  function boxHTML(b) {
    const cls = b.rows ? 'acts' : 'text' + (b.text.length > 110 ? ' long' : '');
    return `<div class="box ${cls}">` + (b.rows || []).map(rowHTML).join('') +
      (b.text ? `<div class="t">${rich(b.text)}</div>` : '') + '</div>';
  }
  function person(cx, cy, s, color) {
    return `<path d="M${cx - s / 2} ${cy + s / 2}A${s / 2} ${s * 0.47} 0 0 1 ${cx + s / 2} ${cy + s / 2}Z" fill="${color}" stroke="#000" stroke-width="2"/>` +
      `<circle cx="${cx}" cy="${cy - s * 0.27}" r="${s * 0.23}" fill="${color}" stroke="#000" stroke-width="2"/>`;
  }

  // ---------- legend ----------
  function legend() {
    const svg = (inner, vb) => `<svg class="pic" viewBox="${vb}">${inner}</svg>`;
    const groups = [
      ['main', [
        [svg(tubeShapes('#fff'), '-13 -19 26 40'), 'Testing (T)'],
        [svg(syringeShapes(), '-14 -20 28 42'), 'Vaccine (V)'],
        [svg(person(20, 22, 34, '#000'), '0 0 40 42'), '"Sexual Partner"'],
        [`<svg class="pic" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="${D.me.color}"/></svg>`, 'My Color']]],
      ['abbr', [['G', 'Gonorrhea'], ['C', 'Chlamydia'], ['S', 'Syphilis']]],
      ['acts', [
        [pict('penis', 'outline', ['condom']), 'Penis w/ Condom'],
        [pict('penis', 'outline'), 'Penis w/out Condom'],
        [pict('mouth', 'outline'), 'Mouth'],
        [pict('vagina', 'outline'), 'Vagina'],
        [pict('hand', 'outline'), 'Hand'],
        [TESTED, 'Regularly Tested'],
        [NOSTI, 'No Known STIs']]]
    ];
    document.getElementById('legend').innerHTML = groups.map(([cls, rows]) =>
      `<div class="lgroup ${cls}">` + rows.map(r =>
        `<div class="lg"><span class="sym">${r[0]}</span><span>= ${esc(r[1])}</span></div>`).join('') + '</div>').join('');
  }

  // ---------- timeline ----------
  function render() {
    const W = root.clientWidth;
    const small = W < 620;
    root.classList.toggle('small', small);
    const P = small
      ? { s: 24, iw: 17, R: 25, leftW: 84, axisW: 6, yearFont: 12, gap: 8 }
      : { s: 34, iw: 24, R: 37, leftW: 215, axisW: 8, yearFont: 20, gap: 10 };
    const PXD = 380 / 365, CAP = 120, BREAK_DAYS = 400, BOTTOM = 60, TOP = 80;
    const axisX = P.leftW + 10 + 2 * P.iw + 16;
    const laneW = P.s + 6, lane0 = axisX + 20, dx = P.s * 0.42;
    const iconH = Math.max(P.s, 38);

    root.innerHTML = '';
    const events = D.events.map((e, i) => Object.assign({ t: time(e.date), _i: i }, e)).sort((a, b) => a.t - b.t);
    const pe = events.filter(e => e.who);

    // relationship lines get a lane each so they never run through one another
    const spans = [];
    for (const id in D.partners) {
      const p = D.partners[id];
      if (!p.track) continue;
      const evs = pe.filter(e => e.who.includes(id));
      if (!evs.length) continue;
      spans.push({ id, evs, t0: evs[0].t, t1: p.ongoing ? Infinity : evs[evs.length - 1].t, ongoing: !!p.ongoing });
    }
    spans.sort((a, b) => (a.t1 - a.t0) - (b.t1 - b.t0));
    const placed = [];
    for (const s of spans) {
      s.lane = 0;
      while (placed.some(a => a.lane === s.lane && a.t0 < s.t1 && s.t0 < a.t1)) s.lane++;
      placed.push(s);
    }
    const spanOf = id => spans.find(s => s.id === id);
    for (const e of pe) {
      const mine = e.who.map(spanOf).filter(Boolean);
      if (mine.length) e.lane = Math.min(...mine.map(s => s.lane));
      else { e.lane = 0; while (spans.some(s => s.lane === e.lane && s.t0 < e.t && e.t < s.t1)) e.lane++; }
      e.clusterW = P.s + (e.who.length - 1) * dx;
      const through = spans.filter(s => s.t0 <= e.t && e.t <= s.t1).map(s => s.lane);
      const reach = Math.max(e.lane * laneW + e.clusterW, (Math.max(e.lane, ...through) + 1) * laneW - 6);
      e.chainX = lane0 + reach + 10;
    }

    // build the text boxes first so their real heights can drive the spacing
    for (const e of events) {
      if (e.icons) {
        e.side = 'L';
        e.iconsW = e.icons.length * P.iw;
        const el = document.createElement('div');
        el.className = 'box lbox';
        el.textContent = e.text;
        el.style.maxWidth = P.leftW + 'px';
        e.boxRight = axisX - 16 - e.iconsW - 10;
        el.style.right = (W - e.boxRight) + 'px';
        el.dataset.i = e._i;
        root.appendChild(el);
        e.el = el;
      } else {
        e.side = 'R';
        const boxes = e.info ? [{ text: e.info }] : (e.boxes || []);
        if (e.info) e.chainX = lane0 + laneW + 10;
        if (boxes.length) {
          const el = document.createElement('div');
          el.className = 'chain';
          el.innerHTML = boxes.map(boxHTML).join('');
          if (e.info) el.firstChild.className = 'box info';
          el.style.left = e.chainX + 'px';
          el.style.maxWidth = (W - e.chainX) + 'px';
          el.dataset.i = e._i;
          root.appendChild(el);
          const kids = [...el.children];
          kids.forEach((k, i) => {
            if (i && k.offsetLeft <= kids[i - 1].offsetLeft) { k.classList.add('rowstart'); el.classList.add('wrapped'); }
          });
          e.el = el;
        }
      }
    }
    for (const e of events) {
      const bh = e.el ? e.el.offsetHeight : 0;
      const ih = e.side === 'L' ? iconH : e.info ? 0 : P.s + (e.extra ? 30 : 0);
      e.h = Math.max(bh, ih);
    }

    // year markers sit on the axis like events do
    const years = new Set(D.extraYears || []);
    events.filter(e => !e.undated).forEach(e => years.add(new Date(e.t).getUTCFullYear()));
    const items = events.concat([...years].map(y => ({ year: y, side: 'C', t: Date.UTC(y, 0, 1), h: 2 * P.R })));
    items.sort((a, b) => a.t - b.t || (a.side === 'C' ? -1 : 1));

    // elastic time: proportional where there is room, stretched where boxes need space,
    // and long empty stretches are cut short (drawn dashed)
    const last = { L: null, R: null, C: null };
    let prev = null, top = 0;
    for (const it of items) {
      let u = BOTTOM + it.h / 2;
      if (prev) {
        const days = (it.t - prev.t) / DAY;
        it.broken = days > BREAK_DAYS;
        u = Math.max(u, prev.u + Math.min(CAP, days * PXD));
      }
      const clear = P.R + iconH / 2 + 4;
      if (it.side === 'C') {
        if (last.C) u = Math.max(u, last.C.u + 2 * P.R + 12);
        if (last.L) u = Math.max(u, last.L.u + clear);
        if (last.R && !last.R.info) u = Math.max(u, last.R.u + clear);
      } else {
        const j = last[it.side];
        if (j) u = Math.max(u, j.u + j.h / 2 + it.h / 2 + P.gap);
        if (last.C && !it.info) u = Math.max(u, last.C.u + clear);
      }
      it.u = u;
      last[it.side] = it;
      prev = it;
      top = Math.max(top, u + it.h / 2);
    }
    const H = Math.ceil(top + TOP);
    items.forEach(it => { it.y = H - it.u; });
    root.style.height = H + 'px';

    // ---------- graphics ----------
    let g = '';
    const line = (x1, y1, x2, y2, w, extra) =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="${w}" ${extra || ''}/>`;
    const dash = `stroke-dasharray="${P.axisW * 1.8} ${P.axisW * 1.5}"`;

    // axis
    const first = items[0], lastIt = items[items.length - 1];
    g += line(axisX, H, axisX, first.y + P.R + 14, P.axisW, dash);
    g += line(axisX, first.y + P.R + 14, axisX, first.y, P.axisW);
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1], b = items[i];
      if (b.broken && a.y - b.y > 70) {
        g += line(axisX, a.y, axisX, a.y - 22, P.axisW) + line(axisX, a.y - 22, axisX, b.y + 22, P.axisW, dash) + line(axisX, b.y + 22, axisX, b.y, P.axisW);
      } else g += line(axisX, a.y, axisX, b.y, P.axisW);
    }
    g += line(axisX, lastIt.y, axisX, 12, P.axisW);
    const ah = small ? 18 : 26;
    g += `<polyline points="${axisX - ah},${12 + ah} ${axisX},12 ${axisX + ah},${12 + ah}" fill="none" stroke="#000" stroke-width="${P.axisW}"/>`;

    // relationship lines
    const chev = (x, y, dir) => `<polyline points="${x - 4.5},${y + dir * 5} ${x},${y} ${x + 4.5},${y + dir * 5}" fill="none" stroke="#000" stroke-width="1.5"/>`;
    const dotted = (x, y1, y2) => line(x, y1, x, y2, 1.6, 'stroke-dasharray="2 3"');
    for (const s of spans) {
      const x = lane0 + s.lane * laneW + P.s / 2;
      for (let i = 1; i < s.evs.length; i++) {
        const lo = s.evs[i - 1], hi = s.evs[i];
        const y1 = lo.y - P.s / 2 - 5, y2 = hi.y + P.s / 2 + (hi.extra ? 16 : 5);
        if (y1 - y2 < 16) continue;
        g += dotted(x, y1, y2) + chev(x, y1, -1) + chev(x, y2, 1);
      }
      if (s.ongoing) {
        const lo = s.evs[s.evs.length - 1];
        g += dotted(x, lo.y - P.s / 2 - 5, 40) + chev(x, 40, 1);
      }
    }

    for (const it of items) {
      const y = it.y;
      if (it.side === 'C') {
        g += `<circle cx="${axisX}" cy="${y}" r="${P.R - P.axisW / 2}" fill="#fff" stroke="#000" stroke-width="${P.axisW}"/>` +
          `<text x="${axisX}" y="${y}" text-anchor="middle" dominant-baseline="central" font-weight="bold" font-size="${P.yearFont}">${it.year}</text>`;
      } else if (it.side === 'L') {
        g += line(axisX - 14, y, axisX, y, P.axisW * 0.75);
        const k = P.iw / 24;
        it.icons.forEach((kind, i) => {
          const cx = axisX - 16 - it.iconsW + P.iw * (i + 0.5);
          g += `<g transform="translate(${cx},${y - 2}) scale(${k})">${leftIcon(kind)}</g>`;
        });
        g += line(it.boxRight, y, axisX - 16 - it.iconsW, y, 2);
        it.el.style.top = (y - it.el.offsetHeight / 2) + 'px';
      } else {
        if (it.who) {
          const x0 = lane0 + it.lane * laneW;
          g += line(axisX, y, x0 - 3, y, P.axisW * 0.75);
          if (it.el) g += line(x0 + it.clusterW + 3, y, it.chainX + 10, y, 2);
          it.who.forEach((id, i) => { g += person(x0 + P.s / 2 + i * dx, y, P.s, colorOf(id)); });
          if (it.extra) g += `<text x="${x0 + it.clusterW}" y="${y + P.s / 2 + 13}" text-anchor="end" font-size="${small ? 9 : 11}">+${it.extra}</text>`;
        }
        if (it.el) it.el.style.top = (y - it.el.offsetHeight / 2) + 'px';
      }
    }

    const svg = document.createElement('div');
    svg.innerHTML = `<svg class="gfx" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`;
    root.insertBefore(svg.firstChild, root.firstChild);
  }

  legend();
  // redraw whenever the available width changes (including the first time it becomes known)
  let lastW = -1, timer;
  const redraw = () => {
    const w = root.clientWidth;
    if (!w || w === lastW) return;
    lastW = w;
    render();
  };
  redraw();
  if (window.ResizeObserver) new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(redraw, 80); }).observe(root);
  else window.addEventListener('resize', redraw);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (root.clientWidth) render(); });
  window.STIMELINE_RENDER = () => { if (root.clientWidth) render(); };
  window.STIMELINE_UI = { pict, rowHTML, colorOf, esc, NOSTI, TESTED };
})();
