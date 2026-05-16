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
import { LocationSection } from './sections/LocationSection';
import { ParticipantsSection } from './sections/ParticipantsSection';
import { EventGlobeLayerControls, EventGlobeView } from './EventGlobeView.tsx';
import { useEventGlobeLayers } from './EventGlobeLayers';
import type { Event, Task } from '../../../types';
import { format } from '../../../utils/dateUtils';
import { IconDisplay } from '../../shared/IconDisplay';
import { IconPicker } from '../../shared/IconPicker';
import type { InputFields, TaskTemplate, TaskType } from '../../../types/taskTemplate';
import { resolveTaskTemplate } from '../../../utils/resolveTaskTemplate';

type EditableEventSnapshot = Pick<Event, 'icon' | 'color' | 'name' | 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'location'>;

const DEFAULT_EVENT_COLOR = '#9333ea';
const EVENT_COLOR_SWATCHES = ['#9333ea', '#2563eb', '#0f766e', '#16a34a', '#ea580c', '#dc2626', '#db2777', '#475569'];

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '').padEnd(6, '0').slice(0, 6);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16) || 0,
    g: Number.parseInt(normalized.slice(2, 4), 16) || 0,
    b: Number.parseInt(normalized.slice(4, 6), 16) || 0,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${clampChannel(r).toString(16).padStart(2, '0')}${clampChannel(g).toString(16).padStart(2, '0')}${clampChannel(b).toString(16).padStart(2, '0')}`;
}

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

function buildEditableEventSnapshot(event: Event): EditableEventSnapshot {
  return {
    icon: event.icon ?? null,
    color: event.color ?? null,
    name: event.name,
    startDate: event.startDate,
    startTime: event.startTime,
    endDate: event.endDate,
    endTime: event.endTime,
    location: event.location
      ? {
          latitude: event.location.latitude,
          longitude: event.location.longitude,
          placeName: event.location.placeName,
        }
      : null,
  };
}

function formatLocationLabel(location: NonNullable<Event['location']>): string {
  return location.placeName?.trim() || `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
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
  const [showCustomColorEditor, setShowCustomColorEditor] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [taskPreviewResults, setTaskPreviewResults] = useState<Record<string, Partial<InputFields>>>({});
  const [sectionAddRequest, setSectionAddRequest] = useState({
    section: 'actions' as ActionBarSection,
    nonce: 0,
  });

  const alreadyCompleteOnMount = useRef(event?.completionState === 'complete');
  const hasAutoClosedRef = useRef(false);
  const editSnapshotRef = useRef<EditableEventSnapshot | null>(null);
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
    if (event?.completionState !== 'complete') return;
    if (alreadyCompleteOnMount.current) return;
    if (hasAutoClosedRef.current) return;
    hasAutoClosedRef.current = true;
    const t = setTimeout(() => onClose(), 1200);
    return () => clearTimeout(t);
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

  const handleEnterEditMode = useCallback(() => {
    if (!event) return;
    editSnapshotRef.current = buildEditableEventSnapshot(event);
    setShowCustomColorEditor(false);
    setIsEditMode(true);
  }, [event]);

  const handleCancelEdit = useCallback(() => {
    if (editSnapshotRef.current) {
      updateEvent(eventId, editSnapshotRef.current);
    }
    editSnapshotRef.current = null;
    setShowCustomColorEditor(false);
    setIsEditMode(false);
  }, [eventId, updateEvent]);

  const handleSaveEdit = useCallback(() => {
    editSnapshotRef.current = null;
    setShowCustomColorEditor(false);
    setIsEditMode(false);
  }, []);

  if (!event) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800">
          <p className="text-gray-500">Event not found.</p>
          <button type="button" onClick={onClose} className="mt-4 text-sm text-purple-600">Close</button>
        </div>
      </div>
    );
  }

  const color = event.color ?? DEFAULT_EVENT_COLOR;
  const startDateTime = `${event.startDate} ${event.startTime}`;
  const endDateTime = `${event.endDate} ${event.endTime}`;

  const totalCount = eventTaskIds.length;
  const completedCount = eventTaskIds.filter(
    (id) => tasks[id]?.completionState === 'complete',
  ).length;
  const visibleTaskIds = hideCompleted
    ? eventTaskIds.filter((id) => tasks[id]?.completionState !== 'complete')
    : eventTaskIds;
  const activeCustomColor = event.color ?? DEFAULT_EVENT_COLOR;
  const customColorRgb = hexToRgb(activeCustomColor);

  const handleCustomColorChannelChange = (channel: 'r' | 'g' | 'b', rawValue: number) => {
    const nextValue = clampChannel(rawValue);
    const nextRgb = {
      ...customColorRgb,
      [channel]: nextValue,
    };
    updateEvent(eventId, { color: rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b) });
  };

  return (
    <div
      className="flex h-full flex-col bg-white dark:bg-gray-900"
      data-edit-mode={isEditMode ? 'true' : 'false'}
      style={{ borderTop: `4px solid ${color}` }}
    >
      {!isEditMode && (
        <div className="flex shrink-0 items-start justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-1 self-stretch rounded-full" style={{ backgroundColor: color }} />

            {event.icon ? (
              <IconDisplay iconKey={event.icon} size={28} className="h-7 w-7 shrink-0 object-contain" alt="" />
            ) : null}

            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{event.name}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {format(new Date(startDateTime.split(' ')[0] + 'T00:00:00'), 'short')} {event.startTime}
                {' → '}
                {format(new Date(endDateTime.split(' ')[0] + 'T00:00:00'), 'short')} {event.endTime}
              </p>
              {event.location ? (
                <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <span aria-hidden="true">📍</span>
                  <span className="truncate">{formatLocationLabel(event.location)}</span>
                </p>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            aria-label="Close event"
            onClick={onClose}
            className="rounded-full p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            ✕
          </button>
        </div>
      )}

      {isEditMode ? (
        <>
          <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-4 py-5">
            <div className="flex w-full max-w-2xl flex-col gap-5">
              <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/60">
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      aria-label="Close edit mode"
                      onClick={handleCancelEdit}
                      className="rounded-full p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex items-end gap-3">
                    <div className="w-[4.5rem] shrink-0 space-y-1">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Icon</span>
                      <IconPicker
                        value={event.icon || 'event-nav-actions'}
                        onChange={(value) => updateEvent(eventId, { icon: value || null })}
                        align="left"
                      />
                    </div>

                    <label className="min-w-0 flex-1 space-y-1">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Name</span>
                      <input
                        type="text"
                        value={event.name}
                        onChange={(editEvent) => updateEvent(eventId, { name: editEvent.target.value })}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Color</span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCustomColorEditor(false);
                          updateEvent(eventId, { color: null });
                        }}
                        className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        Clear
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {EVENT_COLOR_SWATCHES.map((swatch) => {
                        const isSelected = color === swatch;
                        return (
                          <button
                            key={swatch}
                            type="button"
                            aria-label={`Set color ${swatch}`}
                            onClick={() => {
                              setShowCustomColorEditor(false);
                              updateEvent(eventId, { color: swatch });
                            }}
                            className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-105 ${
                              isSelected ? 'border-gray-900 dark:border-white' : 'border-white dark:border-gray-900'
                            }`}
                            style={{ backgroundColor: swatch }}
                          />
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => {
                          setShowCustomColorEditor((current) => !current);
                          if (!event.color) {
                            updateEvent(eventId, { color: DEFAULT_EVENT_COLOR });
                          }
                        }}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          showCustomColorEditor
                            ? 'border-purple-500 text-purple-600 dark:text-purple-300'
                            : 'border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                        }`}
                      >
                        Custom
                      </button>
                    </div>

                    {showCustomColorEditor && (
                      <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-800">
                        <div className="mb-3 flex items-center gap-3">
                          <span
                            className="h-10 w-10 shrink-0 rounded-lg border border-gray-200 dark:border-gray-600"
                            style={{ backgroundColor: activeCustomColor }}
                          />
                          <div className="text-sm text-gray-600 dark:text-gray-300">{activeCustomColor}</div>
                        </div>

                        <div className="grid grid-cols-[auto_1fr_52px] items-center gap-2 text-sm">
                          <span className="text-red-500">R</span>
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={customColorRgb.r}
                            onChange={(event) => handleCustomColorChannelChange('r', Number(event.target.value))}
                            className="w-full"
                          />
                          <input
                            type="number"
                            min={0}
                            max={255}
                            value={customColorRgb.r}
                            onChange={(event) => handleCustomColorChannelChange('r', Number(event.target.value))}
                            className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                          />

                          <span className="text-green-500">G</span>
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={customColorRgb.g}
                            onChange={(event) => handleCustomColorChannelChange('g', Number(event.target.value))}
                            className="w-full"
                          />
                          <input
                            type="number"
                            min={0}
                            max={255}
                            value={customColorRgb.g}
                            onChange={(event) => handleCustomColorChannelChange('g', Number(event.target.value))}
                            className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                          />

                          <span className="text-blue-500">B</span>
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={customColorRgb.b}
                            onChange={(event) => handleCustomColorChannelChange('b', Number(event.target.value))}
                            className="w-full"
                          />
                          <input
                            type="number"
                            min={0}
                            max={255}
                            value={customColorRgb.b}
                            onChange={(event) => handleCustomColorChannelChange('b', Number(event.target.value))}
                            className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Start</div>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Date</span>
                        <input
                          type="date"
                          value={event.startDate}
                          onChange={(editEvent) => updateEvent(eventId, { startDate: editEvent.target.value })}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Time</span>
                        <input
                          type="time"
                          value={event.startTime}
                          onChange={(editEvent) => updateEvent(eventId, { startTime: editEvent.target.value })}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                      </label>
                    </div>

                    <div className="space-y-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">End</div>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Date</span>
                        <input
                          type="date"
                          value={event.endDate}
                          onChange={(editEvent) => updateEvent(eventId, { endDate: editEvent.target.value })}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Time</span>
                        <input
                          type="time"
                          value={event.endTime}
                          onChange={(editEvent) => updateEvent(eventId, { endTime: editEvent.target.value })}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <LocationSection event={event} isEditMode={true} addRequestNonce={0} embedded={true} />
            </div>
          </div>

          <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
            <div className="mx-auto flex w-full max-w-2xl gap-3">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveEdit}
                className="flex-1 rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-700"
              >
                Save
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <ActionBar
            eventId={eventId}
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            hasLocationData={hasLocationData}
            isEditMode={isEditMode}
            onEnterEdit={handleEnterEditMode}
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
                  addRequestNonce={sectionAddRequest.section === 'album' ? sectionAddRequest.nonce : 0}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
