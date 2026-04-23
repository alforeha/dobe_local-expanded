import { useState, useCallback, useEffect, useRef } from 'react';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { storageDelete, storageKey } from '../../../storage';
import { EventOverlayHeader } from './EventOverlayHeader';
import { TaskBlock } from './TaskBlock';
import { ActionBar } from './ActionBar';
import type { ActionBarSection } from './ActionBar';
import { ActionsSection } from './sections/ActionsSection';
import { LocationSection } from './sections/LocationSection';
import { ParticipantsSection } from './sections/ParticipantsSection';
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
    event?.tasks?.[0] ?? null,
  );
  const [activeSection, setActiveSection] = useState<ActionBarSection>('actions');
  const [isEditMode, setIsEditMode] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [sectionAddRequest, setSectionAddRequest] = useState({
    section: 'actions' as ActionBarSection,
    nonce: 0,
  });

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alreadyCompleteOnMount = useRef(event?.completionState === 'complete');

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

  const effectiveSelectedTaskId = event && selectedTaskId && event.tasks.includes(selectedTaskId)
    ? selectedTaskId
    : event?.tasks[0] ?? null;

  const handleTaskComplete = useCallback(() => {
    if (!event) return;
    const currentIndex = event.tasks.indexOf(effectiveSelectedTaskId ?? '');
    const after = event.tasks.slice(currentIndex + 1);
    const before = event.tasks.slice(0, currentIndex);
    const nextPending = [...after, ...before].find(
      (id) => tasks[id]?.completionState !== 'complete',
    );
    if (nextPending) {
      setSelectedTaskId(nextPending);
    }
  }, [effectiveSelectedTaskId, event, tasks]);

  const handleSectionAdd = useCallback((section: 'actions' | 'participants' | 'location') => {
    if (section !== 'actions') {
      setIsEditMode(true);
    }
    setSectionAddRequest((current) => ({ section, nonce: current.nonce + 1 }));
  }, []);

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

  const color = '#9333ea';

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
      data-edit-mode={isEditMode ? 'true' : 'false'}
      style={{ borderTop: `4px solid ${color}` }}
    >
      <EventOverlayHeader event={event} onClose={onClose} />

      <div className="flex-1 min-h-0 overflow-hidden p-3">
        <TaskBlock
          taskId={effectiveSelectedTaskId}
          eventId={eventId}
          onTaskComplete={handleTaskComplete}
          className="h-full"
        />
      </div>

      <div className="flex h-1/3 min-h-0 flex-col shrink-0 border-t border-gray-200 dark:border-gray-700">
        <ActionBar
          eventId={eventId}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onEnterEdit={() => setIsEditMode(true)}
          onSectionAdd={handleSectionAdd}
          onDeleteEvent={() => {
            deleteEvent(eventId);
            storageDelete(storageKey.plannedEvent(eventId));
            onClose();
          }}
        />

        {activeSection === 'actions' && (
          <ActionsSection
            event={event}
            eventId={eventId}
            isEditMode={isEditMode}
            taskIds={visibleTaskIds}
            selectedTaskId={effectiveSelectedTaskId}
            onSelectTask={setSelectedTaskId}
            onTaskComplete={handleTaskComplete}
            completedCount={completedCount}
            totalCount={totalCount}
            hideCompleted={hideCompleted}
            onToggleHideCompleted={() => setHideCompleted((hidden) => !hidden)}
            addRequestNonce={sectionAddRequest.section === 'actions' ? sectionAddRequest.nonce : 0}
          />
        )}

        {activeSection === 'participants' && (
          <ParticipantsSection
            event={event}
            isEditMode={isEditMode}
            addRequestNonce={sectionAddRequest.section === 'participants' ? sectionAddRequest.nonce : 0}
          />
        )}

        {activeSection === 'location' && (
          <LocationSection
            event={event}
            isEditMode={isEditMode}
            addRequestNonce={sectionAddRequest.section === 'location' ? sectionAddRequest.nonce : 0}
          />
        )}

        {activeSection === 'attachments' && (
          <div className="flex flex-1 items-center justify-center px-3 text-sm text-gray-500 dark:text-gray-400">
            Attachments - coming in LE-09d
          </div>
        )}
      </div>
    </div>
  );
}
