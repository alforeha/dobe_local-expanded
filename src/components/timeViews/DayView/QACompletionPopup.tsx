import { useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { QAAlbumEntry, QuickActionsCompletion, RollInputFields } from '../../../types';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { useResourceStore } from '../../../stores/useResourceStore';
import { IconDisplay } from '../../shared/IconDisplay';
import { PopupShell } from '../../shared/popups/PopupShell';
import { TaskTypeInputRenderer } from '../../overlays/event/TaskTypeInputRenderer';
import { readPhotoFile } from '../../../utils/photoCapture';
import { resolveTemplate } from './qaUtils';
import type { InputFields } from '../../../types/taskTemplate';
import { starterTaskTemplates } from '../../../coach/StarterQuestLibrary';
import { resolveTaskDisplayName } from '../../../utils/resolveTaskDisplayName';
import type { Resource } from '../../../types/resource';
import type { Task } from '../../../types/task';

interface QACompletionPopupProps {
  qaEventId: string;
  completion?: QuickActionsCompletion;
  albumEntry?: QAAlbumEntry;
  onClose: () => void;
}

const HIDDEN_RESULT_KEYS = new Set([
  'resourceTaskId',
  'dueDate',
  'resourceRef',
  'linkedAccountId',
  'linkedAccountIcon',
]);

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

function getTaskIconKey(task: Task | undefined): string | null {
  const icon = (task as { icon?: unknown } | undefined)?.icon;
  return typeof icon === 'string' && icon.trim().length > 0 ? icon.trim() : null;
}

function formatResultLabel(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (value) => value.toUpperCase());
}

function formatScalarResultValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function getVisibleResourceResultPairs(resultFields: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(resultFields)
    .filter(([key, value]) => !HIDDEN_RESULT_KEYS.has(key) && !Array.isArray(value))
    .map(([key, value]) => [key, formatScalarResultValue(value)] as const)
    .filter((entry): entry is [string, string] => entry[1] !== null);
}

function getTransactionAmountPrefix(resource: Resource | null): string {
  if (resource?.type !== 'account') return '$ ';
  const { kind, cryptoTicker } = resource;
  if (kind === 'bill' || kind === 'subscription' || kind === 'debt' || kind === 'allowance') return '- ';
  if (kind === 'income') return '+ ';
  return `${cryptoTicker?.trim() || '$'} `;
}

function formatTransactionAmount(resource: Resource | null, amount: number): string {
  return `${getTransactionAmountPrefix(resource)}${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
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

function combineDateAndTime(iso: string, timeValue: string): string {
  const datePart = iso.slice(0, 10);
  const parsed = new Date(`${datePart}T${timeValue}:00`);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }

  return parsed.toISOString();
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
  const [failedPhotoUri, setFailedPhotoUri] = useState<string | null>(null);

  if (!photoUri || failedPhotoUri === photoUri) {
    return <PhotoUnavailablePlaceholder />;
  }

  return (
    <img
      src={photoUri}
      alt="Weather capture"
      className="w-full rounded-2xl object-contain"
      onError={() => setFailedPhotoUri(photoUri)}
    />
  );
}

export function QACompletionPopup({ qaEventId, completion, albumEntry, onClose }: QACompletionPopupProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftCompletionTime, setDraftCompletionTime] = useState(completion ? formatHHMM(completion.completedAt) : '');
  const [draftResultFields, setDraftResultFields] = useState<Partial<InputFields>>({});
  const [confirmDeleteCompletion, setConfirmDeleteCompletion] = useState(false);
  const [draftAlbumTime, setDraftAlbumTime] = useState(albumEntry ? formatHHMM(albumEntry.date) : '');
  const [draftPhotoUri, setDraftPhotoUri] = useState<string | undefined>(albumEntry?.photoUri);
  const [isLoadingPhoto, setIsLoadingPhoto] = useState(false);
  const [photoStatus, setPhotoStatus] = useState('');
  const [confirmDeleteAlbum, setConfirmDeleteAlbum] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

	  const {
	    tasks,
	    taskTemplates,
	    updateQACompletion,
    removeQACompletion,
    updateQAAlbumEntry,
	    removeQAAlbumEntry,
	  } = useScheduleStore(useShallow((state) => ({
	    tasks: state.tasks,
	    taskTemplates: state.taskTemplates,
    updateQACompletion: state.updateQACompletion,
    removeQACompletion: state.removeQACompletion,
    updateQAAlbumEntry: state.updateQAAlbumEntry,
	    removeQAAlbumEntry: state.removeQAAlbumEntry,
	  })));
	  const resources = useResourceStore((state) => state.resources);

  function beginCompletionEdit() {
    if (!completion) return;
    setDraftCompletionTime(formatHHMM(completion.completedAt));
    setDraftResultFields((tasks[completion.taskRef]?.resultFields ?? {}) as Partial<InputFields>);
    setConfirmDeleteCompletion(false);
    setIsEditing(true);
  }

  function cancelCompletionEdit() {
    if (completion) {
      setDraftCompletionTime(formatHHMM(completion.completedAt));
      setDraftResultFields((tasks[completion.taskRef]?.resultFields ?? {}) as Partial<InputFields>);
    }
    setConfirmDeleteCompletion(false);
    setIsEditing(false);
  }

  function saveCompletionEdit() {
    if (!completion) return;
    updateQACompletion(
      qaEventId,
      completion.taskRef,
      combineDateAndTime(completion.completedAt, draftCompletionTime),
      draftResultFields,
    );
    setIsEditing(false);
    onClose();
  }

  function handleCompletionDelete() {
    if (!completion) return;
    if (!confirmDeleteCompletion) {
      setConfirmDeleteCompletion(true);
      return;
    }
    removeQACompletion(qaEventId, completion.taskRef);
    onClose();
  }

  function beginAlbumEdit() {
    if (!albumEntry) return;
    setDraftAlbumTime(formatHHMM(albumEntry.date));
    setDraftPhotoUri(albumEntry.photoUri);
    setPhotoStatus('');
    setConfirmDeleteAlbum(false);
    setIsEditing(true);
  }

  function cancelAlbumEdit() {
    if (albumEntry) {
      setDraftAlbumTime(formatHHMM(albumEntry.date));
      setDraftPhotoUri(albumEntry.photoUri);
    }
    setPhotoStatus('');
    setConfirmDeleteAlbum(false);
    setIsEditing(false);
  }

  function saveAlbumEdit() {
    if (!albumEntry) return;
    updateQAAlbumEntry(qaEventId, albumEntry.id, {
      photoUri: draftPhotoUri,
      date: combineDateAndTime(albumEntry.date, draftAlbumTime),
    });
    setIsEditing(false);
    onClose();
  }

  function handleAlbumDelete() {
    if (!albumEntry) return;
    if (!confirmDeleteAlbum) {
      setConfirmDeleteAlbum(true);
      return;
    }
    removeQAAlbumEntry(qaEventId, albumEntry.id);
    onClose();
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) {
      setPhotoStatus('No photo selected.');
      return;
    }

    setIsLoadingPhoto(true);
    setPhotoStatus('');
    try {
      const result = await readPhotoFile(file);
      setDraftPhotoUri(result.uri);
      setPhotoStatus('Photo updated.');
    } catch {
      setPhotoStatus('Unable to load photo.');
    } finally {
      setIsLoadingPhoto(false);
    }
  }

  if (albumEntry) {
    return (
      <PopupShell
        title="Weather capture"
        onClose={onClose}
        headerRight={!isEditing ? (
          <button
            type="button"
            onClick={beginAlbumEdit}
            className="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Edit
          </button>
        ) : undefined}
      >
        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
          <AlbumPhoto photoUri={isEditing ? draftPhotoUri : albumEntry.photoUri} />

          {isEditing && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelected}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoadingPhoto}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {draftPhotoUri ? 'Replace photo' : 'Retake photo'}
                </button>
              </div>

              {photoStatus ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">{photoStatus}</p>
              ) : null}

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Time</span>
                <input
                  type="time"
                  value={draftAlbumTime}
                  onChange={(event) => setDraftAlbumTime(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </label>
            </>
          )}

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

          {isEditing && (
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={saveAlbumEdit}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
              >
                Save
              </button>
              <button
                type="button"
                onClick={cancelAlbumEdit}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAlbumDelete}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${confirmDeleteAlbum
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20'
                }`}
              >
                {confirmDeleteAlbum ? 'Confirm delete?' : 'Delete'}
              </button>
            </div>
          )}
        </div>
      </PopupShell>
    );
  }

  if (!completion) {
    return null;
  }

	  const task = tasks[completion.taskRef];
	  const template = task?.templateRef ? resolveTemplate(task.templateRef, taskTemplates) : null;
	  const taskName = task ? resolveTaskDisplayName(task, taskTemplates, starterTaskTemplates) : '—';
	  const taskIconKey = getTaskIconKey(task);
	  const isResourceTask = Boolean(task?.resourceRef || ((task?.resultFields as Record<string, unknown> | undefined)?.resourceTaskId));
	  const resource = task?.resourceRef ? resources[task.resourceRef] ?? null : null;
	  const resourceResultFields = (task?.resultFields ?? {}) as Record<string, unknown>;
	  const isTransactionLogTask = isResourceTask && (task?.title === 'Transaction Log' || taskName === 'Transaction Log');
	  const linkedAccountIcon = typeof resourceResultFields.linkedAccountIcon === 'string' ? resourceResultFields.linkedAccountIcon : null;
	  const linkedAccountName = typeof resourceResultFields.linkedAccountName === 'string'
	    ? resourceResultFields.linkedAccountName.trim()
	    : '';
	  const linkedDirection = resourceResultFields.direction === 'deposit' || resourceResultFields.direction === 'withdrawal'
	    ? resourceResultFields.direction
	    : null;
	  const transactionNote = typeof resourceResultFields.note === 'string'
	    ? resourceResultFields.note.trim()
	    : '';
	  const transactionAmount = typeof resourceResultFields.amount === 'number' ? resourceResultFields.amount : null;
	  const transactionNewBalance = typeof resourceResultFields.newBalance === 'number' ? resourceResultFields.newBalance : null;
	  const visibleResourcePairs = getVisibleResourceResultPairs(resourceResultFields).filter(([key]) => {
	    if (isTransactionLogTask) {
	      return !['amount', 'note', 'value', 'linkedAccountName', 'direction', 'newBalance'].includes(key);
	    }
	    return true;
	  });
	  const isRoll = template?.taskType === 'ROLL';

  const rollFields = isRoll && task
    ? (task.resultFields as RollInputFields)
    : null;

  const summaryPairs = !isRoll && task
    ? resultSummaryPairs(task.resultFields as Record<string, unknown>)
    : [];
  const taskForEditing = task
    ? {
        ...task,
        completionState: 'pending' as const,
        resultFields: {
          ...task.resultFields,
          ...draftResultFields,
        },
      }
    : null;

	  return (
	    <PopupShell
	      title={!isEditing && isResourceTask
	        ? (
	          <div className="space-y-1">
	            <div className="flex items-center gap-3">
	              {resource ? (
	                <IconDisplay
	                  iconKey={resource.icon}
	                  size={24}
	                  className="h-6 w-6 object-contain"
	                  alt=""
	                />
	              ) : null}
	              <div className="min-w-0 text-lg font-semibold text-gray-900 dark:text-gray-100">
	                {resource?.name ?? taskName}
	              </div>
	            </div>
	            <div className="text-xs text-gray-500 dark:text-gray-400">
	              Completed at <span className="font-semibold text-gray-700 dark:text-gray-200">{formatHHMM(completion.completedAt)}</span>
	            </div>
	          </div>
	        )
	        : taskName}
	      onClose={onClose}
	      headerRight={!isEditing ? (
	        <button
	          type="button"
          onClick={beginCompletionEdit}
          className="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Edit
        </button>
      ) : undefined}
    >
      <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
        {isEditing ? (
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Time</span>
            <input
              type="time"
              value={draftCompletionTime}
              onChange={(event) => setDraftCompletionTime(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
        ) : (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span>Completed at</span>
            <span className="font-semibold text-gray-700 dark:text-gray-200">
              {formatHHMM(completion.completedAt)}
            </span>
          </div>
        )}

        {!isEditing && isRoll && (
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

	        {!isEditing && isResourceTask && (
	          <div className="space-y-3">
	            <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-700/40">
	              <div className="flex items-center gap-3">
	                <IconDisplay
	                  iconKey={taskIconKey || 'task'}
	                  size={24}
	                  className="h-6 w-6 object-contain"
	                  alt=""
	                />
	                <div className="font-semibold text-gray-900 dark:text-gray-100">{taskName}</div>
	              </div>
	            </div>

	            {isTransactionLogTask ? (
	              <div className="space-y-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-700/40">
	                {transactionAmount !== null ? (
	                  <div className="flex items-center justify-between gap-3">
	                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Amount</span>
	                    <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
	                      {formatTransactionAmount(resource, transactionAmount)}
	                    </span>
	                  </div>
	                ) : null}

	                {transactionNewBalance !== null ? (
	                  <div className="flex items-center justify-between gap-3">
	                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">New balance</span>
	                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
	                      {formatTransactionAmount(resource, transactionNewBalance)}
	                    </span>
	                  </div>
	                ) : null}

	                {linkedDirection && linkedAccountName && linkedAccountIcon ? (
	                  <div className="space-y-1">
	                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
	                      {linkedDirection === 'deposit' ? 'Deposited into' : 'Withdrawn from'}
	                    </div>
	                    <div className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-gray-800 shadow-sm dark:bg-gray-800 dark:text-gray-100">
	                      <IconDisplay
	                        iconKey={linkedAccountIcon}
	                        size={18}
	                        className="h-[18px] w-[18px] object-contain"
	                        alt=""
	                      />
	                      <span>{linkedAccountName}</span>
	                    </div>
	                  </div>
	                ) : null}

	                {transactionNote ? (
	                  <div className="space-y-1">
	                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Note</div>
	                    <div className="rounded-lg bg-white px-3 py-2 text-sm text-gray-800 shadow-sm dark:bg-gray-800 dark:text-gray-100">
	                      {transactionNote}
	                    </div>
	                  </div>
	                ) : null}

	                {visibleResourcePairs.length > 0 ? (
	                  <div className="space-y-2">
	                    {visibleResourcePairs.map(([key, value]) => (
	                      <div key={key} className="flex justify-between gap-3 text-sm">
	                        <span className="text-gray-500 dark:text-gray-400">{formatResultLabel(key)}</span>
	                        <span className="text-right font-medium text-gray-800 dark:text-gray-100">{value}</span>
	                      </div>
	                    ))}
	                  </div>
	                ) : null}
	              </div>
	            ) : visibleResourcePairs.length > 0 ? (
	              <div className="space-y-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-700/40">
	                {visibleResourcePairs.map(([key, value]) => (
	                  <div key={key} className="flex justify-between gap-3 text-sm">
	                    <span className="text-gray-500 dark:text-gray-400">{formatResultLabel(key)}</span>
	                    <span className="text-right font-medium text-gray-800 dark:text-gray-100">{value}</span>
	                  </div>
	                ))}
	              </div>
	            ) : (
	              <div className="text-xs italic text-gray-400">No additional details recorded.</div>
	            )}
	          </div>
	        )}

	        {!isEditing && !isResourceTask && !isRoll && summaryPairs.length > 0 && (
	          <div className="space-y-1 rounded bg-gray-50 p-2 dark:bg-gray-700/40">
	            {summaryPairs.map(([key, value]) => (
	              <div key={key} className="flex justify-between text-xs">
                <span className="capitalize text-gray-500 dark:text-gray-400">{key}</span>
                <span className="font-semibold text-gray-800 dark:text-gray-200">{value}</span>
              </div>
            ))}
          </div>
        )}

        {isEditing && template && taskForEditing ? (
          <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
            <TaskTypeInputRenderer
              taskType={template.taskType}
              template={template}
              task={taskForEditing}
              onComplete={(result) => setDraftResultFields((current) => ({ ...current, ...result }))}
              onResultChange={(result) => setDraftResultFields((current) => ({ ...current, ...result }))}
              hideSubmit
            />
          </div>
        ) : null}

        {isEditing && !template ? (
          <p className="text-xs italic text-gray-400">Task input unavailable for this completion.</p>
        ) : null}

        {isEditing && (
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={saveCompletionEdit}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancelCompletionEdit}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCompletionDelete}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${confirmDeleteCompletion
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20'
              }`}
            >
              {confirmDeleteCompletion ? 'Confirm delete?' : 'Delete'}
            </button>
          </div>
        )}
      </div>
    </PopupShell>
  );
}
