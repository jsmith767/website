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
                <li><strong>Recipes.</strong> Browse or search the library, filter by tag (gluten-free, quick, a contributor…), and tap a recipe for its ingredients, steps and a link to the original. Tap <strong>+ Add</strong> to paste in your own: one ingredient per line, and amounts and units are picked up automatically.</li>
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
            <p>Your recipes, plans and lists are saved in this browser on this device. Nothing is uploaded unless you press Share. Use <strong>⋯ → Export</strong> to keep a copy or move it to another device.</p>

            <h3>Coming next</h3>
            <ul class="rc-about-list">
                <li><strong>Pantry.</strong> Keep track of what's in stock, low or out, so recipes skip what you already have and show what you can make right now.</li>
                <li><strong>Community grocery list.</strong> A shared list for a household or community: say "oats are low" in the group chat and it's added. Tap an NFC tag or scan a QR code on the shelf to mark something low.</li>
                <li><strong>Smarter shopping.</strong> Suggest recipes that reuse what you're already buying (less waste), easy substitutions, and amounts rounded to what you actually buy.</li>
                <li><strong>For trips.</strong> A home prep list (cook, dehydrate, bag) and stove fuel estimates.</li>
                <li><strong>Later.</strong> Syncing between devices, and an optional assistant for adding recipes by voice or chat.</li>
            </ul>

            <h3>Credits</h3>
            <p>Many recipes come from <strong>Ava and Charlie's Digital Cookbook</strong> (tap their chip to see them). Recipes from websites and books link to the original for the full steps. Made by <a href="../index.html">Julian Smith</a>.</p>
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
    const wantsShare = !!(box && box.checked);
    const pending = pendingRecipeForReview;
    const editId = pending && pending.id;
    const countBefore = recipes.length;
    const result = rcBaseConfirmReview.apply(this, arguments);
    if (wantsShare) {
        const saved = editId ? rcRecipeById(editId) : (recipes.length > countBefore ? recipes[recipes.length - 1] : null);
        if (saved) setTimeout(() => rcOpenShare(String(saved.id)), 350);
        box.checked = false;
    }
    return result;
};
