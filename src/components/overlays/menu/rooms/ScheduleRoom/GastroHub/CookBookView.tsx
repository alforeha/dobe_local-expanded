// ─────────────────────────────────────────
// Cook Book — Gastro Hub (A4).
// Surfaces recipe templates (canonical source: TaskTemplate recipe fields) in
// the HabitatRow pattern. Executing a recipe runs the existing CONSUME
// mechanic (eventExecution decrements inventory) and logs the recipe's
// nutrition against the meal log daily targets.
// ─────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { useMealLogStore } from '../../../../../../stores/useMealLogStore';
import { taskTemplateLibrary } from '../../../../../../coach';
import type { ConsumeInputFields, TaskTemplate } from '../../../../../../types/taskTemplate';
import type { FoodGroupId } from '../../../../../../types/mealLog';
import { classifyFoodGroup, normalizeNutrientRecord } from '../../../../../../types/mealLog';
import {
  getUserInventoryItemTemplates,
  resolveInventoryItemTemplate,
} from '../../../../../../utils/inventoryItems';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { RadarChart } from '../../../../../shared/charts/RadarChart';
import { HabitatShell } from '../../../../../shared/habitat/HabitatShell';
import {
  HabitatSidePanel,
  type HabitatSidePanelSection,
} from '../../../../../shared/habitat/HabitatSidePanel';
import { HabitatTopBar } from '../../../../../shared/habitat/HabitatTopBar';
import { HabitatRow } from '../../../../../shared/habitat/HabitatRow';
import { HabitatRowExpanded } from '../../../../../shared/habitat/HabitatRowExpanded';
import { buildNutrientAxes, isRecipeTemplate } from './gastroNutrition';
import { RecipePopup } from './RecipePopup';

type RecipePopupState =
  | { mode: 'add' }
  | { mode: 'config'; key: string; template: TaskTemplate }
  | null;

interface RecipeRow {
  key: string;
  template: TaskTemplate;
  isCustom: boolean;
}

interface CookBookViewProps {
  onExpandedChange?: (isExpanded: boolean) => void;
}

function recipeEntries(template: TaskTemplate) {
  return template.taskType === 'CONSUME'
    ? ((template.inputFields as ConsumeInputFields).entries ?? [])
    : [];
}

export function CookBookView({ onExpandedChange }: CookBookViewProps) {
  const customTemplates = useScheduleStore((s) => s.taskTemplates);
  const setTaskTemplate = useScheduleStore((s) => s.setTaskTemplate);
  const user = useUserStore((s) => s.user);
  const logMeal = useMealLogStore((s) => s.logMeal);

  const [panelOpen, setPanelOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [recipePopup, setRecipePopup] = useState<RecipePopupState>(null);

  useEffect(() => {
    onExpandedChange?.(expandedKey !== null);
  }, [expandedKey, onExpandedChange]);

  const userTemplates = getUserInventoryItemTemplates(user);

  // ── Recipe pool: custom recipes + uncloned library recipes ─────────────────
  const recipes = useMemo<RecipeRow[]>(() => {
    const custom: RecipeRow[] = Object.entries(customTemplates)
      .filter(([, template]) => isRecipeTemplate(template))
      .map(([key, template]) => ({ key, template: { ...template, id: template.id ?? key }, isCustom: true }));

    const clonedIds = new Set(
      custom.map((row) => row.template.sourceTemplateId).filter(Boolean) as string[],
    );

    const library: RecipeRow[] = (taskTemplateLibrary as TaskTemplate[])
      .filter(
        (template) =>
          isRecipeTemplate(template) && !!template.id && !clonedIds.has(template.id),
      )
      .map((template) => ({ key: template.id as string, template, isCustom: false }));

    return [...custom, ...library].sort((a, b) => a.template.name.localeCompare(b.template.name));
  }, [customTemplates]);

  const filtered = recipes.filter((row) => {
    const q = search.trim().toLowerCase();
    return q === '' || row.template.name.toLowerCase().includes(q);
  });

  function resolveItemName(itemTemplateRef: string): string {
    return (
      resolveInventoryItemTemplate(itemTemplateRef, userTemplates)?.name ?? itemTemplateRef
    );
  }

  /** Food group servings for a recipe — classified from its ingredients. */
  function foodGroupsForRecipe(
    template: TaskTemplate,
  ): Partial<Record<FoodGroupId, number>> | undefined {
    const totals: Partial<Record<FoodGroupId, number>> = {};
    for (const entry of recipeEntries(template)) {
      const group = classifyFoodGroup(resolveItemName(entry.itemTemplateRef));
      if (!group) continue;
      totals[group.id] = (totals[group.id] ?? 0) + entry.quantity;
    }
    return Object.keys(totals).length > 0 ? totals : undefined;
  }

  /** Inventory decrement happens inside completeTask (CONSUME) — here we log the meal. */
  function logRecipeMeal(row: RecipeRow) {
    logMeal({
      label: row.template.name,
      source: 'recipe',
      sourceRef: row.template.id ?? row.key,
      nutrients: normalizeNutrientRecord(row.template.nutritionalValue),
      foodGroups: foodGroupsForRecipe(row.template),
    });
  }

  function addToCookBook(template: TaskTemplate) {
    const alreadyAdded = Object.values(customTemplates).some(
      (candidate) => candidate.sourceTemplateId === template.id,
    );
    if (alreadyAdded) return;
    const newKey = uuidv4();
    setTaskTemplate(newKey, {
      ...template,
      isCustom: true,
      id: newKey,
      sourceTemplateId: template.id,
    });
  }

  // ── Side panel: cook book stats ─────────────────────────────────────────────
  const customCount = recipes.filter((row) => row.isCustom).length;
  const sidePanelSections: HabitatSidePanelSection[] = [
    {
      key: 'my-recipes',
      label: 'My Recipes',
      shortLabel: 'RCP',
      value: customCount,
      rows: recipes
        .filter((row) => row.isCustom)
        .map((row) => (
          <span key={row.key} className="truncate text-xs text-gray-600 dark:text-gray-300">
            {row.template.name}
          </span>
        )),
      onAdd: () => setRecipePopup({ mode: 'add' }),
    },
    {
      key: 'catalog',
      label: 'Catalog',
      shortLabel: 'CAT',
      value: recipes.length - customCount,
      rows: recipes
        .filter((row) => !row.isCustom)
        .map((row) => (
          <span key={row.key} className="truncate text-xs text-gray-600 dark:text-gray-300">
            {row.template.name}
          </span>
        )),
    },
  ];

  const sidePanel = (
    <HabitatSidePanel
      sections={sidePanelSections}
      open={panelOpen}
      onOpenChange={setPanelOpen}
      emptyRowsLabel="None yet"
    />
  );

  const topBar = !expandedKey ? (
    <HabitatTopBar
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search recipes..."
      onCreateCustom={() => setRecipePopup({ mode: 'add' })}
    />
  ) : undefined;

  return (
    <HabitatShell sidePanel={sidePanel} topBar={topBar}>
      <div className="flex flex-col gap-2 overflow-y-auto px-4 py-3">
        {filtered.map((row) => {
          if (expandedKey !== null && expandedKey !== row.key) return null;
          const isExpanded = expandedKey === row.key;
          const entries = recipeEntries(row.template);
          const nutrients = normalizeNutrientRecord(row.template.nutritionalValue);
          const hasNutrients = Object.keys(nutrients).length > 0;

          const summaryParts = [
            row.template.difficulty,
            row.template.durationEstimate != null
              ? `${row.template.durationEstimate} min`
              : null,
            `${entries.length} ingredient${entries.length === 1 ? '' : 's'}`,
          ].filter(Boolean);

          const detail = (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {row.template.description || 'No description yet.'}
              </p>

              {entries.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Ingredients (consumed from inventory on cook)
                  </span>
                  {entries.map((entry) => (
                    <span
                      key={`${row.key}-${entry.itemTemplateRef}`}
                      className="text-xs text-gray-600 dark:text-gray-300"
                    >
                      {entry.quantity} × {resolveItemName(entry.itemTemplateRef)}
                    </span>
                  ))}
                </div>
              )}

              {hasNutrients && (
                <div className="flex flex-col items-start gap-1">
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Nutrition vs daily targets
                  </span>
                  <RadarChart
                    axes={buildNutrientAxes(nutrients)}
                    size={150}
                    title={`${row.template.name} nutrition against FDA daily targets`}
                  />
                </div>
              )}
            </div>
          );

          return (
            <HabitatRow
              key={row.key}
              expanded={isExpanded}
              soloExpanded={isExpanded}
              onToggleExpand={() => setExpandedKey(isExpanded ? null : row.key)}
              icon={<IconDisplay iconKey={row.template.icon} size={22} />}
              name={row.template.name}
              summary={summaryParts.join(' · ')}
              pill={
                row.isCustom ? undefined : (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    Catalog
                  </span>
                )
              }
            >
              {row.isCustom ? (
                <HabitatRowExpanded
                  templateKey={row.key}
                  template={row.template}
                  onCollapse={() => setExpandedKey(null)}
                  onExecuted={() => logRecipeMeal(row)}
                  onConfigure={() =>
                    setRecipePopup({ mode: 'config', key: row.key, template: row.template })
                  }
                >
                  {detail}
                </HabitatRowExpanded>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{detail}</div>
                  <div className="mt-auto shrink-0 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => {
                        addToCookBook(row.template);
                        setExpandedKey(null);
                      }}
                      className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90"
                    >
                      Add to Cook Book
                    </button>
                  </div>
                </div>
              )}
            </HabitatRow>
          );
        })}

        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
            No recipes yet. Create one with the + button.
          </p>
        )}
      </div>

      {recipePopup !== null && (
        <RecipePopup
          editKey={recipePopup.mode === 'config' ? recipePopup.key : null}
          editTemplate={recipePopup.mode === 'config' ? recipePopup.template : null}
          onClose={() => setRecipePopup(null)}
        />
      )}
    </HabitatShell>
  );
}
