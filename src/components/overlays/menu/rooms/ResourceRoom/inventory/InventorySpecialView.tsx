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
import type { CheckInputFields, ConsumeEntry, ConsumeInputFields, TaskType, TextInputFields } from '../../../../../../types/taskTemplate';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { IconPicker } from '../../../../../shared/IconPicker';
import { TextInput } from '../../../../../shared/inputs/TextInput';
import { AddItemPanel } from './AddItemPanel';
import { AddBagPanel } from './AddBagPanel';
import { AddContainerPanel } from './AddContainerPanel';
import { ContainerLayoutCanvas } from './ContainerLayoutCanvas';
import { taskTemplateLibrary } from '../../../../../../coach';
import {
  getUserInventoryItemTemplates,
  mergeInventoryItemTemplates,
  resolveInventoryItemTemplate,
} from '../../../../../../utils/inventoryItems';
import { findHomeRoomReference } from '../../../../../../utils/homeRooms';
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
type ContainerPlacementFilterValue = 'all' | 'placed' | 'unplaced';
type ItemKindFilterValue = 'all' | ItemKind;
type ItemCategoryFilterValue = 'all' | ItemCategory | 'user-created' | 'room-created';
type EditableTaskType = Extract<TaskType, 'CHECK' | 'CONSUME' | 'TEXT'>;
type PlacementTaskInputFields = CheckInputFields | ConsumeInputFields | (Partial<TextInputFields> & { label: string });
type InventoryEditableTaskTemplate = InventoryCustomTaskTemplate & {
  taskType?: EditableTaskType;
  inputFields?: PlacementTaskInputFields;
};

const ITEM_PLACEMENT_FILTER_OPTIONS: Array<{ id: ItemPlacementFilterValue; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'placed', label: 'Placed' },
  { id: 'unplaced', label: 'Unplaced' },
];

const CONTAINER_PLACEMENT_FILTER_OPTIONS: Array<{ id: ContainerPlacementFilterValue; label: string }> = [
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

type ContainerFace = 'width-depth' | 'depth-height' | 'width-height';

interface ContainerRowSummary {
  rowKey: string;
  container: InventoryContainer;
  ownership: 'user' | 'room';
  ownerBadge?: string;
  locationLabel: string;
  isPlaced: boolean;
  groupKey?: string;
  groupLabel?: string;
  lowItemCount: number;
}

interface ContainerRowGroup {
  key: string;
  label: string;
  rows: ContainerRowSummary[];
  showHeader: boolean;
}

interface RoomDedicatedContainerEditorTarget {
  homeId: string;
  roomId: string;
  containerId: string;
}

const CONTAINER_FACE_OPTIONS: Array<{ value: ContainerFace; label: string; detail: string }> = [
  { value: 'width-depth', label: 'Top', detail: 'Width x Depth' },
  { value: 'depth-height', label: 'Side', detail: 'Depth x Height' },
  { value: 'width-height', label: 'Front', detail: 'Width x Height' },
];

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
  if (taskType === 'TEXT') return 'Use';
  return taskType.replaceAll('_', ' ');
}

function titleCaseCategory(category: ItemCategory | 'user-created' | 'room-created') {
  if (category === 'user-created') return 'User Created';
  if (category === 'room-created') return 'Room Created';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function getDefaultContainerPreviewFace(container: InventoryContainer): ContainerFace {
  if (container.layoutGrid?.widthDepth) return 'width-depth';
  if (container.layoutGrid?.depthHeight) return 'depth-height';
  if (container.layoutGrid?.widthHeight) return 'width-height';
  return 'width-depth';
}

export function InventorySpecialView({ resource }: InventorySpecialViewProps) {
  const scheduleTasks = useScheduleStore((s) => s.tasks) as Record<string, Task>;
  const scheduleTaskTemplates = useScheduleStore((s) => s.taskTemplates);
  const resources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const gtdTaskIds = useMemo(() => new Set(user?.lists.gtdList ?? []), [user?.lists.gtdList]);

  const [activeTab, setActiveTab] = useState<TabKey>('items');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [expandedContainerId, setExpandedContainerId] = useState<string | null>(null);
  const [showAddItemPanel, setShowAddItemPanel] = useState(false);
  const [addItemContainerId, setAddItemContainerId] = useState<string | null>(null);
  const [showAddBagPanel, setShowAddBagPanel] = useState(false);
  const [editingBagId, setEditingBagId] = useState<string | null>(null);
  const [showAddContainerPanel, setShowAddContainerPanel] = useState(false);
  const [editingContainerId, setEditingContainerId] = useState<string | null>(null);
  const [editingRoomDedicatedContainer, setEditingRoomDedicatedContainer] = useState<RoomDedicatedContainerEditorTarget | null>(null);
  const [showItemComposer, setShowItemComposer] = useState(false);
  const [draftItemName, setDraftItemName] = useState('');
  const [draftItemIcon, setDraftItemIcon] = useState('inventory');
  const [draftItemKind, setDraftItemKind] = useState<ItemKind>('consumable');
  const [draftItemCategory, setDraftItemCategory] = useState<ItemCategory>('workspace');
  const [draftItemDescription, setDraftItemDescription] = useState('Custom inventory item');
  const [draftItemWidth, setDraftItemWidth] = useState('0');
  const [draftItemDepth, setDraftItemDepth] = useState('0');
  const [draftTaskTemplates, setDraftTaskTemplates] = useState<InventoryEditableTaskTemplate[]>([]);
  const [selectedDraftTaskTemplateId, setSelectedDraftTaskTemplateId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemPlacementFilter, setItemPlacementFilter] = useState<ItemPlacementFilterValue>('all');
  const [containerPlacementFilter, setContainerPlacementFilter] = useState<ContainerPlacementFilterValue>('all');
  const [itemKindFilter, setItemKindFilter] = useState<ItemKindFilterValue>('all');
  const [itemCategoryFilter, setItemCategoryFilter] = useState<ItemCategoryFilterValue>('all');
  const [editingItemDetailsId, setEditingItemDetailsId] = useState<string | null>(null);
  const [containerPreviewFaces, setContainerPreviewFaces] = useState<Record<string, ContainerFace>>({});

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
    () => {
      if (editingRoomDedicatedContainer) {
        const home = resources[editingRoomDedicatedContainer.homeId];
        if (!home || home.type !== 'home') return null;
        for (const story of home.stories ?? []) {
          const room = story.rooms.find((entry) => entry.id === editingRoomDedicatedContainer.roomId);
          const container = room?.dedicatedContainers?.find((entry) => entry.id === editingRoomDedicatedContainer.containerId);
          if (container) return container;
        }
        return null;
      }

      return editingContainerId ? regularContainerEntries.find((entry) => entry.id === editingContainerId) ?? null : null;
    },
    [editingContainerId, editingRoomDedicatedContainer, regularContainerEntries, resources],
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
  const lowStockLabels = useMemo(
    () => new Set(
      Object.values(scheduleTasks)
        .filter((task) => task.resourceRef === resource.id && task.completionState === 'pending' && gtdTaskIds.has(task.id))
        .map((task) => (task.resultFields as Record<string, string> | undefined)?.itemName)
        .filter((itemName): itemName is string => Boolean(itemName)),
    ),
    [gtdTaskIds, resource.id, scheduleTasks],
  );
  const roomDedicatedContainerEntries = useMemo(() => {
    const rows: ContainerRowSummary[] = [];

    for (const home of homeResources) {
      for (const story of home.stories ?? []) {
        for (const room of story.rooms) {
          const groupLabel = `${home.name} / ${room.name}`;
          for (const container of room.dedicatedContainers ?? []) {
            const lowItemCount = container.items.filter((item) => {
              const itemName = resolveInventoryItemTemplate(item.itemTemplateRef, itemEntries)?.name ?? item.itemTemplateRef;
              return lowStockLabels.has(itemName) || (item.threshold != null && item.quantity != null && item.quantity <= item.threshold);
            }).length;

            rows.push({
              rowKey: `room:${home.id}:${room.id}:${container.id}`,
              container,
              ownership: 'room',
              ownerBadge: 'Room',
              locationLabel: groupLabel,
              isPlaced: true,
              groupKey: `home:${home.id}:${room.id}`,
              groupLabel,
              lowItemCount,
            });
          }
        }
      }
    }

    return rows;
  }, [homeResources, itemEntries, lowStockLabels]);

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

  const availableConsumeTemplates = useMemo(
    () => itemEntries
      .filter((template) => (template.kind ?? 'consumable') === 'consumable')
      .filter((template) => (itemPlacementsByTemplateId.get(template.id)?.length ?? 0) > 0),
    [itemEntries, itemPlacementsByTemplateId],
  );

  const visibleItemRows = useMemo(
    () => (expandedItemId ? itemRows.filter((row) => row.template.id === expandedItemId) : itemRows),
    [expandedItemId, itemRows],
  );
  const editedItemPlacementCount = useMemo(
    () => editingItemId ? (itemPlacementsByTemplateId.get(editingItemId)?.length ?? 0) : 0,
    [editingItemId, itemPlacementsByTemplateId],
  );
  const selectedDraftTaskTemplate = useMemo(
    () => draftTaskTemplates.find((taskTemplate) => taskTemplate.id === selectedDraftTaskTemplateId) ?? null,
    [draftTaskTemplates, selectedDraftTaskTemplateId],
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

  function resolveContainerPlacement(link: InventoryContainerLink | null | undefined) {
    if (!link?.targetResourceId) {
      return {
        isPlaced: false,
        label: 'Unplaced',
      };
    }

    if (link.targetKind === 'vehicle') {
      const vehicle = resources[link.targetResourceId] as VehicleResource | undefined;
      const area = vehicle?.layout?.areas.find((entry) => entry.id === link.targetAreaId);
      const label = vehicle?.name && area?.name
        ? `${vehicle.name} / ${area.name}`
        : area?.name ?? vehicle?.name ?? 'Vehicle';

      return {
        isPlaced: true,
        label,
        groupKey: `vehicle:${link.targetResourceId}:${link.targetAreaId ?? 'vehicle'}`,
        groupLabel: label,
      };
    }

    const home = resources[link.targetResourceId] as HomeResource | undefined;
    const room = home ? findHomeRoomReference(home, link.targetRoomId) : null;
    const label = home?.name && room?.name
      ? `${home.name} / ${room.name}`
      : room?.name ?? home?.name ?? 'Home room';

    return {
      isPlaced: true,
      label,
      groupKey: `home:${link.targetResourceId}:${link.targetRoomId ?? 'home'}`,
      groupLabel: label,
    };
  }

  const userContainerRows: ContainerRowSummary[] = regularContainerEntries.map((container) => {
    const placement = resolveContainerPlacement(getLocationLink(container));
    const lowItemCount = container.items.filter((item) => {
      const itemName = resolveInventoryItemTemplate(item.itemTemplateRef, itemEntries)?.name ?? item.itemTemplateRef;
      return lowStockLabels.has(itemName) || (item.threshold != null && item.quantity != null && item.quantity <= item.threshold);
    }).length;

    return {
      rowKey: `owned:${container.id}`,
      container,
      ownership: 'user',
      locationLabel: placement.label,
      isPlaced: placement.isPlaced,
      groupKey: placement.groupKey,
      groupLabel: placement.groupLabel,
      lowItemCount,
    } satisfies ContainerRowSummary;
  });
  const containerRows: ContainerRowSummary[] = [...userContainerRows, ...roomDedicatedContainerEntries];

  const filteredContainerRows = containerRows.filter((row) => (
    containerPlacementFilter === 'all'
      ? true
      : containerPlacementFilter === 'placed'
        ? row.isPlaced
        : !row.isPlaced
  ));
  const visibleContainerRows = expandedContainerId && filteredContainerRows.some((row) => row.rowKey === expandedContainerId)
    ? filteredContainerRows.filter((row) => row.rowKey === expandedContainerId)
    : filteredContainerRows;

  const groupedContainerRows: ContainerRowGroup[] = (() => {
    const sortRows = (rows: ContainerRowSummary[]) => [...rows].sort((left, right) => {
      if (left.ownership !== right.ownership) return left.ownership === 'room' ? -1 : 1;
      return left.container.name.localeCompare(right.container.name);
    });

    if (containerPlacementFilter === 'unplaced') {
      return visibleContainerRows.length === 0
        ? []
        : [{
            key: 'unplaced-flat',
            label: 'Unplaced',
            rows: sortRows(visibleContainerRows),
            showHeader: false,
          }];
    }

    const groups = new Map<string, ContainerRowSummary[]>();
    for (const row of visibleContainerRows.filter((entry) => entry.isPlaced)) {
      const key = row.groupKey ?? row.locationLabel;
      const current = groups.get(key) ?? [];
      current.push(row);
      groups.set(key, current);
    }

    const groupedRows = [...groups.entries()]
      .map(([key, rows]) => ({
        key,
        label: rows[0]?.groupLabel ?? rows[0]?.locationLabel ?? 'Placed',
        rows: sortRows(rows),
        showHeader: true,
      }))
      .sort((left, right) => left.label.localeCompare(right.label));

    if (containerPlacementFilter === 'all') {
      const unplacedRows = visibleContainerRows.filter((row) => !row.isPlaced);
      if (unplacedRows.length > 0) {
        groupedRows.push({
          key: 'unplaced',
          label: 'Unplaced',
          rows: sortRows(unplacedRows),
          showHeader: true,
        });
      }
    }

    return groupedRows;
  })();

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
    setSelectedDraftTaskTemplateId(null);
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
        taskType: taskTemplate.taskType ?? 'CHECK',
        inputFields: (taskTemplate.taskType ?? 'CHECK') === 'CONSUME'
          ? {
              label: taskTemplate.name,
              entries: ((taskTemplate.inputFields as ConsumeInputFields | undefined)?.entries ?? []).map((entry) => ({
                itemTemplateRef: entry.itemTemplateRef,
                quantity: Math.max(1, entry.quantity || 1),
              })),
            }
          : (taskTemplate.taskType ?? 'CHECK') === 'TEXT'
            ? {
                label: taskTemplate.name,
                prompt: typeof (taskTemplate.inputFields as Partial<TextInputFields> | undefined)?.prompt === 'string'
                  ? (taskTemplate.inputFields as Partial<TextInputFields>).prompt
                  : '',
              }
          : { label: taskTemplate.name },
      })),
    );
    setSelectedDraftTaskTemplateId(null);
    setEditingItemId(itemId);
    setShowItemComposer(true);
    setExpandedItemId(itemId);
    setEditingItemDetailsId(null);
  }

  function addDraftTaskTemplate() {
    const nextId = crypto.randomUUID();
    setDraftTaskTemplates((prev) => [...prev, {
      id: nextId,
      name: '',
      icon: 'task',
      taskType: 'CHECK',
      inputFields: { label: '' },
    }]);
    setSelectedDraftTaskTemplateId(nextId);
  }

  function updateDraftTaskTemplate(id: string, patch: Partial<InventoryEditableTaskTemplate>) {
    setDraftTaskTemplates((prev) => prev.map((taskTemplate) => {
      if (taskTemplate.id !== id) return taskTemplate;

      const nextTaskTemplate = { ...taskTemplate, ...patch };
      const taskType = nextTaskTemplate.taskType ?? 'CHECK';
      if (taskType === 'CONSUME') {
        return {
          ...nextTaskTemplate,
          inputFields: {
            label: nextTaskTemplate.name,
            entries: ((nextTaskTemplate.inputFields as ConsumeInputFields | undefined)?.entries ?? []),
          },
        };
      }

      if (taskType === 'TEXT') {
        return {
          ...nextTaskTemplate,
          inputFields: {
            label: nextTaskTemplate.name,
            prompt: typeof (nextTaskTemplate.inputFields as Partial<TextInputFields> | undefined)?.prompt === 'string'
              ? (nextTaskTemplate.inputFields as Partial<TextInputFields>).prompt
              : '',
          },
        };
      }

      return {
        ...nextTaskTemplate,
        inputFields: {
          label: nextTaskTemplate.name,
        },
      };
    }));
  }

  function removeDraftTaskTemplate(id: string) {
    setDraftTaskTemplates((prev) => {
      const next = prev.filter((taskTemplate) => taskTemplate.id !== id);
      setSelectedDraftTaskTemplateId((current) => current === id ? (next[0]?.id ?? null) : current);
      return next;
    });
  }

  function addDraftTaskConsumeEntry(taskTemplateId: string) {
    const taskTemplate = draftTaskTemplates.find((entry) => entry.id === taskTemplateId);
    const consumeFields = (taskTemplate?.inputFields as ConsumeInputFields | undefined) ?? { label: taskTemplate?.name ?? '', entries: [] };
    updateDraftTaskTemplate(taskTemplateId, {
      inputFields: {
        label: taskTemplate?.name ?? '',
        entries: [
          ...consumeFields.entries,
          {
            itemTemplateRef: '',
            quantity: 1,
          },
        ],
      },
    });
  }

  function updateDraftTaskConsumeEntry(taskTemplateId: string, entryIndex: number, patch: Partial<ConsumeEntry>) {
    const taskTemplate = draftTaskTemplates.find((entry) => entry.id === taskTemplateId);
    const consumeFields = (taskTemplate?.inputFields as ConsumeInputFields | undefined) ?? { label: taskTemplate?.name ?? '', entries: [] };
    updateDraftTaskTemplate(taskTemplateId, {
      inputFields: {
        label: taskTemplate?.name ?? '',
        entries: consumeFields.entries.map((entry, index) => (
          index === entryIndex ? { ...entry, ...patch } : entry
        )),
      },
    });
  }

  function removeDraftTaskConsumeEntry(taskTemplateId: string, entryIndex: number) {
    const taskTemplate = draftTaskTemplates.find((entry) => entry.id === taskTemplateId);
    const consumeFields = (taskTemplate?.inputFields as ConsumeInputFields | undefined) ?? { label: taskTemplate?.name ?? '', entries: [] };
    updateDraftTaskTemplate(taskTemplateId, {
      inputFields: {
        label: taskTemplate?.name ?? '',
        entries: consumeFields.entries.filter((_, index) => index !== entryIndex),
      },
    });
  }

  function updateDraftTaskTextInput(taskTemplateId: string, prompt: string) {
    const taskTemplate = draftTaskTemplates.find((entry) => entry.id === taskTemplateId);
    updateDraftTaskTemplate(taskTemplateId, {
      inputFields: {
        label: taskTemplate?.name ?? '',
        prompt,
      },
    });
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
              taskType: taskTemplate.taskType ?? 'CHECK',
              inputFields: (taskTemplate.taskType ?? 'CHECK') === 'CONSUME'
                ? {
                    label: taskTemplate.name.trim(),
                    entries: ((taskTemplate.inputFields as ConsumeInputFields | undefined)?.entries ?? [])
                      .filter((entry) => entry.itemTemplateRef.trim().length > 0)
                      .map((entry) => ({
                        itemTemplateRef: entry.itemTemplateRef,
                        quantity: Math.max(1, Math.floor(entry.quantity || 1)),
                      })),
                  }
                : (taskTemplate.taskType ?? 'CHECK') === 'TEXT'
                  ? {
                      label: taskTemplate.name.trim(),
                      prompt: typeof (taskTemplate.inputFields as Partial<TextInputFields> | undefined)?.prompt === 'string'
                        ? (taskTemplate.inputFields as Partial<TextInputFields>).prompt?.trim() ?? ''
                        : '',
                    }
                : {
                    label: taskTemplate.name.trim(),
                  },
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

  function handleDeleteEditedItem() {
    if (!user || !editingItemId || editedItemPlacementCount > 0) return;

    const nextTemplates = (user.lists.inventoryItemTemplates ?? []).filter((item) => item.id !== editingItemId);
    setUser({
      ...user,
      lists: {
        ...user.lists,
        inventoryItemTemplates: nextTemplates,
      },
    });

    setExpandedItemId((current) => (current === editingItemId ? null : current));
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

  function handleDeleteContainer(containerId: string) {
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
    setExpandedContainerId((prev) => (prev === `owned:${containerId}` || prev === `bag:${containerId}` ? null : prev));
  }

  function handleSaveRoomDedicatedContainer(nextContainer: InventoryContainer) {
    if (!editingRoomDedicatedContainer) return;

    const home = resources[editingRoomDedicatedContainer.homeId];
    if (!home || home.type !== 'home') return;

    setResource({
      ...home,
      updatedAt: new Date().toISOString(),
      stories: (home.stories ?? []).map((story) => ({
        ...story,
        rooms: story.rooms.map((room) => {
          if (room.id !== editingRoomDedicatedContainer.roomId) return room;

          return {
            ...room,
            dedicatedContainers: (room.dedicatedContainers ?? []).map((container) => (
              container.id === editingRoomDedicatedContainer.containerId ? nextContainer : container
            )),
          };
        }),
      })),
    });
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
    const scheduleTemplate = scheduleTaskTemplates[taskTemplateRef];
    if (scheduleTemplate) {
      return {
        name: scheduleTemplate.name,
        icon: scheduleTemplate.icon || 'task',
        taskType: scheduleTemplate.taskType,
      };
    }

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

  function findPlacedItem(homeId: string, roomId: string | undefined, placementId: string): PlacedInstance | null {
    const home = resources[homeId];
    if (!home || home.type !== 'home') return null;

    for (const story of home.stories ?? []) {
      if (!roomId) {
        const placement = story.placedItems.find((entry) => entry.id === placementId);
        if (placement) return placement;
      }

      const room = story.rooms.find((entry) => entry.id === roomId);
      const placement = room?.placedItems.find((entry) => entry.id === placementId);
      if (placement) return placement;
    }

    return null;
  }

  function getLocationLink(container: InventoryContainer) {
    return container.links?.find((link) => link.relationship === 'location');
  }

  function describeContainerLocation(link: InventoryContainerLink) {
    return resolveContainerPlacement(link).label;
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
          links: link ? [...baseLinks, link] : (baseLinks.length > 0 ? baseLinks : undefined),
        };
      }),
    });
  }

  function ensureContainerPreviewFace(rowKey: string, container: InventoryContainer) {
    setContainerPreviewFaces((current) => (
      current[rowKey]
        ? current
        : {
            ...current,
            [rowKey]: getDefaultContainerPreviewFace(container),
          }
    ));
  }

  function toggleExpandedContainer(rowKey: string, container: InventoryContainer) {
    ensureContainerPreviewFace(rowKey, container);
    setExpandedContainerId((prev) => (prev === rowKey ? null : rowKey));
  }

  function handleRemoveContainerFromRoom(containerId: string) {
    const container = regularContainerEntries.find((entry) => entry.id === containerId);
    if (!container) return;

    const locationLink = getLocationLink(container);
    updateContainerLocation(
      containerId,
      locationLink
        ? {
            ...locationLink,
            targetResourceId: undefined,
            targetRoomId: undefined,
            targetAreaId: undefined,
          }
        : null,
    );
    cleanupHomePlacements((placement) => placement.kind === 'container' && placement.refId === containerId);
    cleanupVehiclePlacements(containerId);
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
            Containers ({containerRows.length})
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
              setEditingRoomDedicatedContainer(null);
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
                  {(selectedDraftTaskTemplateId
                    ? draftTaskTemplates.filter((taskTemplate) => taskTemplate.id === selectedDraftTaskTemplateId)
                    : draftTaskTemplates
                  ).length === 0 ? (
                    <p className="text-xs italic text-gray-400">No custom tasks added yet.</p>
                  ) : (selectedDraftTaskTemplateId
                    ? draftTaskTemplates.filter((taskTemplate) => taskTemplate.id === selectedDraftTaskTemplateId)
                    : draftTaskTemplates
                  ).map((taskTemplate) => (
                    <button
                      key={taskTemplate.id}
                      type="button"
                      onClick={() => setSelectedDraftTaskTemplateId(taskTemplate.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition-colors ${
                        selectedDraftTaskTemplateId === taskTemplate.id
                          ? 'bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-700/50'
                          : 'bg-gray-50 hover:bg-gray-100 dark:bg-gray-900/60 dark:hover:bg-gray-900/80'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <IconDisplay iconKey={taskTemplate.icon || 'task'} size={18} className="h-4.5 w-4.5 shrink-0 object-contain" />
                        <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{taskTemplate.name.trim() || 'Untitled task'}</span>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        (taskTemplate.taskType ?? 'CHECK') === 'CONSUME'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      }`}>
                        {formatTaskTypeLabel(taskTemplate.taskType ?? 'CHECK')}
                      </span>
                    </button>
                  ))}
                </div>

                {selectedDraftTaskTemplate ? (
                  <div className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-900/60">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="shrink-0">
                        <IconPicker
                          value={selectedDraftTaskTemplate.icon || 'task'}
                          onChange={(value) => updateDraftTaskTemplate(selectedDraftTaskTemplate.id, { icon: value })}
                          align="left"
                        />
                      </div>
                      <div className="min-w-0 flex-1 space-y-3">
                        <TextInput
                          label="Task name"
                          value={selectedDraftTaskTemplate.name}
                          onChange={(value) => updateDraftTaskTemplate(selectedDraftTaskTemplate.id, { name: value })}
                          placeholder="e.g. Wipe down"
                          maxLength={80}
                        />
                        <label className="space-y-1 block">
                          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">Task Type</span>
                          <select
                            value={selectedDraftTaskTemplate.taskType ?? 'CHECK'}
                            onChange={(event) => updateDraftTaskTemplate(selectedDraftTaskTemplate.id, { taskType: event.target.value as EditableTaskType })}
                            className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                          >
                            <option value="CHECK">CHECK</option>
                            <option value="CONSUME">CONSUME</option>
                            <option value="TEXT">Use</option>
                          </select>
                        </label>
                      </div>
                    </div>

                    {(selectedDraftTaskTemplate.taskType ?? 'CHECK') === 'CONSUME' ? (
                      <div className="space-y-3 rounded-lg border border-gray-200 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-800">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Consume entries</div>
                          <button
                            type="button"
                            onClick={() => addDraftTaskConsumeEntry(selectedDraftTaskTemplate.id)}
                            className="text-xs font-medium text-blue-500 hover:text-blue-600"
                          >
                            + Add entry
                          </button>
                        </div>

                        {(((selectedDraftTaskTemplate.inputFields as ConsumeInputFields | undefined)?.entries) ?? []).length === 0 ? (
                          <div className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                            No consume entries yet.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {(((selectedDraftTaskTemplate.inputFields as ConsumeInputFields | undefined)?.entries) ?? []).map((entry, index) => (
                              <div key={`${selectedDraftTaskTemplate.id}-consume-${index}`} className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-900/40 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end">
                                <label className="space-y-1 block">
                                  <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Item</span>
                                  <select
                                    value={entry.itemTemplateRef}
                                    onChange={(event) => updateDraftTaskConsumeEntry(selectedDraftTaskTemplate.id, index, { itemTemplateRef: event.target.value })}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                  >
                                    <option value="">Select item</option>
                                    {availableConsumeTemplates.map((template) => (
                                      <option key={template.id} value={template.id}>{template.name}</option>
                                    ))}
                                  </select>
                                </label>

                                <label className="space-y-1 block">
                                  <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Quantity</span>
                                  <input
                                    type="number"
                                    min={1}
                                    value={entry.quantity}
                                    onChange={(event) => updateDraftTaskConsumeEntry(selectedDraftTaskTemplate.id, index, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                  />
                                </label>

                                <button
                                  type="button"
                                  onClick={() => removeDraftTaskConsumeEntry(selectedDraftTaskTemplate.id, index)}
                                  className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {(selectedDraftTaskTemplate.taskType ?? 'CHECK') === 'TEXT' ? (
                      <div className="space-y-3 rounded-lg border border-gray-200 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-800">
                        <label className="space-y-1 block">
                          <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Prompt</span>
                          <input
                            type="text"
                            value={((selectedDraftTaskTemplate.inputFields as Partial<TextInputFields> | undefined)?.prompt) ?? ''}
                            onChange={(event) => updateDraftTaskTextInput(selectedDraftTaskTemplate.id, event.target.value)}
                            placeholder="e.g. Preheat to 375°F"
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                          />
                        </label>
                      </div>
                    ) : null}

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedDraftTaskTemplateId(null)}
                        className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
                      >
                        Set
                      </button>
                      <button type="button" onClick={() => removeDraftTaskTemplate(selectedDraftTaskTemplate.id)} className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300">
                        Remove Task
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            {editingItemId ? (
              <button
                type="button"
                onClick={handleDeleteEditedItem}
                disabled={editedItemPlacementCount > 0}
                className={editedItemPlacementCount === 0
                  ? 'rounded-full bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30'
                  : 'rounded-full bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-400 dark:bg-gray-700 dark:text-gray-500'}
                title={editedItemPlacementCount > 0 ? 'Item cannot be deleted while placed somewhere.' : 'Delete item template'}
              >
                Delete Item
              </button>
            ) : null}
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
                const expanded = expandedItemId === item.id;
                const editingDetails = editingItemDetailsId === item.id;
                const placementSummary = row.placements.length > 0
                  ? `${row.placements.length} placement${row.placements.length === 1 ? '' : 's'}`
                  : 'Unplaced';
                const builtInTaskRefs = [
                  ...(row.builtInTemplate?.builtInTasks?.map((task) => task.taskTemplateRef) ?? []),
                  ...(row.builtInTemplate?.associatedTaskTemplateRef ? [row.builtInTemplate.associatedTaskTemplateRef] : []),
                ];
                const builtInTaskRefSet = new Set(builtInTaskRefs);
                const itemTaskTemplates = row.isUserManaged
                  ? ((row.template.customTaskTemplates ?? []) as InventoryEditableTaskTemplate[])
                  : [];

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
                          <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Dimensions</p>
                            <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-900/60 dark:text-gray-200">
                              W {row.template.dimensions?.width ?? row.resolved?.dimensions?.width ?? 0} · D {row.template.dimensions?.depth ?? row.resolved?.dimensions?.depth ?? 0}
                            </div>
                          </div>
                        ) : null}

                        <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                            {row.isUserManaged ? 'Item Tasks' : 'Built-in Tasks'}
                          </p>
                          <div className="mt-3 space-y-2">
                            {row.isUserManaged ? (
                              itemTaskTemplates.length === 0 ? (
                                <p className="text-xs italic text-gray-400">No item tasks.</p>
                              ) : itemTaskTemplates.map((taskTemplate) => (
                                <div key={taskTemplate.id} className="flex items-center justify-between gap-3 px-1 py-1.5 text-sm">
                                  <span className="min-w-0 truncate font-medium text-gray-700 dark:text-gray-200">{taskTemplate.name}</span>
                                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                    (taskTemplate.taskType ?? 'CHECK') === 'CONSUME'
                                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                  }`}>
                                    {formatTaskTypeLabel(taskTemplate.taskType ?? 'CHECK')}
                                  </span>
                                </div>
                              ))
                            ) : builtInTaskRefs.length === 0 ? (
                              <p className="text-xs italic text-gray-400">No built-in tasks.</p>
                            ) : builtInTaskRefs.map((taskTemplateRef) => {
                              const taskDisplay = resolveTaskDisplay(taskTemplateRef, item.id);
                              return (
                                <div key={`${item.id}-${taskTemplateRef}`} className="flex items-center justify-between gap-3 px-1 py-1.5 text-sm">
                                  <span className="min-w-0 truncate font-medium text-gray-700 dark:text-gray-200">{taskDisplay.name}</span>
                                  <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                    {formatTaskTypeLabel(taskDisplay.taskType)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Placements</p>
                            {row.kind === 'consumable' ? <span className="text-xs text-gray-500 dark:text-gray-400">Total on hand: {row.totalOnHand}</span> : null}
                          </div>
                          <div className="mt-3 space-y-1.5">
                            {row.placements.length === 0 ? (
                              <p className="text-xs italic text-gray-400">{row.kind === 'consumable' ? 'Unplaced - quantity managed when placed.' : 'Unplaced'}</p>
                            ) : row.placements.map((placement) => {
                              const placementInstance = placement.target.kind === 'home-placement'
                                ? findPlacedItem(placement.target.homeId, placement.target.roomId, placement.target.placementId)
                                : null;
                              const recurringTasks = (placementInstance?.recurringTasks ?? []).filter((task) => !builtInTaskRefSet.has(task.taskTemplateRef));

                              return (
                                <div key={placement.key} className="py-2">
                                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem] sm:items-center">
                                    <div className="min-w-0 text-sm text-gray-700 dark:text-gray-200">{placement.locationPath}</div>
                                    {row.kind === 'consumable' ? (
                                      editingDetails ? (
                                        <input
                                          type="number"
                                          min={0}
                                          value={placement.quantity}
                                          onChange={(event) => handleUpdatePlacementQuantity(placement, event.target.value)}
                                          className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                        />
                                      ) : (
                                        <div className="rounded-lg bg-gray-50 px-2.5 py-2 text-center text-sm text-gray-700 dark:bg-gray-900/60 dark:text-gray-200">{placement.quantity}</div>
                                      )
                                    ) : (
                                      <div className="rounded-lg bg-gray-50 px-2.5 py-2 text-center text-sm text-gray-700 dark:bg-gray-900/60 dark:text-gray-200">{placement.quantity}</div>
                                    )}
                                  </div>

                                  {recurringTasks.length > 0 ? (
                                    <div className="mt-2 ml-4 flex flex-wrap gap-2">
                                      {recurringTasks.map((task) => {
                                        const taskDisplay = resolveTaskDisplay(task.taskTemplateRef, item.id);
                                        return (
                                          <div key={task.id} className="flex items-center gap-2 rounded-full bg-gray-100 px-2.5 py-1 text-xs dark:bg-gray-900/60">
                                            <span className="font-medium text-gray-700 dark:text-gray-200">{taskDisplay.name}</span>
                                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                              (task.taskType ?? taskDisplay.taskType) === 'CONSUME'
                                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                            }`}>
                                              {formatTaskTypeLabel(task.taskType ?? taskDisplay.taskType)}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>

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
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {CONTAINER_PLACEMENT_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setContainerPlacementFilter(option.id)}
                  className={containerPlacementFilter === option.id
                    ? 'rounded-full bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {containerRows.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-4 text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900/30">
                No containers added yet.
              </div>
            ) : groupedContainerRows.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-4 text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900/30">
                No containers match this filter.
              </div>
            ) : (
              groupedContainerRows.map((group) => (
                <section key={group.key} className="space-y-2">
                  {group.showHeader ? (
                    <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                      {group.label}
                    </div>
                  ) : null}
                  {group.rows.map((row) => {
                    const expanded = expandedContainerId === row.rowKey;
                    const previewFace = containerPreviewFaces[row.rowKey] ?? getDefaultContainerPreviewFace(row.container);

                    return (
                      <article key={row.rowKey} className="rounded-2xl border border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-900/40">
                        <button
                          type="button"
                          onClick={() => toggleExpandedContainer(row.rowKey, row.container)}
                          className="flex w-full items-center gap-3 px-3 py-3 text-left"
                        >
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white dark:bg-gray-800">
                            <IconDisplay iconKey={row.container.icon || 'inventory'} size={24} className="h-6 w-6 object-contain" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`truncate text-sm font-semibold ${row.lowItemCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-800 dark:text-gray-100'}`}>
                                {row.container.name}
                              </span>
                              {row.ownerBadge ? (
                                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                                  {row.ownerBadge}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                              <span>{row.container.items.length} item{row.container.items.length === 1 ? '' : 's'}</span>
                              <span>{row.locationLabel}</span>
                            </div>
                          </div>
                          {row.lowItemCount > 0 ? (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                              {row.lowItemCount} low
                            </span>
                          ) : null}
                          <span className="text-xs font-medium text-gray-400">{expanded ? 'Hide' : 'Open'}</span>
                        </button>

                        {expanded ? (
                          <div className="space-y-3 border-t border-gray-200 px-3 py-3 dark:border-gray-700">
                            <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Layout Preview</p>
                              <div className="mt-3">
                                <ContainerLayoutCanvas
                                  container={row.container}
                                  activeFace={previewFace}
                                  items={row.container.items}
                                  isEditMode={false}
                                  viewportHeightClassName="h-64 sm:h-72"
                                  onPlaceItem={() => {}}
                                  onUpdateItemQuantity={() => {}}
                                  onRemoveItem={() => {}}
                                />
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {CONTAINER_FACE_OPTIONS.map((option) => (
                                  <button
                                    key={`${row.rowKey}-${option.value}`}
                                    type="button"
                                    onClick={() => setContainerPreviewFaces((current) => ({
                                      ...current,
                                      [row.rowKey]: option.value,
                                    }))}
                                    className={previewFace === option.value
                                      ? 'rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white'
                                      : 'rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                              <div className="mt-3 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (row.ownership === 'room') {
                                      const [, homeId, roomId, containerId] = row.rowKey.split(':');
                                      setEditingRoomDedicatedContainer({ homeId, roomId, containerId });
                                      setEditingContainerId(null);
                                    } else {
                                      setEditingContainerId(row.container.id);
                                      setEditingRoomDedicatedContainer(null);
                                    }
                                    setShowAddContainerPanel(true);
                                  }}
                                  className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
                                >
                                  Edit Container
                                </button>
                              </div>
                            </div>

                            <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Contents</p>
                                <span className="text-xs text-gray-400 dark:text-gray-500">{row.container.items.length}</span>
                              </div>
                              <div className="mt-3 space-y-2">
                                {row.container.items.length === 0 ? (
                                  <p className="text-xs italic text-gray-400">No items in this container.</p>
                                ) : row.container.items.map((item) => {
                                  const resolved = resolveInventoryItemTemplate(item.itemTemplateRef, itemEntries);
                                  return (
                                    <div key={`${row.rowKey}:${item.id}`} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900/60">
                                      <div className="flex min-w-0 items-center gap-2">
                                        {resolved?.icon ? <IconDisplay iconKey={resolved.icon} size={16} className="h-4 w-4 shrink-0 object-contain" /> : null}
                                        <span className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">{resolved?.name ?? item.itemTemplateRef}</span>
                                      </div>
                                      <span className="shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400">Qty {item.quantity ?? 1}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Placement</p>
                              <div className="mt-3 text-sm text-gray-700 dark:text-gray-200">{row.locationLabel}</div>
                              {row.ownership === 'user' ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveContainerFromRoom(row.container.id)}
                                    className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                                  >
                                    Remove from room
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteContainer(row.container.id)}
                                    disabled={row.container.items.length > 0}
                                    title={row.container.items.length > 0 ? 'Remove all items first.' : 'Delete container'}
                                    className={row.container.items.length === 0
                                      ? 'rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300'
                                      : 'rounded-full bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-400 dark:bg-gray-700 dark:text-gray-500'}
                                  >
                                    Delete container
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </section>
              ))
            )}
          </div>
        ) : (
          bagEntries.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-4 text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900/30">
              No bags added yet.
            </div>
          ) : (
            <div className="space-y-2">
              {bagEntries.map((bag) => {
                const locationLink = getLocationLink(bag);
                const bagRowKey = `bag:${bag.id}`;
                const expanded = expandedContainerId === bagRowKey;
                const bagQuantity = itemQuantityTotal(bag.items);

                return (
                  <article key={bag.id} className="rounded-2xl border border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-900/40">
                    <div className="flex items-center gap-3 px-3 py-3">
                      <button
                        type="button"
                        onClick={() => setExpandedContainerId((prev) => (prev === bagRowKey ? null : bagRowKey))}
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
                          onClick={() => setExpandedContainerId((prev) => (prev === bagRowKey ? null : bagRowKey))}
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
                            onClick={() => handleDeleteContainer(bag.id)}
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
              setExpandedContainerId(`bag:${addItemContainerId}`);
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
          onSaveContainer={editingRoomDedicatedContainer ? handleSaveRoomDedicatedContainer : undefined}
          onClose={() => {
            setShowAddContainerPanel(false);
            setEditingContainerId(null);
            setEditingRoomDedicatedContainer(null);
          }}
          onContainerSaved={(containerId) => {
            setActiveTab('containers');
            setExpandedContainerId(
              editingRoomDedicatedContainer
                ? `room:${editingRoomDedicatedContainer.homeId}:${editingRoomDedicatedContainer.roomId}:${containerId}`
                : `owned:${containerId}`,
            );
            setEditingContainerId(null);
            setEditingRoomDedicatedContainer(null);
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
            setExpandedContainerId(`bag:${bagId}`);
            setEditingBagId(null);
            setShowAddBagPanel(false);
          }}
        />
      ) : null}
    </section>
  );
}
