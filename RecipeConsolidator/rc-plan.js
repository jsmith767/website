// Recipe Consolidator, planning layer (loaded after recipe-consolidator.js).
// Adds: tap-to-plan for phones, an "add days" picker, headcount scaling,
// a shopping list driven by the plan, tick-off shopping, and "Share with Julian".
// It wraps functions from recipe-consolidator.js rather than editing them in place.

const HEADCOUNT_KEY = 'recipeConsolidator_headcount';
const SHOPPING_CHECKED_KEY = 'recipeConsolidator_shoppingChecked';
// The julian-smith.org contact form backend: each submission lands in Julian's Google Sheet and inbox
const RC_SHARE_URL = 'https://script.google.com/macros/s/AKfycbzcihZeeABrhymC6GbdR6P9ANYwEo8HdRZHmcmYYLRV_ajQY9LRCiA0KtFOdVO70QU/exec';
const RC_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'prep', 'late-night'];

let rcHeadcount = 0;
let rcShoppingChecked = {};

// Group by aisle unless the person already chose something else
shoppingListSortOrder = 'category';
// Tag filters narrow down (gluten-free AND nut-free) unless the person chose otherwise
tagFilterLogic = 'and';

try {
    rcHeadcount = parseInt(localStorage.getItem(HEADCOUNT_KEY), 10) || 0;
    rcShoppingChecked = JSON.parse(localStorage.getItem(SHOPPING_CHECKED_KEY) || '{}') || {};
} catch (e) {}

// ----------------------------
// Small helpers
// ----------------------------

function rcRecipeById(id) {
    return recipes.find(r => String(r.id) === String(id));
}

function rcDateStr(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function rcShortDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Lower bound of a servings string: "4", "4-6", "Serves 8" -> 4, 4, 8 */
function rcServingsNumber(recipe) {
    const m = String(recipe && recipe.servings || '').match(/\d+(\.\d+)?/);
    const n = m ? parseFloat(m[0]) : 0;
    return n > 0 ? n : 0;
}

function rcRound(n, step) {
    return Math.round(n / step) * step;
}

// ----------------------------
// What goes on the shopping list
// ----------------------------

/** How many times each recipe is cooked in the plan. A copy in a Prep slot is the same food, so it is not counted twice. */
function rcPlanCounts() {
    const counts = {};
    const prepOnly = new Set();
    for (const date of selectedDays) {
        const day = mealPlan[date] || {};
        for (const meal of Object.keys(day)) {
            if (!Array.isArray(day[meal])) continue;
            for (const id of day[meal]) {
                if (meal === 'prep') prepOnly.add(String(id));
                else counts[String(id)] = (counts[String(id)] || 0) + 1;
            }
        }
    }
    for (const id of prepOnly) if (!counts[id]) counts[id] = 1;
    return counts;
}

/** The recipes and multipliers the list is built from: the plan if it has recipes, otherwise the ticked recipes */
function rcShoppingSelection() {
    const counts = rcPlanCounts();
    const fromPlan = Object.keys(counts).length > 0;
    const ids = fromPlan
        ? Object.keys(counts).map(k => rcRecipeById(k)).filter(Boolean).map(r => r.id)
        : Array.from(activeRecipeIds).filter(id => rcRecipeById(id));
    const multipliers = {};
    const unscaled = [];
    for (const id of ids) {
        const recipe = rcRecipeById(id);
        let m = (recipeMultipliers[id] || 1) * (fromPlan ? counts[String(id)] : 1);
        if (rcHeadcount > 0) {
            const serves = rcServingsNumber(recipe);
            if (serves) m *= rcHeadcount / serves;
            else unscaled.push(recipe.name);
        }
        multipliers[id] = Math.max(rcRound(m, 0.1), 0.1);
    }
    return { fromPlan, ids, multipliers, unscaled, counts };
}

/** Run a function from recipe-consolidator.js against the shopping selection instead of the ticked recipes */
function rcWithSelection(fn) {
    const sel = rcShoppingSelection();
    const savedActive = activeRecipeIds;
    const savedMultipliers = recipeMultipliers;
    activeRecipeIds = new Set(sel.ids);
    recipeMultipliers = Object.assign({}, savedMultipliers, sel.multipliers);
    try {
        return fn(sel);
    } finally {
        activeRecipeIds = savedActive;
        recipeMultipliers = savedMultipliers;
    }
}

const rcOriginalConsolidate = consolidateIngredients;
consolidateIngredients = function () {
    return rcWithSelection(() => rcOriginalConsolidate());
};

const rcOriginalDownloadShoppingList = downloadShoppingList;
downloadShoppingList = function () {
    return rcWithSelection(() => rcOriginalDownloadShoppingList());
};

function rcRefreshShopping() {
    consolidateIngredients();
    updateShoppingList();
    updateTabBadges();
    rcUpdatePlanSummary();
}

// Every change to the plan goes through saveMealPlan, so refresh the list from there
const rcOriginalSaveMealPlan = saveMealPlan;
saveMealPlan = function () {
    rcOriginalSaveMealPlan();
    rcRefreshShopping();
};

const rcOriginalUpdateTabBadges = updateTabBadges;
updateTabBadges = function () {
    rcOriginalUpdateTabBadges();
    const el = document.getElementById('tab-active-count');
    if (!el) return;
    const n = rcShoppingSelection().ids.length;
    el.textContent = n;
    el.style.display = n > 0 ? 'inline' : 'none';
};

// ----------------------------
// Headcount
// ----------------------------

function rcSetHeadcount(value) {
    const n = parseInt(value, 10);
    rcHeadcount = n > 0 ? Math.min(n, 999) : 0;
    try { localStorage.setItem(HEADCOUNT_KEY, String(rcHeadcount)); } catch (e) {}
    document.querySelectorAll('.rc-headcount-input').forEach(i => { if (document.activeElement !== i) i.value = rcHeadcount || ''; });
    rcRefreshShopping();
}

function rcUpdatePlanSummary() {
    const el = document.getElementById('rcPlanSummary');
    if (!el) return;
    const days = selectedDays.size;
    let meals = 0;
    for (const date of selectedDays) {
        const day = mealPlan[date] || {};
        for (const meal of Object.keys(day)) if (meal !== 'prep' && Array.isArray(day[meal]) && day[meal].length) meals++;
    }
    const recipesInPlan = Object.keys(rcPlanCounts()).length;
    el.textContent = days
        ? `${days} day${days !== 1 ? 's' : ''} · ${meals} meal${meals !== 1 ? 's' : ''} · ${recipesInPlan} recipe${recipesInPlan !== 1 ? 's' : ''}`
        : '';
}

// ----------------------------
// Sheets (picker, add days, share)
// ----------------------------

function rcOpenPicker(title, bodyHtml) {
    document.getElementById('rcPickerTitle').textContent = title;
    document.getElementById('rcPickerBody').innerHTML = bodyHtml;
    document.getElementById('rcPicker').classList.add('open');
    document.body.classList.add('rc-sheet-open');
}

function rcClosePicker() {
    document.getElementById('rcPicker').classList.remove('open');
    if (!document.querySelector('.rc-sheet.open')) document.body.classList.remove('rc-sheet-open');
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('rcPicker')?.classList.contains('open')) rcClosePicker();
});

// ----------------------------
// Add days
// ----------------------------

addDayToPlanner = function () {
    const sorted = Array.from(selectedDays).sort();
    let start;
    if (sorted.length) {
        start = new Date(sorted[sorted.length - 1] + 'T00:00:00');
        start.setDate(start.getDate() + 1);
    } else {
        // Default to the coming Friday: weekend retreats and gatherings are the common case
        start = new Date();
        start.setDate(start.getDate() + ((5 - start.getDay() + 7) % 7));
    }
    const defaultDays = sorted.length ? 1 : 3;
    const dayOptions = [1, 2, 3, 4, 5, 6, 7, 10, 14]
        .map(n => `<option value="${n}" ${n === defaultDays ? 'selected' : ''}>${n} day${n !== 1 ? 's' : ''}</option>`).join('');
    const mealBoxes = RC_MEAL_TYPES.map(m => `
        <label class="rc-check-chip">
            <input type="checkbox" name="rcMeal" value="${m}" ${['breakfast', 'lunch', 'dinner'].includes(m) ? 'checked' : ''}>
            <span>${capitalizeMealType(m)}</span>
        </label>`).join('');

    rcOpenPicker('Add days', `
        <div class="rc-form-grid">
            <label class="rc-field"><span>Starting</span>
                <input type="date" id="rcAddDaysStart" value="${rcDateStr(start)}">
            </label>
            <label class="rc-field"><span>For</span>
                <select id="rcAddDaysCount" class="rc-select">${dayOptions}</select>
            </label>
        </div>
        <div class="rc-field"><span>Meals each day</span>
            <div class="rc-chip-row">${mealBoxes}</div>
        </div>
        <div class="rc-sheet-actions">
            <button class="btn btn-secondary" onclick="rcClosePicker()">Cancel</button>
            <button class="btn" onclick="rcConfirmAddDays()">Add days</button>
        </div>
    `);
};

function rcConfirmAddDays() {
    const startVal = document.getElementById('rcAddDaysStart').value;
    const count = parseInt(document.getElementById('rcAddDaysCount').value, 10) || 1;
    const meals = Array.from(document.querySelectorAll('input[name="rcMeal"]:checked')).map(i => i.value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startVal)) {
        showMessage('Pick a start date', 'error');
        return;
    }
    const d = new Date(startVal + 'T00:00:00');
    for (let i = 0; i < count; i++) {
        const key = rcDateStr(d);
        if (!mealPlan[key]) mealPlan[key] = {};
        for (const m of meals) if (!Array.isArray(mealPlan[key][m])) mealPlan[key][m] = [];
        selectedDays.add(key);
        d.setDate(d.getDate() + 1);
    }
    rcClosePicker();
    saveMealPlan();
    updateDayPlanner();
    showMessage(`Added ${count} day${count !== 1 ? 's' : ''}`, 'success');
}

function rcAddMealSlot(date, meal) {
    if (!mealPlan[date]) mealPlan[date] = {};
    if (!Array.isArray(mealPlan[date][meal])) mealPlan[date][meal] = [];
    saveMealPlan();
    updateDayPlanner();
}

// ----------------------------
// Tap to plan: choose a recipe for a meal
// ----------------------------

function rcOpenRecipePicker(date, meal) {
    const shortlisted = recipes.filter(r => activeRecipeIds.has(r.id)).sort((a, b) => a.name.localeCompare(b.name));
    const others = recipes.filter(r => !activeRecipeIds.has(r.id)).sort((a, b) => a.name.localeCompare(b.name));
    const row = r => `
        <button class="rc-pick-row" data-name="${escapeHtml(r.name.toLowerCase())}" onclick="rcPickRecipe('${date}', '${meal}', '${r.id}')">
            <span class="rc-pick-name">${escapeHtml(r.name)}</span>
            <span class="rc-pick-meta">${(r.tags || []).slice(0, 2).map(t => escapeHtml(t)).join(' · ')}</span>
        </button>`;
    rcOpenPicker(`${capitalizeMealType(meal)} · ${rcShortDate(date)}`, `
        <input type="search" class="rc-pick-search" placeholder="Search recipes…" oninput="rcFilterPicker(this.value)" autocomplete="off">
        <div class="rc-pick-list">
            ${shortlisted.length ? `<div class="rc-pick-group">Shortlisted</div>${shortlisted.map(row).join('')}` : ''}
            ${others.length ? `<div class="rc-pick-group">${shortlisted.length ? 'All recipes' : 'Recipes'}</div>${others.map(row).join('')}` : ''}
            ${recipes.length ? '' : '<p class="rc-hint">No recipes yet. Add some on the Recipes tab first.</p>'}
        </div>
    `);
}

function rcFilterPicker(q) {
    const query = q.trim().toLowerCase();
    document.querySelectorAll('#rcPickerBody .rc-pick-row').forEach(b => {
        b.style.display = !query || b.dataset.name.includes(query) ? '' : 'none';
    });
    document.querySelectorAll('#rcPickerBody .rc-pick-group').forEach(g => { g.style.display = query ? 'none' : ''; });
}

function rcPickRecipe(date, meal, idStr) {
    const recipe = rcRecipeById(idStr);
    if (!recipe) return;
    if (!mealPlan[date]) mealPlan[date] = {};
    if (!Array.isArray(mealPlan[date][meal])) mealPlan[date][meal] = [];
    mealPlan[date][meal].push(recipe.id);
    if (!activeRecipeIds.has(recipe.id)) {
        activeRecipeIds.add(recipe.id);
        if (!recipeMultipliers[recipe.id]) recipeMultipliers[recipe.id] = 1;
        saveActiveRecipes();
        saveRecipeMultipliers();
        updateRecipeList();
    }
    rcClosePicker();
    saveMealPlan();
    updateDayPlanner();
}

/** From "Not planned yet": choose which day and meal a recipe goes in */
function rcOpenSlotPicker(idStr) {
    const recipe = rcRecipeById(idStr);
    if (!recipe) return;
    const days = Array.from(selectedDays).sort();
    if (!days.length) {
        showMessage('Add some days first', 'warning');
        addDayToPlanner();
        return;
    }
    const body = days.map(date => {
        const meals = Object.keys(mealPlan[date] || {}).filter(m => Array.isArray(mealPlan[date][m]));
        const buttons = (meals.length ? meals : ['breakfast', 'lunch', 'dinner']).map(m =>
            `<button class="rc-chip-btn" onclick="rcPickRecipe('${date}', '${m}', '${recipe.id}')">${capitalizeMealType(m)}</button>`).join('');
        return `<div class="rc-slot-day"><div class="rc-slot-day-name">${rcShortDate(date)}</div><div class="rc-chip-row">${buttons}</div></div>`;
    }).join('');
    rcOpenPicker(`Plan ${recipe.name}`, body);
}

// Planner: add tap controls next to the drag-and-drop ones
const rcOriginalUpdateDayPlanner = updateDayPlanner;
updateDayPlanner = function () {
    rcOriginalUpdateDayPlanner();
    const container = document.getElementById('dayPlannerContainer');
    if (!container) return;

    if (selectedDays.size === 0) {
        container.innerHTML = `
            <div class="empty-state rc-plan-empty">
                <i class="fas fa-calendar-alt"></i>
                <p><strong>${document.documentElement.classList.contains('rc-trip-mode') ? 'Plan the days of your trip.' : "Plan the days you're cooking for."}</strong></p>
                <p class="rc-hint">Add your days, then tap <strong>+ Add recipe</strong> in each meal.<br>Your shopping list follows the plan.</p>
                <button class="btn" onclick="addDayToPlanner()"><i class="fas fa-plus"></i> Add days</button>
            </div>`;
    }

    container.querySelectorAll('.meal-slot').forEach(slot => {
        const date = slot.dataset.date;
        const meal = slot.dataset.meal;
        const content = slot.querySelector('.meal-slot-content');
        if (!content) return;
        content.querySelectorAll(':scope > div[style*="italic"]').forEach(el => el.remove());
        const add = document.createElement('button');
        add.className = 'rc-slot-add';
        add.innerHTML = '<i class="fas fa-plus"></i> Add recipe';
        add.onclick = () => rcOpenRecipePicker(date, meal);
        content.appendChild(add);
    });

    // Replace "drop meal types here" with tappable chips for the meals a day does not have yet
    container.querySelectorAll('.day-drop-zone.empty').forEach(zone => {
        const date = zone.dataset.date;
        const have = Object.keys(mealPlan[date] || {}).filter(m => Array.isArray(mealPlan[date][m]));
        const missing = RC_MEAL_TYPES.filter(m => !have.includes(m));
        zone.classList.add('rc-add-meals');
        zone.style.minHeight = '';
        zone.innerHTML = missing.length
            ? missing.map(m => `<button class="rc-chip-btn" onclick="rcAddMealSlot('${date}', '${m}')"><i class="fas fa-plus"></i> ${capitalizeMealType(m)}</button>`).join('')
            : '';
        if (!missing.length) zone.style.display = 'none';
    });

    container.querySelectorAll('.remove-day').forEach(b => { b.textContent = 'Remove'; });

    document.querySelectorAll('#unplannedRecipes .unplanned-recipe').forEach(chip => {
        chip.onclick = () => rcOpenSlotPicker(chip.dataset.recipeId);
        chip.title = 'Tap to put it in a meal';
    });
    const unplannedWrap = document.querySelector('.rc-unplanned');
    if (unplannedWrap) unplannedWrap.style.display = document.querySelector('#unplannedRecipes .unplanned-recipe') ? '' : 'none';

    rcUpdatePlanSummary();
};

// ----------------------------
// Shopping list: aisles, clean names, tick off
// ----------------------------

const RC_AISLES = [
    ['Produce', ['Vegetables', 'Fruits']],
    ['Grains & bread', ['Grains & Bread']],
    ['Beans, nuts & seeds', ['Legumes & Nuts']],
    ['Pantry', ['Pantry Staples']],
    ['Oils', ['Oils & Fats']],
    ['Spices & herbs', ['Spices & Seasonings']],
    ['Dairy & eggs', ['Dairy & Eggs']],
    ['Meat & fish', ['Meat & Seafood']],
    ['Drinks', ['Beverages']],
    ['Other', ['Other']],
    ['You make these (recipes)', []]
];

const RC_CONTAINER_WORDS = ['bunch', 'head', 'package', 'can', 'jar', 'bag', 'block', 'box', 'sprig', 'handful', 'pinch', 'stalk'];
const RC_LEADING_PREP = /^(freshly\s+)?(chopped|minced|diced|sliced|grated|crushed|shredded|squeezed|cooked|toasted|packed)\s+/i;
const RC_LEADING_SIZE = /^(large|small|medium|heaping|scant|well-stirred|of)\s+/i;

/** "(8 ounce) package tempeh" -> tempeh / package / "8 ounce"; "avocados, pits removed…" -> Avocados / "pits removed…" */
function rcCleanIngredientName(raw) {
    let s = String(raw || '').trim();
    const notes = [];
    let container = '';

    const lead = s.match(/^\(([^)]*)\)\s*(.*)$/);
    if (lead) { notes.push(lead[1]); s = lead[2]; }

    const comma = s.indexOf(',');
    if (comma > 0) { notes.push(s.slice(comma + 1).trim()); s = s.slice(0, comma).trim(); }

    s = s.replace(/\s*\(([^)]*)\)/g, (_, inner) => { notes.push(inner); return ''; }).trim();

    const or = s.toLowerCase().indexOf(' or ');
    if (or > 0) { notes.push(s.slice(or + 1).trim()); s = s.slice(0, or).trim(); }

    s = s.replace(RC_LEADING_PREP, '');
    while (RC_LEADING_SIZE.test(s)) s = s.replace(RC_LEADING_SIZE, '');
    const firstWord = s.split(/\s+/)[0].toLowerCase().replace(/s$/, '');
    if (RC_CONTAINER_WORDS.includes(firstWord) && s.split(/\s+/).length > 1) {
        container = firstWord;
        s = s.split(/\s+/).slice(1).join(' ');
    }
    if (/^grinds?\s+/i.test(s)) s = s.replace(/^grinds?\s+/i, '');

    s = s.trim() || String(raw || '').trim();
    return {
        name: s.charAt(0).toUpperCase() + s.slice(1),
        note: notes.map(n => n.replace(/^[,;\s]+|[,;\s]+$/g, '')).filter(Boolean).join('; '),
        container
    };
}

function rcPluralContainer(word, qty) {
    if (!(qty > 1)) return word;
    return /(ch|sh|x)$/.test(word) ? word + 'es' : word + 's';
}

/** Amounts may arrive as numbers or as already formatted text ("1 1/5", "3/8") */
function rcParseQty(q) {
    if (typeof q === 'number') return q;
    const str = String(q == null ? '' : q).trim();
    const m = str.match(/^(\d+(?:\.\d+)?)?\s*(?:(\d+)\/(\d+))?$/);
    if (!m || (!m[1] && !m[2])) return NaN;
    return (m[1] ? parseFloat(m[1]) : 0) + (m[2] ? parseInt(m[2], 10) / parseInt(m[3], 10) : 0);
}

// Things you buy whole: round up, and say "3 heads" rather than "3 head"
const RC_WHOLE_UNITS = ['', 'count', 'whole', 'head', 'bunch', 'bundle', 'can', 'cans', 'jar', 'package', 'bag', 'block', 'box', 'clove', 'stalk', 'sprig'];

function rcPluralUnit(unit, qty) {
    if (!unit || !(qty > 1) || /s$/.test(unit)) return unit;
    if (/(ch|sh|x)$/.test(unit)) return unit + 'es';
    return unit + 's';
}

/** Shopping amounts do not need kitchen precision: 1.04 -> 1, 0.83 -> 7/8, 4.75 heads -> 5 heads */
function rcShopRound(qty, unit) {
    const n = rcParseQty(qty);
    if (!isFinite(n) || n <= 0) return qty;
    if (RC_WHOLE_UNITS.includes((unit || '').toLowerCase())) return Math.max(1, Math.ceil(n - 0.05));
    if (n >= 10) return Math.round(n);
    if (n >= 1) return rcRound(n, 0.25);
    return Math.max(rcRound(n, 0.125), 0.125);
}

function rcFormatQty(qty, unit) {
    let u = unit || '';
    if (u === 'count' || u === 'whole') u = '';
    const rounded = rcShopRound(qty, u);
    const text = typeof rounded === 'number' ? formatQuantity(rounded) : rounded;
    return `${text} ${rcPluralUnit(u, typeof rounded === 'number' ? rounded : rcParseQty(rounded))}`.trim();
}

/** Quantity text for a consolidated item (same rules as renderShoppingListItem, minus the fl oz extras) */
function rcQuantityText(item) {
    if (item.displayQuantity !== undefined && item.displayUnit !== undefined) {
        return { text: rcFormatQty(item.displayQuantity, item.displayUnit), qty: item.displayQuantity, unit: item.displayUnit };
    }
    if (item.groupedQuantities && item.groupedQuantities.length > 0) {
        return { text: item.groupedQuantities.map(gq => rcFormatQty(gq.displayQuantity, gq.displayUnit)).join(' + ') };
    }
    let totalBase = 0;
    let unitType = null;
    for (const q of item.quantities || []) {
        if (q.unitType !== 'count') {
            totalBase += convertToBaseUnit(q.originalQuantity || q.value, q.originalUnit || q.unit, q.unitType).value;
            if (!unitType) unitType = q.unitType;
        }
    }
    if (unitType && totalBase > 0) {
        const c = convertToPreferredUnitSystem(totalBase, unitType);
        return { text: rcFormatQty(c.displayQuantity, c.displayUnit) };
    }
    const parts = (item.quantities || []).map(q => rcFormatQty(q.originalQuantity || q.value, q.originalUnit || q.unit));
    const total = (item.quantities || []).reduce((sum, q) => sum + (q.originalQuantity || q.value || 0), 0);
    return { text: parts.join(' + '), qty: total, unit: (item.quantities || [])[0]?.originalUnit };
}

// Fixes for the generic keyword categories, checked first (e.g. "coconut milk" is not dairy)
const RC_AISLE_OVERRIDES = [
    ['Produce', /\b(onions?|shallots?|leeks?|garlic(?! powder)|cilantro|parsley|basil|dill|mint|rosemary|thyme sprigs|jalape[nñ]os?|ginger root|fresh ginger|lemon juice|lime juice|orange juice|scallions?)\b/i],
    ['Pantry', /\b(coconut milk|almond milk|oat milk|soy milk|plant milk|salsa|tahini|applesauce|nut butter|almond butter|peanut butter|tamari|soy sauce|vinegar|mustard|miso|tempeh|tofu|broth|stock)\b/i],
];
const RC_NOT_BOUGHT = /^(water|hot water|cold water|ice|ice water)$/i;

function rcAisleFor(item) {
    const name = item.originalName || item.name || '';
    // An ingredient that is one of your own recipes (a sauce, a dressing) is made, not bought
    if (recipes.some(r => r.name.toLowerCase() === name.trim().toLowerCase())) return 'You make these (recipes)';
    if (/powder|ground|dried/i.test(name) === false) {
        for (const [aisle, re] of RC_AISLE_OVERRIDES) if (re.test(name)) return aisle;
    } else if (RC_AISLE_OVERRIDES[1][1].test(name)) {
        return 'Pantry';
    }
    const cat = getIngredientCategory(name) || 'Other';
    // Dried and instant foods live in the pantry aisle, not with fresh produce
    if (cat !== 'Spices & Seasonings' && /\b(dried|dehydrated|freeze[- ]dried|instant)\b/i.test(name)) return 'Pantry';
    const aisle = RC_AISLES.find(([, cats]) => cats.includes(cat));
    return aisle ? aisle[0] : 'Other';
}

function rcShopItemHtml(item) {
    const clean = rcCleanIngredientName(item.originalName || item.name);
    const q = rcQuantityText(item);
    let qtyText = q.text;
    if (clean.container && (!q.unit || q.unit === 'count' || q.unit === 'whole') && q.qty) {
        const whole = rcShopRound(q.qty, clean.container);
        qtyText = `${formatQuantity(whole)} ${rcPluralContainer(clean.container, whole)}`;
    } else if (clean.container) {
        clean.note = [clean.container, clean.note].filter(Boolean).join('; ');
    }
    const sources = [...new Set(item.sources || [])].map(s => s.replace(/\s*\(×[\d.]+\)$/, ''));
    const detail = [sources.join(', '), clean.note].filter(Boolean).join(' · ');
    const key = item.name;
    const checked = !!rcShoppingChecked[key];
    return `
        <label class="shopping-item rc-shop-item${checked ? ' is-checked' : ''}" data-key="${escapeHtml(key)}">
            <input type="checkbox" ${checked ? 'checked' : ''} onchange="rcToggleShopItem(this)">
            <span class="rc-shop-text">
                <span class="shopping-item-name">${escapeHtml(clean.name)}</span>
                ${detail ? `<span class="shopping-item-sources">${escapeHtml(detail)}</span>` : ''}
            </span>
            <span class="shopping-item-quantity">${escapeHtml(qtyText)}</span>
        </label>`;
}

function rcToggleShopItem(input) {
    const row = input.closest('.rc-shop-item');
    const key = row.dataset.key;
    if (input.checked) rcShoppingChecked[key] = true;
    else delete rcShoppingChecked[key];
    try { localStorage.setItem(SHOPPING_CHECKED_KEY, JSON.stringify(rcShoppingChecked)); } catch (e) {}
    // Let the tick show for a moment before the row moves to "Got it"
    row.classList.toggle('is-checked', input.checked);
    setTimeout(updateShoppingList, 250);
}

function rcClearShopTicks() {
    rcShoppingChecked = {};
    try { localStorage.setItem(SHOPPING_CHECKED_KEY, '{}'); } catch (e) {}
    updateShoppingList();
}

updateShoppingList = function () {
    const list = document.getElementById('shoppingList');
    const summary = document.getElementById('rcShopSummary');
    if (!list) return;

    const sel = rcShoppingSelection();
    // Water is never on a shopping list
    const items = Object.values(consolidatedIngredients).filter(i => !RC_NOT_BOUGHT.test(rcCleanIngredientName(i.originalName || i.name).name.trim()));

    if (!sel.ids.length || !items.length) {
        if (summary) summary.innerHTML = '';
        list.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-shopping-basket"></i>
                <p><strong>Nothing to buy yet.</strong></p>
                <p class="rc-hint">Put recipes in your <a href="#planner" onclick="return setActiveTab('planner')">Plan</a>, or tick recipes on the <a href="#recipes" onclick="return setActiveTab('recipes')">Recipes</a> tab.</p>
            </div>`;
        return;
    }

    const byName = (a, b) => rcCleanIngredientName(a.originalName || a.name).name.localeCompare(rcCleanIngredientName(b.originalName || b.name).name);
    const todo = items.filter(i => !rcShoppingChecked[i.name]);
    const done = items.filter(i => rcShoppingChecked[i.name]).sort(byName);

    let html = '';
    if (shoppingListSortOrder === 'category') {
        const groups = {};
        for (const item of todo) (groups[rcAisleFor(item)] = groups[rcAisleFor(item)] || []).push(item);
        for (const [aisle] of RC_AISLES) {
            if (!groups[aisle]) continue;
            html += `<div class="shopping-category-header">${aisle}</div>` + groups[aisle].sort(byName).map(rcShopItemHtml).join('');
        }
    } else {
        html += todo.sort(byName).map(rcShopItemHtml).join('');
    }
    if (!todo.length) html += '<p class="rc-hint rc-shop-done">All done. Everything is in the basket.</p>';
    if (done.length) {
        html += `<div class="shopping-category-header rc-got-header">Got it · ${done.length}<button class="rc-link-btn" onclick="rcClearShopTicks()">Untick all</button></div>`
            + done.map(rcShopItemHtml).join('');
    }
    list.innerHTML = html;

    if (summary) {
        const parts = [];
        if (sel.fromPlan) {
            const days = selectedDays.size;
            parts.push(`From your plan: ${sel.ids.length} recipe${sel.ids.length !== 1 ? 's' : ''} over ${days} day${days !== 1 ? 's' : ''}`);
        } else {
            parts.push(`From ${sel.ids.length} ticked recipe${sel.ids.length !== 1 ? 's' : ''}`);
        }
        if (rcHeadcount > 0) parts.push(`for ${rcHeadcount} ${rcHeadcount === 1 ? 'person' : 'people'}`);
        let text = parts.join(' ') + '.';
        if (!sel.fromPlan) text += ' Add them to the Plan to count each meal.';
        let warn = '';
        if (sel.unscaled.length) {
            warn = `<div class="rc-shop-warn">Not scaled to ${rcHeadcount} people (no serving size): ${sel.unscaled.map(n => escapeHtml(n)).join(', ')}. Edit the recipe to add one.</div>`;
        }
        summary.innerHTML = `<div>${escapeHtml(text)} <span class="rc-shop-count">${done.length} of ${items.length} ticked</span></div>${warn}`;
    }
};

// ----------------------------
// Share a recipe with Julian
// ----------------------------

function rcOpenShare(idStr) {
    const recipe = rcRecipeById(idStr);
    if (!recipe) return;
    rcOpenPicker('Share with Julian', `
        <p class="rc-hint">Sends <strong>${escapeHtml(recipe.name)}</strong> to Julian, who may add it to the starter recipes everyone gets. Leave your name blank to share it anonymously.</p>
        <label class="rc-field"><span>Your name (optional)</span>
            <input type="text" id="rcShareName" maxlength="120" autocomplete="name">
        </label>
        <label class="rc-field"><span>Email (optional, only if you'd like a reply)</span>
            <input type="email" id="rcShareEmail" maxlength="160" autocomplete="email">
        </label>
        <label class="rc-field"><span>Note (optional)</span>
            <textarea id="rcShareNote" rows="3" maxlength="800" placeholder="Where it's from, what it's good for…"></textarea>
        </label>
        <div class="rc-sheet-actions">
            <button class="btn btn-secondary" onclick="rcClosePicker()">Cancel</button>
            <button class="btn" id="rcShareSend" onclick="rcSendShare('${recipe.id}')"><i class="fas fa-paper-plane"></i> Send</button>
        </div>
    `);
}

function rcRecipeAsText(recipe) {
    const lines = [
        `Recipe: ${recipe.name}`,
        recipe.servings ? `Serves: ${recipe.servings}` : '',
        (recipe.tags || []).length ? `Tags: ${recipe.tags.join(', ')}` : '',
        recipe.sourceTitle ? `Source: ${recipe.sourceTitle}${recipe.sourcePages ? ', pp. ' + recipe.sourcePages : ''}` : '',
        recipe.sourceUrl ? `Source URL: ${recipe.sourceUrl}` : '',
        '',
        'Ingredients:',
        getEditableRecipeText(recipe),
        recipe.about ? `\nAbout:\n${recipe.about}` : '',
        recipe.instructions ? `\nPreparation:\n${recipe.instructions}` : ''
    ];
    return lines.filter((l, i) => l !== '' || i === 5).join('\n');
}

async function rcSendShare(idStr) {
    const recipe = rcRecipeById(idStr);
    if (!recipe) return;
    const btn = document.getElementById('rcShareSend');
    const name = document.getElementById('rcShareName').value.trim();
    const email = document.getElementById('rcShareEmail').value.trim();
    const note = document.getElementById('rcShareNote').value.trim();
    const message = [
        '[Recipe Consolidator] A recipe was shared with you',
        note ? `Note: ${note}` : '',
        '',
        rcRecipeAsText(recipe)
    ].filter((l, i) => l !== '' || i === 2).join('\n').slice(0, 4900);

    const form = new FormData();
    form.append('Name', (name || 'Anonymous') + ' (recipe share)');
    form.append('Email', email);
    form.append('Message', message);

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…'; }
    try {
        const res = await fetch(RC_SHARE_URL, { method: 'POST', body: form });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        rcClosePicker();
        showMessage('Sent to Julian. Thank you!', 'success');
    } catch (err) {
        console.error('Share failed:', err);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send'; }
        showMessage("Sorry, that didn't send. Please try again later.", 'error');
    }
}

// Recipe rows show a few useful tags, not all of them (the full set still powers search and filters)
const RC_COURSE_TAGS = ['breakfast', 'lunch', 'dinner', 'main', 'snack', 'dessert', 'soup', 'salad', 'bowl', 'sauce', 'dressing', 'dip', 'hummus', 'add-on'];
const RC_DIET_TAGS = ['gluten-free', 'nut-free', 'soy-free'];
const RC_ROW_TAG_LIMIT = 3;

getRecipeTagsDisplay = function (recipe) {
    const tags = recipe.tags || [];
    if (!tags.length) return '';
    const course = tags.find(t => RC_COURSE_TAGS.includes(t));
    const rank = t => selectedTagFilters.has(t) ? 0 : t === course ? 1 : RC_DIET_TAGS.includes(t) ? 2
        : (RC_COURSE_TAGS.includes(t) || ['vegan', 'oil-free'].includes(t)) ? 4 : 3;
    const shown = tags.slice().sort((a, b) => rank(a) - rank(b) || tags.indexOf(a) - tags.indexOf(b)).slice(0, RC_ROW_TAG_LIMIT);
    const chip = tag => {
        const isSelected = selectedTagFilters.has(tag);
        const safe = escapeHtml(tag).replace(/'/g, '&#39;');
        return `<span class="recipe-tag${isSelected ? ' is-selected' : ''}" onclick="event.stopPropagation(); toggleTagFilter('${safe}')" title="Filter by ${safe}">${escapeHtml(tag)}</span>`;
    };
    const more = tags.length - shown.length;
    return shown.map(chip).join('') + (more > 0 ? `<span class="recipe-tag rc-tag-more">+${more}</span>` : '');
};

// Add a Share button to each recipe's actions
const rcOriginalUpdateRecipeList = updateRecipeList;
updateRecipeList = function () {
    rcOriginalUpdateRecipeList();
    document.querySelectorAll('#rcQuickFilters [data-tag]').forEach(b => {
        b.classList.toggle('is-on', selectedTagFilters.has(b.dataset.tag));
        b.setAttribute('aria-pressed', selectedTagFilters.has(b.dataset.tag) ? 'true' : 'false');
    });
    document.querySelectorAll('#recipeList .recipe-item').forEach(item => {
        const actions = item.querySelector('.recipe-item-actions');
        if (!actions || actions.querySelector('.rc-share-btn')) return;
        const btn = document.createElement('button');
        btn.className = 'recipe-action-btn rc-share-btn';
        btn.title = 'Share with Julian';
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Share';
        btn.onclick = () => rcOpenShare(item.dataset.recipeId);
        const del = actions.querySelector('.danger');
        actions.insertBefore(btn, del || null);
    });
};

// ----------------------------
// Starter recipes: bring new tags and serving sizes into copies people already saved
// ----------------------------

const STARTER_UPDATE_KEY = 'recipeConsolidator_starterUpdate';
const STARTER_UPDATE_VERSION = STARTER_DATA_VERSION;
const STARTER_RENAMES = { 'tahni caesar salad': 'Tahini Caesar Salad' };

async function rcUpdateSavedStarterRecipes() {
    try {
        if (localStorage.getItem(STARTER_UPDATE_KEY) === STARTER_UPDATE_VERSION) return;
        if (!recipes.length) { localStorage.setItem(STARTER_UPDATE_KEY, STARTER_UPDATE_VERSION); return; }
        const res = await fetch('WholeFoods.json?v=' + STARTER_DATA_VERSION);
        if (!res.ok) return;
        const starters = await res.json();
        const byName = {};
        for (const r of starters) byName[r.name.toLowerCase()] = r;
        let changed = false;
        for (const recipe of recipes) {
            const key = recipe.name.toLowerCase();
            if (STARTER_RENAMES[key] && !recipes.some(r => r.name === STARTER_RENAMES[key])) {
                recipe.name = STARTER_RENAMES[key];
                changed = true;
            }
            const starter = byName[recipe.name.toLowerCase()];
            if (!starter) continue;
            const tags = new Set(recipe.tags || []);
            const before = tags.size;
            (starter.tags || []).forEach(t => tags.add(t));
            if (tags.size !== before) { recipe.tags = Array.from(tags); changed = true; }
            if (!recipe.servings && starter.servings) { recipe.servings = starter.servings; changed = true; }
            if (starter.openSteps && !recipe.openSteps) { recipe.openSteps = true; changed = true; }
            if (starter.lockedSteps && !recipe.lockedSteps) { recipe.lockedSteps = true; changed = true; }
        }
        // New trail recipes join libraries that already have the starter set
        const haveNames = new Set(recipes.map(r => r.name.toLowerCase()));
        const hasStarterSet = starters.some(r => haveNames.has(r.name.toLowerCase()));
        if (hasStarterSet) {
            for (const starter of starters) {
                if (!(starter.tags || []).includes('trail') || haveNames.has(starter.name.toLowerCase())) continue;
                recipes.push(Object.assign({}, starter, { id: Date.now() + Math.random() }));
                changed = true;
            }
        }
        localStorage.setItem(STARTER_UPDATE_KEY, STARTER_UPDATE_VERSION);
        if (changed) {
            saveRecipes();
            updateRecipeList();
            updateTagFilters();
            rcRefreshShopping();
        }
    } catch (e) {
        console.warn('Could not update saved starter recipes:', e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(rcUpdateSavedStarterRecipes, 300);
    document.querySelectorAll('.rc-headcount-input').forEach(i => { i.value = rcHeadcount || ''; });
    // The wrapped versions need one pass after the original startup code has loaded everything
    setTimeout(() => {
        updateRecipeList();
        updateDayPlanner();
        rcRefreshShopping();
    }, 0);
});
