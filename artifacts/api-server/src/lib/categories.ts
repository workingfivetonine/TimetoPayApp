// Fixed grocery category list. The AI assigns one of these at scan time; the
// admin can override a canonical item's category. Anything unknown falls back
// to "Other". Keep this list stable — it's the contract for browse grouping.

export const FIXED_CATEGORIES = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Bakery",
  "Pantry",
  "Frozen",
  "Beverages",
  "Snacks",
  "Household",
  "Personal Care",
  "Baby",
  "Pet",
  "Other",
] as const;

export type Category = (typeof FIXED_CATEGORIES)[number];

const CATEGORY_SET = new Set<string>(FIXED_CATEGORIES);

export function isValidCategory(value: string | null | undefined): value is Category {
  return value != null && CATEGORY_SET.has(value);
}

// Sort index for a category; unknown/null sort last (after "Other").
export function categoryOrder(value: string | null | undefined): number {
  if (!value) return FIXED_CATEGORIES.length;
  const idx = FIXED_CATEGORIES.indexOf(value as Category);
  return idx === -1 ? FIXED_CATEGORIES.length : idx;
}

// Deterministic keyword → category fallback, used when the AI omits a category
// or an existing item has none. Mirrors the iconForItemName approach.
const KEYWORD_CATEGORIES: ReadonlyArray<readonly [Category, readonly string[]]> = [
  ["Produce", ["apple", "banana", "orange", "lettuce", "tomato", "potato", "onion", "carrot", "spinach", "broccoli", "berry", "berries", "grape", "lemon", "lime", "avocado", "cucumber", "pepper", "celery", "garlic", "mushroom", "fruit", "vegetable", "veggie", "salad", "kale", "herb", "cilantro", "parsley"]],
  ["Meat & Seafood", ["chicken", "beef", "pork", "steak", "bacon", "sausage", "turkey", "ham", "fish", "salmon", "tuna", "shrimp", "seafood", "meat", "lamb", "ground"]],
  ["Dairy & Eggs", ["milk", "cheese", "yogurt", "yoghurt", "butter", "egg", "cream", "dairy", "sour cream", "cottage"]],
  ["Bakery", ["bread", "bagel", "muffin", "croissant", "bun", "roll", "tortilla", "cake", "pastry", "donut", "doughnut", "baguette", "pita"]],
  ["Frozen", ["frozen", "ice cream", "popsicle", "pizza"]],
  ["Beverages", ["water", "soda", "juice", "coffee", "tea", "beer", "wine", "drink", "cola", "lemonade", "kombucha", "sparkling", "energy drink"]],
  ["Snacks", ["chips", "crackers", "cookie", "candy", "chocolate", "snack", "popcorn", "pretzel", "nuts", "granola bar", "trail mix", "gum"]],
  ["Household", ["paper towel", "toilet paper", "detergent", "soap", "cleaner", "trash bag", "dish", "sponge", "bleach", "foil", "napkin", "laundry", "cleaning"]],
  ["Personal Care", ["shampoo", "conditioner", "toothpaste", "toothbrush", "deodorant", "lotion", "razor", "body wash", "floss", "vitamin", "medicine", "bandage", "sunscreen", "makeup"]],
  ["Baby", ["diaper", "formula", "wipes", "baby"]],
  ["Pet", ["dog", "cat", "pet", "kibble", "litter", "treats"]],
  ["Pantry", ["rice", "pasta", "flour", "sugar", "salt", "oil", "vinegar", "sauce", "soup", "bean", "cereal", "oats", "spice", "ketchup", "mustard", "mayo", "peanut butter", "jam", "jelly", "honey", "broth", "canned", "noodle", "spaghetti", "sauce"]],
];

export function categoryForItemName(name: string): Category {
  const lower = name.toLowerCase();
  for (const [category, keywords] of KEYWORD_CATEGORIES) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return category;
    }
  }
  return "Other";
}
