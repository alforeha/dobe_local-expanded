import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { isImageIcon, resolveIcon } from '../../../../constants/iconMap';
import { updateLocationPoint } from '../../../../engine/eventExecution';
import { IconPicker } from '../../../shared/IconPicker';
import type { LocationPointInputFields } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';

interface LocationPointInputProps {
  eventId?: string;
  inputFields: LocationPointInputFields;
  task: Task;
  onComplete: (result: Partial<LocationPointInputFields>) => void;
  onResultChange?: (result: Partial<LocationPointInputFields>) => void;
}

type CaptureState = 'idle' | 'locating' | 'manual' | 'captured';
type PlacementMode = 'move' | null;
type PointPosition = { lat: number; lng: number };

const WORLD_CENTER: L.LatLngExpression = [20, 0];
const WORLD_ZOOM = 2;
const DEFAULT_ICON_KEY = 'task-type-location-point';

function createPointIcon(iconKey: string, isActive: boolean): L.DivIcon {
  const bodyColor = isActive ? '#f59e0b' : '#38bdf8';
  const ringColor = isActive ? '#b45309' : '#0f172a';
  const resolvedIcon = resolveIcon(iconKey);
  const iconMarkup = isImageIcon(resolvedIcon)
    ? `<img src="${resolvedIcon}" alt="" style="width:18px;height:18px;object-fit:contain;" />`
    : `<span style="font-size:16px;line-height:1;">${resolvedIcon}</span>`;

  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:32px;height:44px;filter:drop-shadow(0 8px 18px rgba(15,23,42,0.24));"><svg viewBox="0 0 32 44" width="32" height="44" aria-hidden="true" focusable="false" style="display:block;"><path d="M16 41 C16 41 4.5 28.5 4.5 17.5 C4.5 9.9 9.65 4.5 16 4.5 C22.35 4.5 27.5 9.9 27.5 17.5 C27.5 28.5 16 41 16 41 Z" fill="${bodyColor}" stroke="${ringColor}" stroke-width="3" stroke-linejoin="round" /></svg><div style="position:absolute;left:6px;top:7px;width:20px;height:20px;border-radius:9999px;background:#ffffff;border:2px solid ${ringColor};box-sizing:border-box;display:flex;align-items:center;justify-content:center;overflow:hidden;">${iconMarkup}</div></div>`,
    iconSize: [32, 44],
    iconAnchor: [16, 41],
    popupAnchor: [0, -36],
  });
}

export function LocationPointInput({ eventId, inputFields, task, onComplete, onResultChange }: LocationPointInputProps) {
  const isComplete = task.completionState === 'complete';
  const { label, captureAccuracy } = inputFields;
  const initialIconKey = (task.resultFields as Partial<LocationPointInputFields>).iconKey ?? inputFields.iconKey ?? DEFAULT_ICON_KEY;

  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [geoError, setGeoError] = useState<string | null>(null);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [iconKey, setIconKey] = useState(initialIconKey);
  const [placementMode, setPlacementMode] = useState<PlacementMode>(null);
  const [pendingPosition, setPendingPosition] = useState<PointPosition | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const pendingMarkerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (isComplete) return;

    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);

    onResultChange?.({
      label,
      captureAccuracy,
      iconKey,
      ...(Number.isFinite(lat) ? { lat } : {}),
      ...(Number.isFinite(lng) ? { lng } : {}),
    });
  }, [captureAccuracy, iconKey, isComplete, label, manualLat, manualLng, onResultChange]);

  const previewPosition = useMemo<PointPosition | null>(() => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
    return null;
  }, [manualLat, manualLng]);

  const savedPoint = useMemo<(Partial<LocationPointInputFields> & PointPosition) | null>(() => {
    const saved = task.resultFields as Partial<LocationPointInputFields>;
    if (typeof saved.lat === 'number' && typeof saved.lng === 'number') {
      return { ...saved, lat: saved.lat, lng: saved.lng };
    }
    return null;
  }, [task.resultFields]);

  const selectedIconKey = savedPoint?.iconKey ?? iconKey ?? DEFAULT_ICON_KEY;

  const handleIconChange = (nextIconKey: string) => {
    setIconKey(nextIconKey);

    if (isComplete && savedPoint && eventId) {
      updateLocationPoint(task.id, eventId, {
        ...savedPoint,
        iconKey: nextIconKey,
      });
    }
  };

  const visiblePoint = placementMode === 'move' && pendingPosition
    ? pendingPosition
    : isComplete
      ? savedPoint
      : previewPosition;

  const handleCapture = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by this browser.');
      setCaptureState('manual');
      return;
    }
    setCaptureState('locating');
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCaptureState('captured');
        onComplete({
          label,
          captureAccuracy,
          iconKey,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: captureAccuracy ? pos.coords.accuracy : undefined,
          timestamp: new Date().toISOString(),
        });
      },
      (err) => {
        setGeoError(`Location unavailable: ${err.message}`);
        setCaptureState('manual');
      },
      { timeout: 10000 },
    );
  };

  const handleManualSave = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng)) return;
    onComplete({ label, captureAccuracy, iconKey, lat, lng, timestamp: new Date().toISOString() });
  };

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
    if (!mapRef.current) return;

    if (placementMode !== 'move') {
      mapRef.current.off('click');
      if (pendingMarkerRef.current) {
        pendingMarkerRef.current.remove();
        pendingMarkerRef.current = null;
      }
      return;
    }

    const map = mapRef.current;
    const handleMapClick = (event: L.LeafletMouseEvent) => {
      setPendingPosition({ lat: event.latlng.lat, lng: event.latlng.lng });
    };

    map.off('click');
    map.on('click', handleMapClick);

    if (!pendingPosition) {
      return () => {
        map.off('click', handleMapClick);
      };
    }

    const latLng: L.LatLngExpression = [pendingPosition.lat, pendingPosition.lng];

    if (!pendingMarkerRef.current) {
      pendingMarkerRef.current = L.marker(latLng, {
        zIndexOffset: 1000,
        icon: createPointIcon(selectedIconKey, true),
      }).addTo(map);

      const popupRoot = document.createElement('div');
      const setButton = document.createElement('button');
      setButton.type = 'button';
      setButton.className = 'rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white';
      setButton.textContent = 'Set';
      setButton.addEventListener('click', () => {
        const next = pendingMarkerRef.current?.getLatLng();
        if (!next || !savedPoint || !eventId) return;

        updateLocationPoint(task.id, eventId, {
          ...savedPoint,
          iconKey: selectedIconKey,
          lat: next.lat,
          lng: next.lng,
        });
        setPlacementMode(null);
        setPendingPosition(null);
      });
      popupRoot.appendChild(setButton);

      pendingMarkerRef.current.bindPopup(popupRoot, {
        closeButton: false,
        autoClose: false,
        closeOnClick: false,
        autoPanPadding: [24, 24],
      });
    } else {
      pendingMarkerRef.current.setIcon(createPointIcon(selectedIconKey, true));
      pendingMarkerRef.current.setLatLng(latLng);
    }

    pendingMarkerRef.current.openPopup();

    map.panTo(latLng, { animate: true });

    return () => {
      map.off('click', handleMapClick);
      if (pendingMarkerRef.current) {
        pendingMarkerRef.current.remove();
        pendingMarkerRef.current = null;
      }
    };
  }, [eventId, pendingPosition, placementMode, savedPoint, selectedIconKey, task.id]);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;

    const map = mapRef.current;
    const layer = layerRef.current;
    layer.clearLayers();

    if (!visiblePoint) {
      map.setView(WORLD_CENTER, WORLD_ZOOM);
      return;
    }

    const marker = L.marker([visiblePoint.lat, visiblePoint.lng], {
      icon: createPointIcon(selectedIconKey, placementMode === 'move'),
      zIndexOffset: placementMode === 'move' ? 500 : 300,
    }).addTo(layer);

    if (isComplete && savedPoint) {
      const popupRoot = document.createElement('div');
      popupRoot.className = 'space-y-2';

      const title = document.createElement('p');
      title.className = 'rounded-lg bg-slate-100 px-3 py-2 text-center text-sm font-semibold text-slate-900';
      title.textContent = label || 'Location';
      popupRoot.appendChild(title);

      const details = document.createElement('p');
      details.className = 'text-xs text-slate-700';
      details.textContent = `${savedPoint.lat.toFixed(6)}, ${savedPoint.lng.toFixed(6)}${savedPoint.accuracy !== undefined ? ` · ±${Math.round(savedPoint.accuracy)}m` : ''}`;
      popupRoot.appendChild(details);

      const moveButton = document.createElement('button');
      moveButton.type = 'button';
      moveButton.className = 'w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white';
      moveButton.textContent = 'Move';
      moveButton.addEventListener('click', () => {
        setPendingPosition({ lat: savedPoint.lat!, lng: savedPoint.lng! });
        setPlacementMode('move');
        marker.closePopup();
      });
      popupRoot.appendChild(moveButton);

      marker.bindPopup(popupRoot, {
        closeButton: false,
        autoPanPadding: [24, 24],
      });
    }

    map.setView([visiblePoint.lat, visiblePoint.lng], 15);
  }, [isComplete, label, placementMode, savedPoint, selectedIconKey, visiblePoint]);

  const canSaveManual =
    manualLat.trim() !== '' &&
    manualLng.trim() !== '' &&
    !isNaN(parseFloat(manualLat)) &&
    !isNaN(parseFloat(manualLng));

  return (
    <div className="flex h-full min-h-0 flex-col py-1">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/60">
        <div ref={containerRef} className="h-full min-h-[18rem] w-full" aria-label="Location point map" />

        <div className="pointer-events-none absolute inset-0 z-[700]">
          <div className="pointer-events-auto absolute left-3 top-3">
            <IconPicker value={selectedIconKey} onChange={handleIconChange} align="left" />
          </div>

          <div className="pointer-events-auto absolute right-3 top-3 flex flex-col gap-2">
            {!isComplete && captureState === 'idle' && (
              <button
                type="button"
                onClick={handleCapture}
                className="rounded-full bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition-colors hover:bg-purple-700"
              >
                Capture location
              </button>
            )}

            {!isComplete && captureState === 'locating' && (
              <div className="rounded-full bg-white/92 px-4 py-2 text-sm font-medium text-purple-700 shadow-lg backdrop-blur-sm dark:bg-gray-900/90 dark:text-purple-300">
                Locating…
              </div>
            )}
          </div>

        </div>
      </div>

      {captureState === 'manual' && (
        <div className="mt-3 space-y-2">
          {geoError && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-900/20">
              <span className="mt-0.5 text-amber-500">!</span>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {geoError} Enter coordinates manually.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-0.5 block text-xs text-gray-500">Latitude</label>
              <input
                type="number"
                step="any"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                placeholder="0.000000"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="flex-1">
              <label className="mb-0.5 block text-xs text-gray-500">Longitude</label>
              <input
                type="number"
                step="any"
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value)}
                placeholder="0.000000"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          <button
            type="button"
            disabled={!canSaveManual}
            onClick={handleManualSave}
            className="w-full rounded-lg bg-purple-600 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-40"
          >
            Save location
          </button>
        </div>
      )}
    </div>
  );
}
