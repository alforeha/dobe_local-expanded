import { useState, useCallback, useEffect, useRef } from 'react';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { storageDelete, storageKey } from '../../../storage';
import { EventOverlayHeader } from './EventOverlayHeader';
import { TaskBlock } from './TaskBlock';
import { TaskList } from './TaskList';
import { ActionBar } from './ActionBar';
import type { Event } from '../../../types';

interface EventOverlayProps {
  eventId: string;
  onClose: () => void;
}

export function EventOverlay({ eventId, onClose }: EventOverlayProps) {
  const activeEvents = useScheduleStore((s) => s.activeEvents);
  const historyEvents = useScheduleStore((s) => s.historyEvents);
  const tasks = useScheduleStore((s) => s.tasks);
  const deleteEvent = useScheduleStore((s) => s.deleteEvent);

  const event = (activeEvents[eventId] ?? historyEvents[eventId]) as Event | undefined;

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    event?.tasks?.[0] ?? null
  );
  const [playMode, setPlayMode] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether the event was already complete when the overlay opened.
  // Auto-close only fires on a transition TO complete, not on open.
  const alreadyCompleteOnMount = useRef(event?.completionState === 'complete');

  // Auto-select next task when selected task is removed from the event
  useEffect(() => {
    if (!event || !selectedTaskId) return;
    if (event.tasks.includes(selectedTaskId)) return;
    // Selected task was removed — pick the first remaining task, or null
    setSelectedTaskId(event.tasks[0] ?? null);
  }, [event?.tasks, selectedTaskId]);

  // FIX 1 — auto-close 1200ms after event completes (transition only)
  useEffect(() => {
    if (event?.completionState === 'complete' && !alreadyCompleteOnMount.current) {
      closeTimerRef.current = setTimeout(() => {
        onClose();
      }, 1200);
    }
    return () => {
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, [event?.completionState, onClose]);

  const handleTaskComplete = useCallback(() => {
    if (!event) return;
    const currentIndex = event.tasks.indexOf(selectedTaskId ?? '');
    // First try after current position, then wrap around from the start
    const after = event.tasks.slice(currentIndex + 1);
    const before = event.tasks.slice(0, currentIndex);
    const nextPending = [...after, ...before].find(
      (id) => tasks[id]?.completionState !== 'complete',
    );
    if (nextPending) {
      setSelectedTaskId(nextPending);
    }
  }, [event, selectedTaskId, tasks]);

  if (!event) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-xl bg-white dark:bg-gray-800 p-6 shadow-xl">
          <p className="text-gray-500">Event not found.</p>
          <button type="button" onClick={onClose} className="mt-4 text-sm text-purple-600">Close</button>
        </div>
      </div>
    );
  }

  const color = '#9333ea'; // default — PlannedEvent.color resolved via ref in full build

  const totalCount = event.tasks.length;
  const completedCount = event.tasks.filter(
    (id) => tasks[id]?.completionState === 'complete',
  ).length;
  const visibleTaskIds = hideCompleted
    ? event.tasks.filter((id) => tasks[id]?.completionState !== 'complete')
    : event.tasks;

  return (
    <div
      className="flex flex-col h-full bg-white dark:bg-gray-900"
      style={{ borderTop: `4px solid ${color}` }}
    >
      <EventOverlayHeader event={event} onClose={onClose} />

      {/* TOP SECTION — active task input, ~2/3 */}
      <div className="flex-1 min-h-0 overflow-hidden p-3">
        <TaskBlock
          taskId={selectedTaskId}
          eventId={eventId}
          onTaskComplete={handleTaskComplete}
          className="h-full"
        />
      </div>

      {/* BOTTOM SECTION — task list, ~1/3 */}
      <div className="flex h-1/3 min-h-0 flex-col shrink-0 border-t border-gray-200 dark:border-gray-700">
        {/* Action bar */}
        <ActionBar
          event={event}
          eventId={eventId}
          playMode={playMode}
          onTogglePlay={() => setPlayMode((p) => !p)}
          taskCount={totalCount}
          completedCount={completedCount}
          onDeleteEvent={() => {
            deleteEvent(eventId);
            storageDelete(storageKey.plannedEvent(eventId));
            onClose();
          }}
        />

        {/* Task list header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs">
          <span className="font-medium text-gray-600 dark:text-gray-400">
            {completedCount}/{totalCount} tasks
          </span>
          <button
            type="button"
            onClick={() => setHideCompleted((h) => !h)}
            className={`rounded px-2 py-0.5 transition-colors ${
              hideCompleted
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {hideCompleted ? 'Show all' : 'Hide completed'}
          </button>
        </div>

        {/* Scrollable task list */}
        <TaskList
          taskIds={visibleTaskIds}
          selectedTaskId={selectedTaskId}
          onSelect={setSelectedTaskId}
        />
      </div>
    </div>
  );
}
