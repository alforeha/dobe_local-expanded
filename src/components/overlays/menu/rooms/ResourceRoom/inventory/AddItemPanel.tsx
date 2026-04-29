import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  CUSTOM_ITEM_TEMPLATE_PREFIX,
  itemLibrary,
  makeCustomItemTemplateRef,
  type ItemCategory,
  type ItemKind,
} from '../../../../../../coach/ItemLibrary';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import type { HomeResource, InventoryCustomTaskTemplate, InventoryItemTemplate, InventoryResource, ItemInstance, PlacedInstance } from '../../../../../../types/resource';
import type { CheckInputFields, ConsumeEntry, ConsumeInputFields } from '../../../../../../types/taskTemplate';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { IconPicker } from '../../../../../shared/IconPicker';
import { PopupShell } from '../../../../../shared/popups/PopupShell';
import { getLibraryItem, getUserInventoryItemTemplates, mergeInventoryItemTemplates } from '../../../../../../utils/inventoryItems';

type AddItemTab = 'library' | 'mine' | 'new';
type LibraryItemState = 'not-added' | 'available' | 'placed';
type StateFilter = 'all' | LibraryItemState;
type CategoryFilter = 'all' | ItemCategory | 'user-created' | 'room-created';

const CATEGORY_ORDER: ItemCategory[] = [
  'kitchen',
  'bedroom',
  'cleaning',
  'garden',
  'vehicle',
  'bathroom',
  'workspace',
];

const INVENTORY_TAB_LABELS: Array<{ id: AddItemTab; label: string }> = [
  { id: 'library', label: 'Library' },
  { id: 'new', label: 'New Item' },
];

const CONTAINER_TAB_LABELS: Array<{ id: AddItemTab; label: string }> = [
  { id: 'library', label: 'Library' },
  { id: 'mine', label: 'My Items' },
  { id: 'new', label: 'New Item' },
];

const STATE_FILTERS: Array<{ id: StateFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'not-added', label: 'Not Added' },
  { id: 'available', label: 'Available' },
  { id: 'placed', label: 'Placed' },
];

type CategorySection = ItemCategory | 'user-created' | 'room-created';

interface PlacementDetail {
  key: string;
  locationName: string;
  segments: Array<{
    key: string;
    icon: string;
    name: string;
  }>;
  quantity: number;
}

interface LibraryRow {
  id: string;
  name: string;
  icon: string;
  kind: ItemKind;
  dimensions?: InventoryItemTemplate['dimensions'];
  categoryKey: CategorySection;
  categoryLabel: string;
  description?: string;
  state: LibraryItemState;
  placements: PlacementDetail[];
}

interface RowDisclosureState {
  itemId: string;
  mode: 'remove' | 'placements';
}

type DraftTaskType = 'CHECK' | 'CONSUME';

type DraftTaskInputFields = CheckInputFields | ConsumeInputFields;

type EditableInventoryCustomTaskTemplate = InventoryCustomTaskTemplate & {
  taskType?: DraftTaskType;
  inputFields?: DraftTaskInputFields;
};

interface DraftNewItemTask {
  id: string;
  name: string;
  taskType: DraftTaskType;
  inputFields: DraftTaskInputFields;
  icon: string;
}

interface AddItemPanelProps {
  resource: InventoryResource;
  containerId?: string;
  mode?: 'inventory' | 'container';
  onClose: () => void;
  onItemAdded?: (itemTemplateRef: string) => void;
  onItemInstanceAdded?: (item: ItemInstance) => void;
}

function normalizeCustomTemplate(template: InventoryItemTemplate): InventoryItemTemplate {
  return {
    ...template,
    isCustom: template.isCustom ?? template.id.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX),
  };
}

function isCustomTemplate(template: InventoryItemTemplate): boolean {
  return template.isCustom === true || template.id.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX);
}

function isRoomCreatedTemplate(template: InventoryItemTemplate): boolean {
  return template.id.startsWith('room-item-');
}

function titleCaseCategory(category: CategorySection): string {
  return category === 'user-created'
    ? 'User Created'
    : category === 'room-created'
      ? 'Room Created'
    : category
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function renderItemMeta(item: { categoryLabel?: string; kind?: string }) {
  return [item.categoryLabel, item.kind].filter(Boolean).join(' · ');
}

export function AddItemPanel({
  resource,
  containerId,
  mode = 'inventory',
  onClose,
  onItemAdded,
  onItemInstanceAdded,
}: AddItemPanelProps) {
  const [activeTab, setActiveTab] = useState<AddItemTab>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [rowDisclosure, setRowDisclosure] = useState<RowDisclosureState | null>(null);
  const [draftIcon, setDraftIcon] = useState('inventory');
  const [draftName, setDraftName] = useState('');
  const [draftKind, setDraftKind] = useState<ItemKind>('consumable');
  const [draftCategory, setDraftCategory] = useState<ItemCategory>('workspace');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftTasks, setDraftTasks] = useState<DraftNewItemTask[]>([]);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [draftTaskName, setDraftTaskName] = useState('');
  const [draftTaskIcon, setDraftTaskIcon] = useState('task');
  const [draftTaskType, setDraftTaskType] = useState<DraftTaskType>('CHECK');
  const [draftConsumeEntries, setDraftConsumeEntries] = useState<ConsumeEntry[]>([]);
  const [openConsumeEntryPickerIndex, setOpenConsumeEntryPickerIndex] = useState<number | null>(null);
  const [taskError, setTaskError] = useState('');
  const [error, setError] = useState('');

  const resources = useResourceStore((state) => state.resources);
  const setResource = useResourceStore((state) => state.setResource);
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);

  const userTemplates = useMemo(
    () => getUserInventoryItemTemplates(user).map(normalizeCustomTemplate),
    [user],
  );
  const userTemplateIds = useMemo(
    () => new Set(userTemplates.map((template) => template.id)),
    [userTemplates],
  );
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const isContainerMode = mode === 'container';
  const tabLabels = isContainerMode ? CONTAINER_TAB_LABELS : INVENTORY_TAB_LABELS;

  const ensureInventoryLinked = (inventoryId: string) => {
    if (!user) return;
    const linkedInventoryIds = user.resources.inventory.filter((id) => resources[id]?.type === 'inventory');
    return linkedInventoryIds.includes(inventoryId)
      ? linkedInventoryIds
      : [...linkedInventoryIds, inventoryId];
  };

  const shouldAutoClose = Boolean(onItemInstanceAdded);

  const placementDetailsByTemplateId = useMemo(() => {
    const details = new Map<string, PlacementDetail[]>();
    const inventoryItemRecords = new Map<string, {
      templateId: string;
      locationName: string;
      quantity: number;
      segments: PlacementDetail['segments'];
    }>();
    const placedInventoryItemIds = new Set<string>();
    const roomContainerItemsByContainerId = new Map<string, Array<{
      itemId: string;
      templateId: string;
      quantity: number;
      locationName: string;
      segments: PlacementDetail['segments'];
    }>>();
    const inventoryResources = Object.values(resources).filter((entry): entry is InventoryResource => entry.type === 'inventory');
    const homeResources = Object.values(resources).filter((entry): entry is HomeResource => entry.type === 'home');

    const appendPlacement = (templateId: string, placement: PlacementDetail) => {
      if (!templateId) return;
      const current = details.get(templateId) ?? [];
      current.push(placement);
      details.set(templateId, current);
    };

    const recordInventoryPlacement = (
      locationName: string,
      itemId: string,
      itemTemplateRef: string,
      quantity: number | undefined,
      segments: PlacementDetail['segments'],
    ) => {
      inventoryItemRecords.set(itemId, {
        templateId: itemTemplateRef,
        locationName,
        quantity: quantity ?? 1,
        segments,
      });
    };

    const recordHomePlacements = (
      placements: PlacedInstance[],
      locationName: string,
      baseSegments: PlacementDetail['segments'],
    ) => {
      for (const placement of placements) {
        if (placement.kind === 'container') {
          const containerItems = roomContainerItemsByContainerId.get(placement.refId) ?? [];
          for (const item of containerItems) {
            appendPlacement(item.templateId, {
              key: `${locationName}:${placement.id}:${item.itemId}`,
              locationName,
              segments: item.segments,
              quantity: item.quantity,
            });
          }
          continue;
        }

        if (placement.kind !== 'item') continue;

        const inventoryRecord = inventoryItemRecords.get(placement.refId);
        if (inventoryRecord) {
          placedInventoryItemIds.add(placement.refId);
          appendPlacement(inventoryRecord.templateId, {
            key: `${locationName}:${placement.id}`,
            locationName,
            segments: baseSegments,
            quantity: placement.quantity ?? inventoryRecord.quantity,
          });
          continue;
        }

        appendPlacement(placement.refId, {
          key: `${locationName}:${placement.id}`,
          locationName,
          segments: baseSegments,
          quantity: placement.quantity ?? 1,
        });
      }
    };

    for (const inventoryResource of inventoryResources) {
      for (const item of inventoryResource.items) {
        recordInventoryPlacement(
          inventoryResource.name,
          item.id,
          item.itemTemplateRef,
          item.quantity,
          [{ key: `${inventoryResource.id}:inventory`, icon: inventoryResource.icon || 'inventory', name: inventoryResource.name }],
        );
      }

      for (const container of inventoryResource.containers ?? []) {
        for (const item of container.items) {
          recordInventoryPlacement(
            inventoryResource.name,
            item.id,
            item.itemTemplateRef,
            item.quantity,
            [
              { key: `${inventoryResource.id}:inventory`, icon: inventoryResource.icon || 'inventory', name: inventoryResource.name },
              { key: `${container.id}:container`, icon: container.icon || 'inventory', name: container.name },
            ],
          );
        }
      }
    }

    for (const home of homeResources) {
      for (const story of home.stories ?? []) {
        recordHomePlacements(
          story.placedItems ?? [],
          home.name,
          [{ key: `${home.id}:home`, icon: home.icon || 'home', name: home.name }],
        );
        for (const room of story.rooms) {
          for (const container of room.dedicatedContainers ?? []) {
            roomContainerItemsByContainerId.set(
              container.id,
              container.items.map((item) => ({
                itemId: item.id,
                templateId: item.itemTemplateRef,
                quantity: item.quantity ?? 1,
                locationName: `${home.name} - ${room.name}`,
                segments: [
                  { key: `${home.id}:home`, icon: home.icon || 'home', name: home.name },
                  { key: `${room.id}:room`, icon: room.icon || 'home-room', name: room.name },
                  { key: `${container.id}:container`, icon: container.icon || 'inventory', name: container.name },
                ],
              })),
            );
          }
          recordHomePlacements(
            room.placedItems ?? [],
            `${home.name} - ${room.name}`,
            [
              { key: `${home.id}:home`, icon: home.icon || 'home', name: home.name },
              { key: `${room.id}:room`, icon: room.icon || 'home-room', name: room.name },
            ],
          );
        }
      }
    }

    for (const [itemId, record] of inventoryItemRecords) {
      if (placedInventoryItemIds.has(itemId)) continue;
      appendPlacement(record.templateId, {
        key: `inventory:${itemId}`,
        locationName: record.locationName,
        segments: record.segments,
        quantity: record.quantity,
      });
    }

    for (const templatePlacements of details.values()) {
      templatePlacements.sort((left, right) => left.locationName.localeCompare(right.locationName));
    }

    return details;
  }, [resources]);

  const roomCreatedTemplates = useMemo(() => {
    const byId = new Map<string, InventoryItemTemplate>();
    const homeResources = Object.values(resources).filter((entry): entry is HomeResource => entry.type === 'home');

    for (const home of homeResources) {
      for (const story of home.stories ?? []) {
        for (const room of story.rooms) {
          for (const template of room.dedicatedItems ?? []) {
            if (!isRoomCreatedTemplate(template)) continue;
            byId.set(template.id, normalizeCustomTemplate(template));
          }
        }
      }
    }

    return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [resources]);

  const builtInRows = useMemo<LibraryRow[]>(() => {
    return itemLibrary.map((item) => {
      const liveTemplate = getLibraryItem(item.id) ?? {
        id: item.id,
        name: item.name,
        icon: item.icon,
        kind: item.kind,
        category: item.category,
        description: item.description,
      };
      const placements = placementDetailsByTemplateId.get(item.id) ?? [];
      return {
        id: item.id,
        name: liveTemplate.name,
        icon: liveTemplate.icon,
        kind: liveTemplate.kind ?? 'consumable',
        dimensions: liveTemplate.dimensions,
        categoryKey: (liveTemplate.category as ItemCategory | undefined) ?? 'workspace',
        categoryLabel: titleCaseCategory((liveTemplate.category as ItemCategory | undefined) ?? 'workspace'),
        description: liveTemplate.description,
        state: placements.length > 0
          ? 'placed'
          : (userTemplateIds.has(item.id) ? 'available' : 'not-added'),
        placements,
      } satisfies LibraryRow;
    });
  }, [placementDetailsByTemplateId, userTemplateIds]);

  const customRows = useMemo<LibraryRow[]>(() => {
    return userTemplates
      .filter((template) => isCustomTemplate(template))
      .map((template) => {
        const liveTemplate = getLibraryItem(template.id) ?? template;
        const placements = placementDetailsByTemplateId.get(template.id) ?? [];
        return {
          id: template.id,
          name: liveTemplate.name,
          icon: liveTemplate.icon || 'inventory',
          kind: liveTemplate.kind ?? 'consumable',
          dimensions: liveTemplate.dimensions,
          categoryKey: 'user-created',
          categoryLabel: 'User Created',
          description: liveTemplate.description,
          state: placements.length > 0 ? 'placed' : 'available',
          placements,
        } satisfies LibraryRow;
      });
  }, [placementDetailsByTemplateId, userTemplates]);

  const roomCreatedRows = useMemo<LibraryRow[]>(() => {
    return roomCreatedTemplates.map((template) => {
      const liveTemplate = getLibraryItem(template.id) ?? template;
      const placements = placementDetailsByTemplateId.get(template.id) ?? [];
      return {
        id: template.id,
        name: liveTemplate.name,
        icon: liveTemplate.icon || 'inventory',
        kind: liveTemplate.kind ?? 'facility',
        dimensions: liveTemplate.dimensions,
        categoryKey: 'room-created',
        categoryLabel: 'Room Created',
        description: liveTemplate.description,
        state: placements.length > 0 ? 'placed' : 'available',
        placements,
      } satisfies LibraryRow;
    });
  }, [placementDetailsByTemplateId, roomCreatedTemplates]);

  const taskItemTemplates = useMemo(
    () => mergeInventoryItemTemplates(
      userTemplates,
      itemLibrary
        .map((item) => getLibraryItem(item.id))
        .filter((item): item is InventoryItemTemplate => item != null),
    )
      .filter((template) => (template.kind ?? 'consumable') === 'consumable')
      .filter((template) => (placementDetailsByTemplateId.get(template.id)?.length ?? 0) > 0),
    [placementDetailsByTemplateId, userTemplates],
  );

  const libraryRows = useMemo<LibraryRow[]>(() => {
    return [...builtInRows, ...customRows, ...roomCreatedRows]
      .filter((item) => item.name.toLowerCase().includes(normalizedSearch))
      .filter((item) => isContainerMode || stateFilter === 'all' || item.state === stateFilter)
      .filter((item) => categoryFilter === 'all' || item.categoryKey === categoryFilter)
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [builtInRows, categoryFilter, customRows, isContainerMode, normalizedSearch, roomCreatedRows, stateFilter]);

  const containerLibraryRows = useMemo(
    () => builtInRows
      .filter((item) => item.name.toLowerCase().includes(normalizedSearch))
      .filter((item) => categoryFilter === 'all' || item.categoryKey === categoryFilter)
      .sort((left, right) => left.name.localeCompare(right.name)),
    [builtInRows, categoryFilter, normalizedSearch],
  );

  const groupedContainerLibraryRows = useMemo(
    () => CATEGORY_ORDER.map((category) => ({
      category,
      label: titleCaseCategory(category),
      items: containerLibraryRows.filter((item) => item.categoryKey === category),
    })).filter((group) => group.items.length > 0),
    [containerLibraryRows],
  );

  const containerPersonalRows = useMemo(
    () => [...customRows, ...roomCreatedRows]
      .filter((item) => item.name.toLowerCase().includes(normalizedSearch))
      .sort((left, right) => left.name.localeCompare(right.name)),
    [customRows, normalizedSearch, roomCreatedRows],
  );

  const groupedLibraryRows = useMemo(
    () => {
      const sectionOrder: CategorySection[] = categoryFilter === 'all'
        ? [...CATEGORY_ORDER, 'user-created', 'room-created']
        : [categoryFilter];

      return sectionOrder
        .map((category) => ({
          category,
          label: titleCaseCategory(category),
          items: libraryRows.filter((item) => item.categoryKey === category),
        }))
        .filter((group) => group.items.length > 0);
    },
    [categoryFilter, libraryRows],
  );

  const updateUserTemplates = (nextTemplates: InventoryItemTemplate[]) => {
    if (!user) return;

    setUser({
      ...user,
      lists: {
        ...user.lists,
        inventoryItemTemplates: nextTemplates,
      },
      resources: {
        ...user.resources,
        inventory: ensureInventoryLinked(resource.id) ?? user.resources.inventory,
      },
    });
  };

  const handleAddTemplate = (template: InventoryItemTemplate) => {
    const normalizedTemplate = normalizeCustomTemplate(template);
    updateUserTemplates(mergeInventoryItemTemplates(userTemplates, [normalizedTemplate]));
    setRowDisclosure(null);
    if (shouldAutoClose) onClose();
  };

  const handleRemoveTemplate = (itemId: string) => {
    if ((placementDetailsByTemplateId.get(itemId)?.length ?? 0) > 0) return;

    if (itemId.startsWith('room-item-')) {
      for (const home of Object.values(resources)) {
        if (home.type !== 'home') continue;

        let changed = false;
        const nextStories = (home.stories ?? []).map((story) => {
          const nextRooms = story.rooms.map((room) => {
            const nextDedicatedItems = (room.dedicatedItems ?? []).filter((item) => item.id !== itemId);
            if (nextDedicatedItems.length === (room.dedicatedItems ?? []).length) {
              return room;
            }

            changed = true;
            return {
              ...room,
              dedicatedItems: nextDedicatedItems,
            };
          });

          return changed
            ? {
                ...story,
                rooms: nextRooms,
              }
            : story;
        });

        if (changed) {
          setResource({
            ...home,
            updatedAt: new Date().toISOString(),
            stories: nextStories,
          });
        }
      }

      setRowDisclosure(null);
      if (shouldAutoClose) onClose();
      return;
    }

    updateUserTemplates(userTemplates.filter((template) => template.id !== itemId));
    setRowDisclosure(null);
    if (shouldAutoClose) onClose();
  };

  const handleCreateItem = () => {
    if (!draftName.trim()) {
      setError('Name is required.');
      return;
    }

    const nextCustomTaskTemplates: EditableInventoryCustomTaskTemplate[] = draftKind === 'facility'
      ? draftTasks.map((task) => ({
          id: crypto.randomUUID(),
          name: task.name,
          icon: task.icon,
          taskType: task.taskType,
          inputFields: task.taskType === 'CONSUME'
            ? {
                label: task.name,
                entries: (task.inputFields as ConsumeInputFields).entries,
              }
            : {
                label: task.name,
              },
        }))
      : [];

    const nextTemplate: InventoryItemTemplate = {
      id: makeCustomItemTemplateRef(draftName.trim(), draftKind, draftIcon || 'inventory'),
      name: draftName.trim(),
      icon: draftIcon || 'inventory',
      kind: draftKind,
      category: draftCategory,
      description: draftDescription.trim() || 'Custom inventory item',
      isCustom: true,
      customTaskTemplates: nextCustomTaskTemplates as InventoryCustomTaskTemplate[],
    };

    handleAddTemplate(nextTemplate);
    setActiveTab('library');
    setSearchQuery('');
    setDraftName('');
    setDraftDescription('');
    setDraftIcon('inventory');
    setDraftKind('consumable');
    setDraftCategory('workspace');
    setDraftTasks([]);
    setIsAddingTask(false);
    setDraftTaskName('');
    setDraftTaskType('CHECK');
    setDraftConsumeEntries([]);
    setTaskError('');
    setError('');
  };

  const resetTaskComposer = () => {
    setIsAddingTask(false);
    setDraftTaskName('');
    setDraftTaskIcon('task');
    setDraftTaskType('CHECK');
    setDraftConsumeEntries([]);
    setOpenConsumeEntryPickerIndex(null);
    setTaskError('');
  };

  const addDraftConsumeEntry = () => {
    setDraftConsumeEntries((current) => ([
      ...current,
      {
        itemTemplateRef: '',
        quantity: 1,
      },
    ]));
    setOpenConsumeEntryPickerIndex((current) => current ?? draftConsumeEntries.length);
  };

  const updateDraftConsumeEntry = (index: number, patch: Partial<ConsumeEntry>) => {
    setDraftConsumeEntries((current) => current.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, ...patch } : entry
    )));
  };

  const removeDraftConsumeEntry = (index: number) => {
    setDraftConsumeEntries((current) => current.filter((_, entryIndex) => entryIndex !== index));
    setOpenConsumeEntryPickerIndex((current) => {
      if (current == null) return null;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
  };

  const resolveTaskItemTemplate = (itemTemplateRef: string) => taskItemTemplates.find((template) => template.id === itemTemplateRef) ?? null;

  const handleSaveDraftTask = () => {
    const trimmedName = draftTaskName.trim();
    if (!trimmedName) {
      setTaskError('Task name is required.');
      return;
    }

    const entries = draftTaskType === 'CONSUME'
      ? draftConsumeEntries
          .filter((entry) => entry.itemTemplateRef.trim().length > 0)
          .map((entry) => ({
            itemTemplateRef: entry.itemTemplateRef,
            quantity: Math.max(1, Math.floor(entry.quantity || 1)),
          }))
      : [];

    setDraftTasks((current) => ([
      ...current,
      {
        id: crypto.randomUUID(),
        name: trimmedName,
        taskType: draftTaskType,
        inputFields: draftTaskType === 'CONSUME'
          ? { label: trimmedName, entries }
          : { label: trimmedName },
        icon: draftTaskIcon || 'task',
      },
    ]));

    resetTaskComposer();
  };

  const handleRemoveDraftTask = (taskId: string) => {
    setDraftTasks((current) => current.filter((task) => task.id !== taskId));
  };

  const handleAddItemInstance = (item: LibraryRow) => {
    const nextItem: ItemInstance = {
      id: uuidv4(),
      itemTemplateRef: item.id,
      quantity: 1,
      dimensions: item.dimensions,
    };

    if (onItemInstanceAdded) {
      onItemInstanceAdded(nextItem);
    } else if (containerId) {
      setResource({
        ...resource,
        updatedAt: new Date().toISOString(),
        containers: (resource.containers ?? []).map((container) => (
          container.id === containerId
            ? {
                ...container,
                items: [...container.items, nextItem],
              }
            : container
        )),
      });
    }

    onItemAdded?.(item.id);
    if (!onItemAdded && !onItemInstanceAdded) {
      onClose();
    }
  };

  const renderStateControl = (item: LibraryRow) => {
    if (item.state === 'not-added') {
      return (
        <button
          type="button"
          onClick={() => handleAddTemplate({
            id: item.id,
            name: item.name,
            icon: item.icon,
            kind: item.kind,
            category: item.categoryKey === 'user-created' ? 'workspace' : item.categoryKey,
            description: item.description,
            isCustom: false,
          })}
          className="rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200"
        >
          Add
        </button>
      );
    }

    if (item.state === 'available') {
      return (
        <button
          type="button"
          onClick={() => setRowDisclosure((current) => (
            current?.itemId === item.id && current.mode === 'remove'
              ? null
              : { itemId: item.id, mode: 'remove' }
          ))}
          className="rounded-full bg-emerald-100 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300"
        >
          Available
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => setRowDisclosure((current) => (
          current?.itemId === item.id && current.mode === 'placements'
            ? null
            : { itemId: item.id, mode: 'placements' }
        ))}
        className="rounded-full bg-amber-100 px-3 py-1.5 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300"
      >
        Placed
      </button>
    );
  };

  const renderItemRow = (item: LibraryRow) => {
    const showRemoveConfirmation = rowDisclosure?.itemId === item.id && rowDisclosure.mode === 'remove';
    const showPlacements = rowDisclosure?.itemId === item.id && rowDisclosure.mode === 'placements';

    if (isContainerMode) {
      return (
        <button
          key={item.id}
          type="button"
          onClick={() => handleAddItemInstance(item)}
          className="flex w-full items-center justify-between rounded-xl border border-gray-200 px-3 py-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/40"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800">
              <IconDisplay iconKey={item.icon || 'inventory'} size={22} className="h-5.5 w-5.5 object-contain" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{item.name}</div>
              {renderItemMeta(item) ? (
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{renderItemMeta(item)}</div>
              ) : null}
            </div>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
            Add
          </span>
        </button>
      );
    }

    return (
      <article
        key={item.id}
        className="rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-800/40"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800">
              <IconDisplay iconKey={item.icon || 'inventory'} size={22} className="h-5.5 w-5.5 object-contain" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{item.name}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium capitalize dark:bg-gray-700 dark:text-gray-200">
                  {item.kind}
                </span>
                <span>{item.categoryLabel}</span>
              </div>
            </div>
          </div>
          {renderStateControl(item)}
        </div>

        {showRemoveConfirmation ? (
          <div className="mt-3 rounded-lg bg-gray-50 px-3 py-3 text-xs text-gray-600 dark:bg-gray-900/50 dark:text-gray-300">
            <p className="font-medium text-gray-700 dark:text-gray-200">Remove from your items?</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => handleRemoveTemplate(item.id)}
                className="rounded-full bg-red-50 px-3 py-1.5 font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setRowDisclosure(null)}
                className="rounded-full bg-gray-200 px-3 py-1.5 font-semibold text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {showPlacements ? (
          <div className="mt-3 rounded-lg bg-gray-50 px-3 py-3 text-xs text-gray-600 dark:bg-gray-900/50 dark:text-gray-300">
            <div className="space-y-2">
              {item.placements.map((placement) => (
                <div key={placement.key} className="flex items-center justify-between gap-3 rounded-lg bg-white px-2.5 py-2 dark:bg-gray-800">
                  <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                    {placement.segments.map((segment, index) => (
                      <span key={segment.key} className="inline-flex min-w-0 items-center gap-1.5">
                        {index > 0 ? <span className="text-gray-400 dark:text-gray-500">/</span> : null}
                        <IconDisplay iconKey={segment.icon || 'inventory'} size={12} className="h-3 w-3 shrink-0 object-contain" />
                        <span className="truncate">{segment.name}</span>
                      </span>
                    ))}
                  </span>
                  <span className="shrink-0 text-gray-500 dark:text-gray-400">Qty {placement.quantity}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </article>
    );
  };

  return (
    <PopupShell title="Add Item" onClose={onClose} size="large">
      <div className="flex flex-col gap-4">
        <div className="flex gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
          {tabLabels.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setError('');
                setRowDisclosure(null);
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {(activeTab === 'library' || (isContainerMode && activeTab === 'mine')) ? (
          <>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={activeTab === 'library' ? 'Search library items' : 'Search my items'}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />

            {activeTab === 'library' ? (
              <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-900/40">
                {!isContainerMode ? (
                  <div className="flex flex-wrap gap-2">
                    {STATE_FILTERS.map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() => setStateFilter(filter.id)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                          stateFilter === filter.id
                            ? 'bg-purple-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                <label className="flex flex-col gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  <span>Category</span>
                  <select
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  >
                    <option value="all">All Categories</option>
                    {CATEGORY_ORDER.map((category) => (
                      <option key={category} value={category}>{titleCaseCategory(category)}</option>
                    ))}
                    {!isContainerMode ? <option value="user-created">User Created</option> : null}
                    {!isContainerMode ? <option value="room-created">Room Created</option> : null}
                  </select>
                </label>
              </div>
            ) : null}
          </>
        ) : null}

        {activeTab === 'library' ? (
          isContainerMode ? (
            groupedContainerLibraryRows.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No matching library items.</p>
            ) : (
              <div className="space-y-4">
                {groupedContainerLibraryRows.map((group) => (
                  <section key={group.category} className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                      {group.label}
                    </div>
                    <div className="space-y-2">
                      {group.items.map((item) => renderItemRow(item))}
                    </div>
                  </section>
                ))}
              </div>
            )
          ) : (
            groupedLibraryRows.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No matching items.</p>
            ) : (
              <div className="space-y-4">
                {groupedLibraryRows.map((group) => (
                  <section key={group.category} className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                      {group.label}
                    </div>
                    <div className="space-y-2">
                      {group.items.map((item) => renderItemRow(item))}
                    </div>
                  </section>
                ))}
              </div>
            )
          )
        ) : null}

        {isContainerMode && activeTab === 'mine' ? (
          containerPersonalRows.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No custom item templates found.</p>
          ) : (
            <div className="space-y-2">
              {containerPersonalRows.map((item) => renderItemRow(item))}
            </div>
          )
        ) : null}

        {activeTab === 'new' ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-[auto_1fr] items-end gap-3">
              <IconPicker value={draftIcon} onChange={setDraftIcon} align="left" />
              <label className="space-y-1">
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Name</span>
                <input
                  type="text"
                  value={draftName}
                  onChange={(event) => {
                    setDraftName(event.target.value);
                    setError('');
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Kind</span>
                <select
                  value={draftKind}
                  onChange={(event) => setDraftKind(event.target.value as ItemKind)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value="consumable">Consumable</option>
                  <option value="facility">Facility</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Category</span>
                <select
                  value={draftCategory}
                  onChange={(event) => setDraftCategory(event.target.value as ItemCategory)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  {CATEGORY_ORDER.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="space-y-1">
              <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Description</span>
              <textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                rows={4}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </label>

            {draftKind === 'facility' ? (
              <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-4 dark:border-gray-700 dark:bg-gray-900/40">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">Tasks</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Add facility tasks to seed this item template.</div>
                  </div>
                </div>

                {draftTasks.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                    No tasks added yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {draftTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <IconDisplay
                            iconKey={task.icon || 'task'}
                            size={16}
                            className="h-4 w-4 shrink-0 object-contain"
                          />
                          <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{task.name}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            task.taskType === 'CONSUME'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          }`}>
                            {task.taskType}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveDraftTask(task.id)}
                            className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {isAddingTask ? (
                  <div className="space-y-3 rounded-lg border border-gray-200 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-800">
                    <div className="grid grid-cols-[auto_1fr] items-end gap-3">
                      <div>
                        <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Task icon</span>
                        <IconPicker value={draftTaskIcon} onChange={setDraftTaskIcon} align="left" />
                      </div>

                      <label className="space-y-1">
                        <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Task name</span>
                        <input
                          type="text"
                          value={draftTaskName}
                          onChange={(event) => {
                            setDraftTaskName(event.target.value);
                            setTaskError('');
                          }}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        />
                      </label>
                    </div>

                    <label className="space-y-1">
                      <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Task type</span>
                      <select
                        value={draftTaskType}
                        onChange={(event) => {
                          const nextType = event.target.value as DraftTaskType;
                          setDraftTaskType(nextType);
                          setTaskError('');
                          if (nextType !== 'CONSUME') {
                            setDraftConsumeEntries([]);
                          }
                        }}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      >
                        <option value="CHECK">CHECK</option>
                        <option value="CONSUME">CONSUME</option>
                      </select>
                    </label>

                    {draftTaskType === 'CONSUME' ? (
                      <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-900/40">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Consume entries</div>
                          <button
                            type="button"
                            onClick={addDraftConsumeEntry}
                            className="text-xs font-medium text-blue-500 transition-colors hover:text-blue-600"
                          >
                            + Add entry
                          </button>
                        </div>

                        {draftConsumeEntries.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                            No consume entries yet.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {draftConsumeEntries.map((entry, index) => (
                              <div
                                key={`draft-consume-entry-${index}`}
                                className="space-y-3 rounded-lg border border-gray-200 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-800"
                              >
                                <div className="space-y-1">
                                  <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Item</span>
                                  <div className="relative">
                                    <button
                                      type="button"
                                      onClick={() => setOpenConsumeEntryPickerIndex((current) => current === index ? null : index)}
                                      className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                    >
                                      {resolveTaskItemTemplate(entry.itemTemplateRef) ? (
                                        <span className="flex min-w-0 items-center gap-2">
                                          <IconDisplay
                                            iconKey={resolveTaskItemTemplate(entry.itemTemplateRef)?.icon || 'inventory'}
                                            size={16}
                                            className="h-4 w-4 shrink-0 object-contain"
                                          />
                                          <span className="truncate">{resolveTaskItemTemplate(entry.itemTemplateRef)?.name}</span>
                                        </span>
                                      ) : (
                                        <span className="truncate text-gray-500 dark:text-gray-400">Select item</span>
                                      )}
                                      <span className="shrink-0 text-xs text-gray-400">▼</span>
                                    </button>

                                    {openConsumeEntryPickerIndex === index ? (
                                      <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
                                        {taskItemTemplates.length === 0 ? (
                                          <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
                                            No placed consumable items available.
                                          </div>
                                        ) : (
                                          <div className="max-h-56 overflow-y-auto py-1">
                                            {taskItemTemplates.map((template) => {
                                              const placementCount = placementDetailsByTemplateId.get(template.id)?.length ?? 0;
                                              return (
                                                <button
                                                  key={template.id}
                                                  type="button"
                                                  onClick={() => {
                                                    updateDraftConsumeEntry(index, { itemTemplateRef: template.id });
                                                    setOpenConsumeEntryPickerIndex(null);
                                                  }}
                                                  className="flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                                                >
                                                  <IconDisplay
                                                    iconKey={template.icon || 'inventory'}
                                                    size={18}
                                                    className="h-4.5 w-4.5 shrink-0 object-contain"
                                                  />
                                                  <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-100">{template.name}</span>
                                                    <span className="block text-xs text-gray-500 dark:text-gray-400">Placed in {placementCount} location{placementCount === 1 ? '' : 's'}</span>
                                                  </span>
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-[minmax(0,8rem)_auto] sm:items-end">
                                  <label className="space-y-1 block">
                                    <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Quantity</span>
                                    <input
                                      type="number"
                                      min={1}
                                      value={entry.quantity}
                                      onChange={(event) => updateDraftConsumeEntry(index, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                                      className="w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                    />
                                  </label>
                                </div>

                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => removeDraftConsumeEntry(index)}
                                    className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {taskError ? <p className="text-sm text-red-500">{taskError}</p> : null}

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={resetTaskComposer}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveDraftTask}
                        className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingTask(true);
                        setTaskError('');
                      }}
                      className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200"
                    >
                      Add Task
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            {error ? <p className="text-sm text-red-500">{error}</p> : null}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCreateItem}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
              >
                Add
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </PopupShell>
  );
}
