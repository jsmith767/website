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

// LocalStorage keys
const STORAGE_KEY = 'recipeConsolidator_recipes';
const UNIT_SYSTEM_KEY = 'recipeConsolidator_unitSystem';
const SHOPPING_LIST_SORT_KEY = 'recipeConsolidator_shoppingListSort';
const TAG_FILTER_KEY = 'recipeConsolidator_tagFilter';
const SELECTED_TAG_FILTERS_KEY = 'recipeConsolidator_selectedTagFilters';
const TAG_FILTER_LOGIC_KEY = 'recipeConsolidator_tagFilterLogic';

// Unit system preference (default: imperial)
let unitSystem = 'imperial';

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
    
    // Remove common prefixes/suffixes
    normalized = normalized.replace(/^(fresh |dried |ground |chopped |diced |sliced |minced |grated |crushed )/i, '');
    normalized = normalized.replace(/(,.*|\(.*\))/g, ''); // Remove notes in parentheses or after commas
    
    // Check aliases
    for (const [key, aliases] of Object.entries(INGREDIENT_ALIASES)) {
        if (normalized === key || aliases.some(alias => normalized.includes(alias) || alias.includes(normalized))) {
            return key;
        }
    }
    
    return normalized;
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
                    const ingredientName = remainingText || allPairs[allPairs.length - 1].remaining || '';
                    
                    return {
                        quantity: totalBaseValue,
                        unit: unitTypes[0] === 'volume' ? 'ml' : 'g',
                        unitType: unitTypes[0],
                        ingredient: ingredientName.trim(),
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
        return {
            quantity: 1,
            unit: null,
            ingredient: line,
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
            
            return {
                quantity: quantity,
                unit: unit,
                unitType: 'volume',
                ingredient: ingredient,
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
            
            return {
                quantity: quantity,
                unit: unit,
                unitType: 'weight',
                ingredient: ingredient,
                originalLine: line
            };
        }
    }
    
    // No unit found, assume count/whole item
    return {
        quantity: quantity,
        unit: null,
        unitType: 'count',
        ingredient: rest,
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
    const editActions = document.getElementById('editRecipeActions');
    const addRecipeTitle = document.getElementById('addRecipeTitle');
    const addRecipeDescription = document.getElementById('addRecipeDescription');
    const aboutInput = document.getElementById('recipeAbout');
    const instructionsInput = document.getElementById('recipeInstructions');
    
    nameInput.value = recipe.name;
    textInput.value = recipe.originalText;
    editingIdInput.value = recipeId;
    if (aboutInput) aboutInput.value = recipe.about || '';
    if (instructionsInput) instructionsInput.value = recipe.instructions || '';
    
    // Load recipe tags into form
    selectedTagsForForm.clear();
    if (recipe.tags && Array.isArray(recipe.tags)) {
        recipe.tags.forEach(tag => selectedTagsForForm.add(tag));
    }
    updateSelectedTagsDisplay();
    
    // Show edit mode
    editActions.style.display = 'block';
    addRecipeTitle.textContent = 'Edit Recipe';
    addRecipeDescription.textContent = 'Make changes to the recipe below. The tool will re-parse ingredients when you save.';
    
    // Scroll to the form
    document.getElementById('addRecipeCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) {
        showMessage('Recipe not found', 'error');
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
    const about = aboutInput ? aboutInput.value.trim() : '';
    const instructions = instructionsInput ? instructionsInput.value.trim() : '';
    
    // Update recipe
    recipe.name = recipeName;
    recipe.ingredients = ingredients;
    recipe.originalText = recipeText;
    recipe.tags = tags;
    recipe.about = about || undefined;
    recipe.instructions = instructions || undefined;
    
    // Clear form
    nameInput.value = '';
    input.value = '';
    editingIdInput.value = '';
    if (aboutInput) aboutInput.value = '';
    if (instructionsInput) instructionsInput.value = '';
    clearTagSelectionForm();
    
    // Hide edit mode
    const editActions = document.getElementById('editRecipeActions');
    const addRecipeTitle = document.getElementById('addRecipeTitle');
    const addRecipeDescription = document.getElementById('addRecipeDescription');
    editActions.style.display = 'none';
    addRecipeTitle.textContent = 'Add Recipe';
    addRecipeDescription.textContent = 'Add recipes by pasting text. The tool will automatically extract ingredients with quantities and units.';
    
    // Save to localStorage
    saveRecipes();
    
    // Consolidate ingredients
    consolidateIngredients();
    
    // Update UI
    updateRecipeList();
    updateShoppingList();
    updateTagFilters();
    showMessage(`Recipe updated with ${ingredients.length} ingredients`, 'success');
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
    
    // Clear form
    nameInput.value = '';
    textInput.value = '';
    editingIdInput.value = '';
    const aboutInput = document.getElementById('recipeAbout');
    const instructionsInput = document.getElementById('recipeInstructions');
    if (aboutInput) aboutInput.value = '';
    if (instructionsInput) instructionsInput.value = '';
    clearTagSelectionForm();
    
    // Hide edit mode
    editActions.style.display = 'none';
    addRecipeTitle.textContent = 'Add Recipe';
    addRecipeDescription.textContent = 'Add recipes by pasting text. The tool will automatically extract ingredients with quantities and units.';
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
    const editingIdInput = document.getElementById('editingRecipeId');
    const editingId = editingIdInput.value;
    
    // If we're in edit mode, save the edit instead
    if (editingId) {
        saveRecipeEdit();
        return;
    }
    
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
    const about = aboutInput ? aboutInput.value.trim() : '';
    const instructions = instructionsInput ? instructionsInput.value.trim() : '';
    
    // Create recipe object
    const recipe = {
        id: Date.now(),
        name: recipeName,
        ingredients: ingredients,
        originalText: recipeText,
        tags: tags,
        about: about || undefined,
        instructions: instructions || undefined
    };
    
    // Clear form
    nameInput.value = '';
    input.value = '';
    if (aboutInput) aboutInput.value = '';
    if (instructionsInput) instructionsInput.value = '';
    clearTagSelectionForm();
    
    recipes.push(recipe);
    
    // Automatically activate new recipes with multiplier 1
    activeRecipeIds.add(recipe.id);
    recipeMultipliers[recipe.id] = 1;
    
    // Save to localStorage
    saveRecipes();
    saveActiveRecipes();
    saveRecipeMultipliers();
    
    // Consolidate ingredients
    consolidateIngredients();
    
    // Update UI
    updateRecipeList();
    updateShoppingList();
    updateTagFilters();
    showMessage(`Added recipe with ${ingredients.length} ingredients`, 'success');
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
    if (!recipe || !recipe.instructions) return;
    
    const modal = document.getElementById('preparationModal');
    const modalTitle = document.getElementById('preparationModalTitle');
    const modalBody = document.getElementById('preparationModalBody');
    
    if (!modal || !modalTitle || !modalBody) return;
    
    modalTitle.textContent = `Preparation: ${recipe.name}`;
    modalBody.textContent = recipe.instructions;
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
    const existing = document.querySelector('.error-message, .success-message');
    if (existing) {
        existing.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = type === 'error' ? 'error-message' : 'success-message';
    messageDiv.textContent = message;
    
    const firstCard = document.querySelector('.rc-card');
    if (firstCard) {
        firstCard.insertBefore(messageDiv, firstCard.firstChild);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            messageDiv.remove();
        }, 5000);
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
                originalLine: ing.originalLine || `${ing.quantity || ''} ${ing.unit || ''} ${ing.ingredient}`.trim()
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
});


