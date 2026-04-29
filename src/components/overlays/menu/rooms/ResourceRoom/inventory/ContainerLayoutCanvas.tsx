import { useEffect, useMemo, useState } from 'react';
import { useUserStore } from '../../../../../../stores/useUserStore';
import type { InventoryContainer, ItemInstance } from '../../../../../../types/resource';
import { getUserInventoryItemTemplates, resolveInventoryItemTemplate } from '../../../../../../utils/inventoryItems';
import { IconDisplay } from '../../../../../shared/IconDisplay';

type ContainerFace = 'width-depth' | 'width-height' | 'depth-height';

interface ContainerLayoutCanvasProps {
  container: InventoryContainer;
  activeFace: ContainerFace;
  items: ItemInstance[];
  isEditMode: boolean;
  onPlaceItem: (itemId: string, face: ContainerFace, x: number, y: number, rotation: number) => void;
  onRemoveItem: (itemId: string, face: ContainerFace) => void;
}

function getFaceDimensions(
  container: InventoryContainer,
  face: ContainerFace,
): { xSize: number; ySize: number; xLabel: string; yLabel: string } {
  const width = container.dimensions?.width ?? 1;
  const depth = container.dimensions?.depth ?? 1;
  const height = container.dimensions?.height ?? 1;

  switch (face) {
    case 'width-height':
      return { xSize: width, ySize: height, xLabel: 'Width', yLabel: 'Height' };
    case 'depth-height':
      return { xSize: depth, ySize: height, xLabel: 'Depth', yLabel: 'Height' };
    case 'width-depth':
    default:
      return { xSize: width, ySize: depth, xLabel: 'Width', yLabel: 'Depth' };
  }
}

function getFaceGrid(
  container: InventoryContainer,
  face: ContainerFace,
): { columns: number; rows: number } {
  const grid = container.layoutGrid;
  const fallback = {
    columns: Math.max(1, grid?.columns ?? 1),
    rows: Math.max(1, grid?.rows ?? 1),
  };

  switch (face) {
    case 'width-height':
      return grid?.widthHeight ?? fallback;
    case 'depth-height':
      return grid?.depthHeight ?? fallback;
    case 'width-depth':
    default:
      return grid?.widthDepth ?? fallback;
  }
}

function getItemFaceSize(
  item: ItemInstance,
  face: ContainerFace,
  fallbackX: number,
  fallbackY: number,
): { xSize: number; ySize: number } {
  const dims = item.dimensions;
  if (!dims) return { xSize: fallbackX, ySize: fallbackY };

  switch (face) {
    case 'width-height':
      return { xSize: dims.width, ySize: dims.height };
    case 'depth-height':
      return { xSize: dims.depth, ySize: dims.height };
    case 'width-depth':
    default:
      return { xSize: dims.width, ySize: dims.depth };
  }
}

export function ContainerLayoutCanvas({
  container,
  activeFace,
  items,
  isEditMode,
  onPlaceItem,
  onRemoveItem,
}: ContainerLayoutCanvasProps) {
  const user = useUserStore((state) => state.user);
  const userTemplates = useMemo(() => getUserInventoryItemTemplates(user), [user]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);

  const faceDimensions = getFaceDimensions(container, activeFace);
  const grid = getFaceGrid(container, activeFace);
  const fallbackItemWidth = Math.max(faceDimensions.xSize / Math.max(4, grid.columns + 1), faceDimensions.xSize * 0.12);
  const fallbackItemHeight = Math.max(faceDimensions.ySize / Math.max(4, grid.rows + 1), faceDimensions.ySize * 0.12);

  const placedItems = useMemo(
    () => items.filter((item) => Boolean(item.placedInContainer?.[activeFace])),
    [activeFace, items],
  );
  const selectableItems = useMemo(
    () => items.filter((item) => !item.placedInContainer?.[activeFace]),
    [activeFace, items],
  );
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );
  const selectedPlacement = selectedItem?.placedInContainer?.[activeFace];

  useEffect(() => {
    if (!selectedItemId) return;
    const stillExists = items.some((item) => item.id === selectedItemId);
    if (!stillExists) {
      setSelectedItemId(null);
    }
  }, [items, selectedItemId]);

  function getPlacementForPointer(
    clientX: number,
    clientY: number,
    rect: DOMRect,
    itemId: string,
    existingRotation = 0,
  ) {
    const item = items.find((entry) => entry.id === itemId);
    const { xSize, ySize } = getItemFaceSize(
      item ?? { id: itemId, itemTemplateRef: '', dimensions: undefined },
      activeFace,
      fallbackItemWidth,
      fallbackItemHeight,
    );
    const displayWidth = existingRotation % 180 === 90 ? ySize : xSize;
    const displayHeight = existingRotation % 180 === 90 ? xSize : ySize;
    const rawX = ((clientX - rect.left) / rect.width) * faceDimensions.xSize - (displayWidth / 2);
    const rawY = ((clientY - rect.top) / rect.height) * faceDimensions.ySize - (displayHeight / 2);
    const maxX = Math.max(0, faceDimensions.xSize - displayWidth);
    const maxY = Math.max(0, faceDimensions.ySize - displayHeight);

    return {
      x: Math.max(0, Math.min(maxX, rawX)),
      y: Math.max(0, Math.min(maxY, rawY)),
    };
  }

  function handleCanvasClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!isEditMode || !selectedItemId) return;
    const item = items.find((entry) => entry.id === selectedItemId);
    if (!item) return;
    if (item.placedInContainer?.[activeFace] && draggingItemId === selectedItemId) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const rotation = item.placedInContainer?.[activeFace]?.rotation ?? 0;
    const next = getPlacementForPointer(event.clientX, event.clientY, rect, selectedItemId, rotation);
    onPlaceItem(selectedItemId, activeFace, next.x, next.y, rotation);
    setSelectedItemId(selectedItemId);
  }

  function handleCanvasDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!isEditMode) return;
    event.preventDefault();

    const draggedItemId = event.dataTransfer.getData('application/x-container-item-id');
    if (!draggedItemId) return;

    const draggedItem = items.find((entry) => entry.id === draggedItemId);
    if (!draggedItem) return;

    const rotation = draggedItem.placedInContainer?.[activeFace]?.rotation ?? 0;
    const rect = event.currentTarget.getBoundingClientRect();
    const next = getPlacementForPointer(event.clientX, event.clientY, rect, draggedItemId, rotation);
    onPlaceItem(draggedItemId, activeFace, next.x, next.y, rotation);
    setSelectedItemId(draggedItemId);
    setDraggingItemId(null);
  }

  function rotateSelectedItem() {
    if (!selectedItem || !selectedPlacement) return;
    onPlaceItem(
      selectedItem.id,
      activeFace,
      selectedPlacement.x,
      selectedPlacement.y,
      ((selectedPlacement.rotation ?? 0) + 90) % 360,
    );
  }

  return (
    <div className="space-y-3">
      {isEditMode && selectableItems.length > 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/40">
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Place item on this face</span>
            <select
              value={selectedPlacement ? '' : (selectedItemId ?? '')}
              onChange={(event) => setSelectedItemId(event.target.value || null)}
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">Select item</option>
              {selectableItems.map((item) => {
                const resolved = resolveInventoryItemTemplate(item.itemTemplateRef, userTemplates);
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

      <div className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900/70">
        <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
          <span>{faceDimensions.xLabel} x {faceDimensions.yLabel}</span>
          <span>{grid.columns} x {grid.rows} grid</span>
        </div>

        <div
          onClick={handleCanvasClick}
          onDragOver={(event) => {
            if (!isEditMode) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={handleCanvasDrop}
          className={`relative block w-full overflow-hidden rounded-xl border border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800/70 ${
            isEditMode ? 'cursor-crosshair' : 'cursor-default'
          }`}
          style={{ aspectRatio: `${faceDimensions.xSize} / ${faceDimensions.ySize}` }}
        >
          <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${faceDimensions.xSize} ${faceDimensions.ySize}`} preserveAspectRatio="none" aria-hidden="true">
            <rect
              x="0"
              y="0"
              width={faceDimensions.xSize}
              height={faceDimensions.ySize}
              fill="transparent"
              stroke="var(--layout-grid-line, rgba(148, 163, 184, 0.85))"
              strokeWidth={0.8}
            />
            {Array.from({ length: Math.max(0, grid.columns - 1) }).map((_, index) => {
              const x = ((index + 1) * faceDimensions.xSize) / grid.columns;
              return (
                <line
                  key={`v-${x}`}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={faceDimensions.ySize}
                  stroke="var(--layout-grid-line, rgba(148, 163, 184, 0.85))"
                  strokeWidth={0.45}
                />
              );
            })}
            {Array.from({ length: Math.max(0, grid.rows - 1) }).map((_, index) => {
              const y = ((index + 1) * faceDimensions.ySize) / grid.rows;
              return (
                <line
                  key={`h-${y}`}
                  x1={0}
                  y1={y}
                  x2={faceDimensions.xSize}
                  y2={y}
                  stroke="var(--layout-grid-line, rgba(148, 163, 184, 0.85))"
                  strokeWidth={0.45}
                />
              );
            })}
          </svg>

          {placedItems.map((item) => {
            const resolved = resolveInventoryItemTemplate(item.itemTemplateRef, userTemplates);
            const { xSize, ySize } = getItemFaceSize(item, activeFace, fallbackItemWidth, fallbackItemHeight);
            const placement = item.placedInContainer?.[activeFace];
            const rotation = placement?.rotation ?? 0;
            const displayWidth = rotation % 180 === 90 ? ySize : xSize;
            const displayHeight = rotation % 180 === 90 ? xSize : ySize;

            return (
              <button
                key={`${item.id}-${activeFace}`}
                type="button"
                draggable={isEditMode}
                onDragStart={(event) => {
                  if (!isEditMode) return;
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('application/x-container-item-id', item.id);
                  setSelectedItemId(item.id);
                  setDraggingItemId(item.id);
                }}
                onDragEnd={() => {
                  setDraggingItemId(null);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!isEditMode) return;
                  setSelectedItemId(item.id);
                }}
                className={`absolute flex items-center justify-center overflow-hidden rounded-lg border shadow-sm ${
                  selectedItemId === item.id
                    ? 'border-blue-500 bg-blue-100 text-blue-900 dark:border-blue-400 dark:bg-blue-900/60 dark:text-blue-100'
                    : 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-100'
                }`}
                style={{
                  left: `${(((placement?.x ?? 0) / faceDimensions.xSize) * 100)}%`,
                  top: `${(((placement?.y ?? 0) / faceDimensions.ySize) * 100)}%`,
                  width: `${((displayWidth / faceDimensions.xSize) * 100)}%`,
                  height: `${((displayHeight / faceDimensions.ySize) * 100)}%`,
                  minWidth: '3.25rem',
                  minHeight: '2.5rem',
                }}
              >
                {resolved?.icon ? (
                  <IconDisplay
                    iconKey={resolved.icon}
                    size={24}
                    className="h-[70%] w-[70%] max-h-10 max-w-10 object-contain"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {isEditMode ? (
        <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/40">
          {selectedItemId && !selectedPlacement ? (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Click anywhere on the canvas to place the selected item on this face.
            </div>
          ) : null}

          {placedItems.length > 0 ? (
            <div className="space-y-2">
              {placedItems.map((item) => {
                const resolved = resolveInventoryItemTemplate(item.itemTemplateRef, userTemplates);
                const isSelected = selectedItemId === item.id;

                return (
                  <div
                    key={`face-item-${item.id}`}
                    className={`rounded-xl px-3 py-3 ${
                      isSelected
                        ? 'bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:ring-blue-900/60'
                        : 'bg-white dark:bg-gray-800'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedItemId(item.id)}
                      className="flex w-full items-center gap-2 text-left text-sm font-medium text-gray-700 dark:text-gray-200"
                    >
                      {resolved?.icon ? <IconDisplay iconKey={resolved.icon} size={16} className="h-4 w-4 shrink-0 object-contain" /> : null}
                      <span className="truncate">{resolved?.name ?? item.itemTemplateRef}</span>
                    </button>

                    {isSelected ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={rotateSelectedItem}
                          className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200"
                        >
                          Rotate 90 deg
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.id, activeFace)}
                          className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-200"
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedItemId(null)}
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
          ) : (
            <div className="text-xs text-gray-500 dark:text-gray-400">No items placed on this face yet.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}