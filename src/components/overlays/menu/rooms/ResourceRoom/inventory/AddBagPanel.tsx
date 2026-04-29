import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import {
  makeDefaultRecurrenceRule,
  normalizeRecurrenceMode,
  type InventoryContainer,
  type InventoryResource,
  type ItemInstance,
  type RecurrenceDayOfWeek,
  type ResourceRecurrenceRule,
} from '../../../../../../types/resource';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { IconPicker } from '../../../../../shared/IconPicker';
import { TextInput } from '../../../../../shared/inputs/TextInput';
import { PopupShell } from '../../../../../shared/popups/PopupShell';
import { AddItemPanel } from './AddItemPanel';
import { BagLayoutCanvas } from './BagLayoutCanvas';
import { getUserInventoryItemTemplates, mergeInventoryItemTemplates, resolveInventoryItemTemplate } from '../../../../../../utils/inventoryItems';

interface AddBagPanelProps {
  resource: InventoryResource;
  bag?: InventoryContainer | null;
  onClose: () => void;
  onBagAdded?: (bagId: string) => void;
}

type BagAxis = NonNullable<InventoryContainer['layoutGrid']>['xAxis'];

type FaceGridDraft = {
  columns: number;
  rows: number;
};

const DOW_LABELS: Array<{ key: RecurrenceDayOfWeek; label: string }> = [
  { key: 'sun', label: 'Su' },
  { key: 'mon', label: 'Mo' },
  { key: 'tue', label: 'Tu' },
  { key: 'wed', label: 'We' },
  { key: 'thu', label: 'Th' },
  { key: 'fri', label: 'Fr' },
  { key: 'sat', label: 'Sa' },
];

const AXIS_OPTIONS: Array<{ value: BagAxis; label: string }> = [
  { value: 'width-depth', label: 'Width x Depth' },
  { value: 'width-height', label: 'Width x Height' },
  { value: 'depth-height', label: 'Depth x Height' },
];

const INPUT_CLS = 'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';

function getDayOfMonth(isoDate: string): number {
  const parsed = Number(isoDate.split('-')[2] ?? 1);
  return Math.min(31, Math.max(1, parsed || 1));
}

function clampGridCount(value: number): number {
  return Math.min(10, Math.max(1, value));
}

function resolveFaceGrid(layoutGrid: InventoryContainer['layoutGrid'] | undefined, axis: BagAxis): FaceGridDraft {
  const fallback = {
    columns: clampGridCount(layoutGrid?.columns ?? 1),
    rows: clampGridCount(layoutGrid?.rows ?? 1),
  };

  switch (axis) {
    case 'width-height':
      return layoutGrid?.widthHeight ?? fallback;
    case 'depth-height':
      return layoutGrid?.depthHeight ?? fallback;
    case 'width-depth':
    default:
      return layoutGrid?.widthDepth ?? fallback;
  }
}

function axisLabel(axis: BagAxis): string {
  return AXIS_OPTIONS.find((option) => option.value === axis)?.label ?? axis;
}

export function AddBagPanel({ resource, bag, onClose, onBagAdded }: AddBagPanelProps) {
  const setResource = useResourceStore((state) => state.setResource);
  const user = useUserStore((state) => state.user);

  const [icon, setIcon] = useState(bag?.icon || 'inventory');
  const [name, setName] = useState(bag?.name || '');
  const [items, setItems] = useState<ItemInstance[]>(bag?.items ?? []);
  const [width, setWidth] = useState<number | ''>(bag?.dimensions?.width ?? '');
  const [depth, setDepth] = useState<number | ''>(bag?.dimensions?.depth ?? '');
  const [height, setHeight] = useState<number | ''>(bag?.dimensions?.height ?? '');
  const [activeCanvasAxis, setActiveCanvasAxis] = useState<BagAxis>(bag?.layoutGrid?.xAxis ?? 'width-depth');
  const [widthDepthGrid, setWidthDepthGrid] = useState<FaceGridDraft>(() => resolveFaceGrid(bag?.layoutGrid, 'width-depth'));
  const [widthHeightGrid, setWidthHeightGrid] = useState<FaceGridDraft>(() => resolveFaceGrid(bag?.layoutGrid, 'width-height'));
  const [depthHeightGrid, setDepthHeightGrid] = useState<FaceGridDraft>(() => resolveFaceGrid(bag?.layoutGrid, 'depth-height'));
  const [recurrenceMode, setRecurrenceMode] = useState<'recurring' | 'never'>(normalizeRecurrenceMode(bag?.carryTask?.recurrenceMode));
  const [recurrence, setRecurrence] = useState<ResourceRecurrenceRule>(bag?.carryTask?.recurrence ?? makeDefaultRecurrenceRule());
  const [reminderLeadDays, setReminderLeadDays] = useState<number | ''>(
    normalizeRecurrenceMode(bag?.carryTask?.recurrenceMode) === 'recurring'
      ? (bag?.carryTask?.reminderLeadDays ?? 0)
      : '',
  );
  const [error, setError] = useState('');
  const [showAddItemPanel, setShowAddItemPanel] = useState(false);
  const [isLayoutEditorOpen, setIsLayoutEditorOpen] = useState(false);
  const [selectedCanvasItemId, setSelectedCanvasItemId] = useState<string | null>(null);

  const itemTemplates = useMemo(
    () => mergeInventoryItemTemplates(getUserInventoryItemTemplates(user), resource.itemTemplates),
    [resource.itemTemplates, user],
  );
  const unplacedItems = useMemo(
    () => items.filter((item) => !item.placedInBag),
    [items],
  );
  const placedItemsOnActiveFace = useMemo(
    () => items.filter((item) => item.placedInBag?.axis === activeCanvasAxis),
    [activeCanvasAxis, items],
  );
  const selectedCanvasItem = useMemo(
    () => items.find((item) => item.id === selectedCanvasItemId) ?? null,
    [items, selectedCanvasItemId],
  );

  const hasFullDimensions = width !== '' && depth !== '' && height !== '' && width > 0 && depth > 0 && height > 0;
  const isLayoutReady = hasFullDimensions;

  const draftBag = useMemo<InventoryContainer>(() => ({
    ...(bag ?? {}),
    id: bag?.id ?? 'bag-draft',
    name: name.trim() || bag?.name || 'Bag',
    icon: icon || 'inventory',
    kind: 'bag',
    items,
    dimensions: hasFullDimensions
      ? {
          width,
          depth,
          height,
        }
      : undefined,
    layoutGrid: hasFullDimensions
      ? {
          xAxis: activeCanvasAxis,
          widthDepth: widthDepthGrid,
          widthHeight: widthHeightGrid,
          depthHeight: depthHeightGrid,
        }
      : undefined,
  }), [activeCanvasAxis, bag, depth, depthHeightGrid, hasFullDimensions, height, icon, items, name, width, widthDepthGrid, widthHeightGrid]);

  function updateRecurrence(patch: Partial<ResourceRecurrenceRule>) {
    setRecurrence((current) => ({ ...current, ...patch }));
  }

  function toggleDay(day: RecurrenceDayOfWeek) {
    setRecurrence((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((entry) => entry !== day)
        : [...current.days, day],
    }));
  }

  function updateFaceGrid(axis: BagAxis, patch: Partial<FaceGridDraft>) {
    const apply = (current: FaceGridDraft): FaceGridDraft => ({
      columns: clampGridCount(patch.columns ?? current.columns),
      rows: clampGridCount(patch.rows ?? current.rows),
    });

    if (axis === 'width-depth') {
      setWidthDepthGrid((current) => apply(current));
      return;
    }
    if (axis === 'width-height') {
      setWidthHeightGrid((current) => apply(current));
      return;
    }
    setDepthHeightGrid((current) => apply(current));
  }

  function updateItemQuantity(itemId: string, quantity: number) {
    setItems((current) => current.map((item) => (
      item.id === itemId
        ? {
            ...item,
            quantity: Math.max(0, quantity),
          }
        : item
    )));
  }

  function removeItem(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId));
    setSelectedCanvasItemId((current) => (current === itemId ? null : current));
  }

  function updateItemPlacement(itemId: string, x: number, y: number, rotation: number) {
    setItems((current) => current.map((item) => (
      item.id === itemId
        ? {
            ...item,
            placedInBag: {
              axis: activeCanvasAxis,
              x,
              y,
              rotation,
            },
          }
        : item
    )));
  }

  function removeItemFromCanvas(itemId: string) {
    setItems((current) => current.map((item) => (
      item.id === itemId
        ? {
            ...item,
            placedInBag: undefined,
          }
        : item
    )));
  }

  function handleSetPlacedItem() {
    setSelectedCanvasItemId(null);
  }

  function rotateItemInCanvas(itemId: string) {
    setItems((current) => current.map((item) => (
      item.id === itemId
        ? {
            ...item,
            placedInBag: item.placedInBag
              ? {
                  ...item.placedInBag,
                  axis: activeCanvasAxis,
                  rotation: ((item.placedInBag.rotation ?? 0) + 90) % 360,
                }
              : item.placedInBag,
          }
        : item
    )));
  }

  function handleSetLayout() {
    if (!hasFullDimensions) {
      setError('Set width, depth, and height before completing layout.');
      return;
    }
    setError('');
    setIsLayoutEditorOpen(false);
  }

  function handleSave() {
    if (!name.trim()) {
      setError('Bag name is required.');
      return;
    }

    const nextBag: InventoryContainer = {
      ...(bag ?? {}),
      id: bag?.id ?? uuidv4(),
      kind: 'bag',
      name: name.trim(),
      icon: icon || 'inventory',
      items,
      dimensions: hasFullDimensions
        ? {
            width,
            depth,
            height,
          }
        : undefined,
      layoutGrid: hasFullDimensions
        ? {
            xAxis: activeCanvasAxis,
            widthDepth: widthDepthGrid,
            widthHeight: widthHeightGrid,
            depthHeight: depthHeightGrid,
          }
        : undefined,
      carryTask: {
        id: bag?.carryTask?.id ?? uuidv4(),
        name: `Carry ${name.trim()}`,
        taskType: 'CHECK',
        recurrenceMode: normalizeRecurrenceMode(recurrenceMode),
        recurrence,
        reminderLeadDays:
          normalizeRecurrenceMode(recurrenceMode) === 'recurring' && reminderLeadDays !== ''
            ? reminderLeadDays
            : undefined,
      },
      notes: bag?.notes ?? [],
      attachments: bag?.attachments ?? [],
      links: bag?.links ?? [],
    };

    setResource({
      ...resource,
      updatedAt: new Date().toISOString(),
      containers: bag
        ? (resource.containers ?? []).map((container) => (container.id === bag.id ? nextBag : container))
        : [...(resource.containers ?? []), nextBag],
    });

    onBagAdded?.(nextBag.id);
    onClose();
  }

  return (
    <PopupShell title={bag ? 'Edit Bag' : 'Add Bag'} onClose={onClose} size="large">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <IconPicker value={icon} onChange={setIcon} align="left" />
          <TextInput
            label="Bag name"
            value={name}
            onChange={(value) => {
              setName(value);
              setError('');
            }}
            placeholder="My Bag"
            maxLength={80}
          />
        </div>

        {!isLayoutEditorOpen ? (
          <section className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {name.trim() ? `Carry ${name.trim()}` : 'Carry Task'}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {([
                { value: 'recurring', label: 'Recurring' },
                { value: 'never', label: 'Intermittent' },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRecurrenceMode(option.value)}
                  className={normalizeRecurrenceMode(recurrenceMode) === option.value
                    ? 'rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white'
                    : 'rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {normalizeRecurrenceMode(recurrenceMode) === 'recurring' ? (
              <div className="mt-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_7rem]">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Frequency</span>
                    <select
                      value={recurrence.frequency}
                      onChange={(event) => updateRecurrence({
                        frequency: event.target.value as ResourceRecurrenceRule['frequency'],
                        days: event.target.value === 'weekly' ? recurrence.days : [],
                        monthlyDay: event.target.value === 'monthly' ? (recurrence.monthlyDay ?? getDayOfMonth(recurrence.seedDate)) : null,
                      })}
                      className={INPUT_CLS}
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Interval</span>
                    <input
                      type="number"
                      min={1}
                      value={recurrence.interval}
                      onChange={(event) => updateRecurrence({ interval: Math.max(1, Number(event.target.value) || 1) })}
                      className={INPUT_CLS}
                    />
                  </label>
                </div>

                {recurrence.frequency === 'weekly' ? (
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Days</span>
                    <div className="flex flex-wrap gap-2">
                      {DOW_LABELS.map((day) => (
                        <button
                          key={day.key}
                          type="button"
                          onClick={() => toggleDay(day.key)}
                          className={recurrence.days.includes(day.key)
                            ? 'h-8 w-8 rounded-full bg-blue-500 text-xs font-semibold text-white'
                            : 'h-8 w-8 rounded-full bg-white text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Start date</span>
                  <input
                    type="date"
                    value={recurrence.seedDate}
                    onChange={(event) => updateRecurrence({
                      seedDate: event.target.value,
                      monthlyDay: recurrence.frequency === 'monthly'
                        ? (recurrence.monthlyDay ?? getDayOfMonth(event.target.value))
                        : recurrence.monthlyDay,
                    })}
                    className={INPUT_CLS}
                  />
                </label>

                <label className="space-y-1 md:max-w-xs">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Reminder lead days</span>
                  <input
                    type="number"
                    min={0}
                    value={reminderLeadDays}
                    onChange={(event) => setReminderLeadDays(event.target.value === '' ? '' : Math.max(0, Number(event.target.value) || 0))}
                    className={INPUT_CLS}
                    placeholder="Optional"
                  />
                </label>
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-white px-3 py-3 text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                Intermittent carry task. No date or reminder settings are needed.
              </div>
            )}
          </section>
        ) : null}

        <section className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {isLayoutEditorOpen ? 'Set Layout' : 'Layout'}
            </div>
            {!isLayoutEditorOpen ? (
              <button
                type="button"
                onClick={() => setIsLayoutEditorOpen(true)}
                className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200"
              >
                {hasFullDimensions ? 'Edit' : 'Set Layout'}
              </button>
            ) : null}
          </div>

          {hasFullDimensions && !isLayoutEditorOpen ? (
            <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                Dimensions: {width} x {depth} x {height}
              </div>
              <div className="grid gap-2 lg:grid-cols-3">
                {([
                  { axis: 'width-depth', grid: widthDepthGrid },
                  { axis: 'width-height', grid: widthHeightGrid },
                  { axis: 'depth-height', grid: depthHeightGrid },
                ] as const).map((entry) => (
                  <div key={entry.axis} className="rounded-xl bg-white px-3 py-3 text-xs dark:bg-gray-800">
                    <div className="font-semibold text-gray-700 dark:text-gray-200">{axisLabel(entry.axis)}</div>
                    <div className="mt-1 text-gray-500 dark:text-gray-400">{entry.grid.columns} columns x {entry.grid.rows} rows</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {isLayoutEditorOpen ? (
            <div className="mt-3 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Width</span>
                  <input
                    type="number"
                    min={0}
                    value={width}
                    onChange={(event) => setWidth(event.target.value === '' ? '' : Math.max(0, Number(event.target.value) || 0))}
                    className={INPUT_CLS}
                    placeholder="e.g. 30"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Depth</span>
                  <input
                    type="number"
                    min={0}
                    value={depth}
                    onChange={(event) => setDepth(event.target.value === '' ? '' : Math.max(0, Number(event.target.value) || 0))}
                    className={INPUT_CLS}
                    placeholder="e.g. 20"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Height</span>
                  <input
                    type="number"
                    min={0}
                    value={height}
                    onChange={(event) => setHeight(event.target.value === '' ? '' : Math.max(0, Number(event.target.value) || 0))}
                    className={INPUT_CLS}
                    placeholder="e.g. 15"
                  />
                </label>
              </div>

              {AXIS_OPTIONS.map((option) => {
                const grid = option.value === 'width-depth'
                  ? widthDepthGrid
                  : option.value === 'width-height'
                    ? widthHeightGrid
                    : depthHeightGrid;

                return (
                  <div key={option.value} className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                      {option.label}
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Columns</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateFaceGrid(option.value, { columns: grid.columns - 1 })}
                            className="h-10 w-10 rounded-lg border border-gray-300 bg-white text-lg font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                          >
                            -
                          </button>
                          <div className="flex-1 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-center text-sm font-medium text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
                            {grid.columns}
                          </div>
                          <button
                            type="button"
                            onClick={() => updateFaceGrid(option.value, { columns: grid.columns + 1 })}
                            className="h-10 w-10 rounded-lg border border-gray-300 bg-white text-lg font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                          >
                            +
                          </button>
                        </div>
                      </label>

                      <label className="space-y-1">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Rows</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateFaceGrid(option.value, { rows: grid.rows - 1 })}
                            className="h-10 w-10 rounded-lg border border-gray-300 bg-white text-lg font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                          >
                            -
                          </button>
                          <div className="flex-1 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-center text-sm font-medium text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
                            {grid.rows}
                          </div>
                          <button
                            type="button"
                            onClick={() => updateFaceGrid(option.value, { rows: grid.rows + 1 })}
                            className="h-10 w-10 rounded-lg border border-gray-300 bg-white text-lg font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                          >
                            +
                          </button>
                        </div>
                      </label>
                    </div>
                  </div>
                );
              })}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSetLayout}
                  className="rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
                >
                  Set
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {isLayoutReady && !isLayoutEditorOpen ? (
          <section className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">Canvas</div>
              <div className="flex flex-wrap gap-2">
                {AXIS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setActiveCanvasAxis(option.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      activeCanvasAxis === option.value
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {unplacedItems.length > 0 ? (
                <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Place item on this face</span>
                    <select
                      value={selectedCanvasItem?.placedInBag ? '' : (selectedCanvasItemId ?? '')}
                      onChange={(event) => setSelectedCanvasItemId(event.target.value || null)}
                      className={INPUT_CLS}
                    >
                      <option value="">Select item</option>
                      {unplacedItems.map((item) => {
                        const resolved = resolveInventoryItemTemplate(item.itemTemplateRef, itemTemplates);

                        return (
                          <option key={item.id} value={item.id}>
                            {resolved?.name ?? item.itemTemplateRef}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </div>
              ) : null}

              <BagLayoutCanvas
                bag={draftBag}
                items={items}
                isEditMode
                selectedItemId={selectedCanvasItemId}
                onSelectItem={setSelectedCanvasItemId}
                onPlaceItem={updateItemPlacement}
              />

              {placedItemsOnActiveFace.length > 0 ? (
                <div className="space-y-2">
                  {placedItemsOnActiveFace.map((item) => {
                    const resolved = resolveInventoryItemTemplate(item.itemTemplateRef, itemTemplates);
                    const isSelected = selectedCanvasItemId === item.id;

                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl px-3 py-3 ${
                          isSelected
                            ? 'bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:ring-blue-900/60'
                            : 'bg-white dark:bg-gray-800'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedCanvasItemId(item.id)}
                          className="flex w-full items-center gap-2 text-left text-sm font-medium text-gray-700 dark:text-gray-200"
                        >
                          {resolved?.icon ? <IconDisplay iconKey={resolved.icon} size={16} className="h-4 w-4 shrink-0 object-contain" /> : null}
                          <span className="truncate">{resolved?.name ?? item.itemTemplateRef}</span>
                        </button>

                        {isSelected ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => rotateItemInCanvas(item.id)}
                              className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200"
                            >
                              Rotate 90 deg
                            </button>
                            <button
                              type="button"
                              onClick={() => removeItemFromCanvas(item.id)}
                              className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-200"
                            >
                              Remove
                            </button>
                            <button
                              type="button"
                              onClick={handleSetPlacedItem}
                              className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-200"
                            >
                              Set
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {!isLayoutEditorOpen ? (
          <section className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">Items</div>
              <button
                type="button"
                onClick={() => setShowAddItemPanel(true)}
                className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
              >
                Add Item
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {items.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No items in bag yet.</p>
              ) : items.map((item) => {
                const resolved = resolveInventoryItemTemplate(item.itemTemplateRef, itemTemplates);
                return (
                  <div key={item.id} className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                      {resolved?.icon ? <IconDisplay iconKey={resolved.icon} size={16} className="h-4 w-4 shrink-0 object-contain" /> : null}
                      <span className="truncate">{resolved?.name ?? item.itemTemplateRef}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <label className="font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Qty</label>
                      <input
                        type="number"
                        min={0}
                        value={item.quantity ?? 1}
                        onChange={(event) => updateItemQuantity(item.id, Number(event.target.value) || 0)}
                        className="w-24 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                      />
                      {item.unit?.trim() ? <span>{item.unit.trim()}</span> : null}
                      {item.placedInBag ? (
                        <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
                          {axisLabel(item.placedInBag.axis ?? 'width-depth')}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="ml-auto rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {error ? <div className="text-sm font-medium text-red-500">{error}</div> : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
          >
            {bag ? 'Save Bag' : 'Create Bag'}
          </button>
        </div>
      </div>

      {showAddItemPanel ? (
        <AddItemPanel
          resource={resource}
          onClose={() => setShowAddItemPanel(false)}
          onItemInstanceAdded={(item) => {
            setItems((current) => [...current, item]);
            setShowAddItemPanel(false);
          }}
        />
      ) : null}
    </PopupShell>
  );
}
