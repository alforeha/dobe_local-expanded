// ─────────────────────────────────────────
// Recipe popup — create / configure a Cook Book recipe (A4).
// Recipes are TaskTemplates (canonical recipe shape): CONSUME taskType with
// ingredient entries, plus the recipe fields durationEstimate /
// nutritionalValue / difficulty. DocResource docType:'recipe' is legacy and
// is not read or written here.
// ─────────────────────────────────────────

import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PopupShell } from '../../../../../shared/popups/PopupShell';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { itemLibrary } from '../../../../../../coach/ItemLibrary';
import type {
  ConsumeEntry,
  ConsumeInputFields,
  TaskTemplate,
} from '../../../../../../types/taskTemplate';
import type { NutrientId } from '../../../../../../types/mealLog';
import { NUTRIENT_TARGETS } from '../../../../../../types/mealLog';
import {
  getUserInventoryItemTemplates,
  mergeInventoryItemTemplates,
} from '../../../../../../utils/inventoryItems';

type Difficulty = NonNullable<TaskTemplate['difficulty']>;

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'] as const;

interface RecipePopupProps {
  /** Template key when configuring an existing custom recipe. */
  editKey?: string | null;
  editTemplate?: TaskTemplate | null;
  onClose: () => void;
}

interface IngredientDraft {
  id: string;
  itemTemplateRef: string;
  quantity: number;
}

const inputCls =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200';

const labelCls =
  'text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400';

export function RecipePopup({ editKey = null, editTemplate = null, onClose }: RecipePopupProps) {
  const setTaskTemplate = useScheduleStore((s) => s.setTaskTemplate);
  const user = useUserStore((s) => s.user);

  const editEntries =
    editTemplate?.taskType === 'CONSUME'
      ? ((editTemplate.inputFields as ConsumeInputFields).entries ?? [])
      : [];

  const [name, setName] = useState(editTemplate?.name ?? '');
  const [description, setDescription] = useState(editTemplate?.description ?? '');
  const [difficulty, setDifficulty] = useState<Difficulty>(editTemplate?.difficulty ?? 'easy');
  const [duration, setDuration] = useState<string>(
    editTemplate?.durationEstimate != null ? String(editTemplate.durationEstimate) : '',
  );
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(
    editEntries.map((entry) => ({
      id: uuidv4(),
      itemTemplateRef: entry.itemTemplateRef,
      quantity: entry.quantity,
    })),
  );
  const [nutrients, setNutrients] = useState<Partial<Record<NutrientId, string>>>(() => {
    const initial: Partial<Record<NutrientId, string>> = {};
    for (const target of NUTRIENT_TARGETS) {
      const value = editTemplate?.nutritionalValue?.[target.id];
      if (value != null) initial[target.id] = String(value);
    }
    return initial;
  });
  const [error, setError] = useState('');

  // Ingredient pool — user inventory item templates + library consumables.
  const itemPool = useMemo(() => {
    const libraryConsumables = itemLibrary
      .filter((item) => item.kind === 'consumable')
      .map((item) => ({ id: item.id, name: item.name, icon: item.icon }));
    return mergeInventoryItemTemplates(
      getUserInventoryItemTemplates(user),
      libraryConsumables,
    );
  }, [user]);

  function addIngredient() {
    const first = itemPool[0];
    if (!first) return;
    setIngredients((prev) => [
      ...prev,
      { id: uuidv4(), itemTemplateRef: first.id, quantity: 1 },
    ]);
  }

  function updateIngredient(id: string, patch: Partial<IngredientDraft>) {
    setIngredients((prev) =>
      prev.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)),
    );
  }

  function removeIngredient(id: string) {
    setIngredients((prev) => prev.filter((draft) => draft.id !== id));
  }

  function handleSave() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    const entries: ConsumeEntry[] = ingredients
      .filter((draft) => draft.itemTemplateRef && draft.quantity > 0)
      .map((draft) => ({
        itemTemplateRef: draft.itemTemplateRef,
        quantity: Math.max(1, Math.floor(draft.quantity)),
      }));

    const nutritionalValue: Record<string, number> = {};
    for (const target of NUTRIENT_TARGETS) {
      const raw = nutrients[target.id];
      if (raw == null || raw.trim() === '') continue;
      const value = Number(raw);
      if (Number.isFinite(value) && value > 0) nutritionalValue[target.id] = value;
    }

    const key = editKey ?? uuidv4();
    const parsedDuration = Number(duration);

    const template: TaskTemplate = {
      ...(editTemplate ?? {}),
      id: key,
      isCustom: true,
      name: name.trim(),
      description: description.trim(),
      icon: editTemplate?.icon ?? 'category-nutrition',
      taskType: 'CONSUME',
      inputFields: { label: `Cook ${name.trim()}`, entries } satisfies ConsumeInputFields,
      xpAward: editTemplate?.xpAward ?? {
        health: 5,
        strength: 0,
        agility: 0,
        defense: 0,
        charisma: 0,
        wisdom: 0,
      },
      cooldown: editTemplate?.cooldown ?? null,
      media: editTemplate?.media ?? null,
      items: editTemplate?.items ?? [],
      secondaryTag: 'nutrition',
      durationEstimate:
        duration.trim() !== '' && Number.isFinite(parsedDuration) && parsedDuration > 0
          ? parsedDuration
          : undefined,
      nutritionalValue:
        Object.keys(nutritionalValue).length > 0 ? nutritionalValue : undefined,
      difficulty,
    };

    setTaskTemplate(key, template);
    onClose();
  }

  return (
    <PopupShell title={editKey ? 'Configure Recipe' : 'Create Recipe'} onClose={onClose}>
      <div className="flex flex-col gap-4 px-4 py-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Name</label>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Veggie Stir Fry"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>Description</label>
          <textarea
            className={inputCls}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Steps, notes, tips..."
          />
        </div>

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label className={labelCls}>Difficulty</label>
            <select
              className={inputCls}
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              {DIFFICULTIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className={labelCls}>Duration (min)</label>
            <input
              className={inputCls}
              type="number"
              min={0}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. 30"
            />
          </div>
        </div>

        {/* Ingredients — CONSUME entries against inventory item templates */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className={labelCls}>Ingredients (consumed on cook)</label>
            <button
              type="button"
              onClick={addIngredient}
              disabled={itemPool.length === 0}
              className="rounded-full border border-accent-border px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent-bg disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Add
            </button>
          </div>
          {ingredients.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              No ingredients yet — cooking will not touch inventory.
            </p>
          )}
          {ingredients.map((draft) => (
            <div key={draft.id} className="flex items-center gap-2">
              <select
                className={`${inputCls} flex-1`}
                value={draft.itemTemplateRef}
                onChange={(e) => updateIngredient(draft.id, { itemTemplateRef: e.target.value })}
              >
                {itemPool.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <input
                className={`${inputCls} w-20`}
                type="number"
                min={1}
                value={draft.quantity}
                onChange={(e) =>
                  updateIngredient(draft.id, { quantity: Number(e.target.value) || 1 })
                }
              />
              <button
                type="button"
                aria-label="Remove ingredient"
                onClick={() => removeIngredient(draft.id)}
                className="shrink-0 text-lg leading-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Nutrition — logged against daily targets on cook */}
        <div className="flex flex-col gap-2">
          <label className={labelCls}>Nutrition per serving</label>
          <div className="grid grid-cols-2 gap-2">
            {NUTRIENT_TARGETS.map((target) => (
              <div key={target.id} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-xs text-gray-600 dark:text-gray-300">
                  {target.displayName}
                </span>
                <input
                  className={`${inputCls} flex-1`}
                  type="number"
                  min={0}
                  step="any"
                  value={nutrients[target.id] ?? ''}
                  placeholder={`${target.unit}`}
                  onChange={(e) =>
                    setNutrients((prev) => ({ ...prev, [target.id]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-accent">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            {editKey ? 'Save Recipe' : 'Create Recipe'}
          </button>
        </div>
      </div>
    </PopupShell>
  );
}
