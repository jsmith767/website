// Recipe Consolidator - Main JavaScript Logic

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Store for recipes and consolidated ingredients
let recipes = [];
let consolidatedIngredients = {};
let activeRecipeIds = new Set(); // Track which recipes are active for shopping list
let recipeMultipliers = {}; // Track multiplier for each recipe (e.g., making recipe 3x)
let recipeSortOrder = 'name-asc'; // Default sort order
let shoppingListSortOrder = 'alphabetical'; // Default shopping list sort order
let activeTagFilter = 'all'; // Active tag filter (default: 'all' shows all recipes) - DEPRECATED, use selectedTagFilters
let selectedTagFilters = new Set(); // Selected tags for filtering recipes
let tagFilterLogic = 'or'; // 'and' or 'or' - whether recipes must have ALL selected tags (and) or ANY selected tag (or)
let selectedIngredients = new Set(); // Selected ingredients for filtering
let selectedTagsForForm = new Set(); // Tags selected when adding/editing a recipe
let mealPlan = {}; // Object to store meal plan: { date: { breakfast: [recipeIds], lunch: [recipeIds], dinner: [recipeIds] } }
let mealPlanNotes = {}; // Object to store notes for recipe instances: { date: { meal: { recipeId: "note" } } }
let selectedDays = new Set(); // Selected days for the planner

// LocalStorage keys
const STORAGE_KEY = 'recipeConsolidator_recipes';
const UNIT_SYSTEM_KEY = 'recipeConsolidator_unitSystem';
const SHOPPING_LIST_SORT_KEY = 'recipeConsolidator_shoppingListSort';
const TAG_FILTER_KEY = 'recipeConsolidator_tagFilter';
const SELECTED_TAG_FILTERS_KEY = 'recipeConsolidator_selectedTagFilters';
const TAG_FILTER_LOGIC_KEY = 'recipeConsolidator_tagFilterLogic';
const MEAL_PLAN_KEY = 'recipeConsolidator_mealPlan';
const MEAL_PLAN_NOTES_KEY = 'recipeConsolidator_mealPlanNotes';
const SELECTED_DAYS_KEY = 'recipeConsolidator_selectedDays';

// Unit system preference (default: imperial)
let unitSystem = 'imperial';

// Temporary state for ingredient review before saving a new recipe or edit
let pendingRecipeForReview = null;
let pendingIngredientsForReview = null;

// ----------------------------
// Recipe Assistant (local-first)
// ----------------------------

// Feature flag: keep the assistant code available, but hide it from the site until it's ready.
const ENABLE_RECIPE_ASSISTANT_UI = false;

// If you later add a backend endpoint (recommended for real AI), set this to a URL like:
// const RECIPE_ASSISTANT_API_URL = '/api/recipe-assistant';
const RECIPE_ASSISTANT_API_URL = '';

// Minimal pantry assumption (used for matching; not required)
const RECIPE_ASSISTANT_PANTRY = [
    'salt',
    'pepper',
    'olive oil',
    'vegetable oil',
    'butter',
    'water',
    'flour',
    'sugar',
    'garlic',
    'onion'
];

// Simple substitution hints. Keys should be normalized ingredient names.
const INGREDIENT_SUBSTITUTIONS = {
    'buttermilk': [
        'Milk + lemon juice (or vinegar): 1 cup milk + 1 tbsp acid, rest 5–10 min',
        'Yogurt thinned with milk',
        'Kefir'
    ],
    'egg': [
        'For baking: 1 tbsp ground flax + 3 tbsp water (per egg)',
        'For binding: chia egg (1 tbsp chia + 3 tbsp water)',
        'For moisture: applesauce (varies by recipe)'
    ],
    'butter': [
        'Olive oil (often works in sautés; baking is recipe-dependent)',
        'Ghee',
        'Coconut oil (will add flavor)'
    ],
    'sour cream': [
        'Greek yogurt',
        'Crème fraîche',
        'Labneh'
    ],
    'heavy cream': [
        'Half-and-half + butter (roughly 3/4 cup half-and-half + 1/4 cup melted butter)',
        'Coconut cream (adds coconut flavor)'
    ],
    'brown sugar': [
        'White sugar + a bit of molasses',
        'Coconut sugar (flavor differs)'
    ],
    'soy sauce': [
        'Tamari (gluten-free if certified)',
        'Coconut aminos (sweeter)',
        'Salt + a bit of acid (worst-case)'
    ],
    'lemon': [
        'Lime',
        'Vinegar (small amount, depends on use)'
    ],
    'lime': [
        'Lemon',
        'Vinegar (small amount, depends on use)'
    ],
    'coconut milk': [
        'Heavy cream (not vegan, flavor differs)',
        'Cashew cream (blend cashews + water)',
        'Oat cream'
    ]
};

function assistantGetEl(id) {
    return document.getElementById(id);
}

function assistantScrollToBottom() {
    const box = assistantGetEl('assistantMessages');
    if (!box) return;
    box.scrollTop = box.scrollHeight;
}

function assistantAppendUserMessage(text) {
    const box = assistantGetEl('assistantMessages');
    if (!box) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'assistant-msg user';
    const bubble = document.createElement('div');
    bubble.className = 'assistant-bubble';
    bubble.textContent = text;
    wrapper.appendChild(bubble);
    box.appendChild(wrapper);
    assistantScrollToBottom();
}

function assistantAppendAssistantHtml(html, metaText = '') {
    const box = assistantGetEl('assistantMessages');
    if (!box) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'assistant-msg assistant';
    const bubble = document.createElement('div');
    bubble.className = 'assistant-bubble';
    bubble.innerHTML = html;
    wrapper.appendChild(bubble);

    if (metaText) {
        const meta = document.createElement('div');
        meta.className = 'assistant-meta';
        meta.textContent = metaText;
        wrapper.appendChild(meta);
    }

    box.appendChild(wrapper);
    assistantScrollToBottom();
}

function assistantFillAndSend(text) {
    const input = assistantGetEl('assistantInput');
    if (input) input.value = text;
    assistantSend();
}

function assistantNormalizeList(items) {
    const out = [];
    const seen = new Set();
    for (const raw of items) {
        const n = normalizeIngredientName(raw);
        if (!n) continue;
        if (seen.has(n)) continue;
        seen.add(n);
        out.push(n);
    }
    return out;
}

function assistantExtractWantedIngredients(queryText) {
    if (!queryText) return [];
    const lower = queryText.toLowerCase();

    // Try to focus on the part after common phrases ("i have", "uses", "with")
    let focus = lower;
    const match = lower.match(/\b(i have|i've got|we have|using|uses|with)\b([\s\S]*)$/i);
    if (match && match[2]) {
        focus = match[2];
    }

    focus = focus
        .replace(/basic pantry items?/g, '')
        .replace(/pantry items?/g, '')
        .replace(/ingredients?/g, '')
        .replace(/\band\b/gi, ',');

    const parts = focus.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);

    // If the user wrote something like "x y z" without commas, fallback to splitting on " & "
    const expanded = [];
    for (const p of parts) {
        const more = p.split(/\s*&\s*/).map(s => s.trim()).filter(Boolean);
        expanded.push(...more);
    }

    return assistantNormalizeList(expanded);
}

function assistantRecipeIngredientSet(recipe) {
    const set = new Set();
    if (!recipe || !Array.isArray(recipe.ingredients)) return set;
    for (const ing of recipe.ingredients) {
        const name = normalizeIngredientName(ing.ingredient || '');
        if (name) set.add(name);
    }
    return set;
}

function assistantIsPantryItem(normalizedIngredient) {
    const pantrySet = new Set(RECIPE_ASSISTANT_PANTRY.map(i => normalizeIngredientName(i)));
    return pantrySet.has(normalizedIngredient);
}

function assistantFindRecipeMatches(wanted, limit = 6) {
    const wantSet = new Set(wanted);
    const scored = [];

    for (const recipe of recipes) {
        const ingSet = assistantRecipeIngredientSet(recipe);
        if (ingSet.size === 0) continue;

        let overlap = 0;
        for (const w of wantSet) {
            if (ingSet.has(w)) overlap += 1;
        }

        if (overlap === 0) continue;

        // Compute "missing" = ingredients in recipe not in wanted and not in pantry
        let missingCount = 0;
        for (const rIng of ingSet) {
            if (wantSet.has(rIng)) continue;
            if (assistantIsPantryItem(rIng)) continue;
            missingCount += 1;
        }

        scored.push({
            recipe,
            overlap,
            missingCount
        });
    }

    scored.sort((a, b) => {
        // Highest overlap first, then fewer missing ingredients, then alphabetical
        if (b.overlap !== a.overlap) return b.overlap - a.overlap;
        if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
        return (a.recipe.name || '').localeCompare(b.recipe.name || '');
    });

    return scored.slice(0, limit);
}

function assistantSubstitutionFor(queryText) {
    if (!queryText) return '';
    const lower = queryText.toLowerCase();
    const m = lower.match(/\b(sub(stitute|stitution)\s+(for|to replace)|replace)\b([\s\S]*)$/i);
    const tail = m && m[4] ? m[4].trim() : '';
    const normalized = normalizeIngredientName(tail || lower);
    if (!normalized) return '';
    const hints = INGREDIENT_SUBSTITUTIONS[normalized];
    if (!hints || hints.length === 0) return '';
    const items = hints.map(h => `<li>${escapeHtml(h)}</li>`).join('');
    return `
        <div><strong>Substitution ideas for "${escapeHtml(normalized)}":</strong></div>
        <ul style="margin: 8px 0 0 18px; padding: 0;">${items}</ul>
    `;
}

function assistantRenderMatches(wanted, matches) {
    const wantedText = wanted.length ? wanted.map(escapeHtml).join(', ') : '';
    const pantryText = RECIPE_ASSISTANT_PANTRY.map(p => escapeHtml(p)).join(', ');

    if (!matches || matches.length === 0) {
        return `
            <div><strong>I couldn’t find any good matches</strong> in your current recipe library.</div>
            <div style="margin-top: 8px;">Try loading more recipes (e.g. <strong>Load Preloaded Recipes</strong>) or add a few recipes first.</div>
            <div style="margin-top: 8px; color: #6a6a6a; font-size: 13px;">Pantry assumed: ${pantryText}</div>
        `;
    }

    const rows = matches.map(({ recipe, overlap, missingCount }) => {
        const safeName = escapeHtml(recipe.name || 'Untitled recipe');
        const activeLabel = activeRecipeIds.has(recipe.id) ? 'Remove from list' : 'Add to list';
        return `
            <div style="padding: 10px 10px; border: 1px solid #e8e8e8; border-radius: 8px; background: #fff; margin-top: 10px;">
                <div style="display:flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap;">
                    <div>
                        <div style="font-weight: 600; color: #2c2c2c;">${safeName}</div>
                        <div style="font-size: 13px; color: #6a6a6a; margin-top: 2px;">
                            Match: ${overlap} ingredient${overlap !== 1 ? 's' : ''} • Missing (non-pantry): ${missingCount}
                        </div>
                    </div>
                    <div class="assistant-inline-actions">
                        <button class="assistant-mini-btn" type="button" onclick="toggleRecipeActive(${recipe.id})">${escapeHtml(activeLabel)}</button>
                        <button class="assistant-mini-btn" type="button" onclick="showIngredientsModal(${recipe.id})">Ingredients</button>
                        <button class="assistant-mini-btn" type="button" onclick="showAboutModal(${recipe.id})">About</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div><strong>Ingredients you mentioned:</strong> ${wantedText || '(none detected)'}</div>
        <div style="margin-top: 8px;"><strong>Top matches:</strong></div>
        ${rows}
        <div style="margin-top: 10px; color: #6a6a6a; font-size: 13px;">Pantry assumed: ${pantryText}</div>
    `;
}

async function assistantSend() {
    const input = assistantGetEl('assistantInput');
    if (!input) return;
    const text = (input.value || '').trim();
    if (!text) return;

    assistantAppendUserMessage(text);
    input.value = '';

    // If we have a backend AI endpoint later, use it.
    if (RECIPE_ASSISTANT_API_URL) {
        try {
            assistantAppendAssistantHtml('Thinking…');
            const response = await fetch(RECIPE_ASSISTANT_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: text,
                    recipes: recipes.map(r => ({
                        id: r.id,
                        name: r.name,
                        tags: r.tags || [],
                        ingredients: (r.ingredients || []).map(i => i.ingredient)
                    }))
                })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            // Replace "Thinking…" with actual response by appending a new message (simple approach)
            assistantAppendAssistantHtml(escapeHtml(data.message || 'OK'));
            return;
        } catch (e) {
            console.warn('Assistant AI endpoint failed; falling back to local assistant:', e);
        }
    }

    // Substitution-only query?
    const subHtml = assistantSubstitutionFor(text);
    if (subHtml) {
        assistantAppendAssistantHtml(subHtml);
        return;
    }

    // Local recipe matching
    const wanted = assistantExtractWantedIngredients(text);
    const matches = assistantFindRecipeMatches(wanted, 6);
    assistantAppendAssistantHtml(assistantRenderMatches(wanted, matches));
}

function initRecipeAssistant() {
    const card = assistantGetEl('assistantCard');
    if (!ENABLE_RECIPE_ASSISTANT_UI) {
        if (card) card.style.display = 'none';
        return;
    }
    if (card) card.style.display = 'block';

    const box = assistantGetEl('assistantMessages');
    if (!box) return;
    assistantAppendAssistantHtml(
        'Tell me what ingredients you want to use (comma-separated works great), and I’ll suggest recipes from your library.<br><br>Example: <strong>"I have tofu, broccoli, and rice. What can I make?"</strong>'
    );
}

/**
 * Toggle visibility of advanced source & affiliate fields in the Add Recipe form
 */
function toggleAdvancedSourceFields() {
    const container = document.getElementById('advancedSourceFields');
    if (!container) return;
    const isHidden = container.style.display === 'none' || container.style.display === '';
    container.style.display = isHidden ? 'block' : 'none';
}

/**
 * Save recipes to localStorage
 */
function saveRecipes() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
    } catch (error) {
        console.error('Error saving recipes:', error);
        showMessage('Could not save recipes to browser storage', 'error');
    }
}

/**
 * Save active recipe IDs to localStorage
 */
function saveActiveRecipes() {
    try {
        localStorage.setItem('recipeConsolidator_activeRecipes', JSON.stringify(Array.from(activeRecipeIds)));
    } catch (error) {
        console.error('Error saving active recipes:', error);
    }
}

/**
 * Save recipe multipliers to localStorage
 */
function saveRecipeMultipliers() {
    try {
        localStorage.setItem('recipeConsolidator_multipliers', JSON.stringify(recipeMultipliers));
    } catch (error) {
        console.error('Error saving recipe multipliers:', error);
    }
}

/**
 * Load recipes from localStorage
 */
function loadRecipes() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            recipes = JSON.parse(saved);
            
            // Load active recipe IDs
            const savedActive = localStorage.getItem('recipeConsolidator_activeRecipes');
            if (savedActive) {
                try {
                    activeRecipeIds = new Set(JSON.parse(savedActive));
                } catch (e) {
                    // If error, activate all recipes by default
                    activeRecipeIds = new Set(recipes.map(r => r.id));
                }
            } else {
                // If no saved active state, activate all recipes by default
                activeRecipeIds = new Set(recipes.map(r => r.id));
            }
            
            // Load recipe multipliers
            const savedMultipliers = localStorage.getItem('recipeConsolidator_multipliers');
            if (savedMultipliers) {
                try {
                    recipeMultipliers = JSON.parse(savedMultipliers);
                    // Ensure all active recipes have at least multiplier 1
                    for (const id of activeRecipeIds) {
                        if (!recipeMultipliers[id]) {
                            recipeMultipliers[id] = 1;
                        }
                    }
                } catch (e) {
                    recipeMultipliers = {};
                    // Set default multiplier of 1 for all active recipes
                    for (const id of activeRecipeIds) {
                        recipeMultipliers[id] = 1;
                    }
                }
            } else {
                // Set default multiplier of 1 for all active recipes
                recipeMultipliers = {};
                for (const id of activeRecipeIds) {
                    recipeMultipliers[id] = 1;
                }
            }
            
            // Load sort order
            const savedSort = localStorage.getItem('recipeConsolidator_sortOrder');
            if (savedSort) {
                recipeSortOrder = savedSort;
            }
            
            // Migrate old recipes to include tags (no auto-tagging)
            let needsSave = false;
            recipes.forEach(recipe => {
                // Initialize tags if missing (for old recipes)
                if (!recipe.tags) {
                    // If old recipe has manualTags, use them, otherwise empty array
                    const oldManualTags = recipe.manualTags || [];
                    recipe.tags = oldManualTags;
                    delete recipe.manualTags; // Remove old property
                    needsSave = true;
                } else if (recipe.manualTags) {
                    // If recipe has both tags and manualTags, merge them
                    recipe.tags = [...new Set([...recipe.tags, ...recipe.manualTags])];
                    delete recipe.manualTags; // Remove old property
                    needsSave = true;
                }
            });
            
            // Save migrated recipes
            if (needsSave) {
                saveRecipes();
            }
            
            // Consolidate ingredients and update UI
            consolidateIngredients();
            updateRecipeList();
            updateShoppingList();
            updateTagFilters();
            if (recipes.length > 0) {
                showMessage(`Loaded ${recipes.length} saved recipe${recipes.length !== 1 ? 's' : ''}`, 'success');
            }
        }
    } catch (error) {
        console.error('Error loading recipes:', error);
        // If there's an error, clear the corrupted data
        localStorage.removeItem(STORAGE_KEY);
    }
}

// Unit conversion factors (all converted to base units: grams for weight, milliliters for volume)
const UNIT_CONVERSIONS = {
    // Volume conversions (to milliliters)
    volume: {
        'cup': 240,
        'cups': 240,
        'c': 240,
        'c.': 240,  // abbreviation for cups
        'cup.': 240,
        'tablespoon': 15,
        'tablespoons': 15,
        'tbsp': 15,
        'tbsp.': 15,
        'tbs': 15,
        'tbs.': 15,
        'T': 15,
        'T.': 15,
        'TB': 15,
        'TBSP': 15,
        'teaspoon': 5,
        'teaspoons': 5,
        'tsp': 5,
        'tsp.': 5,
        't': 5,
        't.': 5,
        'TSP': 5,
        'fluid ounce': 30,
        'fluid ounces': 30,
        'fl oz': 30,
        'fl. oz.': 30,
        'fl oz.': 30,
        'fl': 30,
        'pint': 480,
        'pints': 480,
        'pt': 480,
        'pt.': 480,
        'quart': 960,
        'quarts': 960,
        'qt': 960,
        'qt.': 960,
        'gallon': 3840,
        'gallons': 3840,
        'gal': 3840,
        'gal.': 3840,
        'milliliter': 1,
        'milliliters': 1,
        'ml': 1,
        'ml.': 1,
        'liter': 1000,
        'liters': 1000,
        'l': 1000,
        'l.': 1000,
        'L': 1000,
        'L.': 1000
    },
    // Weight conversions (to grams)
    weight: {
        'ounce': 28.35,
        'ounces': 28.35,
        'oz': 28.35,
        'oz.': 28.35,
        'pound': 453.6,
        'pounds': 453.6,
        'lb': 453.6,
        'lb.': 453.6,
        'lbs': 453.6,
        'lbs.': 453.6,
        'pound.': 453.6,
        'gram': 1,
        'grams': 1,
        'g': 1,
        'g.': 1,
        'kilogram': 1000,
        'kilograms': 1000,
        'kg': 1000,
        'kg.': 1000
    }
};

// Common ingredient aliases for normalization
const INGREDIENT_ALIASES = {
    'flour': ['all-purpose flour', 'ap flour', 'plain flour', 'white flour'],
    'onion': ['yellow onion', 'white onion', 'onions'],
    'garlic': ['garlic cloves', 'garlic clove'],
    'salt': ['table salt', 'kosher salt'],
    'sugar': ['white sugar', 'granulated sugar'],
    'butter': ['unsalted butter', 'salted butter'],
    'oil': ['vegetable oil', 'cooking oil', 'canola oil'],
    'pepper': ['black pepper', 'ground pepper'],
    'milk': ['whole milk', '2% milk', 'skim milk']
};

// Common prep / descriptor words we want in notes, not in the base ingredient name
const INGREDIENT_PREP_WORDS = [
    'fresh', 'dried', 'ground', 'chopped', 'diced', 'sliced', 'minced',
    'grated', 'crushed', 'peeled', 'shredded', 'finely', 'roughly',
    'coarsely', 'halved', 'quartered', 'ripe', 'large', 'small', 'medium',
    'optional', 'to taste'
];

// Auto-tagging rules based on ingredients and recipe names
const AUTO_TAG_RULES = {
    'breakfast': {
        ingredients: ['egg', 'eggs', 'bacon', 'sausage', 'pancake', 'waffle', 'toast', 'bagel', 'muffin', 'cereal', 'oatmeal', 'oats', 'yogurt', 'granola'],
        nameKeywords: ['breakfast', 'pancake', 'waffle', 'muffin', 'omelet', 'omelette', 'frittata', 'scramble']
    },
    'salad': {
        ingredients: ['lettuce', 'spinach', 'kale', 'arugula', 'romaine', 'mixed greens', 'cucumber', 'tomato', 'dressing', 'vinaigrette'],
        nameKeywords: ['salad', 'coleslaw', 'slaw']
    },
    'dessert': {
        ingredients: ['sugar', 'flour', 'chocolate', 'vanilla', 'butter', 'cream', 'icing', 'frosting'],
        nameKeywords: ['cake', 'cookie', 'pie', 'brownie', 'dessert', 'muffin', 'cupcake', 'pudding', 'custard']
    },
    'soup': {
        ingredients: ['broth', 'stock', 'bouillon'],
        nameKeywords: ['soup', 'stew', 'chili', 'chowder', 'bisque']
    },
    'pasta': {
        ingredients: ['pasta', 'noodle', 'spaghetti', 'penne', 'fettuccine', 'linguine', 'macaroni'],
        nameKeywords: ['pasta', 'spaghetti', 'lasagna', 'ravioli', 'gnocchi']
    }
};

// Ingredient categories for shopping list organization
const INGREDIENT_CATEGORIES = {
    'Spices & Seasonings': [
        'salt', 'pepper', 'paprika', 'cumin', 'coriander', 'turmeric', 'cinnamon', 'nutmeg', 'cloves', 'allspice',
        'cardamom', 'ginger', 'garlic', 'onion', 'shallot', 'herbs', 'basil', 'oregano', 'thyme', 'rosemary',
        'parsley', 'cilantro', 'dill', 'sage', 'bay leaf', 'vanilla', 'extract', 'spice', 'seasoning',
        'chili', 'cayenne', 'red pepper', 'black pepper', 'white pepper', 'curry', 'mustard', 'horseradish'
    ],
    'Oils & Fats': [
        'oil', 'butter', 'margarine', 'shortening', 'lard', 'coconut oil', 'olive oil', 'vegetable oil',
        'canola oil', 'sesame oil', 'avocado oil', 'ghee', 'bacon fat', 'duck fat', 'schmaltz'
    ],
    'Vegetables': [
        'carrot', 'celery', 'onion', 'garlic', 'potato', 'tomato', 'pepper', 'bell pepper', 'mushroom',
        'zucchini', 'squash', 'eggplant', 'broccoli', 'cauliflower', 'cabbage', 'lettuce', 'spinach',
        'kale', 'chard', 'asparagus', 'green beans', 'peas', 'corn', 'cucumber', 'radish', 'turnip',
        'parsnip', 'beet', 'leek', 'shallot', 'scallion', 'green onion', 'fennel', 'artichoke', 'brussels',
        'sprout', 'bok choy', 'cabbage', 'kohlrabi'
    ],
    'Fruits': [
        'apple', 'banana', 'orange', 'lemon', 'lime', 'grapefruit', 'berry', 'strawberry', 'blueberry',
        'raspberry', 'blackberry', 'cranberry', 'grape', 'pear', 'peach', 'plum', 'apricot', 'cherry',
        'mango', 'pineapple', 'papaya', 'kiwi', 'melon', 'watermelon', 'cantaloupe', 'honeydew', 'date',
        'fig', 'pomegranate', 'avocado'
    ],
    'Dairy & Eggs': [
        'milk', 'cream', 'half and half', 'buttermilk', 'yogurt', 'sour cream', 'cheese', 'cheddar',
        'mozzarella', 'parmesan', 'ricotta', 'cottage cheese', 'cream cheese', 'feta', 'goat cheese',
        'blue cheese', 'swiss', 'gouda', 'brie', 'eggs', 'egg', 'butter', 'margarine'
    ],
    'Meat & Seafood': [
        'beef', 'pork', 'chicken', 'turkey', 'duck', 'lamb', 'veal', 'bacon', 'sausage', 'ham',
        'prosciutto', 'pancetta', 'salmon', 'tuna', 'cod', 'halibut', 'shrimp', 'crab', 'lobster',
        'scallop', 'mussel', 'clam', 'oyster', 'squid', 'octopus', 'anchovy', 'sardine'
    ],
    'Grains & Bread': [
        'flour', 'wheat', 'rice', 'pasta', 'noodle', 'bread', 'bun', 'roll', 'bagel', 'pita', 'tortilla',
        'quinoa', 'barley', 'oats', 'oatmeal', 'couscous', 'bulgur', 'polenta', 'cornmeal', 'breadcrumb',
        'cracker', 'cereal'
    ],
    'Legumes & Nuts': [
        'bean', 'black bean', 'kidney bean', 'chickpea', 'lentil', 'split pea', 'peanut', 'almond',
        'walnut', 'pecan', 'cashew', 'pistachio', 'hazelnut', 'macadamia', 'pine nut', 'sesame',
        'sunflower seed', 'pumpkin seed', 'chia', 'flax'
    ],
    'Pantry Staples': [
        'sugar', 'brown sugar', 'powdered sugar', 'honey', 'maple syrup', 'molasses', 'corn syrup',
        'vinegar', 'balsamic', 'rice vinegar', 'wine vinegar', 'soy sauce', 'tamari', 'worcestershire',
        'hot sauce', 'sriracha', 'ketchup', 'mayonnaise', 'mustard', 'relish', 'pickle', 'olive',
        'capers', 'sundried tomato', 'tomato paste', 'tomato sauce', 'broth', 'stock', 'bouillon',
        'bouillon cube', 'baking powder', 'baking soda', 'yeast', 'cocoa', 'chocolate', 'coconut'
    ],
    'Beverages': [
        'wine', 'beer', 'juice', 'coffee', 'tea', 'water', 'soda', 'sparkling', 'broth', 'stock'
    ],
    'Other': [] // Default category for items that don't match
};

/**
 * Normalize ingredient name for grouping
 */
function normalizeIngredientName(name) {
    if (!name) return '';
    
    let normalized = name.toLowerCase().trim();
    
    // Pull out anything in parentheses as a note (but don't use it for the key)
    // e.g. "soy sauce (or tamari)" -> name "soy sauce", note "(or tamari)"
    normalized = normalized.replace(/\(.*?\)/g, '').trim();
    
    // Remove any trailing descriptive clause after a comma
    // e.g. "onion, finely chopped" -> "onion"
    normalized = normalized.split(',')[0].trim();
    
    const prepRegex = new RegExp(
        `^(?:${INGREDIENT_PREP_WORDS.join('|')})\\s+|\\s+(?:${INGREDIENT_PREP_WORDS.join('|')})$`,
        'gi'
    );
    normalized = normalized.replace(prepRegex, '').trim();
    
    // Collapse multiple spaces
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    // Very simple plural normalization for common patterns
    if (normalized.endsWith('es')) {
        // tomatoes -> tomato, potatoes -> potato
        normalized = normalized.replace(/(tomatoes|potatoes)$/i, m => m.slice(0, -2));
    } else if (normalized.endsWith('s')) {
        // onions -> onion, carrots -> carrot
        normalized = normalized.slice(0, -1);
    }
    
    // Check aliases
    for (const [key, aliases] of Object.entries(INGREDIENT_ALIASES)) {
        if (normalized === key || aliases.some(alias => normalized.includes(alias) || alias.includes(normalized))) {
            return key;
        }
    }
    
    return normalized;
}

/**
 * Infer "notes" (prep/alternatives/etc.) from an ingredient display name
 * by stripping out the normalized base name and keeping the rest.
 */
function inferIngredientNotes(rawName) {
    if (!rawName) return '';
    
    const normalized = normalizeIngredientName(rawName);
    if (!normalized) return '';
    
    const lowerRaw = rawName.toLowerCase();
    const lowerNorm = normalized.toLowerCase();
    const idx = lowerRaw.indexOf(lowerNorm);
    if (idx === -1) return '';
    
    // Remove the normalized part and surrounding punctuation/whitespace
    const before = rawName.slice(0, idx).trim();
    const after = rawName.slice(idx + normalized.length).trim();
    let combined = [before, after].filter(Boolean).join(' ').trim();
    combined = combined.replace(/^[,.-\s]+|[,.-\s]+$/g, '');

    if (!combined) return '';

    // Strip a single layer of wrapping parentheses if present
    combined = combined.replace(/^\((.*)\)$/, '$1').trim();

    // If there is a dash, prefer the part after the dash (e.g. "es — cubed" -> "cubed")
    if (combined.includes('—')) {
        const parts = combined.split('—').map(p => p.trim()).filter(Boolean);
        // Drop trivial plural suffix fragments like "s" or "es"
        const filtered = parts.filter(p => !/^(s|es)$/i.test(p));
        combined = (filtered[0] || parts[parts.length - 1] || '').trim();
    }

    // If what's left is just a plural suffix, treat as no notes
    if (/^(s|es)$/i.test(combined)) {
        return '';
    }

    // Some adjectives (like "kosher" or "sea") are really part of the ingredient
    // name (e.g. "kosher salt", "sea salt") and shouldn't be treated as notes.
    const adjective = combined.toLowerCase();
    if (adjective === 'kosher' || adjective === 'sea') {
        return '';
    }

    return combined;
}

/**
 * Move obvious prep/descriptor words out of the ingredient name into notes
 * e.g. "sliced almonds" -> ingredient: "almonds", notes: "sliced"
 */
function splitPrepWordsFromName(name, existingNotes) {
    if (!name) {
        return { ingredientName: '', notes: existingNotes || '' };
    }
    
    let ingredientName = name.trim();
    // Remove any parenthetical note fragments from the ingredient name itself;
    // their content should already have been picked up as notes by inferIngredientNotes
    ingredientName = ingredientName.replace(/\(.*?\)/g, '').trim();
    const notesParts = existingNotes ? [existingNotes] : [];
    
    // Keep pulling prep words from start/end until nothing changes
    let changed = true;
    while (changed && ingredientName) {
        changed = false;
        const lower = ingredientName.toLowerCase();
        
        for (const word of INGREDIENT_PREP_WORDS) {
            const wl = word.toLowerCase();
            const prefix = wl + ' ';
            const suffix = ' ' + wl;
            
            if (lower.startsWith(prefix)) {
                ingredientName = ingredientName.slice(prefix.length).trim();
                notesParts.push(word);
                changed = true;
                break;
            }
            
            if (lower.endsWith(suffix)) {
                ingredientName = ingredientName.slice(0, lower.lastIndexOf(suffix)).trim();
                notesParts.push(word);
                changed = true;
                break;
            }
        }
    }
    
    // Clean trailing commas/spaces from ingredient name
    ingredientName = ingredientName.replace(/[,\s]+$/g, '').trim();
    
    // Split notes into tokens, clean trivial plural fragments, dedupe, and rejoin
    const rawTokens = notesParts
        .join(', ')
        .split(/\s*,\s*/)
        .map(t => t.trim())
        .filter(Boolean);
        
    // For each token, drop tiny plural suffix artifacts like "s" or "es"
    const tokens = [];
    for (const t of rawTokens) {
        const words = t.split(/\s+/).filter(Boolean);
        const keptWords = words.filter(w => !/^(s|es)$/i.test(w));
        if (keptWords.length) {
            tokens.push(keptWords.join(' '));
        }
    }
        
    const seen = new Set();
    const unique = [];
    for (const t of tokens) {
        const key = t.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(t);
        }
    }
    
    const notes = unique.join(', ').trim();
    return { ingredientName, notes };
}

/**
 * Parse fraction string to decimal
 */
function parseFraction(fractionStr) {
    if (!fractionStr) return 0;
    
    fractionStr = fractionStr.trim();
    
    // Handle mixed numbers like "1 1/2" or "2 1/4"
    const mixedMatch = fractionStr.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixedMatch) {
        const whole = parseFloat(mixedMatch[1]);
        const num = parseFloat(mixedMatch[2]);
        const den = parseFloat(mixedMatch[3]);
        if (den !== 0) {
            return whole + (num / den);
        }
    }
    
    // Handle simple fractions like "1/2" or "3/4"
    const fractionMatch = fractionStr.match(/^(\d+)\/(\d+)$/);
    if (fractionMatch) {
        const num = parseFloat(fractionMatch[1]);
        const den = parseFloat(fractionMatch[2]);
        if (den !== 0) {
            return num / den;
        }
    }
    
    // Handle decimal numbers like "1.5" or "2.25"
    const decimal = parseFloat(fractionStr);
    if (!isNaN(decimal) && isFinite(decimal)) {
        return decimal;
    }
    
    // Handle whole numbers
    const wholeMatch = fractionStr.match(/^(\d+)$/);
    if (wholeMatch) {
        return parseFloat(wholeMatch[1]);
    }
    
    return 0;
}

/**
 * Convert Unicode fraction character to decimal
 */
function unicodeFractionToDecimal(fracChar) {
    const fractions = {
        '½': 1/2, '⅓': 1/3, '⅔': 2/3, '¼': 1/4, '¾': 3/4, '⅕': 1/5,
        '⅖': 2/5, '⅗': 3/5, '⅘': 4/5, '⅙': 1/6, '⅚': 5/6, '⅛': 1/8,
        '⅜': 3/8, '⅝': 5/8, '⅞': 7/8
    };
    return fractions[fracChar] || null;
}

/**
 * Extract quantity from the start of a string
 * Returns: { quantity: number, consumed: number of characters consumed }
 */
function extractQuantity(text) {
    text = text.trim();
    
    // Try range: "6-8" or "2-3" (use upper bound for shopping lists)
    const rangeMatch = text.match(/^(\d+)\s*-\s*(\d+)(?:\s|$|[^\d])/);
    if (rangeMatch) {
        const min = parseFloat(rangeMatch[1]);
        const max = parseFloat(rangeMatch[2]);
        if (!isNaN(min) && !isNaN(max) && max >= min) {
            // Use upper bound for shopping lists (better to have enough)
            return {
                quantity: max,
                consumed: rangeMatch[0].trim().length
            };
        }
    }
    
    // Try mixed number with Unicode fraction: "1½" or "2¼" (no space) - MUST check before whole number
    // This must be checked FIRST before any whole number pattern
    const mixedUnicodeMatch = text.match(/^(\d+)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/);
    if (mixedUnicodeMatch) {
        const whole = parseFloat(mixedUnicodeMatch[1]);
        const fracChar = mixedUnicodeMatch[2];
        const fracValue = unicodeFractionToDecimal(fracChar);
        if (fracValue !== null) {
            // Calculate consumed length: whole number digits + fraction character
            const consumed = mixedUnicodeMatch[1].length + fracChar.length;
            return {
                quantity: whole + fracValue,
                consumed: consumed
            };
        }
    }
    
    // Try mixed number with space and Unicode fraction: "1 ½" or "2 ¼"
    const mixedUnicodeSpaceMatch = text.match(/^(\d+)\s+([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/);
    if (mixedUnicodeSpaceMatch) {
        const whole = parseFloat(mixedUnicodeSpaceMatch[1]);
        const fracValue = unicodeFractionToDecimal(mixedUnicodeSpaceMatch[2]);
        if (fracValue !== null) {
            return {
                quantity: whole + fracValue,
                consumed: mixedUnicodeSpaceMatch[0].length
            };
        }
    }
    
    // Try standalone Unicode fraction: "½" or "¼" (only if NOT preceded by a digit)
    const unicodeFractionMatch = text.match(/^([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])(?:\s|$|[^\d])/);
    if (unicodeFractionMatch) {
        // Make sure this isn't part of a mixed number by checking what came before
        const fracValue = unicodeFractionToDecimal(unicodeFractionMatch[1]);
        if (fracValue !== null) {
            return {
                quantity: fracValue,
                consumed: unicodeFractionMatch[0].trim().length
            };
        }
    }
    
    // Try mixed number FIRST: "2 1/4" or "1 1/2" (must check before whole number)
    // This regex matches: whole number + space + fraction
    // Important: must have at least one space between whole number and fraction
    const mixedMatch = text.match(/^(\d+)\s+(\d+)\/(\d+)(?:\s|$|[^\d])/);
    if (mixedMatch) {
        const whole = parseFloat(mixedMatch[1]);
        const num = parseFloat(mixedMatch[2]);
        const den = parseFloat(mixedMatch[3]);
        if (den !== 0 && num < den) { // Validate: numerator should be less than denominator
            return {
                quantity: whole + (num / den),
                consumed: mixedMatch[0].trim().length
            };
        }
    }
    
    // Try simple fraction: "1/2" or "3/4"
    const fractionMatch = text.match(/^(\d+)\/(\d+)(?:\s|$|[^\d])/);
    if (fractionMatch) {
        const num = parseFloat(fractionMatch[1]);
        const den = parseFloat(fractionMatch[2]);
        if (den !== 0 && num < den) { // Validate: numerator should be less than denominator
            return {
                quantity: num / den,
                consumed: fractionMatch[0].trim().length
            };
        }
    }
    
    // Try decimal: "1.5" or "2.25"
    const decimalMatch = text.match(/^(\d+\.\d+)(?:\s|$|[^\d])/);
    if (decimalMatch) {
        const val = parseFloat(decimalMatch[1]);
        if (!isNaN(val) && isFinite(val)) {
            return {
                quantity: val,
                consumed: decimalMatch[0].trim().length
            };
        }
    }
    
    // Try whole number LAST: "2" or "10" (only if no fraction follows)
    // Make sure we're not matching part of a mixed number
    const wholeMatch = text.match(/^(\d+)/);
    if (wholeMatch) {
        // Double-check: if next character (without space) is a Unicode fraction, don't match just the whole number
        const afterNumber = text.substring(wholeMatch[0].length);
        const afterNumberTrimmed = afterNumber.trim();
        
        // Check if immediately after (no space) is a Unicode fraction
        if (afterNumber.length > 0 && !afterNumber.match(/^\s/) && /^[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/.test(afterNumber)) {
            // This is part of a mixed number, skip whole number match
            return null;
        }
        
        // Check if after trimming spaces, there's a fraction (regular or Unicode)
        if (!afterNumberTrimmed.match(/^(\d+\/\d+|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/)) {
            return {
                quantity: parseFloat(wholeMatch[1]),
                consumed: wholeMatch[0].length
            };
        }
    }
    
    return null;
}

/**
 * Parse a single quantity+unit pair
 */
function parseQuantityUnitPair(text, sortUnitsFn) {
    text = text.trim();
    if (!text) return null;
    
    // Extract quantity using improved parser
    const quantityResult = extractQuantity(text);
    if (!quantityResult) return null;
    
    const quantity = quantityResult.quantity;
    const rest = text.substring(quantityResult.consumed).trim();
    
    if (!rest) return null;
    
    // Check for volume units (longest first)
    for (const [unitName, factor] of sortUnitsFn(UNIT_CONVERSIONS.volume)) {
        const escapedUnit = unitName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match unit followed by space, comma, period (end of sentence), or end of string
        // But NOT followed by a letter (to avoid matching "c" in "corn")
        const unitRegex = new RegExp(`^${escapedUnit}(?:\\s+|,|$|\\.(?:\\s|$))`, 'i');
        const match = rest.match(unitRegex);
        if (match) {
            const matchedLength = match[0].length;
            let remaining = rest.substring(matchedLength).trim();
            // Remove leading comma, period, or punctuation
            remaining = remaining.replace(/^[,.\s]+/, '');
            
            // If remaining text starts with a number, it might be a new quantity - reject this match
            if (remaining.match(/^\d/)) {
                continue;
            }
            
            return {
                quantity: quantity,
                unit: unitName,
                unitType: 'volume',
                remaining: remaining
            };
        }
    }
    
    // Check for weight units (longest first)
    for (const [unitName, factor] of sortUnitsFn(UNIT_CONVERSIONS.weight)) {
        const escapedUnit = unitName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match unit followed by space, comma, period (end of sentence), or end of string
        // But NOT followed by a letter (to avoid matching "oz" in "ozone")
        const unitRegex = new RegExp(`^${escapedUnit}(?:\\s+|,|$|\\.(?:\\s|$))`, 'i');
        const match = rest.match(unitRegex);
        if (match) {
            const matchedLength = match[0].length;
            let remaining = rest.substring(matchedLength).trim();
            // Remove leading comma, period, or punctuation
            remaining = remaining.replace(/^[,.\s]+/, '');
            
            // If remaining text starts with a number, it might be a new quantity - reject this match
            if (remaining.match(/^\d/)) {
                continue;
            }
            
            return {
                quantity: quantity,
                unit: unitName,
                unitType: 'weight',
                remaining: remaining
            };
        }
    }
    
    return null;
}

/**
 * Extract quantity and unit from ingredient line
 */
function parseIngredientLine(line) {
    // Remove extra whitespace
    line = line.trim();
    if (!line) return null;
    
    // Skip lines that are clearly not ingredients (instructions, headers, etc.)
    if (line.toLowerCase().match(/^(preparation|instructions|directions|method|steps?|serves|yield|prep| cook)/i)) {
        return null;
    }
    
    // Sort units by length (longest first) to match "cups" before "c" or "c."
    const sortUnits = (units) => {
        return Object.entries(units).sort((a, b) => b[0].length - a[0].length);
    };
    
    // Check if line contains combined measurements with "+"
    // Examples: "2 1/4 c. + 6 tbsp. flour" or "1 c. + 2 tbsp. butter"
    if (line.includes('+')) {
        const parts = line.split('+');
        if (parts.length >= 2) {
            const firstPart = parts[0].trim();
            const restOfLine = parts.slice(1).join('+').trim();
            
            // Parse first quantity+unit pair
            const firstPair = parseQuantityUnitPair(firstPart, sortUnits);
            if (!firstPair) {
                // If first part doesn't parse, fall through to normal parsing
            } else {
                // Parse remaining parts
                const allPairs = [firstPair];
                let remainingText = restOfLine;
                
                // Try to parse additional pairs
                for (let i = 1; i < parts.length; i++) {
                    const part = parts[i].trim();
                    const pair = parseQuantityUnitPair(part, sortUnits);
                    if (pair) {
                        allPairs.push(pair);
                        // Update remaining text (ingredient name should be after the last unit)
                        remainingText = pair.remaining || '';
                    } else {
                        // If we can't parse a part, assume it's the ingredient name
                        remainingText = part;
                        break;
                    }
                }
                
                // Check if all pairs are the same unit type (volume or weight)
                const unitTypes = allPairs.map(p => p.unitType);
                const allSameType = unitTypes.every(t => t === unitTypes[0]) && unitTypes[0] !== 'count';
                
                if (allSameType && allPairs.length > 1) {
                    // Convert all to base units and sum
                    let totalBaseValue = 0;
                    for (const pair of allPairs) {
                        const base = convertToBaseUnit(pair.quantity, pair.unit, pair.unitType);
                        totalBaseValue += base.value;
                    }
                    
                    // Find the ingredient name (should be in the last remaining text)
                    let ingredientName = remainingText || allPairs[allPairs.length - 1].remaining || '';
                    ingredientName = ingredientName.trim();

                    // Extract notes from ingredientName if possible
                    let notes = '';
                    const dashIndex = ingredientName.indexOf('—');
                    if (dashIndex !== -1) {
                        notes = ingredientName.slice(dashIndex + 1).trim();
                        ingredientName = ingredientName.slice(0, dashIndex).trim();
                    }
                    if (!notes) {
                        notes = inferIngredientNotes(ingredientName);
                    }
                    
                    return {
                        quantity: totalBaseValue,
                        unit: unitTypes[0] === 'volume' ? 'ml' : 'g',
                        unitType: unitTypes[0],
                        ingredient: ingredientName,
                        notes: notes || undefined,
                        originalLine: line,
                        isCombined: true,
                        originalPairs: allPairs.map(p => ({
                            quantity: p.quantity,
                            unit: p.unit
                        }))
                    };
                }
            }
        }
    }
    
    // Standard parsing for single measurements
    // Pattern to match: quantity (optional) unit (optional) ingredient name
    // Examples: "2 cups flour", "1/2 tsp salt", "3 eggs", "1 lb chicken"
    
    // Extract quantity using improved parser
    const quantityResult = extractQuantity(line);
    if (!quantityResult) {
        // No quantity found, might be just an ingredient name
        let ingredientName = line.trim();
        let notes = '';
        const dashIndex = ingredientName.indexOf('—');
        if (dashIndex !== -1) {
            notes = ingredientName.slice(dashIndex + 1).trim();
            ingredientName = ingredientName.slice(0, dashIndex).trim();
        }
        if (!notes) {
            notes = inferIngredientNotes(ingredientName);
        }
        const split = splitPrepWordsFromName(ingredientName, notes);
        return {
            quantity: 1,
            unit: null,
            unitType: 'count',
            ingredient: split.ingredientName,
            notes: split.notes || undefined,
            originalLine: line
        };
    }
    
    const quantity = quantityResult.quantity;
    const rest = line.substring(quantityResult.consumed).trim();
    
    if (!rest) return null;
    
    // Try to match unit
    let unit = null;
    let ingredient = rest;
    
    // Check for volume units (longest first to avoid partial matches)
    for (const [unitName, factor] of sortUnits(UNIT_CONVERSIONS.volume)) {
        // Escape special regex characters in unit name
        const escapedUnit = unitName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match unit followed by space, comma, period (end of sentence), or end of string
        const unitRegex = new RegExp(`^${escapedUnit}(?:\\s+|,|$|\\.(?:\\s|$))`, 'i');
        const match = rest.match(unitRegex);
        if (match) {
            unit = unitName;
            // Extract the matched part to get correct length
            const matchedLength = match[0].length;
            ingredient = rest.substring(matchedLength).trim();
            // Remove leading comma, period, or punctuation
            ingredient = ingredient.replace(/^[,.\s]+/, '');
            
            // If ingredient starts with a number, it might be a misparse - skip this unit
            if (ingredient.match(/^\d/)) {
                continue;
            }
            
            // Extract notes from ingredient if possible
            let ingredientName = ingredient.trim();
            let notes = '';
            const dashIndex = ingredientName.indexOf('—');
            if (dashIndex !== -1) {
                notes = ingredientName.slice(dashIndex + 1).trim();
                ingredientName = ingredientName.slice(0, dashIndex).trim();
            }
            if (!notes) {
                notes = inferIngredientNotes(ingredientName);
            }
            
            const split = splitPrepWordsFromName(ingredientName, notes);
            return {
                quantity: quantity,
                unit: unit,
                unitType: 'volume',
                ingredient: split.ingredientName,
                notes: split.notes || undefined,
                originalLine: line
            };
        }
    }
    
    // Check for weight units (longest first to avoid partial matches)
    for (const [unitName, factor] of sortUnits(UNIT_CONVERSIONS.weight)) {
        // Escape special regex characters in unit name
        const escapedUnit = unitName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match unit followed by space, comma, period (end of sentence), or end of string
        const unitRegex = new RegExp(`^${escapedUnit}(?:\\s+|,|$|\\.(?:\\s|$))`, 'i');
        const match = rest.match(unitRegex);
        if (match) {
            unit = unitName;
            // Extract the matched part to get correct length
            const matchedLength = match[0].length;
            ingredient = rest.substring(matchedLength).trim();
            // Remove leading comma, period, or punctuation
            ingredient = ingredient.replace(/^[,.\s]+/, '');
            
            // If ingredient starts with a number, it might be a misparse - skip this unit
            if (ingredient.match(/^\d/)) {
                continue;
            }
            
            // Extract notes from ingredient if possible
            let ingredientName = ingredient.trim();
            let notes = '';
            const dashIndex = ingredientName.indexOf('—');
            if (dashIndex !== -1) {
                notes = ingredientName.slice(dashIndex + 1).trim();
                ingredientName = ingredientName.slice(0, dashIndex).trim();
            }
            if (!notes) {
                notes = inferIngredientNotes(ingredientName);
            }
            
            const split = splitPrepWordsFromName(ingredientName, notes);
            return {
                quantity: quantity,
                unit: unit,
                unitType: 'weight',
                ingredient: split.ingredientName,
                notes: split.notes || undefined,
                originalLine: line
            };
        }
    }
    
    // No unit found, assume count/whole item
    let ingredientName = rest.trim();
    let notes = '';
    const dashIndex = ingredientName.indexOf('—');
    if (dashIndex !== -1) {
        notes = ingredientName.slice(dashIndex + 1).trim();
        ingredientName = ingredientName.slice(0, dashIndex).trim();
    }
    if (!notes) {
        notes = inferIngredientNotes(ingredientName);
    }
    const split = splitPrepWordsFromName(ingredientName, notes);
    return {
        quantity: quantity,
        unit: null,
        unitType: 'count',
        ingredient: split.ingredientName,
        notes: split.notes || undefined,
        originalLine: line
    };
}

/**
 * Convert quantity to base unit (ml for volume, g for weight)
 */
function convertToBaseUnit(quantity, unit, unitType) {
    if (!unit || unitType === 'count') {
        return { value: quantity, unit: unit || 'count', unitType: unitType };
    }
    
    const conversions = UNIT_CONVERSIONS[unitType];
    if (!conversions || !conversions[unit.toLowerCase()]) {
        return { value: quantity, unit: unit, unitType: unitType };
    }
    
    const factor = conversions[unit.toLowerCase()];
    return {
        value: quantity * factor,
        unit: unitType === 'volume' ? 'ml' : 'g',
        unitType: unitType
    };
}

/**
 * Convert from base unit to preferred unit system
 */
function convertToPreferredUnitSystem(baseValue, unitType) {
    if (unitType === 'count') {
        return { value: baseValue, unit: 'count', displayQuantity: baseValue, displayUnit: '', flOz: null };
    }
    
    const conversions = unitType === 'volume' ? UNIT_CONVERSIONS.volume : UNIT_CONVERSIONS.weight;
    
    if (unitSystem === 'metric') {
        // Metric: use ml or g
        if (unitType === 'volume') {
            const displayQty = formatQuantity(baseValue);
            return {
                value: baseValue,
                unit: 'ml',
                displayQuantity: displayQty,
                displayUnit: 'ml',
                flOz: null
            };
        } else {
            const displayQty = formatQuantity(baseValue);
            return {
                value: baseValue,
                unit: 'g',
                displayQuantity: displayQty,
                displayUnit: 'g',
                flOz: null
            };
        }
    } else {
        // Imperial: use cups, tablespoons, teaspoons for volume; oz/lbs for weight
        // For volume, also calculate fl oz for display in parentheses
        if (unitType === 'volume') {
            // Calculate fl oz first (for display in parentheses)
            const flOz = baseValue / conversions['fluid ounce'];
            const roundedFlOz = Math.round(flOz * 100) / 100;
            
            // Find the best unit (cup > tablespoon > teaspoon)
            const cup = baseValue / conversions['cup'];
            if (cup >= 0.125) { // >= 1/8 cup
                const displayQty = formatQuantity(cup);
                return {
                    value: cup,
                    unit: 'cup',
                    displayQuantity: displayQty,
                    displayUnit: cup === 1 ? 'cup' : 'cups',
                    flOz: roundedFlOz
                };
            }
            
            const tbsp = baseValue / conversions['tablespoon'];
            if (tbsp >= 0.5) {
                const displayQty = formatQuantity(tbsp);
                return {
                    value: tbsp,
                    unit: 'tablespoon',
                    displayQuantity: displayQty,
                    displayUnit: tbsp === 1 ? 'tablespoon' : 'tablespoons',
                    flOz: roundedFlOz
                };
            }
            
            // Use teaspoons
            const tsp = baseValue / conversions['teaspoon'];
            const displayQty = formatQuantity(tsp);
            return {
                value: tsp,
                unit: 'teaspoon',
                displayQuantity: displayQty,
                displayUnit: tsp === 1 ? 'teaspoon' : 'teaspoons',
                flOz: roundedFlOz
            };
        } else {
            // Weight: use oz or lbs (no fl oz for weight)
            const oz = baseValue / conversions['ounce'];
            if (oz >= 16) {
                const lbs = oz / 16;
                const displayQty = formatQuantity(lbs);
                return {
                    value: lbs,
                    unit: 'pound',
                    displayQuantity: displayQty,
                    displayUnit: lbs === 1 ? 'pound' : 'pounds',
                    flOz: null
                };
            } else {
                const displayQty = formatQuantity(oz);
                return {
                    value: oz,
                    unit: 'ounce',
                    displayQuantity: displayQty,
                    displayUnit: oz === 1 ? 'ounce' : 'ounces',
                    flOz: null
                };
            }
        }
    }
}

/**
 * Convert unit abbreviation to full spelling
 */
function spellOutUnit(unit) {
    if (!unit) return '';
    
    const unitLower = unit.toLowerCase().replace(/\.$/, ''); // Remove trailing period
    
    const unitMap = {
        // Volume
        'tsp': 'teaspoon',
        'teaspoon': 'teaspoon',
        'teaspoons': 'teaspoon',
        'tbsp': 'tablespoon',
        'tbs': 'tablespoon',
        't': 'teaspoon',
        'T': 'tablespoon',
        'TB': 'tablespoon',
        'TBSP': 'tablespoon',
        'TSP': 'teaspoon',
        'tablespoon': 'tablespoon',
        'tablespoons': 'tablespoon',
        'cup': 'cup',
        'cups': 'cup',
        'c': 'cup',
        'fl oz': 'fluid ounce',
        'fl. oz.': 'fluid ounce',
        'fl oz.': 'fluid ounce',
        'fl': 'fluid ounce',
        'fluid ounce': 'fluid ounce',
        'fluid ounces': 'fluid ounce',
        'pint': 'pint',
        'pints': 'pint',
        'pt': 'pint',
        'quart': 'quart',
        'quarts': 'quart',
        'qt': 'quart',
        'gallon': 'gallon',
        'gallons': 'gallon',
        'gal': 'gallon',
        'ml': 'milliliter',
        'milliliter': 'milliliter',
        'milliliters': 'milliliter',
        'l': 'liter',
        'L': 'liter',
        'liter': 'liter',
        'liters': 'liter',
        // Weight
        'oz': 'ounce',
        'ounce': 'ounce',
        'ounces': 'ounce',
        'lb': 'pound',
        'lbs': 'pound',
        'pound': 'pound',
        'pounds': 'pound',
        'g': 'gram',
        'gram': 'gram',
        'grams': 'gram',
        'kg': 'kilogram',
        'kilogram': 'kilogram',
        'kilograms': 'kilogram'
    };
    
    const fullName = unitMap[unitLower];
    if (fullName) {
        // Return plural form if the original was plural or if quantity > 1
        // We'll handle pluralization at display time based on quantity
        return fullName;
    }
    
    // If not found, return original
    return unit;
}

/**
 * Pluralize unit name if needed
 */
function pluralizeUnit(unit, quantity) {
    if (!unit || quantity === 1) return unit;
    
    // Units that don't pluralize
    const noPlural = ['ml', 'milliliter', 'milliliters', 'l', 'liter', 'liters', 'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms'];
    if (noPlural.includes(unit.toLowerCase())) {
        return unit;
    }
    
    // Add 's' for most units
    if (unit.endsWith('s')) {
        return unit; // Already plural
    }
    
    return unit + 's';
}

/**
 * Convert decimal to fraction string
 * Checks for common fractions and converts decimals close to them
 */
function toFraction(decimal) {
    if (decimal === null || decimal === undefined || isNaN(decimal)) return decimal;
    
    // Tolerance for matching fractions
    const tolerance = 0.015;
    
    // Common fractions to check
    const fractions = [
        { val: 0.125, str: '1/8' },
        { val: 0.167, str: '1/6' },
        { val: 0.2, str: '1/5' },
        { val: 0.25, str: '1/4' },
        { val: 0.333, str: '1/3' },
        { val: 0.375, str: '3/8' },
        { val: 0.4, str: '2/5' },
        { val: 0.5, str: '1/2' },
        { val: 0.6, str: '3/5' },
        { val: 0.625, str: '5/8' },
        { val: 0.667, str: '2/3' },
        { val: 0.75, str: '3/4' },
        { val: 0.8, str: '4/5' },
        { val: 0.833, str: '5/6' },
        { val: 0.875, str: '7/8' }
    ];
    
    // Check if decimal matches any fraction
    for (const frac of fractions) {
        if (Math.abs(decimal - frac.val) < tolerance) {
            return frac.str;
        }
    }
    
    // If no match, return rounded decimal
    return Math.round(decimal * 100) / 100;
}

/**
 * Format a quantity value, converting decimals close to fractions
 * Handles both pure decimals and mixed numbers (whole + fraction)
 */
function formatQuantity(qty) {
    if (qty === null || qty === undefined || isNaN(qty)) return qty;
    
    const wholePart = Math.floor(qty);
    const decimalPart = qty - wholePart;
    
    // If there's a meaningful decimal part, try to convert it to a fraction
    if (decimalPart > 0.01) {
        const frac = toFraction(decimalPart);
        // If toFraction returned a fraction string (contains '/'), use it
        if (typeof frac === 'string' && frac.includes('/')) {
            if (wholePart > 0) {
                return `${wholePart} ${frac}`;
            } else {
                return frac;
            }
        } else {
            // Didn't match a nice fraction, return the rounded decimal
            // Round to 2 decimal places for display
            const rounded = Math.round(qty * 100) / 100;
            // Remove unnecessary trailing zeros
            return rounded === Math.floor(rounded) ? Math.floor(rounded) : rounded;
        }
    } else {
        // Whole number or very small decimal (round to nearest whole)
        return wholePart || Math.round(qty);
    }
}

/**
 * Parse recipe text and extract ingredients
 */
function parseRecipe(recipeText) {
    if (!recipeText || !recipeText.trim()) {
        return [];
    }
    
    const lines = recipeText.split('\n');
    const ingredients = [];
    
    for (const line of lines) {
        const parsed = parseIngredientLine(line);
        if (parsed && parsed.ingredient) {
            ingredients.push(parsed);
        }
    }
    
    return ingredients;
}

/**
 * Build a normalized, human-readable text block from a recipe's parsed ingredients.
 * Used when editing so the user adjusts the cleaned-up version rather than the raw paste.
 */
function getEditableRecipeText(recipe) {
    if (!recipe) return '';
    
    const ingList = recipe.ingredients;
    if (!Array.isArray(ingList) || ingList.length === 0) {
        return recipe.originalText || '';
    }
    
    return ingList.map(ing => {
        const qty = ing.quantity != null ? formatQuantity(ing.quantity) : '';
        const unit = ing.unit ? spellOutUnit(ing.unit) : '';
        const qtyUnit = [qty, unit].filter(Boolean).join(' ');
        const name = ing.ingredient || '';
        const notes = ing.notes || ing.preparation || '';
        
        let line = [qtyUnit, name].filter(Boolean).join(' ');
        if (notes) {
            line = line ? `${line} — ${notes}` : notes;
        }
        
        return line.trim();
    }).join('\n');
}

/**
 * Edit an existing recipe
 */
function editRecipe(recipeId) {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) {
        showMessage('Recipe not found', 'error');
        return;
    }
    
    // Populate the form with recipe data
    const nameInput = document.getElementById('recipeName');
    const textInput = document.getElementById('recipeInput');
    const editingIdInput = document.getElementById('editingRecipeId');
    const aboutInput = document.getElementById('recipeAbout');
    const instructionsInput = document.getElementById('recipeInstructions');
    
    // Keep form fields in sync (for about/instructions/source) but do not rely
    // on re-parsing this textarea for edits; use the review modal instead.
    nameInput.value = recipe.name;
    textInput.value = getEditableRecipeText(recipe);
    editingIdInput.value = recipeId;
    if (aboutInput) aboutInput.value = recipe.about || '';
    if (instructionsInput) instructionsInput.value = recipe.instructions || '';
    
    // Load recipe tags into form
    selectedTagsForForm.clear();
    if (recipe.tags && Array.isArray(recipe.tags)) {
        recipe.tags.forEach(tag => selectedTagsForForm.add(tag));
    }
    updateSelectedTagsDisplay();
    
    // Seed the review modal with the current recipe data
    pendingRecipeForReview = {
        id: recipe.id,
        name: recipe.name,
        originalText: recipe.originalText || '',
        tags: recipe.tags || [],
        about: recipe.about || '',
        instructions: recipe.instructions || '',
        sourceType: recipe.sourceType || '',
        sourceTitle: recipe.sourceTitle || '',
        sourcePages: recipe.sourcePages || '',
        sourceUrl: recipe.sourceUrl || '',
        affiliateUrl: recipe.affiliateUrl || ''
    };
    pendingIngredientsForReview = (recipe.ingredients || []).map(ing => ({ ...ing }));
    
    openIngredientReviewModal();
}

/**
 * Save recipe edits
 */
function saveRecipeEdit() {
    const editingIdInput = document.getElementById('editingRecipeId');
    const recipeId = parseFloat(editingIdInput.value);
    
    if (!recipeId || isNaN(recipeId)) {
        showMessage('No recipe being edited', 'error');
        return;
    }
    
    const input = document.getElementById('recipeInput');
    const recipeText = input.value.trim();
    
    if (!recipeText) {
        showMessage('Please enter recipe text', 'error');
        return;
    }
    
    const ingredients = parseRecipe(recipeText);
    
    if (ingredients.length === 0) {
        showMessage('No ingredients found in the recipe. Please check the format.', 'error');
        return;
    }
    
    // Get recipe name
    const nameInput = document.getElementById('recipeName');
    const recipeName = nameInput.value.trim() || `Recipe ${recipes.length + 1}`;
    
    // Get selected tags from form
    const tags = Array.from(selectedTagsForForm);
    
    // Get about and instructions
    const aboutInput = document.getElementById('recipeAbout');
    const instructionsInput = document.getElementById('recipeInstructions');
    const sourceTypeInput = document.getElementById('recipeSourceType');
    const sourceTitleInput = document.getElementById('recipeSourceTitle');
    const sourcePagesInput = document.getElementById('recipeSourcePages');
    const sourceUrlInput = document.getElementById('recipeSourceUrl');
    const affiliateUrlInput = document.getElementById('recipeAffiliateUrl');
    const about = aboutInput ? aboutInput.value.trim() : '';
    const instructions = instructionsInput ? instructionsInput.value.trim() : '';
    const sourceType = sourceTypeInput ? sourceTypeInput.value.trim() : '';
    const sourceTitle = sourceTitleInput ? sourceTitleInput.value.trim() : '';
    const sourcePages = sourcePagesInput ? sourcePagesInput.value.trim() : '';
    const sourceUrl = sourceUrlInput ? sourceUrlInput.value.trim() : '';
    const affiliateUrl = affiliateUrlInput ? affiliateUrlInput.value.trim() : '';
    
    // Store data for review before final save, including the ID so we know it's an edit
    pendingRecipeForReview = {
        id: recipeId,
        name: recipeName,
        originalText: recipeText,
        tags,
        about,
        instructions,
        sourceType,
        sourceTitle,
        sourcePages,
        sourceUrl,
        affiliateUrl
    };
    pendingIngredientsForReview = ingredients;
    
    openIngredientReviewModal();
}

/**
 * Cancel recipe edit
 */
function cancelRecipeEdit() {
    const nameInput = document.getElementById('recipeName');
    const textInput = document.getElementById('recipeInput');
    const editingIdInput = document.getElementById('editingRecipeId');
    const editActions = document.getElementById('editRecipeActions');
    const addRecipeTitle = document.getElementById('addRecipeTitle');
    const addRecipeDescription = document.getElementById('addRecipeDescription');
    const aboutInput = document.getElementById('recipeAbout');
    const instructionsInput = document.getElementById('recipeInstructions');
    const sourceTypeInput = document.getElementById('recipeSourceType');
    const sourceTitleInput = document.getElementById('recipeSourceTitle');
    const sourcePagesInput = document.getElementById('recipeSourcePages');
    const sourceUrlInput = document.getElementById('recipeSourceUrl');
    const affiliateUrlInput = document.getElementById('recipeAffiliateUrl');
    const addRecipeButton = document.getElementById('addRecipeButton');
    
    // Clear form
    nameInput.value = '';
    textInput.value = '';
    editingIdInput.value = '';
    if (aboutInput) aboutInput.value = '';
    if (instructionsInput) instructionsInput.value = '';
    if (sourceTypeInput) sourceTypeInput.value = '';
    if (sourceTitleInput) sourceTitleInput.value = '';
    if (sourcePagesInput) sourcePagesInput.value = '';
    if (sourceUrlInput) sourceUrlInput.value = '';
    if (affiliateUrlInput) affiliateUrlInput.value = '';
    clearTagSelectionForm();
    
    // Hide edit mode
    editActions.style.display = 'none';
    addRecipeTitle.textContent = 'Add Recipe';
    addRecipeDescription.textContent = 'Add recipes by pasting text. The tool will automatically extract ingredients with quantities and units.';
    if (addRecipeButton) {
        addRecipeButton.style.display = 'inline-block';
    }
}

/**
 * Generate automatic tags based on recipe name and ingredients
 * Currently disabled - recipes start with no tags
 */
function generateAutoTags(recipeName, ingredients) {
    // Auto-tagging disabled - return empty array
    return [];
}

/**
 * Add a recipe to the collection
 */
function addRecipe() {
    const input = document.getElementById('recipeInput');
    const recipeText = input.value.trim();
    
    if (!recipeText) {
        showMessage('Please enter a recipe', 'error');
        return;
    }
    
    const ingredients = parseRecipe(recipeText);
    
    if (ingredients.length === 0) {
        showMessage('No ingredients found in the recipe. Please check the format.', 'error');
        return;
    }
    
    // Get recipe name
    const nameInput = document.getElementById('recipeName');
    const recipeName = nameInput.value.trim() || `Recipe ${recipes.length + 1}`;
    
    // Get selected tags
    const tags = Array.from(selectedTagsForForm);
    
    // Get about and instructions
    const aboutInput = document.getElementById('recipeAbout');
    const instructionsInput = document.getElementById('recipeInstructions');
    const sourceTypeInput = document.getElementById('recipeSourceType');
    const sourceTitleInput = document.getElementById('recipeSourceTitle');
    const sourcePagesInput = document.getElementById('recipeSourcePages');
    const sourceUrlInput = document.getElementById('recipeSourceUrl');
    const affiliateUrlInput = document.getElementById('recipeAffiliateUrl');
    const about = aboutInput ? aboutInput.value.trim() : '';
    const instructions = instructionsInput ? instructionsInput.value.trim() : '';
    const sourceType = sourceTypeInput ? sourceTypeInput.value.trim() : '';
    const sourceTitle = sourceTitleInput ? sourceTitleInput.value.trim() : '';
    const sourcePages = sourcePagesInput ? sourcePagesInput.value.trim() : '';
    const sourceUrl = sourceUrlInput ? sourceUrlInput.value.trim() : '';
    const affiliateUrl = affiliateUrlInput ? affiliateUrlInput.value.trim() : '';
    
    // Store data for review before final save
    pendingRecipeForReview = {
        name: recipeName,
        originalText: recipeText,
        tags,
        about,
        instructions,
        sourceType,
        sourceTitle,
        sourcePages,
        sourceUrl,
        affiliateUrl
    };
    pendingIngredientsForReview = ingredients;
    
    openIngredientReviewModal();
}

/**
 * Open ingredient review modal showing how lines were parsed/normalized
 */
function openIngredientReviewModal() {
    if (!pendingIngredientsForReview || !pendingRecipeForReview) {
        showMessage('Nothing to review', 'error');
        return;
    }
    
    const modal = document.getElementById('ingredientReviewModal');
    const body = document.getElementById('ingredientReviewModalBody');
    if (!modal || !body) return;
    
    const rows = pendingIngredientsForReview.map((ing, index) => {
        const qty = ing.quantity != null ? formatQuantity(ing.quantity) : '';
        const unit = ing.unit ? spellOutUnit(ing.unit) : '';
        const qtyUnit = [qty, unit].filter(Boolean).join(' ');

        const rawName = (ing.ingredient || '').trim();
        const displayIngredient = rawName;
        const prepDisplay = (ing.notes || ing.preparation || inferIngredientNotes(rawName)) || '';
        
        const qtyDisplay = qtyUnit || '';
        const ingredientDisplay = displayIngredient || '';
        
        return `
            <tr>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; font-family: monospace; font-size: 12px; white-space: normal; word-break: break-word;">
                    ${escapeHtml(ing.originalLine || `${qtyUnit} ${rawName}`.trim())}
                </td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; white-space: nowrap; vertical-align: top;">
                    <span 
                        id="ir-qty-display-${index}" 
                        style="cursor: pointer; display: inline-block;"
                        onclick="startIngredientInlineEdit(${index}, 'quantity')"
                        title="Click to edit quantity">
                        ${qtyDisplay ? escapeHtml(qtyDisplay) : '<span style="color:#bbb;">Click to set</span>'}
                    </span>
                    <input 
                        id="ir-qty-input-${index}"
                        type="text"
                        value="${escapeHtml(qtyDisplay)}"
                        style="display: none; width: 120px; padding: 3px 5px; margin-top: 2px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px; box-sizing: border-box;"
                        onblur="finishIngredientInlineEdit(${index}, 'quantity')"
                        onkeydown="handleIngredientInlineKey(event, ${index}, 'quantity')"
                    >
                </td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; white-space: normal; word-break: break-word; vertical-align: top;">
                    <span 
                        id="ir-ingredient-display-${index}" 
                        style="cursor: pointer; display: inline-block;"
                        onclick="startIngredientInlineEdit(${index}, 'ingredient')"
                        title="Click to edit ingredient name">
                        ${ingredientDisplay ? escapeHtml(ingredientDisplay) : '<span style="color:#bbb;">Click to set</span>'}
                    </span>
                    <input 
                        id="ir-ingredient-input-${index}"
                        type="text"
                        value="${escapeHtml(ingredientDisplay)}"
                        style="display: none; width: 100%; padding: 3px 5px; margin-top: 2px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px; box-sizing: border-box;"
                        onblur="finishIngredientInlineEdit(${index}, 'ingredient')"
                        onkeydown="handleIngredientInlineKey(event, ${index}, 'ingredient')"
                    >
                </td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; font-style: italic; white-space: normal; word-break: break-word; vertical-align: top;">
                    <span 
                        id="ir-prep-display-${index}" 
                        style="cursor: pointer; display: inline-block;"
                        onclick="startIngredientInlineEdit(${index}, 'preparation')"
                        title="Click to edit preparation notes">
                        ${prepDisplay ? escapeHtml(prepDisplay) : '<span style="color:#bbb;">Click to add</span>'}
                    </span>
                    <input 
                        id="ir-prep-input-${index}"
                        type="text"
                        value="${escapeHtml(prepDisplay)}"
                        placeholder="e.g., finely chopped"
                        style="display: none; width: 100%; padding: 3px 5px; margin-top: 2px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px; font-style: italic; box-sizing: border-box;"
                        onblur="finishIngredientInlineEdit(${index}, 'preparation')"
                        onkeydown="handleIngredientInlineKey(event, ${index}, 'preparation')"
                    >
                </td>
            </tr>
        `;
    }).join('');
    
    body.innerHTML = `
        <p style="margin-bottom: 10px;">
            Double-check that the ingredients below look right before adding 
            <strong>${escapeHtml(pendingRecipeForReview.name)}</strong> to your collection.
        </p>
        <div style="max-height: 320px; overflow-y: auto; border: 1px solid #eee; border-radius: 4px; background: #fff;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f8f6f2;">
                        <th style="text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd;">Original line</th>
                        <th style="text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd;">Quantity</th>
                        <th style="text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd;">Ingredient</th>
                        <th style="text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd;">Notes</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
        <p style="margin-top: 10px; font-size: 12px; color: #777;">
            Click any quantity, ingredient name, or preparation note to quickly adjust it. 
            If something bigger looks off, close this window and edit the recipe text before trying again.
        </p>
        <div style="margin-top: 15px; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
            <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 13px; background: #f0f0f0; color: #555;" onclick="addEmptyIngredientRow()">
                + Add ingredient
            </button>
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-secondary" style="padding: 8px 16px; font-size: 14px;" onclick="closeIngredientReviewModal()">Cancel</button>
                <button class="btn" style="padding: 8px 16px; font-size: 14px;" onclick="confirmIngredientReview()">Looks Good, Save Recipe</button>
            </div>
        </div>
    `;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

/**
 * Close ingredient review modal
 */
function closeIngredientReviewModal(event) {
    if (event && event.target && event.target.id === 'ingredientReviewModal') {
        // Clicked on overlay
    }
    const modal = document.getElementById('ingredientReviewModal');
    if (modal) {
        modal.classList.remove('active');
    }
    document.body.style.overflow = '';
}

/**
 * Begin inline edit for a field in the review table
 */
function startIngredientInlineEdit(index, field) {
    if (!pendingIngredientsForReview || !pendingIngredientsForReview[index]) return;
    
    const prefix = field === 'quantity' ? 'qty' : (field === 'preparation' ? 'prep' : 'ingredient');
    const displayEl = document.getElementById(`ir-${prefix}-display-${index}`);
    const inputEl = document.getElementById(`ir-${prefix}-input-${index}`);
    if (!displayEl || !inputEl) return;
    
    displayEl.style.display = 'none';
    inputEl.style.display = 'inline-block';
    inputEl.focus();
    inputEl.select();
}

/**
 * Finish inline edit (on blur or Enter)
 */
function finishIngredientInlineEdit(index, field) {
    if (!pendingIngredientsForReview || !pendingIngredientsForReview[index]) return;
    
    const ing = pendingIngredientsForReview[index];
    const prefix = field === 'quantity' ? 'qty' : (field === 'preparation' ? 'prep' : 'ingredient');
    const displayEl = document.getElementById(`ir-${prefix}-display-${index}`);
    const inputEl = document.getElementById(`ir-${prefix}-input-${index}`);
    if (!displayEl || !inputEl) return;
    
    const value = inputEl.value.trim();
    
    if (field === 'quantity') {
        if (value) {
            // Split on first space: first token is quantity, rest is unit
            const parts = value.split(/\s+/);
            const qtyStr = parts.shift();
            const unitStr = parts.join(' ').trim();
            const parsedQty = parseFraction(qtyStr);
            if (!isNaN(parsedQty) && isFinite(parsedQty) && parsedQty > 0) {
                ing.quantity = parsedQty;
                ing.unit = unitStr || null;
            }
        }
        const qty = ing.quantity != null ? formatQuantity(ing.quantity) : '';
        const unit = ing.unit ? spellOutUnit(ing.unit) : '';
        const qtyUnit = [qty, unit].filter(Boolean).join(' ');
        displayEl.innerHTML = qtyUnit ? escapeHtml(qtyUnit) : '<span style="color:#bbb;">Click to set</span>';
    } else if (field === 'ingredient') {
        if (value) {
            ing.ingredient = value;
        }
        // For display, show exactly what the user entered (word-wrapped).
        // We'll still normalize internally later when grouping ingredients.
        const displayIngredient = ing.ingredient || '';
        displayEl.innerHTML = displayIngredient 
            ? escapeHtml(displayIngredient) 
            : '<span style="color:#bbb;">Click to set</span>';
    } else if (field === 'preparation') {
        if (value) {
            ing.notes = value;
        } else {
            ing.notes = undefined;
        }
        displayEl.innerHTML = ing.notes 
            ? escapeHtml(ing.notes) 
            : '<span style="color:#bbb;">Click to add</span>';
    }
    
    inputEl.style.display = 'none';
    displayEl.style.display = 'inline-block';
}

/**
 * Handle Enter/Escape keys in inline editor
 */
function handleIngredientInlineKey(event, index, field) {
    if (event.key === 'Enter') {
        event.preventDefault();
        finishIngredientInlineEdit(index, field);
    } else if (event.key === 'Escape') {
        event.preventDefault();
        // Cancel edit: just hide input and show display without saving
        const prefix = field === 'quantity' ? 'qty' : (field === 'preparation' ? 'prep' : 'ingredient');
        const displayEl = document.getElementById(`ir-${prefix}-display-${index}`);
        const inputEl = document.getElementById(`ir-${prefix}-input-${index}`);
        if (displayEl && inputEl) {
            inputEl.style.display = 'none';
            displayEl.style.display = 'inline-block';
        }
    }
}

/**
 * Add a new blank ingredient row in the review modal so users can manually
 * introduce additional ingredients when editing or adding.
 */
function addEmptyIngredientRow() {
    if (!pendingIngredientsForReview) {
        pendingIngredientsForReview = [];
    }
    
    pendingIngredientsForReview.push({
        quantity: null,
        unit: null,
        unitType: 'count',
        ingredient: '',
        notes: '',
        originalLine: '(added manually)'
    });
    
    openIngredientReviewModal();
}

/**
 * Confirm ingredient review and actually create/save the recipe
 */
function confirmIngredientReview() {
    if (!pendingIngredientsForReview || !pendingRecipeForReview) {
        closeIngredientReviewModal();
        return;
    }
    
    const {
        id,
        name,
        originalText,
        tags,
        about,
        instructions,
        sourceType,
        sourceTitle,
        sourcePages,
        sourceUrl,
        affiliateUrl
    } = pendingRecipeForReview;

    let isEdit = !!id;
    let recipe;

    if (isEdit) {
        // Update existing recipe
        recipe = recipes.find(r => r.id === id);
        if (!recipe) {
            // If something went wrong and we can't find it, fall back to creating new
            isEdit = false;
        }
    }

    if (isEdit && recipe) {
        recipe.name = name;
        recipe.ingredients = pendingIngredientsForReview;
        recipe.originalText = originalText;
        recipe.tags = tags;
        recipe.about = about || undefined;
        recipe.instructions = instructions || undefined;
        recipe.sourceType = sourceType || undefined;
        recipe.sourceTitle = sourceTitle || undefined;
        recipe.sourcePages = sourcePages || undefined;
        recipe.sourceUrl = sourceUrl || undefined;
        recipe.affiliateUrl = affiliateUrl || undefined;
    } else {
        // Create a brand-new recipe
        recipe = {
            id: Date.now(),
            name,
            ingredients: pendingIngredientsForReview,
            originalText,
            tags,
            about: about || undefined,
            instructions: instructions || undefined,
            sourceType: sourceType || undefined,
            sourceTitle: sourceTitle || undefined,
            sourcePages: sourcePages || undefined,
            sourceUrl: sourceUrl || undefined,
            affiliateUrl: affiliateUrl || undefined,
            instructionsVisibility: 'hidden'
        };
        
        recipes.push(recipe);
        
        // Automatically activate new recipes with multiplier 1
        activeRecipeIds.add(recipe.id);
        recipeMultipliers[recipe.id] = 1;
    }
    
    // Save to localStorage
    // Ensure notes field is present where applicable before saving/exporting
    saveRecipes();
    saveActiveRecipes();
    saveRecipeMultipliers();
    
    // Consolidate ingredients and update UI
    consolidateIngredients();
    updateRecipeList();
    updateShoppingList();
    updateDayPlanner();
    updateTagFilters();
    
    // Clear form after successful save or edit
    const nameInput = document.getElementById('recipeName');
    const input = document.getElementById('recipeInput');
    const aboutInput = document.getElementById('recipeAbout');
    const instructionsInput = document.getElementById('recipeInstructions');
    const sourceTypeInput = document.getElementById('recipeSourceType');
    const sourceTitleInput = document.getElementById('recipeSourceTitle');
    const sourcePagesInput = document.getElementById('recipeSourcePages');
    const sourceUrlInput = document.getElementById('recipeSourceUrl');
    const affiliateUrlInput = document.getElementById('recipeAffiliateUrl');
    const editingIdInput = document.getElementById('editingRecipeId');
    const editActions = document.getElementById('editRecipeActions');
    const addRecipeTitle = document.getElementById('addRecipeTitle');
    const addRecipeDescription = document.getElementById('addRecipeDescription');
    
    if (nameInput) nameInput.value = '';
    if (input) input.value = '';
    if (aboutInput) aboutInput.value = '';
    if (instructionsInput) instructionsInput.value = '';
    if (sourceTypeInput) sourceTypeInput.value = '';
    if (sourceTitleInput) sourceTitleInput.value = '';
    if (sourcePagesInput) sourcePagesInput.value = '';
    if (sourceUrlInput) sourceUrlInput.value = '';
    if (affiliateUrlInput) affiliateUrlInput.value = '';
    if (editingIdInput) editingIdInput.value = '';
    if (editActions) editActions.style.display = 'none';
    if (addRecipeTitle) addRecipeTitle.textContent = 'Add Recipe';
    if (addRecipeDescription) {
        addRecipeDescription.textContent = 'Add recipes by pasting text. The tool will automatically extract ingredients with quantities and units.';
    }
    clearTagSelectionForm();
    
    // Reset pending state and close modal
    pendingRecipeForReview = null;
    pendingIngredientsForReview = null;
    closeIngredientReviewModal();
    
    showMessage(
        isEdit ? `Recipe updated with ${recipe.ingredients.length} ingredients` 
               : `Added recipe with ${recipe.ingredients.length} ingredients`,
        'success'
    );
}

/**
 * Consolidate all ingredients from all recipes
 */
function consolidateIngredients() {
    consolidatedIngredients = {};
    
    // Only consolidate from active recipes
    const activeRecipes = recipes.filter(r => activeRecipeIds.has(r.id));
    
    for (const recipe of activeRecipes) {
        // Get multiplier for this recipe (default to 1)
        const multiplier = recipeMultipliers[recipe.id] || 1;
        
        for (const ingredient of recipe.ingredients) {
            const normalizedName = normalizeIngredientName(ingredient.ingredient);
            
            if (!consolidatedIngredients[normalizedName]) {
                consolidatedIngredients[normalizedName] = {
                    name: normalizedName,
                    originalName: ingredient.ingredient,
                    quantities: [],
                    sources: []
                };
            }
            
            // Multiply ingredient quantity by recipe multiplier
            const multipliedQuantity = ingredient.quantity * multiplier;
            
            // Convert to base unit for aggregation
            const base = convertToBaseUnit(multipliedQuantity, ingredient.unit, ingredient.unitType);
            
            consolidatedIngredients[normalizedName].quantities.push({
                value: base.value,
                unit: base.unit,
                unitType: base.unitType,
                originalQuantity: multipliedQuantity,
                originalUnit: ingredient.unit
            });
            
            // Add recipe name with multiplier if > 1
            const recipeLabel = multiplier > 1 ? `${recipe.name} (×${multiplier})` : recipe.name;
            consolidatedIngredients[normalizedName].sources.push(recipeLabel);
        }
    }
    
    // Group and sum quantities by original unit
    for (const [key, item] of Object.entries(consolidatedIngredients)) {
        if (item.quantities.length === 0) continue;
        
        // Group by original unit
        const byUnit = {};
        for (const q of item.quantities) {
            const unitKey = q.originalUnit || q.unit || 'none';
            if (!byUnit[unitKey]) {
                byUnit[unitKey] = {
                    unit: q.originalUnit || q.unit,
                    unitType: q.unitType,
                    quantities: []
                };
            }
            byUnit[unitKey].quantities.push(q);
        }
        
        // Sum all quantities of the same type (volume/weight) and convert to preferred unit system
        let totalBaseValue = 0;
        let itemUnitType = null;
        let hasCount = false;
        let countValue = 0;
        let countUnit = '';
        
        for (const [unitKey, group] of Object.entries(byUnit)) {
            if (group.unitType === 'count' || !group.unit) {
                // Handle count items separately
                hasCount = true;
                countValue = group.quantities.reduce((sum, q) => sum + (q.originalQuantity || q.value), 0);
                countUnit = group.unit || '';
            } else {
                // Sum all volume/weight quantities in base units
                for (const q of group.quantities) {
                    const base = convertToBaseUnit(q.originalQuantity || q.value, q.originalUnit || q.unit, group.unitType);
                    totalBaseValue += base.value;
                }
                if (itemUnitType === null) {
                    itemUnitType = group.unitType;
                }
            }
        }
        
        // Convert to preferred unit system
        if (itemUnitType && totalBaseValue > 0) {
            const converted = convertToPreferredUnitSystem(totalBaseValue, itemUnitType);
            item.displayQuantity = converted.displayQuantity;
            item.displayUnit = converted.displayUnit;
            item.displayUnitType = itemUnitType;
            item.flOz = converted.flOz; // Store fl oz for imperial volume display
        }
        
        // Handle count items
        if (hasCount) {
            if (totalBaseValue > 0) {
                // We have both count and volume/weight - show both
                item.groupedQuantities = [
                    { 
                        displayQuantity: item.displayQuantity, 
                        displayUnit: item.displayUnit, 
                        unitType: itemUnitType,
                        flOz: item.flOz // Include fl oz for imperial volume
                    },
                    { 
                        displayQuantity: countValue, 
                        displayUnit: countUnit, 
                        unitType: 'count',
                        flOz: null
                    }
                ];
                // Clear single display since we have mixed types
                delete item.displayQuantity;
                delete item.displayUnit;
            } else {
                // Only count items
                item.displayQuantity = countValue;
                item.displayUnit = countUnit;
                item.displayUnitType = 'count';
                item.flOz = null;
            }
        }
    }
}

/**
 * Set recipe multiplier (how many times to make this recipe)
 */
function setRecipeMultiplier(recipeId, multiplier) {
    const num = parseFloat(multiplier);
    if (isNaN(num) || num < 0) {
        showMessage('Multiplier must be a positive number', 'error');
        return;
    }
    
    if (num === 0) {
        // Remove from active if multiplier is 0
        activeRecipeIds.delete(recipeId);
        delete recipeMultipliers[recipeId];
    } else {
        // Add to active and set multiplier
        activeRecipeIds.add(recipeId);
        recipeMultipliers[recipeId] = num;
    }
    
    // Save state
    saveActiveRecipes();
    saveRecipeMultipliers();
    
    // Update UI
    updateRecipeList();
    consolidateIngredients();
    updateShoppingList();
    updateDayPlanner();
}

/**
 * Toggle recipe active status
 */
function toggleRecipeActive(recipeId) {
    if (activeRecipeIds.has(recipeId)) {
        activeRecipeIds.delete(recipeId);
        // Keep multiplier even when inactive
    } else {
        activeRecipeIds.add(recipeId);
        // Set default multiplier to 1 if not set
        if (!recipeMultipliers[recipeId]) {
            recipeMultipliers[recipeId] = 1;
        }
    }
    
    // Save active state
    saveActiveRecipes();
    saveRecipeMultipliers();
    
    // Update UI
    updateRecipeList();
    consolidateIngredients();
    updateShoppingList();
    updateDayPlanner();
}

/**
 * Sort recipes based on current sort order
 */
function sortRecipes() {
    const sortSelect = document.getElementById('recipeSortSelect');
    recipeSortOrder = sortSelect.value;
    localStorage.setItem('recipeConsolidator_sortOrder', recipeSortOrder);
    updateRecipeList();
}

/**
 * Get sorted recipes array
 */
function getSortedRecipes() {
    const sorted = [...recipes];
    
    switch (recipeSortOrder) {
        case 'name-asc':
            sorted.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'name-desc':
            sorted.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case 'added-desc':
            sorted.sort((a, b) => b.id - a.id); // Newest first (higher ID = newer)
            break;
        case 'added-asc':
            sorted.sort((a, b) => a.id - b.id); // Oldest first (lower ID = older)
            break;
    }
    
    return sorted;
}

/**
 * Update the recipe list display
 */
function updateRecipeList() {
    const list = document.getElementById('recipeList');
    const noRecipesMsg = document.getElementById('noRecipesMessage');
    const sortSelect = document.getElementById('recipeSortSelect');
    
    // Update sort dropdown if it exists
    if (sortSelect) {
        sortSelect.value = recipeSortOrder;
    }
    
    if (recipes.length === 0) {
        list.innerHTML = '';
        if (noRecipesMsg) noRecipesMsg.style.display = 'block';
        return;
    }
    
    if (noRecipesMsg) noRecipesMsg.style.display = 'none';
    list.innerHTML = '';
    
    // Get sorted recipes
    let sortedRecipes = getSortedRecipes();
    
    // Filter by selected tags
    if (selectedTagFilters.size > 0) {
        sortedRecipes = sortedRecipes.filter(recipe => {
            const recipeTags = recipe.tags || [];
            
            if (tagFilterLogic === 'and') {
                // Recipe must have ALL selected tags
                for (const selectedTag of selectedTagFilters) {
                    if (!recipeTags.includes(selectedTag)) {
                        return false;
                    }
                }
                return true;
            } else {
                // Recipe must have ANY selected tag (OR logic)
                for (const selectedTag of selectedTagFilters) {
                    if (recipeTags.includes(selectedTag)) {
                        return true;
                    }
                }
                return false;
            }
        });
    }
    
    // Filter by selected ingredients
    if (selectedIngredients.size > 0) {
        sortedRecipes = sortedRecipes.filter(recipe => {
            const recipeIngredients = recipe.ingredients.map(ing => 
                normalizeIngredientName(ing.ingredient).toLowerCase()
            );
            // Recipe must contain ALL selected ingredients
            for (const selectedIng of selectedIngredients) {
                if (!recipeIngredients.some(ing => ing.includes(selectedIng.toLowerCase()))) {
                    return false;
                }
            }
            return true;
        });
    }
    
    for (const recipe of sortedRecipes) {
        const isActive = activeRecipeIds.has(recipe.id);
        const multiplier = recipeMultipliers[recipe.id] || 1;
        const item = document.createElement('div');
        item.className = 'recipe-item';
        item.style.background = isActive ? '#e8f5e9' : '#f8f6f2';
        item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px; flex: 1;">
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" ${isActive ? 'checked' : ''} 
                           onchange="toggleRecipeActive(${recipe.id})" 
                           style="margin-right: 10px; width: 20px; height: 20px; cursor: pointer;">
                </label>
                <div style="flex: 1;">
                    <div class="recipe-item-name">${recipe.name}</div>
                    <div style="font-size: 14px; color: #6a6a6a; margin-top: 5px;">
                        ${recipe.ingredients.length} ingredient${recipe.ingredients.length !== 1 ? 's' : ''}
                        ${isActive ? '<span style="color: #2e7d32; margin-left: 10px;">✓ Active</span>' : '<span style="color: #999; margin-left: 10px;">Inactive</span>'}
                    </div>
                    ${(recipe.sourceTitle || recipe.sourceType || recipe.sourcePages || recipe.affiliateUrl) ? `
                        <div style="margin-top: 4px; font-size: 13px; color: #8a6a3b;">
                            Source: 
                            ${recipe.sourceTitle ? `<span>${recipe.sourceTitle}</span>` : ''}
                            ${recipe.sourcePages ? `<span>${recipe.sourceTitle ? ', ' : ''}pp. ${recipe.sourcePages}</span>` : ''}
                            ${(!recipe.sourceTitle && !recipe.sourcePages && recipe.sourceType) ? `<span>${recipe.sourceType}</span>` : ''}
                            ${recipe.affiliateUrl ? `<span style="margin-left: 6px; color: #b26a1a;">(affiliate link available)</span>` : ''}
                        </div>
                    ` : ''}
                    <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 5px;">
                        ${getRecipeTagsDisplay(recipe)}
                    </div>
                </div>
                ${isActive ? `
                    <div style="display: flex; align-items: center; gap: 5px;">
                        <label style="display: flex; align-items: center; font-size: 14px; color: #2c2c2c;">
                            <span style="margin-right: 5px;">×</span>
                            <input type="number" 
                                   value="${multiplier}" 
                                   min="0" 
                                   step="0.5"
                                   onchange="setRecipeMultiplier(${recipe.id}, this.value)"
                                   onblur="setRecipeMultiplier(${recipe.id}, this.value)"
                                   style="width: 60px; padding: 5px; border: 2px solid #e8e8e8; border-radius: 4px; font-size: 14px; text-align: center;">
                        </label>
                    </div>
                ` : ''}
            </div>
                <div class="recipe-item-actions">
                    <button class="btn btn-secondary" onclick="showIngredientsModal(${recipe.id})" style="padding: 8px 15px; font-size: 14px; margin-right: 5px;" title="Show Ingredients">Show Ingredients</button>
                    ${recipe.about ? `<button class="btn btn-secondary" onclick="showAboutModal(${recipe.id})" style="padding: 8px 15px; font-size: 14px; margin-right: 5px;" title="Show About">About</button>` : ''}
                    ${recipe.instructions ? `<button class="btn btn-secondary" onclick="toggleRecipePreparation(${recipe.id})" style="padding: 8px 15px; font-size: 14px; margin-right: 5px;" title="Show Preparation">Preparation</button>` : ''}
                    <button class="btn btn-secondary" onclick="editRecipeTags(${recipe.id})" style="padding: 8px 15px; font-size: 14px; margin-right: 5px;" title="Edit Tags">Tags</button>
                    <button class="btn btn-secondary" onclick="editRecipe(${recipe.id})" style="padding: 8px 15px; font-size: 14px; margin-right: 5px;">Edit</button>
                    <button class="btn btn-secondary" onclick="removeRecipe(${recipe.id})" style="padding: 8px 15px; font-size: 14px;">Remove</button>
                </div>
        `;
        list.appendChild(item);
    }
}

/**
 * Get recipe tags display HTML
 */
function getRecipeTagsDisplay(recipe) {
    const tags = recipe.tags || [];
    if (tags.length === 0) return '';
    
    return tags.map(tag => {
        const isSelected = selectedTagFilters.has(tag);
        return `<span class="recipe-tag" 
                     onclick="toggleTagFilter('${tag}')" 
                     style="cursor: pointer; ${isSelected ? 'background: #d48247; color: white;' : ''}"
                     title="Click to filter by this tag">${tag}${isSelected ? ' ✓' : ''}</span>`;
    }).join('');
}

/**
 * Toggle tag filter selection
 */
function toggleTagFilter(tag) {
    if (selectedTagFilters.has(tag)) {
        selectedTagFilters.delete(tag);
    } else {
        selectedTagFilters.add(tag);
    }
    
    // Save to localStorage
    try {
        localStorage.setItem(SELECTED_TAG_FILTERS_KEY, JSON.stringify(Array.from(selectedTagFilters)));
    } catch (error) {
        console.error('Error saving tag filters:', error);
    }
    
    updateTagFilters();
    updateRecipeList();
}

/**
 * Set tag filter logic (AND/OR)
 */
function setTagFilterLogic(logic) {
    tagFilterLogic = logic;
    try {
        localStorage.setItem(TAG_FILTER_LOGIC_KEY, logic);
    } catch (error) {
        console.error('Error saving tag filter logic:', error);
    }
    updateTagFilters();
    updateRecipeList();
}

/**
 * Clear all tag filters
 */
function clearTagFilters() {
    selectedTagFilters.clear();
    try {
        localStorage.setItem(SELECTED_TAG_FILTERS_KEY, JSON.stringify([]));
    } catch (error) {
        console.error('Error saving tag filters:', error);
    }
    updateTagFilters();
    updateRecipeList();
}

/**
 * Show ingredients in a modal popup
 */
function showIngredientsModal(recipeId) {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;
    
    const modal = document.getElementById('ingredientsModal');
    const modalTitle = document.getElementById('ingredientsModalTitle');
    const modalBody = document.getElementById('ingredientsModalBody');
    
    if (!modal || !modalTitle || !modalBody) return;
    
    modalTitle.textContent = `Ingredients: ${recipe.name}`;
    
    // Build ingredients list HTML
    const ingredientsHtml = `
        <ul style="margin: 0; padding-left: 25px; color: #6a6a6a; font-size: 16px; line-height: 2;">
            ${recipe.ingredients.map(ing => {
                const qty = ing.quantity !== null && ing.quantity !== undefined ? formatQuantity(ing.quantity) : '';
                const unit = ing.unit ? `${ing.unit} ` : '';
                return `<li style="margin-bottom: 8px;">${qty} ${unit}${escapeHtml(ing.ingredient)}</li>`;
            }).join('')}
        </ul>
    `;
    
    modalBody.innerHTML = ingredientsHtml;
    modal.classList.add('active');
    
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
}

/**
 * Close ingredients modal
 */
function closeIngredientsModal(event) {
    // If event is provided and clicked outside modal, close it
    if (event && event.target.id === 'ingredientsModal') {
        const modal = document.getElementById('ingredientsModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
        return;
    }
    
    // Close button clicked
    const modal = document.getElementById('ingredientsModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

/**
 * Show about section in a modal popup
 */
function showAboutModal(recipeId) {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe || !recipe.about) return;
    
    const modal = document.getElementById('aboutModal');
    const modalTitle = document.getElementById('aboutModalTitle');
    const modalBody = document.getElementById('aboutModalBody');
    
    if (!modal || !modalTitle || !modalBody) return;
    
    modalTitle.textContent = `About: ${recipe.name}`;
    modalBody.textContent = recipe.about;
    modal.classList.add('active');
    
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
}

/**
 * Close about modal
 */
function closeAboutModal(event) {
    // If event is provided and clicked outside modal, close it
    if (event && event.target.id === 'aboutModal') {
        const modal = document.getElementById('aboutModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
        return;
    }
    
    // Close button clicked
    const modal = document.getElementById('aboutModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

/**
 * Show preparation instructions in a modal popup
 */
function toggleRecipePreparation(recipeId) {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;
    
    const modal = document.getElementById('preparationModal');
    const modalTitle = document.getElementById('preparationModalTitle');
    const modalBody = document.getElementById('preparationModalBody');
    
    if (!modal || !modalTitle || !modalBody) return;
    
    const visibility = recipe.instructionsVisibility || 'hidden';
    modalTitle.textContent = `Preparation: ${recipe.name}`;

    if (visibility === 'full' && recipe.instructions) {
        // Future option: show full steps when you intentionally mark a recipe as fully visible
        modalBody.textContent = recipe.instructions;
    } else {
        // Default: keep instructions hidden and direct people to the source / affiliate link
        const parts = [];

        parts.push(
            `<p style="margin-bottom: 12px;">
                The ingredients and context for this recipe are consolidated here, but the step‑by‑step instructions are not shown.
            </p>`
        );

        if (recipe.sourceTitle || recipe.sourceType || recipe.sourcePages || recipe.sourceUrl) {
            let sourceText = '';
            if (recipe.sourceType === 'book' && recipe.sourceTitle) {
                sourceText = `From <em>${recipe.sourceTitle}</em>`;
                if (recipe.sourcePages) {
                    sourceText += ` (pp. ${recipe.sourcePages})`;
                }
            } else if (recipe.sourceTitle) {
                sourceText = `From <em>${recipe.sourceTitle}</em>`;
            } else if (recipe.sourceType) {
                sourceText = `Source: ${recipe.sourceType}`;
            }

            if (sourceText) {
                parts.push(
                    `<p style="margin-bottom: 12px; color: #8a6a3b;">
                        ${sourceText}
                    </p>`
                );
            }

            if (recipe.sourceUrl) {
                parts.push(
                    `<p style="margin-bottom: 12px;">
                        Original recipe:
                        <a href="${recipe.sourceUrl}" target="_blank" rel="noopener noreferrer">
                            ${recipe.sourceUrl}
                        </a>
                    </p>`
                );
            }
        }

        if (recipe.affiliateUrl) {
            const affiliateLabel = recipe.sourceType === 'book'
                ? 'Buy this book (affiliate link)'
                : 'Purchase via affiliate link';

            parts.push(
                `<p style="margin-top: 16px;">
                    <a href="${recipe.affiliateUrl}" 
                       target="_blank" 
                       rel="noopener noreferrer"
                       style="display: inline-block; padding: 10px 18px; background: #d48247; color: white; border-radius: 6px; text-decoration: none; font-weight: 500;">
                        ${affiliateLabel}
                    </a>
                </p>`
            );
        }

        if (parts.length === 1) {
            // No structured source info; show a simple generic note
            parts.push(
                `<p style="margin-top: 8px; font-size: 14px; color: #6a6a6a;">
                    You can keep the full preparation steps in your own copy of the book or original recipe.
                </p>`
            );
        }

        modalBody.innerHTML = parts.join('');
    }

    modal.classList.add('active');
    
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
}

/**
 * Close preparation modal
 */
function closePreparationModal(event) {
    // If event is provided and clicked outside modal, close it
    if (event && event.target.id === 'preparationModal') {
        const modal = document.getElementById('preparationModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
        return;
    }
    
    // Close button clicked
    const modal = document.getElementById('preparationModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Close modals on Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const preparationModal = document.getElementById('preparationModal');
        const aboutModal = document.getElementById('aboutModal');
        const ingredientsModal = document.getElementById('ingredientsModal');
        
        if (preparationModal && preparationModal.classList.contains('active')) {
            closePreparationModal();
        } else if (aboutModal && aboutModal.classList.contains('active')) {
            closeAboutModal();
        } else if (ingredientsModal && ingredientsModal.classList.contains('active')) {
            closeIngredientsModal();
        }
    }
});

/**
 * Edit recipe tags
 */
function editRecipeTags(recipeId) {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;
    
    const currentTags = (recipe.tags || []).join(', ');
    const newTags = prompt(`Edit tags for "${recipe.name}" (comma-separated):`, currentTags);
    
    if (newTags === null) return; // User cancelled
    
    // Parse tags (trim, lowercase, remove empty)
    const tags = newTags.split(',')
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0);
    
    recipe.tags = tags;
    saveRecipes();
    updateRecipeList();
    updateTagFilters();
    showMessage('Tags updated', 'success');
}

/**
 * Update tag filter buttons
 */
function updateTagFilters() {
    const container = document.getElementById('tagFiltersContainer');
    if (!container) return;
    
    // Collect all tags from all recipes
    const allTags = new Set();
    for (const recipe of recipes) {
        (recipe.tags || []).forEach(tag => allTags.add(tag));
    }
    
    // Create HTML for filter controls (first line)
    let html = '<div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px; flex-wrap: wrap;">';
    
    // AND/OR toggle
    html += `
        <div style="display: flex; align-items: center; gap: 8px;">
            <label style="font-size: 14px; color: #2c2c2c; font-weight: 500;">Filter logic:</label>
            <button class="tag-filter-btn ${tagFilterLogic === 'or' ? 'active' : ''}" 
                    onclick="setTagFilterLogic('or')" 
                    style="padding: 6px 12px; font-size: 13px;">
                OR
            </button>
            <button class="tag-filter-btn ${tagFilterLogic === 'and' ? 'active' : ''}" 
                    onclick="setTagFilterLogic('and')" 
                    style="padding: 6px 12px; font-size: 13px;">
                AND
            </button>
        </div>
    `;
    
    // Clear filters button (only show if filters are active)
    if (selectedTagFilters.size > 0) {
        html += `
            <button class="tag-filter-btn" 
                    onclick="clearTagFilters()" 
                    style="padding: 6px 12px; font-size: 13px; background: #ffebee; color: #c62828; border-color: #c62828;">
                Clear Filters (${selectedTagFilters.size})
            </button>
        `;
    }
    
    html += '</div>';
    
    // Second line: Tag buttons
    html += '<div style="display: flex; flex-wrap: wrap; gap: 8px;">';
    
    // Create "All Recipes" button (show as active when no filters)
    html += `<button class="tag-filter-btn ${selectedTagFilters.size === 0 ? 'active' : ''}" 
                        onclick="clearTagFilters()" 
                        style="margin-bottom: 0;">
                    All Recipes
                </button>`;
    
    // Create buttons for each tag (sorted alphabetically)
    const sortedTags = Array.from(allTags).sort();
    for (const tag of sortedTags) {
        const isSelected = selectedTagFilters.has(tag);
        html += `<button class="tag-filter-btn ${isSelected ? 'active' : ''}" 
                          onclick="toggleTagFilter('${tag}')">
                     ${tag}${isSelected ? ' ✓' : ''}
                 </button>`;
    }
    
    html += '</div>';
    
    container.innerHTML = html;
}

/**
 * Get all unique ingredients from all recipes
 */
function getAllIngredients() {
    const ingredients = new Set();
    for (const recipe of recipes) {
        for (const ing of recipe.ingredients) {
            const normalized = normalizeIngredientName(ing.ingredient);
            if (normalized) {
                ingredients.add(normalized);
            }
        }
    }
    return Array.from(ingredients).sort();
}

/**
 * Filter ingredient dropdown options based on search
 */
function filterIngredientOptions(searchText) {
    const dropdown = document.getElementById('ingredientDropdown');
    if (!dropdown) return;
    
    const allIngredients = getAllIngredients();
    const searchLower = (searchText || '').toLowerCase().trim();
    
    let filtered;
    if (searchLower === '') {
        // If no search text, show all ingredients (sorted alphabetically)
        filtered = allIngredients;
    } else {
        // Filter ingredients that match search
        filtered = allIngredients.filter(ing => 
            ing.toLowerCase().includes(searchLower)
        );
    }
    
    if (filtered.length === 0 && searchText.trim()) {
        dropdown.innerHTML = '<div class="ingredient-option" style="color: #999; cursor: default;">No ingredients found</div>';
        dropdown.style.display = 'block';
        return;
    }
    
    if (filtered.length === 0) {
        dropdown.style.display = 'none';
        return;
    }
    
    dropdown.innerHTML = filtered.map(ing => {
        const isSelected = selectedIngredients.has(ing);
        return `<div class="ingredient-option" 
                     onclick="selectIngredient('${ing.replace(/'/g, "\\'")}')"
                     style="${isSelected ? 'background: #e8f5e9;' : ''}">
                     ${ing}${isSelected ? ' ✓' : ''}
                 </div>`;
    }).join('');
    
    dropdown.style.display = 'block';
}

/**
 * Show ingredient dropdown
 */
function showIngredientDropdown() {
    const dropdown = document.getElementById('ingredientDropdown');
    const input = document.getElementById('ingredientSearchInput');
    if (dropdown && input) {
        filterIngredientOptions(input.value);
    }
}

/**
 * Hide ingredient dropdown
 */
function hideIngredientDropdown() {
    // Delay to allow clicks on dropdown items
    setTimeout(() => {
        const dropdown = document.getElementById('ingredientDropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
    }, 200);
}

/**
 * Select an ingredient for filtering
 */
function selectIngredient(ingredient) {
    selectedIngredients.add(ingredient);
    updateSelectedIngredientsDisplay();
    updateRecipeList();
    
    // Clear search input
    const input = document.getElementById('ingredientSearchInput');
    if (input) {
        input.value = '';
    }
    
    // Refresh dropdown
    filterIngredientOptions('');
}

/**
 * Remove an ingredient from filter
 */
function removeIngredient(ingredient) {
    selectedIngredients.delete(ingredient);
    updateSelectedIngredientsDisplay();
    updateRecipeList();
}

/**
 * Update display of selected ingredients
 */
function updateSelectedIngredientsDisplay() {
    const container = document.getElementById('selectedIngredientsContainer');
    if (!container) return;
    
    if (selectedIngredients.size === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = Array.from(selectedIngredients).sort().map(ing => 
        `<div class="selected-ingredient">
            ${ing}
            <span class="remove" onclick="removeIngredient('${ing.replace(/'/g, "\\'")}')" title="Remove">×</span>
        </div>`
    ).join('');
}

/**
 * Get ingredient category
 */
function getIngredientCategory(ingredientName) {
    if (!ingredientName) return 'Other';
    
    const nameLower = ingredientName.toLowerCase();
    
    // Special-case overrides for tricky items
    // Anything explicitly called "juice" should be treated as a beverage
    if (/\bjuice\b/.test(nameLower)) {
        return 'Beverages';
    }
    
    // Any kind of "milk" (including plant milks) is easiest to find with dairy-ish items
    if (/\bmilk\b/.test(nameLower)) {
        return 'Dairy & Eggs';
    }
    
    // Make sure berries (including plural) end up in Fruits
    if (nameLower.includes('blueberr')) {
        return 'Fruits';
    }
    
    // Find the best match (longest keyword that matches) across all categories
    let bestMatch = null;
    let bestMatchLength = 0;
    
    for (const [category, keywords] of Object.entries(INGREDIENT_CATEGORIES)) {
        if (category === 'Other') continue;
        
        for (const keyword of keywords) {
            if (nameLower.includes(keyword) && keyword.length > bestMatchLength) {
                bestMatch = category;
                bestMatchLength = keyword.length;
            }
        }
    }
    
    return bestMatch || 'Other';
}

/**
 * Set shopping list sort order
 */
function setShoppingListSort(sortOrder) {
    shoppingListSortOrder = sortOrder;
    try {
        localStorage.setItem(SHOPPING_LIST_SORT_KEY, sortOrder);
    } catch (error) {
        console.error('Error saving shopping list sort:', error);
    }
    
    // Update dropdown
    const select = document.getElementById('shoppingListSortSelect');
    if (select) {
        select.value = sortOrder;
    }
    
    // Update display
    updateShoppingList();
}

/**
 * Load shopping list sort preference
 */
function loadShoppingListSort() {
    try {
        const saved = localStorage.getItem(SHOPPING_LIST_SORT_KEY);
        if (saved && ['alphabetical', 'category'].includes(saved)) {
            shoppingListSortOrder = saved;
        }
    } catch (error) {
        console.error('Error loading shopping list sort:', error);
    }
    
    // Update dropdown
    const select = document.getElementById('shoppingListSortSelect');
    if (select) {
        select.value = shoppingListSortOrder;
    }
}

/**
 * Save meal plan to localStorage
 */
function saveMealPlan() {
    try {
        localStorage.setItem(MEAL_PLAN_KEY, JSON.stringify(mealPlan));
        localStorage.setItem(MEAL_PLAN_NOTES_KEY, JSON.stringify(mealPlanNotes));
        localStorage.setItem(SELECTED_DAYS_KEY, JSON.stringify(Array.from(selectedDays)));
    } catch (error) {
        console.error('Error saving meal plan:', error);
    }
}

/**
 * Load meal plan from localStorage
 */
function loadMealPlan() {
    try {
        const saved = localStorage.getItem(MEAL_PLAN_KEY);
        if (saved) {
            mealPlan = JSON.parse(saved);
            // Convert recipe IDs back to numbers
            for (const date in mealPlan) {
                for (const meal in mealPlan[date]) {
                    mealPlan[date][meal] = mealPlan[date][meal].map(id => parseFloat(id));
                }
            }
        }
        
        const savedNotes = localStorage.getItem(MEAL_PLAN_NOTES_KEY);
        if (savedNotes) {
            mealPlanNotes = JSON.parse(savedNotes);
        }
        
        const savedDays = localStorage.getItem(SELECTED_DAYS_KEY);
        if (savedDays) {
            selectedDays = new Set(JSON.parse(savedDays));
        }
    } catch (error) {
        console.error('Error loading meal plan:', error);
    }
}

/**
 * Add a day to the planner
 */
function addDayToPlanner() {
    const dateStr = prompt('Enter date (YYYY-MM-DD) or leave blank for today:', new Date().toISOString().split('T')[0]);
    
    if (dateStr === null) return; // User cancelled
    
    let date;
    if (!dateStr.trim()) {
        date = new Date().toISOString().split('T')[0];
    } else {
        // Validate date format
        const dateMatch = dateStr.trim().match(/^\d{4}-\d{2}-\d{2}$/);
        if (!dateMatch) {
            showMessage('Invalid date format. Please use YYYY-MM-DD', 'error');
            return;
        }
        date = dateStr.trim();
    }
    
    if (!mealPlan[date]) {
        mealPlan[date] = {
            breakfast: [],
            lunch: [],
            dinner: []
        };
    }
    
    selectedDays.add(date);
    saveMealPlan();
    updateDayPlanner();
    showMessage(`Added ${formatDate(date)} to planner`, 'success');
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Remove a day from planner
 */
function removeDayFromPlanner(date) {
    if (confirm(`Remove ${formatDate(date)} from planner?`)) {
        delete mealPlan[date];
        selectedDays.delete(date);
        saveMealPlan();
        updateDayPlanner();
    }
}

/**
 * Update day planner display
 */
function updateDayPlanner() {
    const container = document.getElementById('dayPlannerContainer');
    const card = document.getElementById('dayPlannerCard');
    
    if (!container || !card) return;
    
    // Show planner if there are active recipes or days
    if (activeRecipeIds.size > 0 || selectedDays.size > 0) {
        card.style.display = 'block';
    } else {
        card.style.display = 'none';
        return;
    }
    
    container.innerHTML = '';
    
    // Sort days chronologically
    const sortedDays = Array.from(selectedDays).sort();
    
    // Define all possible meal types
    const allMealTypes = ['breakfast', 'lunch', 'dinner', 'prep', 'late-night'];
    
    for (const date of sortedDays) {
        if (!mealPlan[date]) {
            mealPlan[date] = {};
        }
        
        const dayDiv = document.createElement('div');
        dayDiv.className = 'day-planner-day';
        
        // Get meal types that exist for this day
        const existingMeals = Object.keys(mealPlan[date]).filter(meal => 
            mealPlan[date][meal] && Array.isArray(mealPlan[date][meal])
        );
        
        let dayContent = `
            <div class="day-header">
                <div class="day-title">${formatDate(date)}</div>
                <button class="remove-day" onclick="removeDayFromPlanner('${date}')">Remove Day</button>
            </div>
        `;
        
        // Show empty drop zone only if no meal slots exist
        if (existingMeals.length === 0) {
            dayContent += `
                <div class="day-drop-zone empty" 
                     data-date="${date}"
                     ondrop="handleDayDrop(event)"
                     ondragover="handleDragOver(event)"
                     ondragleave="handleDragLeave(event)"
                     id="day-drop-${date}">
                    <div style="text-align: center; color: #999; font-style: italic; padding: 20px;">
                        Drop meal types here
                    </div>
                </div>
            `;
        } else {
            // Add existing meal slots for this day
            existingMeals.forEach((mealType, index) => {
                dayContent += `
                    <div class="meal-slot-drop-indicator" 
                         data-date="${date}"
                         data-insert-position="${index}"
                         data-insert-before="${mealType}"
                         ondrop="handleMealSlotReorder(event)"
                         ondragover="handleMealSlotDragOver(event)"
                         ondragleave="handleMealSlotDragLeave(event)"></div>
                    <div class="day-drop-zone meal-slot" 
                         data-date="${date}" 
                         data-meal="${mealType}"
                         data-meal-index="${index}"
                         ondrop="handleMealSlotContainerDrop(event)"
                         ondragover="handleMealSlotContainerDragOver(event)"
                         ondragleave="handleMealSlotContainerDragLeave(event)"
                         data-accepts-meal-types="true">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <div class="meal-slot-header" 
                                 draggable="true"
                                 ondragstart="handleMealSlotDragStart(event)"
                                 ondragend="handleMealSlotDragEnd(event)"
                                 style="flex: 1; cursor: move;">
                                <div class="meal-slot-label">${capitalizeMealType(mealType)}</div>
                            </div>
                            <button class="remove-meal-slot" onclick="removeMealSlotFromDay('${date}', '${mealType}')" title="Remove ${capitalizeMealType(mealType)}" onmousedown="event.stopPropagation()">×</button>
                        </div>
                        <div class="meal-slot-content" id="meal_${date}_${mealType}">
                            ${renderMealRecipes(date, mealType)}
                        </div>
                    </div>
                `;
            });
            // Add drop indicator at the end
            dayContent += `
                <div class="meal-slot-drop-indicator" 
                     data-date="${date}"
                     data-insert-position="${existingMeals.length}"
                     ondrop="handleMealSlotReorder(event)"
                     ondragover="handleMealSlotDragOver(event)"
                     ondragleave="handleMealSlotDragLeave(event)"></div>
            `;
            
            // Add empty drop zone at the end for adding more meal types
            dayContent += `
                <div class="day-drop-zone empty" 
                     data-date="${date}"
                     ondrop="handleDayDrop(event)"
                     ondragover="handleDragOver(event)"
                     ondragleave="handleDragLeave(event)"
                     id="day-drop-${date}"
                     style="min-height: 60px; margin-top: 10px;">
                    <div style="text-align: center; color: #999; font-style: italic; padding: 10px; font-size: 12px;">
                        Drop to add more meal types
                    </div>
                </div>
            `;
        }
        
        dayDiv.innerHTML = dayContent;
        container.appendChild(dayDiv);
    }
    
    updateUnplannedRecipes();
}

/**
 * Capitalize meal type for display
 */
function capitalizeMealType(mealType) {
    if (mealType === 'late-night') {
        return 'Late Night';
    }
    return mealType.charAt(0).toUpperCase() + mealType.slice(1);
}

/**
 * Render recipes for a meal slot
 */
function renderMealRecipes(date, meal) {
    const recipeIds = mealPlan[date][meal] || [];
    if (recipeIds.length === 0) {
        return '<div style="color: #999; font-style: italic; font-size: 14px;">Drop recipes here</div>';
    }
    
    return recipeIds.map((recipeId, index) => {
        const recipe = recipes.find(r => r.id === recipeId);
        if (!recipe) return '';
        
        // Check if this recipe appears in other meal slots for this day (for prep connections)
        const otherMealSlots = getRecipeMealSlotsForDay(date, recipeId, meal);
        const prepInfo = getPrepInfoForRecipe(date, recipeId, meal);
        
        // Get note for this recipe instance
        const note = getRecipeNote(date, meal, recipeId, index);
        const noteKey = `${date}_${meal}_${recipeId}_${index}`;
        
        return `
            <div class="planned-recipe" 
                 draggable="true" 
                 ondragstart="handleRecipeDragStart(event)" 
                 data-recipe-id="${recipeId}"
                 data-date="${date}"
                 data-meal="${meal}"
                 data-note-key="${noteKey}"
                 ondragend="handleRecipeDragEnd(event)">
                <div style="flex: 1;">
                    <div>${escapeHtml(recipe.name)}${prepInfo ? prepInfo : ''}${otherMealSlots ? otherMealSlots : ''}</div>
                    ${note ? `<div style="font-size: 12px; color: #6a6a6a; font-style: italic; margin-top: 4px;">${escapeHtml(note)}</div>` : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <button class="btn btn-secondary" onclick="editRecipeNote('${date}', '${meal}', ${recipeId}, ${index})" style="padding: 4px 8px; font-size: 12px;" title="Add/Edit Note">📝</button>
                    <button class="remove-meal" onclick="removeRecipeFromMeal('${date}', '${meal}', ${recipeId})" onmousedown="event.stopPropagation()">×</button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Get note for a recipe instance
 */
function getRecipeNote(date, meal, recipeId, index) {
    if (!mealPlanNotes[date] || !mealPlanNotes[date][meal]) {
        return '';
    }
    const noteKey = `${date}_${meal}_${recipeId}_${index}`;
    return mealPlanNotes[date][meal][noteKey] || '';
}

/**
 * Edit note for a recipe instance
 */
function editRecipeNote(date, meal, recipeId, index) {
    const noteKey = `${date}_${meal}_${recipeId}_${index}`;
    const currentNote = getRecipeNote(date, meal, recipeId, index);
    
    const newNote = prompt('Add a note for this recipe instance:', currentNote || '');
    
    if (newNote === null) {
        return; // User cancelled
    }
    
    // Initialize structure if needed
    if (!mealPlanNotes[date]) {
        mealPlanNotes[date] = {};
    }
    if (!mealPlanNotes[date][meal]) {
        mealPlanNotes[date][meal] = {};
    }
    
    if (newNote.trim()) {
        mealPlanNotes[date][meal][noteKey] = newNote.trim();
    } else {
        // Remove note if empty
        delete mealPlanNotes[date][meal][noteKey];
    }
    
    saveMealPlan();
    updateDayPlanner();
}

/**
 * Get other meal slots this recipe appears in for the same day
 */
function getRecipeMealSlotsForDay(date, recipeId, currentMeal) {
    if (!mealPlan[date]) return '';
    
    const otherSlots = [];
    for (const meal in mealPlan[date]) {
        if (meal !== currentMeal && Array.isArray(mealPlan[date][meal]) && mealPlan[date][meal].includes(recipeId)) {
            otherSlots.push(meal);
        }
    }
    
    if (otherSlots.length === 0) return '';
    
    return ` <span style="color: #999; font-size: 12px; font-style: italic;">(also in ${otherSlots.map(m => capitalizeMealType(m)).join(', ')})</span>`;
}

/**
 * Get prep information for a recipe (if prep was done on a different day)
 */
function getPrepInfoForRecipe(date, recipeId, meal) {
    // Only show prep info for non-prep meals
    if (meal === 'prep') return '';
    
    // Check if this recipe exists in prep slots on earlier days or same day before this meal
    const currentDate = new Date(date + 'T00:00:00');
    const mealOrder = ['prep', 'breakfast', 'lunch', 'dinner', 'late-night'];
    const currentMealIndex = mealOrder.indexOf(meal);
    
    for (const d in mealPlan) {
        const checkDate = new Date(d + 'T00:00:00');
        const checkMealIndex = mealOrder.indexOf('prep');
        
        if (mealPlan[d] && mealPlan[d]['prep'] && Array.isArray(mealPlan[d]['prep']) && mealPlan[d]['prep'].includes(recipeId)) {
            // Recipe exists in prep
            if (d === date) {
                return ` <span style="color: #2e7d32; font-size: 12px;">✓ prepped</span>`;
            } else if (checkDate < currentDate) {
                return ` <span style="color: #2e7d32; font-size: 12px;">✓ prepped ${formatDate(d)}</span>`;
            }
        }
    }
    
    return '';
}

/**
 * Update unplanned recipes display
 */
function updateUnplannedRecipes() {
    const container = document.getElementById('unplannedRecipes');
    if (!container) return;
    
    // Get all active recipe IDs
    const activeIds = Array.from(activeRecipeIds);
    
    // Get all planned recipe IDs
    const plannedIds = new Set();
    for (const date in mealPlan) {
        for (const meal in mealPlan[date]) {
            if (Array.isArray(mealPlan[date][meal])) {
                mealPlan[date][meal].forEach(id => plannedIds.add(id));
            }
        }
    }
    
    // Get unplanned recipes (active but not in any meal)
    const unplannedRecipes = activeIds
        .filter(id => !plannedIds.has(id))
        .map(id => recipes.find(r => r.id === id))
        .filter(r => r !== undefined);
    
    if (unplannedRecipes.length === 0) {
        container.innerHTML = '<div style="color: #999; font-style: italic; text-align: center; padding: 20px;">All active recipes are planned</div>';
        return;
    }
    
    container.innerHTML = unplannedRecipes.map(recipe => {
        return `
            <div class="unplanned-recipe" 
                 draggable="true" 
                 ondragstart="handleRecipeDragStart(event)" 
                 ondragend="handleRecipeDragEnd(event)"
                 data-recipe-id="${recipe.id}">
                ${escapeHtml(recipe.name)}
            </div>
        `;
    }).join('');
}

/**
 * Handle meal type drag start
 */
function handleMealTypeDragStart(event) {
    event.dataTransfer.setData('application/x-meal-type', event.target.dataset.mealType);
    event.target.classList.add('dragging');
}

/**
 * Handle meal slot drag start (for reordering)
 */
function handleMealSlotDragStart(event) {
    // Don't start drag if clicking on a button or recipe
    if (event.target.tagName === 'BUTTON' || 
        event.target.closest('.planned-recipe') || 
        event.target.closest('.unplanned-recipe') ||
        event.target.closest('.meal-slot-content')) {
        event.preventDefault();
        return false;
    }
    
    // Get meal slot info from parent container
    const mealSlotContainer = event.currentTarget.closest('.meal-slot');
    if (!mealSlotContainer) {
        event.preventDefault();
        return false;
    }
    
    const mealType = mealSlotContainer.dataset.meal;
    const date = mealSlotContainer.dataset.date;
    
    if (!mealType || !date) {
        event.preventDefault();
        return false;
    }
    
    event.dataTransfer.setData('application/x-meal-slot', JSON.stringify({ date, mealType }));
    event.dataTransfer.effectAllowed = 'move';
    mealSlotContainer.classList.add('dragging');
}

/**
 * Handle meal slot drag end
 */
function handleMealSlotDragEnd(event) {
    const mealSlotContainer = event.currentTarget.closest('.meal-slot');
    if (mealSlotContainer) {
        mealSlotContainer.classList.remove('dragging');
    }
    // Remove all drag-over classes
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}

/**
 * Handle drop on meal slot container (for reordering meal slots, adding new meal types, and recipes)
 */
function handleMealSlotContainerDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('meal-slot-insert-before', 'meal-slot-insert-after', 'drag-over');
    
    const types = event.dataTransfer.types;
    
    // Handle recipe drops
    if (types.includes('text/plain') && !types.includes('application/x-meal-slot') && !types.includes('application/x-meal-type')) {
        const recipeIdStr = event.dataTransfer.getData('text/plain');
        if (recipeIdStr) {
            const recipeId = parseFloat(recipeIdStr);
            const date = event.currentTarget.dataset.date;
            const meal = event.currentTarget.dataset.meal;
            
            if (date && meal && recipeId) {
                // Check if duplicate was allowed when drag started (stored in dataTransfer)
                const allowDuplicateStr = event.dataTransfer.getData('application/x-allow-duplicate');
                const allowDuplicate = allowDuplicateStr === 'true' || event.ctrlKey || event.metaKey;
                
                if (!allowDuplicate) {
                    // Remove from previous location if it exists (normal behavior)
                    for (const d in mealPlan) {
                        for (const m in mealPlan[d]) {
                            if (Array.isArray(mealPlan[d][m])) {
                                const index = mealPlan[d][m].indexOf(recipeId);
                                if (index > -1) {
                                    mealPlan[d][m].splice(index, 1);
                                }
                            }
                        }
                    }
                } else {
                    // For prep: check if recipe already exists in this exact slot
                    if (mealPlan[date] && mealPlan[date][meal] && mealPlan[date][meal].includes(recipeId)) {
                        // Already exists, don't duplicate
                        return;
                    }
                }
                
                // Add to new location
                if (!mealPlan[date][meal]) {
                    mealPlan[date][meal] = [];
                }
                const newIndex = mealPlan[date][meal].length;
                mealPlan[date][meal].push(recipeId);
                
                // If moving (not duplicating), preserve note if it exists
                if (!allowDuplicate) {
                    // Find and move note from old location
                    for (const d in mealPlan) {
                        for (const m in mealPlan[d]) {
                            if (Array.isArray(mealPlan[d][m])) {
                                const oldIndex = mealPlan[d][m].indexOf(recipeId);
                                if (oldIndex > -1 && (d !== date || m !== meal)) {
                                    const oldNoteKey = `${d}_${m}_${recipeId}_${oldIndex}`;
                                    if (mealPlanNotes[d] && mealPlanNotes[d][m] && mealPlanNotes[d][m][oldNoteKey]) {
                                        // Initialize new location
                                        if (!mealPlanNotes[date]) mealPlanNotes[date] = {};
                                        if (!mealPlanNotes[date][meal]) mealPlanNotes[date][meal] = {};
                                        
                                        const newNoteKey = `${date}_${meal}_${recipeId}_${newIndex}`;
                                        mealPlanNotes[date][meal][newNoteKey] = mealPlanNotes[d][m][oldNoteKey];
                                        delete mealPlanNotes[d][m][oldNoteKey];
                                        
                                        // Reindex notes in old location
                                        reindexRecipeNotes(d, m, recipeId);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                
                saveMealPlan();
                updateDayPlanner();
                
                // Remove dragging class from all elements
                document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
            }
        }
        return;
    }
    
    // Check if this is a new meal type being added
    const mealType = event.dataTransfer.getData('application/x-meal-type');
    if (mealType) {
        handleMealSlotDropForNewMealType(event);
        return;
    }
    
    // Otherwise handle meal slot reordering
    if (!event.dataTransfer.types.includes('application/x-meal-slot')) {
        return;
    }
    
    const dragData = event.dataTransfer.getData('application/x-meal-slot');
    if (!dragData) return;
    
    const { date: sourceDate, mealType: sourceMealType } = JSON.parse(dragData);
    const targetDate = event.currentTarget.dataset.date;
    const targetMealIndex = parseInt(event.currentTarget.dataset.mealIndex);
    
    if (sourceDate !== targetDate) return; // Can only reorder within same day
    
    // Determine insert position based on where we dropped (top half = before, bottom half = after)
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseY = event.clientY;
    const middleY = rect.top + rect.height / 2;
    
    let insertPosition = targetMealIndex;
    if (mouseY < middleY) {
        // Insert before this meal
        insertPosition = targetMealIndex;
    } else {
        // Insert after this meal
        insertPosition = targetMealIndex + 1;
    }
    
    // Get current meal order
    const currentMeals = Object.keys(mealPlan[targetDate]).filter(meal => 
        mealPlan[targetDate][meal] && Array.isArray(mealPlan[targetDate][meal])
    );
    
    // Remove source meal from its current position
    const sourceIndex = currentMeals.indexOf(sourceMealType);
    if (sourceIndex === -1) return;
    
    currentMeals.splice(sourceIndex, 1);
    
    // Calculate new position (adjust if source was before target)
    let newPosition = insertPosition;
    if (sourceIndex < insertPosition) {
        newPosition = insertPosition - 1;
    }
    
    // Insert at new position
    currentMeals.splice(newPosition, 0, sourceMealType);
    
    // Rebuild mealPlan object in new order
    const reorderedMeals = {};
    const mealData = {};
    
    // Store all meal data
    for (const meal of Object.keys(mealPlan[targetDate])) {
        if (Array.isArray(mealPlan[targetDate][meal])) {
            mealData[meal] = mealPlan[targetDate][meal];
        }
    }
    
    // Rebuild in new order
    for (const meal of currentMeals) {
        reorderedMeals[meal] = mealData[meal];
    }
    
    mealPlan[targetDate] = reorderedMeals;
    
    saveMealPlan();
    updateDayPlanner();
    
    // Remove dragging class from all elements
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
}

/**
 * Handle drag over for meal slot container (for reordering meal slots, adding new meal types, and recipes)
 */
function handleMealSlotContainerDragOver(event) {
    const dragData = event.dataTransfer.types;
    
    // Handle recipe drops - make entire meal slot a drop zone
    // Priority: recipes take precedence over meal slot reordering
    if (dragData.includes('text/plain') && !dragData.includes('application/x-meal-slot') && !dragData.includes('application/x-meal-type')) {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.classList.add('drag-over');
        
        // Show hint for duplicate (check both stored value and current modifier keys)
        const allowDuplicateStr = event.dataTransfer.getData('application/x-allow-duplicate');
        const isDuplicating = allowDuplicateStr === 'true' || event.ctrlKey || event.metaKey;
        if (isDuplicating) {
            event.currentTarget.setAttribute('title', 'Drop to add (duplicate for prep)');
        } else {
            event.currentTarget.removeAttribute('title');
        }
        return;
    }
    
    // Handle meal slot reordering
    if (dragData.includes('application/x-meal-slot')) {
        event.preventDefault();
        event.stopPropagation();
        
        // Determine if we're in the top half (insert before) or bottom half (insert after)
        const rect = event.currentTarget.getBoundingClientRect();
        const mouseY = event.clientY;
        const middleY = rect.top + rect.height / 2;
        
        event.currentTarget.classList.remove('meal-slot-insert-before', 'meal-slot-insert-after');
        
        if (mouseY < middleY) {
            event.currentTarget.classList.add('meal-slot-insert-before');
        } else {
            event.currentTarget.classList.add('meal-slot-insert-after');
        }
        return;
    }
    
    // Handle new meal type drops
    if (dragData.includes('application/x-meal-type')) {
        event.preventDefault();
        event.stopPropagation();
        
        // Determine if we're in the top half (insert before) or bottom half (insert after)
        const rect = event.currentTarget.getBoundingClientRect();
        const mouseY = event.clientY;
        const middleY = rect.top + rect.height / 2;
        
        event.currentTarget.classList.remove('meal-slot-insert-before', 'meal-slot-insert-after');
        
        if (mouseY < middleY) {
            event.currentTarget.classList.add('meal-slot-insert-before');
        } else {
            event.currentTarget.classList.add('meal-slot-insert-after');
        }
        return;
    }
}

/**
 * Handle drag leave for meal slot container
 */
function handleMealSlotContainerDragLeave(event) {
    event.currentTarget.classList.remove('meal-slot-insert-before', 'meal-slot-insert-after', 'drag-over');
}

/**
 * Handle mouse down on meal slot header to prevent dragging meal slot when clicking header
 */
function handleMealSlotHeaderMouseDown(event) {
    // Only prevent drag if clicking on the header itself, not on buttons or recipes
    if (event.target.tagName === 'BUTTON' || event.target.closest('.planned-recipe')) {
        return;
    }
    // Allow meal slot dragging from header
}

/**
 * Handle drag over for meal slot drop indicators
 */
function handleMealSlotDragOver(event) {
    const dragData = event.dataTransfer.types;
    
    // Allow both meal slot reordering and new meal type drops
    if (dragData.includes('application/x-meal-slot') || dragData.includes('application/x-meal-type')) {
        event.preventDefault();
        event.currentTarget.classList.add('drag-over');
    }
}

/**
 * Handle drag leave for meal slot drop indicators
 */
function handleMealSlotDragLeave(event) {
    event.currentTarget.classList.remove('drag-over');
}

/**
 * Handle meal slot reorder drop (or new meal type drop on indicator)
 */
function handleMealSlotReorder(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    
    // Check if this is a new meal type being added
    const mealType = event.dataTransfer.getData('application/x-meal-type');
    if (mealType) {
        handleDropIndicatorDropForNewMealType(event);
        return;
    }
    
    // Otherwise handle meal slot reordering
    const dragData = event.dataTransfer.getData('application/x-meal-slot');
    if (!dragData) return;
    
    const { date: sourceDate, mealType: sourceMealType } = JSON.parse(dragData);
    const targetDate = event.currentTarget.dataset.date;
    const insertPosition = parseInt(event.currentTarget.dataset.insertPosition);
    
    if (sourceDate !== targetDate) return; // Can only reorder within same day
    
    // Get current meal order
    const currentMeals = Object.keys(mealPlan[targetDate]).filter(meal => 
        mealPlan[targetDate][meal] && Array.isArray(mealPlan[targetDate][meal])
    );
    
    // Remove source meal from its current position
    const sourceIndex = currentMeals.indexOf(sourceMealType);
    if (sourceIndex === -1) return;
    
    currentMeals.splice(sourceIndex, 1);
    
    // Calculate new position (adjust if source was before target)
    let newPosition = insertPosition;
    if (sourceIndex < insertPosition) {
        newPosition = insertPosition - 1;
    }
    
    // Insert at new position
    currentMeals.splice(newPosition, 0, sourceMealType);
    
    // Rebuild mealPlan object in new order
    const reorderedMeals = {};
    const mealData = {};
    
    // Store all meal data
    for (const meal of Object.keys(mealPlan[targetDate])) {
        if (Array.isArray(mealPlan[targetDate][meal])) {
            mealData[meal] = mealPlan[targetDate][meal];
        }
    }
    
    // Rebuild in new order
    for (const meal of currentMeals) {
        reorderedMeals[meal] = mealData[meal];
    }
    
    mealPlan[targetDate] = reorderedMeals;
    
    saveMealPlan();
    updateDayPlanner();
    
    // Remove dragging class from all elements
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
}

/**
 * Handle drag start for recipes
 */
function handleRecipeDragStart(event) {
    // Make sure we're dragging a recipe, not clicking on a button
    if (event.target.tagName === 'BUTTON' || event.target.closest('.remove-meal')) {
        event.preventDefault();
        return false;
    }
    
    // Get recipe ID from the element being dragged
    let recipeId = event.currentTarget.dataset.recipeId;
    if (!recipeId) {
        // Try to get from closest recipe element
        const recipeElement = event.target.closest('.planned-recipe, .unplanned-recipe');
        if (recipeElement) {
            recipeId = recipeElement.dataset.recipeId;
        }
    }
    
    if (recipeId) {
        // Store modifier key state for duplicate detection
        const allowDuplicate = event.ctrlKey || event.metaKey;
        event.dataTransfer.setData('text/plain', recipeId);
        event.dataTransfer.setData('application/x-allow-duplicate', allowDuplicate ? 'true' : 'false');
        event.dataTransfer.effectAllowed = 'move';
        const recipeElement = event.currentTarget.classList.contains('planned-recipe') || event.currentTarget.classList.contains('unplanned-recipe') 
            ? event.currentTarget 
            : event.target.closest('.planned-recipe, .unplanned-recipe');
        if (recipeElement) {
            recipeElement.classList.add('dragging');
        }
    }
}

/**
 * Handle drag end for recipes
 */
function handleRecipeDragEnd(event) {
    // Remove dragging class from all recipe elements
    document.querySelectorAll('.planned-recipe.dragging').forEach(el => el.classList.remove('dragging'));
}

/**
 * Handle drag over for recipes on meal slot content area
 */
function handleRecipeDragOverMealSlot(event) {
    // Only handle recipe drops, not meal slot or meal type drops
    const types = event.dataTransfer.types;
    if (types.includes('application/x-meal-slot') || types.includes('application/x-meal-type')) {
        return;
    }
    
    // Only handle recipe drops
    if (!types.includes('text/plain')) {
        return;
    }
    
    event.preventDefault();
    event.stopPropagation(); // Stop event from bubbling to parent meal slot container
    event.currentTarget.classList.add('drag-over');
}

/**
 * Handle drag leave for recipes on meal slot content area
 */
function handleRecipeDragLeaveMealSlot(event) {
    event.currentTarget.classList.remove('drag-over');
}

/**
 * Handle drop for recipes on meal slot content area
 */
function handleRecipeDropOnMealSlot(event) {
    event.preventDefault();
    event.stopPropagation(); // Stop event from bubbling to parent meal slot container
    event.currentTarget.classList.remove('drag-over');
    
    // Check if this is a recipe drop
    const recipeIdStr = event.dataTransfer.getData('text/plain');
    if (!recipeIdStr) return;
    
    // Check if this is a meal slot reorder or meal type drop (shouldn't happen here, but just in case)
    if (event.dataTransfer.types.includes('application/x-meal-slot') || event.dataTransfer.types.includes('application/x-meal-type')) {
        return;
    }
    
    const recipeId = parseFloat(recipeIdStr);
    const date = event.currentTarget.dataset.date;
    const meal = event.currentTarget.dataset.meal;
    
    if (!date || !meal || !recipeId) return;
    
    // Remove from previous location if it exists
    for (const d in mealPlan) {
        for (const m in mealPlan[d]) {
            if (Array.isArray(mealPlan[d][m])) {
                const index = mealPlan[d][m].indexOf(recipeId);
                if (index > -1) {
                    mealPlan[d][m].splice(index, 1);
                }
            }
        }
    }
    
    // Add to new location
    if (!mealPlan[date][meal]) {
        mealPlan[date][meal] = [];
    }
    mealPlan[date][meal].push(recipeId);
    
    saveMealPlan();
    updateDayPlanner();
    
    // Remove dragging class from all elements
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
}

/**
 * Handle drag over (for recipes) - legacy function for other areas
 */
function handleDragOver(event) {
    // Only handle recipe drops, not meal slot or meal type drops
    if (event.dataTransfer.types.includes('application/x-meal-slot') || event.dataTransfer.types.includes('application/x-meal-type')) {
        return;
    }
    
    event.preventDefault();
    event.stopPropagation(); // Stop event from bubbling to parent meal slot container
    event.currentTarget.classList.add('drag-over');
}

/**
 * Handle drag leave
 */
function handleDragLeave(event) {
    event.currentTarget.classList.remove('drag-over');
}

/**
 * Handle drop on day (for meal types)
 */
function handleDayDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    
    const mealType = event.dataTransfer.getData('application/x-meal-type');
    const date = event.currentTarget.dataset.date;
    
    if (!date || !mealType) return;
    
    // Initialize day if needed
    if (!mealPlan[date]) {
        mealPlan[date] = {};
    }
    
    // Add meal type if it doesn't exist (appends to end)
    if (!mealPlan[date][mealType]) {
        mealPlan[date][mealType] = [];
        saveMealPlan();
        updateDayPlanner();
    }
    
    // Remove dragging class from all elements
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
}

/**
 * Handle drop on meal slot for adding new meal types
 */
function handleMealSlotDropForNewMealType(event) {
    // Only handle meal type drops (new meal types being added)
    if (!event.dataTransfer.types.includes('application/x-meal-type')) {
        return;
    }
    
    event.preventDefault();
    event.currentTarget.classList.remove('meal-slot-insert-before', 'meal-slot-insert-after');
    
    const mealType = event.dataTransfer.getData('application/x-meal-type');
    const date = event.currentTarget.dataset.date;
    const targetMealIndex = parseInt(event.currentTarget.dataset.mealIndex || '0');
    
    if (!date || !mealType) return;
    
    // Initialize day if needed
    if (!mealPlan[date]) {
        mealPlan[date] = {};
    }
    
    // Don't add if meal type already exists
    if (mealPlan[date][mealType]) {
        return;
    }
    
    // Determine insert position based on where we dropped (top half = before, bottom half = after)
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseY = event.clientY;
    const middleY = rect.top + rect.height / 2;
    
    let insertPosition = targetMealIndex;
    if (mouseY < middleY) {
        // Insert before this meal
        insertPosition = targetMealIndex;
    } else {
        // Insert after this meal
        insertPosition = targetMealIndex + 1;
    }
    
    // Get current meal order
    const currentMeals = Object.keys(mealPlan[date]).filter(meal => 
        mealPlan[date][meal] && Array.isArray(mealPlan[date][meal])
    );
    
    // Insert at new position
    currentMeals.splice(insertPosition, 0, mealType);
    
    // Rebuild mealPlan object in new order
    const reorderedMeals = {};
    const mealData = {};
    
    // Store all existing meal data
    for (const meal of Object.keys(mealPlan[date])) {
        if (Array.isArray(mealPlan[date][meal])) {
            mealData[meal] = mealPlan[date][meal];
        }
    }
    
    // Add new meal type
    mealData[mealType] = [];
    
    // Rebuild in new order
    for (const meal of currentMeals) {
        reorderedMeals[meal] = mealData[meal];
    }
    
    mealPlan[date] = reorderedMeals;
    
    saveMealPlan();
    updateDayPlanner();
    
    // Remove dragging class from all elements
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
}

/**
 * Handle drop on drop indicator for adding new meal types
 */
function handleDropIndicatorDropForNewMealType(event) {
    // Only handle meal type drops (new meal types being added)
    if (!event.dataTransfer.types.includes('application/x-meal-type')) {
        return;
    }
    
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    
    const mealType = event.dataTransfer.getData('application/x-meal-type');
    const date = event.currentTarget.dataset.date;
    const insertPosition = parseInt(event.currentTarget.dataset.insertPosition || '0');
    
    if (!date || !mealType) return;
    
    // Initialize day if needed
    if (!mealPlan[date]) {
        mealPlan[date] = {};
    }
    
    // Don't add if meal type already exists
    if (mealPlan[date][mealType]) {
        return;
    }
    
    // Get current meal order
    const currentMeals = Object.keys(mealPlan[date]).filter(meal => 
        mealPlan[date][meal] && Array.isArray(mealPlan[date][meal])
    );
    
    // Insert at specified position
    currentMeals.splice(insertPosition, 0, mealType);
    
    // Rebuild mealPlan object in new order
    const reorderedMeals = {};
    const mealData = {};
    
    // Store all existing meal data
    for (const meal of Object.keys(mealPlan[date])) {
        if (Array.isArray(mealPlan[date][meal])) {
            mealData[meal] = mealPlan[date][meal];
        }
    }
    
    // Add new meal type
    mealData[mealType] = [];
    
    // Rebuild in new order
    for (const meal of currentMeals) {
        reorderedMeals[meal] = mealData[meal];
    }
    
    mealPlan[date] = reorderedMeals;
    
    saveMealPlan();
    updateDayPlanner();
    
    // Remove dragging class from all elements
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
}

/**
 * Handle drop (for recipes)
 */
function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation(); // Stop event from bubbling to parent meal slot container
    event.currentTarget.classList.remove('drag-over');
    
    // Check if this is a recipe drop
    const recipeIdStr = event.dataTransfer.getData('text/plain');
    if (!recipeIdStr) return;
    
    // Check if this is a meal slot reorder or meal type drop (shouldn't happen here, but just in case)
    if (event.dataTransfer.types.includes('application/x-meal-slot') || event.dataTransfer.types.includes('application/x-meal-type')) {
        return;
    }
    
    const recipeId = parseFloat(recipeIdStr);
    const date = event.currentTarget.dataset.date;
    const meal = event.currentTarget.dataset.meal;
    
    if (!date || !meal || !recipeId) return;
    
    // Remove from previous location if it exists
    for (const d in mealPlan) {
        for (const m in mealPlan[d]) {
            if (Array.isArray(mealPlan[d][m])) {
                const index = mealPlan[d][m].indexOf(recipeId);
                if (index > -1) {
                    mealPlan[d][m].splice(index, 1);
                }
            }
        }
    }
    
    // Add to new location
    if (!mealPlan[date][meal]) {
        mealPlan[date][meal] = [];
    }
    mealPlan[date][meal].push(recipeId);
    
    saveMealPlan();
    updateDayPlanner();
    
    // Remove dragging class from all elements
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
}

/**
 * Remove recipe from meal
 */
function removeRecipeFromMeal(date, meal, recipeId) {
    if (!mealPlan[date] || !mealPlan[date][meal]) return;
    
    const index = mealPlan[date][meal].indexOf(recipeId);
    if (index > -1) {
        mealPlan[date][meal].splice(index, 1);
        
        // Remove note for this instance
        const noteKey = `${date}_${meal}_${recipeId}_${index}`;
        if (mealPlanNotes[date] && mealPlanNotes[date][meal] && mealPlanNotes[date][meal][noteKey]) {
            delete mealPlanNotes[date][meal][noteKey];
        }
        
        // Reindex notes for remaining instances of this recipe in this meal
        reindexRecipeNotes(date, meal, recipeId);
        
        saveMealPlan();
        updateDayPlanner();
    }
}

/**
 * Reindex notes after removing a recipe instance
 */
function reindexRecipeNotes(date, meal, recipeId) {
    if (!mealPlanNotes[date] || !mealPlanNotes[date][meal]) return;
    
    const recipeIndices = [];
    mealPlan[date][meal].forEach((id, idx) => {
        if (id === recipeId) {
            recipeIndices.push(idx);
        }
    });
    
    // Collect all notes for this recipe in this meal
    const notes = {};
    for (const key in mealPlanNotes[date][meal]) {
        if (key.startsWith(`${date}_${meal}_${recipeId}_`)) {
            const oldIndex = parseInt(key.split('_').pop());
            notes[oldIndex] = mealPlanNotes[date][meal][key];
            delete mealPlanNotes[date][meal][key];
        }
    }
    
    // Reassign notes to new indices
    recipeIndices.forEach((newIndex, arrayPos) => {
        const oldIndex = Object.keys(notes).map(Number).sort((a, b) => a - b)[arrayPos];
        if (oldIndex !== undefined && notes[oldIndex] !== undefined) {
            const newKey = `${date}_${meal}_${recipeId}_${newIndex}`;
            mealPlanNotes[date][meal][newKey] = notes[oldIndex];
        }
    });
}

/**
 * Remove meal slot from day
 */
function removeMealSlotFromDay(date, mealType) {
    if (!mealPlan[date] || !mealPlan[date][mealType]) return;
    
    delete mealPlan[date][mealType];
    saveMealPlan();
    updateDayPlanner();
}

/**
 * Export meal plan to JSON
 */
function exportMealPlan() {
    if (selectedDays.size === 0) {
        showMessage('No meal plan to export', 'error');
        return;
    }
    
    // Default filename
    const defaultFilename = `meal-plan-${new Date().toISOString().split('T')[0]}.json`;
    
    // Prompt user for filename
    const filename = prompt('Enter filename for export:', defaultFilename);
    
    // If user cancelled, don't export
    if (filename === null) {
        return;
    }
    
    // Validate filename (remove invalid characters, ensure .json extension)
    let cleanFilename = filename.trim();
    if (!cleanFilename) {
        cleanFilename = defaultFilename;
    }
    
    // Remove invalid filename characters
    cleanFilename = cleanFilename.replace(/[<>:"/\\|?*]/g, '');
    
    // Ensure .json extension
    if (!cleanFilename.toLowerCase().endsWith('.json')) {
        cleanFilename += '.json';
    }
    
    try {
        // Include recipe names for matching across environments
        const recipeNamesById = {};
        recipes.forEach(recipe => {
            recipeNamesById[recipe.id] = recipe.name;
        });
        
        const exportData = {
            mealPlan: mealPlan,
            mealPlanNotes: mealPlanNotes,
            selectedDays: Array.from(selectedDays),
            activeRecipeIds: Array.from(activeRecipeIds),
            recipeMultipliers: recipeMultipliers,
            recipeNamesById: recipeNamesById, // Include recipe names for matching
            exportDate: new Date().toISOString()
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = cleanFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showMessage(`Exported meal plan as ${cleanFilename}`, 'success');
    } catch (error) {
        console.error('Error exporting meal plan:', error);
        showMessage('Error exporting meal plan', 'error');
    }
}

/**
 * Export meal plan in printable format
 */
function exportMealPlanPrintable() {
    if (selectedDays.size === 0) {
        showMessage('No meal plan to export', 'error');
        return;
    }
    
    // Sort days chronologically
    const sortedDays = Array.from(selectedDays).sort();
    
    let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Meal Plan</title>
    <style>
        body {
            font-family: 'Poppins', Arial, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            color: #2c2c2c;
        }
        h1 {
            color: #d48247;
            border-bottom: 3px solid #d48247;
            padding-bottom: 10px;
            margin-bottom: 30px;
        }
        .day-section {
            margin-bottom: 40px;
            page-break-inside: avoid;
        }
        .day-header {
            font-size: 24px;
            font-weight: 600;
            color: #2c2c2c;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e8e8e8;
        }
        .meal-section {
            margin-bottom: 25px;
        }
        .meal-title {
            font-size: 18px;
            font-weight: 600;
            color: #d48247;
            margin-bottom: 10px;
        }
        .recipe-item {
            margin-bottom: 8px;
            padding: 8px;
            background: #f8f6f2;
            border-left: 3px solid #d48247;
            padding-left: 12px;
        }
        .recipe-name {
            font-weight: 600;
            color: #2c2c2c;
        }
        .recipe-note {
            font-size: 14px;
            color: #6a6a6a;
            font-style: italic;
            margin-top: 4px;
        }
        .empty-meal {
            color: #999;
            font-style: italic;
            padding: 8px;
        }
        @media print {
            body {
                padding: 10px;
            }
            .day-section {
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <h1>Meal Plan</h1>
`;
    
    for (const date of sortedDays) {
        if (!mealPlan[date]) continue;
        
        html += `    <div class="day-section">\n`;
        html += `        <div class="day-header">${formatDate(date)}</div>\n`;
        
        // Get all meal types for this day
        const mealTypes = Object.keys(mealPlan[date]).filter(meal => 
            mealPlan[date][meal] && Array.isArray(mealPlan[date][meal])
        );
        
        if (mealTypes.length === 0) {
            html += `        <div class="empty-meal">No meals planned</div>\n`;
        } else {
            for (const meal of mealTypes) {
                const recipeIds = mealPlan[date][meal];
                html += `        <div class="meal-section">\n`;
                html += `            <div class="meal-title">${capitalizeMealType(meal)}</div>\n`;
                
                if (recipeIds.length === 0) {
                    html += `            <div class="empty-meal">No recipes</div>\n`;
                } else {
                    recipeIds.forEach((recipeId, index) => {
                        const recipe = recipes.find(r => r.id === recipeId);
                        if (recipe) {
                            const note = getRecipeNote(date, meal, recipeId, index);
                            html += `            <div class="recipe-item">\n`;
                            html += `                <div class="recipe-name">${escapeHtml(recipe.name)}</div>\n`;
                            if (note) {
                                html += `                <div class="recipe-note">Note: ${escapeHtml(note)}</div>\n`;
                            }
                            html += `            </div>\n`;
                        }
                    });
                }
                
                html += `        </div>\n`;
            }
        }
        
        html += `    </div>\n`;
    }
    
    html += `</body>\n</html>`;
    
    // Create blob and download
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `meal-plan-${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showMessage('Meal plan exported for printing', 'success');
}

/**
 * Export meal plan in visual format (matching website layout)
 */
function exportMealPlanVisual() {
    if (selectedDays.size === 0) {
        showMessage('No meal plan to export', 'error');
        return;
    }
    
    // Sort days chronologically
    const sortedDays = Array.from(selectedDays).sort();
    
    let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Meal Plan - Visual Layout</title>
    <style>
        * {
            box-sizing: border-box;
        }
        body {
            font-family: 'Poppins', Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
            color: #2c2c2c;
        }
        h1 {
            color: #d48247;
            text-align: center;
            margin-bottom: 30px;
            font-size: 32px;
        }
        .days-container {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            justify-content: flex-start;
        }
        .day-card {
            background: white;
            border: 2px solid #e8e8e8;
            border-radius: 8px;
            padding: 20px;
            min-width: 300px;
            max-width: 350px;
            flex: 1 1 300px;
            page-break-inside: avoid;
        }
        .day-header {
            font-size: 20px;
            font-weight: 600;
            color: #2c2c2c;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e8e8e8;
        }
        .meal-slot-print {
            min-height: 60px;
            padding: 12px;
            background: #f8f6f2;
            border-radius: 6px;
            border: 2px solid #d48247;
            margin-bottom: 15px;
        }
        .meal-slot-label-print {
            font-size: 14px;
            font-weight: 600;
            color: #d48247;
            margin-bottom: 8px;
        }
        .recipe-item-print {
            background: white;
            padding: 8px 12px;
            border-radius: 4px;
            border: 1px solid #d48247;
            margin-bottom: 6px;
            font-size: 14px;
        }
        .recipe-name-print {
            font-weight: 600;
            color: #2c2c2c;
        }
        .recipe-note-print {
            font-size: 12px;
            color: #6a6a6a;
            font-style: italic;
            margin-top: 4px;
            padding-left: 8px;
        }
        .empty-meal-print {
            color: #999;
            font-style: italic;
            font-size: 13px;
            text-align: center;
            padding: 10px;
        }
        @media print {
            body {
                background: white;
                padding: 10px;
            }
            .day-card {
                page-break-inside: avoid;
                break-inside: avoid;
            }
            .days-container {
                gap: 15px;
            }
        }
    </style>
</head>
<body>
    <h1>Meal Plan</h1>
    <div class="days-container">
`;
    
    for (const date of sortedDays) {
        if (!mealPlan[date]) continue;
        
        html += `        <div class="day-card">\n`;
        html += `            <div class="day-header">${formatDate(date)}</div>\n`;
        
        // Get all meal types for this day, sorted by typical order
        const mealOrder = ['prep', 'breakfast', 'lunch', 'dinner', 'late-night'];
        const mealTypes = Object.keys(mealPlan[date]).filter(meal => 
            mealPlan[date][meal] && Array.isArray(mealPlan[date][meal])
        ).sort((a, b) => {
            const indexA = mealOrder.indexOf(a);
            const indexB = mealOrder.indexOf(b);
            if (indexA === -1 && indexB === -1) return a.localeCompare(b);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });
        
        if (mealTypes.length === 0) {
            html += `            <div class="meal-slot-print">\n`;
            html += `                <div class="empty-meal-print">No meals planned</div>\n`;
            html += `            </div>\n`;
        } else {
            for (const meal of mealTypes) {
                const recipeIds = mealPlan[date][meal];
                html += `            <div class="meal-slot-print">\n`;
                html += `                <div class="meal-slot-label-print">${capitalizeMealType(meal)}</div>\n`;
                
                if (recipeIds.length === 0) {
                    html += `                <div class="empty-meal-print">No recipes</div>\n`;
                } else {
                    recipeIds.forEach((recipeId, index) => {
                        const recipe = recipes.find(r => r.id === recipeId);
                        if (recipe) {
                            const note = getRecipeNote(date, meal, recipeId, index);
                            html += `                <div class="recipe-item-print">\n`;
                            html += `                    <div class="recipe-name-print">${escapeHtml(recipe.name)}</div>\n`;
                            if (note) {
                                html += `                    <div class="recipe-note-print">📝 ${escapeHtml(note)}</div>\n`;
                            }
                            html += `                </div>\n`;
                        }
                    });
                }
                
                html += `            </div>\n`;
            }
        }
        
        html += `        </div>\n`;
    }
    
    html += `    </div>\n</body>\n</html>`;
    
    // Create blob and download
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `meal-plan-visual-${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showMessage('Visual meal plan exported for printing', 'success');
}

/**
 * Import meal plan from JSON
 */
function importMealPlan(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        // Parse JSON immediately (this is fast)
        let importData;
        try {
            importData = JSON.parse(e.target.result);
        } catch (error) {
            console.error('Error parsing JSON:', error);
            showMessage(`Error parsing meal plan file: ${error.message}`, 'error');
            return;
        }
        
        // Debug: log what we're importing (lightweight operation)
        console.log('=== MEAL PLAN IMPORT ===');
        console.log('Has mealPlan:', !!importData.mealPlan);
        console.log('Has mealPlanNotes:', !!importData.mealPlanNotes);
        console.log('Has selectedDays:', !!importData.selectedDays);
        console.log('Has activeRecipeIds:', !!importData.activeRecipeIds);
        console.log('Has recipeMultipliers:', !!importData.recipeMultipliers);
        
        // Validate import data
        if (!importData.mealPlan) {
            console.error('❌ Invalid meal plan file format - missing mealPlan property');
            console.error('Available properties:', Object.keys(importData));
            showMessage('Invalid meal plan file format - missing meal plan data', 'error');
            return;
        }
        
        // Ask user if they want to replace or merge (this blocks, but that's expected)
        const replace = confirm('Replace existing meal plan with imported one?\n\nClick OK to replace, Cancel to merge.');
        
        // Process in chunks to avoid blocking
        function processImport() {
            try {
                // First, create a mapping of recipe IDs from import to current recipes
                // Try to match by ID first, then by name
                const recipeIdMap = new Map(); // oldId -> newId
                const recipeNameMap = new Map(); // name -> recipe (for lookup)
                
                // Build name map for current recipes
                recipes.forEach(recipe => {
                    recipeNameMap.set(recipe.name.toLowerCase(), recipe);
                });
                
                // Try to match imported recipe IDs to current recipes
                // Collect all recipe IDs from the imported meal plan
                const importedRecipeIds = new Set();
                for (const date in importData.mealPlan) {
                    for (const meal in importData.mealPlan[date]) {
                        if (Array.isArray(importData.mealPlan[date][meal])) {
                            importData.mealPlan[date][meal].forEach(id => importedRecipeIds.add(id));
                        }
                    }
                }
                
                // Also check activeRecipeIds if present
                if (importData.activeRecipeIds && Array.isArray(importData.activeRecipeIds)) {
                    importData.activeRecipeIds.forEach(id => importedRecipeIds.add(id));
                }
                
                // Try to match each imported recipe ID
                const missingRecipeIds = [];
                const matchedByName = [];
                
                // If export includes recipe names, use them for matching
                const hasRecipeNames = importData.recipeNamesById && typeof importData.recipeNamesById === 'object';
                
                importedRecipeIds.forEach(oldId => {
                    const numId = parseFloat(oldId);
                    if (isNaN(numId)) return;
                    
                    // First try: match by ID
                    const recipe = recipes.find(r => r.id === numId);
                    if (recipe) {
                        recipeIdMap.set(oldId, numId); // ID matches
                    } else if (hasRecipeNames) {
                        // Second try: match by name from export
                        const exportedName = importData.recipeNamesById[oldId];
                        if (exportedName) {
                            const matchedRecipe = recipes.find(r => 
                                r.name.toLowerCase() === exportedName.toLowerCase()
                            );
                            if (matchedRecipe) {
                                recipeIdMap.set(oldId, matchedRecipe.id); // Map old ID to new ID
                                matchedByName.push({ oldName: exportedName, newId: matchedRecipe.id });
                            } else {
                                missingRecipeIds.push({ id: oldId, name: exportedName });
                            }
                        } else {
                            missingRecipeIds.push({ id: oldId, name: 'Unknown' });
                        }
                    } else {
                        // No recipe names in export, can't match by name
                        missingRecipeIds.push({ id: oldId, name: 'Unknown' });
                    }
                });
                
                if (matchedByName.length > 0) {
                    console.log(`Matched ${matchedByName.length} recipes by name:`, matchedByName);
                }
                
                if (missingRecipeIds.length > 0) {
                    const missingNames = missingRecipeIds.map(m => m.name).filter(n => n !== 'Unknown');
                    console.warn('Some recipes from meal plan are not available:', missingNames);
                }
                
                if (replace) {
                    // Use structuredClone if available, otherwise shallow copy
                    if (typeof structuredClone !== 'undefined') {
                        mealPlan = structuredClone(importData.mealPlan);
                        mealPlanNotes = importData.mealPlanNotes ? structuredClone(importData.mealPlanNotes) : {};
                    } else {
                        mealPlan = Object.assign({}, importData.mealPlan);
                        mealPlanNotes = importData.mealPlanNotes ? Object.assign({}, importData.mealPlanNotes) : {};
                    }
                    selectedDays = new Set(importData.selectedDays || []);
                    
                    // Remap recipe IDs in meal plan to match current recipes
                    remapRecipeIds(recipeIdMap, missingRecipeIds);
                    
                    // Active recipes and multipliers will be handled by remapRecipeIds
                } else {
                    // Merge: combine meal plans - process in chunks
                    const dates = Object.keys(importData.mealPlan);
                    let dateIndex = 0;
                    
                    function processDateChunk() {
                        const startTime = performance.now();
                        const chunkSize = 5; // Process 5 dates at a time
                        
                        while (dateIndex < dates.length && (performance.now() - startTime) < 10) {
                            const date = dates[dateIndex];
                            if (!mealPlan[date]) {
                                mealPlan[date] = {};
                            }
                            for (const meal in importData.mealPlan[date]) {
                                if (!mealPlan[date][meal]) {
                                    mealPlan[date][meal] = [];
                                }
                                const existingIds = new Set(mealPlan[date][meal]);
                                importData.mealPlan[date][meal].forEach(recipeId => {
                                    if (!existingIds.has(recipeId)) {
                                        mealPlan[date][meal].push(recipeId);
                                    }
                                });
                            }
                            dateIndex++;
                        }
                        
                        if (dateIndex < dates.length) {
                            // More dates to process, continue in next chunk
                            setTimeout(processDateChunk, 0);
                        } else {
                            // Finished processing dates, continue with notes
                            processNotes();
                        }
                    }
                    
                    function processNotes() {
                        // Merge notes
                        const noteDates = Object.keys(importData.mealPlanNotes || {});
                        for (const date of noteDates) {
                            if (!mealPlanNotes[date]) {
                                mealPlanNotes[date] = {};
                            }
                            for (const meal in importData.mealPlanNotes[date]) {
                                if (!mealPlanNotes[date][meal]) {
                                    mealPlanNotes[date][meal] = {};
                                }
                                Object.assign(mealPlanNotes[date][meal], importData.mealPlanNotes[date][meal]);
                            }
                        }
                        
                        // Merge selected days
                        importData.selectedDays?.forEach(day => selectedDays.add(day));
                        
                        // Active recipes and multipliers will be handled by remapRecipeIds
                        // Convert IDs and finish
                        remapRecipeIds(recipeIdMap, missingRecipeIds);
                        convertIds();
                    }
                    
                    processDateChunk();
                    return; // Exit early, convertIds will be called from processNotes
                }
                
                // Remap recipe IDs to match current recipes
                remapRecipeIds(recipeIdMap, missingRecipeIds);
                
                // Convert recipe IDs back to numbers
                convertIds();
            } catch (error) {
                console.error('Error importing meal plan:', error);
                console.error('Error details:', {
                    message: error.message,
                    stack: error.stack
                });
                showMessage(`Error importing meal plan: ${error.message}. Check console for details.`, 'error');
            }
        }
        
        function convertIds() {
            // Convert IDs in chunks
            const dates = Object.keys(mealPlan);
            let dateIndex = 0;
            
            function convertChunk() {
                const startTime = performance.now();
                const chunkSize = 10; // Process 10 dates at a time
                
                while (dateIndex < dates.length && (performance.now() - startTime) < 10) {
                    const date = dates[dateIndex];
                    for (const meal in mealPlan[date]) {
                        mealPlan[date][meal] = mealPlan[date][meal].map(id => parseFloat(id));
                    }
                    dateIndex++;
                }
                
                if (dateIndex < dates.length) {
                    setTimeout(convertChunk, 0);
                } else {
                    // All done, save and update UI
                    finishImport();
                }
            }
            
            convertChunk();
        }
        
        // Helper function to remap recipe IDs
        function remapRecipeIds(recipeIdMap, missingRecipeIds) {
            // Remap recipe IDs in meal plan using the mapping
            for (const date in mealPlan) {
                for (const meal in mealPlan[date]) {
                    if (Array.isArray(mealPlan[date][meal])) {
                        mealPlan[date][meal] = mealPlan[date][meal].map(oldId => {
                            // Try to find mapped ID
                            if (recipeIdMap.has(oldId)) {
                                return recipeIdMap.get(oldId);
                            }
                            // Otherwise, try to find by current ID
                            const numId = parseFloat(oldId);
                            if (!isNaN(numId) && recipes.some(r => r.id === numId)) {
                                return numId;
                            }
                            // Not found, return null to filter out
                            return null;
                        }).filter(id => id !== null);
                    }
                }
            }
            
            // Also remap notes - need to update note keys with new recipe IDs
            const remappedNotes = {};
            for (const date in mealPlanNotes) {
                remappedNotes[date] = {};
                for (const meal in mealPlanNotes[date]) {
                    remappedNotes[date][meal] = {};
                    for (const noteKey in mealPlanNotes[date][meal]) {
                        // Note keys are in format: date_meal_recipeId_index
                        const parts = noteKey.split('_');
                        if (parts.length >= 4) {
                            const oldRecipeId = parts.slice(2, -1).join('_'); // Get recipe ID part (might have underscores)
                            const index = parts[parts.length - 1];
                            
                            // Try to find mapped ID
                            let newRecipeId = oldRecipeId;
                            if (recipeIdMap.has(oldRecipeId)) {
                                newRecipeId = recipeIdMap.get(oldRecipeId);
                            } else {
                                const numId = parseFloat(oldRecipeId);
                                if (!isNaN(numId) && recipes.some(r => r.id === numId)) {
                                    newRecipeId = numId;
                                } else {
                                    // Skip this note - recipe not found
                                    continue;
                                }
                            }
                            
                            const newNoteKey = `${date}_${meal}_${newRecipeId}_${index}`;
                            remappedNotes[date][meal][newNoteKey] = mealPlanNotes[date][meal][noteKey];
                        }
                    }
                }
            }
            mealPlanNotes = remappedNotes;
            
            // Also remap activeRecipeIds using the mapping
            if (importData.activeRecipeIds && Array.isArray(importData.activeRecipeIds)) {
                const remappedActiveIds = importData.activeRecipeIds.map(oldId => {
                    if (recipeIdMap.has(oldId)) {
                        return recipeIdMap.get(oldId);
                    }
                    const numId = parseFloat(oldId);
                    if (!isNaN(numId) && recipes.some(r => r.id === numId)) {
                        return numId;
                    }
                    return null;
                }).filter(id => id !== null);
                
                if (replace) {
                    activeRecipeIds = new Set(remappedActiveIds);
                } else {
                    // Merge: add remapped IDs
                    remappedActiveIds.forEach(id => activeRecipeIds.add(id));
                }
            }
            
            // Remap multipliers using the mapping
            if (importData.recipeMultipliers && typeof importData.recipeMultipliers === 'object') {
                if (replace) {
                    recipeMultipliers = {};
                }
                for (const oldId in importData.recipeMultipliers) {
                    let newId = oldId;
                    if (recipeIdMap.has(oldId)) {
                        newId = recipeIdMap.get(oldId);
                    } else {
                        const numId = parseFloat(oldId);
                        if (isNaN(numId) || !recipes.some(r => r.id === numId)) {
                            continue; // Skip this multiplier - recipe not found
                        }
                        newId = numId;
                    }
                    recipeMultipliers[newId] = importData.recipeMultipliers[oldId];
                }
            }
            
            // Warn user about missing recipes
            if (missingRecipeIds.length > 0) {
                const missingNames = missingRecipeIds
                    .map(m => m.name)
                    .filter(n => n !== 'Unknown')
                    .slice(0, 5); // Show first 5 names
                const missingCount = missingRecipeIds.length;
                const namesText = missingNames.length > 0 
                    ? ` (${missingNames.join(', ')}${missingCount > 5 ? '...' : ''})`
                    : '';
                showMessage(
                    `Meal plan imported, but ${missingCount} recipe${missingCount !== 1 ? 's' : ''} from the meal plan are not available in your current recipe list${namesText}. Make sure you have the same recipes loaded.`,
                    'warning'
                );
            }
        }
        
        function finishImport() {
            // Save all imported data
            saveMealPlan();
            saveActiveRecipes();
            saveRecipeMultipliers();
            
            // Update UI
            requestAnimationFrame(function() {
                updateRecipeList();
                updateShoppingList();
                updateDayPlanner();
                showMessage('Meal plan imported successfully', 'success');
            });
        }
        
        // Start processing asynchronously
        setTimeout(processImport, 0);
    };
    
    reader.readAsText(file);
    event.target.value = ''; // Reset file input
}

/**
 * Clear meal plan
 */
function clearMealPlan() {
    if (confirm('Clear entire meal plan? This cannot be undone.')) {
        mealPlan = {};
        mealPlanNotes = {};
        selectedDays.clear();
        saveMealPlan();
        updateDayPlanner();
        showMessage('Meal plan cleared', 'success');
    }
}

/**
 * Update the shopping list display
 */
function updateShoppingList() {
    const card = document.getElementById('shoppingListCard');
    const list = document.getElementById('shoppingList');
    
    // Only show shopping list if there are active recipes with ingredients
    if (activeRecipeIds.size === 0 || Object.keys(consolidatedIngredients).length === 0) {
        card.style.display = 'none';
        return;
    }
    
    card.style.display = 'block';
    list.innerHTML = '';
    
    // Get all ingredients
    let sortedIngredients = Object.values(consolidatedIngredients);
    
    if (sortedIngredients.length === 0) {
        list.innerHTML = '<div class="empty-state"><i class="fas fa-shopping-cart"></i><p>No ingredients to consolidate yet. Check some recipes above.</p></div>';
        return;
    }
    
    // Sort based on selected order
    if (shoppingListSortOrder === 'alphabetical') {
        sortedIngredients = sortedIngredients.sort((a, b) => {
            const nameA = (a.originalName || a.name || '').toLowerCase();
            const nameB = (b.originalName || b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
    } else if (shoppingListSortOrder === 'category') {
        // Sort by category, then alphabetically within category
        sortedIngredients = sortedIngredients.map(item => ({
            ...item,
            category: getIngredientCategory(item.originalName || item.name)
        })).sort((a, b) => {
            // First sort by category
            const catA = a.category;
            const catB = b.category;
            if (catA !== catB) {
                return catA.localeCompare(catB);
            }
            // Then alphabetically within category
            const nameA = (a.originalName || a.name || '').toLowerCase();
            const nameB = (b.originalName || b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
    }
    
    // Group by category if category sort is selected
    if (shoppingListSortOrder === 'category') {
        const categories = {};
        
        for (const item of sortedIngredients) {
            const category = item.category || 'Other';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(item);
        }
        
        // Display by category - ensure 'Other' only appears once
        const categoryKeys = Object.keys(INGREDIENT_CATEGORIES);
        const categoryOrder = categoryKeys.includes('Other') ? categoryKeys : categoryKeys.concat(['Other']);
        for (const category of categoryOrder) {
            if (categories[category] && categories[category].length > 0) {
                // Category header
                const categoryHeader = document.createElement('div');
                categoryHeader.className = 'shopping-category-header';
                categoryHeader.style.cssText = 'font-size: 18px; font-weight: 600; color: #2c2c2c; margin-top: 20px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px solid #e8e8e8;';
                categoryHeader.textContent = category;
                list.appendChild(categoryHeader);
                
                // Items in category
                for (const item of categories[category]) {
                    renderShoppingListItem(list, item);
                }
            }
        }
    } else {
        // Alphabetical - just display all items
        for (const item of sortedIngredients) {
            renderShoppingListItem(list, item);
        }
    }
}

/**
 * Render a single shopping list item
 */
function renderShoppingListItem(list, item) {
    const shoppingItem = document.createElement('div');
    shoppingItem.className = 'shopping-item';
    
    let quantityDisplay = '';
    
    // If we have a single display quantity and unit, use it
    if (item.displayQuantity !== undefined && item.displayUnit !== undefined) {
        // Format the quantity nicely (converts decimals to fractions when appropriate)
        let displayQty = formatQuantity(item.displayQuantity);
        
        // For imperial volume, add fl oz in parentheses
        if (unitSystem === 'imperial' && item.displayUnitType === 'volume' && item.flOz !== null && item.flOz !== undefined) {
            const flOzDisplay = formatQuantity(item.flOz);
            quantityDisplay = `${displayQty} ${item.displayUnit || ''} (${flOzDisplay} fl oz)`.trim();
        } else {
            quantityDisplay = `${displayQty} ${item.displayUnit || ''}`.trim();
        }
    } 
    // If we have grouped quantities (different units), show them all
    else if (item.groupedQuantities && item.groupedQuantities.length > 0) {
        const parts = item.groupedQuantities.map(gq => {
            let qty = formatQuantity(gq.displayQuantity);
            let part = `${qty} ${gq.displayUnit || ''}`.trim();
            
            // For imperial volume, add fl oz in parentheses if available
            if (unitSystem === 'imperial' && gq.unitType === 'volume' && gq.flOz !== null && gq.flOz !== undefined) {
                const flOzDisplay = formatQuantity(gq.flOz);
                part = `${part} (${flOzDisplay} fl oz)`;
            }
            
            return part;
        });
        quantityDisplay = parts.join(' + ');
    }
    // Fallback: convert to preferred system
    else {
        let totalBase = 0;
        let unitType = null;
        for (const q of item.quantities) {
            if (q.unitType !== 'count') {
                const base = convertToBaseUnit(q.originalQuantity || q.value, q.originalUnit || q.unit, q.unitType);
                totalBase += base.value;
                if (!unitType) unitType = q.unitType;
            }
        }
        if (unitType && totalBase > 0) {
            const converted = convertToPreferredUnitSystem(totalBase, unitType);
            let displayQty = converted.displayQuantity;
            // For imperial volume, add fl oz in parentheses
            if (unitSystem === 'imperial' && unitType === 'volume' && converted.flOz !== null && converted.flOz !== undefined) {
                const flOzDisplay = formatQuantity(converted.flOz);
                quantityDisplay = `${displayQty} ${converted.displayUnit} (${flOzDisplay} fl oz)`;
            } else {
                quantityDisplay = `${displayQty} ${converted.displayUnit}`;
            }
        } else {
            quantityDisplay = item.quantities.map(q => {
                const qty = formatQuantity(q.originalQuantity || q.value);
                return `${qty} ${q.originalUnit || q.unit || ''}`;
            }).join(' + ');
        }
    }
    
    const uniqueSources = [...new Set(item.sources)];
    shoppingItem.innerHTML = `
        <div>
            <div class="shopping-item-name">${item.originalName || item.name}</div>
            <div class="shopping-item-quantity">${quantityDisplay}</div>
            ${uniqueSources.length > 0 ? `<div class="shopping-item-sources">From: ${uniqueSources.join(', ')}</div>` : ''}
        </div>
    `;
    list.appendChild(shoppingItem);
}

/**
 * Remove a recipe
 */
function removeRecipe(recipeId) {
    recipes = recipes.filter(r => r.id !== recipeId);
    activeRecipeIds.delete(recipeId);
    delete recipeMultipliers[recipeId];
    
    // Save to localStorage
    saveRecipes();
    saveActiveRecipes();
    saveRecipeMultipliers();
    
    consolidateIngredients();
    updateRecipeList();
    updateShoppingList();
    updateDayPlanner();
    showMessage('Recipe removed', 'success');
}

/**
 * Export recipes to JSON file
 */
function exportRecipes() {
    if (recipes.length === 0) {
        showMessage('No recipes to export', 'error');
        return;
    }
    
    // Default filename
    const defaultFilename = `recipe-book-${new Date().toISOString().split('T')[0]}.json`;
    
    // Prompt user for filename
    const filename = prompt('Enter filename for export:', defaultFilename);
    
    // If user cancelled, don't export
    if (filename === null) {
        return;
    }
    
    // Validate filename (remove invalid characters, ensure .json extension)
    let cleanFilename = filename.trim();
    if (!cleanFilename) {
        cleanFilename = defaultFilename;
    }
    
    // Remove invalid filename characters
    cleanFilename = cleanFilename.replace(/[<>:"/\\|?*]/g, '');
    
    // Ensure .json extension
    if (!cleanFilename.toLowerCase().endsWith('.json')) {
        cleanFilename += '.json';
    }
    
    try {
        const dataStr = JSON.stringify(recipes, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = cleanFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showMessage(`Exported ${recipes.length} recipe${recipes.length !== 1 ? 's' : ''} as ${cleanFilename}`, 'success');
    } catch (error) {
        console.error('Error exporting recipes:', error);
        showMessage('Error exporting recipes', 'error');
    }
}

/**
 * Open an email draft so a user can send their recipes JSON to the tool creator
 */
function emailRecipesToCreator() {
    if (recipes.length === 0) {
        showMessage('No recipes to email', 'error');
        return;
    }

    try {
        const dataStr = JSON.stringify(recipes, null, 2);
        const subject = encodeURIComponent('Recipe Consolidator export');
        const bodyIntro = 'Here are my recipes from the Recipe Consolidator tool:\n\n';
        const body = encodeURIComponent(bodyIntro + dataStr);

        // TODO: replace with your preferred email address
        const toAddress = 'you@example.com';

        window.location.href = `mailto:${toAddress}?subject=${subject}&body=${body}`;
        showMessage('Opening your email client with recipes attached in the body.', 'success');
    } catch (error) {
        console.error('Error preparing email export:', error);
        showMessage('Error preparing recipes for email', 'error');
    }
}

/**
 * Load preloaded recipes from WholeFoods.json
 */
async function loadPreloadedRecipes() {
    try {
        const response = await fetch('WholeFoods.json');
        if (!response.ok) {
            showMessage('Could not load preloaded recipes', 'error');
            return;
        }
        
        const imported = await response.json();
        if (!Array.isArray(imported)) {
            showMessage('Invalid preloaded recipe file format', 'error');
            return;
        }
        
        // Validate recipe structure
        const validRecipes = imported.filter(recipe => {
            return recipe && recipe.name && Array.isArray(recipe.ingredients);
        });
        
        if (validRecipes.length === 0) {
            showMessage('No valid recipes found in preloaded file', 'error');
            return;
        }
        
        // Check if recipes are already loaded (by name)
        const existingNames = new Set(recipes.map(r => r.name.toLowerCase()));
        const newRecipes = validRecipes.filter(recipe => 
            !existingNames.has(recipe.name.toLowerCase())
        );
        
        if (newRecipes.length === 0) {
            showMessage('All preloaded recipes are already loaded', 'success');
            return;
        }
        
        // Add imported recipes (assign new IDs to avoid conflicts)
        const newRecipeIds = [];
        newRecipes.forEach(recipe => {
            recipe.id = Date.now() + Math.random(); // New unique ID
            recipes.push(recipe);
            newRecipeIds.push(recipe.id);
        });
        
        // Don't automatically activate imported recipes - let user choose
        // activeRecipeIds is not updated, so they'll be inactive by default
        
        // Save to localStorage
        saveRecipes();
        saveActiveRecipes();
        
        // Consolidate and update UI
        consolidateIngredients();
        updateRecipeList();
        updateShoppingList();
        updateTagFilters();
        
        const addedCount = newRecipes.length;
        const skippedCount = validRecipes.length - newRecipes.length;
        let message = `Loaded ${addedCount} preloaded recipe${addedCount !== 1 ? 's' : ''}`;
        if (skippedCount > 0) {
            message += ` (${skippedCount} already loaded)`;
        }
        message += '. Check the boxes to include them in your shopping list.';
        showMessage(message, 'success');
    } catch (error) {
        console.error('Error loading preloaded recipes:', error);
        showMessage('Error loading preloaded recipes. Please check if WholeFoods.json exists.', 'error');
    }
}

/**
 * Import recipes from JSON file
 */
function importRecipes(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) {
                showMessage('Invalid recipe file format', 'error');
                return;
            }
            
            // Validate recipe structure
            const validRecipes = imported.filter(recipe => {
                return recipe && recipe.name && Array.isArray(recipe.ingredients);
            });
            
            if (validRecipes.length === 0) {
                showMessage('No valid recipes found in file', 'error');
                return;
            }
            
            // Add imported recipes (assign new IDs to avoid conflicts)
            const existingCount = recipes.length;
            const newRecipeIds = [];
            validRecipes.forEach(recipe => {
                recipe.id = Date.now() + Math.random(); // New unique ID
                recipes.push(recipe);
                newRecipeIds.push(recipe.id);
            });
            
            // Don't automatically activate imported recipes - let user choose
            // activeRecipeIds is not updated, so they'll be inactive by default
            
            // Save to localStorage
            saveRecipes();
            saveActiveRecipes();
            
            // Consolidate and update UI
            consolidateIngredients();
            updateRecipeList();
            updateShoppingList();
            updateTagFilters();
            
            const addedCount = validRecipes.length;
            showMessage(`Imported ${addedCount} recipe${addedCount !== 1 ? 's' : ''}. Check the boxes to include them in your shopping list.`, 'success');
            
            // Reset file input
            event.target.value = '';
        } catch (error) {
            console.error('Error importing recipes:', error);
            showMessage('Error importing recipes. Please check the file format.', 'error');
        }
    };
    reader.readAsText(file);
}

/**
 * Download shopping list as a simple text file
 */
function downloadShoppingList() {
    if (Object.keys(consolidatedIngredients).length === 0 || activeRecipeIds.size === 0) {
        showMessage('No active recipes to generate shopping list', 'error');
        return;
    }
    
    // Get active recipe names
    const activeRecipes = recipes.filter(r => activeRecipeIds.has(r.id)).map(r => r.name);
    
    // Get all ingredients and sort them the same way as the display
    let sortedIngredients = Object.values(consolidatedIngredients);
    
    if (shoppingListSortOrder === 'alphabetical') {
        sortedIngredients = sortedIngredients.sort((a, b) => {
            const nameA = (a.originalName || a.name || '').toLowerCase();
            const nameB = (b.originalName || b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
    } else if (shoppingListSortOrder === 'category') {
        // Sort by category, then alphabetically within category
        sortedIngredients = sortedIngredients.map(item => ({
            ...item,
            category: getIngredientCategory(item.originalName || item.name)
        })).sort((a, b) => {
            // First sort by category
            const catA = a.category;
            const catB = b.category;
            if (catA !== catB) {
                return catA.localeCompare(catB);
            }
            // Then alphabetically within category
            const nameA = (a.originalName || a.name || '').toLowerCase();
            const nameB = (b.originalName || b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
    }
    
    // Build text content
    let text = 'SHOPPING LIST\n';
    text += '='.repeat(50) + '\n\n';
    text += `Based on recipes: ${activeRecipes.join(', ')}\n`;
    text += `Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n\n`;
    text += 'INGREDIENTS:\n';
    text += '-'.repeat(50) + '\n\n';
    
    // Group by category if category sort is selected
    if (shoppingListSortOrder === 'category') {
        const categories = {};
        
        for (const item of sortedIngredients) {
            const category = item.category || 'Other';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(item);
        }
        
        // Display by category - ensure 'Other' only appears once
        const categoryKeys = Object.keys(INGREDIENT_CATEGORIES);
        const categoryOrder = categoryKeys.includes('Other') ? categoryKeys : categoryKeys.concat(['Other']);
        for (const category of categoryOrder) {
            if (categories[category] && categories[category].length > 0) {
                // Category header
                text += `\n${category.toUpperCase()}\n`;
                text += '-'.repeat(50) + '\n';
                
                // Items in category
                for (const item of categories[category]) {
                    const quantityDisplay = formatItemQuantity(item);
                    text += `□ ${quantityDisplay} ${item.originalName || item.name}\n`;
                }
            }
        }
    } else {
        // Alphabetical - just display all items
        for (const item of sortedIngredients) {
            const quantityDisplay = formatItemQuantity(item);
            text += `□ ${quantityDisplay} ${item.originalName || item.name}\n`;
        }
    }
    
    text += '\n' + '='.repeat(50) + '\n';
    text += `Total items: ${sortedIngredients.length}\n`;
    
    // Download as text file
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shopping-list-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showMessage('Shopping list downloaded', 'success');
}

/**
 * Format item quantity for display
 */
function formatItemQuantity(item) {
    let quantityDisplay = '';
    
    // If we have a single display quantity and unit, use it
    if (item.displayQuantity !== undefined && item.displayUnit !== undefined) {
        // Format the quantity nicely (converts decimals to fractions when appropriate)
        let displayQty = formatQuantity(item.displayQuantity);
        
        // For imperial volume, add fl oz in parentheses
        if (unitSystem === 'imperial' && item.displayUnitType === 'volume' && item.flOz !== null && item.flOz !== undefined) {
            const flOzDisplay = formatQuantity(item.flOz);
            quantityDisplay = `${displayQty} ${item.displayUnit || ''} (${flOzDisplay} fl oz)`.trim();
        } else {
            quantityDisplay = `${displayQty} ${item.displayUnit || ''}`.trim();
        }
    } 
    // If we have grouped quantities (different units), show them all
    else if (item.groupedQuantities && item.groupedQuantities.length > 0) {
        const parts = item.groupedQuantities.map(gq => {
            let qty = formatQuantity(gq.displayQuantity);
            let part = `${qty} ${gq.displayUnit || ''}`.trim();
            
            // For imperial volume, add fl oz in parentheses if available
            if (unitSystem === 'imperial' && gq.unitType === 'volume' && gq.flOz !== null && gq.flOz !== undefined) {
                const flOzDisplay = formatQuantity(gq.flOz);
                part = `${part} (${flOzDisplay} fl oz)`;
            }
            
            return part;
        });
        quantityDisplay = parts.join(' + ');
    }
    // Fallback: convert to preferred system
    else {
        let totalBase = 0;
        let unitType = null;
        for (const q of item.quantities) {
            if (q.unitType !== 'count') {
                const base = convertToBaseUnit(q.originalQuantity || q.value, q.originalUnit || q.unit, q.unitType);
                totalBase += base.value;
                if (!unitType) unitType = q.unitType;
            }
        }
        if (unitType && totalBase > 0) {
            const converted = convertToPreferredUnitSystem(totalBase, unitType);
            let displayQty = converted.displayQuantity;
            // For imperial volume, add fl oz in parentheses
            if (unitSystem === 'imperial' && unitType === 'volume' && converted.flOz !== null && converted.flOz !== undefined) {
                const flOzDisplay = formatQuantity(converted.flOz);
                quantityDisplay = `${displayQty} ${converted.displayUnit} (${flOzDisplay} fl oz)`;
            } else {
                quantityDisplay = `${displayQty} ${converted.displayUnit}`;
            }
        } else {
            quantityDisplay = item.quantities.map(q => {
                const qty = formatQuantity(q.originalQuantity || q.value);
                return `${qty} ${q.originalUnit || q.unit || ''}`;
            }).join(' + ');
        }
    }
    
    return quantityDisplay;
}

/**
 * Clear all recipes
 */
function clearAll() {
    if (confirm('Are you sure you want to clear all recipes? This cannot be undone.')) {
        recipes = [];
        consolidatedIngredients = {};
        
        // Clear from localStorage
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            console.error('Error clearing recipes from storage:', error);
        }
        
        updateRecipeList();
        updateShoppingList();
        showMessage('All recipes cleared', 'success');
    }
}

/**
 * Show a message to the user
 */
function showMessage(message, type) {
    // Remove any existing messages
    const existing = document.querySelector('.error-message, .success-message, .warning-message');
    if (existing) {
        existing.remove();
    }
    
    const messageDiv = document.createElement('div');
    if (type === 'error') {
        messageDiv.className = 'error-message';
    } else if (type === 'warning') {
        messageDiv.className = 'warning-message';
    } else {
        messageDiv.className = 'success-message';
    }
    messageDiv.textContent = message;
    
    const firstCard = document.querySelector('.rc-card');
    if (firstCard) {
        firstCard.insertBefore(messageDiv, firstCard.firstChild);
        
        // Auto-remove after 5 seconds (10 seconds for warnings)
        const timeout = type === 'warning' ? 10000 : 5000;
        setTimeout(() => {
            messageDiv.remove();
        }, timeout);
    }
}

/**
 * Set unit system and save preference
 */
function setUnitSystem(system) {
    unitSystem = system;
    try {
        localStorage.setItem(UNIT_SYSTEM_KEY, system);
    } catch (error) {
        console.error('Error saving unit system:', error);
    }
    
    // Update dropdown
    const select = document.getElementById('unitSystemSelect');
    if (select) {
        select.value = system;
    }
    
    // Reconsolidate and update display
    consolidateIngredients();
    updateShoppingList();
}

/**
 * Load unit system preference
 */
function loadUnitSystem() {
    try {
        const saved = localStorage.getItem(UNIT_SYSTEM_KEY);
        // Migrate old unit system values to new ones
        if (saved) {
            if (saved === 'imperial-culinary' || saved === 'imperial-technical') {
                unitSystem = 'imperial';
                localStorage.setItem(UNIT_SYSTEM_KEY, 'imperial');
            } else if (saved === 'metric' || saved === 'imperial') {
                unitSystem = saved;
            }
        }
    } catch (error) {
        console.error('Error loading unit system:', error);
    }
    
    // Update dropdown
    const select = document.getElementById('unitSystemSelect');
    if (select) {
        select.value = unitSystem;
    }
}

// Initialize drag and drop and load saved recipes
// Suggested tags for recipe form
const SUGGESTED_TAGS = [
    'breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'appetizer',
    'vegan', 'vegetarian', 'gluten-free', 'dairy-free', 'healthy',
    'salad', 'soup', 'pasta', 'bread', 'smoothie', 'beverage',
    'quick', 'make-ahead', 'meal-prep', 'one-pot', 'sheet-pan',
    'spicy', 'sweet', 'savory', 'sour', 'bitter'
];

/**
 * Get all available tags (from existing recipes + suggested tags)
 */
function getAllAvailableTags() {
    const existingTags = new Set();
    
    // Collect all tags from existing recipes
    recipes.forEach(recipe => {
        if (recipe.tags && Array.isArray(recipe.tags)) {
            recipe.tags.forEach(tag => existingTags.add(tag));
        }
    });
    
    // Add suggested tags
    SUGGESTED_TAGS.forEach(tag => existingTags.add(tag));
    
    return Array.from(existingTags).sort();
}

/**
 * Filter tag options for dropdown
 */
function filterTagOptions(searchText) {
    const dropdown = document.getElementById('tagDropdown');
    if (!dropdown) return;
    
    const searchLower = searchText.toLowerCase().trim();
    const allTags = getAllAvailableTags();
    
    // Filter tags that match the search
    let filteredTags = allTags;
    if (searchLower) {
        filteredTags = allTags.filter(tag => 
            tag.toLowerCase().includes(searchLower)
        );
    }
    
    // If search text doesn't match any existing tag and is valid, show option to add it
    const cleanSearch = searchLower.replace(/[^a-z0-9\-_]/g, '');
    if (cleanSearch && !allTags.includes(cleanSearch) && !selectedTagsForForm.has(cleanSearch)) {
        filteredTags.push(`[Add: ${cleanSearch}]`);
    }
    
    dropdown.innerHTML = '';
    
    if (filteredTags.length === 0) {
        dropdown.style.display = 'none';
        return;
    }
    
    dropdown.style.display = 'block';
    
    filteredTags.forEach(tag => {
        const isAddNew = tag.startsWith('[Add: ');
        const actualTag = isAddNew ? cleanSearch : tag;
        const isSelected = selectedTagsForForm.has(actualTag);
        
        const option = document.createElement('div');
        option.className = 'ingredient-option';
        if (isSelected) {
            option.style.opacity = '0.5';
            option.style.cursor = 'default';
        }
        option.textContent = isAddNew ? `+ Add "${actualTag}"` : tag;
        if (!isSelected) {
            option.onmousedown = (e) => {
                e.preventDefault(); // Prevent input from losing focus
                selectTagForForm(actualTag);
                const input = document.getElementById('tagSearchInput');
                if (input) {
                    input.value = '';
                    input.focus(); // Keep focus on input
                }
            };
        }
        dropdown.appendChild(option);
    });
}

/**
 * Show tag dropdown
 */
function showTagDropdown() {
    const dropdown = document.getElementById('tagDropdown');
    const input = document.getElementById('tagSearchInput');
    if (!dropdown || !input) return;
    
    filterTagOptions(input.value);
}

/**
 * Hide tag dropdown
 */
let hideTagDropdownTimeout = null;
function hideTagDropdown() {
    // Clear any existing timeout
    if (hideTagDropdownTimeout) {
        clearTimeout(hideTagDropdownTimeout);
    }
    
    // Delay to allow click events to fire
    hideTagDropdownTimeout = setTimeout(() => {
        const dropdown = document.getElementById('tagDropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
        hideTagDropdownTimeout = null;
    }, 200);
}

/**
 * Handle Enter key in tag input
 */
function handleTagInputEnter(event) {
    event.preventDefault();
    const input = document.getElementById('tagSearchInput');
    if (!input) return;
    
    const searchText = input.value.trim().toLowerCase();
    if (!searchText) return;
    
    // Clean the tag (remove invalid characters)
    const cleanTag = searchText.replace(/[^a-z0-9\-_]/g, '');
    if (!cleanTag) {
        showMessage('Tag can only contain letters, numbers, hyphens, and underscores', 'error');
        return;
    }
    
    // Check if tag already selected
    if (selectedTagsForForm.has(cleanTag)) {
        input.value = '';
        hideTagDropdown();
        return;
    }
    
    // Add the tag
    selectTagForForm(cleanTag);
    input.value = '';
    hideTagDropdown();
}

/**
 * Select a tag for the form
 */
function selectTagForForm(tag) {
    if (selectedTagsForForm.has(tag)) {
        return; // Already selected
    }
    
    selectedTagsForForm.add(tag);
    updateSelectedTagsDisplay();
    
    // Refresh dropdown to show updated state
    const input = document.getElementById('tagSearchInput');
    if (input) {
        filterTagOptions(input.value);
    }
}

/**
 * Update the display of selected tags
 */
function updateSelectedTagsDisplay() {
    const container = document.getElementById('selectedTagsDisplay');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (selectedTagsForForm.size === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'flex';
    
    Array.from(selectedTagsForForm).sort().forEach(tag => {
        const chip = document.createElement('span');
        chip.className = 'selected-tag-chip';
        chip.innerHTML = `${tag} <span class="remove-tag" onclick="removeTagFromSelection('${tag}')">×</span>`;
        container.appendChild(chip);
    });
}

/**
 * Remove tag from selection
 */
function removeTagFromSelection(tag) {
    selectedTagsForForm.delete(tag);
    updateSelectedTagsDisplay();
    
    // Refresh dropdown if it's open
    const input = document.getElementById('tagSearchInput');
    const dropdown = document.getElementById('tagDropdown');
    if (input && dropdown && dropdown.style.display !== 'none') {
        filterTagOptions(input.value);
    }
}

/**
 * Clear tag selection form
 */
function clearTagSelectionForm() {
    selectedTagsForForm.clear();
    const input = document.getElementById('tagSearchInput');
    if (input) input.value = '';
    updateSelectedTagsDisplay();
    hideTagDropdown();
}

/**
 * Check if we're in development mode
 */
function isDevelopmentMode() {
    // Check if we're on localhost or have a dev parameter
    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' ||
                       window.location.hostname === '';
    const hasDevParam = new URLSearchParams(window.location.search).has('dev');
    return isLocalhost || hasDevParam;
}

/**
 * Export all recipes to WholeFoods.json format
 */
function exportWholeFoodsJson() {
    if (recipes.length === 0) {
        showMessage('No recipes to export', 'error');
        return;
    }
    
    // Prepare recipes for export (remove internal IDs, keep only essential data)
    const exportData = recipes.map(recipe => {
        const exported = {
            name: recipe.name,
            ingredients: recipe.ingredients.map(ing => ({
                quantity: ing.quantity,
                unit: ing.unit,
                unitType: ing.unitType,
                ingredient: ing.ingredient,
                originalLine: ing.originalLine || `${ing.quantity || ''} ${ing.unit || ''} ${ing.ingredient}`.trim(),
                // Persist parsed notes so they survive round-trips through WholeFoods.json
                ...(ing.notes ? { notes: ing.notes } : {})
            })),
            originalText: recipe.originalText,
            tags: recipe.tags || []
        };
        
        // Add optional fields if they exist
        if (recipe.about) {
            exported.about = recipe.about;
        }
        if (recipe.instructions) {
            exported.instructions = recipe.instructions;
        }
        
        return exported;
    });
    
    // Create JSON blob
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Download
    const link = document.createElement('a');
    link.href = url;
    link.download = 'WholeFoods.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showMessage(`Exported ${recipes.length} recipe${recipes.length !== 1 ? 's' : ''} to WholeFoods.json`, 'success');
}

document.addEventListener('DOMContentLoaded', function() {
    // Show dev export button if in development mode
    if (isDevelopmentMode()) {
        const devButton = document.getElementById('devExportButton');
        if (devButton) {
            devButton.style.display = 'inline-block';
        }
    }
    
    // Load unit system preference
    loadUnitSystem();
    
    // Initialize tag selection display
    updateSelectedTagsDisplay();
    
    // Load shopping list sort preference
    loadShoppingListSort();
    
    // Load saved recipes from localStorage
    loadRecipes();
    
    // Load meal plan
    loadMealPlan();
    
    // Load tag filter preferences
    try {
        // Load selected tag filters
        const savedTagFilters = localStorage.getItem(SELECTED_TAG_FILTERS_KEY);
        if (savedTagFilters) {
            try {
                const tags = JSON.parse(savedTagFilters);
                selectedTagFilters = new Set(tags);
            } catch (e) {
                console.error('Error parsing saved tag filters:', e);
            }
        }
        
        // Load tag filter logic
        const savedLogic = localStorage.getItem(TAG_FILTER_LOGIC_KEY);
        if (savedLogic === 'and' || savedLogic === 'or') {
            tagFilterLogic = savedLogic;
        }
        
        // Legacy: migrate from old single tag filter
        const savedFilter = localStorage.getItem(TAG_FILTER_KEY);
        if (savedFilter && savedFilter !== 'all' && selectedTagFilters.size === 0) {
            selectedTagFilters.add(savedFilter);
            try {
                localStorage.setItem(SELECTED_TAG_FILTERS_KEY, JSON.stringify(Array.from(selectedTagFilters)));
            } catch (e) {
                console.error('Error saving migrated tag filters:', e);
            }
        }
    } catch (error) {
        console.error('Error loading tag filters:', error);
    }
    
    // Initialize tag filters and recipe list
    updateTagFilters();
    updateSelectedIngredientsDisplay();
    updateDayPlanner();

    // Recipe Assistant (beta)
    initRecipeAssistant();
});



