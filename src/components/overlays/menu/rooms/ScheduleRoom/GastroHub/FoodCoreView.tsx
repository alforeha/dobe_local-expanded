// ─────────────────────────────────────────
// Food Core — Gastro Hub (A4).
// Surfaces the existing inventory substrate: ItemInstance.quantity/threshold/
// unit, the _genInventoryGTD low-stock trigger ("Restock X" GTD tasks fire
// when quantity <= threshold — surfaced here, not re-implemented), and
// InventoryItemTemplate.nutritionalValue wired into the meal log.
// Side panel: on-hand totals, food group breakdown, nutrient radar.
// ─────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import {
  foodGroupTotalsForDate,
  nutrientTotalsForDate,
  useMealLogStore,
} from '../../../../../../stores/useMealLogStore';
import { addShoppingItem, createShoppingList } from '../../../../../../engine/listsEngine';
import { isInventory } from '../../../../../../types/resource';
import type {
  InventoryItemTemplate,
  InventoryResource,
  ItemInstance,
} from '../../../../../../types/resource';
import type { FoodGroupDef, FoodGroupParent, NutrientId } from '../../../../../../types/mealLog';
import { classifyFoodGroup, normalizeNutrientRecord } from '../../../../../../types/mealLog';
import {
  getUserInventoryItemTemplates,
  mergeInventoryItemTemplates,
  resolveInventoryItemTemplate,
} from '../../../../../../utils/inventoryItems';
import { getAppDate } from '../../../../../../utils/dateUtils';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { RadarChart } from '../../../../../shared/charts/RadarChart';
import { HabitatShell } from '../../../../../shared/habitat/HabitatShell';
import {
  HabitatSidePanel,
  type HabitatSidePanelSection,
} from '../../../../../shared/habitat/HabitatSidePanel';
import { HabitatTopBar } from '../../../../../shared/habitat/HabitatTopBar';
import { HabitatRow } from '../../../../../shared/habitat/HabitatRow';
import { buildNutrientAxes, formatNutrientVsTarget } from './gastroNutrition';

const GROCERIES_LIST_NAME = 'Groceries';

const PARENT_GROUP_SHORT_LABELS: Record<FoodGroupParent, string> = {
  Vegetables: 'VEG',
  'Vegetables & Proteins': 'LEG',
  Fruits: 'FRT',
  Grains: 'GRN',
  'Protein Foods': 'PRO',
  Dairy: 'DRY',
  'Dairy Alternatives': 'SOY',
  'Oils & Fats': 'OIL',
};

interface FoodRow {
  key: string;
  resourceId: string;
  resourceName: string;
  containerId: string | null;
  instanceId: string;
  templateId: string;
  name: string;
  icon: string;
  description: string;
  quantity: number | null;
  threshold: number | null;
  unit: string | null;
  /** quantity <= threshold — same condition as _genInventoryGTD. */
  low: boolean;
  nutrients: Partial<Record<NutrientId, number>>;
  foodGroup: FoodGroupDef | null;
}

interface FoodCoreViewProps {
  onExpandedChange?: (isExpanded: boolean) => void;
}

export function FoodCoreView({ onExpandedChange }: FoodCoreViewProps) {
  const resources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const user = useUserStore((s) => s.user);
  const mealEntries = useMealLogStore((s) => s.entries);
  const logMeal = useMealLogStore((s) => s.logMeal);

  const [panelOpen, setPanelOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    onExpandedChange?.(expandedKey !== null);
  }, [expandedKey, onExpandedChange]);

  // ── Inventory rows (existing substrate — read, don't rebuild) ───────────────
  const rows = useMemo<FoodRow[]>(() => {
    const userTemplates = getUserInventoryItemTemplates(user);
    const inventories = Object.values(resources).filter(isInventory);
    const result: FoodRow[] = [];

    const pushRow = (
      resource: InventoryResource,
      item: ItemInstance,
      containerId: string | null,
      legacyTemplates: InventoryItemTemplate[],
    ) => {
      const resolved = resolveInventoryItemTemplate(item.itemTemplateRef, userTemplates);
      if (resolved && resolved.kind === 'facility') return;

      const mergedTemplates = mergeInventoryItemTemplates(userTemplates, legacyTemplates);
      const richTemplate = mergedTemplates.find((t) => t.id === item.itemTemplateRef);
      const name = resolved?.name ?? richTemplate?.name ?? item.itemTemplateRef;
      const quantity = item.quantity ?? null;
      const threshold = item.threshold ?? null;

      result.push({
        key: `${resource.id}:${containerId ?? 'loose'}:${item.id}`,
        resourceId: resource.id,
        resourceName: resource.name,
        containerId,
        instanceId: item.id,
        templateId: item.itemTemplateRef,
        name,
        icon: resolved?.icon ?? richTemplate?.icon ?? 'item-bread',
        description: resolved?.description ?? richTemplate?.description ?? '',
        quantity,
        threshold,
        unit: item.unit ?? null,
        low: threshold != null && quantity != null && quantity <= threshold,
        nutrients: normalizeNutrientRecord(richTemplate?.nutritionalValue),
        foodGroup: classifyFoodGroup(name),
      });
    };

    for (const resource of inventories) {
      const legacyTemplates = resource.itemTemplates ?? [];
      const containerItems = (resource.containers ?? []).flatMap((container) =>
        container.items.map((item) => ({ item, containerId: container.id })),
      );
      // Same fallback semantics as _genInventoryGTD: containers win when present.
      if (containerItems.length > 0) {
        for (const { item, containerId } of containerItems) {
          pushRow(resource, item, containerId, legacyTemplates);
        }
      } else {
        for (const item of resource.items) {
          pushRow(resource, item, null, legacyTemplates);
        }
      }
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [resources, user]);

  const filteredRows = rows.filter((row) => {
    const q = search.trim().toLowerCase();
    return q === '' || row.name.toLowerCase().includes(q);
  });

  const lowRows = rows.filter((row) => row.low);

  // ── Actions ─────────────────────────────────────────────────────────────────

  /** Decrement on-hand quantity and log the consumption against daily targets. */
  function consumeOne(row: FoodRow) {
    const resource = resources[row.resourceId];
    if (!resource || !isInventory(resource)) return;
    if ((row.quantity ?? 0) <= 0) return;

    const next = JSON.parse(JSON.stringify(resource)) as InventoryResource;
    const target = row.containerId
      ? next.containers
          ?.find((container) => container.id === row.containerId)
          ?.items.find((item) => item.id === row.instanceId)
      : next.items.find((item) => item.id === row.instanceId);
    if (!target) return;

    target.quantity = Math.max(0, (target.quantity ?? 0) - 1);
    setResource(next);

    logMeal({
      label: row.name,
      source: 'inventory',
      sourceRef: row.templateId,
      nutrients: row.nutrients,
      foodGroups: row.foodGroup ? { [row.foodGroup.id]: 1 } : undefined,
    });
  }

  /** Optional ShoppingList write for the surfaced low-stock trigger. */
  function addToShoppingList(row: FoodRow) {
    let currentUser = useUserStore.getState().user;
    if (!currentUser) return;

    let list = currentUser.lists.shoppingLists.find(
      (candidate) => candidate.name === GROCERIES_LIST_NAME,
    );
    if (!list) {
      list = createShoppingList(GROCERIES_LIST_NAME, currentUser);
      currentUser = useUserStore.getState().user ?? currentUser;
    }
    if (list.items.some((item) => !item.completed && item.useableRef === row.templateId)) return;

    const needed =
      row.threshold != null ? Math.max(1, row.threshold - (row.quantity ?? 0) + 1) : 1;
    addShoppingItem(
      list.id,
      {
        id: uuidv4(),
        name: row.name,
        useableRef: row.templateId,
        quantity: needed,
        unit: row.unit,
        accountRef: null,
        completed: false,
        completedAt: null,
      },
      currentUser,
    );
  }

  // ── Side panel: on-hand totals, food group breakdown, radar ────────────────
  const today = getAppDate();
  const nutrientTotals = nutrientTotalsForDate(mealEntries, today);
  const foodGroupTotals = foodGroupTotalsForDate(mealEntries, today);
  const servingsToday = Object.values(foodGroupTotals).reduce((sum, v) => sum + (v ?? 0), 0);

  const byParentGroup = new Map<FoodGroupParent | 'Other', FoodRow[]>();
  for (const row of rows) {
    const parent = row.foodGroup?.parentGroup ?? 'Other';
    byParentGroup.set(parent, [...(byParentGroup.get(parent) ?? []), row]);
  }

  const sidePanelSections: HabitatSidePanelSection[] = [
    {
      key: 'on-hand',
      label: 'On Hand',
      shortLabel: 'ITM',
      value: rows.length,
      rows: rows.map((row) => (
        <span key={row.key} className="truncate text-xs text-gray-600 dark:text-gray-300">
          {row.name}
          {row.quantity != null ? ` · ${row.quantity}${row.unit ? ` ${row.unit}` : ''}` : ''}
        </span>
      )),
    },
    {
      key: 'low-stock',
      label: 'Low Stock',
      shortLabel: 'LOW',
      value: lowRows.length,
      rows: lowRows.map((row) => (
        <button
          key={row.key}
          type="button"
          className="truncate text-left text-xs text-gray-600 hover:text-accent dark:text-gray-300"
          onClick={() => addToShoppingList(row)}
          title="Add to shopping list"
        >
          {row.name} · {row.quantity ?? 0}/{row.threshold ?? 0}
        </button>
      )),
    },
    ...Array.from(byParentGroup.entries()).map(
      ([parent, groupRows]): HabitatSidePanelSection => ({
        key: `group-${parent}`,
        label: parent,
        shortLabel: parent === 'Other' ? 'OTH' : PARENT_GROUP_SHORT_LABELS[parent],
        value: groupRows.length,
        rows: groupRows.map((row) => (
          <span key={row.key} className="truncate text-xs text-gray-600 dark:text-gray-300">
            {row.name}
          </span>
        )),
      }),
    ),
  ];

  const sidePanel = (
    <HabitatSidePanel
      sections={sidePanelSections}
      open={panelOpen}
      onOpenChange={setPanelOpen}
      emptyRowsLabel="None"
      topContent={
        <div className="flex flex-col items-center gap-1 px-2 pb-2">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            Today vs daily targets
          </span>
          <RadarChart
            axes={buildNutrientAxes(nutrientTotals)}
            size={168}
            title="Today's consumption against FDA daily targets"
          />
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {servingsToday} serving{servingsToday === 1 ? '' : 's'} logged today
          </span>
        </div>
      }
    />
  );

  // ── Body ────────────────────────────────────────────────────────────────────
  const topBar = !expandedKey ? (
    <HabitatTopBar
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search food items..."
    />
  ) : undefined;

  return (
    <HabitatShell sidePanel={sidePanel} topBar={topBar}>
      <div className="flex flex-col gap-2 overflow-y-auto px-4 py-3">
        {filteredRows.map((row) => {
          if (expandedKey !== null && expandedKey !== row.key) return null;
          const isExpanded = expandedKey === row.key;
          const nutrientEntries = Object.entries(row.nutrients) as Array<[NutrientId, number]>;

          return (
            <HabitatRow
              key={row.key}
              expanded={isExpanded}
              soloExpanded={isExpanded}
              onToggleExpand={() => setExpandedKey(isExpanded ? null : row.key)}
              icon={<IconDisplay iconKey={row.icon} size={22} />}
              name={row.name}
              summary={
                row.quantity != null
                  ? `${row.quantity}${row.unit ? ` ${row.unit}` : ''} on hand${
                      row.threshold != null ? ` · restock at ${row.threshold}` : ''
                    } · ${row.resourceName}`
                  : row.resourceName
              }
              pill={
                row.low ? (
                  <span className="rounded-full bg-accent-bg px-2 py-0.5 text-xs font-medium text-accent">
                    Low
                  </span>
                ) : row.foodGroup ? (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    {row.foodGroup.displayName}
                  </span>
                ) : undefined
              }
            >
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                  {row.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-300">{row.description}</p>
                  )}

                  {row.low && (
                    <p className="text-xs font-medium text-accent">
                      Below threshold — a "Restock {row.name}" task is active in today's GTD.
                    </p>
                  )}

                  {nutrientEntries.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        Nutrition per unit (vs daily target)
                      </span>
                      {nutrientEntries.map(([id, value]) => (
                        <span key={id} className="text-xs text-gray-600 dark:text-gray-300">
                          {formatNutrientVsTarget(id, value)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      No nutritional values recorded for this item.
                    </p>
                  )}
                </div>

                <div className="mt-auto shrink-0 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={(row.quantity ?? 0) <= 0}
                      onClick={() => consumeOne(row)}
                      className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                        (row.quantity ?? 0) <= 0
                          ? 'cursor-not-allowed bg-gray-300 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                          : 'bg-accent text-white hover:bg-accent/90'
                      }`}
                    >
                      Consume 1
                    </button>
                    <button
                      type="button"
                      onClick={() => addToShoppingList(row)}
                      className="rounded-xl border border-accent-border px-3 py-2 text-sm font-medium text-accent hover:bg-accent-bg"
                    >
                      + Shopping List
                    </button>
                  </div>
                </div>
              </div>
            </HabitatRow>
          );
        })}

        {filteredRows.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
            No consumable items in inventory yet. Add items in the Resource Room to stock Food
            Core.
          </p>
        )}
      </div>
    </HabitatShell>
  );
}
