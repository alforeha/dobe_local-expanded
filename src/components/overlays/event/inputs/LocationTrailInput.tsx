import { useState, useEffect, useRef } from 'react';
import type { LocationTrailInputFields, Waypoint } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';

interface LocationTrailInputProps {
  inputFields: LocationTrailInputFields;
  task: Task;
  onComplete: (result: Partial<LocationTrailInputFields>) => void;
}

type TrailPhase = 'idle' | 'tracking' | 'manual' | 'done';

export function LocationTrailInput({ inputFields, task, onComplete }: LocationTrailInputProps) {
  const isComplete = task.completionState === 'complete';
  const { label, captureInterval } = inputFields;

  const [phase, setPhase] = useState<TrailPhase>('idle');
  const [geoError, setGeoError] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);

  // Manual fallback state
  const [manualStartLat, setManualStartLat] = useState('');
  const [manualStartLng, setManualStartLng] = useState('');
  const [manualEndLat, setManualEndLat] = useState('');
  const [manualEndLng, setManualEndLng] = useState('');

  const intervalRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const collectPoint = () => {
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
  };

  // Interval-based tracking
  useEffect(() => {
    if (phase !== 'tracking') return;
    // Immediate first point
    collectPoint();
    const intervalMs = (captureInterval ?? 30) * 1000;
    intervalRef.current = window.setInterval(collectPoint, intervalMs);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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

  if (isComplete) {
    const saved = task.resultFields as Partial<LocationTrailInputFields>;
    const count = saved.waypoints?.length ?? 0;
    return (
      <div className="space-y-1 py-2">
        <span className="text-sm font-medium text-green-600 dark:text-green-400">
          ✓ Trail recorded
        </span>
        <p className="text-xs text-gray-400">
          {count} waypoint{count !== 1 ? 's' : ''} captured
          {label ? ` · ${label}` : ''}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 py-1">
      {label && <p className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</p>}

      {phase === 'idle' && (
        <button
          type="button"
          onClick={handleStart}
          className="w-full rounded-lg bg-purple-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 active:bg-purple-800"
        >
          Start tracking
        </button>
      )}

      {phase === 'tracking' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2 dark:border-green-700 dark:bg-green-900/20">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
              <span className="text-sm font-medium text-green-700 dark:text-green-300">
                Tracking
              </span>
            </div>
            <span className="text-xs text-green-600 dark:text-green-400">
              {waypoints.length} point{waypoints.length !== 1 ? 's' : ''}
            </span>
          </div>

          <p className="text-xs text-gray-400">
            Recording every {captureInterval ?? 30}s. Press stop when done.
          </p>

          <button
            type="button"
            onClick={handleStop}
            className="w-full rounded-lg bg-red-500 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 active:bg-red-700"
          >
            Stop &amp; save trail
          </button>
        </div>
      )}

      {phase === 'manual' && (
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
