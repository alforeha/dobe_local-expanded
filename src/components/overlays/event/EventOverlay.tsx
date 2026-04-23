import { useState, useCallback, useEffect, useRef } from 'react';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { storageDelete, storageKey } from '../../../storage';
import { TaskBlock } from './TaskBlock';
import { ActionBar } from './ActionBar';
import type { ActionBarSection } from './ActionBar';
import { ActionsSection } from './sections/ActionsSection';
import { LocationSection } from './sections/LocationSection';
import { ParticipantsSection } from './sections/ParticipantsSection';
import { AttachmentsSection } from './sections/AttachmentsSection';
import { EventGlobeLayerControls, EventGlobeView, useEventGlobeLayers } from './EventGlobeView.tsx';
import type { Event } from '../../../types';
import { format } from '../../../utils/dateUtils';
import { IconDisplay } from '../../shared/IconDisplay';
import type { InputFields } from '../../../types/taskTemplate';

interface EventOverlayProps {
  eventId: string;
  onClose: () => void;
}

export function EventOverlay({ eventId, onClose }: EventOverlayProps) {
  const activeEvents = useScheduleStore((s) => s.activeEvents);
  const historyEvents = useScheduleStore((s) => s.historyEvents);
  const tasks = useScheduleStore((s) => s.tasks);
  const deleteEvent = useScheduleStore((s) => s.deleteEvent);
  const updateEvent = useScheduleStore((s) => s.updateEvent);

  const event = (activeEvents[eventId] ?? historyEvents[eventId]) as Event | undefined;

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    event?.tasks?.[0] ?? null,
  );
  const [activeSection, setActiveSection] = useState<ActionBarSection>('actions');
  const [isEditMode, setIsEditMode] = useState(false);
  const [showGlobeView, setShowGlobeView] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [taskPreviewResults, setTaskPreviewResults] = useState<Record<string, Partial<InputFields>>>({});
  const [sectionAddRequest, setSectionAddRequest] = useState({
    section: 'actions' as ActionBarSection,
    nonce: 0,
  });

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alreadyCompleteOnMount = useRef(event?.completionState === 'complete');
  const { layerDefinitions, layerVisibility, toggleLayer } = useEventGlobeLayers(event, taskPreviewResults);
  const hasGlobeData = layerDefinitions.length > 0;
  const isGlobeViewOpen = showGlobeView && hasGlobeData;

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

  const handleSectionAdd = useCallback((section: ActionBarSection) => {
    if (section !== 'actions') {
      setIsEditMode(true);
    }
    setActiveSection(section);
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
  const startDateTime = `${event.startDate} ${event.startTime}`;
  const endDateTime = `${event.endDate} ${event.endTime}`;

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
      <div className="flex shrink-0 items-start justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-3">
          {isEditMode ? (
            <input
              type="text"
              value={event.icon ?? ''}
              onChange={(editEvent) => updateEvent(eventId, { icon: editEvent.target.value || null })}
              placeholder="Icon"
              className="w-20 rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          ) : (
            event.icon && <IconDisplay iconKey={event.icon} size={28} className="h-7 w-7 shrink-0 object-contain" alt="" />
          )}

          <div className="flex flex-col gap-1">
            {isEditMode ? (
              <>
                <input
                  type="text"
                  value={event.name}
                  onChange={(editEvent) => updateEvent(eventId, { name: editEvent.target.value })}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-base font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                <div className="flex flex-wrap gap-2">
                  <input
                    type="date"
                    value={event.startDate}
                    onChange={(editEvent) => updateEvent(eventId, { startDate: editEvent.target.value })}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                  />
                  <input
                    type="time"
                    value={event.startTime}
                    onChange={(editEvent) => updateEvent(eventId, { startTime: editEvent.target.value })}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                  />
                  <input
                    type="date"
                    value={event.endDate}
                    onChange={(editEvent) => updateEvent(eventId, { endDate: editEvent.target.value })}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                  />
                  <input
                    type="time"
                    value={event.endTime}
                    onChange={(editEvent) => updateEvent(eventId, { endTime: editEvent.target.value })}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>
              </>
            ) : (
              <>
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{event.name}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {format(new Date(startDateTime.split(' ')[0] + 'T00:00:00'), 'short')} {event.startTime}
                  {' → '}
                  {format(new Date(endDateTime.split(' ')[0] + 'T00:00:00'), 'short')} {event.endTime}
                </p>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Close event"
            onClick={onClose}
            className="rounded-full p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex-1 min-h-0 overflow-hidden p-3">
          {isGlobeViewOpen ? (
            <EventGlobeView
              event={event}
              layerDefinitions={layerDefinitions}
              layerVisibility={layerVisibility}
              onClose={() => setShowGlobeView(false)}
              showCloseButton={true}
            />
          ) : (
            <TaskBlock
              taskId={effectiveSelectedTaskId}
              eventId={eventId}
              onTaskComplete={handleTaskComplete}
              onPreviewResultChange={(taskId, result) => {
                setTaskPreviewResults((current) => {
                  if (Object.keys(result).length === 0) {
                    if (!(taskId in current)) return current;
                    const next = { ...current };
                    delete next[taskId];
                    return next;
                  }

                  return { ...current, [taskId]: result };
                });
              }}
              className="h-full"
            />
          )}
        </div>

        <div className="flex h-1/3 min-h-0 flex-col shrink-0 border-t border-gray-200 dark:border-gray-700">
          <ActionBar
            eventId={eventId}
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            isEditMode={isEditMode}
            onEnterEdit={() => setIsEditMode(true)}
            onExitEdit={() => setIsEditMode(false)}
            onSectionAdd={handleSectionAdd}
            showGlobeButton={hasGlobeData}
            isGlobeViewOpen={isGlobeViewOpen}
            onToggleGlobeView={() => {
              if (!hasGlobeData) return;
              setShowGlobeView((current) => !current);
            }}
            onDeleteEvent={() => {
              deleteEvent(eventId);
              storageDelete(storageKey.plannedEvent(eventId));
              onClose();
            }}
          />

          {isGlobeViewOpen ? (
            <EventGlobeLayerControls
              layerDefinitions={layerDefinitions}
              layerVisibility={layerVisibility}
              onToggleLayer={toggleLayer}
            />
          ) : activeSection === 'actions' && (
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

          {!isGlobeViewOpen && activeSection === 'participants' && (
            <ParticipantsSection
              event={event}
              isEditMode={isEditMode}
              addRequestNonce={sectionAddRequest.section === 'participants' ? sectionAddRequest.nonce : 0}
            />
          )}

          {!isGlobeViewOpen && activeSection === 'location' && (
            <LocationSection
              event={event}
              isEditMode={isEditMode}
              addRequestNonce={sectionAddRequest.section === 'location' ? sectionAddRequest.nonce : 0}
            />
          )}

          {!isGlobeViewOpen && activeSection === 'attachments' && (
            <AttachmentsSection
              event={event}
              eventId={eventId}
              isEditMode={isEditMode}
              addRequestNonce={sectionAddRequest.section === 'attachments' ? sectionAddRequest.nonce : 0}
            />
          )}
        </div>
      </div>
    </div>
  );
}
