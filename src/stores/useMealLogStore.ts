// ─────────────────────────────────────────
// useMealLogStore — MEAL LOG STORE (GASTRO HUB A4)
// Persisted consumption log: timestamped entries with per-meal nutrition and
// food group servings, logged against the FDA recommended daily targets.
// Daily target constants live in types/mealLog and are re-exported here.
// ─────────────────────────────────────────

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { FoodGroupId, MealLogEntry, NutrientId } from '../types/mealLog';
import {
  FDA_DAILY_VALUES,
  FDA_REFERENCE_DIET_CALORIES,
  FOOD_GROUPS,
  NUTRIENT_TARGETS,
  sumFoodGroupRecords,
  sumNutrientRecords,
} from '../types/mealLog';
import { getAppDate, getAppNowISO } from '../utils/dateUtils';

// Recommended daily values as constants, sourced from the FDA doc (A4).
export { FDA_DAILY_VALUES, FDA_REFERENCE_DIET_CALORIES, FOOD_GROUPS, NUTRIENT_TARGETS };

// ── STATE ─────────────────────────────────────────────────────────────────────

interface MealLogState {
  /** All logged consumption events, newest last. */
  entries: MealLogEntry[];
}

// ── ACTIONS ───────────────────────────────────────────────────────────────────

export type MealLogDraft = Omit<MealLogEntry, 'id' | 'date' | 'timestamp'> &
  Partial<Pick<MealLogEntry, 'date' | 'timestamp'>>;

interface MealLogActions {
  /** Log a consumption event. Date/timestamp default to the current app date. */
  logMeal: (draft: MealLogDraft) => MealLogEntry;
  removeEntry: (id: string) => void;
  reset: () => void;
}

// ── INITIAL STATE ─────────────────────────────────────────────────────────────

const initialState: MealLogState = {
  entries: [],
};

// ── STORE ─────────────────────────────────────────────────────────────────────

export const useMealLogStore = create<MealLogState & MealLogActions>()(
  persist(
    (set) => ({
      ...initialState,

      logMeal: (draft) => {
        const entry: MealLogEntry = {
          id: uuidv4(),
          date: draft.date ?? getAppDate(),
          timestamp: draft.timestamp ?? getAppNowISO(),
          label: draft.label,
          source: draft.source,
          sourceRef: draft.sourceRef ?? null,
          nutrients: draft.nutrients,
          foodGroups: draft.foodGroups,
        };
        set((state) => ({ entries: [...state.entries, entry] }));
        return entry;
      },

      removeEntry: (id) =>
        set((state) => ({ entries: state.entries.filter((entry) => entry.id !== id) })),

      reset: () => set(initialState),
    }),
    {
      name: 'cdb-meal-log',
    },
  ),
);

// ── SELECTOR HELPERS ──────────────────────────────────────────────────────────

export function entriesForDate(entries: MealLogEntry[], date: string): MealLogEntry[] {
  return entries.filter((entry) => entry.date === date);
}

/** Total nutrients consumed on a given app date. */
export function nutrientTotalsForDate(
  entries: MealLogEntry[],
  date: string,
): Partial<Record<NutrientId, number>> {
  return sumNutrientRecords(entriesForDate(entries, date).map((entry) => entry.nutrients));
}

/** Total food group servings consumed on a given app date. */
export function foodGroupTotalsForDate(
  entries: MealLogEntry[],
  date: string,
): Partial<Record<FoodGroupId, number>> {
  return sumFoodGroupRecords(entriesForDate(entries, date).map((entry) => entry.foodGroups));
}
