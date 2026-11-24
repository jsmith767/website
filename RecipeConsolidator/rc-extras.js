// Recipe Consolidator extras (loaded last): the About guide and scaling a recipe's amounts.

// ----------------------------
// About: how to use it, and what's planned
// ----------------------------

function rcOpenAbout() {
    const trip = document.documentElement.classList.contains('rc-trip-mode');
    rcOpenPicker('About', `
        <div class="rc-about">
            <p class="rc-about-lead">Plan food for a group, a retreat, your family or a backpacking trip, and get one combined shopping list.</p>

            <h3>How to use it</h3>
            <ol class="rc-about-steps">
                <li><strong>Recipes.</strong> Browse or search the library, narrow it down with <strong>Meal</strong>, <strong>Diet</strong>, <strong>Source</strong> (a person or a book) and <strong>Ingredient</strong>, or tap <strong>Has steps</strong> for recipes with written steps. Then tap a recipe for its ingredients, steps and a link to the original. Tap <strong>+ Add</strong> to paste in your own: one ingredient per line, and amounts and units are picked up automatically.</li>
                <li><strong>Plan.</strong> Add your days, then tap <strong>+ Add recipe</strong> in each meal. Set how many people you're feeding and every recipe scales to the group.</li>
                <li><strong>Shop.</strong> One list for the whole plan, grouped by aisle. Tick things off as you shop; ticked items move to the bottom.</li>
                <li><strong>Change a recipe's amount.</strong> Open a recipe's <strong>Ingredients</strong> and use the servings buttons to see it halved, doubled or for any number of people.</li>
                ${trip
                    ? '<li><strong>Trip mode</strong> (you\'re in it): each recipe shows calories, weight and calories per gram; the plan shows calories, food weight and water per person per day; Shop has a pack-by-day list.</li>'
                    : '<li><strong>Trip mode</strong> for backpacking: switch in the ⋯ menu to see calories, weight and water per person per day, and a pack-by-day list.</li>'}
                <li><strong>Share a recipe</strong> with Julian: tick <strong>Also share this recipe with Julian</strong> when you add one, or use the Share button in any recipe. It may be added to the library everyone starts with. Share ingredients freely; for steps, use your own words or link to the original.</li>
                <li><strong>Install it</strong> like an app: in Safari tap Share → Add to Home Screen (on Android, the ⋯ menu). It then works offline too.</li>
            </ol>

            <h3>Your data</h3>
            <p>Your recipes, plans and lists are saved in this browser on this device. Nothing is uploaded unless you press Share, or you're part of Sahale and sign in (the <strong>Sahale</strong> button at the top): then your recipes are also saved on Sahale's own server, so they follow you to any device where you sign in. Use <strong>⋯ → Export</strong> to keep a copy or move it to another device.</p>

            <h3>Coming next</h3>
            <ul class="rc-about-list">
                <li><strong>Pantry.</strong> Keep track of what's in stock, low or out, so recipes skip what you already have and show what you can make right now.</li>
                <li><strong>Community grocery list.</strong> A shared list for a household or community: say "oats are low" in the group chat and it's added. Tap an NFC tag or scan a QR code on the shelf to mark something low.</li>
                <li><strong>Smarter shopping.</strong> Suggest recipes that reuse what you're already buying (less waste), easy substitutions, and amounts rounded to what you actually buy.</li>
                <li><strong>For trips.</strong> A home prep list (cook, dehydrate, bag) and stove fuel estimates.</li>
                <li><strong>Later.</strong> Syncing between devices, and an optional assistant for adding recipes by voice or chat.</li>
            </ul>

            <h3>Credits</h3>
            <p>Many recipes come from <strong>Ava and Charlie's Digital Cookbook</strong> (tap their chip to see them). Recipes from websites and books have steps written in our own words, with a link to the original. Made by <a href="../index.html">Julian Smith</a>.</p>
        </div>
        <div class="rc-sheet-actions">
            <button class="btn" onclick="rcClosePicker()">Got it</button>
        </div>
    `);
}

// ----------------------------
// Adjust a recipe's amount (in the Ingredients view)
// ----------------------------

let rcScaleState = { id: null, factor: 1 };

showIngredientsModal = function (recipeId) {
    const recipe = rcRecipeById(recipeId);
    if (!recipe) return;
    rcScaleState = { id: recipe.id, factor: recipeMultipliers[recipe.id] || 1 };
    document.getElementById('ingredientsModalTitle').textContent = recipe.name;
    rcRenderScaledIngredients();
    document.getElementById('ingredientsModal').classList.add('active');
    document.body.style.overflow = 'hidden';
};

function rcSetScale(factor) {
    rcScaleState.factor = Math.min(Math.max(Math.round(factor * 100) / 100, 0.25), 50);
    rcRenderScaledIngredients();
}

function rcStepServings(delta) {
    const recipe = rcRecipeById(rcScaleState.id);
    const serves = rcServingsNumber(recipe);
    if (!serves) return rcSetScale(rcScaleState.factor + delta * 0.5);
    const current = Math.round(serves * rcScaleState.factor);
    rcSetScale(Math.max(1, current + delta) / serves);
}

function rcSetServingsTo(value) {
    const recipe = rcRecipeById(rcScaleState.id);
    const serves = rcServingsNumber(recipe);
    const n = parseFloat(value);
    if (serves && n > 0) rcSetScale(n / serves);
}

/** Amounts for cooking: keep normal kitchen fractions */
function rcCookQty(qty) {
    if (!isFinite(qty) || qty <= 0) return '';
    if (qty >= 10) return String(Math.round(qty));
    return formatQuantity(Math.round(qty * 8) / 8);
}

/** Short kitchen units, plural where needed: 1 tbsp, 6 tbsp, 1 cup, 2 cups */
function rcCookUnit(unit, qty) {
    if (!unit) return '';
    const u = String(unit).toLowerCase().replace(/\.$/, '');
    const SHORT = { tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbs: 'tbsp', t: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp',
        ounce: 'oz', ounces: 'oz', oz: 'oz', pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb', gram: 'g', grams: 'g', g: 'g', kilogram: 'kg', kilograms: 'kg', kg: 'kg',
        milliliter: 'ml', milliliters: 'ml', ml: 'ml', liter: 'L', liters: 'L', l: 'L', c: 'cup', cups: 'cup', cup: 'cup' };
    const base = SHORT[u] || u;
    if (qty > 1 && ['cup', 'pinch', 'clove', 'can', 'jar', 'bunch', 'head', 'package', 'slice', 'stalk', 'sprig'].includes(base.replace(/s$/, ''))) {
        const one = base.replace(/s$/, '');
        return /(ch|sh)$/.test(one) ? one + 'es' : one + 's';
    }
    return base;
}

function rcRenderScaledIngredients() {
    const recipe = rcRecipeById(rcScaleState.id);
    const body = document.getElementById('ingredientsModalBody');
    if (!recipe || !body) return;
    const f = rcScaleState.factor;
    const serves = rcServingsNumber(recipe);
    const chip = (v, label) => `<button class="rc-chip-btn${Math.abs(f - v) < 0.001 ? ' is-on' : ''}" onclick="rcSetScale(${v})">${label}</button>`;
    const rows = (recipe.ingredients || []).map(ing => {
        const q = Number(ing.quantity);
        const qty = isFinite(q) && q > 0 ? rcCookQty(q * f) : '';
        const unit = rcCookUnit(ing.unit, isFinite(q) ? q * f : 0);
        const notes = ing.notes || ing.preparation || '';
        return `<li><span class="rc-ing-qty">${escapeHtml([qty, unit].filter(Boolean).join(' '))}</span><span class="rc-ing-name">${escapeHtml(ing.ingredient || '')}${notes ? `<small>${escapeHtml(notes)}</small>` : ''}</span></li>`;
    }).join('');
    const inPlan = recipeMultipliers[recipe.id] || 1;
    body.innerHTML = `
        <div class="rc-scale">
            ${serves ? `
            <div class="rc-scale-servings">
                <span>Serves</span>
                <button class="rc-icon-btn" onclick="rcStepServings(-1)" aria-label="Fewer servings"><i class="fas fa-minus"></i></button>
                <input type="number" inputmode="numeric" min="1" value="${Math.round(serves * f * 10) / 10}" onchange="rcSetServingsTo(this.value)" aria-label="Servings">
                <button class="rc-icon-btn" onclick="rcStepServings(1)" aria-label="More servings"><i class="fas fa-plus"></i></button>
            </div>` : ''}
            <div class="rc-chip-row">${chip(0.5, '½×')}${chip(1, '1×')}${chip(2, '2×')}${chip(3, '3×')}</div>
        </div>
        ${f !== 1 ? `<p class="rc-hint">Showing ${rcCookQty(f)}× the original${serves ? ` (serves ${serves})` : ''}.</p>` : ''}
        <ul class="rc-ing-list">${rows || '<li>No ingredients listed.</li>'}</ul>
        <div class="rc-scale-actions">
            ${Math.abs(f - inPlan) > 0.001
                ? `<button class="btn btn-secondary" onclick="rcApplyScale()"><i class="fas fa-shopping-basket"></i> Use ${rcCookQty(f)}× in my shopping list</button>`
                : (inPlan !== 1 ? `<p class="rc-hint">Your shopping list uses ${rcCookQty(inPlan)}× this recipe.</p>` : '')}
            <p class="rc-hint">Tip: setting the number of people in Plan scales every recipe for you; this is for extra or smaller batches on top.</p>
        </div>`;
}

function rcApplyScale() {
    const recipe = rcRecipeById(rcScaleState.id);
    if (!recipe) return;
    setRecipeMultiplier(recipe.id, rcScaleState.factor);
    rcRefreshShopping();
    rcRenderScaledIngredients();
    showMessage(`Shopping list now uses ${rcCookQty(rcScaleState.factor)}× ${recipe.name}`, 'success');
}

// Show an About button in the app bar
document.addEventListener('DOMContentLoaded', () => {
    const bar = document.querySelector('.rc-appbar-inner');
    const tabs = bar && bar.querySelector('.rc-workflow-tabs');
    if (!bar || bar.querySelector('.rc-about-btn')) return;
    const b = document.createElement('button');
    b.className = 'rc-icon-btn rc-about-btn';
    b.setAttribute('aria-label', 'About and how to use');
    b.title = 'About';
    b.innerHTML = '<i class="fas fa-info"></i>';
    b.addEventListener('click', rcOpenAbout);
    bar.insertBefore(b, tabs || null);
});

// ----------------------------
// "Also share with Julian" when saving a recipe
// ----------------------------

const rcBaseConfirmReview = confirmIngredientReview;
confirmIngredientReview = function () {
    const box = document.getElementById('rcShareOnSave');
    const sahaleBox = document.getElementById('rcSahaleShareOnSave');
    const signedIn = typeof rcSahale !== 'undefined' && rcSahale.state === 'in';
    // Read now: saving an edit resets the form (and this box) before we get it back
    const shareWanted = !!(sahaleBox && sahaleBox.checked);
    const wantsShare = !signedIn && !!(box && box.checked);
    const pending = pendingRecipeForReview;
    const editId = pending && pending.id;
    const countBefore = recipes.length;
    const result = rcBaseConfirmReview.apply(this, arguments);
    const saved = editId ? rcRecipeById(editId) : (recipes.length > countBefore ? recipes[recipes.length - 1] : null);
    // Signed in to Sahale: shared with Sahale unless they unticked it
    if (signedIn && saved && sahaleBox) {
        const want = shareWanted ? 'share' : 'private';
        if (saved.sahale !== want) {
            saved.sahale = want;
            saveRecipes();
        }
        if (want === 'share') showMessage('Shared with Sahale: it joins the Sahale recipes once someone else OKs it', 'success');
        sahaleBox.checked = true; // the next new recipe starts shared again
    }
    if (wantsShare) {
        if (saved) setTimeout(() => rcOpenShare(String(saved.id)), 350);
        box.checked = false;
    }
    return result;
};

// Editing a recipe: the Sahale box shows whether it's shared now
// (recipes from before sharing, the starter ones and Sahale's own start unticked)
if (typeof editRecipe === 'function') {
    const rcBaseEditRecipe = editRecipe;
    editRecipe = function (recipeId) {
        const result = rcBaseEditRecipe.apply(this, arguments);
        const r = recipes.find(x => x.id === recipeId);
        const sahaleBox = document.getElementById('rcSahaleShareOnSave');
        if (sahaleBox && r) sahaleBox.checked = r.sahale === 'share';
        return result;
    };
}
if (typeof cancelRecipeEdit === 'function') {
    const rcBaseCancelEdit = cancelRecipeEdit;
    cancelRecipeEdit = function () {
        const result = rcBaseCancelEdit.apply(this, arguments);
        const sahaleBox = document.getElementById('rcSahaleShareOnSave');
        if (sahaleBox) sahaleBox.checked = true;
        return result;
    };
}

// ----------------------------
// Ingredient lines: tidy two common patterns before parsing
//   "2 1/2 to 3 pounds cauliflower"       -> 3 pounds cauliflower — 2 1/2–3 pounds
//   "1 can (15 1/2 ounces) chickpeas"      -> 1 can chickpeas — 15 1/2 ounces
//   "1 (15-ounce) can chickpeas"           -> 1 can chickpeas — 15-ounce
// ----------------------------

const RC_NUM = '\\d+(?:\\.\\d+)?(?:\\s+\\d+\\/\\d+)?|\\d+\\/\\d+|[½¼¾⅓⅔⅛]|\\d+\\s*[½¼¾⅓⅔⅛]';
const RC_RANGE_RE = new RegExp('^\\s*(' + RC_NUM + ')\\s*(?:-|–|—|to)\\s*(' + RC_NUM + ')\\s+(.+)$', 'i');
const RC_CONTAINER = '(?:cans?|jars?|packages?|pkgs?|bags?|boxes?|cartons?|bottles?|blocks?|tins?)';
const RC_CAN_AFTER_RE = new RegExp('^\\s*(' + RC_NUM + ')\\s+(' + RC_CONTAINER + ')\\s*\\(([^)]+)\\)\\s*(.+)$', 'i');
const RC_CAN_BEFORE_RE = new RegExp('^\\s*(' + RC_NUM + ')\\s*\\(([^)]+)\\)\\s*(' + RC_CONTAINER + ')\\s+(.+)$', 'i');

function rcAddNote(line, note) {
    if (/\s[—–]\s/.test(line)) return `${line}; ${note}`;
    // "cauliflower, trimmed" -> keep "trimmed" as a note rather than part of the name
    const comma = line.indexOf(',');
    if (comma > 0) return `${line.slice(0, comma)} — ${line.slice(comma + 1).trim()}; ${note}`;
    return `${line} — ${note}`;
}

function rcTidyIngredientLine(line) {
    let s = String(line || '');
    let m = s.match(RC_CAN_AFTER_RE);
    if (m) s = rcAddNote(`${m[1]} ${m[2]} ${m[4]}`, m[3]);
    m = s.match(RC_CAN_BEFORE_RE);
    if (m) s = rcAddNote(`${m[1]} ${m[3]} ${m[4]}`, m[2]);
    m = s.match(RC_RANGE_RE);
    if (m) {
        // Use the larger amount for shopping, keep the range in the notes
        const unitWord = (m[3].match(/^[a-zA-Z.]+/) || [''])[0];
        s = rcAddNote(`${m[2]} ${m[3]}`, `${m[1]}–${m[2]}${unitWord ? ' ' + unitWord : ''}`);
    }
    return s;
}

const rcBaseParseIngredientLine = parseIngredientLine;
parseIngredientLine = function (line) {
    return rcBaseParseIngredientLine(rcTidyIngredientLine(line));
};

// ----------------------------
// "Has steps" filter: only recipes with written steps in the app
// ----------------------------

const RC_STEPS_ONLY_KEY = 'recipeConsolidator_stepsOnly';
let rcStepsOnly = false;
try { rcStepsOnly = localStorage.getItem(RC_STEPS_ONLY_KEY) === '1'; } catch (e) { /* storage unavailable */ }

function rcHasSteps(recipe) {
    return !!(recipe.instructions && recipe.instructions.trim()) && !rcStepsLocked(recipe);
}

const rcBaseGetSortedRecipes = getSortedRecipes;
getSortedRecipes = function () {
    const list = rcBaseGetSortedRecipes();
    return rcStepsOnly ? list.filter(rcHasSteps) : list;
};

function rcToggleStepsOnly() {
    rcStepsOnly = !rcStepsOnly;
    try { localStorage.setItem(RC_STEPS_ONLY_KEY, rcStepsOnly ? '1' : '0'); } catch (e) { /* storage unavailable */ }
    updateRecipeList();
}

const rcStepsBaseUpdateRecipeList = updateRecipeList;
updateRecipeList = function () {
    rcStepsBaseUpdateRecipeList();
    const chip = document.getElementById('rcStepsChip');
    if (chip) {
        chip.classList.toggle('is-on', rcStepsOnly);
        chip.setAttribute('aria-pressed', rcStepsOnly ? 'true' : 'false');
    }
};

// ----------------------------
// Sahale: send this shopping list to the shared Sahale shopping list
// (shopping.julian-smith.org, part of Cairn). The button only shows for Sahale
// people: anyone who has opened the Consolidator through Cairn's link, which
// ends in ?sahale=1 (?sahale=0 hides it again). The list page shows a checklist
// first, so nothing is added until they confirm there.
// ----------------------------

const RC_SAHALE_KEY = 'recipeConsolidator_sahale';
const RC_SAHALE_LIST = 'https://shopping.julian-smith.org/';

(function rcSahaleButton() {
    try {
        const flag = new URLSearchParams(location.search).get('sahale');
        if (flag === '1') localStorage.setItem(RC_SAHALE_KEY, '1');
        if (flag === '0') localStorage.removeItem(RC_SAHALE_KEY);
        const button = document.getElementById('rcSahaleSend');
        if (button && localStorage.getItem(RC_SAHALE_KEY) === '1') button.style.display = '';
    } catch (e) { /* private mode: no button */ }
})();

// ----------------------------
// Sahale sign-in: Sahale people sign in with the same login as the shopping
// list (Cloudflare Access on shopping.julian-smith.org; same site, so its
// cookie comes along). Signed in, the "Sahale list" button shows and their
// recipes are saved on Sahale's server, so they follow them to any device.
//
// Sync: the server keeps the whole library with a revision number. A save
// names the revision it started from; if another device saved since, the
// server says so and the two are merged (by recipe, this device's copy
// winning) before saving again. Nothing is uploaded for people who never sign in.
// ----------------------------

// (A test copy of the server can be named in localStorage 'rc_sahale_api'.)
const RC_SAHALE_API = (() => { try { return localStorage.getItem('rc_sahale_api'); } catch (e) { return null; } })() || 'https://shopping.julian-smith.org';
const RC_SYNC_KEY = 'recipeConsolidator_sahaleSync'; // { who, rev, dirty, device, at }
const rcSahale = { state: 'unknown', name: null, saving: null, timer: null };

function rcSyncState() {
    try { return JSON.parse(localStorage.getItem(RC_SYNC_KEY)) || {}; } catch (e) { return {}; }
}
function rcSetSyncState(patch) {
    const next = { ...rcSyncState(), ...patch };
    try { localStorage.setItem(RC_SYNC_KEY, JSON.stringify(next)); } catch (e) {}
    return next;
}

// A fetch to the shopping server with the person's login. Signed out, Access
// answers with a redirect to its login page, which we stop and report.
async function rcSahaleFetch(path, opts = {}) {
    const res = await fetch(RC_SAHALE_API + path, { credentials: 'include', redirect: 'manual', cache: 'no-store', ...opts });
    if (res.type === 'opaqueredirect' || res.status === 0) {
        const err = new Error('signed out');
        err.signedOut = true;
        throw err;
    }
    return res;
}

// Both libraries in one: by recipe id, then by name; `mine` wins on a clash
function rcMergeLibraries(mine, theirs) {
    const out = [...mine];
    const ids = new Set(mine.map(r => String(r.id)));
    const names = new Set(mine.map(r => String(r.name || '').trim().toLowerCase()));
    for (const r of theirs) {
        if (ids.has(String(r.id)) || names.has(String(r.name || '').trim().toLowerCase())) continue;
        out.push(r);
    }
    return out;
}

// Where this device's copy of a recipe gives way to the saved copy (same name,
// another id), point the plan, notes, active set and servings at the saved id
function rcRemapIds(mine, saved) {
    const byName = new Map(saved.map(r => [String(r.name || '').trim().toLowerCase(), r.id]));
    const savedIds = new Set(saved.map(r => String(r.id)));
    const map = new Map();
    for (const r of mine) {
        const to = byName.get(String(r.name || '').trim().toLowerCase());
        if (to !== undefined && !savedIds.has(String(r.id)) && String(to) !== String(r.id)) map.set(String(r.id), to);
    }
    if (!map.size) return;
    const swap = (id) => (map.has(String(id)) ? map.get(String(id)) : id);
    for (const day of Object.values(mealPlan || {})) {
        for (const meal of Object.keys(day || {})) if (Array.isArray(day[meal])) day[meal] = day[meal].map(swap);
    }
    for (const day of Object.values(mealPlanNotes || {})) {
        for (const notes of Object.values(day || {})) {
            for (const key of Object.keys(notes || {})) {
                const parts = key.split('_'); // date_meal_id_index
                if (parts.length >= 4 && map.has(parts[2])) {
                    parts[2] = String(map.get(parts[2]));
                    notes[parts.join('_')] = notes[key];
                    delete notes[key];
                }
            }
        }
    }
    activeRecipeIds = new Set([...activeRecipeIds].map(swap));
    for (const [from, to] of map) {
        if (recipeMultipliers[from] !== undefined) {
            recipeMultipliers[to] = recipeMultipliers[from];
            delete recipeMultipliers[from];
        }
    }
    for (const f of ['saveMealPlan', 'saveActiveRecipes', 'saveRecipeMultipliers']) {
        try { if (typeof window[f] === 'function') window[f](); } catch (e) { console.error(f, e); }
    }
}

// Replace this browser's library with `list` and redraw, without saving it back
function rcUseLibrary(list) {
    recipes = list;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes)); } catch (e) {}
    const ids = new Set(recipes.map(r => r.id));
    activeRecipeIds = new Set([...activeRecipeIds].filter(id => ids.has(id)));
    for (const f of ['saveActiveRecipes', 'consolidateIngredients', 'updateRecipeList', 'updateShoppingList', 'updateTagFilters', 'updateDayPlanner', 'updateTabBadges']) {
        try { if (typeof window[f] === 'function') window[f](); } catch (e) { console.error(f, e); }
    }
}

const rcSameLibrary = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function rcPush(baseRev, list, tries = 2) {
    const st = rcSyncState();
    const res = await rcSahaleFetch('/api/rc/library', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, // no preflight (Access would block it)
        body: JSON.stringify({ baseRev, recipes: list, device: st.device }),
    });
    if (res.status === 409 && tries > 0) {
        // Saved from another device meanwhile: fold theirs in and try again
        const { current } = await res.json();
        const merged = rcMergeLibraries(list, current.recipes);
        if (!rcSameLibrary(merged, recipes)) rcUseLibrary(merged);
        return rcPush(current.rev, merged, tries - 1);
    }
    if (!res.ok) throw new Error('save failed: ' + res.status);
    const { rev } = await res.json();
    rcSetSyncState({ rev, dirty: false, at: new Date().toISOString() });
    return rev;
}

async function rcSyncNow() {
    if (rcSahale.state !== 'in') return;
    if (rcSahale.saving) return rcSahale.saving;
    rcSahale.saving = (async () => {
        try {
            const st = rcSyncState();
            const server = await (await rcSahaleFetch('/api/rc/library')).json();
            if (st.who && st.who !== rcSahale.name) {
                // Someone else signed in on this browser: show their library, don't mix
                rcUseLibrary(server.recipes);
                rcSetSyncState({ who: rcSahale.name, rev: server.rev, dirty: false });
            } else if (!st.who || !st.rev) {
                // First time on this device: what's saved plus what's only here. The
                // saved copy wins where both have a recipe (the starter recipes get
                // different ids on each device), and this device's plan follows it.
                const merged = server.rev ? rcMergeLibraries(server.recipes, recipes) : recipes;
                if (server.rev) rcRemapIds(recipes, server.recipes);
                if (!rcSameLibrary(merged, recipes)) rcUseLibrary(merged);
                rcSetSyncState({ who: rcSahale.name });
                if (!server.rev || !rcSameLibrary(merged, server.recipes)) await rcPush(server.rev, merged);
                else rcSetSyncState({ rev: server.rev, dirty: false });
            } else if (server.rev === st.rev) {
                if (st.dirty) await rcPush(server.rev, recipes);
            } else if (!st.dirty) {
                rcUseLibrary(server.recipes); // changed on another device
                rcSetSyncState({ rev: server.rev });
            } else {
                await rcPush(server.rev, rcMergeLibraries(recipes, server.recipes));
            }
            rcSahale.error = null;
        } catch (e) {
            if (e.signedOut) rcSahale.state = 'out';
            rcSahale.error = e.message;
            console.warn('Sahale sync:', e.message);
        } finally {
            rcSahale.saving = null;
            rcRenderSahaleChip();
        }
    })();
    return rcSahale.saving;
}

// Every save of the library also goes to Sahale (a moment later, batched)
if (typeof saveRecipes === 'function') {
    const rcSaveLocally = saveRecipes;
    saveRecipes = function () {
        rcSaveLocally.apply(this, arguments);
        if (!rcSyncState().who) return; // never signed in here: nothing to sync
        rcSetSyncState({ dirty: true });
        clearTimeout(rcSahale.timer);
        rcSahale.timer = setTimeout(rcSyncNow, 1500);
    };
}

function rcRenderSahaleChip() {
    const chip = document.getElementById('rcSahaleChip');
    if (!chip) return;
    let sahalePerson = false;
    try { sahalePerson = localStorage.getItem(RC_SAHALE_KEY) === '1' || !!rcSyncState().who; } catch (e) {}
    if (rcSahale.state === 'in') {
        chip.hidden = false;
        chip.innerHTML = `<i class="fas ${rcSahale.error ? 'fa-exclamation-circle' : 'fa-cloud'}"></i><span class="rc-hide-narrow"> ${rcEscape(rcSahale.name || 'Sahale')}</span>`;
        chip.title = rcSahale.error ? 'Not saved to Sahale yet: ' + rcSahale.error : 'Signed in to Sahale; recipes saved there';
        if (rcSahale.toOk) {
            chip.innerHTML += ` <span class="rc-sahale-badge" title="Recipes waiting for your OK">${rcSahale.toOk}</span>`;
            chip.title += ` · ${rcSahale.toOk} recipe${rcSahale.toOk === 1 ? '' : 's'} waiting for your OK`;
        }
        const button = document.getElementById('rcSahaleSend');
        if (button) button.style.display = '';
        const shareRow = document.getElementById('rcSahaleShareRow');
        const julianRow = document.getElementById('rcJulianShareRow');
        if (shareRow) shareRow.hidden = false;
        if (julianRow) julianRow.hidden = true;
    } else if (rcSahale.state === 'out' && sahalePerson) {
        chip.hidden = false;
        chip.innerHTML = '<i class="fas fa-sign-in-alt"></i><span class="rc-hide-narrow"> Sahale sign in</span>';
        chip.title = 'Sign in with your Sahale email';
    } else if (rcSahale.state === 'not-listed') {
        chip.hidden = false;
        chip.innerHTML = '<i class="fas fa-user-slash"></i>';
        chip.title = "Signed in, but this email isn't on Sahale's list yet";
    } else {
        chip.hidden = true;
    }
}

function rcEscape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function rcSahaleChipClick() {
    if (rcSahale.state === 'out') {
        location.href = RC_SAHALE_API + '/signin?to=' + encodeURIComponent(location.href);
        return;
    }
    const st = rcSyncState();
    const when = st.at ? new Date(st.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
    const body = rcSahale.state === 'not-listed'
        ? `<p>You're signed in, but your email isn't on Sahale's list yet. Ask Julian to add it.</p>`
        : `<p>Signed in as <strong>${rcEscape(rcSahale.name || '')}</strong>. Your recipes are saved to Sahale, so they're on any device where you sign in.</p>
           <p class="rc-muted">${rcSahale.error ? 'Not saved yet (' + rcEscape(rcSahale.error) + '); it will try again.' : when ? 'Last saved ' + rcEscape(when) + '.' : 'Saving…'}</p>
           <p class="rc-muted">The <strong>Sahale list</strong> button on Shop sends your shopping list to the shared Sahale list.</p>
           <p><button class="btn" onclick="rcOpenSahaleRecipes()"><i class="fas fa-book-open"></i> Sahale recipes${rcSahale.toOk ? ` (${rcSahale.toOk} to OK)` : ''}</button></p>`;
    rcOpenPicker('Sahale', body + `
        <div class="rc-sheet-actions">
            ${rcSahale.state === 'in' ? '<button class="btn btn-quiet" onclick="rcSyncNow(); rcClosePicker()">Save now</button>' : ''}
            <a class="btn btn-quiet" href="${RC_SAHALE_LIST}" target="_blank" rel="noopener">Shopping list</a>
            <button class="btn" onclick="rcClosePicker()">Done</button>
        </div>`);
}

(async function rcSahaleStart() {
    if (!rcSyncState().device) rcSetSyncState({ device: Math.random().toString(36).slice(2, 10) });
    try {
        const res = await rcSahaleFetch('/api/rc/me');
        if (res.status === 403) rcSahale.state = 'not-listed';
        else if (res.ok) {
            rcSahale.state = 'in';
            rcSahale.name = (await res.json()).name;
            try { localStorage.setItem(RC_SAHALE_KEY, '1'); } catch (e) {}
        } else rcSahale.state = 'out';
    } catch (e) {
        rcSahale.state = e.signedOut ? 'out' : 'unknown'; // offline: say nothing
    }
    rcRenderSahaleChip();
    if (rcSahale.state === 'in') {
        rcSyncNow();
        rcLoadSahaleRecipes().catch(() => {});
    }
})();

// ----------------------------
// Sahale recipes: what people shared. A new recipe is shared unless they
// untick "Share with Sahale"; someone else OKs it, then anyone can add it.
// ----------------------------

let rcSahaleRecipes = { ok: [], waiting: [] };

async function rcLoadSahaleRecipes() {
    const res = await rcSahaleFetch('/api/rc/shared');
    if (!res.ok) throw new Error('could not load Sahale recipes: ' + res.status);
    rcSahaleRecipes = await res.json();
    rcSahale.toOk = rcSahaleRecipes.waiting.filter(w => !w.mine).length;
    rcRenderSahaleChip();
    return rcSahaleRecipes;
}

const rcNameKey = (n) => String(n || '').trim().toLowerCase();

function rcSahaleRecipeLine(r) {
    const ing = (r.recipe.ingredients || []).map(i => i.ingredient || i.name || '').filter(Boolean);
    return `<small class="rc-muted">${rcEscape(ing.slice(0, 8).join(', '))}${ing.length > 8 ? '…' : ''}</small>`;
}

async function rcOpenSahaleRecipes() {
    rcOpenPicker('Sahale recipes', '<p class="rc-muted">Loading…</p>');
    try { await rcLoadSahaleRecipes(); } catch (e) {
        rcOpenPicker('Sahale recipes', `<p>Couldn't load them (${rcEscape(e.message)}). Try again in a moment.</p><div class="rc-sheet-actions"><button class="btn" onclick="rcClosePicker()">Close</button></div>`);
        return;
    }
    const have = new Set(recipes.map(r => rcNameKey(r.name)));
    const toOk = rcSahaleRecipes.waiting.filter(w => !w.mine);
    const mineWaiting = rcSahaleRecipes.waiting.filter(w => w.mine);
    const fresh = rcSahaleRecipes.ok.filter(r => !have.has(rcNameKey(r.recipe.name)));
    const row = (inner) => `<li class="rc-sahale-row">${inner}</li>`;
    let html = '';
    if (toOk.length) {
        html += `<h4>Waiting for an OK</h4><p class="rc-muted">Shared by others. If it looks right for Sahale, OK it and it joins the Sahale recipes.</p><ul class="rc-sahale-list">` +
            toOk.map(w => row(`<div><strong>${rcEscape(w.recipe.name)}</strong> <span class="rc-muted">from ${rcEscape(w.by)}</span><br>${rcSahaleRecipeLine(w)}</div>
                <button class="btn" onclick="rcOkSahaleRecipe(${Number(w.id)})">OK</button>`)).join('') + '</ul>';
    }
    if (mineWaiting.length) {
        html += `<h4>Yours, waiting for someone else's OK</h4><ul class="rc-sahale-list">` +
            mineWaiting.map(w => row(`<div><strong>${rcEscape(w.recipe.name)}</strong></div>`)).join('') + '</ul>';
    }
    html += `<h4>Sahale recipes (${rcSahaleRecipes.ok.length})</h4>`;
    if (!rcSahaleRecipes.ok.length) html += `<p class="rc-muted">None yet. Recipes you add are shared unless you untick "Share with Sahale"; once someone else OKs one, it shows here for everyone.</p>`;
    else if (!fresh.length) html += `<p class="rc-muted">You have all of them already.</p>`;
    else html += `<ul class="rc-sahale-list">` + fresh.map(r => row(`<div><strong>${rcEscape(r.recipe.name)}</strong> <span class="rc-muted">from ${rcEscape(r.by)}</span><br>${rcSahaleRecipeLine(r)}</div>
            <button class="btn btn-quiet" onclick="rcAddSahaleRecipes([${Number(r.id)}])">Add</button>`)).join('') + '</ul>' +
        (fresh.length > 1 ? `<p><button class="btn" onclick="rcAddSahaleRecipes(${JSON.stringify(fresh.map(r => Number(r.id)))})">Add all ${fresh.length}</button></p>` : '');
    rcOpenPicker('Sahale recipes', html + `<div class="rc-sheet-actions"><button class="btn" onclick="rcClosePicker()">Done</button></div>`);
}

async function rcOkSahaleRecipe(id) {
    try {
        const res = await rcSahaleFetch(`/api/rc/shared/${id}/ok`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: '{}' });
        const out = await res.json();
        if (!res.ok) throw new Error(out.error || res.status);
        showMessage('OK\'d: it\'s in the Sahale recipes now', 'success');
    } catch (e) {
        showMessage("Couldn't OK it: " + e.message, 'error');
    }
    rcOpenSahaleRecipes();
}

// Copies Sahale recipes into this library (marked as from Sahale, so they aren't shared back)
function rcAddSahaleRecipes(ids) {
    const have = new Set(recipes.map(r => rcNameKey(r.name)));
    let added = 0;
    for (const s of rcSahaleRecipes.ok.filter(r => ids.includes(Number(r.id)))) {
        if (have.has(rcNameKey(s.recipe.name))) continue;
        recipes.push({ ...s.recipe, id: Date.now() + Math.random(), sahale: 'from-sahale' });
        have.add(rcNameKey(s.recipe.name));
        added++;
    }
    if (added) {
        saveRecipes();
        for (const f of ['consolidateIngredients', 'updateRecipeList', 'updateTagFilters', 'updateTabBadges']) {
            try { if (typeof window[f] === 'function') window[f](); } catch (e) { console.error(f, e); }
        }
        showMessage(`Added ${added} Sahale recipe${added === 1 ? '' : 's'}`, 'success');
    }
    rcOpenSahaleRecipes();
}

// Coming back to the tab: pick up changes made on another device
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && rcSahale.state === 'in') rcSyncNow();
});

function rcSendToSahale() {
    // What's on screen, minus anything already ticked off here
    const items = [...document.querySelectorAll('#shoppingList .rc-shop-item:not(.is-checked)')]
        .map(row => [
            (row.querySelector('.shopping-item-name')?.textContent || '').trim(),
            (row.querySelector('.shopping-item-quantity')?.textContent || '').trim(),
        ])
        .filter(([name]) => name)
        .slice(0, 100);
    if (!items.length) {
        showMessage('Nothing to send: the list is empty or everything is ticked off', 'error');
        return;
    }
    const url = RC_SAHALE_LIST + '?add=' + encodeURIComponent(JSON.stringify({ from: 'Recipe Consolidator', items }));
    window.open(url, '_blank', 'noopener');
}
