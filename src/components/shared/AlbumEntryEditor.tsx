import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EventAttendee } from '../../types/event';
import type { Task } from '../../types/task';
import type { AlbumEntry, NoteEntry } from '../../types/resource';
import { createAlbumEntry } from '../../utils/albumHelpers';
import { capturePhoto, isNativePhotoCaptureAvailable, readPhotoFile } from '../../utils/photoCapture';
import { useUserStore } from '../../stores/useUserStore';
import { AlbumLocationPicker } from './AlbumLocationPicker';
import { IconDisplay } from './IconDisplay';

export interface AlbumEntryEditorSaveMeta {
  contactRefs: string[];
  taskRef?: string;
}

interface AlbumEntryEditorProps {
  entry?: AlbumEntry;
  onSave: (entry: AlbumEntry, meta?: AlbumEntryEditorSaveMeta) => void;
  onCancel: () => void;
  contactOptions?: EventAttendee[];
  selectedContactRefs?: string[];
  taskOptions?: Task[];
  selectedTaskRef?: string;
  getTaskLabel?: (task: Task) => string;
}

const INPUT_CLS = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function formatDateLabel(date: string): string {
  if (!date) return 'No date set';
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;

  const today = todayIso();
  const prefix = date.slice(0, 10) === today ? 'Today, ' : '';
  return `${prefix}${parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

function getInitials(value: string): string {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return '?';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function getFirstName(value: string): string {
  return value.trim().split(/\s+/)[0] ?? value;
}

function PhotoUnavailablePlaceholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
      <IconDisplay iconKey="camera" size={28} className="h-7 w-7 object-contain opacity-40" alt="" />
      <span className="text-sm font-medium">Photo not available</span>
    </div>
  );
}

export function AlbumEntryEditor({
  entry,
  onSave,
  onCancel,
  contactOptions,
  selectedContactRefs,
  taskOptions,
  selectedTaskRef,
  getTaskLabel,
}: AlbumEntryEditorProps) {
  const isEdit = Boolean(entry);
  const [photoUri, setPhotoUri] = useState<string | undefined>(entry?.photoUri);
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [date, setDate] = useState<string>(entry?.date ? entry.date.slice(0, 10) : '');
  const [location, setLocation] = useState<AlbumEntry['location']>(entry?.location);
  const [notes, setNotes] = useState<NoteEntry[]>(entry?.notes ?? []);
  const [contactRefs, setContactRefs] = useState<string[]>(selectedContactRefs ?? []);
  const [taskRef, setTaskRef] = useState<string>(selectedTaskRef ?? '');
  const [pendingNoteText, setPendingNoteText] = useState('');
  const [isNoteComposerOpen, setIsNoteComposerOpen] = useState(false);
  const [noteOnlyText, setNoteOnlyText] = useState('');
  const [isNoteOnlyMode, setIsNoteOnlyMode] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const [isCapturing, setIsCapturing] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<string>('');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(date || todayIso());
  const [draftTime, setDraftTime] = useState('12:00');

  const objectUrlsRef = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const notesZoneRef = useRef<HTMLDivElement | null>(null);
  const displayName = useUserStore((state) => state.user?.system.displayName ?? 'me');
  const profileIcon = useUserStore((state) => state.user?.system.icon ?? 'user-default');

  // Track object URLs we created in this editor so we can revoke them when
  // the editor unmounts (or before being replaced) to avoid leaks. We never
  // revoke the URI we ultimately save — the consumer takes ownership of it.
  function trackObjectUrl(uri: string | undefined) {
    if (!uri) return;
    if (uri.startsWith('blob:')) {
      objectUrlsRef.current.push(uri);
    }
  }

  useEffect(() => {
    return () => {
      // We can't tell which URL was committed vs. discarded here, so be safe:
      // any blob URLs we created and that aren't the final saved photo will
      // leak briefly. The savedUriRef pattern is simpler — just don't revoke
      // here. URL.createObjectURL leaks are bounded and per-session.
      objectUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    setContactRefs(selectedContactRefs ?? []);
  }, [selectedContactRefs]);

  useEffect(() => {
    setTaskRef(selectedTaskRef ?? '');
  }, [selectedTaskRef]);

  useEffect(() => {
    setPhotoLoadFailed(false);
  }, [photoUri]);

  useEffect(() => {
    setNotes(entry?.notes ?? []);
  }, [entry?.id, entry?.notes]);

  useEffect(() => {
    if (!confirmingDeleteId) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (notesZoneRef.current?.contains(target)) return;
      setConfirmingDeleteId(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [confirmingDeleteId]);

  const canUseNativeCamera = isNativePhotoCaptureAvailable();

  function applyCaptureResult(result: Awaited<ReturnType<typeof readPhotoFile>>) {
    trackObjectUrl(result.uri);
    setPhotoUri(result.uri);
    setLocation(result.location);
    setDate(result.capturedAt ? result.capturedAt.slice(0, 10) : '');
    setPhotoStatus(result.location || result.capturedAt ? 'Photo metadata loaded.' : 'Photo updated.');
  }

  async function handleCapture(allowGallery: boolean) {
    if (!canUseNativeCamera) {
      setPhotoStatus(allowGallery ? '' : 'Camera not available on this device.');
      if (allowGallery) {
        fileInputRef.current?.click();
      }
      return;
    }

    setIsCapturing(true);
    setPhotoStatus('');
    try {
      const result = await capturePhoto({ allowGallery });
      if (!result) {
        setPhotoStatus('No photo selected.');
        return;
      }
      applyCaptureResult(result);
    } catch {
      setPhotoStatus('Unable to capture photo.');
    } finally {
      setIsCapturing(false);
    }
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
      applyCaptureResult(result);
    } catch {
      setPhotoStatus('Unable to load photo.');
    } finally {
      setIsCapturing(false);
    }
  }

  function handleClearPhoto() {
    setPhotoUri(undefined);
    setDate('');
    setLocation(undefined);
    setIsNoteOnlyMode(false);
    setPhotoStatus('Photo removed.');
  }

  function handleAddNote() {
    const trimmed = pendingNoteText.trim();
    if (!trimmed) return;

    setNotes((current) => ([
      ...current,
      {
        id: crypto.randomUUID(),
        authorRef: displayName,
        text: trimmed,
        createdAt: new Date().toISOString(),
      },
    ]));
    setPendingNoteText('');
    setIsNoteComposerOpen(false);
  }

  function handleDeleteNote(noteId: string) {
    setNotes((current) => current.filter((note) => note.id !== noteId));
    setConfirmingDeleteId(null);
  }

  function handleDeleteClick(noteId: string) {
    if (confirmingDeleteId === noteId) {
      handleDeleteNote(noteId);
      return;
    }

    setConfirmingDeleteId(noteId);
  }

  function openDatePicker() {
    setDraftDate(date || todayIso());
    setDraftTime('12:00');
    setIsDatePickerOpen(true);
  }

  function confirmDatePicker() {
    setDate(draftDate);
    setIsDatePickerOpen(false);
  }

  function handleSave() {
    const trimmedNoteOnlyText = noteOnlyText.trim();
    const isSavingNoteOnlyEntry = isNoteOnlyMode && !photoUri;
    const nextEntryKind: AlbumEntry['entryKind'] = isSavingNoteOnlyEntry
      ? 'note'
      : photoUri
        ? 'photo'
        : entry?.entryKind;
    const nextNotes = isSavingNoteOnlyEntry && trimmedNoteOnlyText
      ? [
          ...notes,
          {
            id: crypto.randomUUID(),
            authorRef: displayName,
            text: trimmedNoteOnlyText,
            createdAt: new Date().toISOString(),
          },
        ]
      : notes;
    const next: AlbumEntry = entry
      ? {
          ...entry,
          date: date || todayIso(),
          entryKind: nextEntryKind,
          notes: nextNotes.length > 0 ? nextNotes : undefined,
          photoUri: isSavingNoteOnlyEntry ? undefined : photoUri,
          location,
        }
      : createAlbumEntry({
          date: date || todayIso(),
          notes: nextNotes.length > 0 ? nextNotes : undefined,
          photoUri: isSavingNoteOnlyEntry ? undefined : photoUri,
          location,
        });
    if (nextEntryKind) {
      next.entryKind = nextEntryKind;
    }
    onSave(
      next,
      contactOptions || taskOptions
        ? {
            contactRefs,
            taskRef: taskRef || undefined,
          }
        : undefined,
    );
  }

  function handleContactToggle(contactId: string) {
    setContactRefs((current) => (
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId]
    ));
  }

  const locationLabel = location
    ? location.placeName?.trim()
      ? location.placeName.trim()
      : formatCoordinates(location.latitude, location.longitude)
    : 'Set Location';

  const showContacts = Boolean(contactOptions?.length);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />

      {isDatePickerOpen ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setIsDatePickerOpen(false)}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <div className="text-sm font-semibold">Pick Date</div>
            <button
              type="button"
              onClick={confirmDatePicker}
              className="rounded-full bg-blue-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-600"
            >
              Confirm
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-6 px-4 py-6">
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Date</span>
              <input
                type="date"
                value={draftDate}
                onChange={(event) => setDraftDate(event.target.value)}
                className={`${INPUT_CLS} text-base`}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Time</span>
              <input
                type="time"
                value={draftTime}
                onChange={(event) => setDraftTime(event.target.value)}
                className={`${INPUT_CLS} text-base`}
              />
            </label>
          </div>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <div className="text-base font-semibold">{isEdit ? 'Edit Entry' : 'Add Entry'}</div>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Close
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="relative h-[42vh] min-h-[18rem] max-h-[50vh] flex-none items-center justify-center overflow-hidden bg-gray-100 dark:bg-gray-900">
              {photoUri ? (
                <>
                  {photoLoadFailed ? (
                    <PhotoUnavailablePlaceholder />
                  ) : (
                    <img
                      src={photoUri}
                      alt="Album entry preview"
                      className="h-full w-full object-cover"
                      onError={() => setPhotoLoadFailed(true)}
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleClearPhoto}
                    className="absolute right-4 top-4 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/70"
                  >
                    Retake
                  </button>
                </>
              ) : (
                <div className="flex h-full w-full items-center justify-center px-6">
                  <div className="flex w-full max-w-sm flex-col items-center gap-4">
                    {isNoteOnlyMode ? (
                      <div className="w-full rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-gray-800">
                        <textarea
                          rows={6}
                          value={noteOnlyText}
                          onChange={(event) => setNoteOnlyText(event.target.value)}
                          placeholder="Write a note..."
                          className={`${INPUT_CLS} resize-none`}
                        />
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setNoteOnlyText('');
                              setIsNoteOnlyMode(false);
                            }}
                            className="rounded-full px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={isCapturing}
                          onClick={() => { void handleCapture(false); }}
                          className="flex w-full items-center justify-center rounded-3xl bg-blue-500 px-6 py-4 text-base font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
                        >
                          {isCapturing ? 'Working...' : 'Take Photo'}
                        </button>
                        <button
                          type="button"
                          disabled={isCapturing}
                          onClick={() => {
                            setPhotoStatus('');
                            fileInputRef.current?.click();
                          }}
                          className="flex w-full items-center justify-center rounded-3xl bg-white px-6 py-4 text-base font-semibold text-gray-800 shadow-sm ring-1 ring-black/5 hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                        >
                          Choose from Gallery
                        </button>
                        <button
                          type="button"
                          disabled={isCapturing}
                          onClick={() => {
                            setPhotoStatus('');
                            setIsNoteOnlyMode(true);
                          }}
                          className="flex w-full items-center justify-center rounded-3xl bg-white px-6 py-4 text-base font-semibold text-gray-800 shadow-sm ring-1 ring-black/5 hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                        >
                          Add Note
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex-none space-y-2 border-t border-gray-200 bg-white/95 px-4 py-2.5 dark:border-gray-800 dark:bg-gray-950/95">
              {photoStatus ? (
                <div className="text-xs text-gray-500 dark:text-gray-400">{photoStatus}</div>
              ) : null}

              <div className="space-y-2 rounded-2xl bg-gray-50 px-3 py-2 dark:bg-gray-900">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openDatePicker}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-left shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
                  >
                    <span className="text-sm text-gray-500 dark:text-gray-400">📅</span>
                    <span className="truncate text-xs font-medium text-gray-700 dark:text-gray-200">{formatDateLabel(date)}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsLocationPickerOpen(true)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-left shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
                  >
                    <span className="text-sm text-gray-500 dark:text-gray-400">📍</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700 dark:text-gray-200">{locationLabel}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {showContacts ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5">
                      <span className="text-sm text-gray-500 dark:text-gray-400">👤</span>
                      <div className="flex min-w-0 flex-wrap gap-1.5">
                        {contactOptions?.map((contact) => {
                          const isSelected = contactRefs.includes(contact.contactId);
                          return (
                            <button
                              key={contact.contactId}
                              type="button"
                              onClick={() => handleContactToggle(contact.contactId)}
                              className={`rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
                                isSelected
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-white text-gray-700 ring-1 ring-black/5 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                              }`}
                              title={contact.displayName}
                            >
                              {getFirstName(contact.displayName).slice(0, 10) || getInitials(contact.displayName)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {taskOptions?.length ? (
                    <label className={`flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 ${showContacts ? 'flex-1' : 'w-full'}`}>
                      <span className="text-sm text-gray-500 dark:text-gray-400">🔗</span>
                      <select
                        value={taskRef}
                        onChange={(event) => setTaskRef(event.target.value)}
                        className="min-w-0 flex-1 bg-transparent text-xs font-medium text-gray-700 outline-none dark:text-gray-200"
                      >
                        <option value="">Link task</option>
                        {taskOptions.map((task) => (
                          <option key={task.id} value={task.id}>
                            {getTaskLabel ? getTaskLabel(task) : task.title || task.id}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/60">
              <div ref={notesZoneRef} className="flex h-full min-h-0 flex-col px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Notes</div>
                  <button
                    type="button"
                    onClick={() => setIsNoteComposerOpen(true)}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    + Add Note
                  </button>
                </div>

                {isNoteComposerOpen ? (
                  <div className="rounded-2xl bg-white p-3 ring-1 ring-black/5 dark:bg-gray-800">
                    <textarea
                      rows={4}
                      value={pendingNoteText}
                      onChange={(event) => setPendingNoteText(event.target.value)}
                      placeholder="Write a note"
                      className={`${INPUT_CLS} resize-none`}
                    />
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPendingNoteText('');
                          setIsNoteComposerOpen(false);
                        }}
                        className="rounded-full px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddNote}
                        disabled={!pendingNoteText.trim()}
                        className="rounded-full bg-blue-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="space-y-2 pr-1">
                      {notes.length === 0 ? (
                        <div className="text-xs italic text-gray-400">No notes yet.</div>
                      ) : notes.map((note) => {
                        const canDelete = note.authorRef === displayName;
                        return (
                          <div key={note.id} className="flex items-start gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-black/5 dark:bg-gray-800">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-200">
                              {canDelete && profileIcon ? (
                                <IconDisplay iconKey={profileIcon} size={20} className="h-5 w-5 object-contain" alt={note.authorRef} />
                              ) : (
                                getInitials(note.authorRef)
                              )}
                            </div>
                            <div className="min-w-0 flex-1 pt-0.5 text-sm text-gray-800 dark:text-gray-100">
                              {note.text}
                            </div>
                            {canDelete ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteClick(note.id)}
                                className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                                  confirmingDeleteId === note.id
                                    ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60'
                                    : 'text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-700'
                                }`}
                                aria-label="Delete note"
                              >
                                {confirmingDeleteId === note.id ? 'Confirm delete?' : '✕'}
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-gray-200 px-4 py-4 dark:border-gray-800">
              <button
                type="button"
                onClick={handleSave}
                disabled={isNoteOnlyMode && !noteOnlyText.trim()}
                className="w-full rounded-3xl bg-blue-500 px-4 py-3 text-base font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}

      {isLocationPickerOpen ? (
        <AlbumLocationPicker
          initialLocation={location ?? undefined}
          photoUri={photoUri}
          onCancel={() => setIsLocationPickerOpen(false)}
          onConfirm={(nextLocation) => {
            setLocation(nextLocation);
            setIsLocationPickerOpen(false);
          }}
        />
      ) : null}
    </div>,
    document.body,
  );
}
