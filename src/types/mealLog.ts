// ─────────────────────────────────────────
// MEAL LOG — GASTRO HUB (A4)
// Expanded nutrition data structures replacing the too-thin NutritionStats.
// Covers: food group classification (FOOD SUPPLEMENTAL doc), nutritional
// values per item, consumption logging against daily targets, and the FDA
// recommended daily values as constants (FDA DAILY VALUES doc).
// Radar axis sets (nutrients + food groups) follow the supplemental schema.
// ─────────────────────────────────────────

// ── NUTRIENT RADAR AXES (FOOD SUPPLEMENTAL · radar_1_nutrients) ───────────────

export type NutrientId =
  | 'NUT_MAC_FAT'
  | 'NUT_MAC_SATFAT'
  | 'NUT_MAC_CARB'
  | 'NUT_MAC_FIBER'
  | 'NUT_MAC_SUGAR'
  | 'NUT_MAC_PROT'
  | 'NUT_MIN_SOD'
  | 'NUT_MIN_POT'
  | 'NUT_MIN_CAL'
  | 'NUT_MIN_IRON'
  | 'NUT_VIT_A'
  | 'NUT_VIT_C'
  | 'NUT_VIT_D';

export type NutrientAxisGroup = 'Macronutrients' | 'Minerals' | 'Vitamins';

/** 'target' = aim to reach; 'upper_limit' = stay below. */
export type NutrientMetricType = 'target' | 'upper_limit';

export interface NutrientTarget {
  id: NutrientId;
  displayName: string;
  axisGroup: NutrientAxisGroup;
  /** Recommended daily value (FDA, 2000-calorie reference diet). */
  dailyValue: number;
  unit: string;
  metricType: NutrientMetricType;
}

/** Daily nutrient targets — radar axis set 1. Values sourced from the FDA Daily Values doc. */
export const NUTRIENT_TARGETS: readonly NutrientTarget[] = [
  { id: 'NUT_MAC_FAT', displayName: 'Total Fat', axisGroup: 'Macronutrients', dailyValue: 78.0, unit: 'g', metricType: 'upper_limit' },
  { id: 'NUT_MAC_SATFAT', displayName: 'Saturated Fat', axisGroup: 'Macronutrients', dailyValue: 20.0, unit: 'g', metricType: 'upper_limit' },
  { id: 'NUT_MAC_CARB', displayName: 'Total Carbohydrates', axisGroup: 'Macronutrients', dailyValue: 275.0, unit: 'g', metricType: 'target' },
  { id: 'NUT_MAC_FIBER', displayName: 'Dietary Fiber', axisGroup: 'Macronutrients', dailyValue: 28.0, unit: 'g', metricType: 'target' },
  { id: 'NUT_MAC_SUGAR', displayName: 'Added Sugars', axisGroup: 'Macronutrients', dailyValue: 50.0, unit: 'g', metricType: 'upper_limit' },
  { id: 'NUT_MAC_PROT', displayName: 'Protein', axisGroup: 'Macronutrients', dailyValue: 50.0, unit: 'g', metricType: 'target' },
  { id: 'NUT_MIN_SOD', displayName: 'Sodium', axisGroup: 'Minerals', dailyValue: 2300.0, unit: 'mg', metricType: 'upper_limit' },
  { id: 'NUT_MIN_POT', displayName: 'Potassium', axisGroup: 'Minerals', dailyValue: 4700.0, unit: 'mg', metricType: 'target' },
  { id: 'NUT_MIN_CAL', displayName: 'Calcium', axisGroup: 'Minerals', dailyValue: 1300.0, unit: 'mg', metricType: 'target' },
  { id: 'NUT_MIN_IRON', displayName: 'Iron', axisGroup: 'Minerals', dailyValue: 18.0, unit: 'mg', metricType: 'target' },
  { id: 'NUT_VIT_A', displayName: 'Vitamin A', axisGroup: 'Vitamins', dailyValue: 900.0, unit: 'mcg RAE', metricType: 'target' },
  { id: 'NUT_VIT_C', displayName: 'Vitamin C', axisGroup: 'Vitamins', dailyValue: 90.0, unit: 'mg', metricType: 'target' },
  { id: 'NUT_VIT_D', displayName: 'Vitamin D', axisGroup: 'Vitamins', dailyValue: 20.0, unit: 'mcg', metricType: 'target' },
] as const;

// ── FOOD GROUPS (FOOD SUPPLEMENTAL · radar_2_food_groups) ─────────────────────

export type FoodGroupId =
  | 'FG_VEG_DARK_GREEN'
  | 'FG_VEG_RED_ORANGE'
  | 'FG_VEG_STARCHY'
  | 'FG_VEG_LEGUMES'
  | 'FG_VEG_OTHER'
  | 'FG_FRUIT_WHOLE'
  | 'FG_FRUIT_JUICE'
  | 'FG_GRAIN_WHOLE'
  | 'FG_GRAIN_REFINED'
  | 'FG_PROT_MEAT_POULTRY_EGG'
  | 'FG_PROT_SEAFOOD'
  | 'FG_PROT_NUTS_SEEDS'
  | 'FG_DAIRY_LIQUID_YOGURT'
  | 'FG_DAIRY_CHEESE'
  | 'FG_DAIRY_SOY_FORTIFIED'
  | 'FATS_PLANT_OILS'
  | 'FATS_SOLID_ANIMAL';

export type FoodGroupParent =
  | 'Vegetables'
  | 'Vegetables & Proteins'
  | 'Fruits'
  | 'Grains'
  | 'Protein Foods'
  | 'Dairy'
  | 'Dairy Alternatives'
  | 'Oils & Fats';

export interface FoodGroupDef {
  id: FoodGroupId;
  displayName: string;
  parentGroup: FoodGroupParent;
  metricTracked: string;
  /** Fixed axis position — radar axis set 2. */
  radarAxisIndex: number;
  exampleIngredients: readonly string[];
}

/** Food group classification — radar axis set 2. Sourced from the Food Supplemental doc. */
export const FOOD_GROUPS: readonly FoodGroupDef[] = [
  { id: 'FG_VEG_DARK_GREEN', displayName: 'Dark-Green Vegetables', parentGroup: 'Vegetables', metricTracked: 'servings_or_cups', radarAxisIndex: 0, exampleIngredients: ['spinach', 'kale', 'broccoli', 'romaine'] },
  { id: 'FG_VEG_RED_ORANGE', displayName: 'Red & Orange Vegetables', parentGroup: 'Vegetables', metricTracked: 'servings_or_cups', radarAxisIndex: 1, exampleIngredients: ['carrots', 'sweet potatoes', 'tomatoes', 'bell peppers'] },
  { id: 'FG_VEG_STARCHY', displayName: 'Starchy Vegetables', parentGroup: 'Vegetables', metricTracked: 'servings_or_cups', radarAxisIndex: 2, exampleIngredients: ['potatoes', 'corn', 'green peas'] },
  { id: 'FG_VEG_LEGUMES', displayName: 'Beans, Peas, & Lentils', parentGroup: 'Vegetables & Proteins', metricTracked: 'servings_or_cups', radarAxisIndex: 3, exampleIngredients: ['black beans', 'chickpeas', 'lentils'] },
  { id: 'FG_VEG_OTHER', displayName: 'Other Vegetables', parentGroup: 'Vegetables', metricTracked: 'servings_or_cups', radarAxisIndex: 4, exampleIngredients: ['onions', 'mushrooms', 'zucchini', 'cucumber'] },
  { id: 'FG_FRUIT_WHOLE', displayName: 'Whole Fruits', parentGroup: 'Fruits', metricTracked: 'servings_or_cups', radarAxisIndex: 5, exampleIngredients: ['apples', 'berries', 'bananas', 'oranges'] },
  { id: 'FG_FRUIT_JUICE', displayName: '100% Fruit Juice', parentGroup: 'Fruits', metricTracked: 'servings_or_fl_oz', radarAxisIndex: 6, exampleIngredients: ['orange juice', 'apple juice'] },
  { id: 'FG_GRAIN_WHOLE', displayName: 'Whole Grains', parentGroup: 'Grains', metricTracked: 'servings_or_ounces', radarAxisIndex: 7, exampleIngredients: ['oats', 'brown rice', 'quinoa', 'whole wheat bread'] },
  { id: 'FG_GRAIN_REFINED', displayName: 'Refined Grains', parentGroup: 'Grains', metricTracked: 'servings_or_ounces', radarAxisIndex: 8, exampleIngredients: ['white rice', 'white bread', 'regular pasta'] },
  { id: 'FG_PROT_MEAT_POULTRY_EGG', displayName: 'Meat, Poultry, & Eggs', parentGroup: 'Protein Foods', metricTracked: 'ounces_equivalent', radarAxisIndex: 9, exampleIngredients: ['chicken breast', 'lean beef', 'eggs', 'turkey'] },
  { id: 'FG_PROT_SEAFOOD', displayName: 'Seafood', parentGroup: 'Protein Foods', metricTracked: 'ounces_equivalent', radarAxisIndex: 10, exampleIngredients: ['salmon', 'tuna', 'shrimp'] },
  { id: 'FG_PROT_NUTS_SEEDS', displayName: 'Nuts, Seeds, & Soy', parentGroup: 'Protein Foods', metricTracked: 'ounces_equivalent', radarAxisIndex: 11, exampleIngredients: ['almonds', 'chia seeds', 'tofu', 'peanut butter'] },
  { id: 'FG_DAIRY_LIQUID_YOGURT', displayName: 'Milk & Yogurt', parentGroup: 'Dairy', metricTracked: 'servings_or_cups', radarAxisIndex: 12, exampleIngredients: ['low-fat milk', 'greek yogurt', 'kefir'] },
  { id: 'FG_DAIRY_CHEESE', displayName: 'Cheese', parentGroup: 'Dairy', metricTracked: 'ounces', radarAxisIndex: 13, exampleIngredients: ['cheddar', 'mozzarella', 'cottage cheese'] },
  { id: 'FG_DAIRY_SOY_FORTIFIED', displayName: 'Fortified Soy Milk', parentGroup: 'Dairy Alternatives', metricTracked: 'servings_or_cups', radarAxisIndex: 14, exampleIngredients: ['fortified soy milk', 'soy yogurt'] },
  { id: 'FATS_PLANT_OILS', displayName: 'Plant Oils', parentGroup: 'Oils & Fats', metricTracked: 'grams_or_teaspoons', radarAxisIndex: 15, exampleIngredients: ['olive oil', 'avocado oil'] },
  { id: 'FATS_SOLID_ANIMAL', displayName: 'Solid & Animal Fats', parentGroup: 'Oils & Fats', metricTracked: 'grams_or_teaspoons', radarAxisIndex: 16, exampleIngredients: ['butter', 'lard', 'coconut oil'] },
] as const;

// ── FULL FDA DAILY VALUE REFERENCE (FDA DAILY VALUES doc) ─────────────────────

export type FdaGuidelineType = 'target' | 'upper_limit';

export interface FdaDailyValue {
  name: string;
  dailyValue: number;
  unit: string;
  guidelineType: FdaGuidelineType;
}

/** Reference diet the daily values are based on (FDA post-2016 labeling rule). */
export const FDA_REFERENCE_DIET_CALORIES = 2000;

/** Complete FDA recommended daily values — reference constants beyond the radar axis set. */
export const FDA_DAILY_VALUES: readonly FdaDailyValue[] = [
  { name: 'Total Fat', dailyValue: 78.0, unit: 'g', guidelineType: 'target' },
  { name: 'Saturated Fat', dailyValue: 20.0, unit: 'g', guidelineType: 'upper_limit' },
  { name: 'Cholesterol', dailyValue: 300.0, unit: 'mg', guidelineType: 'upper_limit' },
  { name: 'Sodium', dailyValue: 2300.0, unit: 'mg', guidelineType: 'upper_limit' },
  { name: 'Total Carbohydrates', dailyValue: 275.0, unit: 'g', guidelineType: 'target' },
  { name: 'Dietary Fiber', dailyValue: 28.0, unit: 'g', guidelineType: 'target' },
  { name: 'Added Sugars', dailyValue: 50.0, unit: 'g', guidelineType: 'upper_limit' },
  { name: 'Protein', dailyValue: 50.0, unit: 'g', guidelineType: 'target' },
  { name: 'Vitamin A', dailyValue: 900.0, unit: 'mcg RAE', guidelineType: 'target' },
  { name: 'Vitamin C', dailyValue: 90.0, unit: 'mg', guidelineType: 'target' },
  { name: 'Vitamin D', dailyValue: 20.0, unit: 'mcg', guidelineType: 'target' },
  { name: 'Vitamin E', dailyValue: 15.0, unit: 'mg', guidelineType: 'target' },
  { name: 'Vitamin K', dailyValue: 120.0, unit: 'mcg', guidelineType: 'target' },
  { name: 'Thiamin', dailyValue: 1.2, unit: 'mg', guidelineType: 'target' },
  { name: 'Riboflavin', dailyValue: 1.3, unit: 'mg', guidelineType: 'target' },
  { name: 'Niacin', dailyValue: 16.0, unit: 'mg NE', guidelineType: 'target' },
  { name: 'Vitamin B6', dailyValue: 1.7, unit: 'mg', guidelineType: 'target' },
  { name: 'Folate', dailyValue: 400.0, unit: 'mcg DFE', guidelineType: 'target' },
  { name: 'Vitamin B12', dailyValue: 2.4, unit: 'mcg', guidelineType: 'target' },
  { name: 'Biotin', dailyValue: 30.0, unit: 'mcg', guidelineType: 'target' },
  { name: 'Pantothenic Acid', dailyValue: 5.0, unit: 'mg', guidelineType: 'target' },
  { name: 'Calcium', dailyValue: 1300.0, unit: 'mg', guidelineType: 'target' },
  { name: 'Iron', dailyValue: 18.0, unit: 'mg', guidelineType: 'target' },
  { name: 'Potassium', dailyValue: 4700.0, unit: 'mg', guidelineType: 'target' },
  { name: 'Phosphorus', dailyValue: 1250.0, unit: 'mg', guidelineType: 'target' },
  { name: 'Iodine', dailyValue: 150.0, unit: 'mcg', guidelineType: 'target' },
  { name: 'Magnesium', dailyValue: 420.0, unit: 'mg', guidelineType: 'target' },
  { name: 'Zinc', dailyValue: 11.0, unit: 'mg', guidelineType: 'target' },
  { name: 'Selenium', dailyValue: 55.0, unit: 'mcg', guidelineType: 'target' },
  { name: 'Copper', dailyValue: 0.9, unit: 'mg', guidelineType: 'target' },
  { name: 'Manganese', dailyValue: 2.3, unit: 'mg', guidelineType: 'target' },
  { name: 'Chromium', dailyValue: 35.0, unit: 'mcg', guidelineType: 'target' },
  { name: 'Molybdenum', dailyValue: 45.0, unit: 'mcg', guidelineType: 'target' },
  { name: 'Chloride', dailyValue: 2300.0, unit: 'mg', guidelineType: 'target' },
  { name: 'Choline', dailyValue: 550.0, unit: 'mg', guidelineType: 'target' },
] as const;

// ── MEAL LOG ENTRIES ──────────────────────────────────────────────────────────

export type MealLogSource = 'recipe' | 'inventory' | 'manual';

/**
 * One logged consumption event. Timestamped entries accumulate against the
 * daily targets above (consumption logging, last-N-day averages).
 */
export interface MealLogEntry {
  /** uuid */
  id: string;
  /** App date the consumption counts against — YYYY-MM-DD */
  date: string;
  /** ISO datetime of the log action */
  timestamp: string;
  /** Display label — recipe or item name */
  label: string;
  /** What produced the entry: a Cook Book recipe, a Food Core item, or manual. */
  source: MealLogSource;
  /** TaskTemplate id (recipe) or InventoryItemTemplate id (item). */
  sourceRef?: string | null;
  /** Nutritional values consumed, keyed by radar nutrient axis. */
  nutrients: Partial<Record<NutrientId, number>>;
  /** Food group servings consumed, keyed by food group axis. */
  foodGroups?: Partial<Record<FoodGroupId, number>>;
}

// ── NORMALIZATION HELPERS ─────────────────────────────────────────────────────

const NUTRIENT_ID_SET = new Set<string>(NUTRIENT_TARGETS.map((t) => t.id));

/**
 * Free-form nutritionalValue keys (InventoryItemTemplate / TaskTemplate carry
 * Record<string, number>) → canonical NutrientId. Normalize-on-read, same
 * precedent as normalizeCircuitInputFields.
 */
const NUTRIENT_KEY_ALIASES: Record<string, NutrientId> = {
  fat: 'NUT_MAC_FAT',
  totalfat: 'NUT_MAC_FAT',
  fats: 'NUT_MAC_FAT',
  saturatedfat: 'NUT_MAC_SATFAT',
  satfat: 'NUT_MAC_SATFAT',
  carb: 'NUT_MAC_CARB',
  carbs: 'NUT_MAC_CARB',
  carbohydrate: 'NUT_MAC_CARB',
  carbohydrates: 'NUT_MAC_CARB',
  totalcarbohydrates: 'NUT_MAC_CARB',
  fiber: 'NUT_MAC_FIBER',
  dietaryfiber: 'NUT_MAC_FIBER',
  fibre: 'NUT_MAC_FIBER',
  sugar: 'NUT_MAC_SUGAR',
  sugars: 'NUT_MAC_SUGAR',
  addedsugar: 'NUT_MAC_SUGAR',
  addedsugars: 'NUT_MAC_SUGAR',
  protein: 'NUT_MAC_PROT',
  sodium: 'NUT_MIN_SOD',
  salt: 'NUT_MIN_SOD',
  potassium: 'NUT_MIN_POT',
  calcium: 'NUT_MIN_CAL',
  iron: 'NUT_MIN_IRON',
  vitamina: 'NUT_VIT_A',
  vitaminc: 'NUT_VIT_C',
  vitamind: 'NUT_VIT_D',
};

/**
 * Normalize a free-form nutritionalValue record to canonical NutrientId keys.
 * Exact NutrientId keys pass through; known aliases map; unknown keys drop.
 */
export function normalizeNutrientRecord(
  record: Record<string, number> | null | undefined,
): Partial<Record<NutrientId, number>> {
  const result: Partial<Record<NutrientId, number>> = {};
  if (!record) return result;

  for (const [rawKey, rawValue] of Object.entries(record)) {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) continue;

    let id: NutrientId | undefined;
    if (NUTRIENT_ID_SET.has(rawKey)) {
      id = rawKey as NutrientId;
    } else {
      id = NUTRIENT_KEY_ALIASES[rawKey.toLowerCase().replace(/[\s_-]/g, '')];
    }
    if (!id) continue;

    result[id] = (result[id] ?? 0) + rawValue;
  }

  return result;
}

/** Sum nutrient records (e.g. all of a day's entries) into one total record. */
export function sumNutrientRecords(
  records: ReadonlyArray<Partial<Record<NutrientId, number>>>,
): Partial<Record<NutrientId, number>> {
  const total: Partial<Record<NutrientId, number>> = {};
  for (const record of records) {
    for (const [id, value] of Object.entries(record) as Array<[NutrientId, number]>) {
      total[id] = (total[id] ?? 0) + value;
    }
  }
  return total;
}

/** Sum food group serving records into one total record. */
export function sumFoodGroupRecords(
  records: ReadonlyArray<Partial<Record<FoodGroupId, number>> | undefined>,
): Partial<Record<FoodGroupId, number>> {
  const total: Partial<Record<FoodGroupId, number>> = {};
  for (const record of records) {
    if (!record) continue;
    for (const [id, value] of Object.entries(record) as Array<[FoodGroupId, number]>) {
      total[id] = (total[id] ?? 0) + value;
    }
  }
  return total;
}

/**
 * Best-effort food group classification by item name against the supplemental
 * doc's example ingredients. Returns null when nothing matches.
 */
export function classifyFoodGroup(name: string): FoodGroupDef | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;

  for (const group of FOOD_GROUPS) {
    for (const ingredient of group.exampleIngredients) {
      if (needle.includes(ingredient) || ingredient.includes(needle)) {
        return group;
      }
    }
  }
  return null;
}
