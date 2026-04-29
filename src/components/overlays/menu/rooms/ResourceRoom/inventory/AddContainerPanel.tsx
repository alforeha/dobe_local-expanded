import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import type { InventoryContainer, InventoryResource, ItemInstance } from '../../../../../../types/resource';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { IconPicker } from '../../../../../shared/IconPicker';
import { TextInput } from '../../../../../shared/inputs/TextInput';
import { PopupShell } from '../../../../../shared/popups/PopupShell';
import { AddItemPanel } from './AddItemPanel';
import { ContainerLayoutCanvas } from './ContainerLayoutCanvas';
import { getUserInventoryItemTemplates, mergeInventoryItemTemplates, resolveInventoryItemTemplate } from '../../../../../../utils/inventoryItems';

interface AddContainerPanelProps {
  resource: InventoryResource;
  container?: InventoryContainer | null;
  onClose: () => void;
  onContainerSaved?: (containerId: string) => void;
}

type ContainerFace = NonNullable<InventoryContainer['layoutGrid']>['xAxis'];

type FaceGridDraft = {
  columns: number;
  rows: number;
};

const FACE_OPTIONS: Array<{ value: ContainerFace; label: string }> = [
  { value: 'width-depth', label: 'Width x Depth' },
  { value: 'width-height', label: 'Width x Height' },
  { value: 'depth-height', label: 'Depth x Height' },
];

const INPUT_CLS = 'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';

function clampGridCount(value: number): number {
  return Math.min(10, Math.max(1, value));
}

function resolveFaceGrid(layoutGrid: InventoryContainer['layoutGrid'] | undefined, face: ContainerFace): FaceGridDraft {
  const fallback = {
    columns: clampGridCount(layoutGrid?.columns ?? 1),
    rows: clampGridCount(layoutGrid?.rows ?? 1),
  };

  switch (face) {
    case 'width-height':
      return layoutGrid?.widthHeight ?? fallback;
    case 'depth-height':
      return layoutGrid?.depthHeight ?? fallback;
    case 'width-depth':
    default:
      return layoutGrid?.widthDepth ?? fallback;
  }
}

function faceLabel(face: ContainerFace): string {
  return FACE_OPTIONS.find((option) => option.value === face)?.label ?? face;
}

function formatPlacementSummary(item: ItemInstance, face: ContainerFace): string {
  return item.placedInContainer?.[face] ? 'Placed' : 'Unplaced';
}

export function AddContainerPanel({ resource, container, onClose, onContainerSaved }: AddContainerPanelProps) {
  const setResource = useResourceStore((state) => state.setResource);
  const user = useUserStore((state) => state.user);

  const [icon, setIcon] = useState(container?.icon || 'inventory');
  const [name, setName] = useState(container?.name || '');
  const [items, setItems] = useState<ItemInstance[]>(container?.items ?? []);
  const [width, setWidth] = useState<number | ''>(container?.dimensions?.width ?? '');
  const [depth, setDepth] = useState<number | ''>(container?.dimensions?.depth ?? '');
  const [height, setHeight] = useState<number | ''>(container?.dimensions?.height ?? '');
  const [activeFace, setActiveFace] = useState<ContainerFace>(container?.layoutGrid?.xAxis ?? 'width-depth');
  const [activeLayoutFace, setActiveLayoutFace] = useState<ContainerFace>(container?.layoutGrid?.xAxis ?? 'width-depth');
  const [widthDepthGrid, setWidthDepthGrid] = useState<FaceGridDraft>(() => resolveFaceGrid(container?.layoutGrid, 'width-depth'));
  const [widthHeightGrid, setWidthHeightGrid] = useState<FaceGridDraft>(() => resolveFaceGrid(container?.layoutGrid, 'width-height'));
  const [depthHeightGrid, setDepthHeightGrid] = useState<FaceGridDraft>(() => resolveFaceGrid(container?.layoutGrid, 'depth-height'));
  const [isLayoutEditorOpen, setIsLayoutEditorOpen] = useState(false);
  const [showAddItemPanel, setShowAddItemPanel] = useState(false);
  const [error, setError] = useState('');

  const itemTemplates = useMemo(
    () => mergeInventoryItemTemplates(getUserInventoryItemTemplates(user), resource.itemTemplates),
    [resource.itemTemplates, user],
  );

  const hasAnyDimensions = [width, depth, height].some((value) => value !== '');
  const hasFullDimensions = width !== '' && depth !== '' && height !== '' && width > 0 && depth > 0 && height > 0;
  const layoutSummary = hasFullDimensions ? `${width} x ${depth} x ${height}` : '';
  const canSave = name.trim().length > 0;

  const draftContainer = useMemo<InventoryContainer>(() => ({
    ...(container ?? {}),
    id: container?.id ?? 'container-draft',
    name: name.trim() || container?.name || 'Container',
    icon: icon || 'inventory',
    kind: 'container',
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
          xAxis: activeFace,
          widthDepth: widthDepthGrid,
          widthHeight: widthHeightGrid,
          depthHeight: depthHeightGrid,
        }
      : undefined,
  }), [activeFace, container, depth, depthHeightGrid, hasFullDimensions, height, icon, items, name, width, widthDepthGrid, widthHeightGrid]);

  function updateFaceGrid(face: ContainerFace, patch: Partial<FaceGridDraft>) {
    const apply = (current: FaceGridDraft): FaceGridDraft => ({
      columns: clampGridCount(patch.columns ?? current.columns),
      rows: clampGridCount(patch.rows ?? current.rows),
    });

    if (face === 'width-depth') {
      setWidthDepthGrid((current) => apply(current));
      return;
    }
    if (face === 'width-height') {
      setWidthHeightGrid((current) => apply(current));
      return;
    }
    setDepthHeightGrid((current) => apply(current));
  }

  function validateLayoutDraft() {
    if (!hasAnyDimensions) {
      setError('');
      return true;
    }

    if (!hasFullDimensions) {
      setError('Width, depth, and height must all be set together.');
      return false;
    }

    setError('');
    return true;
  }

  function handleSetLayout() {
    if (!validateLayoutDraft()) return;
    setActiveFace(activeLayoutFace);
    setIsLayoutEditorOpen(false);
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

  function updateItemPlacement(itemId: string, face: ContainerFace, x: number, y: number, rotation: number) {
    setItems((current) => current.map((item) => (
      item.id === itemId
        ? {
            ...item,
            placedInContainer: {
              ...(item.placedInContainer ?? {}),
              [face]: {
                x,
                y,
                rotation,
              },
            },
          }
        : item
    )));
  }

  function removeItemPlacement(itemId: string, face: ContainerFace) {
    setItems((current) => current.map((item) => {
      if (item.id !== itemId || !item.placedInContainer?.[face]) return item;
      const nextPlacement = { ...(item.placedInContainer ?? {}) };
      delete nextPlacement[face];
      return {
        ...item,
        placedInContainer: Object.keys(nextPlacement).length > 0 ? nextPlacement : undefined,
      };
    }));
  }

  function removeItem(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId));
  }

  function handleSave() {
    if (!name.trim()) {
      setError('Container name is required.');
      return;
    }
    if (!validateLayoutDraft()) return;

    const nextContainer: InventoryContainer = {
      ...(container ?? {}),
      id: container?.id ?? uuidv4(),
      kind: 'container',
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
            xAxis: activeFace,
            widthDepth: widthDepthGrid,
            widthHeight: widthHeightGrid,
            depthHeight: depthHeightGrid,
          }
        : undefined,
    };

    setResource({
      ...resource,
      updatedAt: new Date().toISOString(),
      containers: container
        ? (resource.containers ?? []).map((entry) => (entry.id === container.id ? nextContainer : entry))
        : [...(resource.containers ?? []), nextContainer],
    });

    onContainerSaved?.(nextContainer.id);
    onClose();
  }

  return (
    <PopupShell title={container ? 'Edit Container' : 'Add Container'} onClose={onClose} size="large">
      <div className="flex flex-col gap-4">
        {!isLayoutEditorOpen ? (
          <section className="grid grid-cols-[auto_1fr] items-end gap-3">
            <IconPicker value={icon} onChange={setIcon} align="left" />
            <TextInput
              label="Container name"
              value={name}
              onChange={(value) => {
                setName(value);
                setError('');
              }}
              placeholder="Pantry Bin"
              maxLength={80}
            />
          </section>
        ) : null}

        <section className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
          {!isLayoutEditorOpen ? (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setActiveLayoutFace(activeFace);
                  setIsLayoutEditorOpen(true);
                  setError('');
                }}
                className="rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
              >
                Set Layout
              </button>
              {layoutSummary ? (
                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{layoutSummary}</span>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Width</span>
                  <input
                    type="number"
                    min={1}
                    value={width}
                    onChange={(event) => {
                      const value = event.target.value;
                      setWidth(value === '' ? '' : Math.max(1, Number(value) || 1));
                      setError('');
                    }}
                    className={INPUT_CLS}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Depth</span>
                  <input
                    type="number"
                    min={1}
                    value={depth}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDepth(value === '' ? '' : Math.max(1, Number(value) || 1));
                      setError('');
                    }}
                    className={INPUT_CLS}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Height</span>
                  <input
                    type="number"
                    min={1}
                    value={height}
                    onChange={(event) => {
                      const value = event.target.value;
                      setHeight(value === '' ? '' : Math.max(1, Number(value) || 1));
                      setError('');
                    }}
                    className={INPUT_CLS}
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                {FACE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setActiveLayoutFace(option.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      activeLayoutFace === option.value
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Columns</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={resolveFaceGrid(
                      {
                        xAxis: activeLayoutFace,
                        widthDepth: widthDepthGrid,
                        widthHeight: widthHeightGrid,
                        depthHeight: depthHeightGrid,
                      },
                      activeLayoutFace,
                    ).columns}
                    onChange={(event) => updateFaceGrid(activeLayoutFace, { columns: clampGridCount(Number(event.target.value) || 1) })}
                    className={INPUT_CLS}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Rows</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={resolveFaceGrid(
                      {
                        xAxis: activeLayoutFace,
                        widthDepth: widthDepthGrid,
                        widthHeight: widthHeightGrid,
                        depthHeight: depthHeightGrid,
                      },
                      activeLayoutFace,
                    ).rows}
                    onChange={(event) => updateFaceGrid(activeLayoutFace, { rows: clampGridCount(Number(event.target.value) || 1) })}
                    className={INPUT_CLS}
                  />
                </label>
              </div>

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
          )}
        </section>

        {hasFullDimensions && !isLayoutEditorOpen ? (
          <section className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">Canvas</div>
              <div className="flex flex-wrap gap-2">
                {FACE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setActiveFace(option.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      activeFace === option.value
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <ContainerLayoutCanvas
              container={draftContainer}
              activeFace={activeFace}
              items={items}
              isEditMode
              onPlaceItem={updateItemPlacement}
              onRemoveItem={removeItemPlacement}
            />

            <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
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
                  <p className="text-sm text-gray-500 dark:text-gray-400">No items in container yet.</p>
                ) : items.map((item) => {
                  const resolved = resolveInventoryItemTemplate(item.itemTemplateRef, itemTemplates);
                  return (
                    <div key={item.id} className="rounded-xl bg-gray-50 px-3 py-3 dark:bg-gray-900/60">
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
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="ml-auto rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {FACE_OPTIONS.map((option) => (
                          <span
                            key={`${item.id}-${option.value}`}
                            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                              item.placedInContainer?.[option.value]
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
                                : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {faceLabel(option.value)}: {formatPlacementSummary(item, option.value)}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
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
            disabled={!canSave}
            className={canSave
              ? 'rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600'
              : 'rounded-full bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-400 dark:bg-gray-700'}
          >
            {container ? 'Save Container' : 'Create Container'}
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