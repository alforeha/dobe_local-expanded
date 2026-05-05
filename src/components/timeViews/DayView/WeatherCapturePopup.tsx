import { useEffect, useRef, useState } from 'react';
import { PopupShell } from '../../shared/popups/PopupShell';
import { IconDisplay } from '../../shared/IconDisplay';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { getAppNowISO } from '../../../utils/dateUtils';
import { appendQAAlbumEntry } from '../../../utils/qaUtils';
import { capturePhoto, isNativePhotoCaptureAvailable, readPhotoFile } from '../../../utils/photoCapture';
import type { QuickActionsEvent, QAAlbumEntry } from '../../../types';

interface WeatherCapturePopupProps {
  qaEvent: QuickActionsEvent;
  onClose: () => void;
}

function formatTemperature(value: number): string {
  return `${value}°`;
}

export function WeatherCapturePopup({ qaEvent, onClose }: WeatherCapturePopupProps) {
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [captureTimestamp, setCaptureTimestamp] = useState<string>(getAppNowISO());
  const [photoStatus, setPhotoStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canUseNativeCamera = isNativePhotoCaptureAvailable();

  useEffect(() => {
    setPreviewFailed(false);
  }, [photoUri]);

  function applyPhotoUri(uri: string, capturedAt?: string) {
    setPhotoUri(uri);
    setCaptureTimestamp(capturedAt ?? getAppNowISO());
    setPhotoStatus('Photo selected.');
  }

  async function handleTakePhoto() {
    if (!canUseNativeCamera) {
      setPhotoStatus('Camera not available on desktop.');
      return;
    }

    setIsCapturing(true);
    setPhotoStatus('');
    try {
      const result = await capturePhoto({ allowGallery: false });
      if (!result) {
        setPhotoStatus('No photo selected.');
        return;
      }
      applyPhotoUri(result.uri, result.capturedAt);
    } catch {
      setPhotoStatus('Unable to capture photo.');
    } finally {
      setIsCapturing(false);
    }
  }

  function handleChooseFromGallery() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) {
      setPhotoStatus('No photo selected.');
      return;
    }

    setIsCapturing(true);
    setPhotoStatus('');
    try {
      const result = await readPhotoFile(file);
      applyPhotoUri(result.uri, result.capturedAt);
    } catch {
      setPhotoStatus('Unable to load photo.');
    } finally {
      setIsCapturing(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);

    try {
      const scheduleStore = useScheduleStore.getState();
      const storedQa = scheduleStore.activeEvents[qaEvent.id] ?? scheduleStore.historyEvents[qaEvent.id];
      const latestQa: QuickActionsEvent = storedQa && storedQa.eventType === 'quickActions'
        ? (storedQa as QuickActionsEvent)
        : qaEvent;
      const albumEntry: QAAlbumEntry = {
        id: crypto.randomUUID(),
        date: captureTimestamp,
        photoUri: photoUri ?? undefined,
        weatherCapture: true,
        weatherSnapshot: latestQa.weatherSnapshot ?? undefined,
        taskRef: undefined,
        notes: [],
        location: undefined,
      };

      scheduleStore.setActiveEvent(appendQAAlbumEntry(latestQa, albumEntry));
      onClose();
    } finally {
      setIsSaving(false);
    }
  }

  const snapshot = qaEvent.weatherSnapshot;

  return (
    <PopupShell title="Weather capture" onClose={onClose}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected}
      />

      <div className="flex min-h-[72vh] flex-col gap-4">
        <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
          {snapshot ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <IconDisplay iconKey={snapshot.icon} size={36} className="h-9 w-9 object-contain" alt="" />
                <div>
                  <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                    {formatTemperature(snapshot.high)}
                  </div>
                </div>
              </div>
              {snapshot.windSpeed !== undefined && (
                <div className="text-sm text-gray-700 dark:text-gray-300">{snapshot.windSpeed} km/h wind</div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400">No weather data for today.</div>
          )}
        </section>

        <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
          {photoUri && !previewFailed ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <img
                src={photoUri}
                alt="Weather capture preview"
                className="min-h-0 flex-1 rounded-xl object-contain"
                onError={() => setPreviewFailed(true)}
              />
              <button
                type="button"
                onClick={handleTakePhoto}
                disabled={isCapturing}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Retake photo
              </button>
            </div>
          ) : (
            <div className="flex h-full flex-col justify-center gap-3">
              <div className="text-sm text-gray-500 dark:text-gray-400">Attach an optional photo to this weather capture.</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleTakePhoto}
                  disabled={isCapturing}
                  className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Take Photo
                </button>
                <button
                  type="button"
                  onClick={handleChooseFromGallery}
                  disabled={isCapturing}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Choose from Gallery
                </button>
              </div>
            </div>
          )}

          {photoStatus && (
            <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">{photoStatus}</div>
          )}
        </section>

        <div className="mt-auto flex justify-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isCapturing}
            className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>
    </PopupShell>
  );
}