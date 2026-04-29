import { useMemo, useState } from 'react';
import { useUserStore } from '../../../../../../stores/useUserStore';
import type { InventoryContainer, ItemInstance } from '../../../../../../types/resource';
import { getUserInventoryItemTemplates, resolveInventoryItemTemplate } from '../../../../../../utils/inventoryItems';

interface BagLayoutCanvasProps {
  bag: InventoryContainer;
  items: ItemInstance[];
  isEditMode: boolean;
  selectedItemId?: string | null;
  onSelectItem?: (itemId: string | null) => void;
  onPlaceItem: (itemId: string, x: number, y: number, rotation: number) => void;
}

type BagAxis = NonNullable<InventoryContainer['layoutGrid']>['xAxis'];

function getAxisDimensions(
  bag: InventoryContainer,
  axis: BagAxis,
): { xSize: number; ySize: number; xLabel: string; yLabel: string } {
  const width = bag.dimensions?.width ?? 1;
  const depth = bag.dimensions?.depth ?? 1;
  const height = bag.dimensions?.height ?? 1;

  switch (axis) {
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
  bag: InventoryContainer,
  axis: BagAxis,
): { columns: number; rows: number } {
  const grid = bag.layoutGrid;
  const fallback = {
    columns: Math.max(1, grid?.columns ?? 1),
    rows: Math.max(1, grid?.rows ?? 1),
  };

  switch (axis) {
    case 'width-height':
      return grid?.widthHeight ?? fallback;
    case 'depth-height':
      return grid?.depthHeight ?? fallback;
    case 'width-depth':
    default:
      return grid?.widthDepth ?? fallback;
  }
}

function getItemAxisSize(
  item: ItemInstance,
  axis: BagAxis,
  fallbackX: number,
  fallbackY: number,
): { xSize: number; ySize: number } {
  const dims = item.dimensions;
  if (!dims) return { xSize: fallbackX, ySize: fallbackY };

  switch (axis) {
    case 'width-height':
      return { xSize: dims.width, ySize: dims.height };
    case 'depth-height':
      return { xSize: dims.depth, ySize: dims.height };
    case 'width-depth':
    default:
      return { xSize: dims.width, ySize: dims.depth };
  }
}

export function BagLayoutCanvas({
  bag,
  items,
  isEditMode,
  selectedItemId = null,
  onSelectItem,
  onPlaceItem,
}: BagLayoutCanvasProps) {
  const user = useUserStore((state) => state.user);
  const userTemplates = useMemo(() => getUserInventoryItemTemplates(user), [user]);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);

  const axis = bag.layoutGrid?.xAxis ?? 'width-depth';
  const axisDimensions = getAxisDimensions(bag, axis);
  const grid = getFaceGrid(bag, axis);
  const fallbackItemWidth = Math.max(axisDimensions.xSize / Math.max(4, grid.columns + 1), axisDimensions.xSize * 0.12);
  const fallbackItemHeight = Math.max(axisDimensions.ySize / Math.max(4, grid.rows + 1), axisDimensions.ySize * 0.12);

  const placedItems = items.filter((item) => (item.placedInBag?.axis ?? 'width-depth') === axis && item.placedInBag);
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;

  function getPlacementForPointer(
    clientX: number,
    clientY: number,
    rect: DOMRect,
    itemId: string,
    existingRotation = 0,
  ) {
    const item = items.find((entry) => entry.id === itemId);
    const { xSize, ySize } = getItemAxisSize(
      item ?? { id: itemId, itemTemplateRef: '', dimensions: undefined },
      axis,
      fallbackItemWidth,
      fallbackItemHeight,
    );
    const displayWidth = existingRotation % 180 === 90 ? ySize : xSize;
    const displayHeight = existingRotation % 180 === 90 ? xSize : ySize;
    const rawX = ((clientX - rect.left) / rect.width) * axisDimensions.xSize - (displayWidth / 2);
    const rawY = ((clientY - rect.top) / rect.height) * axisDimensions.ySize - (displayHeight / 2);
    const maxX = Math.max(0, axisDimensions.xSize - displayWidth);
    const maxY = Math.max(0, axisDimensions.ySize - displayHeight);

    return {
      x: Math.max(0, Math.min(maxX, rawX)),
      y: Math.max(0, Math.min(maxY, rawY)),
    };
  }

  function handleCanvasClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!isEditMode || !selectedItemId) return;
    const item = items.find((entry) => entry.id === selectedItemId);
    if (!item) return;
    if (item.placedInBag?.axis === axis && draggingItemId === selectedItemId) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const rotation = item.placedInBag?.axis === axis ? (item.placedInBag.rotation ?? 0) : 0;
    const next = getPlacementForPointer(event.clientX, event.clientY, rect, selectedItemId, rotation);
    onPlaceItem(selectedItemId, next.x, next.y, rotation);
    onSelectItem?.(selectedItemId);
  }

  function handleCanvasDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!isEditMode) return;
    event.preventDefault();

    const draggedItemId = event.dataTransfer.getData('application/x-bag-item-id');
    if (!draggedItemId) return;

    const draggedItem = items.find((entry) => entry.id === draggedItemId);
    if (!draggedItem) return;

    const rotation = draggedItem.placedInBag?.axis === axis
      ? (draggedItem.placedInBag?.rotation ?? 0)
      : 0;
    const rect = event.currentTarget.getBoundingClientRect();
    const next = getPlacementForPointer(event.clientX, event.clientY, rect, draggedItemId, rotation);
    onPlaceItem(draggedItemId, next.x, next.y, rotation);
    onSelectItem?.(draggedItemId);
    setDraggingItemId(null);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900/70">
        <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
          <span>{axisDimensions.xLabel} x {axisDimensions.yLabel}</span>
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
          style={{ aspectRatio: `${axisDimensions.xSize} / ${axisDimensions.ySize}` }}
        >
          <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${axisDimensions.xSize} ${axisDimensions.ySize}`} preserveAspectRatio="none" aria-hidden="true">
            <rect
              x="0"
              y="0"
              width={axisDimensions.xSize}
              height={axisDimensions.ySize}
              fill="transparent"
              stroke="var(--layout-grid-line, rgba(148, 163, 184, 0.85))"
              strokeWidth={0.8}
            />
            {Array.from({ length: Math.max(0, grid.columns - 1) }).map((_, index) => {
              const x = ((index + 1) * axisDimensions.xSize) / grid.columns;
              return (
                <line
                  key={`v-${x}`}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={axisDimensions.ySize}
                  stroke="var(--layout-grid-line, rgba(148, 163, 184, 0.85))"
                  strokeWidth={0.45}
                />
              );
            })}
            {Array.from({ length: Math.max(0, grid.rows - 1) }).map((_, index) => {
              const y = ((index + 1) * axisDimensions.ySize) / grid.rows;
              return (
                <line
                  key={`h-${y}`}
                  x1={0}
                  y1={y}
                  x2={axisDimensions.xSize}
                  y2={y}
                  stroke="var(--layout-grid-line, rgba(148, 163, 184, 0.85))"
                  strokeWidth={0.45}
                />
              );
            })}
          </svg>

          {placedItems.map((item) => {
            const resolved = resolveInventoryItemTemplate(item.itemTemplateRef, userTemplates);
            const { xSize, ySize } = getItemAxisSize(item, axis, fallbackItemWidth, fallbackItemHeight);
            const rotation = item.placedInBag?.rotation ?? 0;
            const displayWidth = rotation % 180 === 90 ? ySize : xSize;
            const displayHeight = rotation % 180 === 90 ? xSize : ySize;

            return (
              <button
                key={item.id}
                type="button"
                draggable={isEditMode}
                onDragStart={(event) => {
                  if (!isEditMode) return;
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('application/x-bag-item-id', item.id);
                  onSelectItem?.(item.id);
                  setDraggingItemId(item.id);
                }}
                onDragEnd={() => {
                  setDraggingItemId(null);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!isEditMode) return;
                  onSelectItem?.(item.id);
                }}
                className={`absolute overflow-hidden rounded-lg border px-1.5 py-1 text-left shadow-sm ${
                  selectedItemId === item.id
                    ? 'border-blue-500 bg-blue-100 text-blue-900 dark:border-blue-400 dark:bg-blue-900/60 dark:text-blue-100'
                    : 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-100'
                }`}
                style={{
                  left: `${((item.placedInBag?.x ?? 0) / axisDimensions.xSize) * 100}%`,
                  top: `${((item.placedInBag?.y ?? 0) / axisDimensions.ySize) * 100}%`,
                  width: `${(displayWidth / axisDimensions.xSize) * 100}%`,
                  height: `${(displayHeight / axisDimensions.ySize) * 100}%`,
                  minWidth: '3.25rem',
                  minHeight: '2.5rem',
                }}
              >
                <div className="truncate text-[11px] font-semibold">{resolved?.name ?? item.itemTemplateRef}</div>
              </button>
            );
          })}
        </div>
      </div>

      {isEditMode ? (
        <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {selectedItem
              ? selectedItem.placedInBag?.axis === axis
                ? 'Drag the selected item to adjust its position on this face.'
                : 'Select an item from the list, then click or drag into the canvas to place it anywhere on this face.'
              : 'Select an item from the list to place it on this face.'}
          </div>
        </div>
      ) : null}
    </div>
  );
}
