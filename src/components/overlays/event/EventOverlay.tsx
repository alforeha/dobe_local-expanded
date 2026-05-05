import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { taskTemplateLibrary } from '../../../coach';
import { starterTaskTemplates } from '../../../coach/StarterQuestLibrary';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { storageDelete, storageKey } from '../../../storage';
import { TaskBlock } from './TaskBlock';
import { ActionBar } from './ActionBar';
import type { ActionBarSection } from './ActionBar';
import { ActionsSection } from './sections/ActionsSection';
import { AlbumSection } from './sections/AlbumSection';
import { ParticipantsSection } from './sections/ParticipantsSection';
import { EventGlobeLayerControls, EventGlobeView } from './EventGlobeView.tsx';
import { useEventGlobeLayers } from './EventGlobeLayers';
import type { Event, Task } from '../../../types';
import { format } from '../../../utils/dateUtils';
import { IconDisplay } from '../../shared/IconDisplay';
import type { InputFields, TaskTemplate, TaskType } from '../../../types/taskTemplate';
import { resolveTaskTemplate } from '../../../utils/resolveTaskTemplate';

function arePreviewResultsEqual(
  current: Partial<InputFields> | undefined,
  next: Partial<InputFields>,
): boolean {
  return JSON.stringify(current ?? {}) === JSON.stringify(next);
}

function buildTemplateRecord(scheduleTemplates: Record<string, TaskTemplate>): Record<string, TaskTemplate> {
  const templates: Record<string, TaskTemplate> = {};

  for (const template of taskTemplateLibrary) {
    if (template.id) templates[template.id] = template;
  }

  for (const template of starterTaskTemplates) {
    if (template.id) templates[template.id] = template;
  }

  for (const [id, template] of Object.entries(scheduleTemplates)) {
    templates[id] = template;
  }

  return templates;
}

function resolveEventTaskType(task: Task | undefined, templates: Record<string, TaskTemplate>): TaskType | null {
  if (!task) return null;
  if (task.isUnique === true) return (task.taskType as TaskType | null) ?? null;
  if (!task.templateRef) return null;

  return resolveTaskTemplate(task.templateRef, templates, starterTaskTemplates, taskTemplateLibrary)?.taskType ?? null;
}

interface EventOverlayProps {
  eventId: string;
  onClose: () => void;
}

export function EventOverlay({ eventId, onClose }: EventOverlayProps) {
  const activeEvents = useScheduleStore((s) => s.activeEvents);
  const historyEvents = useScheduleStore((s) => s.historyEvents);
  const tasks = useScheduleStore((s) => s.tasks);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);
  const deleteEvent = useScheduleStore((s) => s.deleteEvent);
  const updateEvent = useScheduleStore((s) => s.updateEvent);

  const event = (activeEvents[eventId] ?? historyEvents[eventId]) as Event | undefined;
  const eventTaskIds = Array.isArray(event?.tasks) ? event.tasks : [];

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    eventTaskIds[0] ?? null,
  );
  const [activeSection, setActiveSection] = useState<ActionBarSection>('actions');
  const [isEditMode, setIsEditMode] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [taskPreviewResults, setTaskPreviewResults] = useState<Record<string, Partial<InputFields>>>({});
  const [sectionAddRequest, setSectionAddRequest] = useState({
    section: 'actions' as ActionBarSection,
    nonce: 0,
  });

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alreadyCompleteOnMount = useRef(event?.completionState === 'complete');
  const { layerDefinitions, layerVisibility, toggleLayer } = useEventGlobeLayers(event, taskPreviewResults);
  const templates = useMemo(() => buildTemplateRecord(taskTemplates), [taskTemplates]);

  const hasLocationData = Boolean(
    event?.location ||
    eventTaskIds.length > 0 &&
    eventTaskIds.some((taskId) => {
      const task = tasks[taskId];
      if (!task) return false;

       const taskType = resolveEventTaskType(task, templates);

      if (taskType === 'LOCATION_TRAIL') {
        const waypoints = (task.resultFields as Partial<InputFields> & { waypoints?: unknown[] } | undefined)?.waypoints;
        return Array.isArray(waypoints) && waypoints.length > 0;
      }

      if (taskType === 'LOCATION_POINT') {
        const lat = (task.resultFields as Partial<InputFields> & { lat?: unknown } | undefined)?.lat;
        return typeof lat === 'number';
      }

      return false;
    }) ||
    event?.eventAlbum?.some((entry) => Boolean(entry.location))
  );
  const isGlobeViewOpen = activeSection === 'globe';

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

  const effectiveSelectedTaskId = event && selectedTaskId && eventTaskIds.includes(selectedTaskId)
    ? selectedTaskId
    : eventTaskIds[0] ?? null;

  const handleTaskComplete = useCallback(() => {
    if (!event) return;
    const taskIds = Array.isArray(event.tasks) ? event.tasks : [];
    const currentIndex = taskIds.indexOf(effectiveSelectedTaskId ?? '');
    const after = taskIds.slice(currentIndex + 1);
    const before = taskIds.slice(0, currentIndex);
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

  const handlePreviewResultChange = useCallback((taskId: string, result: Partial<InputFields>) => {
    setTaskPreviewResults((current) => {
      if (Object.keys(result).length === 0) {
        if (!(taskId in current)) return current;
        const next = { ...current };
        delete next[taskId];
        return next;
      }

      if (arePreviewResultsEqual(current[taskId], result)) {
        return current;
      }

      return { ...current, [taskId]: result };
    });
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

  const totalCount = eventTaskIds.length;
  const completedCount = eventTaskIds.filter(
    (id) => tasks[id]?.completionState === 'complete',
  ).length;
  const visibleTaskIds = hideCompleted
    ? eventTaskIds.filter((id) => tasks[id]?.completionState !== 'complete')
    : eventTaskIds;

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

      <ActionBar
        eventId={eventId}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        hasLocationData={hasLocationData}
        isEditMode={isEditMode}
        onEnterEdit={() => setIsEditMode(true)}
        onExitEdit={() => setIsEditMode(false)}
        onSectionAdd={handleSectionAdd}
        onDeleteEvent={() => {
          deleteEvent(eventId);
          storageDelete(storageKey.plannedEvent(eventId));
          onClose();
        }}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {activeSection === 'actions' && (
          <div className="shrink-0 overflow-hidden border-b border-gray-200 p-3 dark:border-gray-700" style={{ height: 'min(28rem, 52vh)' }}>
            <TaskBlock
              taskId={effectiveSelectedTaskId}
              eventId={eventId}
              onTaskComplete={handleTaskComplete}
              onPreviewResultChange={handlePreviewResultChange}
              className="h-full"
            />
          </div>
        )}

        <div className={isGlobeViewOpen ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 min-h-0 overflow-y-auto'}>
          {isGlobeViewOpen ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex-1 min-h-0 overflow-hidden p-3">
                <EventGlobeView
                  event={event}
                  layerDefinitions={layerDefinitions}
                  layerVisibility={layerVisibility}
                  onClose={() => setActiveSection('actions')}
                  showCloseButton={true}
                />
              </div>
              <div className="shrink-0 overflow-hidden border-t border-gray-200 dark:border-gray-700" style={{ height: 'min(9rem, 24%)' }}>
                <EventGlobeLayerControls
                  layerDefinitions={layerDefinitions}
                  layerVisibility={layerVisibility}
                  onToggleLayer={toggleLayer}
                />
              </div>
            </div>
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

          {!isGlobeViewOpen && activeSection === 'album' && (
            <AlbumSection
              event={event}
              isEditMode={isEditMode}
              addRequestNonce={sectionAddRequest.section === 'album' ? sectionAddRequest.nonce : 0}
            />
          )}
        </div>
      </div>
    </div>
  );
}
