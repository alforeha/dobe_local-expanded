import { useMemo, useState } from 'react';
import { PopupShell } from '../../shared/popups/PopupShell';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { starterTaskTemplates } from '../../../coach/StarterQuestLibrary';
import { addTaskToEvent } from '../../../engine/eventExecution';
import type { Event } from '../../../types';

interface ActionBarProps {
  event: Event;
  eventId: string;
  playMode: boolean;
  onTogglePlay: () => void;
  taskCount: number;
  completedCount: number;
  onDeleteEvent?: () => void;
}

type PopupType = 'attachment' | 'link' | 'location' | 'addTask' | null;

export function ActionBar({ event: _event, eventId, playMode, onTogglePlay, taskCount, completedCount, onDeleteEvent }: ActionBarProps) {
  const [openPopup, setOpenPopup] = useState<PopupType>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedTemplateRef, setSelectedTemplateRef] = useState('');

  const storeTemplates = useScheduleStore((s) => s.taskTemplates);

  // All non-system templates sorted by name
  const allTemplates = useMemo(() => {
    const map: Record<string, { ref: string; name: string; taskType: string }> = {};

    // Store templates (user-created + seeded, keyed by their store key)
    for (const [key, tpl] of Object.entries(storeTemplates)) {
      if (tpl.isSystem) continue;
      // Skip resource-task synthetic keys — they are managed by resources
      if (key.startsWith('resource-task:')) continue;
      map[key] = { ref: key, name: tpl.name, taskType: tpl.taskType };
    }

    // Starter/coach library templates
    for (const tpl of starterTaskTemplates) {
      if (tpl.isSystem) continue;
      if (!tpl.id) continue;
      if (map[tpl.id]) continue; // store version takes precedence
      map[tpl.id] = { ref: tpl.id, name: tpl.name, taskType: tpl.taskType };
    }

    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [storeTemplates]);

  const handleOpenAddTask = () => {
    setSelectedTemplateRef(allTemplates[0]?.ref ?? '');
    setOpenPopup('addTask');
  };

  const handleAddTask = () => {
    if (!selectedTemplateRef) return;
    addTaskToEvent(selectedTemplateRef, eventId);
    setOpenPopup(null);
    setSelectedTemplateRef('');
  };

  const handleDeleteClick = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    onDeleteEvent?.();
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 dark:border-gray-700 px-3 py-2">
        {/* Play button */}
        <button
          type="button"
          aria-label={playMode ? 'Pause' : 'Play'}
          onClick={onTogglePlay}
          className={`rounded-full p-1.5 text-sm transition-colors ${playMode ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
        >
          {playMode ? '⏸' : '▶'}
        </button>

        {/* Attachment */}
        <button
          type="button"
          aria-label="Attachments"
          onClick={() => setOpenPopup('attachment')}
          className="rounded-full p-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          📎
        </button>

        {/* Link */}
        <button
          type="button"
          aria-label="Link resource"
          onClick={() => setOpenPopup('link')}
          className="rounded-full p-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          🔗
        </button>

        {/* Shared — stub, inactive in LOCAL */}
        <button
          type="button"
          aria-label="Share (unavailable in LOCAL)"
          disabled
          className="rounded-full p-1.5 text-sm bg-gray-50 dark:bg-gray-800 text-gray-300 cursor-not-allowed"
        >
          👥
        </button>

        {/* Location */}
        <button
          type="button"
          aria-label="Location"
          onClick={() => setOpenPopup('location')}
          className="rounded-full p-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          📍
        </button>

        {/* Add Task */}
        <button
          type="button"
          aria-label="Add task"
          onClick={handleOpenAddTask}
          className="rounded-full p-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          ➕
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Task count */}
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
          {completedCount}/{taskCount}
        </span>

        {/* Delete event */}
        {onDeleteEvent && (
          <button
            type="button"
            onClick={handleDeleteClick}
            onBlur={() => setConfirmDelete(false)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              confirmDelete
                ? 'border-red-500 bg-red-500 text-white'
                : 'border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
            }`}
          >
            {confirmDelete ? 'Confirm?' : 'Delete'}
          </button>
        )}
      </div>

      {/* Popup shells */}
      {openPopup === 'attachment' && (
        <PopupShell title="Attachments" onClose={() => setOpenPopup(null)} />
      )}
      {openPopup === 'link' && (
        <PopupShell title="Link Resource" onClose={() => setOpenPopup(null)} />
      )}
      {openPopup === 'location' && (
        <PopupShell title="Location" onClose={() => setOpenPopup(null)} />
      )}

      {/* Add Task popup */}
      {openPopup === 'addTask' && (
        <PopupShell title="Add Task" onClose={() => setOpenPopup(null)}>
          <div className="flex flex-col gap-4">
            {allTemplates.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No task templates available.</p>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Select a task
                  </label>
                  <select
                    value={selectedTemplateRef}
                    onChange={(e) => setSelectedTemplateRef(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {allTemplates.map((tpl) => (
                      <option key={tpl.ref} value={tpl.ref}>
                        {tpl.name} — {tpl.taskType}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setOpenPopup(null)}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!selectedTemplateRef}
                    onClick={handleAddTask}
                    className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 active:bg-purple-800 disabled:opacity-40 transition-colors"
                  >
                    Add
                  </button>
                </div>
              </>
            )}
          </div>
        </PopupShell>
      )}
    </>
  );
}
