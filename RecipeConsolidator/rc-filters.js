// ============================================
// Recipe Consolidator: filter by category
// One short row (Meal, Diet, Source, Ingredient, Has steps). Each opens a sheet with every option and a count.
// Meal and Source match any pick; Diet and Ingredient need every pick; across categories a recipe must match each one.
// Loads after rc-extras.js
// ============================================

const RC_MEAL_TAGS = ['breakfast', 'lunch', 'dinner', 'main', 'side', 'soup', 'salad', 'bowl', 'snack', 'dessert', 'drink', 'sauce', 'dressing', 'dip', 'hummus', 'add-on', 'baking'];
const RC_DIET_FILTER_TAGS = ['trail', 'vegan', 'vegetarian', 'gluten-free', 'nut-free', 'soy-free', 'oil-free'];
// Too common to be useful as an ingredient filter
const RC_PLAIN_INGREDIENTS = ['salt', 'water', 'pepper', 'black pepper', 'sea salt', 'kosher salt', 'ice'];
// Pantry staples and spices: still searchable, but left out of the "Most used" picks
const RC_STAPLE_RE = /\b(salt|pepper|water|ice|oil|sugar|syrup|honey|vanilla|baking (powder|soda)|flour|cinnamon|nutmeg|cumin|paprika|coriander|turmeric|chili powder|cayenne|oregano|thyme|basil|garlic|onion powder|ginger|cardamom|cloves?|extract|yeast|vinegar|soy sauce|tamari|lemon juice|lime juice|egg)s?\b/;

// Filter names: one plain name per ingredient ("cloves minced garlic" -> "garlic")
const RC_ING_LEAD = /^(?:(?:about|plus|or|and|to|of|a|an|the|few|turns|dash|pinch|splash|each|some|heaping|scant|level|generous|handfuls?|bunch(?:es)?|heads?|cloves?|cans?|tins?|jars?|packages?|packs?|packets?|sticks?|slices?|pieces?|chunks?|knobs?|thumbs?|inch(?:es)?|sprigs?|stalks?|ribs?|stems?|ears?|drops?|cups?|tbsp\.?|tsp\.?|sp|tablespoons?|teaspoons?|oz|ounces?|g|grams?|kg|lbs?|pounds?|ml|l|large|small|medium|sized|mini|extra-large|whole(?!\s+(?:wheat|grain))|whole-milk|fresh|freshly|dried|ground|chopped|diced|sliced|minced|grated|crushed|cracked|peeled|shredded|ribboned|torn|finely|thinly|roughly|coarsely|halved|quartered|cubed|crumbled|mashed|pureed|melted|softened|squeezed|toasted|roasted|raw|cooked|uncooked|frozen|canned|packed|loosely|firmly|very|ripe|medium-ripe|overripe|but|firm|warm|cold|fine|grain|organic|good|quality|store-bought|homemade|pure|plain|natural|creamy|smooth|young|baby|pitted|shelled|unsweetened|unsalted|salted|full-fat|lite|low-sodium|low sodium|low fodmap|gluten-free|extra-virgin|extra virgin|virgin|refined|boneless|skinless|bone-in|skin-on|[\d½¼¾⅓⅔.\/-]+(?:-?(?:inch|oz|ounce|lb|pound|g))?)\s+)+/;
const RC_ING_TAIL = /\s+(?:cloves?|sprigs?|stalks?|stems?|florets|matchsticks|slices|pieces|chunks|fillets?|for serving|for garnish|to taste|to serve|optional|divided|as needed)$/;
const RC_ING_VARIETY = /\b(?:cherry|green|brown|red|white|yellow|black|kosher|sea|sweet|hot|chicken|vegetable|beef|soy|rice|almond|oat|coconut|dark|light|golden|smoked|cold|cooked|raw|toasted|grapeseed|safflower|heirloom)$/;
const RC_ING_HERB = /^(?:basil|holy basil|mint|cilantro|coriander|parsley|rosemary|sage|tarragon|thyme|dill|oregano)$/;
const RC_ING_KEEP_S = /^(?:molasses|aminos|hummus|asparagus|couscous|swiss|brussels|harissa|grass|citrus)$/;
const RC_ING_SAME = {
    'chick pea': 'chickpea', 'garbanzo bean': 'chickpea', 'scallion': 'green onion', 'spring onion': 'green onion',
    'brewer’s yeast': 'brewers yeast', "brewer's yeast": 'brewers yeast', 'flaxseed': 'flax seed',
    'icing sugar': 'powdered sugar', 'confectioners’ sugar': 'powdered sugar', 'confectioners sugar': 'powdered sugar',
    'all purpose flour': 'all-purpose flour', 'plain flour': 'all-purpose flour', 'coriander leaf': 'cilantro',
    'chili pepper flake': 'red pepper flake', 'chili flake': 'red pepper flake', 'red-pepper flake': 'red pepper flake',
    'cayenne pepper': 'cayenne', 'panko breadcrumb': 'panko', 'stock': 'broth', 'chicken stock': 'chicken broth',
    'vegetable stock': 'vegetable broth', 'yoghurt': 'yogurt', 'chilli': 'chili', 'old fashioned oat': 'rolled oat',
    'old-fashioned rolled oat': 'rolled oat', 'old-fashioned oat': 'rolled oat', 'whole rolled oat': 'rolled oat',
    'feta cheese': 'feta', 'french feta cheese': 'feta', 'mascarpone cheese': 'mascarpone', 'parmesan cheese': 'parmesan',
    'white': 'egg white', 'yolk': 'egg yolk', 'pasteurized egg yolk': 'egg yolk', 'green pea': 'pea',
    'choc chip': 'chocolate chip', 'nutritional yeast flake': 'nutritional yeast', 'back pepper': 'black pepper',
    'kaffir lime leaf': 'lime leaf', 'black beluga': 'black lentil', 'mixed frozen berry': 'mixed berry',
    'heavy whipping cream': 'heavy cream', 'oat': 'rolled oat', 'milk greek yogurt': 'greek yogurt', 'spotty banana': 'banana',
    'beef short ribs bone in': 'beef short rib', 'bite-sized cauliflower': 'cauliflower', 'lady finger': 'ladyfinger', 'bicarbonate of soda': 'baking soda'
};
function rcFilterIngredientName(raw) {
    let n = String(raw || '').toLowerCase().replace(/ñ/g, 'n')
        .replace(/\([^)]*\)?/g, ' ').replace(/[)*]/g, ' ').replace(/^[^a-z\d½¼¾⅓⅔]+/, '')
        .replace(/^(?:(?:skin-on|bone-in|boneless|skinless|ripe|roasted|unsweetened|large|small)\s*,?\s+)+/, '')
        .split(',')[0].split(/\s+(?:for|plus|such as|with|if|made from)\s+/)[0]
        .replace(/\s+/g, ' ').trim();
    if (/^(?:none|makes\b|note\b|for (?:garnish|serving)|your choice|protein of|plant-based protein)/.test(n)) return '';
    const fruit = n.match(/^(juice|zest) of .*?\b(lemon|lime|orange)s?$/);
    if (fruit) return fruit[2] + ' ' + fruit[1];
    const or = n.split(/\s+(?:or|and\/or)\s+/);
    if (or.length > 1) {
        n = or[0].trim();
        const rest = or[1].trim().split(' ');
        if (RC_ING_VARIETY.test(n) && rest.length > 1) n += ' ' + rest.slice(RC_ING_VARIETY.test(rest[0]) ? 1 : -1).join(' ');
    }
    for (let i = 0; i < 3; i++) {
        n = n.replace(RC_ING_LEAD, '').split(/\s+and\s+/)[0].replace(/\s\d.*$/, '').replace(RC_ING_TAIL, '').trim();
    }
    n = n.replace(/bread crumb/, 'breadcrumb').replace(/([a-z'’-]+)$/, w => RC_ING_KEEP_S.test(w) || /(?:ss|us|is)$/.test(w) ? w
        : w === 'leaves' ? 'leaf' : /^(?:chilies|chillies)$/.test(w) ? 'chili' : w === 'cookies' ? 'cookie'
        : /ies$/.test(w) ? w.slice(0, -3) + 'y' : /(?:tomato|potato|mango|ch|sh|x)es$/.test(w) ? w.slice(0, -2)
        : /s$/.test(w) && w.length > 3 ? w.slice(0, -1) : w);
    const herb = n.match(/^(.+) leaf$/);
    if (herb && RC_ING_HERB.test(herb[1])) n = herb[1];
    if (/\bgarlic\b/.test(n) && !/powder|granulated|infused|salt/.test(n)) n = 'garlic';
    if (/^ginger(?: root| pulp| juice)?$/.test(n)) n = 'ginger';
    if (/^(?:full-fat |lite |light )?coconut milk$/.test(n)) n = 'coconut milk';
    return RC_ING_SAME[n] || n;
}
// Kinds of the same thing: "onion" also picks up "red onion", but "butter" skips "peanut butter"
const RC_ING_KIND = /^(?:red|yellow|white|sweet|brown|black|dark|light|golden|english|seedless|navel|russet|yukon gold|cherry|plum|heirloom|fire-roasted diced|curly|tuscan|green|long-grain|long-grain white|long-grain brown|medjool|kalamata|castelvetrano|button|cremini|king oyster|wood ear|boston|romaine|italian|flat-leaf|curly leaf|dry red|dry white|flaky|fine|smooth|grainy|toasted)$/;
function rcIngMatches(key, picked) {
    if (key === picked) return true;
    const kind = key.slice(0, -picked.length - 1);
    return key.endsWith(' ' + picked) && RC_ING_KIND.test(kind) && key !== 'green onion';
}
function rcRecipeIngredientKeys(r) {
    return new Set((r.ingredients || []).map(i => rcFilterIngredientName(i.ingredient)).filter(Boolean));
}

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
    // Diet (and its "Also" tags) narrows with every pick; Meal and Source match any pick
    return Object.entries(groups).every(([cat, group]) => (cat === 'diet' || cat === 'also')
        ? group.every(t => recipeTags.includes(t))
        : group.some(t => recipeTags.includes(t)));
}

const rcFiltersBaseGetSortedRecipes = getSortedRecipes;
getSortedRecipes = function () {
    const list = rcFiltersBaseGetSortedRecipes();
    return rcCategoryTags && rcCategoryTags.size ? list.filter(r => rcMatchesCategories(r, rcCategoryTags)) : list;
};

// Row tags still highlight the selected filters while the list renders
// Websites with a single recipe: their tag stays (search still finds it) but isn't shown on the recipe row
function rcSoloSites() {
    const counts = {};
    for (const r of recipes) if (r.sourceTitle && r.sourceUrl) counts[r.sourceTitle] = (counts[r.sourceTitle] || 0) + 1;
    return new Set(Object.keys(counts).filter(s => counts[s] === 1 && !rcFilterPeople().includes(s)));
}

const rcFiltersBaseTagsDisplay = getRecipeTagsDisplay;
getRecipeTagsDisplay = function (recipe) {
    const selected = rcCategoryTags || selectedTagFilters;
    const solo = rcSoloSites();
    const shown = Object.assign({}, recipe, { tags: (recipe.tags || []).filter(t => !solo.has(t) || selected.has(t)) });
    if (!rcCategoryTags) return rcFiltersBaseTagsDisplay(shown);
    const empty = selectedTagFilters;
    selectedTagFilters = rcCategoryTags;
    try { return rcFiltersBaseTagsDisplay(shown); } finally { selectedTagFilters = empty; }
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
    // Clear all sits first so it's never scrolled out of view on a phone
    if (selectedTagFilters.size || selectedIngredients.size || rcStepsOnly) {
        buttons.unshift(`<button class="rc-chip-btn rc-cat-clear" onclick="rcClearAllFilters()" title="Clear all filters"><i class="fas fa-times"></i> Clear all</button>`);
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
        html += `<p class="rc-filter-hint">Matches any you pick: soup + salad shows both.</p>`;
        html += rcTagChips(present(RC_MEAL_TAGS), counts);
    } else if (key === 'diet') {
        const diet = present(RC_DIET_FILTER_TAGS).filter(t => t !== 'trail' || RC_TRIP || counts.trail);
        const also = Object.keys(counts).filter(t => rcTagCategory(t) === 'also').sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
        html += `<p class="rc-filter-hint">Matches all you pick: gluten-free + nut-free shows recipes that are both.</p>`;
        html += rcTagChips(diet, counts);
        if (also.length) html += `<div class="rc-pick-group">Also</div>` + rcTagChips(also, counts);
    } else if (key === 'source') {
        const people = rcFilterPeople().filter(t => counts[t]);
        const sources = rcFilterSources().filter(t => counts[t]);
        // A book is a source with no web links; everything else is a website
        const isBook = s => !recipes.some(r => r.sourceTitle === s && r.sourceUrl);
        const byCount = (a, b) => counts[b] - counts[a] || a.localeCompare(b);
        const books = sources.filter(isBook).sort(byCount);
        const sites = sources.filter(s => !isBook(s)).sort(byCount);
        if (sources.length > 12) html += `<input type="search" class="rc-pick-search" placeholder="Search people, books and websites" oninput="rcFilterSourceChips(this.value)" autocomplete="off">`;
        html += `<p class="rc-filter-hint">Matches any you pick.</p>`;
        if (people.length) html += `<div class="rc-pick-group">People</div>` + rcTagChips(people, counts);
        if (books.length) html += `<div class="rc-pick-group">Books</div>` + rcTagChips(books, counts);
        // One-recipe websites only appear when searched for (or when picked)
        const solo = rcSoloSites();
        const mainSites = sites.filter(s => !solo.has(s) || selectedTagFilters.has(s));
        const soloSites = sites.filter(s => solo.has(s) && !selectedTagFilters.has(s));
        if (mainSites.length) html += `<div class="rc-pick-group">Websites</div>` + rcTagChips(mainSites, counts);
        if (soloSites.length) html += `<div class="rc-solo-sites" hidden><div class="rc-pick-group">More websites</div>${rcTagChips(soloSites, counts)}</div>
            <p class="rc-filter-hint rc-solo-hint">${soloSites.length} more websites with one recipe each: search to find them.</p>`;
        if (!people.length && !sources.length) html += `<p class="rc-filter-hint">No sources yet.</p>`;
    } else if (key === 'ingredient') {
        html += `<input type="search" class="rc-pick-search" id="rcIngSearch" placeholder="Search ingredients (e.g. chickpeas)" oninput="rcRenderIngredientOptions(this.value)" autocomplete="off">
            <p class="rc-filter-hint">Matches all you pick: recipes that use every ingredient chosen.</p>
            <div id="rcIngOptions"></div>`;
    }
    html += `<div class="rc-sheet-actions">
        <button class="btn btn-secondary" onclick="rcClearFilterCategory('${key}')">Clear</button>
        <button class="btn" onclick="rcClosePicker()">Show ${getSortedRecipes().length} recipes</button>
    </div>`;
    return html;
}

function rcFilterSourceChips(query) {
    const q = (query || '').toLowerCase().trim();
    document.querySelectorAll('#rcPickerBody .rc-filter-opt').forEach(b => {
        b.style.display = !q || b.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
    const solo = document.querySelector('#rcPickerBody .rc-solo-sites');
    if (solo) solo.hidden = !q || ![...solo.querySelectorAll('.rc-filter-opt')].some(b => b.style.display !== 'none');
    const hint = document.querySelector('#rcPickerBody .rc-solo-hint');
    if (hint) hint.hidden = !!q;
    document.querySelectorAll('#rcPickerBody .rc-pick-group').forEach(g => {
        const row = g.nextElementSibling;
        if (row && row.classList.contains('rc-chip-row')) g.hidden = ![...row.children].some(b => b.style.display !== 'none');
    });
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
    // The older ingredient match uses other names, so hide the picks from it and match here
    const picked = selectedIngredients;
    selectedIngredients = new Set();
    try {
        let list = rcFiltersCount();
        if (picked.size) {
            list = list.filter(r => {
                const keys = [...rcRecipeIngredientKeys(r)];
                return [...picked].every(s => keys.some(k => rcIngMatches(k, s)));
            });
        }
        return list;
    } finally { rcCategoryTags = null; selectedIngredients = picked; }
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
    // Count what picking each name would show, so "onion" includes recipes with only "red onion"
    const perRecipe = recipes.map(rcRecipeIngredientKeys);
    const names = new Set(perRecipe.flatMap(k => [...k]));
    const counts = {};
    for (const keys of perRecipe) {
        const hit = new Set();
        keys.forEach(k => {
            const words = k.split(' ');
            for (let i = 0; i < words.length; i++) {
                const tail = words.slice(i).join(' ');
                if (names.has(tail) && rcIngMatches(k, tail)) hit.add(tail);
            }
        });
        hit.forEach(n => { counts[n] = (counts[n] || 0) + 1; });
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
