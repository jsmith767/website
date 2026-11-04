// ============================================
// Recipe Consolidator: filter by category
// One short row (Meal, Diet, Source, Ingredient, Has steps). Each opens a sheet with every option and a count.
// Within a category any option matches; across categories a recipe must match each one.
// Loads after rc-extras.js
// ============================================

const RC_MEAL_TAGS = ['breakfast', 'lunch', 'dinner', 'main', 'side', 'soup', 'salad', 'bowl', 'snack', 'dessert', 'drink', 'sauce', 'dressing', 'dip', 'hummus', 'add-on', 'baking'];
const RC_DIET_FILTER_TAGS = ['trail', 'vegan', 'vegetarian', 'gluten-free', 'nut-free', 'soy-free', 'oil-free'];
// Too common to be useful as an ingredient filter
const RC_PLAIN_INGREDIENTS = ['salt', 'water', 'pepper', 'black pepper', 'sea salt', 'kosher salt', 'ice'];
// Pantry staples and spices: still searchable, but left out of the "Most used" picks
const RC_STAPLE_RE = /\b(salt|pepper|water|ice|oil|sugar|syrup|honey|vanilla|baking (powder|soda)|flour|cinnamon|nutmeg|cumin|paprika|coriander|turmeric|chili powder|cayenne|oregano|thyme|basil|garlic|onion powder|ginger|cardamom|cloves?|extract|yeast|vinegar|soy sauce|tamari|lemon juice|lime juice|egg)s?\b/;

const RC_FILTER_CATEGORIES = [
    { key: 'meal', label: 'Meal', icon: 'fa-utensils' },
    { key: 'diet', label: 'Diet', icon: 'fa-leaf' },
    { key: 'source', label: 'Source', icon: 'fa-book' },
    { key: 'ingredient', label: 'Ingredient', icon: 'fa-carrot' }
];

function rcFilterPeople() {
    return [...new Set(recipes.map(r => r.contributor).filter(Boolean))].sort();
}

function rcFilterSources() {
    const people = rcFilterPeople();
    return [...new Set(recipes.map(r => r.sourceTitle).filter(Boolean))].filter(s => !people.includes(s)).sort();
}

// Which category a tag belongs to. Everything else (15-min, make-ahead, korean…) sits under Diet as "Also"
function rcTagCategory(tag) {
    if (RC_MEAL_TAGS.includes(tag)) return 'meal';
    if (rcFilterPeople().includes(tag) || rcFilterSources().includes(tag)) return 'source';
    if (RC_DIET_FILTER_TAGS.includes(tag)) return 'diet';
    return 'also';
}

function rcTagCounts() {
    const counts = {};
    for (const r of recipes) (r.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    return counts;
}

function rcTagLabel(tag) {
    const t = tag === '15-min' ? '15 min' : tag === '30-min' ? '30 min' : tag;
    return t.charAt(0).toUpperCase() + t.slice(1);
}

function rcSaveTagFilters() {
    try { localStorage.setItem(SELECTED_TAG_FILTERS_KEY, JSON.stringify(Array.from(selectedTagFilters))); } catch (e) { /* storage unavailable */ }
}

// ---- Filtering ----

// The original list filter applies selectedTagFilters with one ANY/ALL rule; this replaces it with per-category rules
let rcCategoryTags = null;

function rcMatchesCategories(recipe, tags) {
    const groups = {};
    for (const t of tags) {
        const cat = rcTagCategory(t);
        (groups[cat] = groups[cat] || []).push(t);
    }
    const recipeTags = recipe.tags || [];
    return Object.values(groups).every(group => group.some(t => recipeTags.includes(t)));
}

const rcFiltersBaseGetSortedRecipes = getSortedRecipes;
getSortedRecipes = function () {
    const list = rcFiltersBaseGetSortedRecipes();
    return rcCategoryTags && rcCategoryTags.size ? list.filter(r => rcMatchesCategories(r, rcCategoryTags)) : list;
};

// Row tags still highlight the selected filters while the list renders
const rcFiltersBaseTagsDisplay = getRecipeTagsDisplay;
getRecipeTagsDisplay = function (recipe) {
    if (!rcCategoryTags) return rcFiltersBaseTagsDisplay(recipe);
    const empty = selectedTagFilters;
    selectedTagFilters = rcCategoryTags;
    try { return rcFiltersBaseTagsDisplay(recipe); } finally { selectedTagFilters = empty; }
};

// Contributor and source chips now live in the Source sheet
rcRenderContributorChips = function () {};

const rcFiltersBaseUpdateRecipeList = updateRecipeList;
updateRecipeList = function () {
    const tags = selectedTagFilters;
    rcCategoryTags = tags;
    selectedTagFilters = new Set();
    try { rcFiltersBaseUpdateRecipeList(); } finally { selectedTagFilters = tags; rcCategoryTags = null; }
    rcRenderFilterBar();
    const list = document.getElementById('recipeList');
    if (list && recipes.length && !list.querySelector('.recipe-item')) {
        list.innerHTML = `<div class="rc-filter-empty">
            <p>No recipes match all of these filters.</p>
            <button class="rc-chip-btn" onclick="rcClearAllFilters()">Clear filters</button>
        </div>`;
    }
};

// ---- The row ----

function rcCategorySelection(key) {
    if (key === 'ingredient') return Array.from(selectedIngredients);
    return Array.from(selectedTagFilters).filter(t => {
        const cat = rcTagCategory(t);
        return key === 'diet' ? (cat === 'diet' || cat === 'also') : cat === key;
    });
}

function rcRenderFilterBar() {
    const row = document.getElementById('rcQuickFilters');
    if (!row) return;
    const buttons = RC_FILTER_CATEGORIES.map(c => {
        const picked = rcCategorySelection(c.key);
        const text = picked.length === 1 ? rcTagLabel(picked[0]) : picked.length > 1 ? `${c.label} · ${picked.length}` : c.label;
        return `<button class="rc-chip-btn rc-cat-btn${picked.length ? ' is-on' : ''}" onclick="rcOpenFilterSheet('${c.key}')" aria-haspopup="dialog">
            <i class="fas ${c.icon}"></i> ${escapeHtml(text)} <i class="fas fa-chevron-down rc-cat-caret"></i>
        </button>`;
    });
    buttons.push(`<button class="rc-chip-btn${rcStepsOnly ? ' is-on' : ''}" id="rcStepsChip" onclick="rcToggleStepsOnly()" aria-pressed="${rcStepsOnly}" title="Only recipes with written steps"><i class="fas fa-list-ol"></i> Has steps</button>`);
    if (selectedTagFilters.size || selectedIngredients.size || rcStepsOnly) {
        buttons.push(`<button class="rc-chip-btn rc-cat-clear" onclick="rcClearAllFilters()">Clear</button>`);
    }
    row.innerHTML = buttons.join('');
}

function rcClearAllFilters() {
    if (rcStepsOnly) rcToggleStepsOnly();
    clearAllFilters();
}

// ---- The sheets ----

let rcOpenFilterKey = null;

function rcOptionChip(value, label, count, on, onclick) {
    return `<button class="rc-chip-btn rc-filter-opt${on ? ' is-on' : ''}" onclick="${onclick}" aria-pressed="${on}">
        ${escapeHtml(label)}${count != null ? ` <span class="rc-opt-count">${count}</span>` : ''}
    </button>`;
}

function rcTagChips(tags, counts) {
    const safe = t => escapeHtml(t).replace(/'/g, '&#39;');
    return `<div class="rc-chip-row">${tags.map(t =>
        rcOptionChip(t, rcTagLabel(t), counts[t] || 0, selectedTagFilters.has(t), `rcToggleFilterTag('${safe(t)}')`)
    ).join('')}</div>`;
}

function rcFilterSheetBody(key) {
    const counts = rcTagCounts();
    const present = list => list.filter(t => counts[t]);
    let html = '';
    if (key === 'meal') {
        html += rcTagChips(present(RC_MEAL_TAGS), counts);
    } else if (key === 'diet') {
        const diet = present(RC_DIET_FILTER_TAGS).filter(t => t !== 'trail' || RC_TRIP || counts.trail);
        const also = Object.keys(counts).filter(t => rcTagCategory(t) === 'also').sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
        html += rcTagChips(diet, counts);
        if (also.length) html += `<div class="rc-pick-group">Also</div>` + rcTagChips(also, counts);
    } else if (key === 'source') {
        const people = rcFilterPeople().filter(t => counts[t]);
        const sources = rcFilterSources().filter(t => counts[t]);
        if (people.length) html += `<div class="rc-pick-group">People</div>` + rcTagChips(people, counts);
        if (sources.length) html += `<div class="rc-pick-group">Books &amp; sites</div>` + rcTagChips(sources, counts);
        if (!people.length && !sources.length) html += `<p class="rc-filter-hint">No sources yet.</p>`;
    } else if (key === 'ingredient') {
        html += `<input type="search" class="rc-pick-search" id="rcIngSearch" placeholder="Search ingredients (e.g. chickpeas)" oninput="rcRenderIngredientOptions(this.value)" autocomplete="off">
            <p class="rc-filter-hint">Shows recipes that use all the ingredients you pick.</p>
            <div id="rcIngOptions"></div>`;
    }
    html += `<div class="rc-sheet-actions">
        <button class="btn btn-secondary" onclick="rcClearFilterCategory('${key}')">Clear</button>
        <button class="btn" onclick="rcClosePicker()">Show ${getSortedRecipes().length} recipes</button>
    </div>`;
    return html;
}

function rcOpenFilterSheet(key) {
    rcOpenFilterKey = key;
    const cat = RC_FILTER_CATEGORIES.find(c => c.key === key);
    rcOpenPicker(cat.label, rcFilterSheetBody(key));
    if (key === 'ingredient') rcRenderIngredientOptions('');
}

function rcRefreshFilterSheet() {
    if (!rcOpenFilterKey || !document.getElementById('rcPicker')?.classList.contains('open')) return;
    const body = document.getElementById('rcPickerBody');
    if (rcOpenFilterKey === 'ingredient') {
        const q = document.getElementById('rcIngSearch')?.value || '';
        rcRenderIngredientOptions(q);
        const go = body.querySelector('.rc-sheet-actions .btn:not(.btn-secondary)');
        if (go) go.textContent = `Show ${getSortedRecipes().length} recipes`;
        return;
    }
    body.innerHTML = rcFilterSheetBody(rcOpenFilterKey);
}

// getSortedRecipes only applies category tags while the list renders, so count with them here too
const rcFiltersCount = getSortedRecipes;
getSortedRecipes = function () {
    if (rcCategoryTags) return rcFiltersCount();
    rcCategoryTags = selectedTagFilters;
    try {
        let list = rcFiltersCount();
        if (selectedIngredients.size) {
            list = list.filter(r => {
                const names = (r.ingredients || []).map(i => normalizeIngredientName(i.ingredient).toLowerCase());
                return Array.from(selectedIngredients).every(s => names.some(n => n.includes(s.toLowerCase())));
            });
        }
        return list;
    } finally { rcCategoryTags = null; }
};

function rcToggleFilterTag(tag) {
    if (selectedTagFilters.has(tag)) selectedTagFilters.delete(tag);
    else selectedTagFilters.add(tag);
    rcSaveTagFilters();
    document.getElementById('recipeList').dataset.showAll = 'false';
    renderActiveFilters();
    updateRecipeList();
    rcRefreshFilterSheet();
}

function rcClearFilterCategory(key) {
    if (key === 'ingredient') selectedIngredients.clear();
    else rcCategorySelection(key).forEach(t => selectedTagFilters.delete(t));
    rcSaveTagFilters();
    renderActiveFilters();
    updateRecipeList();
    rcRefreshFilterSheet();
}

// Ingredient sheet: most-used ingredients, or matches for what's typed
function rcIngredientCounts() {
    const counts = {};
    for (const r of recipes) {
        const seen = new Set((r.ingredients || []).map(i => normalizeIngredientName(i.ingredient || '').toLowerCase().trim()).filter(Boolean));
        seen.forEach(n => { counts[n] = (counts[n] || 0) + 1; });
    }
    return counts;
}

function rcRenderIngredientOptions(query) {
    const box = document.getElementById('rcIngOptions');
    if (!box) return;
    const counts = rcIngredientCounts();
    const q = (query || '').toLowerCase().trim();
    const picked = Array.from(selectedIngredients);
    let names = Object.keys(counts).filter(n => !RC_PLAIN_INGREDIENTS.includes(n) && !picked.includes(n));
    names = q ? names.filter(n => n.includes(q)) : names.filter(n => !RC_STAPLE_RE.test(n));
    names.sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
    names = names.slice(0, q ? 24 : 18);
    const safe = n => escapeHtml(n).replace(/'/g, '&#39;');
    let html = '';
    if (picked.length) {
        html += `<div class="rc-pick-group">Picked</div><div class="rc-chip-row">${picked.map(n =>
            rcOptionChip(n, n, null, true, `rcToggleFilterIngredient('${safe(n)}')`)).join('')}</div>`;
    }
    html += `<div class="rc-pick-group">${q ? 'Matches' : 'Most used'}</div>`;
    html += names.length
        ? `<div class="rc-chip-row">${names.map(n => rcOptionChip(n, n, counts[n], false, `rcToggleFilterIngredient('${safe(n)}')`)).join('')}</div>`
        : `<p class="rc-filter-hint">No ingredient matches "${escapeHtml(query)}".</p>`;
    box.innerHTML = html;
}

function rcToggleFilterIngredient(name) {
    if (selectedIngredients.has(name)) selectedIngredients.delete(name);
    else selectedIngredients.add(name);
    document.getElementById('recipeList').dataset.showAll = 'false';
    renderActiveFilters();
    updateRecipeList();
    rcRefreshFilterSheet();
}

rcRenderFilterBar();
