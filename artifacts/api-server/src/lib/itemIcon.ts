// Keyword -> emoji map used as the deterministic fallback when the AI does not
// supply an icon (manual entry, quick item creation, or AI omission).
// Order matters: more specific keywords should come before generic ones.
const ICON_RULES: [RegExp, string][] = [
  // Dairy & eggs
  [/\b(milk|creamer|half ?and ?half)\b/i, "🥛"],
  [/\b(cheese|cheddar|mozzarella|parmesan|brie|gouda)\b/i, "🧀"],
  [/\b(egg|eggs)\b/i, "🥚"],
  [/\b(butter|margarine)\b/i, "🧈"],
  [/\b(yogurt|yoghurt)\b/i, "🥛"],
  [/\b(cream|sour cream)\b/i, "🥛"],

  // Bakery
  [/\b(bread|loaf|baguette|sourdough|bun|roll|toast)\b/i, "🍞"],
  [/\b(bagel)\b/i, "🥯"],
  [/\b(croissant)\b/i, "🥐"],
  [/\b(pretzel)\b/i, "🥨"],
  [/\b(cake)\b/i, "🍰"],
  [/\b(cookie|biscuit)\b/i, "🍪"],
  [/\b(donut|doughnut)\b/i, "🍩"],
  [/\b(pie)\b/i, "🥧"],
  [/\b(pancake|waffle)\b/i, "🥞"],

  // Produce — vegetables
  [/\b(carrot)\b/i, "🥕"],
  [/\b(potato|fries|hash brown)\b/i, "🥔"],
  [/\b(tomato)\b/i, "🍅"],
  [/\b(onion|shallot)\b/i, "🧅"],
  [/\b(garlic)\b/i, "🧄"],
  [/\b(pepper|capsicum|jalapeno|chilli|chili)\b/i, "🌶️"],
  [/\b(bell pepper)\b/i, "🫑"],
  [/\b(broccoli)\b/i, "🥦"],
  [/\b(lettuce|cabbage|salad|kale|spinach|greens)\b/i, "🥬"],
  [/\b(cucumber|pickle|gherkin)\b/i, "🥒"],
  [/\b(corn|maize)\b/i, "🌽"],
  [/\b(mushroom)\b/i, "🍄"],
  [/\b(eggplant|aubergine)\b/i, "🍆"],
  [/\b(avocado|guacamole)\b/i, "🥑"],
  [/\b(peas|beans|legume|lentil)\b/i, "🫛"],

  // Produce — fruit
  [/\b(apple)\b/i, "🍎"],
  [/\b(banana)\b/i, "🍌"],
  [/\b(orange|mandarin|clementine|tangerine)\b/i, "🍊"],
  [/\b(lemon)\b/i, "🍋"],
  [/\b(lime)\b/i, "🍈"],
  [/\b(grape)\b/i, "🍇"],
  [/\b(strawberry|strawberries)\b/i, "🍓"],
  [/\b(blueberry|blueberries|raspberry|berries|berry)\b/i, "🫐"],
  [/\b(watermelon)\b/i, "🍉"],
  [/\b(melon|cantaloupe)\b/i, "🍈"],
  [/\b(peach|nectarine)\b/i, "🍑"],
  [/\b(pear)\b/i, "🍐"],
  [/\b(cherry|cherries)\b/i, "🍒"],
  [/\b(pineapple)\b/i, "🍍"],
  [/\b(mango)\b/i, "🥭"],
  [/\b(coconut)\b/i, "🥥"],
  [/\b(kiwi)\b/i, "🥝"],

  // Meat & protein
  [/\b(chicken|poultry|drumstick|wings?)\b/i, "🍗"],
  [/\b(beef|steak|mince|ground beef)\b/i, "🥩"],
  [/\b(bacon|pork|ham|sausage|salami|pepperoni)\b/i, "🥓"],
  [/\b(fish|salmon|tuna|cod|tilapia|haddock)\b/i, "🐟"],
  [/\b(shrimp|prawn|crab|lobster|seafood)\b/i, "🦐"],
  [/\b(tofu)\b/i, "🧊"],

  // Pantry & staples
  [/\b(rice)\b/i, "🍚"],
  [/\b(pasta|spaghetti|noodle|macaroni|penne)\b/i, "🍝"],
  [/\b(flour|sugar|baking)\b/i, "🌾"],
  [/\b(cereal|oats|oatmeal|granola|muesli)\b/i, "🥣"],
  [/\b(honey)\b/i, "🍯"],
  [/\b(jam|jelly|preserve|marmalade)\b/i, "🍓"],
  [/\b(peanut butter|nut butter)\b/i, "🥜"],
  [/\b(nut|nuts|almond|cashew|walnut|peanut)\b/i, "🥜"],
  [/\b(oil|olive oil|vegetable oil)\b/i, "🫒"],
  [/\b(salt|spice|seasoning|herb)\b/i, "🧂"],
  [/\b(sauce|ketchup|mayo|mustard|dressing|condiment)\b/i, "🥫"],
  [/\b(soup|broth|stock|canned|can\b|tin\b)\b/i, "🥫"],
  [/\b(soy sauce)\b/i, "🥢"],

  // Snacks & sweets
  [/\b(chip|crisp|snack|popcorn|cracker)\b/i, "🍿"],
  [/\b(chocolate|candy|sweets|gummy)\b/i, "🍫"],
  [/\b(ice cream|gelato|sorbet)\b/i, "🍦"],

  // Drinks
  [/\b(water|sparkling)\b/i, "💧"],
  [/\b(coffee|espresso|latte)\b/i, "☕"],
  [/\b(tea)\b/i, "🍵"],
  [/\b(juice)\b/i, "🧃"],
  [/\b(soda|cola|coke|pepsi|sprite|soft drink|pop\b|lemonade)\b/i, "🥤"],
  [/\b(beer|ale|lager|cider)\b/i, "🍺"],
  [/\b(wine|champagne|prosecco)\b/i, "🍷"],
  [/\b(whisky|whiskey|vodka|rum|gin|liquor|spirit|tequila)\b/i, "🥃"],

  // Prepared / misc foods
  [/\b(pizza)\b/i, "🍕"],
  [/\b(burger|hamburger)\b/i, "🍔"],
  [/\b(sandwich|sub\b|wrap)\b/i, "🥪"],
  [/\b(taco|burrito|nacho)\b/i, "🌮"],
  [/\b(sushi)\b/i, "🍣"],
  [/\b(fries|chips)\b/i, "🍟"],
  [/\b(burrito)\b/i, "🌯"],

  // Household & non-food
  [/\b(paper towel|tissue|napkin|kitchen roll)\b/i, "🧻"],
  [/\b(toilet|loo roll|bath tissue)\b/i, "🧻"],
  [/\b(soap|detergent|cleaner|cleaning|bleach|wash)\b/i, "🧼"],
  [/\b(shampoo|conditioner|body wash)\b/i, "🧴"],
  [/\b(toothpaste|toothbrush|dental)\b/i, "🪥"],
  [/\b(diaper|nappy|wipes)\b/i, "🧷"],
  [/\b(battery|batteries)\b/i, "🔋"],
  [/\b(light bulb|bulb)\b/i, "💡"],
  [/\b(flower|bouquet|plant)\b/i, "💐"],
  [/\b(pet|dog|cat) ?(food|treat)?\b/i, "🐾"],
  [/\b(medicine|tablet|pill|vitamin|supplement)\b/i, "💊"],
];

const DEFAULT_ICON = "🛒";

/**
 * Returns a fitting emoji for an item name using keyword matching.
 * Used as the deterministic fallback when no AI-supplied icon is available.
 */
export function iconForItemName(name: string): string {
  if (!name) return DEFAULT_ICON;
  // Receipt items are often plural ("Bananas", "Carrots"). The keyword rules use
  // word boundaries, so also test a de-pluralized variant of each word.
  const singular = name.replace(/(\w{2,}?)(es|s)\b/gi, "$1");
  const candidates = singular === name ? [name] : [name, singular];
  for (const [pattern, icon] of ICON_RULES) {
    if (candidates.some((c) => pattern.test(c))) return icon;
  }
  return DEFAULT_ICON;
}
