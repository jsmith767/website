// Editing tools for the timeline. Only active when the page is opened with ?edit in the address.
// Everything stays in this browser (localStorage) or in files the person saves themselves;
// nothing is sent anywhere.
(function () {
  if (!/[?&]edit\b/.test(location.search)) return;
  const D = STIMELINE, UI = STIMELINE_UI, KEY = 'stimeline-draft';
  const host = document.getElementById('editor');
  const published = JSON.stringify(UI.normalize(D));
  const esc = UI.esc;

  const replace = d => { for (const k in D) delete D[k]; Object.assign(D, UI.normalize(d)); };
  try {
    const draft = JSON.parse(localStorage.getItem(KEY));
    if (draft && draft.events) replace(draft);
  } catch (e) { /* no draft */ }

  const PARTS = [['penis', 'Penis'], ['penis+condom', 'Penis with condom'], ['vagina', 'Vagina'],
    ['mouth', 'Mouth'], ['mouth+hand', 'Mouth and hand'], ['hand', 'Hand']];
  const TYPES = [['partner', 'Partner interaction'], ['test', 'Test'], ['vaccine', 'Vaccine'],
    ['both', 'Test + vaccine'], ['info', 'Note']];
  const QUICK = ['No known STIs. Tested regularly', 'PIV sex with condom.'];
  const PANEL = ['G', 'C', 'S', 'HIV'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const blank = () => ({ index: null, type: 'partner', date: today(), estimated: false, undated: false, text: '', auto: true, tests: {}, vaccine: '', who: [], extra: 0, boxes: [{ rows: [[]], text: '' }] });
  let f = blank(), cur = { b: 0, r: 0, who: 'me' }, msg = '', adding = false;
  const resetForm = () => { f = blank(); cur = { b: 0, r: 0, who: 'me' }; adding = false; };

  // ---------- form <-> entry ----------
  const leftPart = () => {
    const e = {};
    if (f.type !== 'vaccine' && Object.keys(f.tests).length) e.tests = Object.assign({}, f.tests);
    if (f.type !== 'test' && f.vaccine.trim()) e.vaccine = f.vaccine.trim();
    return e;
  };
  const autoNow = () => UI.autoText(leftPart());

  function fromEvent(e, i) {
    const boxes = (e.boxes || []).map(b => ({ rows: (b.rows || []).map(r => r.trim().split(/\s+/)), text: b.text || '' }));
    boxes.forEach(b => { if (!b.rows.length) b.rows.push([]); });
    const left = !!e.icons;
    return {
      index: i, date: e.date, estimated: !!e.estimated, undated: !!e.undated,
      type: e.info != null ? 'info' : left ? (e.icons.length > 1 ? 'both' : e.icons[0]) : 'partner',
      text: e.info || (left ? UI.leftText(e) : ''), auto: left && !e.text,
      tests: Object.assign({}, e.tests), vaccine: e.vaccine || '',
      who: (e.who || []).slice(), extra: e.extra || 0,
      boxes: boxes.length ? boxes : [{ rows: [[]], text: '' }]
    };
  }
  function toEvent() {
    const e = { date: f.date };
    if (f.estimated) e.estimated = true;
    if (f.undated) e.undated = true;
    if (f.type === 'info') e.info = f.text.trim();
    else if (f.type !== 'partner') {
      e.icons = f.type === 'both' ? ['test', 'vaccine'] : [f.type];
      Object.assign(e, leftPart());
      const wording = f.type === 'vaccine' ? '' : f.text.trim();
      if (wording && wording !== UI.autoText(e)) e.text = wording;
    } else {
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
    if (f.type === 'partner') return f.who.length ? '' : 'Choose at least one partner.';
    if (f.type === 'info') return f.text.trim() ? '' : 'Write the note.';
    if (f.type === 'vaccine') return f.vaccine.trim() ? '' : 'Say which vaccine.';
    return UI.leftText(toEvent()) ? '' : 'Tap what you were tested for, or write the result.';
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { /* private mode */ }
    STIMELINE_RENDER();
    status();
  }

  // ---------- pieces of the form ----------
  const dot = c => `<i class="dot" style="background:${c}"></i>`;
  const tokenHTML = tok => { const [who, rest] = tok.split(':'); const [part, ...mods] = rest.split('+'); return UI.pict(part, UI.colorOf(who), mods); };
  const precision = () => f.date.length >= 10 ? 'day' : f.date.length >= 7 ? 'month' : 'year';
  function setPrecision(p) {
    const [y, m, d] = (f.date || today()).split('-');
    f.date = p === 'year' ? y : p === 'month' ? `${y}-${m || '01'}` : `${y}-${m || '01'}-${d || '01'}`;
  }
  function freshColor() {
    const used = Object.keys(D.partners).map(id => D.partners[id].color.toLowerCase());
    const pool = ['#ff7f50', '#8b5a2b', '#8d99a6', '#c2185b', '#00897b', '#9e9d24', '#6d4c41', '#3949ab', '#f06292', '#00acc1', '#7cb342', '#ffb300'];
    return pool.find(c => !used.includes(c)) || '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  }

  function dateField() {
    const p = precision(), [y, m] = f.date.split('-');
    const chips = [['day', 'Exact day'], ['month', 'Month and year'], ['year', 'Year only']].map(([k, label]) =>
      `<button type="button" class="chip${p === k ? ' on' : ''}" data-act="prec" data-p="${k}">${label}</button>`).join('');
    const year = `<input type="number" min="1900" max="2100" data-d="y" value="${esc(y)}" style="width:5.5em" aria-label="Year">`;
    const input = p === 'day' ? `<input type="date" data-f="date" value="${esc(f.date)}" aria-label="Date">`
      : p === 'month' ? `<select data-d="m" aria-label="Month">${MONTHS.map((n, i) => `<option value="${String(i + 1).padStart(2, '0')}"${+m === i + 1 ? ' selected' : ''}>${n}</option>`).join('')}</select>${year}`
      : year;
    return `<div class="fld"><h3>When</h3><div class="chips">${chips}</div><div class="inl">${input}` +
      `</div><div><label class="inl soft"><input type="checkbox" data-f="estimated"${f.estimated ? ' checked' : ''}> this date is a best guess</label>` +
      `<label class="inl soft"><input type="checkbox" data-f="undated"${f.undated ? ' checked' : ''}> don't mark the year on the line</label></div></div>`;
  }

  function testSection() {
    const chips = UI.TESTS.map(([k, , name]) => {
      const v = f.tests[k];
      return `<button type="button" class="tchip ${v || 'off'}" data-act="tst" data-k="${k}" aria-label="${name}: ${v === 'neg' ? 'negative' : v === 'pos' ? 'positive' : 'not tested'}">` +
        `<span class="mark">${v === 'neg' ? '−' : v === 'pos' ? '+' : ''}</span>${name}</button>`;
    }).join('');
    return `<div class="fld"><h3>What was tested</h3>` +
      `<div class="hint">Tap once for negative, twice for positive, a third time to clear.</div>` +
      `<div class="chips">${chips}</div>` +
      `<div class="chips"><button type="button" class="ghost" data-act="panel">Standard panel, all negative (G, C, S, HIV)</button>` +
      (Object.keys(f.tests).length ? `<button type="button" class="ghost" data-act="tclear">Clear</button>` : '') + `</div></div>`;
  }
  const vaccineSection = () => `<div class="fld"><h3>Which vaccine</h3><input type="text" data-f="vaccine" value="${esc(f.vaccine)}" placeholder="e.g. Gardasil 9 Round 1"></div>`;
  const wordingSection = () => `<div class="fld"><h3>How it reads on the timeline</h3>` +
    `<div class="hint">Written for you from the choices above. Change it if you want different wording.</div>` +
    `<textarea data-f="text" rows="2">${esc(f.text)}</textarea></div>`;

  function partnerSection() {
    const ids = Object.keys(D.partners);
    const chips = ids.map(id =>
      `<button type="button" class="chip${f.who.includes(id) ? ' on' : ''}" data-act="who" data-id="${esc(id)}">${dot(D.partners[id].color)}${esc(id)}</button>`).join('');
    const newP = adding
      ? `<div class="newp"><input type="text" id="np-name" placeholder="label, e.g. coral" size="14" aria-label="Partner label"><input id="np-color" type="color" value="${freshColor()}" aria-label="Partner color">` +
        `<button type="button" class="primary" data-act="np-save">Add</button><button type="button" class="ghost" data-act="np-cancel">Cancel</button></div>` +
        `<div class="hint">Use a color or nickname, not a real name. The label is saved with the timeline and travels with it if you share the file.</div>`
      : `<button type="button" class="chip add" data-act="np-open">+ New partner</button>`;
    const lines = f.who.map(id => {
      const p = D.partners[id];
      return `<div class="pline">${dot(p.color)}<b>${esc(id)}</b><label><input type="checkbox" data-act="track" data-id="${esc(id)}"${p.track ? ' checked' : ''}> connect their appearances with a dotted line</label>` +
        `<label><input type="checkbox" data-act="ongoing" data-id="${esc(id)}"${p.ongoing ? ' checked' : ''}> still ongoing</label></div>`;
    }).join('');
    const whoChips = ['me'].concat(f.who).map(id =>
      `<button type="button" class="chip${cur.who === id ? ' on' : ''}" data-act="curwho" data-id="${esc(id)}">${dot(UI.colorOf(id))}${id === 'me' ? 'me' : esc(id)}</button>`).join('');
    const partBtns = PARTS.map(([p, label]) =>
      `<button type="button" class="part" title="${label}" aria-label="${label}" data-act="part" data-part="${p}">${tokenHTML(cur.who + ':' + p)}</button>`).join('');

    const boxes = f.boxes.map((b, bi) => {
      const rows = b.rows.map((r, ri) => {
        const active = cur.b === bi && cur.r === ri;
        return `<div class="erow${active ? ' on' : ''}" data-act="pickrow" data-b="${bi}" data-r="${ri}">` +
          `<span class="row">${r.map(tokenHTML).join('') || `<em>${active ? 'Tap a body part above to start this row' : 'empty row'}</em>`}</span>` +
          (r.length ? `<button type="button" class="ghost" data-act="undo" data-b="${bi}" data-r="${ri}" title="Remove last" aria-label="Remove last">⌫</button>` : '') +
          (b.rows.length > 1 ? `<button type="button" class="ghost" data-act="delrow" data-b="${bi}" data-r="${ri}" title="Remove row" aria-label="Remove row">×</button>` : '') + `</div>`;
      }).join('');
      return `<div class="ebox"><div class="eboxhead"><span>Box ${bi + 1}</span>` +
        (f.boxes.length > 1 ? `<button type="button" class="ghost" data-act="delbox" data-b="${bi}">Remove box</button>` : '') + `</div>` +
        rows + `<button type="button" class="ghost" data-act="addrow" data-b="${bi}">+ Row</button>` +
        `<textarea data-bt="${bi}" rows="2" placeholder="Words for this box (optional)">${esc(b.text)}</textarea>` +
        `<div class="ins"><span>Add:</span><button type="button" data-act="ins" data-b="${bi}" data-v="{nosti}" title="No known STIs">${UI.NOSTI}</button>` +
        `<button type="button" data-act="ins" data-b="${bi}" data-v="{tested}" title="Regularly tested">${UI.TESTED}</button>` +
        QUICK.map(q => `<button type="button" data-act="ins" data-b="${bi}" data-v="${esc(q)}">${esc(q)}</button>`).join('') + `</div></div>`;
    }).join('');

    return `<div class="fld"><h3>Who</h3><div class="chips">${chips}${newP}</div>${lines}` +
      `<label class="inl soft">Others there but not shown individually: +<input type="number" min="0" max="99" data-f="extra" value="${f.extra}" style="width:4.5em"></label></div>` +
      `<div class="fld"><h3>What happened</h3><div class="hint">Choose whose body part, then tap the part. It lands in the highlighted row, reading left to right. Boxes are drawn joined in a chain.</div>` +
      `<div class="palette"><span class="chips">${whoChips}</span><span class="parts">${partBtns}</span></div>${boxes}` +
      `<button type="button" class="ghost" data-act="addbox">+ Box</button></div>`;
  }

  function entryList() {
    const rows = D.events.map((e, i) => ({ e, i })).sort((a, b) => b.e.date.localeCompare(a.e.date)).map(({ e, i }) => {
      const what = e.who ? e.who.map(id => dot(UI.colorOf(id))).join('') + (e.extra ? ` +${e.extra}` : '') + ' ' + esc(((e.boxes || []).find(b => b.text) || {}).text || '').replace(/\{\w+\}/g, '').slice(0, 60)
        : esc((e.info || UI.leftText(e)).slice(0, 70));
      const kind = e.info != null ? 'Note' : e.icons ? e.icons.map(k => k === 'test' ? 'Test' : 'Vaccine').join(' + ') : 'Partner';
      return `<tr><td>${e.estimated ? '≈ ' : ''}${esc(e.date)}</td><td>${kind}</td><td>${what}</td><td><button type="button" class="ghost" data-act="edit" data-i="${i}">Edit</button></td></tr>`;
    }).join('');
    return `<details class="list"><summary>All entries (${D.events.length})</summary><table>${rows}</table></details>`;
  }

  // ---------- drawing ----------
  function drawTop() {
    const a = D.about || {};
    const area = (k, label, rows, ph) => `<label class="about"><span>${label}</span><textarea data-about-f="${k}" rows="${rows}" placeholder="${ph}">${esc(a[k] || '')}</textarea></label>`;
    document.getElementById('ed-top').innerHTML =
      `<div class="bar"><div class="bartext"><b>You're editing a private copy.</b> <span id="ed-status"></span></div>` +
      `<div class="barbtns"><button type="button" data-act="savefile">Save to a file</button>` +
      `<button type="button" data-act="openfile">Open a file</button>` +
      `<button type="button" data-act="blank">Start a blank timeline</button>` +
      `<button type="button" data-act="reset" id="ed-reset">Undo all my changes</button>` +
      `<input type="file" id="ed-file" accept=".json,application/json" hidden></div></div>` +
      `<details class="aboutme"><summary>Boundaries, summary and my color</summary>` +
      `<div class="hint">One point per line. Start a line with two spaces to tuck it under the line above. Leave a box empty to hide that section.</div>` +
      area('boundaries', 'Boundaries', 4, 'What you ask of partners') +
      area('summary', 'Sexual Health Summary', 6, 'Your current status in your own words') +
      area('note', 'Note above the timeline', 2, 'Anything a reader should know before reading it') +
      `<label class="inl">My color on the timeline <input type="color" data-me-color value="${esc(D.me.color)}"></label></details>`;
    status();
  }
  function status() {
    const el = document.getElementById('ed-status');
    if (!el) return;
    const dirty = JSON.stringify(UI.normalize(D)) !== published;
    el.textContent = dirty
      ? 'Your changes are kept in this browser only. Save to a file to keep or share them.'
      : 'It matches the published timeline. Nothing you do here is uploaded.';
    document.getElementById('ed-reset').disabled = !dirty;
  }

  function draw() {
    const types = TYPES.map(([t, label]) => `<button type="button" class="chip${f.type === t ? ' on' : ''}" data-act="type" data-t="${t}">${label}</button>`).join('');
    const body = f.type === 'partner' ? partnerSection()
      : f.type === 'info' ? `<div class="fld"><h3>Note</h3><textarea data-f="text" rows="3">${esc(f.text)}</textarea></div>`
      : f.type === 'vaccine' ? vaccineSection()
      : f.type === 'test' ? testSection() + wordingSection()
      : testSection() + vaccineSection() + wordingSection();
    document.getElementById('ed-form').innerHTML =
      `<h2>${f.index == null ? 'Add to the timeline' : 'Edit this entry'}</h2>` +
      `<div class="fld"><div class="chips">${types}</div></div>` + dateField() + body +
      `<div class="actions"><button type="button" class="primary big" data-act="save">${f.index == null ? 'Add to timeline' : 'Save changes'}</button>` +
      (f.index != null ? `<button type="button" data-act="cancel">Cancel</button><button type="button" class="danger" data-act="delete">Delete entry</button>` : '') +
      `<span class="msg" role="status">${esc(msg)}</span></div>` + entryList();
  }

  // ---------- events ----------
  let aboutTimer;
  host.addEventListener('input', ev => {
    const t = ev.target;
    if (t.dataset.aboutF) {
      D.about = D.about || {};
      if (t.value.trim()) D.about[t.dataset.aboutF] = t.value; else delete D.about[t.dataset.aboutF];
      clearTimeout(aboutTimer); aboutTimer = setTimeout(persist, 300);
    } else if (t.dataset.meColor != null) {
      D.me.color = t.value; clearTimeout(aboutTimer); aboutTimer = setTimeout(() => { persist(); draw(); }, 200);
    } else if (t.dataset.f === 'text') {
      f.text = t.value; f.auto = !t.value.trim() || t.value.trim() === autoNow();
    } else if (t.dataset.f === 'vaccine') {
      f.vaccine = t.value;
      if (f.auto) { f.text = autoNow(); const w = host.querySelector('textarea[data-f=text]'); if (w) w.value = f.text; }
    } else if (t.dataset.f) {
      f[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Math.max(0, parseInt(t.value, 10) || 0) : t.value;
    } else if (t.dataset.bt != null) f.boxes[+t.dataset.bt].text = t.value;
    else if (t.dataset.d) {
      const parts = f.date.split('-');
      if (t.dataset.d === 'y') parts[0] = t.value; else parts[1] = t.value;
      f.date = parts.join('-');
    }
  });
  host.addEventListener('change', ev => {
    const t = ev.target, id = t.dataset.id;
    if (t.id === 'ed-file') return openFile(t);
    if (t.dataset.act === 'track') { if (t.checked) D.partners[id].track = true; else { delete D.partners[id].track; delete D.partners[id].ongoing; } persist(); draw(); }
    if (t.dataset.act === 'ongoing') { if (t.checked) { D.partners[id].ongoing = true; D.partners[id].track = true; } else delete D.partners[id].ongoing; persist(); draw(); }
  });

  function loadData(raw, name) {
    const data = raw && (raw.data || raw);
    if (!data || !Array.isArray(data.events)) { msg = "That file isn't a timeline saved from this page."; draw(); return; }
    const clean = UI.normalize(data);
    if (!confirm(`Open "${name}" (${clean.events.length} entries)? It replaces the timeline you're editing in this browser. Save yours to a file first if you want to keep it.`)) return;
    replace(clean); persist(); resetForm(); msg = `Opened ${name}.`; drawTop(); draw();
  }
  function openFile(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let raw;
      try { raw = JSON.parse(reader.result); } catch (e) { raw = null; }
      loadData(raw, file.name);
    };
    reader.readAsText(file);
  }
  const fileBody = () => JSON.stringify({ format: 'stimeline', version: 1, saved: new Date().toISOString(), data: UI.normalize(D) }, null, 2);
  function saveFile() {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([fileBody()], { type: 'application/json' }));
    link.download = `stimeline-${today()}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  window.STIMELINE_EDITOR = { fileBody, loadData };

  host.addEventListener('click', ev => {
    const t = ev.target.closest('[data-act]');
    if (!t || t.tagName === 'INPUT') return;
    const a = t.dataset.act, b = +t.dataset.b, r = +t.dataset.r, id = t.dataset.id;
    msg = '';
    if (a === 'savefile') { saveFile(); msg = 'Saved a file to your downloads. Open it here on any device with "Open a file".'; }
    else if (a === 'openfile') { document.getElementById('ed-file').click(); return; }
    else if (a === 'blank') {
      if (!confirm("Start a blank timeline? This clears the one you're editing in this browser. Save it to a file first if you want to keep it.")) return;
      replace({ me: { color: D.me.color }, partners: {}, events: [] }); persist(); resetForm(); drawTop();
      msg = 'Blank timeline started. Add your first entry below.';
    }
    else if (a === 'reset') {
      if (!confirm('Undo every change made in this browser and go back to the published timeline?')) return;
      replace(JSON.parse(published)); try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      STIMELINE_RENDER(); resetForm(); drawTop(); msg = 'Back to the published timeline.';
    }
    else if (a === 'type') {
      f.type = t.dataset.t;
      if (f.type === 'info') { f.text = f.index != null && D.events[f.index].info || ''; f.auto = false; }
      else if (f.type !== 'partner') { f.auto = true; f.text = autoNow(); }
    }
    else if (a === 'prec') setPrecision(t.dataset.p);
    else if (a === 'tst' || a === 'panel' || a === 'tclear') {
      if (a === 'panel') PANEL.forEach(k => { f.tests[k] = 'neg'; });
      else if (a === 'tclear') f.tests = {};
      else { const k = t.dataset.k, v = f.tests[k]; if (!v) f.tests[k] = 'neg'; else if (v === 'neg') f.tests[k] = 'pos'; else delete f.tests[k]; }
      if (f.auto) f.text = autoNow();
    }
    else if (a === 'who') {
      f.who = f.who.includes(id) ? f.who.filter(x => x !== id) : f.who.concat(id);
      if (f.who.includes(id)) cur.who = id; else if (cur.who === id) cur.who = 'me';
    }
    else if (a === 'np-open') adding = true;
    else if (a === 'np-cancel') adding = false;
    else if (a === 'np-save') {
      const name = document.getElementById('np-name').value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
      if (!name || name === 'me' || D.partners[name]) msg = 'Give the partner a label that is not already used.';
      else { D.partners[name] = { color: document.getElementById('np-color').value }; f.who.push(name); cur.who = name; adding = false; persist(); }
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
    else if (a === 'edit') { f = fromEvent(D.events[+t.dataset.i], +t.dataset.i); cur = { b: 0, r: 0, who: 'me' }; document.getElementById('ed-form').scrollIntoView({ behavior: 'smooth' }); }
    else if (a === 'cancel') resetForm();
    else if (a === 'save') {
      msg = problem();
      if (!msg) {
        const e = toEvent(), isNew = f.index == null;
        if (isNew) D.events.push(e); else D.events[f.index] = e;
        persist(); resetForm();
        msg = isNew ? 'Added. Scroll down to see it on the timeline.' : 'Saved.';
      }
    }
    else if (a === 'delete') {
      if (!confirm('Delete this entry from the timeline?')) return;
      D.events.splice(f.index, 1); persist(); resetForm(); msg = 'Entry deleted.';
    }
    draw();
  });

  // clicking a box on the timeline opens that entry in the form
  document.getElementById('tl').addEventListener('click', ev => {
    const el = ev.target.closest('[data-i]');
    if (!el || !D.events[+el.dataset.i]) return;
    f = fromEvent(D.events[+el.dataset.i], +el.dataset.i); cur = { b: 0, r: 0, who: 'me' }; msg = '';
    draw();
    document.getElementById('ed-form').scrollIntoView({ behavior: 'smooth' });
  });

  const link = document.getElementById('editlink');
  if (link) { link.textContent = 'Done editing'; link.href = location.pathname; }

  const css = document.createElement('style');
  css.textContent = `
    #editor { margin: 16px 0 22px; font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.35; --ink: #4b0a82; }
    #editor h2 { font-size: 20px; margin: 0 0 12px; }
    #editor h3 { font-size: 14px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: .04em; color: #333; }
    #ed-top { border: 2px solid #000; border-radius: 10px 10px 0 0; background: #f3eef9; padding: 12px 14px; }
    #ed-form { border: 2px solid #000; border-top: 0; border-radius: 0 0 10px 10px; background: #fff; padding: 16px 14px; }
    #editor .bar { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; justify-content: space-between; }
    #editor .bartext { flex: 1 1 260px; font-size: 14px; }
    #editor .barbtns { display: flex; flex-wrap: wrap; gap: 6px; }
    #editor .fld { margin: 0 0 18px; }
    #editor .chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 4px 0; }
    #editor button { font: inherit; padding: 7px 12px; min-height: 36px; border: 1.5px solid #000; background: #fff; color: #000; border-radius: 6px; cursor: pointer; }
    #editor button:hover:not(:disabled) { background: #eee; }
    #editor button:focus-visible, #editor summary:focus-visible, #editor input:focus-visible, #editor textarea:focus-visible, #editor select:focus-visible { outline: 3px solid #9b6fd0; outline-offset: 1px; }
    #editor button:disabled { opacity: .4; cursor: default; }
    #editor button.ghost { border-color: #999; font-size: 13px; padding: 5px 10px; min-height: 32px; }
    #editor .chip { display: inline-flex; align-items: center; gap: 6px; border-radius: 99px; }
    #editor .chip.on, #editor .chip.on:hover { background: #000; color: #fff; }
    #editor .chip.add { border-style: dashed; }
    #editor .dot { display: inline-block; width: 13px; height: 13px; border-radius: 50%; border: 1.5px solid #000; flex: none; }
    #editor .chip.on .dot { border-color: #fff; }
    #editor .tchip { display: inline-flex; align-items: center; gap: 6px; border-radius: 99px; border-color: #999; color: #444; }
    #editor .tchip .mark { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid #999; font-weight: bold; line-height: 1; flex: none; }
    #editor .tchip.neg, #editor .tchip.neg:hover { border-color: #0a7a0a; background: #e8f6e8; color: #064d06; }
    #editor .tchip.neg .mark { border-color: #0a7a0a; background: #0a7a0a; color: #fff; }
    #editor .tchip.pos, #editor .tchip.pos:hover { border-color: #b00000; background: #fdeaea; color: #7a0000; }
    #editor .tchip.pos .mark { border-color: #b00000; background: #b00000; color: #fff; }
    #editor textarea, #editor select, #editor input[type=text], #editor input[type=date], #editor input[type=number] { font: inherit; padding: 7px 8px; border: 1.5px solid #000; border-radius: 6px; background: #fff; color: #000; }
    #editor textarea { display: block; width: 100%; margin-top: 6px; }
    #editor input[type=text] { width: 100%; max-width: 26em; }
    #editor input[type=color] { width: 40px; height: 34px; padding: 0; border: 1.5px solid #000; border-radius: 6px; background: #fff; }
    #editor .inl { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 4px 14px 4px 0; }
    #editor .soft { font-size: 13px; color: #333; }
    #editor .hint { font-size: 13px; color: #444; margin: 2px 0 6px; }
    #editor .newp { display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    #editor .newp input[type=text] { width: 11em; }
    #editor .pline { font-size: 13px; margin: 6px 0; display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; }
    #editor .palette { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; margin: 6px 0 10px; padding: 8px; background: #f6f6f6; border-radius: 8px; }
    #editor .parts { display: flex; flex-wrap: wrap; gap: 6px; }
    #editor .part { padding: 6px 8px; min-width: 46px; min-height: 42px; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; }
    #editor .ebox { border: 2px solid #000; background: #fff; padding: 10px; margin: 0 0 8px; }
    #editor .eboxhead { font-weight: bold; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; }
    #editor .erow { display: flex; align-items: center; gap: 8px; padding: 4px 8px; margin: 0 0 6px; border: 1.5px dashed #999; border-radius: 6px; min-height: 44px; cursor: pointer; font-size: 13px; }
    #editor .erow.on { border: 2px solid var(--ink); background: #f4eefb; }
    #editor .erow .row { flex: 1; margin: 0; }
    #editor .erow em { color: #666; }
    #editor .ins { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 8px; font-size: 13px; color: #444; }
    #editor .ins button { padding: 2px 9px; min-height: 30px; display: inline-flex; align-items: center; font-size: 12px; border-color: #999; }
    #editor .actions { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; margin: 4px 0 0; }
    #editor .primary, #editor .primary:hover:not(:disabled) { background: var(--ink); color: #fff; border-color: var(--ink); font-weight: bold; }
    #editor .big { padding: 10px 20px; font-size: 16px; }
    #editor .danger { color: #b00000; border-color: #b00000; }
    #editor .msg { font-size: 14px; color: var(--ink); font-weight: bold; }
    #editor .aboutme { margin-top: 10px; }
    #editor .aboutme summary, #editor .list summary { cursor: pointer; font-weight: bold; padding: 4px 0; }
    #editor .about { display: block; margin: 10px 0; }
    #editor .about span { font-weight: bold; font-size: 14px; }
    #editor .list { margin-top: 18px; border-top: 1px solid #ccc; padding-top: 10px; }
    #editor .list table { border-collapse: collapse; width: 100%; font-size: 13px; margin-top: 6px; }
    #editor .list td { border-top: 1px solid #e2e2e2; padding: 5px 8px 5px 0; vertical-align: middle; }
    #editor .list td:first-child { white-space: nowrap; }
    #tl [data-i] { cursor: pointer; }
    #tl .chain[data-i]:hover .box, #tl .lbox[data-i]:hover { outline: 3px solid #9b6fd0; }
  `;
  document.head.appendChild(css);
  host.innerHTML = '<div id="ed-top"></div><div id="ed-form"></div>';
  drawTop();
  draw();
  STIMELINE_RENDER();
})();
