// Recipe Consolidator, trip mode for backpacking (loaded after rc-plan.js).
// Calories and weight per ingredient, live calories-per-gram while writing a recipe,
// per-person day totals in the plan, water estimates and a pack-by-day list.
// The mode itself (and keeping trip and event plans apart) is set up by the small
// script in index.html's <head>, before any plan is loaded.

const RC_TRIP = document.documentElement.classList.contains('rc-trip-mode');
const MY_FOODS_KEY = 'recipeConsolidator_myFoods';
const TRIP_KCAL_KEY = 'recipeConsolidator_tripKcal';
const TRIP_WATER_KEY = 'recipeConsolidator_tripWater';
const ML_PER_CUP = 240; // matches UNIT_CONVERSIONS in recipe-consolidator.js
const G_PER_OZ = 28.3495;

// Approximate values per 100 g, from USDA FoodData Central and typical package labels.
// cup = grams in one cup, each = grams in one item, units = grams in one can/package/etc.
// Order matters: more specific entries come before general ones.
const TRAIL_FOODS = [
    { name: 'water', re: /^(hot |cold |boiling )?water$/, kcal: 0, cup: 237, water: true },
    { name: 'salt', re: /\bsalt\b/, kcal: 0, cup: 288 },
    { name: 'spices', re: /\b(pepper flakes|black pepper|cumin|paprika|turmeric|cinnamon|oregano|thyme|basil|chili powder|garlic powder|onion powder|curry powder|coriander|allspice|nutmeg|cardamom|cayenne|spice|seasoning|baking soda|baking powder|psyllium|dulse)\b/, kcal: 260, cup: 120 },
    { name: 'vanilla extract', re: /vanilla/, kcal: 288, cup: 208 },
    { name: 'bouillon', re: /bouillon|broth powder|stock powder|stock cube/, kcal: 250, cup: 120, each: 4 },
    { name: 'broth', re: /\b(broth|stock)\b/, kcal: 5, cup: 240 },
    { name: 'oat flour', re: /oat flour/, kcal: 404, cup: 92 },
    { name: 'almond flour', re: /almond (flour|meal)/, kcal: 571, cup: 96 },
    { name: 'chickpea flour', re: /(chickpea|garbanzo) flour|besan/, kcal: 387, cup: 92 },
    { name: 'flour', re: /\bflour\b/, kcal: 364, cup: 125 },
    { name: 'quinoa flakes', re: /quinoa flakes/, kcal: 360, cup: 90 },
    { name: 'oats', re: /\boats?\b/, kcal: 379, cup: 81 },
    { name: 'granola', re: /granola/, kcal: 470, cup: 120 },
    { name: 'cooked quinoa', re: /quinoa/, cooked: true, kcal: 120, cup: 185 },
    { name: 'quinoa (dry)', re: /quinoa/, kcal: 368, cup: 170 },
    { name: 'couscous', re: /couscous/, kcal: 376, cup: 173 },
    { name: 'instant rice', re: /(instant|minute) rice/, kcal: 372, cup: 86 },
    { name: 'cooked rice', re: /\brice\b/, cooked: true, kcal: 130, cup: 158 },
    { name: 'rice (dry)', re: /\brice\b/, kcal: 365, cup: 185 },
    { name: 'ramen', re: /ramen/, kcal: 440, each: 85 },
    { name: 'pasta (dry)', re: /pasta|macaroni|penne|spaghetti|fusilli|orzo|noodles/, kcal: 371, cup: 100 },
    { name: 'instant mashed potatoes', re: /potato flakes|instant mashed|mashed potato/, kcal: 354, cup: 60 },
    { name: 'corn tortilla', re: /corn tortillas?/, kcal: 218, each: 26 },
    { name: 'flour tortilla', re: /tortillas?|wraps?\b/, kcal: 306, each: 49 },
    { name: 'bagel', re: /bagels?/, kcal: 257, each: 99 },
    { name: 'TVP', re: /\btvp\b|textured (vegetable|soy) protein/, kcal: 333, cup: 96 },
    { name: 'refried bean flakes', re: /bean flakes|dehydrated (refried )?beans|refried bean (flakes|mix)/, kcal: 350, cup: 90 },
    { name: 'cooked lentils', re: /lentils?/, cooked: true, kcal: 116, cup: 198 },
    { name: 'lentils (dry)', re: /lentils?/, kcal: 358, cup: 192 },
    { name: 'cooked chickpeas', re: /chickpeas?|garbanzo/, cooked: true, kcal: 164, cup: 164 },
    { name: 'chickpeas (dry)', re: /chickpeas?|garbanzo/, kcal: 378, cup: 200 },
    { name: 'cooked beans', re: /\bbeans?\b/, cooked: true, kcal: 130, cup: 175 },
    { name: 'beans (dry)', re: /\bbeans?\b/, kcal: 340, cup: 190 },
    { name: 'peanut butter powder', re: /peanut butter powder|powdered peanut|\bpb2\b/, kcal: 450, cup: 96 },
    { name: 'peanut butter', re: /peanut butter/, kcal: 588, cup: 258 },
    { name: 'almond butter', re: /almond butter/, kcal: 614, cup: 250 },
    { name: 'nut or seed butter', re: /(nut|seed|cashew) butter/, kcal: 600, cup: 250 },
    { name: 'tahini', re: /tahini/, kcal: 595, cup: 240 },
    { name: 'sliced almonds', re: /almonds?/, sliced: true, kcal: 579, cup: 92 },
    { name: 'almonds', re: /almonds?/, kcal: 579, cup: 143 },
    { name: 'walnuts', re: /walnuts?/, kcal: 654, cup: 117 },
    { name: 'pecans', re: /pecans?/, kcal: 691, cup: 99 },
    { name: 'cashews', re: /cashews?/, kcal: 553, cup: 137 },
    { name: 'peanuts', re: /peanuts?/, kcal: 567, cup: 146 },
    { name: 'pistachios', re: /pistachios?/, kcal: 560, cup: 123 },
    { name: 'macadamia nuts', re: /macadamia/, kcal: 718, cup: 134 },
    { name: 'hazelnuts', re: /hazelnuts?/, kcal: 628, cup: 135 },
    { name: 'mixed nuts', re: /\bnuts\b|trail mix/, kcal: 600, cup: 140 },
    { name: 'pumpkin seeds', re: /pumpkin seeds|pepitas/, kcal: 559, cup: 129 },
    { name: 'sunflower seeds', re: /sunflower seeds/, kcal: 584, cup: 140 },
    { name: 'hemp seeds', re: /hemp (seeds|hearts)/, kcal: 553, cup: 160 },
    { name: 'chia seeds', re: /chia/, kcal: 486, cup: 168 },
    { name: 'flaxseed', re: /flax/, kcal: 534, cup: 112 },
    { name: 'sesame seeds', re: /sesame seeds/, kcal: 573, cup: 144 },
    { name: 'coconut milk powder', re: /coconut milk powder|coconut cream powder/, kcal: 690, cup: 100 },
    { name: 'coconut milk (canned)', re: /coconut milk|coconut cream/, kcal: 197, cup: 226, units: { can: 400, cans: 400 } },
    { name: 'shredded coconut', re: /coconut (flakes|chips)|shredded coconut|desiccated coconut|\bcoconut\b/, kcal: 660, cup: 80 },
    { name: 'coconut oil', re: /coconut oil/, kcal: 892, cup: 218 },
    { name: 'oil', re: /\boil\b/, kcal: 884, cup: 216 },
    { name: 'ghee', re: /\bghee\b/, kcal: 900, cup: 208 },
    { name: 'butter', re: /\bbutter\b/, kcal: 717, cup: 227 },
    { name: 'whole milk powder', re: /whole milk powder|\bnido\b/, kcal: 496, cup: 128 },
    { name: 'milk powder', re: /milk powder|powdered milk|dry milk/, kcal: 362, cup: 68 },
    { name: 'plant milk', re: /(almond|oat|soy|rice|cashew) milk/, kcal: 30, cup: 240 },
    { name: 'parmesan', re: /parmesan|pecorino/, kcal: 392, cup: 100 },
    { name: 'hard cheese', re: /cheddar|gouda|cheese/, kcal: 403, cup: 113 },
    { name: 'jerky', re: /jerky/, kcal: 410 },
    { name: 'salami', re: /salami|pepperoni|summer sausage/, kcal: 400 },
    { name: 'tuna or salmon pouch', re: /tuna|salmon/, kcal: 130 },
    { name: 'tempeh', re: /tempeh/, kcal: 192, units: { package: 227, packages: 227 } },
    { name: 'cocoa powder', re: /cocoa|cacao powder/, kcal: 228, cup: 86 },
    { name: 'dark chocolate', re: /dark chocolate/, kcal: 598, cup: 170 },
    { name: 'chocolate', re: /chocolate/, kcal: 500, cup: 168 },
    { name: 'coconut sugar', re: /coconut sugar/, kcal: 375, cup: 160 },
    { name: 'brown sugar', re: /brown sugar/, kcal: 380, cup: 220 },
    { name: 'sugar', re: /\bsugar\b/, kcal: 387, cup: 200 },
    { name: 'maple syrup', re: /maple syrup/, kcal: 260, cup: 315 },
    { name: 'honey', re: /\bhoney\b/, kcal: 304, cup: 340 },
    { name: 'banana chips', re: /banana chips/, kcal: 519, cup: 72 },
    { name: 'freeze-dried fruit', re: /freeze[- ]dried/, kcal: 350, cup: 25 },
    { name: 'raisins', re: /raisins?/, kcal: 299, cup: 145 },
    { name: 'dates', re: /\bdates?\b/, kcal: 282, cup: 147, each: 24 },
    { name: 'dried apricots', re: /apricots?/, kcal: 241, cup: 130 },
    { name: 'dried cranberries', re: /dried cranberr/, kcal: 308, cup: 120 },
    { name: 'dried mango', re: /dried mango/, kcal: 319, cup: 160 },
    { name: 'dried apple', re: /dried apple|apple chips/, kcal: 243, cup: 86 },
    { name: 'dried figs', re: /\bfigs?\b/, kcal: 249, cup: 149 },
    { name: 'prunes', re: /prunes?/, kcal: 240, cup: 174 },
    { name: 'sun-dried tomatoes', re: /sun[- ]dried tomato/, kcal: 258, cup: 54 },
    { name: 'dehydrated vegetables', re: /dehydrated (vegetables|veggies)|dried vegetables/, kcal: 300, cup: 60 },
    { name: 'nutritional yeast', re: /nutritional yeast/, kcal: 400, cup: 60 },
    { name: 'miso', re: /\bmiso\b/, kcal: 199, cup: 275 },
    { name: 'tamari or soy sauce', re: /tamari|soy sauce/, kcal: 60, cup: 255 },
    { name: 'vinegar', re: /vinegar/, kcal: 20, cup: 240 },
    { name: 'mustard', re: /mustard/, kcal: 66, cup: 250 },
    { name: 'citrus juice', re: /(lemon|lime|orange) juice/, kcal: 25, cup: 244 },
    { name: 'salsa', re: /salsa/, kcal: 36, cup: 260 },
    { name: 'applesauce', re: /applesauce/, kcal: 42, cup: 244 },
    { name: 'protein powder', re: /protein powder/, kcal: 380, cup: 120 },
    { name: 'banana', re: /bananas?/, kcal: 89, each: 118, cup: 225 },
    { name: 'apple', re: /\bapples?\b/, kcal: 52, each: 182, cup: 125 },
    { name: 'orange', re: /\boranges?\b/, kcal: 47, each: 131 },
    { name: 'lemon', re: /\blemons?\b/, kcal: 29, each: 58 },
    { name: 'lime', re: /\blimes?\b/, kcal: 30, each: 67 },
    { name: 'avocado', re: /avocados?/, kcal: 160, each: 150 },
    { name: 'berries', re: /berries|blueberr|strawberr|raspberr|cranberr/, kcal: 50, cup: 145 },
];

const RC_PINCH_G = 0.36;
let rcMyFoods = {};
try { rcMyFoods = JSON.parse(localStorage.getItem(MY_FOODS_KEY) || '{}') || {}; } catch (e) {}

let rcTripKcalTarget = 3000;
let rcTripWaterL = 3;
try {
    rcTripKcalTarget = parseInt(localStorage.getItem(TRIP_KCAL_KEY), 10) || 3000;
    rcTripWaterL = parseFloat(localStorage.getItem(TRIP_WATER_KEY)) || 3;
} catch (e) {}

function rcFoodKey(name) {
    return normalizeIngredientName(String(name || '')).trim();
}

function rcSaveMyFoods() {
    try { localStorage.setItem(MY_FOODS_KEY, JSON.stringify(rcMyFoods)); } catch (e) {}
}

// ----------------------------
// Nutrition for one ingredient and one recipe
// ----------------------------

/** Which food an ingredient is: your own entry first, then one of your recipes, then the table */
function rcFindFood(ing) {
    const name = String(ing.ingredient || '').toLowerCase().trim();
    const notes = String(ing.notes || ing.preparation || '').toLowerCase();
    const key = rcFoodKey(ing.ingredient);
    const mine = rcMyFoods[key];
    const cooked = /\b(cooked|canned)\b/.test(name + ' ' + notes);
    const sliced = /\bsliced\b/.test(name + ' ' + notes);
    for (const f of TRAIL_FOODS) {
        if (!f.re.test(name)) continue;
        if (f.cooked && !cooked) continue;
        if (f.sliced && !sliced) continue;
        return mine ? Object.assign({}, f, mine, { source: 'yours', name: f.name }) : Object.assign({ source: 'table' }, f);
    }
    if (mine) return Object.assign({ source: 'yours', name: ing.ingredient }, mine);
    return null;
}

/** Grams and calories for one ingredient line; parts are null when unknown */
function rcIngredientNutrition(ing, depth = 0) {
    const qty = Number(ing.quantity);
    const result = { ing, grams: null, kcal: null, food: null, water: false, missing: [] };
    if (!isFinite(qty) || qty <= 0) { result.missing.push('amount'); return result; }

    // One of your own recipes used as an ingredient (a sauce, a mix)
    const sub = depth < 2 && recipes.find(r => r.name.toLowerCase() === String(ing.ingredient || '').toLowerCase().trim());
    if (sub) {
        const n = rcRecipeNutrition(sub, depth + 1);
        result.food = { name: sub.name, source: 'recipe' };
        result.grams = n.knownGrams * qty;
        result.kcal = n.kcal * qty;
        result.campWaterMl = n.campWaterMl * qty;
        if (n.unknownCount) result.missing.push('part of ' + sub.name);
        return result;
    }

    const food = rcFindFood(ing);
    result.food = food;
    const unit = (ing.unit || '').toLowerCase();
    let grams = null;
    if (ing.unitType === 'weight' && unit) {
        grams = convertToBaseUnit(qty, ing.unit, 'weight').value;
    } else if (ing.unitType === 'volume' && unit) {
        const ml = convertToBaseUnit(qty, ing.unit, 'volume').value;
        if (food && food.water) { result.water = true; result.waterMl = ml; return result; }
        if (food && food.cup) grams = ml / ML_PER_CUP * food.cup;
    } else if (unit === 'pinch' || unit === 'pinches') {
        grams = qty * RC_PINCH_G;
    } else if (!unit || unit === 'count' || unit === 'whole') {
        if (food && food.each) grams = qty * food.each;
    } else if (food && food.units && food.units[unit]) {
        grams = qty * food.units[unit];
    } else if (food && food.perUnit && food.perUnit[unit]) {
        grams = qty * food.perUnit[unit];
    }
    if (food && food.water) { result.water = true; result.waterMl = grams || 0; return result; }

    result.grams = grams;
    if (grams === null) result.missing.push('weight');
    if (!food || food.kcal == null) result.missing.push('calories');
    else if (grams !== null) result.kcal = grams * food.kcal / 100;
    return result;
}

/** Totals for a whole recipe as written (not scaled) */
function rcRecipeNutrition(recipe, depth = 0) {
    const lines = (recipe.ingredients || []).map(ing => rcIngredientNutrition(ing, depth));
    let kcal = 0, knownGrams = 0, campWaterMl = 0, unknownCount = 0;
    for (const l of lines) {
        if (l.water) { campWaterMl += l.waterMl || 0; continue; }
        if (l.campWaterMl) campWaterMl += l.campWaterMl;
        if (l.grams !== null) knownGrams += l.grams;
        if (l.kcal !== null) kcal += l.kcal;
        if (l.missing.length) unknownCount++;
    }
    const serves = rcServingsNumber(recipe);
    return {
        lines, kcal, knownGrams, campWaterMl, unknownCount, serves,
        density: knownGrams > 0 ? kcal / knownGrams : 0
    };
}

// ----------------------------
// Formatting
// ----------------------------

function rcFmtKcal(k) {
    return Math.round(k).toLocaleString('en-US');
}

function rcFmtWeight(g) {
    if (g == null) return '?';
    if (unitSystem === 'metric') return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`;
    const oz = g / G_PER_OZ;
    return oz >= 16 ? `${(oz / 16).toFixed(1)} lb` : `${oz < 10 ? oz.toFixed(1) : Math.round(oz)} oz`;
}

function rcFmtWater(ml) {
    if (unitSystem === 'metric' || ml >= 1000) return `${(ml / 1000).toFixed(1)} L`;
    return `${Math.round(ml)} ml`;
}

/** Calorie density: kcal per gram, plus per ounce for US backpackers */
function rcFmtDensity(kcalPerG) {
    if (!kcalPerG) return '–';
    const perOz = kcalPerG * G_PER_OZ;
    return unitSystem === 'metric' ? `${kcalPerG.toFixed(1)} kcal/g` : `${kcalPerG.toFixed(1)} kcal/g · ${Math.round(perOz)} kcal/oz`;
}

/** 125+ kcal/oz (4.4 kcal/g) is a common ultralight goal; under 100 kcal/oz is heavy for the calories */
function rcDensityClass(kcalPerG) {
    if (!kcalPerG) return '';
    if (kcalPerG >= 4.4) return 'is-great';
    if (kcalPerG >= 3.5) return 'is-good';
    return 'is-heavy';
}

// ----------------------------
// Live calorie panel in the add/edit recipe sheet
// ----------------------------

let rcTrailPanelTimer = null;

function rcScheduleTrailPanel() {
    clearTimeout(rcTrailPanelTimer);
    rcTrailPanelTimer = setTimeout(rcRenderTrailPanel, 200);
}

function rcRenderTrailPanel() {
    const panel = document.getElementById('rcTrailPanel');
    if (!panel || !RC_TRIP) return;
    const text = (document.getElementById('recipeInput')?.value || '').trim();
    const servings = document.getElementById('recipeServings')?.value || '';
    if (!text) {
        panel.innerHTML = '<p class="rc-hint">Calories, weight and calories per gram appear here as you type ingredients.</p>';
        return;
    }
    const ingredients = parseRecipe(text);
    const n = rcRecipeNutrition({ ingredients, servings });
    const rows = n.lines.map((l, i) => {
        const name = escapeHtml(l.ing.ingredient || '');
        if (l.water) {
            return `<div class="rc-trail-row is-water"><span class="rc-trail-name">${name}</span><span class="rc-trail-vals">${rcFmtWater(l.waterMl)} at camp</span></div>`;
        }
        const src = l.food ? (l.food.source === 'yours' ? 'your food' : l.food.source === 'recipe' ? 'your recipe' : l.food.name) : 'not in the table';
        const vals = l.missing.length && l.food?.source !== 'recipe'
            ? `<span class="rc-trail-missing">needs ${l.missing.join(' + ')}</span>`
            : `${rcFmtWeight(l.grams)} · ${rcFmtKcal(l.kcal)} kcal${l.grams ? ` · ${(l.kcal / l.grams).toFixed(1)}/g` : ''}`;
        const canEdit = l.food?.source !== 'recipe';
        return `
            <div class="rc-trail-row${l.missing.length ? ' is-missing' : ''}">
                <span class="rc-trail-name">${name}<small>${escapeHtml(src)}</small></span>
                <span class="rc-trail-vals">${vals}</span>
                ${canEdit ? `<button class="rc-trail-edit" type="button" onclick="rcToggleFoodEditor(${i})" aria-label="Set calories and weight for ${name}"><i class="fas fa-pen"></i></button>` : ''}
            </div>
            ${canEdit ? rcFoodEditorHtml(l, i) : ''}`;
    }).join('');

    const serves = n.serves;
    const perServing = serves ? `<div><span>Per serving (serves ${serves})</span><strong>${rcFmtKcal(n.kcal / serves)} kcal · ${rcFmtWeight(n.knownGrams / serves)}</strong></div>` : '<div class="rc-hint">Add “Serves” above to see per-serving numbers.</div>';
    panel.innerHTML = `
        <div class="rc-trail-head">
            <span>Trail nutrition</span>
            <span class="rc-density ${rcDensityClass(n.density)}">${rcFmtDensity(n.density)}</span>
        </div>
        <div class="rc-trail-totals">
            <div><span>Whole recipe</span><strong>${rcFmtKcal(n.kcal)} kcal · ${rcFmtWeight(n.knownGrams)}</strong></div>
            ${perServing}
            ${n.campWaterMl ? `<div><span>Water to add at camp</span><strong>${rcFmtWater(n.campWaterMl)}</strong></div>` : ''}
        </div>
        ${n.unknownCount ? `<p class="rc-trail-warn">${n.unknownCount} ingredient${n.unknownCount !== 1 ? 's' : ''} not counted yet. Tap <i class="fas fa-pen"></i> and copy the numbers from the package label.</p>` : ''}
        <div class="rc-trail-rows">${rows}</div>
        <p class="rc-hint rc-trail-note">Values are approximate (USDA FoodData Central and typical labels). Write water you add on the trail as its own line (e.g. “2 cups water”): it counts toward water, not carried weight.</p>`;
}

function rcFoodEditorHtml(l, i) {
    const unit = (l.ing.unit || '').toLowerCase();
    const isVolume = l.ing.unitType === 'volume' && unit;
    const isWeight = l.ing.unitType === 'weight' && unit;
    const perLabel = isVolume ? 'grams per cup' : isWeight ? '' : `grams per ${unit && unit !== 'count' ? unit.replace(/s$/, '') : 'item'}`;
    const f = l.food || {};
    const perValue = isVolume ? (f.cup || '') : (unit && unit !== 'count' ? (f.perUnit?.[unit] || f.units?.[unit] || '') : (f.each || ''));
    return `
        <div class="rc-food-editor" id="rcFoodEditor${i}" data-key="${escapeHtml(rcFoodKey(l.ing.ingredient))}" data-unit="${escapeHtml(unit)}" data-kind="${isVolume ? 'cup' : isWeight ? 'weight' : 'each'}" ${l.missing.length ? '' : 'hidden'}>
            <label><span>kcal per 100 g</span><input type="number" inputmode="decimal" min="0" step="1" value="${f.kcal ?? ''}" data-field="kcal"></label>
            ${perLabel ? `<label><span>${escapeHtml(perLabel)}</span><input type="number" inputmode="decimal" min="0" step="0.1" value="${perValue}" data-field="per"></label>` : ''}
            <button class="btn rc-add-btn" type="button" onclick="rcSaveFoodEditor(${i})">Save</button>
            <p class="rc-hint">Saved to “my foods” and reused in every recipe.${l.food?.source === 'table' ? ' Your numbers replace the built-in ones.' : ''}</p>
        </div>`;
}

function rcToggleFoodEditor(i) {
    const el = document.getElementById('rcFoodEditor' + i);
    if (el) el.hidden = !el.hidden;
}

function rcSaveFoodEditor(i) {
    const el = document.getElementById('rcFoodEditor' + i);
    if (!el) return;
    const key = el.dataset.key;
    const unit = el.dataset.unit;
    const kind = el.dataset.kind;
    const kcal = parseFloat(el.querySelector('[data-field="kcal"]')?.value);
    const per = parseFloat(el.querySelector('[data-field="per"]')?.value);
    const entry = Object.assign({}, rcMyFoods[key] || {});
    if (isFinite(kcal) && kcal >= 0) entry.kcal = kcal;
    if (isFinite(per) && per > 0) {
        if (kind === 'cup') entry.cup = per;
        else if (kind === 'each' && unit && unit !== 'count') entry.perUnit = Object.assign({}, entry.perUnit, { [unit]: per });
        else if (kind === 'each') entry.each = per;
    }
    rcMyFoods[key] = entry;
    rcSaveMyFoods();
    rcRenderTrailPanel();
    if (typeof rcRefreshTripViews === 'function') rcRefreshTripViews();
}

// ----------------------------
// Per-person totals for the plan
// ----------------------------

function rcPeople() {
    return rcHeadcount > 0 ? rcHeadcount : 1;
}

/** Per-person calories, carried grams and camp water for one recipe instance, scaled the same way as the shopping list */
function rcPerPerson(recipe) {
    const n = rcRecipeNutrition(recipe);
    const share = n.serves ? 1 / n.serves : 1 / rcPeople();
    const extra = recipeMultipliers[recipe.id] || 1;
    return {
        kcal: n.kcal * share * extra,
        grams: n.knownGrams * share * extra,
        waterMl: n.campWaterMl * share * extra,
        unknown: n.unknownCount > 0
    };
}

function rcDayTotals(date) {
    const t = { kcal: 0, grams: 0, waterMl: 0, unknown: new Set(), meals: [] };
    const day = mealPlan[date] || {};
    for (const meal of Object.keys(day)) {
        if (!Array.isArray(day[meal]) || meal === 'prep') continue;
        for (const id of day[meal]) {
            const recipe = rcRecipeById(id);
            if (!recipe) continue;
            const p = rcPerPerson(recipe);
            t.kcal += p.kcal; t.grams += p.grams; t.waterMl += p.waterMl;
            if (p.unknown) t.unknown.add(recipe.name);
            t.meals.push({ meal, recipe, ...p });
        }
    }
    return t;
}

function rcTripSetting(which, value) {
    if (which === 'kcal') {
        rcTripKcalTarget = Math.max(0, parseInt(value, 10) || 0) || 3000;
        try { localStorage.setItem(TRIP_KCAL_KEY, String(rcTripKcalTarget)); } catch (e) {}
    } else {
        rcTripWaterL = Math.max(0, parseFloat(value) || 0);
        try { localStorage.setItem(TRIP_WATER_KEY, String(rcTripWaterL)); } catch (e) {}
    }
    rcRefreshTripViews();
}

function rcRenderTripSummary() {
    const el = document.getElementById('rcTripSummary');
    if (!el) return;
    const days = Array.from(selectedDays).sort();
    if (!days.length) { el.innerHTML = ''; return; }
    let kcal = 0, grams = 0, waterMl = 0;
    const unknown = new Set();
    for (const d of days) {
        const t = rcDayTotals(d);
        kcal += t.kcal; grams += t.grams; waterMl += t.waterMl;
        t.unknown.forEach(n => unknown.add(n));
    }
    const perDayKcal = kcal / days.length;
    const density = grams ? kcal / grams : 0;
    const campPerDay = waterMl / days.length;
    const people = rcPeople();
    el.innerHTML = `
        <div class="rc-trip-stats">
            <div><span>Per person, per day</span><strong>${rcFmtKcal(perDayKcal)} <small>/ ${rcFmtKcal(rcTripKcalTarget)} kcal</small></strong></div>
            <div><span>Food to carry, per person</span><strong>${rcFmtWeight(grams)}</strong></div>
            <div><span>Calorie density</span><strong class="rc-density ${rcDensityClass(density)}">${rcFmtDensity(density)}</strong></div>
            <div><span>Water per person, per day</span><strong>${rcFmtWater(campPerDay + rcTripWaterL * 1000)}</strong><small>${rcFmtWater(campPerDay)} cooking + ${rcTripWaterL} L drinking</small></div>
        </div>
        ${people > 1 ? `<p class="rc-hint">Whole group (${people}): ${rcFmtWeight(grams * people)} of food.</p>` : ''}
        ${unknown.size ? `<p class="rc-trail-warn">Not fully counted: ${Array.from(unknown).map(escapeHtml).join(', ')}. Edit the recipe to fill in missing foods.</p>` : ''}
        <p class="rc-hint">Drinking water is your own estimate: a common starting point is about half a litre per hour of hiking, more in heat or at altitude. Check water sources on your route.</p>`;
}

function rcDecorateTripDays() {
    document.querySelectorAll('#dayPlannerContainer .day-planner-day').forEach(dayEl => {
        const date = dayEl.querySelector('[data-date]')?.dataset.date;
        if (!date) return;
        const t = rcDayTotals(date);
        const pct = rcTripKcalTarget ? Math.min(100, Math.round(t.kcal / rcTripKcalTarget * 100)) : 0;
        const stat = document.createElement('div');
        stat.className = 'rc-day-trip';
        stat.innerHTML = `
            <div class="rc-day-trip-line"><strong>${rcFmtKcal(t.kcal)}</strong> / ${rcFmtKcal(rcTripKcalTarget)} kcal · ${rcFmtWeight(t.grams)}${t.waterMl ? ` · ${rcFmtWater(t.waterMl)} water` : ''}${t.unknown.size ? ' · <span class="rc-trail-missing">incomplete</span>' : ''}</div>
            <div class="rc-bar"><span class="${pct >= 95 ? 'is-full' : ''}" style="width:${pct}%"></span></div>`;
        const header = dayEl.querySelector('.day-header');
        if (header) header.insertAdjacentElement('afterend', stat);
    });
}

// ----------------------------
// Pack by day (Shop tab)
// ----------------------------

let rcShopView = 'buy';

function rcSetShopView(view) {
    rcShopView = view;
    document.querySelectorAll('#rcShopViewToggle [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.getElementById('shoppingList').style.display = view === 'buy' ? '' : 'none';
    document.getElementById('rcShopSummary').style.display = view === 'buy' ? '' : 'none';
    document.getElementById('rcPackList').style.display = view === 'pack' ? '' : 'none';
    const sortSelect = document.getElementById('shoppingListSortSelect');
    if (sortSelect) sortSelect.style.display = view === 'buy' ? '' : 'none';
    if (view === 'pack') rcRenderPackList();
}

function rcRenderPackList() {
    const el = document.getElementById('rcPackList');
    if (!el) return;
    const days = Array.from(selectedDays).sort();
    if (!days.length) {
        el.innerHTML = '<div class="empty-state"><p><strong>No days planned yet.</strong></p><p class="rc-hint">Add days on the Plan tab, then come back for a pack list.</p></div>';
        return;
    }
    const people = rcPeople();
    el.innerHTML = days.map(date => {
        const t = rcDayTotals(date);
        const rows = t.meals.map(m => `
            <div class="rc-pack-row">
                <span class="rc-pack-meal">${capitalizeMealType(m.meal)}</span>
                <span class="rc-pack-name">${escapeHtml(m.recipe.name)}</span>
                <span class="rc-pack-vals">${rcFmtWeight(m.grams * people)}${people > 1 ? ` <small>(${rcFmtWeight(m.grams)} each)</small>` : ''}</span>
            </div>`).join('');
        return `
            <div class="rc-pack-day">
                <div class="shopping-category-header">${rcShortDate(date)} · ${rcFmtKcal(t.kcal)} kcal · ${rcFmtWeight(t.grams * people)}</div>
                ${rows || '<p class="rc-hint">Nothing planned for this day.</p>'}
                ${t.waterMl ? `<p class="rc-hint">Cooking water: ${rcFmtWater(t.waterMl * people)} for the group.</p>` : ''}
            </div>`;
    }).join('') + '<p class="rc-hint">Bag each day separately and label it. Weights are for the food as you pack it, before water.</p>';
}

// ----------------------------
// Wiring into the views (trip mode only)
// ----------------------------

function rcRefreshTripViews() {
    if (!RC_TRIP) return;
    updateDayPlanner();
    updateRecipeList();
    if (rcShopView === 'pack') rcRenderPackList();
}

if (RC_TRIP) {
    RC_MEAL_TYPES.splice(RC_MEAL_TYPES.indexOf('late-night'), 0, 'snacks');

    const rcTripBaseUpdateDayPlanner = updateDayPlanner;
    updateDayPlanner = function () {
        rcTripBaseUpdateDayPlanner();
        rcDecorateTripDays();
        rcRenderTripSummary();
    };

    // Default meals for new trip days include snacks
    const rcTripBaseAddDay = addDayToPlanner;
    addDayToPlanner = function () {
        rcTripBaseAddDay();
        const snacks = document.querySelector('input[name="rcMeal"][value="snacks"]');
        if (snacks) snacks.checked = true;
    };

    const rcTripBaseUpdateRecipeList = updateRecipeList;
    updateRecipeList = function () {
        rcTripBaseUpdateRecipeList();
        document.querySelectorAll('#recipeList .recipe-item').forEach(item => {
            const recipe = rcRecipeById(item.dataset.recipeId);
            const meta = item.querySelector('.recipe-row-summary > div > div:last-child');
            if (!recipe || !meta || meta.querySelector('.rc-row-kcal')) return;
            const n = rcRecipeNutrition(recipe);
            if (!n.kcal) return;
            const chip = document.createElement('span');
            chip.className = `rc-row-kcal rc-density ${rcDensityClass(n.density)}`;
            const perServ = n.serves ? `${rcFmtKcal(n.kcal / n.serves)} kcal/serv` : `${rcFmtKcal(n.kcal)} kcal`;
            chip.textContent = `${perServ} · ${n.density.toFixed(1)}/g${n.unknownCount ? '*' : ''}`;
            chip.title = n.unknownCount ? 'Some ingredients are not counted yet' : 'Calories per serving and per gram';
            // After the ingredient count, which phones hide to make room
            meta.insertBefore(chip, meta.children[1] || null);
        });
    };

    // New recipes written in trip mode are tagged "trail"
    const rcTripBaseOpenAdd = openAddRecipe;
    openAddRecipe = function () {
        rcTripBaseOpenAdd();
        if (!document.getElementById('editingRecipeId').value && !selectedTagsForForm.has('trail')) {
            selectedTagsForForm.add('trail');
            updateSelectedTagsDisplay();
        }
        rcRenderTrailPanel();
    };
    const rcTripBaseEditRecipe = editRecipe;
    editRecipe = function (id) {
        rcTripBaseEditRecipe(id);
        rcRenderTrailPanel();
    };

    const rcTripBaseSetUnitSystem = setUnitSystem;
    setUnitSystem = function (v) {
        rcTripBaseSetUnitSystem(v);
        rcRefreshTripViews();
        rcRenderTrailPanel();
    };

    const rcTripBaseSaveMealPlan = saveMealPlan;
    saveMealPlan = function () {
        rcTripBaseSaveMealPlan();
        if (rcShopView === 'pack') rcRenderPackList();
    };

    const rcTripBaseSetHeadcount = rcSetHeadcount;
    rcSetHeadcount = function (v) {
        rcTripBaseSetHeadcount(v);
        rcRefreshTripViews();
    };

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('recipeInput')?.addEventListener('input', rcScheduleTrailPanel);
        document.getElementById('recipeServings')?.addEventListener('input', rcScheduleTrailPanel);
        const kcalInput = document.getElementById('rcTripKcal');
        const waterInput = document.getElementById('rcTripWater');
        if (kcalInput) kcalInput.value = rcTripKcalTarget;
        if (waterInput) waterInput.value = rcTripWaterL;
        rcRenderTrailPanel();
        setTimeout(rcRefreshTripViews, 50);
    });
}

/** Switch between event and trip mode; the <head> script swaps the saved plans on reload */
function rcSwitchMode(mode) {
    const url = new URL(location.href);
    url.searchParams.delete('trip');
    url.searchParams.delete('event');
    url.searchParams.set(mode === 'trip' ? 'trip' : 'event', '');
    url.hash = '#planner';
    location.href = url.toString().replace(/=(&|#|$)/g, '$1');
}
