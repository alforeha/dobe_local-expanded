import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import type { FloorPlanRoom, HomeResource, InventoryContainer, InventoryResource } from '../../../../../../types/resource';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { IconPicker } from '../../../../../shared/IconPicker';
import { PopupShell } from '../../../../../shared/popups/PopupShell';

interface ExistingContainerPlacement {
  containerId: string;
  homeId: string;
  homeName: string;
  storyId: string;
  storyName: string;
  roomId: string | null;
  roomName: string | null;
  placementId: string;
}

interface RoomAddContainerPanelProps {
  room: FloorPlanRoom;
  homeId?: string;
  onClose: () => void;
  onAddExistingContainer: (containerId: string) => void;
  onMoveExistingContainer?: (containerId: string, source: ExistingContainerPlacement) => void;
  onCreateRoomContainer: (container: InventoryContainer) => void;
}

type PanelMode = 'choose' | 'create';
type ContainerFace = NonNullable<InventoryContainer['layoutGrid']>['xAxis'];
type FaceGridDraft = {
  columns: number;
  rows: number;
};
type FaceGridInputDraft = {
  columns: string;
  rows: string;
};

const FACE_OPTIONS: Array<{ value: ContainerFace; label: string }> = [
  { value: 'width-depth', label: 'Width x Depth [Top View]' },
  { value: 'width-height', label: 'Width x Height [Front View]' },
  { value: 'depth-height', label: 'Depth x Height [Side View]' },
];

function clampGrid(value: number): number {
  return Math.min(10, Math.max(1, value));
}

export function RoomAddContainerPanel({ room, homeId, onClose, onAddExistingContainer, onMoveExistingContainer, onCreateRoomContainer }: RoomAddContainerPanelProps) {
  const resources = useResourceStore((state) => state.resources);
  const setResource = useResourceStore((state) => state.setResource);
  const [mode, setMode] = useState<PanelMode>('choose');
  const [icon, setIcon] = useState('inventory');
  const [name, setName] = useState('');
  const [width, setWidth] = useState<number | ''>('');
  const [depth, setDepth] = useState<number | ''>('');
  const [height, setHeight] = useState<number | ''>('');
  const [activeFace, setActiveFace] = useState<ContainerFace>('width-depth');
  const [widthDepthGrid, setWidthDepthGrid] = useState<FaceGridInputDraft>({ columns: '1', rows: '1' });
  const [widthHeightGrid, setWidthHeightGrid] = useState<FaceGridInputDraft>({ columns: '1', rows: '1' });
  const [depthHeightGrid, setDepthHeightGrid] = useState<FaceGridInputDraft>({ columns: '1', rows: '1' });
  const [error, setError] = useState('');
  const [pendingMove, setPendingMove] = useState<ExistingContainerPlacement | null>(null);
  const [pendingMoveContainerId, setPendingMoveContainerId] = useState<string | null>(null);

  const containers = useMemo(
    () => Object.values(resources)
      .filter((entry): entry is InventoryResource => entry.type === 'inventory')
      .flatMap((inventory) => (inventory.containers ?? [])
        .filter((container) => (container.kind ?? 'container') === 'container')
        .map((container) => ({
          inventoryId: inventory.id,
          inventoryName: inventory.name,
          container,
        }))),
    [resources],
  );
  const homeResources = useMemo(
    () => Object.values(resources).filter((entry): entry is HomeResource => entry.type === 'home'),
    [resources],
  );
  const existingPlacementsByContainerId = useMemo(() => {
    const placements = new Map<string, ExistingContainerPlacement>();

    for (const home of homeResources) {
      for (const story of home.stories ?? []) {
        for (const placement of story.placedItems) {
          if (placement.kind !== 'container' || placements.has(placement.refId)) continue;
          placements.set(placement.refId, {
            containerId: placement.refId,
            homeId: home.id,
            homeName: home.name,
            storyId: story.id,
            storyName: story.name,
            roomId: null,
            roomName: null,
            placementId: placement.id,
          });
        }

        for (const storyRoom of story.rooms) {
          for (const placement of storyRoom.placedItems) {
            if (placement.kind !== 'container' || placements.has(placement.refId)) continue;
            placements.set(placement.refId, {
              containerId: placement.refId,
              homeId: home.id,
              homeName: home.name,
              storyId: story.id,
              storyName: story.name,
              roomId: storyRoom.id,
              roomName: storyRoom.name,
              placementId: placement.id,
            });
          }
        }
      }
    }

    return placements;
  }, [homeResources]);

  function handleSelectExistingContainer(containerId: string) {
    const existingPlacement = existingPlacementsByContainerId.get(containerId) ?? null;
    if (existingPlacement && (existingPlacement.homeId !== homeId || existingPlacement.roomId !== room.id)) {
      setPendingMove(existingPlacement);
      setPendingMoveContainerId(containerId);
      return;
    }

    setPendingMove(null);
    setPendingMoveContainerId(null);
    onAddExistingContainer(containerId);
  }

  function clearPendingMove() {
    setPendingMove(null);
    setPendingMoveContainerId(null);
  }

  function removePlacementFromSourceHome(source: ExistingContainerPlacement) {
    const sourceHome = homeResources.find((entry) => entry.id === source.homeId);
    if (!sourceHome) return;

    setResource({
      ...sourceHome,
      updatedAt: new Date().toISOString(),
      stories: (sourceHome.stories ?? []).map((story) => {
        if (story.id !== source.storyId) return story;

        if (source.roomId == null) {
          return {
            ...story,
            placedItems: story.placedItems.filter((placement) => placement.id !== source.placementId),
          };
        }

        return {
          ...story,
          rooms: story.rooms.map((storyRoom) => (
            storyRoom.id === source.roomId
              ? {
                ...storyRoom,
                placedItems: storyRoom.placedItems.filter((placement) => placement.id !== source.placementId),
              }
              : storyRoom
          )),
        };
      }),
    });
  }

  function confirmMove() {
    if (!pendingMove || !pendingMoveContainerId) return;

    if (onMoveExistingContainer) {
      onMoveExistingContainer(pendingMoveContainerId, pendingMove);
      clearPendingMove();
      return;
    }

    removePlacementFromSourceHome(pendingMove);
    onAddExistingContainer(pendingMoveContainerId);
    clearPendingMove();
  }

  function normaliseFaceGridInput(draft: FaceGridInputDraft): FaceGridDraft {
    return {
      columns: clampGrid(Number(draft.columns) || 1),
      rows: clampGrid(Number(draft.rows) || 1),
    };
  }

  function updateFaceGrid(face: ContainerFace, patch: Partial<FaceGridInputDraft>) {
    const apply = (current: FaceGridInputDraft): FaceGridInputDraft => ({
      columns: patch.columns ?? current.columns,
      rows: patch.rows ?? current.rows,
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

  function commitFaceGrid(face: ContainerFace) {
    if (face === 'width-depth') {
      setWidthDepthGrid((current) => {
        const next = normaliseFaceGridInput(current);
        return { columns: String(next.columns), rows: String(next.rows) };
      });
      return;
    }
    if (face === 'width-height') {
      setWidthHeightGrid((current) => {
        const next = normaliseFaceGridInput(current);
        return { columns: String(next.columns), rows: String(next.rows) };
      });
      return;
    }
    setDepthHeightGrid((current) => {
      const next = normaliseFaceGridInput(current);
      return { columns: String(next.columns), rows: String(next.rows) };
    });
  }

  function handleCreateRoomContainer() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    const hasAnyDimensions = [width, depth, height].some((value) => value !== '');
    const hasFullDimensions = width !== '' && depth !== '' && height !== ''
      && width > 0 && depth > 0 && height > 0;

    if (hasAnyDimensions && !hasFullDimensions) {
      setError('Width, depth, and height must all be set together.');
      return;
    }

    const nextWidthDepthGrid = normaliseFaceGridInput(widthDepthGrid);
    const nextWidthHeightGrid = normaliseFaceGridInput(widthHeightGrid);
    const nextDepthHeightGrid = normaliseFaceGridInput(depthHeightGrid);

    setWidthDepthGrid({ columns: String(nextWidthDepthGrid.columns), rows: String(nextWidthDepthGrid.rows) });
    setWidthHeightGrid({ columns: String(nextWidthHeightGrid.columns), rows: String(nextWidthHeightGrid.rows) });
    setDepthHeightGrid({ columns: String(nextDepthHeightGrid.columns), rows: String(nextDepthHeightGrid.rows) });

    onCreateRoomContainer({
      id: `room-container-${uuidv4()}`,
      name: name.trim(),
      icon: icon || 'inventory',
      kind: 'container',
      items: [],
      notes: [],
      attachments: [],
      dimensions: hasFullDimensions
        ? { width, depth, height }
        : undefined,
      layoutGrid: {
        xAxis: activeFace,
        columns: nextWidthDepthGrid.columns,
        rows: nextWidthDepthGrid.rows,
        widthDepth: nextWidthDepthGrid,
        widthHeight: nextWidthHeightGrid,
        depthHeight: nextDepthHeightGrid,
      },
    });
  }

  return (
    <PopupShell title="Add Container" onClose={onClose} size="large">
      {mode === 'choose' ? (
        <div className="space-y-4">
          <section className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
            <div>
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">From My Containers</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Use an existing container from any inventory resource.</div>
            </div>
            {containers.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No containers available yet.</p>
            ) : (
              <div className="space-y-2">
                {containers.map(({ inventoryId, inventoryName, container }) => (
                  <button
                    key={`${inventoryId}-${container.id}`}
                    type="button"
                    onClick={() => handleSelectExistingContainer(container.id)}
                    className="flex w-full items-center justify-between rounded-xl border border-gray-200 px-3 py-3 text-left transition-colors hover:bg-white dark:border-gray-700 dark:hover:bg-gray-800/70"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-gray-800">
                        <IconDisplay iconKey={container.icon || 'inventory'} size={22} className="h-5.5 w-5.5 object-contain" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{container.name}</div>
                        <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{inventoryName}</div>
                      </div>
                    </div>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">Add</span>
                  </button>
                ))}
                {pendingMove && pendingMoveContainerId ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                    <div className="font-semibold">This container is currently placed in {pendingMove.homeName} - {pendingMove.roomName ?? 'Outside rooms'}. Move it here?</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={confirmMove} className="rounded-full bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">
                        Confirm
                      </button>
                      <button type="button" onClick={clearPendingMove} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-100 dark:hover:bg-amber-900/50">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
            <div>
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">Create Room Container</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Create a container owned directly by {room.name}.</div>
            </div>
            <button type="button" onClick={() => { setMode('create'); setError(''); }} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Create room container</button>
          </section>
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="flex flex-wrap items-end gap-3">
            <div className="shrink-0">
              <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">Icon</div>
              <IconPicker value={icon} onChange={setIcon} align="left" />
            </div>
            <label className="min-w-[16rem] flex-1 space-y-1">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                placeholder="e.g. Craft bin"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Width</span>
              <input type="number" min={1} value={width} onChange={(event) => setWidth(event.target.value === '' ? '' : Math.max(1, Number(event.target.value) || 1))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Depth</span>
              <input type="number" min={1} value={depth} onChange={(event) => setDepth(event.target.value === '' ? '' : Math.max(1, Number(event.target.value) || 1))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Height</span>
              <input type="number" min={1} value={height} onChange={(event) => setHeight(event.target.value === '' ? '' : Math.max(1, Number(event.target.value) || 1))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
            </label>
          </div>

          <section className="space-y-3 rounded-2xl border border-gray-200 bg-white/80 p-4 dark:border-gray-700 dark:bg-gray-950/30">
            <div>
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">Face Grids</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Set columns and rows independently for each container face.</div>
            </div>

            <div className="space-y-3">
              {FACE_OPTIONS.map((face) => {
                const grid = face.value === 'width-depth'
                  ? widthDepthGrid
                  : face.value === 'width-height'
                    ? widthHeightGrid
                    : depthHeightGrid;

                return (
                  <div key={face.value} className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/40">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{face.label}</div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">Shown first when active face is {face.label.toLowerCase()}.</div>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                        <input
                          type="radio"
                          name="room-container-active-face"
                          checked={activeFace === face.value}
                          onChange={() => setActiveFace(face.value)}
                        />
                        Default face
                      </label>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Columns</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          min={1}
                          max={10}
                          value={grid.columns}
                          onChange={(event) => updateFaceGrid(face.value, { columns: event.target.value.replace(/[^0-9]/g, '') })}
                          onBlur={() => commitFaceGrid(face.value)}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Rows</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          min={1}
                          max={10}
                          value={grid.rows}
                          onChange={(event) => updateFaceGrid(face.value, { rows: event.target.value.replace(/[^0-9]/g, '') })}
                          onBlur={() => commitFaceGrid(face.value)}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {error ? <div className="text-sm text-red-600 dark:text-red-300">{error}</div> : null}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMode('choose')} className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">Back</button>
            <button type="button" onClick={handleCreateRoomContainer} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Create container</button>
          </div>
        </div>
      )}
    </PopupShell>
  );
}