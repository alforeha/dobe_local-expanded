import { useMemo, useState } from 'react';
import type {
  HomeResource,
  InventoryContainer,
  InventoryContainerLink,
  InventoryCustomTaskTemplate,
  InventoryItemTemplate,
  InventoryResource,
  ItemInstance,
  PlacedInstance,
  VehicleResource,
} from '../../../../../../types/resource';
import { isDoc } from '../../../../../../types/resource';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import type { Task } from '../../../../../../types/task';
import type { TaskType } from '../../../../../../types/taskTemplate';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { IconPicker } from '../../../../../shared/IconPicker';
import { TextInput } from '../../../../../shared/inputs/TextInput';
import { AddItemPanel } from './AddItemPanel';
import { AddBagPanel } from './AddBagPanel';
import { AddContainerPanel } from './AddContainerPanel';
import { taskTemplateLibrary } from '../../../../../../coach';
import {
  getUserInventoryItemTemplates,
  mergeInventoryItemTemplates,
  resolveInventoryItemTemplate,
} from '../../../../../../utils/inventoryItems';
import { findHomeRoomReference, getHomeRoomReferences } from '../../../../../../utils/homeRooms';
import {
  CUSTOM_ITEM_TEMPLATE_PREFIX,
  getItemTaskTemplateMeta,
  getItemTemplateByRef,
  makeCustomItemTemplateRef,
  type ItemCategory,
  type ItemKind,
} from '../../../../../../coach/ItemLibrary';

interface InventorySpecialViewProps {
  resource: InventoryResource;
}

type TabKey = 'items' | 'containers' | 'bags';
type ItemPlacementFilterValue = 'all' | 'placed' | 'unplaced';
type ItemKindFilterValue = 'all' | ItemKind;
type ItemCategoryFilterValue = 'all' | ItemCategory | 'user-created' | 'room-created';
type EditableTaskType = Extract<TaskType, 'CHECK' | 'COUNTER' | 'DURATION' | 'TIMER' | 'RATING' | 'TEXT'>;
type InventoryEditableTaskTemplate = InventoryCustomTaskTemplate & { taskType?: EditableTaskType };

const ITEM_PLACEMENT_FILTER_OPTIONS: Array<{ id: ItemPlacementFilterValue; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'placed', label: 'Placed' },
  { id: 'unplaced', label: 'Unplaced' },
];

const ITEM_CATEGORY_OPTIONS: ItemCategory[] = [
  'kitchen',
  'bedroom',
  'cleaning',
  'garden',
  'vehicle',
  'bathroom',
  'workspace',
];

type ItemPlacementTarget =
  | { kind: 'inventory-item'; inventoryResourceId: string; itemId: string }
  | { kind: 'inventory-container-item'; inventoryResourceId: string; containerId: string; itemId: string }
  | { kind: 'home-placement'; homeId: string; roomId?: string; placementId: string }
  | { kind: 'home-room-container-item'; homeId: string; roomId: string; containerId: string; itemId: string };

interface ItemPlacementRecord {
  key: string;
  locationPath: string;
  quantity: number;
  segments: Array<{ key: string; icon: string; label: string }>;
  target: ItemPlacementTarget;
}

interface ItemRowSummary {
  template: InventoryItemTemplate;
  resolved: ReturnType<typeof resolveInventoryItemTemplate>;
  builtInTemplate: ReturnType<typeof getItemTemplateByRef>;
  placements: ItemPlacementRecord[];
  totalOnHand: number;
  kind: ItemKind;
  categoryKey: ItemCategory | 'user-created' | 'room-created';
  categoryLabel: string;
  description: string;
  isUserManaged: boolean;
}

interface ItemRowGroup {
  key: ItemCategory | 'user-created' | 'room-created';
  label: string;
  rows: ItemRowSummary[];
  showHeader: boolean;
}

const DAY_LABELS: Record<string, string> = {
  sun: 'Su',
  mon: 'Mo',
  tue: 'Tu',
  wed: 'We',
  thu: 'Th',
  fri: 'Fr',
  sat: 'Sa',
};

function describeTaskRecurrence(rule: { frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'; interval: number; days: string[]; monthlyDay?: number | null }) {
  const interval = Math.max(1, rule.interval || 1);
  switch (rule.frequency) {
    case 'daily':
      return interval === 1 ? 'Daily' : `Every ${interval} days`;
    case 'weekly': {
      const days = rule.days.length > 0 ? ` · ${rule.days.map((day) => DAY_LABELS[day] ?? day).join(' ')}` : '';
      return `${interval === 1 ? 'Weekly' : `Every ${interval} weeks`}${days}`;
    }
    case 'monthly':
      return `${interval === 1 ? 'Monthly' : `Every ${interval} months`}${rule.monthlyDay ? ` · Day ${rule.monthlyDay}` : ''}`;
    case 'yearly':
      return interval === 1 ? 'Yearly' : `Every ${interval} years`;
    default:
      return 'Recurring';
  }
}

function describeReminder(reminderLeadDays?: number) {
  if (reminderLeadDays == null || reminderLeadDays < 0) return 'No reminder';
  if (reminderLeadDays === 0) return 'Due day';
  if (reminderLeadDays === 1) return '1 day before';
  return `${reminderLeadDays} days before`;
}

function itemQuantityTotal(items: ItemInstance[]) {
  return items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
}

function formatTaskTypeLabel(taskType?: string | null) {
  if (!taskType) return 'CHECK';
  return taskType.replaceAll('_', ' ');
}

function titleCaseCategory(category: ItemCategory | 'user-created' | 'room-created') {
  if (category === 'user-created') return 'User Created';
  if (category === 'room-created') return 'Room Created';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function InventorySpecialView({ resource }: InventorySpecialViewProps) {
  const scheduleTasks = useScheduleStore((s) => s.tasks) as Record<string, Task>;
  const resources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const gtdTaskIds = new Set(user?.lists.gtdList ?? []);

  const [activeTab, setActiveTab] = useState<TabKey>('items');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [expandedContainerId, setExpandedContainerId] = useState<string | null>(null);
  const [showAddItemPanel, setShowAddItemPanel] = useState(false);
  const [addItemContainerId, setAddItemContainerId] = useState<string | null>(null);
  const [showAddBagPanel, setShowAddBagPanel] = useState(false);
  const [editingBagId, setEditingBagId] = useState<string | null>(null);
  const [showAddContainerPanel, setShowAddContainerPanel] = useState(false);
  const [editingContainerId, setEditingContainerId] = useState<string | null>(null);
  const [showItemComposer, setShowItemComposer] = useState(false);
  const [draftItemName, setDraftItemName] = useState('');
  const [draftItemIcon, setDraftItemIcon] = useState('inventory');
  const [draftItemKind, setDraftItemKind] = useState<ItemKind>('consumable');
  const [draftItemCategory, setDraftItemCategory] = useState<ItemCategory>('workspace');
  const [draftItemDescription, setDraftItemDescription] = useState('Custom inventory item');
  const [draftItemWidth, setDraftItemWidth] = useState('0');
  const [draftItemDepth, setDraftItemDepth] = useState('0');
  const [draftTaskTemplates, setDraftTaskTemplates] = useState<InventoryEditableTaskTemplate[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemPlacementFilter, setItemPlacementFilter] = useState<ItemPlacementFilterValue>('all');
  const [itemKindFilter, setItemKindFilter] = useState<ItemKindFilterValue>('all');
  const [itemCategoryFilter, setItemCategoryFilter] = useState<ItemCategoryFilterValue>('all');
  const [editingItemDetailsId, setEditingItemDetailsId] = useState<string | null>(null);

  const userTemplates = useMemo(() => getUserInventoryItemTemplates(user), [user]);
  const roomItemEntries = useMemo(() => {
    const byId = new Map<string, InventoryItemTemplate>();

    const appendTemplate = (template: InventoryItemTemplate | null | undefined) => {
      if (!template?.id) return;
      byId.set(template.id, template);
    };

    for (const entry of Object.values(resources)) {
      if (entry.type !== 'home') continue;
      for (const story of entry.stories ?? []) {
        for (const placement of story.placedItems ?? []) {
          if (placement.kind !== 'item') continue;
          appendTemplate(
            userTemplates.find((template) => template.id === placement.refId)
            ?? resource.itemTemplates?.find((template) => template.id === placement.refId)
            ?? getItemTemplateByRef(placement.refId)
            ?? undefined,
          );
        }

        for (const room of story.rooms) {
          for (const template of room.dedicatedItems ?? []) {
            appendTemplate(template);
          }

          for (const placement of room.placedItems ?? []) {
            if (placement.kind !== 'item') continue;
            appendTemplate(
              (room.dedicatedItems ?? []).find((template) => template.id === placement.refId)
              ?? userTemplates.find((template) => template.id === placement.refId)
              ?? resource.itemTemplates?.find((template) => template.id === placement.refId)
              ?? getItemTemplateByRef(placement.refId)
              ?? undefined,
            );
          }
        }
      }
    }

    return Array.from(byId.values());
  }, [resource.itemTemplates, resources, userTemplates]);
  const itemEntries = useMemo(
    () => mergeInventoryItemTemplates(userTemplates, resource.itemTemplates, roomItemEntries),
    [resource.itemTemplates, roomItemEntries, userTemplates],
  );
  const containerEntries = useMemo(() => resource.containers ?? [], [resource.containers]);
  const regularContainerEntries = useMemo(
    () => containerEntries.filter((container) => (container.kind ?? 'container') === 'container'),
    [containerEntries],
  );
  const bagEntries = useMemo(
    () => containerEntries.filter((container) => container.kind === 'bag'),
    [containerEntries],
  );
  const editingBag = useMemo(
    () => (editingBagId ? containerEntries.find((container) => container.id === editingBagId) ?? null : null),
    [containerEntries, editingBagId],
  );
  const editingContainer = useMemo(
    () => (editingContainerId ? regularContainerEntries.find((entry) => entry.id === editingContainerId) ?? null : null),
    [editingContainerId, regularContainerEntries],
  );
  const homeResources = useMemo(
    () => Object.values(resources).filter((entry): entry is HomeResource => entry.type === 'home'),
    [resources],
  );
  const vehicleResources = useMemo(
    () => Object.values(resources).filter((entry): entry is VehicleResource => entry.type === 'vehicle'),
    [resources],
  );
  const inventoryResources = useMemo(
    () => Object.values(resources).filter((entry): entry is InventoryResource => entry.type === 'inventory'),
    [resources],
  );

  const itemIdsWithDoc = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of Object.values(resources)) {
      if (!isDoc(entry)) continue;
      if (entry.docType === 'manual' && entry.linkedResourceRef) ids.add(entry.linkedResourceRef);
      if (entry.docType === 'recipe') {
        for (const ingredient of entry.recipeIngredients ?? []) {
          if (ingredient.itemRef) ids.add(ingredient.itemRef);
        }
      }
    }
    return ids;
  }, [resources]);

  const lowStockLabels = new Set(
    Object.values(scheduleTasks)
      .filter((task) => task.resourceRef === resource.id && task.completionState === 'pending' && gtdTaskIds.has(task.id))
      .map((task) => (task.resultFields as Record<string, string> | undefined)?.itemName)
      .filter((itemName): itemName is string => Boolean(itemName)),
  );

  const itemPlacementsByTemplateId = useMemo(() => {
    const placements = new Map<string, ItemPlacementRecord[]>();
    const inventoryItemRecords = new Map<string, { templateId: string; record: Omit<ItemPlacementRecord, 'key'> }>();
    const containerItemsByContainerId = new Map<string, Array<{ templateId: string; record: Omit<ItemPlacementRecord, 'key'> }>>();
    const placedInventoryItemIds = new Set<string>();

    const appendPlacement = (templateId: string, placement: Omit<ItemPlacementRecord, 'key'>, keySeed: string) => {
      const current = placements.get(templateId) ?? [];
      current.push({ ...placement, key: `${templateId}:${keySeed}:${current.length}` });
      placements.set(templateId, current);
    };

    for (const inventoryResource of inventoryResources) {
      for (const item of inventoryResource.items ?? []) {
        inventoryItemRecords.set(item.id, {
          templateId: item.itemTemplateRef,
          record: {
            locationPath: inventoryResource.name,
            quantity: item.quantity ?? 1,
            segments: [
              { key: `${inventoryResource.id}:inventory`, icon: inventoryResource.icon || 'inventory', label: inventoryResource.name },
            ],
            target: {
              kind: 'inventory-item',
              inventoryResourceId: inventoryResource.id,
              itemId: item.id,
            },
          },
        });
      }

      for (const container of inventoryResource.containers ?? []) {
        containerItemsByContainerId.set(
          container.id,
          container.items.map((item) => ({
            templateId: item.itemTemplateRef,
            record: {
              locationPath: `${inventoryResource.name} / ${container.name}`,
              quantity: item.quantity ?? 1,
              segments: [
                { key: `${inventoryResource.id}:inventory`, icon: inventoryResource.icon || 'inventory', label: inventoryResource.name },
                { key: `${container.id}:container`, icon: container.icon || 'inventory', label: container.name },
              ],
              target: {
                kind: 'inventory-container-item',
                inventoryResourceId: inventoryResource.id,
                containerId: container.id,
                itemId: item.id,
              },
            },
          })),
        );
        for (const item of container.items) {
          inventoryItemRecords.set(item.id, {
            templateId: item.itemTemplateRef,
            record: {
              locationPath: `${inventoryResource.name} / ${container.name}`,
              quantity: item.quantity ?? 1,
              segments: [
                { key: `${inventoryResource.id}:inventory`, icon: inventoryResource.icon || 'inventory', label: inventoryResource.name },
                { key: `${container.id}:container`, icon: container.icon || 'inventory', label: container.name },
              ],
              target: {
                kind: 'inventory-container-item',
                inventoryResourceId: inventoryResource.id,
                containerId: container.id,
                itemId: item.id,
              },
            },
          });
        }
      }
    }

    const collectHomePlacements = (home: HomeResource, room: NonNullable<HomeResource['stories']>[number]['rooms'][number] | null, placedItems: PlacedInstance[]) => {
      const placedContainerIds = new Set(
        (placedItems ?? [])
          .filter((placement) => placement.kind === 'container')
          .map((placement) => placement.refId),
      );

      if (room) {
        for (const container of room.dedicatedContainers ?? []) {
          containerItemsByContainerId.set(
            container.id,
            container.items.map((item: ItemInstance) => ({
              templateId: item.itemTemplateRef,
              record: {
                locationPath: `${home.name} / ${room.name} / ${container.name}`,
                quantity: item.quantity ?? 1,
                segments: [
                  { key: `${home.id}:home`, icon: home.icon || 'home', label: home.name },
                  { key: `${room.id}:room`, icon: room.icon || 'home-room', label: room.name },
                  { key: `${container.id}:container`, icon: container.icon || 'inventory', label: container.name },
                ],
                target: {
                  kind: 'home-room-container-item',
                  homeId: home.id,
                  roomId: room.id,
                  containerId: container.id,
                  itemId: item.id,
                },
              },
            })),
          );

          if (placedContainerIds.has(container.id)) continue;

          for (const item of container.items) {
            appendPlacement(
              item.itemTemplateRef,
              {
                locationPath: `${home.name} / ${room.name} / ${container.name}`,
                quantity: item.quantity ?? 1,
                segments: [
                  { key: `${home.id}:home`, icon: home.icon || 'home', label: home.name },
                  { key: `${room.id}:room`, icon: room.icon || 'home-room', label: room.name },
                  { key: `${container.id}:container`, icon: container.icon || 'inventory', label: container.name },
                ],
                target: {
                  kind: 'home-room-container-item',
                  homeId: home.id,
                  roomId: room.id,
                  containerId: container.id,
                  itemId: item.id,
                },
              },
              `${room.id}:${container.id}:${item.id}`,
            );
          }
        }
      }

      for (const placement of placedItems ?? []) {
        const locationBase = room ? `${home.name} / ${room.name}` : home.name;
        const baseSegments = room
          ? [
              { key: `${home.id}:home`, icon: home.icon || 'home', label: home.name },
              { key: `${room.id}:room`, icon: room.icon || 'home-room', label: room.name },
            ]
          : [
              { key: `${home.id}:home`, icon: home.icon || 'home', label: home.name },
            ];
        if (placement.kind === 'container') {
          const containerItems = containerItemsByContainerId.get(placement.refId) ?? [];
          for (const containerItem of containerItems) {
            if (containerItem.record.target.kind === 'inventory-container-item') {
              placedInventoryItemIds.add(containerItem.record.target.itemId);
            }
            appendPlacement(
              containerItem.templateId,
              {
                ...containerItem.record,
                locationPath: `${locationBase} / ${containerItem.record.locationPath.split(' / ').slice(-1)[0]}`,
                segments: [...baseSegments, ...containerItem.record.segments.slice(-1)],
              },
              placement.id,
            );
          }
          continue;
        }

        const inventoryItemRecord = inventoryItemRecords.get(placement.refId);
        if (inventoryItemRecord) {
          placedInventoryItemIds.add(placement.refId);
          appendPlacement(
            inventoryItemRecord.templateId,
            {
              locationPath: locationBase,
              quantity: placement.quantity ?? inventoryItemRecord.record.quantity,
              segments: baseSegments,
              target: {
                kind: 'home-placement',
                homeId: home.id,
                roomId: room?.id,
                placementId: placement.id,
              },
            },
            placement.id,
          );
          continue;
        }

        appendPlacement(
          placement.refId,
          {
            locationPath: locationBase,
            quantity: placement.quantity ?? 1,
            segments: baseSegments,
            target: {
              kind: 'home-placement',
              homeId: home.id,
              roomId: room?.id,
              placementId: placement.id,
            },
          },
          placement.id,
        );
      }
    };

    for (const home of homeResources) {
      for (const story of home.stories ?? []) {
        collectHomePlacements(home, null, story.placedItems ?? []);
        for (const room of story.rooms) {
          collectHomePlacements(home, room, room.placedItems ?? []);
        }
      }
    }

    for (const [itemId, inventoryRecord] of inventoryItemRecords) {
      if (placedInventoryItemIds.has(itemId)) continue;
      appendPlacement(inventoryRecord.templateId, inventoryRecord.record, itemId);
    }

    for (const [templateId, templatePlacements] of placements) {
      templatePlacements.sort((left, right) => left.locationPath.localeCompare(right.locationPath));
      placements.set(templateId, templatePlacements);
    }

    return placements;
  }, [homeResources, inventoryResources]);

  const itemRows = useMemo(() => {
    return itemEntries
      .map((template) => {
        const builtInTemplate = getItemTemplateByRef(template.id);
        const resolved = resolveInventoryItemTemplate(template.id, itemEntries);
        const placements = itemPlacementsByTemplateId.get(template.id) ?? [];
        const kind = (resolved?.kind ?? template.kind ?? 'consumable') as ItemKind;
        const isRoomCreated = template.id.startsWith('room-item-');
        const isUserManaged = !isRoomCreated && (template.isCustom === true || template.id.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX));
        const category = ((resolved?.category ?? template.category ?? 'workspace') as ItemCategory);
        return {
          template,
          resolved,
          builtInTemplate,
          placements,
          totalOnHand: placements.reduce((sum, placement) => sum + (placement.quantity ?? 1), 0),
          kind,
          categoryKey: isRoomCreated ? 'room-created' : (isUserManaged ? 'user-created' : category),
          categoryLabel: isRoomCreated ? 'Room Created' : (isUserManaged ? 'User Created' : titleCaseCategory(category)),
          description: builtInTemplate?.description ?? resolved?.description ?? (template.id.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX) ? 'Custom inventory item' : ''),
          isUserManaged,
        } satisfies ItemRowSummary;
      })
      .filter((row) => itemPlacementFilter === 'all' || (itemPlacementFilter === 'placed' ? row.placements.length > 0 : row.placements.length === 0))
      .filter((row) => itemKindFilter === 'all' || row.kind === itemKindFilter)
      .filter((row) => itemCategoryFilter === 'all' || row.categoryKey === itemCategoryFilter);
  }, [itemCategoryFilter, itemEntries, itemKindFilter, itemPlacementFilter, itemPlacementsByTemplateId]);

  const visibleItemRows = useMemo(
    () => (expandedItemId ? itemRows.filter((row) => row.template.id === expandedItemId) : itemRows),
    [expandedItemId, itemRows],
  );

  const groupedVisibleItemRows = useMemo<ItemRowGroup[]>(() => {
    if (itemCategoryFilter !== 'all') {
      return visibleItemRows.length === 0
        ? []
        : [{
            key: itemCategoryFilter,
            label: titleCaseCategory(itemCategoryFilter),
            rows: visibleItemRows,
            showHeader: false,
          }];
    }

    const groups = new Map<ItemCategory | 'user-created' | 'room-created', ItemRowSummary[]>();
    for (const row of visibleItemRows) {
      const current = groups.get(row.categoryKey) ?? [];
      current.push(row);
      groups.set(row.categoryKey, current);
    }

    return [...ITEM_CATEGORY_OPTIONS, 'user-created' as const, 'room-created' as const].reduce<ItemRowGroup[]>((acc, key) => {
        const rows = groups.get(key) ?? [];
        if (rows.length === 0) return acc;
        acc.push({
          key,
          label: titleCaseCategory(key),
          rows,
          showHeader: true,
        });
        return acc;
      }, []);
  }, [itemCategoryFilter, visibleItemRows]);

  function cleanupHomePlacements(match: (placement: { kind: 'item' | 'container'; refId: string }) => boolean) {
    const now = new Date().toISOString();
    for (const home of homeResources) {
      let changed = false;
      const nextStories = home.stories?.map((story) => {
        const nextStoryPlacedItems = story.placedItems.filter((placement) => !match(placement));
        const nextRooms = story.rooms.map((room) => {
          const nextPlacedItems = room.placedItems.filter((placement) => !match(placement));
          if (nextPlacedItems.length !== room.placedItems.length) {
            changed = true;
            return {
              ...room,
              placedItems: nextPlacedItems,
            };
          }
          return room;
        });

        if (nextStoryPlacedItems.length !== story.placedItems.length) {
          changed = true;
        }

        if (changed) {
          return {
            ...story,
            placedItems: nextStoryPlacedItems,
            rooms: nextRooms,
          };
        }

        return story;
      });

      if (changed) {
        setResource({
          ...home,
          updatedAt: now,
          stories: nextStories,
        });
      }
    }
  }

  function cleanupVehiclePlacements(containerId: string) {
    const now = new Date().toISOString();
    for (const vehicle of vehicleResources) {
      if (!vehicle.layout) continue;
      let changed = false;
      const nextAreas = vehicle.layout.areas.map((area) => {
        const nextContainerIds = area.containerIds.filter((entry) => entry !== containerId);
        if (nextContainerIds.length !== area.containerIds.length) {
          changed = true;
          return {
            ...area,
            containerIds: nextContainerIds,
          };
        }
        return area;
      });

      if (changed) {
        setResource({
          ...vehicle,
          updatedAt: now,
          layout: {
            ...vehicle.layout,
            areas: nextAreas,
          },
        });
      }
    }
  }

  function resetItemComposer() {
    setDraftItemName('');
    setDraftItemIcon('inventory');
    setDraftItemKind('consumable');
    setDraftItemCategory('workspace');
    setDraftItemDescription('Custom inventory item');
    setDraftItemWidth('0');
    setDraftItemDepth('0');
    setDraftTaskTemplates([]);
    setEditingItemId(null);
    setShowItemComposer(false);
  }

  function openItemComposer(itemId: string) {
    const item = itemEntries.find((entry) => entry.id === itemId);
    if (!item) return;
    const resolved = resolveInventoryItemTemplate(item.id, itemEntries);
    setDraftItemName(item.name);
    setDraftItemIcon(item.icon || 'inventory');
    setDraftItemKind(item.kind ?? 'consumable');
    setDraftItemCategory((resolved?.category ?? 'workspace') as ItemCategory);
    setDraftItemDescription(resolved?.description ?? 'Custom inventory item');
    setDraftItemWidth(String(item.dimensions?.width ?? resolved?.dimensions?.width ?? 0));
    setDraftItemDepth(String(item.dimensions?.depth ?? resolved?.dimensions?.depth ?? 0));
    setDraftTaskTemplates(
      ((item.customTaskTemplates ?? []) as InventoryEditableTaskTemplate[]).map((taskTemplate) => ({
        ...taskTemplate,
        taskType: 'CHECK',
      })),
    );
    setEditingItemId(itemId);
    setShowItemComposer(true);
    setExpandedItemId(itemId);
    setEditingItemDetailsId(null);
  }

  function addDraftTaskTemplate() {
    setDraftTaskTemplates((prev) => [...prev, { id: crypto.randomUUID(), name: '', icon: 'task', taskType: 'CHECK' }]);
  }

  function updateDraftTaskTemplate(id: string, patch: Partial<InventoryEditableTaskTemplate>) {
    setDraftTaskTemplates((prev) => prev.map((taskTemplate) => (taskTemplate.id === id ? { ...taskTemplate, ...patch } : taskTemplate)));
  }

  function removeDraftTaskTemplate(id: string) {
    setDraftTaskTemplates((prev) => prev.filter((taskTemplate) => taskTemplate.id !== id));
  }

  function handleSaveOrUpdateItem() {
    if (!user || !draftItemName.trim()) return;

    const nextItem = {
      id: makeCustomItemTemplateRef(draftItemName.trim(), draftItemKind, draftItemIcon || 'inventory'),
      name: draftItemName.trim(),
      icon: draftItemIcon || 'inventory',
      kind: draftItemKind,
      category: draftItemCategory,
      description: draftItemDescription.trim() || 'Custom inventory item',
      isCustom: true,
      dimensions: draftItemKind === 'facility'
        ? {
            width: Math.max(0, Number(draftItemWidth) || 0),
            depth: Math.max(0, Number(draftItemDepth) || 0),
            height: 0,
          }
        : undefined,
      customTaskTemplates: draftItemKind === 'facility'
        ? (draftTaskTemplates
            .filter((taskTemplate) => taskTemplate.name.trim().length > 0)
            .map((taskTemplate) => ({
              ...taskTemplate,
              taskType: 'CHECK',
            })) as InventoryCustomTaskTemplate[])
        : [],
    };

    const nextTemplates = mergeInventoryItemTemplates(
      (user.lists.inventoryItemTemplates ?? []).filter((item) => item.id !== editingItemId),
      [nextItem],
    );

    setUser({
      ...user,
      lists: {
        ...user.lists,
        inventoryItemTemplates: nextTemplates,
      },
    });

    if (editingItemId && nextItem.id !== editingItemId) {
      setResource({
        ...resource,
        updatedAt: new Date().toISOString(),
        containers: containerEntries.map((container) => ({
          ...container,
          items: container.items.map((item) =>
            item.itemTemplateRef === editingItemId ? { ...item, itemTemplateRef: nextItem.id } : item,
          ),
        })),
      });
      setExpandedItemId(nextItem.id);
    }

    resetItemComposer();
  }

  function updateHomePlacementQuantity(homeId: string, roomId: string | undefined, placementId: string, quantity: number) {
    const home = resources[homeId];
    if (!home || home.type !== 'home') return;
    setResource({
      ...home,
      updatedAt: new Date().toISOString(),
      stories: (home.stories ?? []).map((story) => ({
        ...story,
        placedItems: roomId
          ? story.placedItems
          : story.placedItems.map((placement) => placement.id === placementId ? { ...placement, quantity } : placement),
        rooms: story.rooms.map((room) => room.id !== roomId ? room : {
          ...room,
          placedItems: room.placedItems.map((placement) => placement.id === placementId ? { ...placement, quantity } : placement),
        }),
      })),
    });
  }

  function updateHomeContainerItemQuantity(homeId: string, roomId: string, containerId: string, itemId: string, quantity: number) {
    const home = resources[homeId];
    if (!home || home.type !== 'home') return;
    setResource({
      ...home,
      updatedAt: new Date().toISOString(),
      stories: (home.stories ?? []).map((story) => ({
        ...story,
        rooms: story.rooms.map((room) => room.id !== roomId ? room : {
          ...room,
          dedicatedContainers: (room.dedicatedContainers ?? []).map((container) => container.id !== containerId ? container : {
            ...container,
            items: container.items.map((item) => item.id === itemId ? { ...item, quantity } : item),
          }),
        }),
      })),
    });
  }

  function updateInventoryPlacementQuantity(target: Extract<ItemPlacementTarget, { kind: 'inventory-item' | 'inventory-container-item' }>, quantity: number) {
    const inventoryResource = resources[target.inventoryResourceId];
    if (!inventoryResource || inventoryResource.type !== 'inventory') return;
    if (target.kind === 'inventory-item') return;
    setResource({
      ...inventoryResource,
      updatedAt: new Date().toISOString(),
      containers: (inventoryResource.containers ?? []).map((container) => {
        if (target.kind !== 'inventory-container-item' || container.id !== target.containerId) return container;
        return {
          ...container,
          items: container.items.map((item) => item.id === target.itemId ? { ...item, quantity } : item),
        };
      }),
    });
  }

  function handleUpdatePlacementQuantity(placement: ItemPlacementRecord, rawValue: string) {
    const quantity = Math.max(0, Number(rawValue) || 0);
    switch (placement.target.kind) {
      case 'inventory-item':
      case 'inventory-container-item':
        updateInventoryPlacementQuantity(placement.target, quantity);
        break;
      case 'home-placement':
        updateHomePlacementQuantity(placement.target.homeId, placement.target.roomId, placement.target.placementId, quantity);
        break;
      case 'home-room-container-item':
        updateHomeContainerItemQuantity(placement.target.homeId, placement.target.roomId, placement.target.containerId, placement.target.itemId, quantity);
        break;
      default:
        break;
    }
  }

  function handleRemoveContainer(containerId: string) {
    const container = containerEntries.find((entry) => entry.id === containerId);
    if (!container) return;

    const now = new Date().toISOString();

    setResource({
      ...resource,
      updatedAt: now,
      containers: containerEntries.filter((entry) => entry.id !== containerId),
    });

    cleanupHomePlacements((placement) => placement.kind === 'container' && placement.refId === containerId);
    cleanupVehiclePlacements(containerId);
    setExpandedContainerId((prev) => (prev === containerId ? null : prev));
  }

  function updateBagItems(containerId: string, updater: (items: ItemInstance[]) => ItemInstance[]) {
    setResource({
      ...resource,
      updatedAt: new Date().toISOString(),
      containers: containerEntries.map((container) => (
        container.id === containerId
          ? {
              ...container,
              items: updater(container.items),
            }
          : container
      )),
    });
  }

  function updateBagItemQuantity(containerId: string, itemId: string, quantity: number) {
    updateBagItems(containerId, (items) => items.map((item) => (
      item.id === itemId
        ? {
            ...item,
            quantity: Math.max(0, quantity),
          }
        : item
    )));
  }

  function removeBagItem(containerId: string, itemId: string) {
    updateBagItems(containerId, (items) => items.filter((item) => item.id !== itemId));
  }

  function humanizeTaskRef(taskRef: string) {
    return taskRef
      .replace(/^task-res-/, '')
      .replace(/^item-tmpl-/, '')
      .replace(/-\d+$/, '')
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function resolveTaskDisplay(taskTemplateRef: string, itemTemplateRef?: string) {
    if (itemTemplateRef) {
      const customTemplate = itemEntries.find((item) => item.id === itemTemplateRef);
      const customTask = (customTemplate?.customTaskTemplates as InventoryEditableTaskTemplate[] | undefined)?.find((taskTemplate) => taskTemplate.name === taskTemplateRef);
      if (customTask) {
        return {
          name: customTask.name,
          icon: customTask.icon || 'task',
          taskType: customTask.taskType ?? 'CHECK',
        };
      }
    }

    const coachTaskTemplate = taskTemplateLibrary.find((template) => template.id === taskTemplateRef);
    if (coachTaskTemplate) {
      return {
        name: coachTaskTemplate.name,
        icon: coachTaskTemplate.icon || 'task',
        taskType: coachTaskTemplate.taskType,
      };
    }

    const itemTaskTemplate = getItemTaskTemplateMeta(taskTemplateRef);
    if (itemTaskTemplate) {
      return {
        name: itemTaskTemplate.name,
        icon: itemTaskTemplate.icon || 'task',
        taskType: 'CHECK',
      };
    }

    return {
      name: humanizeTaskRef(taskTemplateRef),
      icon: 'task',
      taskType: 'CHECK',
    };
  }

  function getLocationLink(container: InventoryContainer) {
    return container.links?.find((link) => link.relationship === 'location' && Boolean(link.targetResourceId));
  }

  function describeContainerLocation(link: InventoryContainerLink) {
    if (!link.targetResourceId) return 'Unplaced';
    if (link.targetKind === 'vehicle') {
      const vehicle = resources[link.targetResourceId] as VehicleResource | undefined;
      return vehicle?.name ?? 'Vehicle';
    }

    const home = resources[link.targetResourceId] as HomeResource | undefined;
    const room = home ? findHomeRoomReference(home, link.targetRoomId) : null;
    if (home?.name && room?.name) return `${home.name} - ${room.name}`;
    return room?.name ?? home?.name ?? 'Home room';
  }

  function updateContainerLocation(containerId: string, link: InventoryContainerLink | null) {
    setResource({
      ...resource,
      updatedAt: new Date().toISOString(),
      containers: containerEntries.map((container) => {
        if (container.id !== containerId) return container;
        const baseLinks = (container.links ?? []).filter((entry) => entry.relationship !== 'location');
        return {
          ...container,
          links: link ? [...baseLinks, link] : baseLinks,
        };
      }),
    });
  }

  function setContainerHome(container: InventoryContainer, homeId: string) {
    if (!homeId) {
      updateContainerLocation(container.id, null);
      return;
    }
    const home = homeResources.find((entry) => entry.id === homeId);
    const firstRoomId = home ? getHomeRoomReferences(home)[0]?.id : undefined;
    updateContainerLocation(container.id, {
      id: getLocationLink(container)?.id ?? crypto.randomUUID(),
      relationship: 'location',
      targetKind: 'home-room',
      targetResourceId: homeId,
      targetRoomId: firstRoomId,
      createdAt: getLocationLink(container)?.createdAt ?? new Date().toISOString(),
    });
  }

  function setContainerRoom(container: InventoryContainer, roomId: string) {
    const locationLink = getLocationLink(container);
    if (!locationLink || locationLink.targetKind !== 'home-room') return;
    updateContainerLocation(container.id, {
      ...locationLink,
      targetRoomId: roomId || undefined,
    });
  }

  function setContainerVehicle(container: InventoryContainer, vehicleId: string) {
    if (!vehicleId) {
      updateContainerLocation(container.id, null);
      return;
    }
    updateContainerLocation(container.id, {
      id: getLocationLink(container)?.id ?? crypto.randomUUID(),
      relationship: 'location',
      targetKind: 'vehicle',
      targetResourceId: vehicleId,
      createdAt: getLocationLink(container)?.createdAt ?? new Date().toISOString(),
    });
  }

  const tabButtonClass = (tab: TabKey) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
      activeTab === tab
        ? 'bg-blue-500 text-white'
        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
    }`;
  const itemFilterSelectClass = 'rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setActiveTab('items')} className={tabButtonClass('items')}>
            Items ({itemEntries.length})
          </button>
          <button type="button" onClick={() => setActiveTab('containers')} className={tabButtonClass('containers')}>
            Containers ({regularContainerEntries.length})
          </button>
          <button type="button" onClick={() => setActiveTab('bags')} className={tabButtonClass('bags')}>
            Bags ({bagEntries.length})
          </button>
        </div>

        {activeTab === 'items' ? (
          <button
            type="button"
            onClick={() => {
              setAddItemContainerId(null);
              setShowAddItemPanel(true);
            }}
            className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
          >
            Add Item
          </button>
        ) : activeTab === 'bags' ? (
          <button
            type="button"
            onClick={() => {
              setEditingBagId(null);
              setShowAddBagPanel(true);
            }}
            className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
          >
            Add Bag
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditingContainerId(null);
              setShowAddContainerPanel(true);
            }}
            className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
          >
            Add Container
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      {activeTab === 'items' && showItemComposer ? (
        <section className="mb-4 rounded-2xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="grid grid-cols-[auto_1fr] items-end gap-3">
            <IconPicker value={draftItemIcon} onChange={setDraftItemIcon} align="left" />
            <TextInput
              label="Item name"
              value={draftItemName}
              onChange={setDraftItemName}
              placeholder="e.g. Coffee Beans"
              maxLength={80}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(['consumable', 'facility'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setDraftItemKind(kind)}
                className={draftItemKind === kind
                  ? 'rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white'
                  : 'rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}
              >
                {kind === 'consumable' ? 'Consumable' : 'Facility'}
              </button>
            ))}
          </div>

          {draftItemKind === 'facility' ? (
            <div className="mt-4 space-y-4 rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-800">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Dimensions</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
                  <label className="space-y-1">
                    <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">W</span>
                    <input
                      type="number"
                      min={0}
                      value={draftItemWidth}
                      onChange={(event) => setDraftItemWidth(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">D</span>
                    <input
                      type="number"
                      min={0}
                      value={draftItemDepth}
                      onChange={(event) => setDraftItemDepth(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                    />
                  </label>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Custom task templates</p>
                  <button type="button" onClick={addDraftTaskTemplate} className="text-xs font-medium text-blue-500 hover:text-blue-600">
                    + Add task
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {draftTaskTemplates.length === 0 ? (
                    <p className="text-xs italic text-gray-400">No custom tasks added yet.</p>
                  ) : draftTaskTemplates.map((taskTemplate) => (
                    <div key={taskTemplate.id} className="rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-900/60">
                      <div className="flex flex-col gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="shrink-0">
                          <IconPicker
                            value={taskTemplate.icon || 'task'}
                            onChange={(value) => updateDraftTaskTemplate(taskTemplate.id, { icon: value })}
                            align="left"
                          />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <TextInput
                              label="Task name"
                              value={taskTemplate.name}
                              onChange={(value) => updateDraftTaskTemplate(taskTemplate.id, { name: value, taskType: 'CHECK' })}
                              placeholder="e.g. Wipe down"
                              maxLength={80}
                            />
                            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">CHECK</div>
                          </div>
                        </div>
                        <div>
                          <button type="button" onClick={() => removeDraftTaskTemplate(taskTemplate.id)} className="text-xs text-gray-400 hover:text-red-400">
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={resetItemComposer}
              className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveOrUpdateItem}
              disabled={!draftItemName.trim() || (draftItemKind === 'facility' && draftTaskTemplates.some((taskTemplate) => !taskTemplate.name.trim()))}
              className={draftItemName.trim() && (draftItemKind === 'consumable' || !draftTaskTemplates.some((taskTemplate) => !taskTemplate.name.trim()))
                ? 'rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600'
                : 'rounded-full bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-400 dark:bg-gray-700'}
            >
              {editingItemId ? 'Save Changes' : 'Save Item'}
            </button>
          </div>
        </section>
      ) : null}

      <div>
        {activeTab === 'items' ? (
          showItemComposer ? null : itemEntries.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-4 text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900/30">
              No items added yet.
            </div>
          ) : (
            <div className="space-y-2">
              {activeTab === 'items' ? (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setItemPlacementFilter('all');
                      setItemKindFilter('all');
                      setItemCategoryFilter('all');
                    }}
                    className={itemPlacementFilter === 'all' && itemKindFilter === 'all' && itemCategoryFilter === 'all'
                      ? 'rounded-full bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'}
                  >
                    All
                  </button>
                  <select value={itemPlacementFilter} onChange={(event) => setItemPlacementFilter(event.target.value as ItemPlacementFilterValue)} className={itemFilterSelectClass}>
                    {ITEM_PLACEMENT_FILTER_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>{`Placement: ${option.label}`}</option>
                    ))}
                  </select>
                  <select value={itemKindFilter} onChange={(event) => setItemKindFilter(event.target.value as ItemKindFilterValue)} className={itemFilterSelectClass}>
                    <option value="all">Kind: All</option>
                    <option value="facility">Kind: Facility</option>
                    <option value="consumable">Kind: Consumable</option>
                  </select>
                  <select value={itemCategoryFilter} onChange={(event) => setItemCategoryFilter(event.target.value as ItemCategoryFilterValue)} className={itemFilterSelectClass}>
                    <option value="all">Category: All</option>
                    {ITEM_CATEGORY_OPTIONS.map((category) => (
                      <option key={category} value={category}>{`Category: ${titleCaseCategory(category)}`}</option>
                    ))}
                    <option value="user-created">Category: User Created</option>
                    <option value="room-created">Category: Room Created</option>
                  </select>
                </div>
              ) : null}
              {groupedVisibleItemRows.map((group) => (
                <section key={group.key} className="space-y-2">
                  {group.showHeader ? (
                    <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                      {group.label}
                    </div>
                  ) : null}
                  {group.rows.map((row) => {
                const item = row.template;
                const taskRefs = [
                  ...(row.builtInTemplate?.builtInTasks?.map((task) => task.taskTemplateRef) ?? []),
                  ...(row.builtInTemplate?.associatedTaskTemplateRef ? [row.builtInTemplate.associatedTaskTemplateRef] : []),
                ];
                const customTasks = (item.customTaskTemplates ?? []) as InventoryEditableTaskTemplate[];
                const expanded = expandedItemId === item.id;
                const editingDetails = editingItemDetailsId === item.id;
                const placementSummary = row.placements.length > 0
                  ? `${row.placements.length} placement${row.placements.length === 1 ? '' : 's'}`
                  : 'Unplaced';

                return (
                  <article key={item.id} className="rounded-2xl border border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-900/40">
                    <button
                      type="button"
                      onClick={() => setExpandedItemId((prev) => (prev === item.id ? null : item.id))}
                      className="flex w-full items-center gap-3 px-3 py-3 text-left"
                    >
                      <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white dark:bg-gray-800">
                        {itemIdsWithDoc.has(item.id) ? (
                          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/60" title="Has linked doc">
                            <IconDisplay iconKey="doc" size={10} className="h-2.5 w-2.5 object-contain opacity-70" alt="doc" />
                          </span>
                        ) : null}
                        <IconDisplay iconKey={item.icon || 'inventory'} size={24} className="h-6 w-6 object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{item.name}</span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                            {row.kind}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {placementSummary}
                        </div>
                      </div>
                      <span className="text-xs font-medium text-gray-400">{expanded ? 'Hide' : 'Open'}</span>
                    </button>

                    {expanded ? (
                      <div className="space-y-3 border-t border-gray-200 px-3 py-3 dark:border-gray-700">
                        {row.description ? <p className="text-xs text-gray-500 dark:text-gray-400">{row.description}</p> : null}

                        {row.kind === 'facility' ? (
                          <>
                            <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Dimensions</p>
                              <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-900/60 dark:text-gray-200">
                                W {row.template.dimensions?.width ?? row.resolved?.dimensions?.width ?? 0} · D {row.template.dimensions?.depth ?? row.resolved?.dimensions?.depth ?? 0}
                              </div>
                            </div>

                            <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Tasks</p>
                              </div>
                              <div className="mt-2 space-y-2">
                                {taskRefs.length === 0 && customTasks.length === 0 ? (
                                  <p className="text-xs italic text-gray-400">No tasks.</p>
                                ) : null}
                                {taskRefs.map((taskTemplateRef) => {
                                  const taskDisplay = resolveTaskDisplay(taskTemplateRef, item.id);
                                  return (
                                    <div key={`${item.id}-${taskTemplateRef}`} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900/60">
                                      <span className="font-medium text-gray-700 dark:text-gray-200">{taskDisplay.name}</span>
                                      <span className="text-[11px] text-gray-500 dark:text-gray-400">{formatTaskTypeLabel(taskDisplay.taskType)}</span>
                                    </div>
                                  );
                                })}
                                {customTasks.map((taskTemplate) => (
                                  <div key={taskTemplate.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900/60">
                                    <div className="min-w-0 flex items-center gap-2">
                                      <IconDisplay iconKey={taskTemplate.icon || 'task'} size={16} className="h-4 w-4 shrink-0 object-contain" />
                                      <div className="min-w-0">
                                        <div className="font-medium text-gray-700 dark:text-gray-200">{taskTemplate.name}</div>
                                        <div className="text-[11px] text-gray-500 dark:text-gray-400">{formatTaskTypeLabel(taskTemplate.taskType)}</div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Placements</p>
                              <div className="mt-2 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                                {row.placements.length === 0 ? (
                                  <p className="text-xs italic text-gray-400">Unplaced</p>
                                ) : row.placements.map((placement) => (
                                  <div key={placement.key} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900/60">
                                    <div className="flex shrink-0 items-center gap-1.5">
                                      {placement.segments.map((segment) => (
                                        <span key={segment.key} title={segment.label} className="flex h-7 w-7 items-center justify-center rounded-full bg-white ring-1 ring-black/5 dark:bg-gray-800">
                                          <IconDisplay iconKey={segment.icon} size={14} className="h-3.5 w-3.5 object-contain" />
                                        </span>
                                      ))}
                                    </div>
                                    <div className="min-w-0 flex-1 text-sm text-gray-700 dark:text-gray-200">{placement.locationPath}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Placements</p>
                              <span className="text-xs text-gray-500 dark:text-gray-400">Total on hand: {row.totalOnHand}</span>
                            </div>
                            <div className="mt-2 space-y-2">
                              {row.placements.length === 0 ? (
                                <p className="text-xs italic text-gray-400">Unplaced - quantity managed when placed.</p>
                              ) : row.placements.map((placement) => (
                                <div key={placement.key} className="grid gap-2 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900/60 sm:grid-cols-[auto_minmax(0,1fr)_6rem] sm:items-center">
                                  <div className="flex shrink-0 items-center gap-1.5">
                                    {placement.segments.map((segment) => (
                                      <span key={segment.key} title={segment.label} className="flex h-7 w-7 items-center justify-center rounded-full bg-white ring-1 ring-black/5 dark:bg-gray-800">
                                        <IconDisplay iconKey={segment.icon} size={14} className="h-3.5 w-3.5 object-contain" />
                                      </span>
                                    ))}
                                  </div>
                                  <div className="text-sm text-gray-700 dark:text-gray-200">{placement.locationPath}</div>
                                  {editingDetails ? (
                                    <input
                                      type="number"
                                      min={0}
                                      value={placement.quantity}
                                      onChange={(event) => handleUpdatePlacementQuantity(placement, event.target.value)}
                                      className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                    />
                                  ) : (
                                    <div className="rounded-lg bg-white px-2.5 py-2 text-center text-sm text-gray-700 ring-1 ring-black/5 dark:bg-gray-800 dark:text-gray-200">{placement.quantity}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end gap-2">
                          {item.id.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX) ? (
                            <button
                              type="button"
                              onClick={() => openItemComposer(item.id)}
                              className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
                            >
                              Edit Template
                            </button>
                          ) : null}
                          {row.kind === 'consumable' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingItemDetailsId((current) => current === item.id ? null : item.id);
                              }}
                              className={editingDetails
                                ? 'rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200'
                                : 'rounded-full bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white'}
                            >
                              {editingDetails ? 'Done Editing' : 'Edit Details'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
                  })}
                </section>
              ))}
            </div>
          )
        ) : activeTab === 'containers' ? (
          regularContainerEntries.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-4 text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900/30">
              No containers added yet.
            </div>
          ) : (
            <div className="space-y-2">
              {regularContainerEntries.map((container) => {
                const locationLink = getLocationLink(container);
                const lowItems = container.items.filter((item) => {
                  const itemName = resolveInventoryItemTemplate(item.itemTemplateRef, itemEntries)?.name ?? item.itemTemplateRef;
                  return lowStockLabels.has(itemName) || (item.threshold != null && item.quantity != null && item.quantity <= item.threshold);
                });
                const expanded = expandedContainerId === container.id;
                const selectedHome = locationLink?.targetKind === 'home-room' ? homeResources.find((entry) => entry.id === locationLink.targetResourceId) : null;
                const selectedVehicleId = locationLink?.targetKind === 'vehicle' ? locationLink.targetResourceId : '';

                return (
                  <article key={container.id} className="rounded-2xl border border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-900/40">
                    <button
                      type="button"
                      onClick={() => setExpandedContainerId((prev) => (prev === container.id ? null : container.id))}
                      className="flex w-full items-center gap-3 px-3 py-3 text-left"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white dark:bg-gray-800">
                        <IconDisplay iconKey={container.icon || 'inventory'} size={24} className="h-6 w-6 object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`truncate text-sm font-semibold ${lowItems.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-800 dark:text-gray-100'}`}>
                            {container.name}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <span>{container.items.length} item{container.items.length === 1 ? '' : 's'}</span>
                          {locationLink ? <span>Placed in {describeContainerLocation(locationLink)}</span> : <span>Unplaced</span>}
                        </div>
                      </div>
                      {lowItems.length > 0 ? (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          {lowItems.length} low
                        </span>
                      ) : null}
                    </button>

                    {expanded ? (
                      <div className="space-y-3 border-t border-gray-200 px-3 py-3 dark:border-gray-700">
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
                          <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Contents</p>
                              <span className="text-xs text-gray-400 dark:text-gray-500">{container.items.length}</span>
                            </div>
                            <div className="mt-2 space-y-2">
                              {container.items.length === 0 ? (
                                <p className="text-xs italic text-gray-400">No items in container.</p>
                              ) : container.items.map((item) => {
                                const resolved = resolveInventoryItemTemplate(item.itemTemplateRef, itemEntries);
                                const templateKind = getItemTemplateByRef(item.itemTemplateRef)?.kind ?? resolved?.kind ?? 'consumable';
                                const taskDetails = templateKind === 'facility'
                                  ? (item.recurringTasks ?? []).map((task) => {
                                      const display = resolveTaskDisplay(task.taskTemplateRef, item.itemTemplateRef);
                                      return `${display.name}: ${(task.recurrenceMode ?? 'never') === 'recurring' ? `${describeTaskRecurrence(task.recurrence)} · ${describeReminder(task.reminderLeadDays ?? 7)}` : 'Intermittent'}`;
                                    })
                                  : [];
                                return (
                                  <div key={item.id} className="rounded-lg bg-gray-50 px-2.5 py-2 text-xs text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">
                                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                                      {resolved?.icon ? <IconDisplay iconKey={resolved.icon} size={14} className="h-3.5 w-3.5 shrink-0 object-contain" /> : null}
                                      <span>{resolved?.name ?? item.itemTemplateRef}</span>
                                    </div>
                                    {templateKind === 'consumable' ? (
                                      <div className="mt-1">
                                        {item.quantity ?? 0}{item.unit?.trim() ? ` ${item.unit.trim()}` : ''} on hand
                                        {item.threshold != null ? ` · Threshold ${item.threshold}` : ''}
                                      </div>
                                    ) : taskDetails.length > 0 ? (
                                      <div className="mt-1 space-y-1">
                                        {taskDetails.map((detail) => <div key={`${item.id}-${detail}`}>{detail}</div>)}
                                      </div>
                                    ) : (
                                      <div className="mt-1">Facility item</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Placement</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateContainerLocation(container.id, null)}
                                  className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200"
                                >
                                  Clear
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const firstHome = homeResources[0];
                                    if (firstHome) setContainerHome(container, firstHome.id);
                                  }}
                                  className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200"
                                >
                                  Choose Home + Room
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const firstVehicle = vehicleResources[0];
                                    if (firstVehicle) setContainerVehicle(container, firstVehicle.id);
                                  }}
                                  className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200"
                                >
                                  Choose Vehicle
                                </button>
                              </div>

                              <div className="mt-3 space-y-2 text-xs text-gray-500 dark:text-gray-400">
                                <div className="space-y-1">
                                  <label className="font-medium text-gray-600 dark:text-gray-300">Home</label>
                                  <select
                                    value={locationLink?.targetKind === 'home-room' ? locationLink.targetResourceId : ''}
                                    onChange={(event) => setContainerHome(container, event.target.value)}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                  >
                                    <option value="">No home placement</option>
                                    {homeResources.map((home) => (
                                      <option key={home.id} value={home.id}>{home.name}</option>
                                    ))}
                                  </select>
                                </div>

                                {selectedHome ? (
                                  <div className="space-y-1">
                                    <label className="font-medium text-gray-600 dark:text-gray-300">Room</label>
                                    <select
                                      value={locationLink?.targetKind === 'home-room' ? (locationLink.targetRoomId ?? '') : ''}
                                      onChange={(event) => setContainerRoom(container, event.target.value)}
                                      className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                    >
                                      <option value="">No specific room</option>
                                        {getHomeRoomReferences(selectedHome).map((room) => (
                                        <option key={room.id} value={room.id}>{room.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                ) : null}

                                <div className="space-y-1">
                                  <label className="font-medium text-gray-600 dark:text-gray-300">Vehicle</label>
                                  <select
                                    value={selectedVehicleId}
                                    onChange={(event) => setContainerVehicle(container, event.target.value)}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                  >
                                    <option value="">No vehicle placement</option>
                                    {vehicleResources.map((vehicle) => (
                                      <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>
                                    ))}
                                  </select>
                                </div>

                                <div className="rounded-lg bg-gray-50 px-2.5 py-2 dark:bg-gray-900/60">
                                  {locationLink ? `Current placement: ${describeContainerLocation(locationLink)}` : 'Current placement: none'}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingContainerId(container.id);
                              setShowAddContainerPanel(true);
                            }}
                            className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
                          >
                            Edit Container
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveContainer(container.id)}
                            className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )
        ) : (
          bagEntries.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-4 text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900/30">
              No bags added yet.
            </div>
          ) : (
            <div className="space-y-2">
              {bagEntries.map((bag) => {
                const locationLink = getLocationLink(bag);
                const expanded = expandedContainerId === bag.id;
                const bagQuantity = itemQuantityTotal(bag.items);

                return (
                  <article key={bag.id} className="rounded-2xl border border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-900/40">
                    <div className="flex items-center gap-3 px-3 py-3">
                      <button
                        type="button"
                        onClick={() => setExpandedContainerId((prev) => (prev === bag.id ? null : bag.id))}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white dark:bg-gray-800">
                          <IconDisplay iconKey={bag.icon || 'inventory'} size={24} className="h-6 w-6 object-contain" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{bag.name}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <span>{bagQuantity} item{bagQuantity === 1 ? '' : 's'}</span>
                            <span>
                              {bag.carryTask
                                ? ((bag.carryTask.recurrenceMode ?? 'never') === 'recurring'
                                  ? `${describeTaskRecurrence(bag.carryTask.recurrence)} · ${describeReminder(bag.carryTask.reminderLeadDays ?? 0)}`
                                  : 'Intermittent')
                                : 'Carry task required'}
                            </span>
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedContainerId((prev) => (prev === bag.id ? null : bag.id))}
                          className="text-xs font-medium text-gray-400"
                        >
                          {expanded ? 'Hide' : 'Open'}
                        </button>
                      </div>
                    </div>

                    {expanded ? (
                      <div className="space-y-3 border-t border-gray-200 px-3 py-3 dark:border-gray-700">
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
                          <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Items</p>
                              <span className="text-xs text-gray-400 dark:text-gray-500">{bagQuantity}</span>
                            </div>
                            <div className="mt-2 space-y-2">
                              {bag.items.length === 0 ? (
                                <p className="text-xs italic text-gray-400">No items in bag.</p>
                              ) : bag.items.map((item) => {
                                const resolved = resolveInventoryItemTemplate(item.itemTemplateRef, itemEntries);
                                return (
                                  <div key={item.id} className="rounded-lg bg-gray-50 px-2.5 py-2 text-xs text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">
                                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                                      {resolved?.icon ? <IconDisplay iconKey={resolved.icon} size={14} className="h-3.5 w-3.5 shrink-0 object-contain" /> : null}
                                      <span>{resolved?.name ?? item.itemTemplateRef}</span>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                      <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                                        Qty
                                      </label>
                                      <input
                                        type="number"
                                        min={0}
                                        value={item.quantity ?? 1}
                                        onChange={(event) => updateBagItemQuantity(bag.id, item.id, Number(event.target.value) || 0)}
                                        className="w-20 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                      />
                                      {item.unit?.trim() ? <span>{item.unit.trim()}</span> : null}
                                      <button
                                        type="button"
                                        onClick={() => removeBagItem(bag.id, item.id)}
                                        className="ml-auto rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{`Carry ${bag.name} Task`}</p>
                              <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                                <div className="font-medium text-gray-700 dark:text-gray-200">{bag.carryTask?.name ?? `Carry ${bag.name}`}</div>
                                <div>Type: {bag.carryTask?.taskType ?? 'CHECK'}</div>
                                <div>
                                  {(bag.carryTask?.recurrenceMode ?? 'never') === 'recurring'
                                    ? `${describeTaskRecurrence(bag.carryTask!.recurrence)} · ${describeReminder(bag.carryTask?.reminderLeadDays ?? 0)}`
                                    : 'Intermittent'}
                                </div>
                              </div>
                            </div>

                            <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Placement</p>
                              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                {locationLink ? `Placed in ${describeContainerLocation(locationLink)}` : 'Unplaced'}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBagId(bag.id);
                              setShowAddBagPanel(true);
                            }}
                            className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveContainer(bag.id)}
                            className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )
        )}
      </div>
      </div>

      {showAddItemPanel ? (
        <AddItemPanel
          resource={resource}
          mode={addItemContainerId ? 'container' : 'inventory'}
          onClose={() => {
            setShowAddItemPanel(false);
            setAddItemContainerId(null);
          }}
          containerId={addItemContainerId ?? undefined}
          onItemAdded={(itemTemplateRef) => {
            if (addItemContainerId) {
              setActiveTab('bags');
              setExpandedContainerId(addItemContainerId);
            } else {
              setActiveTab('items');
              setExpandedItemId(itemTemplateRef);
            }
            setAddItemContainerId(null);
            setShowAddItemPanel(false);
          }}
        />
      ) : null}
      {showAddContainerPanel ? (
        <AddContainerPanel
          resource={resource}
          container={editingContainer}
          onClose={() => {
            setShowAddContainerPanel(false);
            setEditingContainerId(null);
          }}
          onContainerSaved={(containerId) => {
            setActiveTab('containers');
            setExpandedContainerId(containerId);
            setEditingContainerId(null);
            setShowAddContainerPanel(false);
          }}
        />
      ) : null}
      {showAddBagPanel ? (
        <AddBagPanel
          resource={resource}
          bag={editingBag}
          onClose={() => {
            setShowAddBagPanel(false);
            setEditingBagId(null);
          }}
          onBagAdded={(bagId) => {
            setActiveTab('bags');
            setExpandedContainerId(bagId);
            setEditingBagId(null);
            setShowAddBagPanel(false);
          }}
        />
      ) : null}
    </section>
  );
}
