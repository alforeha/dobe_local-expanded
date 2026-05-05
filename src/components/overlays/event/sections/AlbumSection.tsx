import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { taskTemplateLibrary } from '../../../../coach';
import { useScheduleStore } from '../../../../stores/useScheduleStore';
import type { Event, EventAlbumEntry } from '../../../../types';
import type { AlbumEntry } from '../../../../types/resource';
import { resolveTaskDisplayName } from '../../../../utils/resolveTaskDisplayName';
import { AlbumEntryEditor, type AlbumEntryEditorSaveMeta } from '../../../shared/AlbumEntryEditor';
import { AlbumViewer } from '../../../shared/AlbumViewer';

interface AlbumSectionProps {
  event: Event;
  addRequestNonce?: number;
}

export function AlbumSection({ event, addRequestNonce = 0 }: AlbumSectionProps) {
  const updateEvent = useScheduleStore((state) => state.updateEvent);
  const tasks = useScheduleStore((state) => state.tasks);
  const taskTemplates = useScheduleStore((state) => state.taskTemplates);
  const [isCreatingEntry, setIsCreatingEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<EventAlbumEntry | null>(null);
  const lastHandledAddRequestRef = useRef(addRequestNonce);

  const albumEntries = useMemo(() => event.eventAlbum ?? [], [event.eventAlbum]);
  const taskOptions = useMemo(
    () => event.tasks.map((taskId) => tasks[taskId]).filter((task): task is NonNullable<typeof task> => Boolean(task)),
    [event.tasks, tasks],
  );

  useEffect(() => {
    let openTimer: ReturnType<typeof setTimeout> | null = null;

    if (addRequestNonce > lastHandledAddRequestRef.current) {
      openTimer = setTimeout(() => {
        setEditingEntry(null);
        setIsCreatingEntry(true);
      }, 0);
    }

    lastHandledAddRequestRef.current = addRequestNonce;

    return () => {
      if (openTimer !== null) {
        clearTimeout(openTimer);
      }
    };
  }, [addRequestNonce]);

  const persistAlbum = useCallback((nextAlbum: EventAlbumEntry[]) => {
    updateEvent(event.id, { eventAlbum: nextAlbum });
  }, [event.id, updateEvent]);

  const getTaskLabel = useCallback((task: (typeof taskOptions)[number]) => (
    resolveTaskDisplayName(task, taskTemplates, taskTemplateLibrary)
  ), [taskTemplates]);

  const handleEditEntry = useCallback((entry: AlbumEntry) => {
    setIsCreatingEntry(false);
    setEditingEntry(entry as EventAlbumEntry);
  }, []);

  const handleDeleteEntry = useCallback((entryId: string) => {
    persistAlbum(albumEntries.filter((entry) => entry.id !== entryId));
  }, [albumEntries, persistAlbum]);

  const handleCancelEntry = useCallback(() => {
    setIsCreatingEntry(false);
    setEditingEntry(null);
  }, []);

  const handleSaveEntry = useCallback((entry: AlbumEntry, meta?: AlbumEntryEditorSaveMeta) => {
    const nextEntry: EventAlbumEntry = {
      id: entry.id,
      date: entry.date,
      notes: entry.notes,
      photoUri: entry.photoUri,
      location: entry.location,
      contactRefs: meta?.contactRefs ?? editingEntry?.contactRefs ?? [],
      taskRef: meta?.taskRef ?? editingEntry?.taskRef,
    };

    if (isCreatingEntry) {
      persistAlbum([...albumEntries, nextEntry]);
    } else if (editingEntry) {
      persistAlbum(albumEntries.map((currentEntry) => (
        currentEntry.id === nextEntry.id ? nextEntry : currentEntry
      )));
    }

    handleCancelEntry();
  }, [albumEntries, editingEntry, handleCancelEntry, isCreatingEntry, persistAlbum]);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3">
        <AlbumViewer
          entries={albumEntries}
          onEdit={handleEditEntry}
          onDelete={handleDeleteEntry}
          title="Album"
        />
      </div>

      {(isCreatingEntry || editingEntry) ? (
        <AlbumEntryEditor
          entry={editingEntry ?? undefined}
          onSave={handleSaveEntry}
          onCancel={handleCancelEntry}
          contactOptions={event.coAttendees}
          selectedContactRefs={editingEntry?.contactRefs ?? []}
          taskOptions={taskOptions}
          selectedTaskRef={editingEntry?.taskRef}
          getTaskLabel={getTaskLabel}
        />
      ) : null}
    </>
  );
}