import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { itemLibrary, type ItemCategory, type ItemTemplate } from '../../../../../../coach/ItemLibrary';
import { useUserStore } from '../../../../../../stores/useUserStore';
import type { FloorPlanRoom, InventoryItemTemplate } from '../../../../../../types/resource';
import { getUserInventoryItemTemplates } from '../../../../../../utils/inventoryItems';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { IconPicker } from '../../../../../shared/IconPicker';
import { PopupShell } from '../../../../../shared/popups/PopupShell';

type RoomAddItemTab = 'library' | 'mine' | 'room';

interface RoomAddItemPanelProps {
  room: FloorPlanRoom;
  onClose: () => void;
  onAddTemplateItem: (itemTemplateRef: string) => void;
  onCreateRoomItem: (itemTemplate: InventoryItemTemplate) => void;
  placedTemplateCounts?: Partial<Record<string, number>>;
}

const CATEGORY_ORDER: ItemCategory[] = [
  'kitchen',
  'bedroom',
  'cleaning',
  'garden',
  'vehicle',
  'bathroom',
  'workspace',
];

const TAB_LABELS: Array<{ id: RoomAddItemTab; label: string }> = [
  { id: 'library', label: 'Library' },
  { id: 'mine', label: 'My Items' },
  { id: 'room', label: 'Room Item' },
];

function renderItemMeta(item: { category?: string; kind?: string }) {
  return [item.category, item.kind].filter(Boolean).join(' · ');
}

export function RoomAddItemPanel({ room, onClose, onAddTemplateItem, onCreateRoomItem, placedTemplateCounts }: RoomAddItemPanelProps) {
  const user = useUserStore((state) => state.user);
  const [activeTab, setActiveTab] = useState<RoomAddItemTab>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [draftIcon, setDraftIcon] = useState('inventory');
  const [draftName, setDraftName] = useState('');
  const [draftWidth, setDraftWidth] = useState<number | ''>('');
  const [draftDepth, setDraftDepth] = useState<number | ''>('');
  const [draftHeight, setDraftHeight] = useState<number | ''>('');
  const [error, setError] = useState('');

  const userTemplates = useMemo(
    () => getUserInventoryItemTemplates(user).filter((item) => item.isCustom === true),
    [user],
  );
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const libraryItems = useMemo(
    () => itemLibrary.filter((item) => item.name.toLowerCase().includes(normalizedSearch)),
    [normalizedSearch],
  );
  const groupedLibraryItems = useMemo(
    () => CATEGORY_ORDER.map((category) => ({
      category,
      items: libraryItems.filter((item) => item.category === category),
    })).filter((group) => group.items.length > 0),
    [libraryItems],
  );
  const customItems = useMemo(
    () => userTemplates.filter((item) => item.name.toLowerCase().includes(normalizedSearch)),
    [normalizedSearch, userTemplates],
  );

  function handleCreateRoomItem() {
    if (!draftName.trim()) {
      setError('Name is required.');
      return;
    }

    const hasAnyDimensions = [draftWidth, draftDepth, draftHeight].some((value) => value !== '');
    const hasFullDimensions = draftWidth !== '' && draftDepth !== '' && draftHeight !== ''
      && draftWidth > 0 && draftDepth > 0 && draftHeight > 0;

    if (hasAnyDimensions && !hasFullDimensions) {
      setError('Width, depth, and height must all be set together.');
      return;
    }

    onCreateRoomItem({
      id: `room-item-${uuidv4()}`,
      name: draftName.trim(),
      icon: draftIcon || 'inventory',
      kind: 'facility',
      category: 'workspace',
      description: `Room item for ${room.name}`,
      isCustom: true,
      dimensions: hasFullDimensions
        ? { width: draftWidth, depth: draftDepth, height: draftHeight }
        : undefined,
      customTaskTemplates: [],
    });
  }

  const renderItemRow = (
    item: { id: string; name: string; icon: string; category?: string; kind?: string },
    onClick: () => void,
  ) => {
    const placedCount = placedTemplateCounts?.[item.id] ?? 0;

    return (
      <button
        key={item.id}
        type="button"
        onClick={onClick}
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
            {placedCount > 0 ? (
              <div className="mt-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-300">
                Placed {placedCount} time{placedCount === 1 ? '' : 's'} already
              </div>
            ) : null}
          </div>
        </div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
          {placedCount > 0 ? 'Add again' : 'Add'}
        </span>
      </button>
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

        {(activeTab === 'library' || activeTab === 'mine') ? (
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={activeTab === 'library' ? 'Search library items' : 'Search my items'}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        ) : null}

        {activeTab === 'library' ? (
          groupedLibraryItems.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No matching library items.</p>
          ) : (
            <div className="space-y-4">
              {groupedLibraryItems.map((group) => (
                <section key={group.category} className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                    {group.category}
                  </div>
                  <div className="space-y-2">
                    {group.items.map((item: ItemTemplate) => renderItemRow(item, () => onAddTemplateItem(item.id)))}
                  </div>
                </section>
              ))}
            </div>
          )
        ) : null}

        {activeTab === 'mine' ? (
          customItems.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No custom item templates found.</p>
          ) : (
            <div className="space-y-2">
              {customItems.map((item) => renderItemRow(item, () => onAddTemplateItem(item.id)))}
            </div>
          )
        ) : null}

        {activeTab === 'room' ? (
          <div className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
            <div className="flex flex-wrap items-end gap-3">
              <div className="shrink-0">
                <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">Icon</div>
                <IconPicker value={draftIcon} onChange={setDraftIcon} align="left" />
              </div>
              <label className="min-w-[16rem] flex-1 space-y-1">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Name</span>
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  placeholder="e.g. Reading lamp"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Width</span>
                <input type="number" min={1} value={draftWidth} onChange={(event) => setDraftWidth(event.target.value === '' ? '' : Math.max(1, Number(event.target.value) || 1))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Depth</span>
                <input type="number" min={1} value={draftDepth} onChange={(event) => setDraftDepth(event.target.value === '' ? '' : Math.max(1, Number(event.target.value) || 1))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Height</span>
                <input type="number" min={1} value={draftHeight} onChange={(event) => setDraftHeight(event.target.value === '' ? '' : Math.max(1, Number(event.target.value) || 1))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
              </label>
            </div>

            {error ? <div className="text-sm text-red-600 dark:text-red-300">{error}</div> : null}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">Cancel</button>
              <button type="button" onClick={handleCreateRoomItem} className="rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700">Create room item</button>
            </div>
          </div>
        ) : null}
      </div>
    </PopupShell>
  );
}