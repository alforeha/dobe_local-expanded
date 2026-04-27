import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { deleteWaypoint, insertWaypoint, updateWaypoint } from '../../../../engine/eventExecution';
import type { LocationTrailInputFields, Waypoint } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';

interface LocationTrailInputProps {
  eventId?: string;
  inputFields: LocationTrailInputFields;
  task: Task;
  onComplete: (result: Partial<LocationTrailInputFields>) => void;
  onResultChange?: (result: Partial<LocationTrailInputFields>) => void;
}

type TrailPhase = 'idle' | 'tracking' | 'manual' | 'done';
type PlacementMode = 'move' | 'add-after' | null;

const WORLD_CENTER: L.LatLngExpression = [20, 0];
const WORLD_ZOOM = 2;

function createFinishFlagIcon(isSelected: boolean): L.DivIcon {
  const poleColor = isSelected ? '#b45309' : '#0f172a';
  const flagColor = isSelected ? '#f59e0b' : '#ef4444';

  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:20px;height:24px;">
        <div style="position:absolute;left:6px;bottom:0;width:3px;height:22px;border-radius:9999px;background:${poleColor};"></div>
        <div style="position:absolute;left:9px;top:2px;width:10px;height:8px;clip-path:polygon(0 0,100% 25%,0 100%);background:${flagColor};box-shadow:0 0 0 1px rgba(15,23,42,0.08);"></div>
      </div>
    `,
    iconSize: [20, 24],
    iconAnchor: [8, 22],
    popupAnchor: [0, -18],
  });
}

function getDistanceMeters(start: Waypoint, end: Waypoint): number {
  const earthRadiusMeters = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(end.lat - start.lat);
  const deltaLng = toRadians(end.lng - start.lng);
  const startLat = toRadians(start.lat);
  const endLat = toRadians(end.lat);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatTrailDistance(waypoints: Waypoint[]): string | null {
  if (waypoints.length < 2) return null;

  const totalMeters = waypoints.slice(1).reduce((sum, waypoint, index) => {
    return sum + getDistanceMeters(waypoints[index], waypoint);
  }, 0);

  if (totalMeters >= 1000) {
    return `${(totalMeters / 1000).toFixed(2)} km`;
  }

  return `${Math.round(totalMeters)} m`;
}

function getPendingAddPosition(waypoints: Waypoint[], selectedIndex: number): { lat: number; lng: number } | null {
  const current = waypoints[selectedIndex];
  if (!current) return null;

  const next = waypoints[selectedIndex + 1];
  if (next) {
    return {
      lat: (current.lat + next.lat) / 2,
      lng: (current.lng + next.lng) / 2,
    };
  }

  return {
    lat: current.lat + 0.0008,
    lng: current.lng + 0.0008,
  };
}

export function LocationTrailInput({ eventId, inputFields, task, onComplete, onResultChange }: LocationTrailInputProps) {
  const isComplete = task.completionState === 'complete';
  const { label, captureInterval } = inputFields;

  const [phase, setPhase] = useState<TrailPhase>('idle');
  const [geoError, setGeoError] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [mapPlacementMode, setMapPlacementMode] = useState<PlacementMode>(null);
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState<number | null>(null);
  const [pendingWaypointPosition, setPendingWaypointPosition] = useState<{ lat: number; lng: number } | null>(null);

  // Manual fallback state
  const [manualStartLat, setManualStartLat] = useState('');
  const [manualStartLng, setManualStartLng] = useState('');
  const [manualEndLat, setManualEndLat] = useState('');
  const [manualEndLng, setManualEndLng] = useState('');

  const intervalRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragMarkerRef = useRef<L.Marker | null>(null);

  const persistedWaypoints = useMemo(() => {
    const taskWaypoints = (task.resultFields as Partial<LocationTrailInputFields>).waypoints;
    return Array.isArray(taskWaypoints) ? (taskWaypoints ?? []) : [];
  }, [task.resultFields]);
  const visibleWaypoints = isComplete ? persistedWaypoints : waypoints;
  const renderedWaypoints = useMemo(() => {
    if (!isComplete || selectedWaypointIndex === null || !pendingWaypointPosition || !mapPlacementMode) {
      return visibleWaypoints;
    }

    if (mapPlacementMode === 'move') {
      return visibleWaypoints.map((waypoint, index) => (
        index === selectedWaypointIndex
          ? { ...waypoint, lat: pendingWaypointPosition.lat, lng: pendingWaypointPosition.lng }
          : waypoint
      ));
    }

    const insertIndex = selectedWaypointIndex + 1;
    const pendingWaypoint: Waypoint = {
      lat: pendingWaypointPosition.lat,
      lng: pendingWaypointPosition.lng,
      timestamp: new Date().toISOString(),
    };

    return [
      ...visibleWaypoints.slice(0, insertIndex),
      pendingWaypoint,
      ...visibleWaypoints.slice(insertIndex),
    ];
  }, [isComplete, mapPlacementMode, pendingWaypointPosition, selectedWaypointIndex, visibleWaypoints]);
  const trailDistanceLabel = useMemo(() => formatTrailDistance(renderedWaypoints), [renderedWaypoints]);

  useEffect(() => {
    if (isComplete) return;
    onResultChange?.({ label, captureInterval, waypoints });
  }, [captureInterval, isComplete, label, onResultChange, waypoints]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      attributionControl: false,
      zoomControl: false,
    }).setView(WORLD_CENTER, WORLD_ZOOM);

    L.control.attribution({ prefix: false, position: 'bottomleft' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      className: 'cdb-map-tiles',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    const resizeId = window.setTimeout(() => map.invalidateSize(), 50);

    return () => {
      window.clearTimeout(resizeId);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.style.cursor = '';
  }, [mapPlacementMode]);

  useEffect(() => {
    if (!mapRef.current) return;

    if ((mapPlacementMode !== 'move' && mapPlacementMode !== 'add-after') || selectedWaypointIndex === null) {
      if (dragMarkerRef.current) {
        dragMarkerRef.current.remove();
        dragMarkerRef.current = null;
      }
      return;
    }

    const waypoint = persistedWaypoints[selectedWaypointIndex];
    if (!waypoint) return;

    const map = mapRef.current;
    const startPosition: L.LatLngExpression = pendingWaypointPosition
      ? [pendingWaypointPosition.lat, pendingWaypointPosition.lng]
      : (() => {
          if (mapPlacementMode === 'add-after') {
            const pending = getPendingAddPosition(persistedWaypoints, selectedWaypointIndex);
            return pending ? [pending.lat, pending.lng] as L.LatLngExpression : [waypoint.lat, waypoint.lng] as L.LatLngExpression;
          }
          return [waypoint.lat, waypoint.lng] as L.LatLngExpression;
        })();

    if (!dragMarkerRef.current) {
      dragMarkerRef.current = L.marker(startPosition, {
        draggable: true,
        zIndexOffset: 1000,
        icon: L.divIcon({
          className: '',
          html: '<div style="width:20px;height:20px;border-radius:9999px;border:3px solid #f59e0b;background:rgba(245,158,11,0.28);box-shadow:0 8px 24px rgba(15,23,42,0.25);"></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
      }).addTo(map);

      const popupRoot = document.createElement('div');
      popupRoot.className = 'flex';

      const setButton = document.createElement('button');
      setButton.type = 'button';
      setButton.className = 'rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white';
      setButton.textContent = 'Set';
      setButton.addEventListener('click', () => {
        const currentPosition = dragMarkerRef.current?.getLatLng();
        if (!currentPosition || !eventId || selectedWaypointIndex === null) return;

        if (mapPlacementMode === 'move') {
          const currentWaypoint = persistedWaypoints[selectedWaypointIndex];
          if (!currentWaypoint) return;

          updateWaypoint(task.id, eventId, selectedWaypointIndex, {
            lat: currentPosition.lat,
            lng: currentPosition.lng,
            timestamp: currentWaypoint.timestamp,
            accuracy: currentWaypoint.accuracy,
          });
        } else if (mapPlacementMode === 'add-after') {
          insertWaypoint(task.id, eventId, selectedWaypointIndex + 1, {
            lat: currentPosition.lat,
            lng: currentPosition.lng,
            timestamp: new Date().toISOString(),
          });
        }

        setMapPlacementMode(null);
        setSelectedWaypointIndex(null);
        setPendingWaypointPosition(null);
      });

      popupRoot.appendChild(setButton);
      dragMarkerRef.current.bindPopup(popupRoot, {
        closeButton: false,
        autoClose: false,
        closeOnClick: false,
        autoPanPadding: [24, 24],
      });
      dragMarkerRef.current.openPopup();

      dragMarkerRef.current.on('dragend', () => {
        const currentPosition = dragMarkerRef.current?.getLatLng();
        if (!currentPosition) return;
        setPendingWaypointPosition({ lat: currentPosition.lat, lng: currentPosition.lng });
        dragMarkerRef.current?.openPopup();
      });
    } else {
      dragMarkerRef.current.setLatLng(startPosition);
      dragMarkerRef.current.openPopup();
    }

    map.panTo(startPosition, { animate: true });

    return () => {
      if (dragMarkerRef.current) {
        dragMarkerRef.current.remove();
        dragMarkerRef.current = null;
      }
    };
  }, [eventId, mapPlacementMode, pendingWaypointPosition, persistedWaypoints, selectedWaypointIndex, task.id]);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;

    const layer = layerRef.current;
    layer.clearLayers();

    if (visibleWaypoints.length === 0) {
      mapRef.current.setView(WORLD_CENTER, WORLD_ZOOM);
      return;
    }

    const trailColor = getComputedStyle(rootRef.current ?? document.documentElement)
      .getPropertyValue('--map-trail-color')
      .trim() || '#0ea5e9';
    const latLngs = renderedWaypoints.map((waypoint): L.LatLngExpression => [waypoint.lat, waypoint.lng]);
    const polyline = L.polyline(latLngs, {
      color: trailColor,
      opacity: 0.92,
      weight: 4,
    }).addTo(layer);

    visibleWaypoints.forEach((waypoint, index) => {
      const isSelectedWaypoint = selectedWaypointIndex === index && mapPlacementMode === 'move';
      const isFinishWaypoint = index === visibleWaypoints.length - 1;
      const marker: L.Marker | L.CircleMarker = isFinishWaypoint
        ? L.marker([waypoint.lat, waypoint.lng], {
            icon: createFinishFlagIcon(isSelectedWaypoint),
            zIndexOffset: isSelectedWaypoint ? 500 : 300,
          }).addTo(layer)
        : L.circleMarker([waypoint.lat, waypoint.lng], {
            radius: isSelectedWaypoint ? 8 : 6,
            color: '#0f172a',
            fillColor: isSelectedWaypoint ? '#f59e0b' : '#38bdf8',
            fillOpacity: 0.95,
            weight: 2,
          }).addTo(layer);

      if (isComplete && eventId) {
        const popupRoot = document.createElement('div');
        popupRoot.className = 'space-y-2';

        const title = document.createElement('p');
        title.className = 'rounded-lg bg-slate-100 px-3 py-2 text-center text-sm font-semibold text-slate-900';
        title.textContent = `#${index + 1}`;
        popupRoot.appendChild(title);

        const moveRow = document.createElement('div');
        moveRow.className = 'flex';

        const moveButton = document.createElement('button');
        moveButton.type = 'button';
        moveButton.className = 'rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white';
        moveButton.textContent = 'Move';
        moveButton.addEventListener('click', () => {
          setSelectedWaypointIndex(index);
          setPendingWaypointPosition({ lat: waypoint.lat, lng: waypoint.lng });
          setMapPlacementMode('move');
          marker.closePopup();
        });
        moveButton.style.width = '100%';

        moveRow.appendChild(moveButton);

        const actionRow = document.createElement('div');
        actionRow.className = 'flex gap-2';

        const addAfterButton = document.createElement('button');
        addAfterButton.type = 'button';
        addAfterButton.className = 'rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white';
        addAfterButton.textContent = '+';
        addAfterButton.addEventListener('click', () => {
          setSelectedWaypointIndex(index);
          setPendingWaypointPosition(getPendingAddPosition(persistedWaypoints, index));
          setMapPlacementMode('add-after');
          marker.closePopup();
        });
        addAfterButton.style.flex = '1';

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold text-white';
        deleteButton.textContent = 'x';
        deleteButton.addEventListener('click', () => {
          deleteWaypoint(task.id, eventId, index);
          setSelectedWaypointIndex(null);
          setPendingWaypointPosition(null);
          setMapPlacementMode(null);
          marker.closePopup();
        });
        deleteButton.style.flex = '1';

        actionRow.appendChild(addAfterButton);
        actionRow.appendChild(deleteButton);

        popupRoot.appendChild(moveRow);
        popupRoot.appendChild(actionRow);
        marker.bindPopup(popupRoot, { closeButton: false, autoPanPadding: [24, 24] });
      }
    });

    if (pendingWaypointPosition && (mapPlacementMode === 'move' || mapPlacementMode === 'add-after')) {
      mapRef.current.panTo([pendingWaypointPosition.lat, pendingWaypointPosition.lng], { animate: true });
      return;
    }

    if (renderedWaypoints.length === 1) {
      mapRef.current.setView(latLngs[0], 14);
    } else {
      mapRef.current.fitBounds(polyline.getBounds(), { padding: [24, 24] });
    }
  }, [eventId, isComplete, mapPlacementMode, pendingWaypointPosition, persistedWaypoints, renderedWaypoints, selectedWaypointIndex, visibleWaypoints, task.id]);

  useEffect(() => {
    if (!mapRef.current) return undefined;

    const map = mapRef.current;
    const handleMapClick = (event: L.LeafletMouseEvent) => {
      if (!eventId || !isComplete || mapPlacementMode !== 'add-after' || selectedWaypointIndex === null) return;

      setPendingWaypointPosition({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [eventId, isComplete, mapPlacementMode, selectedWaypointIndex]);

  const collectPoint = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const wp: Waypoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: new Date().toISOString(),
          accuracy: pos.coords.accuracy,
        };
        setWaypoints((prev) => [...prev, wp]);
      },
      () => {
        // Silently skip failed waypoints during tracking
      },
      { timeout: 5000 },
    );
  }, []);

  // Interval-based tracking
  useEffect(() => {
    if (phase !== 'tracking') return;
    collectPoint();
    const intervalMs = (captureInterval ?? 30) * 1000;
    intervalRef.current = window.setInterval(collectPoint, intervalMs);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [captureInterval, collectPoint, phase]);

  const handleStart = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by this browser.');
      setPhase('manual');
      return;
    }
    setGeoError(null);
    setWaypoints([]);
    setPhase('tracking');
  };

  const handleStop = () => {
    setPhase('done');
    if (!firedRef.current) {
      firedRef.current = true;
      onComplete({ label, captureInterval, waypoints });
    }
  };

  const handleCancelMove = () => {
    setMapPlacementMode(null);
    setPendingWaypointPosition(null);
    setSelectedWaypointIndex(null);
  };

  const canSaveManual =
    manualStartLat.trim() !== '' &&
    manualStartLng.trim() !== '' &&
    manualEndLat.trim() !== '' &&
    manualEndLng.trim() !== '' &&
    !isNaN(parseFloat(manualStartLat)) &&
    !isNaN(parseFloat(manualStartLng)) &&
    !isNaN(parseFloat(manualEndLat)) &&
    !isNaN(parseFloat(manualEndLng));

  const handleManualSave = () => {
    if (!canSaveManual) return;
    const now = new Date().toISOString();
    const pts: Waypoint[] = [
      { lat: parseFloat(manualStartLat), lng: parseFloat(manualStartLng), timestamp: now },
      { lat: parseFloat(manualEndLat), lng: parseFloat(manualEndLng), timestamp: now },
    ];
    if (!firedRef.current) {
      firedRef.current = true;
      onComplete({ label, captureInterval, waypoints: pts });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col py-1">
      <div ref={rootRef} className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/60">
        <div ref={containerRef} className="h-full min-h-[18rem] w-full" aria-label="Location trail map" />

        <div className="pointer-events-none absolute inset-0 z-[700]">
          <div className="pointer-events-auto absolute right-3 top-3 flex flex-col gap-2">
            {!isComplete && phase !== 'tracking' && phase !== 'manual' && (
              <button
                type="button"
                onClick={handleStart}
                className="rounded-full bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition-colors hover:bg-purple-700"
              >
                Start tracking
              </button>
            )}

            {!isComplete && phase === 'tracking' && (
              <button
                type="button"
                onClick={handleStop}
                className="rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white shadow-lg transition-colors hover:bg-red-600"
              >
                Stop &amp; save trail
              </button>
            )}

          </div>

          {mapPlacementMode && (
            <div className="pointer-events-none absolute left-3 top-14 rounded-xl bg-white/92 px-3 py-2 text-xs font-medium text-gray-700 shadow-sm backdrop-blur-sm dark:bg-gray-900/90 dark:text-gray-100">
              {mapPlacementMode === 'move' && 'Drag the ghost marker, then tap Set.'}
              {mapPlacementMode === 'add-after' && 'Drag the new waypoint, then tap Set.'}
            </div>
          )}

          {(mapPlacementMode === 'move' || mapPlacementMode === 'add-after') && pendingWaypointPosition && (
            <div className="pointer-events-auto absolute left-3 bottom-3 flex items-center gap-2 rounded-2xl bg-white/94 px-3 py-3 shadow-lg backdrop-blur-sm dark:bg-gray-900/92">
              <button
                type="button"
                onClick={handleCancelMove}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
            </div>
          )}

          {trailDistanceLabel && (
            <div className="pointer-events-none absolute bottom-3 right-3 rounded-xl bg-white/92 px-3 py-2 text-xs font-semibold text-gray-800 shadow-sm backdrop-blur-sm dark:bg-gray-900/90 dark:text-gray-100">
              {trailDistanceLabel}
            </div>
          )}
        </div>
      </div>

      {!isComplete && phase === 'manual' && (
        <div className="space-y-2">
          {geoError && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-900/20">
              <span className="mt-0.5 text-amber-500">⚠</span>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {geoError} Enter start and end coordinates manually.
              </p>
            </div>
          )}

          {/* Start point */}
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Start point</p>
          <div className="flex gap-2">
            <input
              type="number"
              step="any"
              value={manualStartLat}
              onChange={(e) => setManualStartLat(e.target.value)}
              placeholder="Lat"
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
            <input
              type="number"
              step="any"
              value={manualStartLng}
              onChange={(e) => setManualStartLng(e.target.value)}
              placeholder="Lng"
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>

          {/* End point */}
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">End point</p>
          <div className="flex gap-2">
            <input
              type="number"
              step="any"
              value={manualEndLat}
              onChange={(e) => setManualEndLat(e.target.value)}
              placeholder="Lat"
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
            <input
              type="number"
              step="any"
              value={manualEndLng}
              onChange={(e) => setManualEndLng(e.target.value)}
              placeholder="Lng"
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>

          <button
            type="button"
            disabled={!canSaveManual}
            onClick={handleManualSave}
            className="w-full rounded-lg bg-purple-600 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-40"
          >
            Save trail
          </button>
        </div>
      )}
    </div>
  );
}
