// ─────────────────────────────────────────
// Gastro Hub — shared nutrition helpers (A4).
// Maps meal-log nutrient totals onto RadarChart axes and identifies
// recipe templates (TaskTemplate recipe fields are canonical — the legacy
// DocResource docType:'recipe' shape is NOT used here).
// ─────────────────────────────────────────

import type { RadarAxisDatum } from '../../../../../shared/charts/RadarChart';
import type { TaskTemplate } from '../../../../../../types/taskTemplate';
import type { NutrientId } from '../../../../../../types/mealLog';
import { NUTRIENT_TARGETS } from '../../../../../../types/mealLog';

/** Compact axis labels for the nutrient radar. */
export const NUTRIENT_SHORT_LABELS: Record<NutrientId, string> = {
  NUT_MAC_FAT: 'Fat',
  NUT_MAC_SATFAT: 'SatFat',
  NUT_MAC_CARB: 'Carbs',
  NUT_MAC_FIBER: 'Fiber',
  NUT_MAC_SUGAR: 'Sugar',
  NUT_MAC_PROT: 'Protein',
  NUT_MIN_SOD: 'Na',
  NUT_MIN_POT: 'K',
  NUT_MIN_CAL: 'Ca',
  NUT_MIN_IRON: 'Fe',
  NUT_VIT_A: 'Vit A',
  NUT_VIT_C: 'Vit C',
  NUT_VIT_D: 'Vit D',
};

/** Nutrient totals → radar axes against the FDA daily targets. */
export function buildNutrientAxes(
  totals: Partial<Record<NutrientId, number>>,
): RadarAxisDatum[] {
  return NUTRIENT_TARGETS.map((target) => ({
    key: target.id,
    label: NUTRIENT_SHORT_LABELS[target.id],
    value: totals[target.id] ?? 0,
    max: target.dailyValue,
  }));
}

/** "42 / 50 g" style summary line for a nutrient against its daily target. */
export function formatNutrientVsTarget(id: NutrientId, value: number): string {
  const target = NUTRIENT_TARGETS.find((t) => t.id === id);
  if (!target) return `${Math.round(value * 10) / 10}`;
  return `${Math.round(value * 10) / 10} / ${target.dailyValue} ${target.unit}`;
}

/**
 * Recipe templates — canonical source is TaskTemplate recipe fields
 * (durationEstimate / nutritionalValue / craftsItem / difficulty) with the
 * CONSUME execution mechanic and the 'nutrition' secondary tag.
 */
export function isRecipeTemplate(template: TaskTemplate): boolean {
  if (template.isSystem) return false;
  if (template.secondaryTag !== 'nutrition') return false;
  return (
    template.taskType === 'CONSUME' ||
    template.nutritionalValue != null ||
    template.craftsItem != null
  );
}
