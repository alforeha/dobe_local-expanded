import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { starterTaskTemplates } from '../../../coach/StarterQuestLibrary';
import { addWaypoint, completeTask, deleteWaypoint, removeTaskFromEvent, updateWaypoint } from '../../../engine/eventExecution';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { resolveTaskDisplayName } from '../../../utils/resolveTaskDisplayName';
import type { LocationTrailInputFields, TaskType, Waypoint } from '../../../types/taskTemplate';

interface TaskRowProps {
  taskId: string;
  eventId: string;
  isEditMode: boolean;
  isSelected: boolean;
  onSelect: (taskId: string) => void;
  onTaskComplete: () => void;
}

function TrailMiniMap({ waypoints }: { waypoints: Waypoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      attributionControl: true,
      zoomControl: true,
    }).setView(waypoints.length > 0 ? [waypoints[0].lat, waypoints[0].lng] : [20, 0], waypoints.length > 0 ? 13 : 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const resizeId = window.setTimeout(() => map.invalidateSize(), 50);

    return () => {
      window.clearTimeout(resizeId);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [waypoints]);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;

    layerRef.current.clearLayers();
    if (waypoints.length === 0) {
      mapRef.current.setView([20, 0], 2);
      return;
    }

    const latLngs = waypoints.map((waypoint): L.LatLngExpression => [waypoint.lat, waypoint.lng]);
    const polyline = L.polyline(latLngs, { color: '#7c3aed', weight: 4, opacity: 0.85 }).addTo(layerRef.current);
    waypoints.forEach((waypoint, index) => {
      L.circleMarker([waypoint.lat, waypoint.lng], {
        radius: 5,
        color: '#4c1d95',
        fillColor: '#a855f7',
        fillOpacity: 0.95,
        weight: 2,
      })
        .bindTooltip(`#${index + 1}`)
        .addTo(layerRef.current!);
    });

    if (waypoints.length === 1) {
      mapRef.current.setView(latLngs[0], 14);
    } else {
      mapRef.current.fitBounds(polyline.getBounds(), { padding: [16, 16] });
    }
  }, [waypoints]);

  return <div ref={containerRef} className="h-48 w-full overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700" />;
}

function isoToLocalInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function localInputToIso(value: string): string {
  if (!value) return new Date().toISOString();
  return new Date(value).toISOString();
}

function createDefaultWaypointDraft(): { lat: string; lng: string; timestamp: string } {
  return {
    lat: '',
    lng: '',
    timestamp: isoToLocalInput(new Date().toISOString()),
  };
}

export function TaskRow({ taskId, eventId, isEditMode, isSelected, onSelect, onTaskComplete }: TaskRowProps) {
  const tasks = useScheduleStore((state) => state.tasks);
  const taskTemplates = useScheduleStore((state) => state.taskTemplates);
  const task = tasks[taskId];
  const template = task?.templateRef ? taskTemplates[task.templateRef] ?? starterTaskTemplates.find((entry) => entry.id === task.templateRef) ?? null : null;

  const taskType = ((task?.isUnique ? task.taskType : template?.taskType) ?? 'CHECK') as TaskType;
  const displayName = task ? resolveTaskDisplayName(task, taskTemplates, starterTaskTemplates) : taskId;
  const stateLabel = task?.completionState === 'complete' ? 'Complete' : task?.completionState === 'skipped' ? 'Skipped' : 'Pending';
  const trailFields = (task?.resultFields ?? {}) as Partial<LocationTrailInputFields>;
  const waypoints = Array.isArray(trailFields.waypoints) ? trailFields.waypoints : [];

  const [expanded, setExpanded] = useState(false);
  const [newWaypoint, setNewWaypoint] = useState(createDefaultWaypointDraft());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState(createDefaultWaypointDraft());

  useEffect(() => {
    if (!expanded) {
      setEditingIndex(null);
    }
  }, [expanded]);

  const handleComplete = () => {
    if (!task || task.completionState === 'complete') return;
    completeTask(taskId, eventId, { resultFields: task.resultFields ?? {} });
    onTaskComplete();
  };

  const handleDeleteTask = () => {
    removeTaskFromEvent(taskId, eventId);
  };

  const handleAddWaypoint = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const lat = Number(newWaypoint.lat);
    const lng = Number(newWaypoint.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    addWaypoint(taskId, eventId, {
      lat,
      lng,
      timestamp: localInputToIso(newWaypoint.timestamp),
    });
    setExpanded(true);
    setNewWaypoint(createDefaultWaypointDraft());
  };

  const beginEditWaypoint = (index: number, waypoint: Waypoint) => {
    setExpanded(true);
    setEditingIndex(index);
    setEditingDraft({
      lat: String(waypoint.lat),
      lng: String(waypoint.lng),
      timestamp: isoToLocalInput(waypoint.timestamp),
    });
  };

  const handleSaveWaypoint = (index: number) => {
    const lat = Number(editingDraft.lat);
    const lng = Number(editingDraft.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    updateWaypoint(taskId, eventId, index, {
      lat,
      lng,
      timestamp: localInputToIso(editingDraft.timestamp),
    });
    setEditingIndex(null);
  };

  const summary = useMemo(() => {
    if (taskType !== 'LOCATION_TRAIL') return null;
    return `${waypoints.length} waypoint${waypoints.length === 1 ? '' : 's'}`;
  }, [taskType, waypoints.length]);

  if (!task) return null;

  return (
    <div className={`border-b border-gray-100 dark:border-gray-700 ${isSelected ? 'bg-purple-50 dark:bg-purple-900/20' : ''}`}>
      <div className="flex items-start gap-3 px-3 py-3">
        {isEditMode ? (
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 cursor-default items-center justify-center rounded-full border text-sm font-semibold opacity-60 ${
              task.completionState === 'complete'
                ? 'border-green-400 bg-green-100 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300'
                : 'border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500'
            }`}
          >
            {task.completionState === 'complete' ? '✓' : '○'}
          </span>
        ) : (
          <button
            type="button"
            onClick={handleComplete}
            disabled={task.completionState === 'complete'}
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors ${
              task.completionState === 'complete'
                ? 'border-green-500 bg-green-500 text-white'
                : 'border-gray-300 text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {task.completionState === 'complete' ? '✓' : '○'}
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            onSelect(taskId);
            if (taskType === 'LOCATION_TRAIL') {
              setExpanded((current) => !current);
            }
          }}
          className="flex min-w-0 flex-1 flex-col items-start text-left"
        >
          <div className="flex w-full items-start justify-between gap-3">
            <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{displayName}</span>
            {!isEditMode && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${task.completionState === 'complete' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                {stateLabel}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">{taskType}</span>
            {summary && <span className="text-xs text-gray-500 dark:text-gray-400">{summary}</span>}
          </div>
        </button>

        {isEditMode && (
          <button
            type="button"
            onClick={handleDeleteTask}
            className="shrink-0 rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Delete
          </button>
        )}
      </div>

      {taskType === 'LOCATION_TRAIL' && expanded && (
        <div className="space-y-3 px-3 pb-3">
          <TrailMiniMap waypoints={waypoints} />

          <form onSubmit={handleAddWaypoint} className="grid gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60 md:grid-cols-[1fr_1fr_1fr_auto]">
            <input type="number" step="any" value={newWaypoint.lat} onChange={(event) => setNewWaypoint((current) => ({ ...current, lat: event.target.value }))} placeholder="Latitude" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            <input type="number" step="any" value={newWaypoint.lng} onChange={(event) => setNewWaypoint((current) => ({ ...current, lng: event.target.value }))} placeholder="Longitude" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            <input type="datetime-local" value={newWaypoint.timestamp} onChange={(event) => setNewWaypoint((current) => ({ ...current, timestamp: event.target.value }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            <button type="submit" className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700">Add</button>
          </form>

          <div className="space-y-2">
            {waypoints.map((waypoint, index) => (
              <div key={`${waypoint.timestamp}-${index}`} className="rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-700">
                {editingIndex === index ? (
                  <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
                    <input type="number" step="any" value={editingDraft.lat} onChange={(event) => setEditingDraft((current) => ({ ...current, lat: event.target.value }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                    <input type="number" step="any" value={editingDraft.lng} onChange={(event) => setEditingDraft((current) => ({ ...current, lng: event.target.value }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                    <input type="datetime-local" value={editingDraft.timestamp} onChange={(event) => setEditingDraft((current) => ({ ...current, timestamp: event.target.value }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                    <button type="button" onClick={() => handleSaveWaypoint(index)} className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-purple-700">Save</button>
                    <button type="button" onClick={() => setEditingIndex(null)} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium text-gray-800 dark:text-gray-100">Waypoint {index + 1}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{waypoint.lat.toFixed(5)}, {waypoint.lng.toFixed(5)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(waypoint.timestamp).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => beginEditWaypoint(index, waypoint)} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">Edit</button>
                      <button type="button" onClick={() => deleteWaypoint(taskId, eventId, index)} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20">Delete</button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {waypoints.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">No waypoints yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}