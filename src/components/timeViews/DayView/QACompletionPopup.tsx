import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { QAAlbumEntry, QuickActionsCompletion, RollInputFields } from '../../../types';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { IconDisplay } from '../../shared/IconDisplay';
import { PopupShell } from '../../shared/popups/PopupShell';
import { resolveTemplate } from './qaUtils';

interface QACompletionPopupProps {
  completion?: QuickActionsCompletion;
  albumEntry?: QAAlbumEntry;
  onClose: () => void;
}

function formatHHMM(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function resultSummaryPairs(resultFields: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(resultFields)
    .filter(([, value]) => value !== null && value !== undefined && value !== '' && !Array.isArray(value))
    .slice(0, 3)
    .map(([key, value]) => [key, String(value)]);
}

function formatCaptureDate(iso: string): string {
  const parsed = new Date(iso);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  const dayOnly = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dayOnly.getTime())) return iso;
  return dayOnly.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCaptureTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'Time not recorded';
  return parsed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatTemperature(value: number): string {
  return `${value}°`;
}

function PhotoUnavailablePlaceholder() {
  return (
    <div className="flex min-h-[16rem] w-full flex-col items-center justify-center gap-2 rounded-2xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
      <IconDisplay iconKey="camera" size={28} className="h-7 w-7 object-contain opacity-40" alt="" />
      <span className="text-sm font-medium">Photo not available</span>
    </div>
  );
}

function AlbumPhoto({ photoUri }: { photoUri?: string }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [photoUri]);

  if (!photoUri || hasError) {
    return <PhotoUnavailablePlaceholder />;
  }

  return (
    <img
      src={photoUri}
      alt="Weather capture"
      className="w-full rounded-2xl object-contain"
      onError={() => setHasError(true)}
    />
  );
}

export function QACompletionPopup({ completion, albumEntry, onClose }: QACompletionPopupProps) {
  const { tasks, taskTemplates } = useScheduleStore(useShallow((state) => ({
    tasks: state.tasks,
    taskTemplates: state.taskTemplates,
  })));

  if (albumEntry) {
    return (
      <PopupShell title="Weather capture" onClose={onClose}>
        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
          <AlbumPhoto photoUri={albumEntry.photoUri} />

          {albumEntry.weatherSnapshot ? (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
              <div className="flex items-center gap-3">
                <IconDisplay
                  iconKey={albumEntry.weatherSnapshot.icon}
                  size={36}
                  className="h-9 w-9 object-contain"
                  alt=""
                />
                <div>
                  <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                    {formatTemperature(albumEntry.weatherSnapshot.high)}
                  </div>
                  {albumEntry.weatherSnapshot.windSpeed !== undefined && (
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                      {albumEntry.weatherSnapshot.windSpeed} km/h wind
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-700/40">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Date</div>
              <div className="font-semibold text-gray-800 dark:text-gray-200">{formatCaptureDate(albumEntry.date)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Time</div>
              <div className="font-semibold text-gray-800 dark:text-gray-200">{formatCaptureTime(albumEntry.date)}</div>
            </div>
          </div>

          {albumEntry.notes?.length ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Notes</div>
              <div className="space-y-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-700/40">
                {albumEntry.notes.map((note) => (
                  <div key={note.id} className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">
                    {note.text}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <p className="text-xs italic text-gray-400">Read-only - editing not available in LOCAL v1</p>
        </div>
      </PopupShell>
    );
  }

  if (!completion) {
    return null;
  }

  const task = tasks[completion.taskRef];
  const template = task?.templateRef ? resolveTemplate(task.templateRef, taskTemplates) : null;
  const taskName = template?.name ?? (task?.templateRef ?? '—');
  const isRoll = template?.taskType === 'ROLL';

  const rollFields = isRoll && task
    ? (task.resultFields as RollInputFields)
    : null;

  const summaryPairs = !isRoll && task
    ? resultSummaryPairs(task.resultFields as Record<string, unknown>)
    : [];

  return (
    <PopupShell title={taskName} onClose={onClose}>
      <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span>Completed at</span>
          <span className="font-semibold text-gray-700 dark:text-gray-200">
            {formatHHMM(completion.completedAt)}
          </span>
        </div>

        {isRoll && (
          <div className="space-y-2 rounded-lg bg-purple-50 p-3 dark:bg-purple-900/20">
            <div className="flex items-center gap-3">
              <IconDisplay iconKey="task-type-roll" size={30} className="h-[30px] w-[30px] object-contain" alt="" />
              <span className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                {rollFields?.result ?? '—'}
              </span>
            </div>
            {rollFields?.boostApplied && (
              <div className="text-xs text-purple-600 dark:text-purple-400">
                Early bird bonus: <span className="font-semibold">{rollFields.boostApplied}</span>
              </div>
            )}
          </div>
        )}

        {!isRoll && summaryPairs.length > 0 && (
          <div className="space-y-1 rounded bg-gray-50 p-2 dark:bg-gray-700/40">
            {summaryPairs.map(([key, value]) => (
              <div key={key} className="flex justify-between text-xs">
                <span className="capitalize text-gray-500 dark:text-gray-400">{key}</span>
                <span className="font-semibold text-gray-800 dark:text-gray-200">{value}</span>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs italic text-gray-400">Read-only - editing not available in LOCAL v1</p>
      </div>
    </PopupShell>
  );
}
