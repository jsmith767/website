// Entry form for the timeline. Only active when the page is opened with ?edit in the address.
// Changes are kept in this browser (localStorage) until you download data.js and publish it.
(function () {
  if (!/[?&]edit\b/.test(location.search)) return;
  const D = STIMELINE, UI = STIMELINE_UI, KEY = 'stimeline-draft';
  const host = document.getElementById('editor');
  const published = JSON.stringify(D);
  const esc = UI.esc;

  const replace = d => { for (const k in D) delete D[k]; Object.assign(D, JSON.parse(JSON.stringify(d))); };
  try {
    const draft = JSON.parse(localStorage.getItem(KEY));
    if (draft && draft.events) replace(draft);
  } catch (e) { /* no draft */ }

  const PARTS = [['penis', 'Penis'], ['penis+condom', 'Penis with condom'], ['vagina', 'Vagina'],
    ['mouth', 'Mouth'], ['mouth+hand', 'Mouth and hand'], ['hand', 'Hand']];
  const TYPES = [['partner', 'Partner interaction'], ['test', 'Test'], ['vaccine', 'Vaccine'],
    ['both', 'Test + vaccine'], ['info', 'Note']];
  const QUICK = ['Negative for G, C, S, and HIV', 'No known STIs. Tested regularly', 'PIV sex with condom.'];

  const today = () => new Date().toISOString().slice(0, 10);
  const blank = () => ({ index: null, type: 'partner', date: today(), undated: false, text: '', who: [], extra: 0, boxes: [{ rows: [[]], text: '' }] });
  let f = blank(), cur = { b: 0, r: 0, who: 'me' }, msg = '', adding = false;

  function fromEvent(e, i) {
    const boxes = (e.boxes || []).map(b => ({ rows: (b.rows || []).map(r => r.trim().split(/\s+/)), text: b.text || '' }));
    boxes.forEach(b => { if (!b.rows.length) b.rows.push([]); });
    return {
      index: i, date: e.date, undated: !!e.undated,
      type: e.info != null ? 'info' : e.icons ? (e.icons.length > 1 ? 'both' : e.icons[0]) : 'partner',
      text: e.info || (e.icons ? e.text : '') || '', who: (e.who || []).slice(), extra: e.extra || 0,
      boxes: boxes.length ? boxes : [{ rows: [[]], text: '' }]
    };
  }
  function toEvent() {
    const e = { date: f.date };
    if (f.undated) e.undated = true;
    if (f.type === 'info') e.info = f.text.trim();
    else if (f.type !== 'partner') { e.icons = f.type === 'both' ? ['test', 'vaccine'] : [f.type]; e.text = f.text.trim(); }
    else {
      e.who = f.who.slice();
      if (f.extra > 0) e.extra = f.extra;
      const boxes = f.boxes.map(b => {
        const o = {}, rows = b.rows.filter(r => r.length).map(r => r.join(' '));
        if (rows.length) o.rows = rows;
        if (b.text.trim()) o.text = b.text.trim();
        return o;
      }).filter(o => o.rows || o.text);
      if (boxes.length) e.boxes = boxes;
    }
    return e;
  }
  function problem() {
    if (!/^(19|20)\d{2}(-\d{2}){0,2}$/.test(f.date)) return 'Pick a date.';
    if (f.type === 'partner' && !f.who.length) return 'Choose at least one partner.';
    if (f.type !== 'partner' && !f.text.trim()) return 'Write what this entry should say.';
    return '';
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { /* private mode */ }
    STIMELINE_RENDER();
  }

  const dot = c => `<i class="dot" style="background:${c}"></i>`;
  const tokenHTML = tok => { const [who, rest] = tok.split(':'); const [part, ...mods] = rest.split('+'); return UI.pict(part, UI.colorOf(who), mods); };

  function partnerSection() {
    const chips = Object.keys(D.partners).map(id =>
      `<button type="button" class="chip${f.who.includes(id) ? ' on' : ''}" data-act="who" data-id="${esc(id)}">${dot(D.partners[id].color)}${esc(id)}</button>`).join('');
    const newP = adding
      ? `<span class="newp"><input id="np-name" placeholder="label, e.g. coral" size="14"><input id="np-color" type="color" value="#ff7f50">` +
        `<button type="button" data-act="np-save">Add</button><button type="button" data-act="np-cancel">Cancel</button></span>` +
        `<div class="hint">The label is stored in the data file, which is public once published. Use a color or nickname, not a real name.</div>`
      : `<button type="button" class="chip" data-act="np-open">+ New partner</button>`;
    const lines = f.who.map(id => {
      const p = D.partners[id];
      return `<div class="pline">${dot(p.color)}${esc(id)}: <label><input type="checkbox" data-act="track" data-id="${esc(id)}"${p.track ? ' checked' : ''}> draw a line between their appearances</label>` +
        ` <label><input type="checkbox" data-act="ongoing" data-id="${esc(id)}"${p.ongoing ? ' checked' : ''}> ongoing</label></div>`;
    }).join('');
    const whoChips = ['me'].concat(f.who).map(id =>
      `<button type="button" class="chip${cur.who === id ? ' on' : ''}" data-act="curwho" data-id="${esc(id)}">${dot(UI.colorOf(id))}${id === 'me' ? 'me' : esc(id)}</button>`).join('');
    const partBtns = PARTS.map(([p, label]) =>
      `<button type="button" class="part" title="${label}" data-act="part" data-part="${p}">${tokenHTML(cur.who + ':' + p)}</button>`).join('');

    const boxes = f.boxes.map((b, bi) => {
      const rows = b.rows.map((r, ri) => {
        const active = cur.b === bi && cur.r === ri;
        return `<div class="erow${active ? ' on' : ''}" data-act="pickrow" data-b="${bi}" data-r="${ri}">` +
          `<span class="row">${r.map(tokenHTML).join('') || '<em>empty row</em>'}</span>` +
          (r.length ? `<button type="button" data-act="undo" data-b="${bi}" data-r="${ri}" title="Remove last">⌫</button>` : '') +
          (b.rows.length > 1 ? `<button type="button" data-act="delrow" data-b="${bi}" data-r="${ri}" title="Remove row">×</button>` : '') + `</div>`;
      }).join('');
      return `<div class="ebox"><div class="eboxhead">Box ${bi + 1}` +
        (f.boxes.length > 1 ? ` <button type="button" data-act="delbox" data-b="${bi}">Remove box</button>` : '') + `</div>` +
        rows + `<button type="button" data-act="addrow" data-b="${bi}">+ Row</button>` +
        `<textarea data-bt="${bi}" rows="2" placeholder="Text for this box (optional)">${esc(b.text)}</textarea>` +
        `<div class="ins">Insert: <button type="button" data-act="ins" data-b="${bi}" data-v="{nosti}">${UI.NOSTI}</button>` +
        `<button type="button" data-act="ins" data-b="${bi}" data-v="{tested}">${UI.TESTED}</button>` +
        QUICK.slice(1).map(q => `<button type="button" data-act="ins" data-b="${bi}" data-v="${esc(q)}">${esc(q)}</button>`).join('') + `</div></div>`;
    }).join('');

    return `<div class="fld"><b>Who</b><div class="chips">${chips}${newP}</div>${lines}` +
      `<label class="inl">Others not shown individually: +<input type="number" min="0" max="99" data-f="extra" value="${f.extra}" style="width:4em"></label></div>` +
      `<div class="fld"><b>What happened</b><div class="hint">Pick whose body part, then tap the part. It is added to the highlighted row, left to right. Each box is drawn connected to the next.</div>` +
      `<div class="palette"><span class="chips">${whoChips}</span><span class="parts">${partBtns}</span></div>${boxes}` +
      `<button type="button" data-act="addbox">+ Box</button></div>`;
  }

  function entryList() {
    const rows = D.events.map((e, i) => ({ e, i })).sort((a, b) => b.e.date.localeCompare(a.e.date)).map(({ e, i }) => {
      const what = e.who ? e.who.map(id => dot(UI.colorOf(id))).join('') + (e.extra ? ` +${e.extra}` : '') + ' ' + esc(((e.boxes || []).find(b => b.text) || {}).text || '').replace(/\{\w+\}/g, '').slice(0, 60)
        : esc((e.info || e.text || '').slice(0, 70));
      const kind = e.info != null ? 'Note' : e.icons ? e.icons.map(k => k === 'test' ? 'Test' : 'Vaccine').join(' + ') : 'Partner';
      return `<tr><td>${e.date}${e.undated ? ' ~' : ''}</td><td>${kind}</td><td>${what}</td><td><button type="button" data-act="edit" data-i="${i}">Edit</button></td></tr>`;
    }).join('');
    return `<details class="list"><summary>All entries (${D.events.length})</summary><table>${rows}</table></details>`;
  }

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const precision = () => f.date.length >= 10 ? 'day' : f.date.length >= 7 ? 'month' : 'year';
  function setPrecision(p) {
    const [y, m, d] = (f.date || today()).split('-');
    f.date = p === 'year' ? y : p === 'month' ? `${y}-${m || '01'}` : `${y}-${m || '01'}-${d || '01'}`;
  }
  function dateField() {
    const p = precision(), [y, m] = f.date.split('-');
    const chips = [['day', 'Exact day'], ['month', 'Month and year'], ['year', 'Year only']].map(([k, label]) =>
      `<button type="button" class="chip${p === k ? ' on' : ''}" data-act="prec" data-p="${k}">${label}</button>`).join('');
    const year = `<input type="number" min="1900" max="2100" data-d="y" value="${esc(y)}" style="width:5.5em" aria-label="Year">`;
    const input = p === 'day' ? `<input type="date" data-f="date" value="${esc(f.date)}">`
      : p === 'month' ? `<select data-d="m" aria-label="Month">${MONTHS.map((n, i) => `<option value="${String(i + 1).padStart(2, '0')}"${+m === i + 1 ? ' selected' : ''}>${n}</option>`).join('')}</select>${year}`
      : year;
    return `<b>When</b><div class="chips">${chips}</div><span class="inl">${input}</span>`;
  }

  function draw() {
    const types = TYPES.map(([t, label]) => `<button type="button" class="chip${f.type === t ? ' on' : ''}" data-act="type" data-t="${t}">${label}</button>`).join('');
    const body = f.type === 'partner' ? partnerSection()
      : `<div class="fld"><b>${f.type === 'info' ? 'Note' : 'Result / description'}</b><textarea data-f="text" rows="3">${esc(f.text)}</textarea>` +
        (f.type === 'test' ? `<div class="ins"><button type="button" data-act="quick">${esc(QUICK[0])}</button></div>` : '') + `</div>`;
    const dirty = JSON.stringify(D) !== published;
    host.innerHTML = `<h2>${f.index == null ? 'Add to the timeline' : 'Edit entry'}</h2>` +
      `<div class="fld"><div class="chips">${types}</div></div>` +
      `<div class="fld">${dateField()}` +
      `<label class="inl"><input type="checkbox" data-f="undated"${f.undated ? ' checked' : ''}> date is a rough guess (no year marker)</label></div>` +
      body +
      `<div class="actions"><button type="button" class="primary" data-act="save">${f.index == null ? 'Add entry' : 'Save changes'}</button>` +
      (f.index != null ? `<button type="button" data-act="cancel">Cancel</button><button type="button" class="danger" data-act="delete">Delete entry</button>` : '') +
      `<span class="msg">${esc(msg)}</span></div>` +
      entryList() +
      `<div class="actions foot"><button type="button" data-act="download">Download data.js</button>` +
      `<button type="button" data-act="reset"${dirty ? '' : ' disabled'}>Discard my changes</button>` +
      `<span class="hint">${dirty ? 'You have changes saved in this browser only.' : 'Matches the published version.'}</span></div>`;
  }

  host.addEventListener('input', ev => {
    const t = ev.target;
    if (t.dataset.f) f[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Math.max(0, parseInt(t.value, 10) || 0) : t.value;
    else if (t.dataset.bt != null) f.boxes[+t.dataset.bt].text = t.value;
    else if (t.dataset.d) {
      const parts = f.date.split('-');
      if (t.dataset.d === 'y') parts[0] = t.value; else parts[1] = t.value;
      f.date = parts.join('-');
    }
  });
  host.addEventListener('change', ev => {
    const t = ev.target, id = t.dataset.id;
    if (t.dataset.act === 'track') { if (t.checked) D.partners[id].track = true; else { delete D.partners[id].track; delete D.partners[id].ongoing; } persist(); draw(); }
    if (t.dataset.act === 'ongoing') { if (t.checked) { D.partners[id].ongoing = true; D.partners[id].track = true; } else delete D.partners[id].ongoing; persist(); draw(); }
  });
  host.addEventListener('click', ev => {
    const t = ev.target.closest('[data-act]');
    if (!t || t.tagName === 'INPUT') return;
    const a = t.dataset.act, b = +t.dataset.b, r = +t.dataset.r, id = t.dataset.id;
    msg = '';
    if (a === 'type') f.type = t.dataset.t;
    else if (a === 'prec') setPrecision(t.dataset.p);
    else if (a === 'who') {
      f.who = f.who.includes(id) ? f.who.filter(x => x !== id) : f.who.concat(id);
      if (f.who.includes(id)) cur.who = id; else if (cur.who === id) cur.who = 'me';
    }
    else if (a === 'np-open') adding = true;
    else if (a === 'np-cancel') adding = false;
    else if (a === 'np-save') {
      const name = document.getElementById('np-name').value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
      if (!name || name === 'me' || D.partners[name]) { msg = 'Give the partner a label that is not already used.'; }
      else { D.partners[name] = { color: document.getElementById('np-color').value }; f.who.push(name); cur.who = name; adding = false; }
    }
    else if (a === 'curwho') cur.who = id;
    else if (a === 'pickrow') { cur.b = b; cur.r = r; }
    else if (a === 'part') { const box = f.boxes[cur.b] || f.boxes[0]; (box.rows[cur.r] || box.rows[0]).push(cur.who + ':' + t.dataset.part); }
    else if (a === 'undo') { f.boxes[b].rows[r].pop(); cur.b = b; cur.r = r; }
    else if (a === 'delrow') { f.boxes[b].rows.splice(r, 1); cur.b = b; cur.r = 0; }
    else if (a === 'addrow') { f.boxes[b].rows.push([]); cur.b = b; cur.r = f.boxes[b].rows.length - 1; }
    else if (a === 'addbox') { f.boxes.push({ rows: [[]], text: '' }); cur.b = f.boxes.length - 1; cur.r = 0; }
    else if (a === 'delbox') { f.boxes.splice(b, 1); cur.b = 0; cur.r = 0; }
    else if (a === 'ins') { const x = f.boxes[b]; x.text = (x.text ? x.text.replace(/\s*$/, ' ') : '') + t.dataset.v; }
    else if (a === 'quick') f.text = QUICK[0];
    else if (a === 'edit') { f = fromEvent(D.events[+t.dataset.i], +t.dataset.i); cur = { b: 0, r: 0, who: 'me' }; host.scrollIntoView({ behavior: 'smooth' }); }
    else if (a === 'cancel') { f = blank(); cur = { b: 0, r: 0, who: 'me' }; }
    else if (a === 'save') {
      msg = problem();
      if (!msg) {
        const e = toEvent();
        if (f.index == null) D.events.push(e); else D.events[f.index] = e;
        persist();
        msg = 'Saved in this browser. Scroll down to see it on the timeline.';
        f = blank(); cur = { b: 0, r: 0, who: 'me' };
      }
    }
    else if (a === 'delete') {
      if (confirm('Delete this entry from the timeline?')) { D.events.splice(f.index, 1); persist(); f = blank(); msg = 'Entry deleted.'; }
    }
    else if (a === 'reset') {
      if (confirm('Discard every change made in this browser and go back to the published timeline?')) {
        replace(JSON.parse(published)); try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
        STIMELINE_RENDER(); f = blank(); msg = 'Back to the published version.';
      }
    }
    else if (a === 'download') {
      const src = '// Timeline data. Edit with index.html?edit or by hand. See timeline.js for how it is drawn.\nconst STIMELINE = ' + JSON.stringify(D, null, 2) + ';\n';
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      link.download = 'data.js';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      msg = 'Downloaded data.js. Replacing the one in the project folder makes these changes permanent.';
    }
    draw();
  });

  // clicking a box on the timeline opens that entry in the form
  document.getElementById('tl').addEventListener('click', ev => {
    const el = ev.target.closest('[data-i]');
    if (!el) return;
    f = fromEvent(D.events[+el.dataset.i], +el.dataset.i); cur = { b: 0, r: 0, who: 'me' }; msg = '';
    draw();
    host.scrollIntoView({ behavior: 'smooth' });
  });

  const link = document.getElementById('editlink');
  if (link) { link.textContent = 'Done editing'; link.href = location.pathname; }

  const css = document.createElement('style');
  css.textContent = `
    #editor { border: 2px solid #000; padding: 12px 14px; margin: 14px 0; font-size: 14px; background: #fafafa; }
    #editor h2 { font-size: 17px; margin: 0 0 10px; }
    #editor .fld { margin: 0 0 12px; }
    #editor .chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 4px 0; }
    #editor button { font: inherit; padding: 5px 10px; border: 1.5px solid #000; background: #fff; border-radius: 4px; cursor: pointer; }
    #editor button:disabled { opacity: .4; cursor: default; }
    #editor .chip { display: inline-flex; align-items: center; gap: 5px; border-radius: 99px; }
    #editor .chip.on { background: #000; color: #fff; }
    #editor .dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid #000; flex: none; }
    #editor .chip.on .dot { border-color: #fff; }
    #editor textarea, #editor select, #editor input[type=date], #editor input[type=number], #editor .newp input:not([type=color]) { font: inherit; padding: 5px 6px; border: 1.5px solid #000; border-radius: 4px; }
    #editor textarea { display: block; width: 100%; margin-top: 6px; }
    #editor .inl { display: inline-flex; align-items: center; gap: 6px; margin: 4px 14px 4px 0; }
    #editor .hint { font-size: 12px; color: #444; margin: 4px 0; }
    #editor .newp { display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    #editor .pline { font-size: 13px; margin: 4px 0; display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; }
    #editor .palette { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; margin: 6px 0 10px; }
    #editor .parts { display: flex; flex-wrap: wrap; gap: 6px; }
    #editor .part { padding: 6px 8px; min-width: 44px; min-height: 40px; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; }
    #editor .ebox { border: 2px solid #000; background: #fff; padding: 8px; margin: 0 0 8px; }
    #editor .eboxhead { font-weight: bold; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; }
    #editor .erow { display: flex; align-items: center; gap: 8px; padding: 4px 6px; margin: 0 0 4px; border: 1.5px dashed #999; min-height: 40px; cursor: pointer; font-size: 13px; }
    #editor .erow.on { border: 2px solid #4b0a82; background: #f4eefb; }
    #editor .erow .row { flex: 1; margin: 0; }
    #editor .erow em { color: #777; }
    #editor .ins { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 6px; font-size: 12px; }
    #editor .ins button { padding: 2px 8px; display: inline-flex; align-items: center; }
    #editor .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 12px 0 0; }
    #editor .actions.foot { border-top: 1px solid #bbb; padding-top: 12px; }
    #editor .primary { background: #4b0a82; color: #fff; border-color: #4b0a82; font-weight: bold; }
    #editor .danger { color: #b00000; border-color: #b00000; }
    #editor .msg { font-size: 13px; color: #4b0a82; }
    #editor .list { margin-top: 14px; }
    #editor .list summary { cursor: pointer; font-weight: bold; }
    #editor .list table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 6px; }
    #editor .list td { border-top: 1px solid #ddd; padding: 4px 6px 4px 0; vertical-align: middle; }
    #editor .list td:first-child { white-space: nowrap; }
    #editor .list button { padding: 2px 8px; }
    #tl [data-i] { cursor: pointer; }
    #tl [data-i]:hover .box, #tl .lbox[data-i]:hover { outline: 2px solid #4b0a82; }
  `;
  document.head.appendChild(css);
  draw();
  STIMELINE_RENDER();
})();
