import { useMemo, useState } from 'react';
import {
  CUSTOM_ITEM_TEMPLATE_PREFIX,
  itemLibrary,
  makeCustomItemTemplateRef,
  type ItemCategory,
  type ItemKind,
} from '../../../../../../coach/ItemLibrary';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import type { HomeResource, InventoryItemTemplate, InventoryResource, ItemInstance, PlacedInstance } from '../../../../../../types/resource';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { IconPicker } from '../../../../../shared/IconPicker';
import { PopupShell } from '../../../../../shared/popups/PopupShell';
import { getLibraryItem, getUserInventoryItemTemplates, mergeInventoryItemTemplates } from '../../../../../../utils/inventoryItems';

type AddItemTab = 'library' | 'new';
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

const TAB_LABELS: Array<{ id: AddItemTab; label: string }> = [
  { id: 'library', label: 'Library' },
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

interface AddItemPanelProps {
  resource: InventoryResource;
  containerId?: string;
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

export function AddItemPanel({ resource, onClose, onItemInstanceAdded }: AddItemPanelProps) {
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

  const libraryRows = useMemo<LibraryRow[]>(() => {
    const builtInRows = itemLibrary.map((item) => {
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
        categoryKey: (liveTemplate.category as ItemCategory | undefined) ?? 'workspace',
        categoryLabel: titleCaseCategory((liveTemplate.category as ItemCategory | undefined) ?? 'workspace'),
        description: liveTemplate.description,
        state: placements.length > 0
          ? 'placed'
          : (userTemplateIds.has(item.id) ? 'available' : 'not-added'),
        placements,
      } satisfies LibraryRow;
    });

    const customRows = userTemplates
      .filter((template) => isCustomTemplate(template))
      .map((template) => {
        const liveTemplate = getLibraryItem(template.id) ?? template;
        const placements = placementDetailsByTemplateId.get(template.id) ?? [];
        return {
          id: template.id,
          name: liveTemplate.name,
          icon: liveTemplate.icon || 'inventory',
          kind: liveTemplate.kind ?? 'consumable',
          categoryKey: 'user-created',
          categoryLabel: 'User Created',
          description: liveTemplate.description,
          state: placements.length > 0 ? 'placed' : 'available',
          placements,
        } satisfies LibraryRow;
      });

    const roomCreatedRows = roomCreatedTemplates.map((template) => {
      const liveTemplate = getLibraryItem(template.id) ?? template;
      const placements = placementDetailsByTemplateId.get(template.id) ?? [];
      return {
        id: template.id,
        name: liveTemplate.name,
        icon: liveTemplate.icon || 'inventory',
        kind: liveTemplate.kind ?? 'facility',
        categoryKey: 'room-created',
        categoryLabel: 'Room Created',
        description: liveTemplate.description,
        state: placements.length > 0 ? 'placed' : 'available',
        placements,
      } satisfies LibraryRow;
    });

    return [...builtInRows, ...customRows, ...roomCreatedRows]
      .filter((item) => item.name.toLowerCase().includes(normalizedSearch))
      .filter((item) => stateFilter === 'all' || item.state === stateFilter)
      .filter((item) => categoryFilter === 'all' || item.categoryKey === categoryFilter)
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [categoryFilter, normalizedSearch, placementDetailsByTemplateId, roomCreatedTemplates, stateFilter, userTemplateIds, userTemplates]);

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

    const nextTemplate: InventoryItemTemplate = {
      id: makeCustomItemTemplateRef(draftName.trim(), draftKind, draftIcon || 'inventory'),
      name: draftName.trim(),
      icon: draftIcon || 'inventory',
      kind: draftKind,
      category: draftCategory,
      description: draftDescription.trim() || 'Custom inventory item',
      isCustom: true,
      customTaskTemplates: [],
    };

    handleAddTemplate(nextTemplate);
    setActiveTab('library');
    setSearchQuery('');
    setDraftName('');
    setDraftDescription('');
    setDraftIcon('inventory');
    setDraftKind('consumable');
    setDraftCategory('workspace');
    setError('');
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
          {TAB_LABELS.map((tab) => (
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

        {activeTab === 'library' ? (
          <>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search library items"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />

            <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-900/40">
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
                  <option value="user-created">User Created</option>
                  <option value="room-created">Room Created</option>
                </select>
              </label>
            </div>
          </>
        ) : null}

        {activeTab === 'library' ? (
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
