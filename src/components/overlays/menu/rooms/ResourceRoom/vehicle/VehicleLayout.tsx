import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { v4 as uuidv4 } from 'uuid';
import type { VehicleLayout as VehicleLayoutModel, VehicleLayoutArea, VehicleResource, VehicleZoneInspection } from '../../../../../../types/resource';
import { isInventory } from '../../../../../../types/resource';
import { triggerVehicleInspectionTask } from '../../../../../../engine/resourceEngine';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { VehicleLayoutDiagram } from './VehicleLayoutDiagram';
import { getVehicleLayoutDefinition } from './vehicleLayoutTemplates';

interface VehicleLayoutProps {
  resource: VehicleResource;
  isEditMode?: boolean;
  onLayoutChange?: (layout: VehicleLayoutModel | undefined) => void;
}

const CAMERA_MODULE_SPECIFIER = '@capacitor/camera';

function titleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function formatInspectionDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function withTrimmedInspectionHistory(history: VehicleZoneInspection[]): VehicleZoneInspection[] {
  return [...history].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 10);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
}

function estimateDataUrlSizeBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? '';
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function VehicleLayout({ resource, isEditMode = false, onLayoutChange }: VehicleLayoutProps) {
  const resources = useResourceStore((state) => state.resources);
  const setResource = useResourceStore((state) => state.setResource);
  const inspectionPhotoInputId = useId();
  const inspectionPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(resource.layout?.areas[0]?.zoneId ?? null);
  const [pendingContainerIdByZone, setPendingContainerIdByZone] = useState<Record<string, string>>({});
  const [inspectionFormZoneId, setInspectionFormZoneId] = useState<string | null>(null);
  const [inspectionDraft, setInspectionDraft] = useState<{ result: 'pass' | 'fail'; notes: string; photoUri?: string }>({ result: 'pass', notes: '' });
  const [fullInspectionState, setFullInspectionState] = useState<string | null>(null);
  const [inspectionPhotoStatus, setInspectionPhotoStatus] = useState<string | null>(null);
  const [isInspectionPhotoBusy, setIsInspectionPhotoBusy] = useState(false);

  const layout = resource.layout;
  const definition = layout ? getVehicleLayoutDefinition(layout.template) : null;
  const isNativePlatform = useMemo(() => Capacitor.isNativePlatform(), []);

  const inventoryEntries = useMemo(() => {
    return Object.values(resources)
      .filter(isInventory)
      .flatMap((inventory) =>
        (inventory.containers ?? []).map((container) => ({
          inventoryId: inventory.id,
          inventoryName: inventory.name,
          container,
          locationLink: container.links?.find((link) => link.relationship === 'location'),
        })),
      );
  }, [resources]);

  const containerLookup = useMemo(() => {
    return new Map(
      inventoryEntries.map((entry) => [entry.container.id, entry]),
    );
  }, [inventoryEntries]);

  const eligibleContainers = useMemo(() => {
    return inventoryEntries.filter((entry) => {
      if (!entry.locationLink) return true;
      return entry.locationLink.targetKind === 'vehicle' && entry.locationLink.targetResourceId === resource.id;
    });
  }, [inventoryEntries, resource.id]);

  useEffect(() => {
    if (!layout) {
      setSelectedZoneId(null);
      return;
    }
    if (!selectedZoneId || !layout.areas.some((area) => area.zoneId === selectedZoneId)) {
      setSelectedZoneId(layout.areas[0]?.zoneId ?? null);
    }
  }, [layout, selectedZoneId]);

  if (!layout) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
        Set up vehicle layout in edit mode.
      </div>
    );
  }

  const activeLayout = layout;
  const selectedArea = activeLayout.areas.find((area) => area.zoneId === selectedZoneId) ?? null;
  const fullInspectionTask = (resource.maintenanceTasks ?? []).find((task) => task.taskType === 'CIRCUIT' && task.name === 'Vehicle Inspection') ?? null;

  function setLayout(nextLayout: VehicleLayoutModel) {
    if (isEditMode) {
      onLayoutChange?.(nextLayout);
      return;
    }
    setResource({ ...resource, layout: nextLayout, updatedAt: new Date().toISOString() });
  }

  function updateArea(zoneId: string, patch: Partial<VehicleLayoutArea>) {
    setLayout({
      ...activeLayout,
      areas: activeLayout.areas.map((area) => (area.zoneId === zoneId ? { ...area, ...patch } : area)),
    });
  }

  function assignContainerToArea(zoneId: string, containerId: string) {
    setLayout({
      ...activeLayout,
      areas: activeLayout.areas.map((area) => {
        const filtered = area.containerIds.filter((id) => id !== containerId);
        return area.zoneId === zoneId
          ? { ...area, containerIds: [...filtered, containerId] }
          : { ...area, containerIds: filtered };
      }),
    });
    setPendingContainerIdByZone((prev) => ({ ...prev, [zoneId]: '' }));
  }

  function removeContainerFromArea(zoneId: string, containerId: string) {
    updateArea(zoneId, {
      containerIds: activeLayout.areas.find((area) => area.zoneId === zoneId)?.containerIds.filter((id) => id !== containerId) ?? [],
    });
  }

  function openInspectionForm(zoneId: string) {
    setInspectionFormZoneId(zoneId);
    setInspectionDraft({ result: 'pass', notes: '', photoUri: undefined });
    setInspectionPhotoStatus(null);
  }

  function saveInspection(zoneId: string) {
    const nextEntry: VehicleZoneInspection = {
      id: uuidv4(),
      date: new Date().toISOString().slice(0, 10),
      result: inspectionDraft.result,
      notes: inspectionDraft.notes.trim() || undefined,
      photoUri: inspectionDraft.photoUri,
    };
    const currentArea = activeLayout.areas.find((area) => area.zoneId === zoneId);
    if (!currentArea) return;
    updateArea(zoneId, {
      inspectionHistory: withTrimmedInspectionHistory([nextEntry, ...(currentArea.inspectionHistory ?? [])]),
    });
    setInspectionFormZoneId(null);
    setInspectionDraft({ result: 'pass', notes: '', photoUri: undefined });
    setInspectionPhotoStatus(null);
  }

  async function commitInspectionPhoto(data: { uri: string; sizeBytes: number; source: 'web-upload' | 'camera' | 'gallery' }) {
    if (data.sizeBytes > 200 * 1024) {
      setInspectionPhotoStatus('Photo is larger than 200 KB.');
      return;
    }
    setInspectionDraft((prev) => ({ ...prev, photoUri: data.uri }));
    setInspectionPhotoStatus(data.source === 'web-upload' ? 'Photo added.' : `Photo added from ${data.source}.`);
  }

  async function handleInspectionPhotoFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsInspectionPhotoBusy(true);
    setInspectionPhotoStatus(null);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      await commitInspectionPhoto({
        uri: dataUrl,
        sizeBytes: file.size,
        source: 'web-upload',
      });
    } catch {
      setInspectionPhotoStatus('Unable to load that photo.');
    } finally {
      setIsInspectionPhotoBusy(false);
    }
  }

  async function handleNativeInspectionPhoto(source: 'camera' | 'gallery') {
    if (!isNativePlatform) {
      inspectionPhotoInputRef.current?.click();
      return;
    }

    setIsInspectionPhotoBusy(true);
    setInspectionPhotoStatus(null);

    try {
      const cameraModule = await import(/* @vite-ignore */ CAMERA_MODULE_SPECIFIER);
      const { Camera, CameraResultType, CameraSource } = cameraModule as {
        Camera: {
          getPhoto: (options: Record<string, unknown>) => Promise<Record<string, unknown>>;
        };
        CameraResultType: { DataUrl: string };
        CameraSource: { Camera: string; Photos: string };
      };

      const photo = await Camera.getPhoto({
        quality: 80,
        resultType: CameraResultType.DataUrl,
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      });

      const dataUrl = typeof photo.dataUrl === 'string' ? photo.dataUrl : '';
      if (!dataUrl) {
        setInspectionPhotoStatus('No image was returned.');
        return;
      }

      await commitInspectionPhoto({
        uri: dataUrl,
        sizeBytes: estimateDataUrlSizeBytes(dataUrl),
        source,
      });
    } catch {
      setInspectionPhotoStatus('Camera/gallery is unavailable here. Using upload instead.');
      inspectionPhotoInputRef.current?.click();
    } finally {
      setIsInspectionPhotoBusy(false);
    }
  }

  function triggerFullInspection() {
    const result = triggerVehicleInspectionTask(resource);
    if (result === 'queued') setFullInspectionState('Full inspection queued in GTD.');
    if (result === 'completed') setFullInspectionState('Full inspection was already queued and has been completed.');
    if (result === 'missing') setFullInspectionState('No seeded full inspection task is available for this vehicle yet.');
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-900/60 dark:bg-sky-950/30">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-600 dark:text-sky-300">Overall inspection</p>
            <h4 className="text-sm font-semibold text-sky-900 dark:text-sky-100">Run Full Inspection</h4>
            <p className="text-xs text-sky-700/80 dark:text-sky-200/80">Queue the seeded CIRCUIT task for this vehicle.</p>
          </div>
          <button
            type="button"
            disabled={!fullInspectionTask}
            onClick={triggerFullInspection}
            className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-40"
          >
            Run Full Inspection
          </button>
        </div>
        {fullInspectionState ? (
          <p className="mt-2 text-xs text-sky-700 dark:text-sky-200">{fullInspectionState}</p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Vehicle layout</p>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{titleCase(activeLayout.template)} template</h4>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
        <div className="min-h-[22rem]">
          <VehicleLayoutDiagram
            template={activeLayout.template}
            areas={activeLayout.areas}
            selectedZoneId={selectedZoneId}
            onZoneSelect={setSelectedZoneId}
            isEditMode={isEditMode}
          />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/40">
          {!selectedArea || !definition ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Tap a zone to view details.</p>
          ) : (() => {
            const areaContainers = selectedArea.containerIds.map((containerId) => containerLookup.get(containerId)).filter(Boolean);
            const availableContainers = eligibleContainers.filter((entry) => {
              if (selectedArea.containerIds.includes(entry.container.id)) return false;
              const linkedAreaId = entry.locationLink?.targetAreaId;
              return !linkedAreaId || activeLayout.areas.some((area) => area.zoneId === selectedArea.zoneId && area.containerIds.includes(entry.container.id));
            });
            const lastInspections = withTrimmedInspectionHistory(selectedArea.inspectionHistory ?? []);

            return (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                    <IconDisplay iconKey={selectedArea.icon || 'vehicle'} size={20} className="h-5 w-5 object-contain" alt="" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Zone</p>
                    <h5 className="text-base font-semibold text-gray-900 dark:text-gray-100">{selectedArea.name}</h5>
                    <button
                      type="button"
                      onClick={() => openInspectionForm(selectedArea.zoneId)}
                      className="mt-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:border-blue-300 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200"
                    >
                      Inspect {selectedArea.name}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Containers</p>
                    {isEditMode && selectedArea.allowsContainers ? (
                      <button
                        type="button"
                        onClick={() => setPendingContainerIdByZone((prev) => ({ ...prev, [selectedArea.zoneId]: prev[selectedArea.zoneId] ?? '' }))}
                        className="text-xs font-medium text-blue-500 hover:text-blue-600"
                      >
                        Add container
                      </button>
                    ) : null}
                  </div>

                  {!selectedArea.allowsContainers ? (
                    <p className="text-xs italic text-gray-400">Containers are not supported in this zone.</p>
                  ) : (
                    <>
                      {isEditMode ? (
                        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
                          <select
                            value={pendingContainerIdByZone[selectedArea.zoneId] ?? ''}
                            onChange={(event) => setPendingContainerIdByZone((prev) => ({ ...prev, [selectedArea.zoneId]: event.target.value }))}
                            className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                          >
                            <option value="">Select container</option>
                            {availableContainers.map((entry) => (
                              <option key={entry.container.id} value={entry.container.id}>
                                {entry.container.name} - {entry.inventoryName}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!pendingContainerIdByZone[selectedArea.zoneId]}
                            onClick={() => {
                              const containerId = pendingContainerIdByZone[selectedArea.zoneId];
                              if (!containerId) return;
                              assignContainerToArea(selectedArea.zoneId, containerId);
                            }}
                            className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-40"
                          >
                            Add
                          </button>
                        </div>
                      ) : null}

                      {areaContainers.length === 0 ? (
                        <p className="text-xs italic text-gray-400">No linked containers.</p>
                      ) : areaContainers.map((entry) => {
                        if (!entry) return null;
                        return (
                          <div key={entry.container.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/70">
                            <IconDisplay iconKey={entry.container.icon || 'resource-inventory'} size={14} className="h-3.5 w-3.5 shrink-0 object-contain" alt="" />
                            <span className="flex-1 truncate text-gray-700 dark:text-gray-200">{entry.container.name}</span>
                            <span className="text-xs text-gray-400">{entry.container.items.length} item{entry.container.items.length === 1 ? '' : 's'}</span>
                            {isEditMode ? (
                              <button
                                type="button"
                                onClick={() => removeContainerFromArea(selectedArea.zoneId, entry.container.id)}
                                className="text-xs text-gray-400 hover:text-red-400"
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Inspection history</p>
                    <button
                      type="button"
                      onClick={() => openInspectionForm(selectedArea.zoneId)}
                      className="text-xs font-medium text-blue-500 hover:text-blue-600"
                    >
                      Add inspection
                    </button>
                  </div>

                  {inspectionFormZoneId === selectedArea.zoneId ? (
                    <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
                      <input
                        id={inspectionPhotoInputId}
                        ref={inspectionPhotoInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={handleInspectionPhotoFileChange}
                      />
                      <div className="flex rounded-full bg-white p-1 dark:bg-gray-900">
                        {(['pass', 'fail'] as const).map((result) => (
                          <button
                            key={result}
                            type="button"
                            onClick={() => setInspectionDraft((prev) => ({ ...prev, result }))}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${inspectionDraft.result === result ? (result === 'pass' ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                          >
                            {result === 'pass' ? 'Pass' : 'Fail'}
                          </button>
                        ))}
                      </div>
                      <div className="space-y-3 rounded-lg border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-900/60">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Photo</span>
                          {inspectionDraft.photoUri ? (
                            <button
                              type="button"
                              onClick={() => setInspectionDraft((prev) => ({ ...prev, photoUri: undefined }))}
                              className="text-xs text-gray-400 hover:text-red-400"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>

                        {inspectionDraft.photoUri ? (
                          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950">
                            <img src={inspectionDraft.photoUri} alt="Inspection evidence" className="h-36 w-full object-cover" />
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                            No photo selected
                          </div>
                        )}

                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          <button
                            type="button"
                            onClick={() => inspectionPhotoInputRef.current?.click()}
                            disabled={isInspectionPhotoBusy}
                            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                          >
                            Upload photo
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleNativeInspectionPhoto('camera')}
                            disabled={isInspectionPhotoBusy || !isNativePlatform}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                          >
                            Camera
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleNativeInspectionPhoto('gallery')}
                            disabled={isInspectionPhotoBusy || !isNativePlatform}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                          >
                            Gallery
                          </button>
                        </div>

                        {inspectionPhotoStatus ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400">{inspectionPhotoStatus}</p>
                        ) : null}
                      </div>
                      <textarea
                        value={inspectionDraft.notes}
                        onChange={(event) => setInspectionDraft((prev) => ({ ...prev, notes: event.target.value }))}
                        placeholder="Optional notes"
                        rows={3}
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setInspectionFormZoneId(null)}
                          className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => saveInspection(selectedArea.zoneId)}
                          className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
                        >
                          Save inspection
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {lastInspections.length === 0 ? (
                    <p className="text-xs italic text-gray-400">No inspections recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {lastInspections.map((entry) => (
                        <div key={entry.id} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/70">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{formatInspectionDate(entry.date)}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${entry.result === 'pass' ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-200' : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200'}`}>
                              {entry.result === 'pass' ? 'Pass' : 'Fail'}
                            </span>
                          </div>
                          {entry.photoUri ? (
                            <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950">
                              <img src={entry.photoUri} alt={`${selectedArea.name} inspection`} className="h-28 w-full object-cover" />
                            </div>
                          ) : null}
                          {entry.notes ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{entry.notes}</p> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}