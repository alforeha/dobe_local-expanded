import { useState } from 'react';
import type { LocationPointInputFields } from '../../../../types/taskTemplate';
import type { Task } from '../../../../types/task';

interface LocationPointInputProps {
  inputFields: LocationPointInputFields;
  task: Task;
  onComplete: (result: Partial<LocationPointInputFields>) => void;
}

type CaptureState = 'idle' | 'locating' | 'manual' | 'captured';

export function LocationPointInput({ inputFields, task, onComplete }: LocationPointInputProps) {
  const isComplete = task.completionState === 'complete';
  const { label, captureAccuracy } = inputFields;

  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [geoError, setGeoError] = useState<string | null>(null);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');

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
    onComplete({ label, captureAccuracy, lat, lng, timestamp: new Date().toISOString() });
  };

  if (isComplete) {
    const saved = task.resultFields as Partial<LocationPointInputFields>;
    return (
      <div className="space-y-1 py-2">
        <span className="text-sm font-medium text-green-600 dark:text-green-400">
          ✓ Location captured
        </span>
        {saved.lat !== undefined && (
          <p className="font-mono text-xs text-gray-500 dark:text-gray-400">
            {saved.lat.toFixed(6)}, {saved.lng?.toFixed(6)}
            {saved.accuracy !== undefined ? ` (±${Math.round(saved.accuracy)}m)` : ''}
          </p>
        )}
        {label && <p className="text-xs text-gray-400">{label}</p>}
      </div>
    );
  }

  const canSaveManual =
    manualLat.trim() !== '' &&
    manualLng.trim() !== '' &&
    !isNaN(parseFloat(manualLat)) &&
    !isNaN(parseFloat(manualLng));

  return (
    <div className="space-y-2 py-1">
      {label && <p className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</p>}

      {captureState === 'idle' && (
        <button
          type="button"
          onClick={handleCapture}
          className="w-full rounded-lg bg-purple-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 active:bg-purple-800"
        >
          Capture location
        </button>
      )}

      {captureState === 'locating' && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-purple-200 bg-purple-50 py-3 dark:border-purple-700 dark:bg-purple-900/20">
          <span className="animate-spin text-purple-500">⟳</span>
          <span className="text-sm text-purple-700 dark:text-purple-300">Locating…</span>
        </div>
      )}

      {captureState === 'manual' && (
        <div className="space-y-2">
          {geoError && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-900/20">
              <span className="mt-0.5 text-amber-500">⚠</span>
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
