// Recipe Consolidator - Main JavaScript Logic

// Store for recipes and consolidated ingredients
let recipes = [];
let consolidatedIngredients = {};
let activeRecipeIds = new Set(); // Track which recipes are active for shopping list
let recipeMultipliers = {}; // Track multiplier for each recipe (e.g., making recipe 3x)
let recipeSortOrder = 'name-asc'; // Default sort order
let shoppingListSortOrder = 'alphabetical'; // Default shopping list sort order

// LocalStorage keys
const STORAGE_KEY = 'recipeConsolidator_recipes';
const UNIT_SYSTEM_KEY = 'recipeConsolidator_unitSystem';
const SHOPPING_LIST_SORT_KEY = 'recipeConsolidator_shoppingListSort';

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
            
            // Consolidate ingredients and update UI
            consolidateIngredients();
            updateRecipeList();
            updateShoppingList();
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
            const ml = Math.round(baseValue * 100) / 100;
            return {
                value: ml,
                unit: 'ml',
                displayQuantity: ml === Math.floor(ml) ? Math.floor(ml) : ml,
                displayUnit: 'ml',
                flOz: null
            };
        } else {
            const g = Math.round(baseValue * 100) / 100;
            return {
                value: g,
                unit: 'g',
                displayQuantity: g === Math.floor(g) ? Math.floor(g) : g,
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
                const rounded = Math.round(cup * 100) / 100;
                let displayQty = rounded === Math.floor(rounded) ? Math.floor(rounded) : rounded;
                if (displayQty < 1 && displayQty > 0) {
                    displayQty = toFraction(displayQty);
                }
                return {
                    value: rounded,
                    unit: 'cup',
                    displayQuantity: displayQty,
                    displayUnit: rounded === 1 ? 'cup' : 'cups',
                    flOz: roundedFlOz
                };
            }
            
            const tbsp = baseValue / conversions['tablespoon'];
            if (tbsp >= 0.5) {
                const rounded = Math.round(tbsp * 100) / 100;
                let displayQty = rounded === Math.floor(rounded) ? Math.floor(rounded) : rounded;
                if (displayQty < 1 && displayQty > 0) {
                    displayQty = toFraction(displayQty);
                }
                return {
                    value: rounded,
                    unit: 'tablespoon',
                    displayQuantity: displayQty,
                    displayUnit: rounded === 1 ? 'tablespoon' : 'tablespoons',
                    flOz: roundedFlOz
                };
            }
            
            // Use teaspoons
            const tsp = baseValue / conversions['teaspoon'];
            const rounded = Math.round(tsp * 100) / 100;
            let displayQty = rounded === Math.floor(rounded) ? Math.floor(rounded) : rounded;
            if (displayQty < 1 && displayQty > 0) {
                displayQty = toFraction(displayQty);
            }
            return {
                value: rounded,
                unit: 'teaspoon',
                displayQuantity: displayQty,
                displayUnit: rounded === 1 ? 'teaspoon' : 'teaspoons',
                flOz: roundedFlOz
            };
        } else {
            // Weight: use oz or lbs (no fl oz for weight)
            const oz = baseValue / conversions['ounce'];
            if (oz >= 16) {
                const lbs = oz / 16;
                const roundedLbs = Math.round(lbs * 100) / 100;
                return {
                    value: roundedLbs,
                    unit: 'pound',
                    displayQuantity: roundedLbs === Math.floor(roundedLbs) ? Math.floor(roundedLbs) : roundedLbs,
                    displayUnit: roundedLbs === 1 ? 'pound' : 'pounds',
                    flOz: null
                };
            } else {
                const roundedOz = Math.round(oz * 100) / 100;
                return {
                    value: roundedOz,
                    unit: 'ounce',
                    displayQuantity: roundedOz === Math.floor(roundedOz) ? Math.floor(roundedOz) : roundedOz,
                    displayUnit: roundedOz === 1 ? 'ounce' : 'ounces',
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
 */
function toFraction(decimal) {
    const tolerance = 0.01;
    const fractions = [
        { val: 0.125, str: '1/8' },
        { val: 0.25, str: '1/4' },
        { val: 0.33, str: '1/3' },
        { val: 0.5, str: '1/2' },
        { val: 0.67, str: '2/3' },
        { val: 0.75, str: '3/4' }
    ];
    
    for (const frac of fractions) {
        if (Math.abs(decimal - frac.val) < tolerance) {
            return frac.str;
        }
    }
    
    return Math.round(decimal * 100) / 100;
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
    
    nameInput.value = recipe.name;
    textInput.value = recipe.originalText;
    editingIdInput.value = recipeId;
    
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
    
    // Update recipe
    recipe.name = recipeName;
    recipe.ingredients = ingredients;
    recipe.originalText = recipeText;
    
    // Clear form
    nameInput.value = '';
    input.value = '';
    editingIdInput.value = '';
    
    // Hide edit mode
    const editActions = document.getElementById('editRecipeActions');
    const addRecipeTitle = document.getElementById('addRecipeTitle');
    const addRecipeDescription = document.getElementById('addRecipeDescription');
    editActions.style.display = 'none';
    addRecipeTitle.textContent = 'Add Recipe';
    addRecipeDescription.textContent = 'Add recipes by pasting text or uploading a photo. The tool will automatically extract ingredients with quantities and units.';
    
    // Save to localStorage
    saveRecipes();
    
    // Consolidate ingredients
    consolidateIngredients();
    
    // Update UI
    updateRecipeList();
    updateShoppingList();
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
    
    // Hide edit mode
    editActions.style.display = 'none';
    addRecipeTitle.textContent = 'Add Recipe';
    addRecipeDescription.textContent = 'Add recipes by pasting text or uploading a photo. The tool will automatically extract ingredients with quantities and units.';
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
    
    // Create recipe object
    const recipe = {
        id: Date.now(),
        name: recipeName,
        ingredients: ingredients,
        originalText: recipeText
    };
    
    // Clear name input
    nameInput.value = '';
    
    recipes.push(recipe);
    input.value = '';
    
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
    const sortedRecipes = getSortedRecipes();
    
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
                <button class="btn btn-secondary" onclick="editRecipe(${recipe.id})" style="padding: 8px 15px; font-size: 14px; margin-right: 5px;">Edit</button>
                <button class="btn btn-secondary" onclick="removeRecipe(${recipe.id})" style="padding: 8px 15px; font-size: 14px;">Remove</button>
            </div>
        `;
        list.appendChild(item);
    }
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
        // Format the quantity nicely
        let displayQty = item.displayQuantity;
        if (displayQty >= 1) {
            displayQty = Math.round(displayQty * 100) / 100;
            // Remove trailing zeros
            displayQty = displayQty === Math.floor(displayQty) ? Math.floor(displayQty) : displayQty;
        } else if (displayQty > 0 && item.displayUnitType !== 'count') {
            displayQty = toFraction(displayQty);
        }
        
        // For imperial volume, add fl oz in parentheses
        if (unitSystem === 'imperial' && item.displayUnitType === 'volume' && item.flOz !== null && item.flOz !== undefined) {
            const flOzRounded = Math.round(item.flOz * 100) / 100;
            const flOzDisplay = flOzRounded === Math.floor(flOzRounded) ? Math.floor(flOzRounded) : flOzRounded;
            quantityDisplay = `${displayQty} ${item.displayUnit || ''} (${flOzDisplay} fl oz)`.trim();
        } else {
            quantityDisplay = `${displayQty} ${item.displayUnit || ''}`.trim();
        }
    } 
    // If we have grouped quantities (different units), show them all
    else if (item.groupedQuantities && item.groupedQuantities.length > 0) {
        const parts = item.groupedQuantities.map(gq => {
            let qty = gq.displayQuantity;
            if (qty >= 1) {
                qty = Math.round(qty * 100) / 100;
                qty = qty === Math.floor(qty) ? Math.floor(qty) : qty;
            } else if (qty > 0 && gq.unitType !== 'count') {
                qty = toFraction(qty);
            }
            return `${qty} ${gq.displayUnit || ''}`.trim();
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
            quantityDisplay = `${converted.displayQuantity} ${converted.displayUnit}`;
        } else {
            quantityDisplay = item.quantities.map(q => `${q.originalQuantity || q.value} ${q.originalUnit || q.unit || ''}`).join(' + ');
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
    
    try {
        const dataStr = JSON.stringify(recipes, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `recipe-book-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showMessage(`Exported ${recipes.length} recipe${recipes.length !== 1 ? 's' : ''}`, 'success');
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
        let displayQty = item.displayQuantity;
        if (displayQty >= 1) {
            displayQty = Math.round(displayQty * 100) / 100;
            displayQty = displayQty === Math.floor(displayQty) ? Math.floor(displayQty) : displayQty;
        } else if (displayQty > 0 && item.displayUnitType !== 'count') {
            displayQty = toFraction(displayQty);
        }
        
        // For imperial volume, add fl oz in parentheses
        if (unitSystem === 'imperial' && item.displayUnitType === 'volume' && item.flOz !== null && item.flOz !== undefined) {
            const flOzRounded = Math.round(item.flOz * 100) / 100;
            const flOzDisplay = flOzRounded === Math.floor(flOzRounded) ? Math.floor(flOzRounded) : flOzRounded;
            quantityDisplay = `${displayQty} ${item.displayUnit || ''} (${flOzDisplay} fl oz)`.trim();
        } else {
            quantityDisplay = `${displayQty} ${item.displayUnit || ''}`.trim();
        }
    } 
    // If we have grouped quantities (different units), show them all
    else if (item.groupedQuantities && item.groupedQuantities.length > 0) {
        const parts = item.groupedQuantities.map(gq => {
            let qty = gq.displayQuantity;
            if (qty >= 1) {
                qty = Math.round(qty * 100) / 100;
                qty = qty === Math.floor(qty) ? Math.floor(qty) : qty;
            } else if (qty > 0 && gq.unitType !== 'count') {
                qty = toFraction(qty);
            }
            let part = `${qty} ${gq.displayUnit || ''}`.trim();
            
            // For imperial volume, add fl oz in parentheses if available
            if (unitSystem === 'imperial' && gq.unitType === 'volume' && gq.flOz !== null && gq.flOz !== undefined) {
                const flOzRounded = Math.round(gq.flOz * 100) / 100;
                const flOzDisplay = flOzRounded === Math.floor(flOzRounded) ? Math.floor(flOzRounded) : flOzRounded;
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
            // For imperial volume, add fl oz in parentheses
            if (unitSystem === 'imperial' && unitType === 'volume' && converted.flOz !== null && converted.flOz !== undefined) {
                const flOzRounded = Math.round(converted.flOz * 100) / 100;
                const flOzDisplay = flOzRounded === Math.floor(flOzRounded) ? Math.floor(flOzRounded) : flOzRounded;
                quantityDisplay = `${converted.displayQuantity} ${converted.displayUnit} (${flOzDisplay} fl oz)`;
            } else {
                quantityDisplay = `${converted.displayQuantity} ${converted.displayUnit}`;
            }
        } else {
            quantityDisplay = item.quantities.map(q => `${q.originalQuantity || q.value} ${q.originalUnit || q.unit || ''}`).join(' + ');
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
document.addEventListener('DOMContentLoaded', function() {
    // Load unit system preference
    loadUnitSystem();
    
    // Load shopping list sort preference
    loadShoppingListSort();
    
    // Load saved recipes from localStorage
    loadRecipes();
});


