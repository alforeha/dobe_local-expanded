// ─────────────────────────────────────────
// useScheduleStore — SCHEDULE STORE
// Holds: PlannedEvents, Events (active + history), QuickActionsEvent,
//        Tasks, TaskTemplates (user custom only — D34).
// DEVICE → cloud sync in MULTI-USER.
// ─────────────────────────────────────────

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  EventAlbumEntry,
  NoteEntry,
  PlannedEvent,
  Event,
  EventAttachment,
  QAAlbumEntry,
  QuickActionsEvent,
  QuickActionsWeatherSnapshot,
  Task,
  TaskTemplate,
} from '../types';
import type { InputFields } from '../types/taskTemplate';
import { isTemplateQuestLocked } from '../utils/isTemplateQuestLocked';
import { isOneOffEvent } from '../utils/isOneOffEvent';
import { v4 as uuidv4 } from 'uuid';

// ── STATE ─────────────────────────────────────────────────────────────────────

interface ScheduleState {
  /** Keyed by PlannedEvent.id */
  plannedEvents: Record<string, PlannedEvent>;
  /** Keyed by Event.id — active events (includes QuickActionsEvent for today) */
  activeEvents: Record<string, Event | QuickActionsEvent>;
  /** Keyed by Event.id — completed/skipped history */
  historyEvents: Record<string, Event | QuickActionsEvent>;
  /** Keyed by Task.id */
  tasks: Record<string, Task>;
  /** Keyed by a stable key — user custom templates only (D34) */
  taskTemplates: Record<string, TaskTemplate>;
}

// ── ACTIONS ───────────────────────────────────────────────────────────────────

interface ScheduleActions {
  setPlannedEvent: (plannedEvent: PlannedEvent) => void;
  removePlannedEvent: (id: string) => void;

  setActiveEvent: (event: Event | QuickActionsEvent) => void;
  updateQACompletion: (qaEventId: string, taskRef: string, completedAt: string, resultFields: Partial<InputFields>) => void;
  removeQACompletion: (qaEventId: string, taskRef: string) => void;
  removeQAAlbumEntry: (qaEventId: string, entryId: string) => void;
  updateQAAlbumEntry: (qaEventId: string, entryId: string, patch: Partial<QAAlbumEntry>) => void;
  updateEvent: (eventId: string, patch: Partial<Event>) => void;
  removeTaskFromEvent: (taskId: string, eventId: string) => void;
  archiveEvent: (eventId: string) => void;
  deleteEvent: (eventId: string) => void;

  setTask: (task: Task) => void;
  removeTask: (taskId: string) => void;

  setTaskTemplate: (key: string, template: TaskTemplate) => void;
  removeTaskTemplate: (key: string) => void;

  reset: () => void;
}

// ── INITIAL STATE ─────────────────────────────────────────────────────────────

const initialState: ScheduleState = {
  plannedEvents: {},
  activeEvents: {},
  historyEvents: {},
  tasks: {},
  taskTemplates: {},
};

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function stripLibraryTaskTemplates(taskTemplates: Record<string, TaskTemplate> | undefined): {
  taskTemplates: Record<string, TaskTemplate>;
  changed: boolean;
} {
  const next: Record<string, TaskTemplate> = {};
  let changed = false;

  for (const [key, template] of Object.entries(taskTemplates ?? {})) {
    const isUuidKey = UUID_V4_PATTERN.test(key);
    const isTrustedUserTemplate = isUuidKey && template.isCustom === true;

    if (!isTrustedUserTemplate) {
      changed = true;
      continue;
    }

    next[key] = template;
  }

  return { taskTemplates: next, changed };
}

function persistCleanedScheduleState(state: Partial<ScheduleState & ScheduleActions>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const raw = window.localStorage.getItem('cdb-schedule');
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown>; version?: number };
    const next = {
      ...parsed,
      state: {
        ...(parsed.state ?? {}),
        ...state,
      },
    };
    window.localStorage.setItem('cdb-schedule', JSON.stringify(next));
  } catch (error) {
    console.warn('[scheduleStore] failed to persist cleaned schedule state during hydration', error);
  }
}

function normalizeEventFields(event: Event | QuickActionsEvent): {
  event: Event | QuickActionsEvent;
  changed: boolean;
} {
  if (event.eventType === 'quickActions') {
    const quickActionsEvent = event as QuickActionsEvent;
    const normalizedWeatherSnapshot = normalizeQuickActionsWeatherSnapshot(quickActionsEvent.weatherSnapshot);
    const normalizedLocationSnapshots = normalizeQuickActionsLocationSnapshots(quickActionsEvent.locationSnapshots);
    const nextAlbum = Array.isArray(quickActionsEvent.album) ? quickActionsEvent.album : [];

    if (
      !normalizedWeatherSnapshot.changed &&
      !normalizedLocationSnapshots.changed &&
      Array.isArray(quickActionsEvent.album)
    ) {
      return { event, changed: false };
    }

    return {
      event: {
        ...quickActionsEvent,
        weatherSnapshot: normalizedWeatherSnapshot.snapshot,
        locationSnapshots: normalizedLocationSnapshots.snapshots,
        album: nextAlbum,
      },
      changed: true,
    };
  }

  const nextSharedWith = Array.isArray(event.sharedWith) ? event.sharedWith : [];
  const nextCoAttendees = Array.isArray(event.coAttendees) ? event.coAttendees : [];
  const normalizedAttachments = normalizeEventAttachments(event.attachments);
  const nextAttachments = normalizedAttachments.attachments;
  const normalizedEventAlbum = normalizeEventAlbum(event.eventAlbum, nextAttachments);
  const nextEventAlbum = normalizedEventAlbum.eventAlbum;

  return {
    event: {
      ...event,
      sharedWith: nextSharedWith,
      coAttendees: nextCoAttendees,
      attachments: nextAttachments,
      eventAlbum: nextEventAlbum,
    },
    changed:
      nextSharedWith !== event.sharedWith ||
      nextCoAttendees !== event.coAttendees ||
      normalizedAttachments.changed ||
      normalizedEventAlbum.changed,
  };
}

function normalizeQuickActionsWeatherSnapshot(
  snapshot: QuickActionsEvent['weatherSnapshot'],
): {
  snapshot: QuickActionsEvent['weatherSnapshot'];
  changed: boolean;
} {
  if (snapshot == null) {
    return { snapshot, changed: false };
  }

  if ('windSpeed' in snapshot) {
    return { snapshot, changed: false };
  }

  return {
    snapshot: {
      ...snapshot,
      windSpeed: snapshot.windSpeed,
    },
    changed: true,
  };
}

function normalizeQuickActionsLocationSnapshots(
  snapshots: QuickActionsEvent['locationSnapshots'],
): {
  snapshots: QuickActionsEvent['locationSnapshots'];
  changed: boolean;
} {
  if (!snapshots) {
    return { snapshots, changed: false };
  }

  let changed = false;
  const nextEntries = Object.entries(snapshots).map(([locationId, snapshot]) => {
    if ('windSpeed' in snapshot) {
      return [locationId, snapshot] as const;
    }

    changed = true;
    return [
      locationId,
      {
        ...snapshot,
        windSpeed: (snapshot as QuickActionsWeatherSnapshot).windSpeed,
      },
    ] as const;
  });

  return {
    snapshots: changed ? Object.fromEntries(nextEntries) : snapshots,
    changed,
  };
}

function normalizeEventAlbum(
  eventAlbum: Event['eventAlbum'] | undefined,
  attachments: EventAttachment[],
): {
  eventAlbum: EventAlbumEntry[];
  changed: boolean;
} {
  if (Array.isArray(eventAlbum)) {
    let changed = false;
    const nextEventAlbum = eventAlbum.map((entry) => {
      const legacyNote = 'note' in entry && typeof (entry as EventAlbumEntry & { note?: unknown }).note === 'string'
        ? ((entry as EventAlbumEntry & { note?: string }).note ?? '').trim()
        : '';

      const hasBlobPhotoUri = typeof entry.photoUri === 'string' && entry.photoUri.startsWith('blob:');

      if (!legacyNote && !hasBlobPhotoUri) {
        return entry;
      }

      changed = true;
      const { note: _note, ...rest } = entry as EventAlbumEntry & { note?: string };
      const notes: NoteEntry[] = [{
        id: crypto.randomUUID(),
        authorRef: 'me',
        text: legacyNote,
        createdAt: `${entry.date}T00:00:00.000Z`,
      }];

      return {
        ...rest,
        ...(legacyNote ? { notes } : {}),
        ...(hasBlobPhotoUri ? { photoUri: undefined } : {}),
      };
    });

    return { eventAlbum: changed ? nextEventAlbum : eventAlbum, changed };
  }

  if (attachments.length > 0) {
    return {
      eventAlbum: attachments.map((attachment) => ({
        id: attachment.id,
        date: attachment.createdAt.split('T')[0],
        photoUri: attachment.uri,
        location: attachment.location
          ? {
              latitude: attachment.location.latitude,
              longitude: attachment.location.longitude,
              ...(attachment.location.placeName ? { placeName: attachment.location.placeName } : {}),
            }
          : undefined,
        contactRefs: [],
        taskRef: undefined,
      })),
      changed: true,
    };
  }

  return { eventAlbum: [], changed: true };
}

function normalizeEventAttachments(attachments: Event['attachments'] | string[] | undefined): {
  attachments: EventAttachment[];
  changed: boolean;
} {
  if (!Array.isArray(attachments)) {
    return { attachments: [], changed: true };
  }

  let changed = false;
  const nextAttachments = attachments.map((attachment, index) => {
    const normalized = normalizeEventAttachment(attachment, index);
    if (normalized !== attachment) {
      changed = true;
    }
    return normalized;
  });

  return {
    attachments: changed ? nextAttachments : (attachments as EventAttachment[]),
    changed,
  };
}

function normalizeEventAttachment(attachment: EventAttachment | string, index: number): EventAttachment {
  if (typeof attachment === 'string') {
    return {
      id: uuidv4(),
      type: 'document',
      label: `Legacy attachment ${index + 1}`,
      uri: attachment,
      mimeType: 'application/octet-stream',
      sizeBytes: 0,
      createdAt: new Date(0).toISOString(),
      source: 'legacy',
    };
  }

  const nextAttachment: EventAttachment = {
    id: attachment.id || uuidv4(),
    type: attachment.type === 'photo' ? 'photo' : 'document',
    label: attachment.label || `Attachment ${index + 1}`,
    uri: attachment.uri || '',
    mimeType: attachment.mimeType || 'application/octet-stream',
    sizeBytes: Number.isFinite(attachment.sizeBytes) ? attachment.sizeBytes : 0,
    createdAt: attachment.createdAt || new Date(0).toISOString(),
    source:
      attachment.source === 'camera' ||
      attachment.source === 'gallery' ||
      attachment.source === 'web-upload' ||
      attachment.source === 'legacy'
        ? attachment.source
        : 'legacy',
    location:
      attachment.location &&
      typeof attachment.location.latitude === 'number' &&
      typeof attachment.location.longitude === 'number'
        ? {
            latitude: attachment.location.latitude,
            longitude: attachment.location.longitude,
            ...(attachment.location.placeName ? { placeName: attachment.location.placeName } : {}),
          }
        : null,
  };

  if (
    attachment.id === nextAttachment.id &&
    attachment.type === nextAttachment.type &&
    attachment.label === nextAttachment.label &&
    attachment.uri === nextAttachment.uri &&
    attachment.mimeType === nextAttachment.mimeType &&
    attachment.sizeBytes === nextAttachment.sizeBytes &&
    attachment.createdAt === nextAttachment.createdAt &&
    attachment.source === nextAttachment.source &&
    attachment.location?.latitude === nextAttachment.location?.latitude &&
    attachment.location?.longitude === nextAttachment.location?.longitude &&
    attachment.location?.placeName === nextAttachment.location?.placeName
  ) {
    return attachment;
  }

  return nextAttachment;
}

function normalizeEventRecord<T extends Event | QuickActionsEvent>(
  events: Record<string, T> | undefined,
): { events: Record<string, T>; changed: boolean } {
  const next: Record<string, T> = {};
  let changed = false;

  for (const [id, event] of Object.entries(events ?? {})) {
    const normalized = normalizeEventFields(event);
    next[id] = normalized.event as T;
    changed = changed || normalized.changed;
  }

  return { events: next, changed };
}

function normalizeLegacyMaterializedEventDates<T extends Event | QuickActionsEvent>(
  events: Record<string, T> | undefined,
  plannedEvents: Record<string, PlannedEvent> | undefined,
): { events: Record<string, T>; changed: boolean } {
  const next: Record<string, T> = {};
  let changed = false;

  for (const [id, event] of Object.entries(events ?? {})) {
    if (event.eventType === 'quickActions' || !event.plannedEventRef) {
      next[id] = event;
      continue;
    }

    const plannedEvent = plannedEvents?.[event.plannedEventRef];
    if (!plannedEvent || isOneOffEvent(plannedEvent)) {
      next[id] = event;
      continue;
    }

    const isOvernight =
      plannedEvent.isOvernight === true ||
      event.endTime < event.startTime;
    const expectedEndDate = isOvernight
      ? toNextIsoDate(event.startDate)
      : event.startDate;

    if (event.endDate === expectedEndDate) {
      next[id] = event;
      continue;
    }

    next[id] = {
      ...event,
      endDate: expectedEndDate,
    } as T;
    changed = true;
  }

  return { events: changed ? next : (events ?? {}), changed };
}

function toNextIsoDate(dateISO: string): string {
  const date = new Date(`${dateISO}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

// ── STORE ─────────────────────────────────────────────────────────────────────

export const useScheduleStore = create<ScheduleState & ScheduleActions>()(
  persist(
    (set) => ({
      ...initialState,

      setPlannedEvent: (plannedEvent) => {
        set((state) => ({
          plannedEvents: { ...state.plannedEvents, [plannedEvent.id]: plannedEvent },
        }));
        // TODO: MVP06 — storageSet(storageKey.plannedEvent(plannedEvent.id), plannedEvent)
      },

      removePlannedEvent: (id) => {
        set((state) => {
          const plannedEvents = { ...state.plannedEvents };
          delete plannedEvents[id];
          return { plannedEvents };
        });
        // TODO: MVP06 — storageDelete(storageKey.plannedEvent(id))
      },

      setActiveEvent: (event) => {
        set((state) => ({
          activeEvents: { ...state.activeEvents, [event.id]: event },
        }));
        // TODO: MVP06 — persist to event:{uuid} or qa:{date} via storageLayer
      },

      updateQACompletion: (qaEventId, taskRef, completedAt, resultFields) => {
        set((state) => {
          const activeEvent = state.activeEvents[qaEventId];
          if (!activeEvent || activeEvent.eventType !== 'quickActions') {
            return {};
          }
          const qaEvent = activeEvent as QuickActionsEvent;

          const hasCompletion = qaEvent.completions.some((completion) => completion.taskRef === taskRef);
          if (!hasCompletion) {
            return {};
          }

          const nextTask = state.tasks[taskRef]
            ? {
                ...state.tasks[taskRef],
                resultFields: {
                  ...state.tasks[taskRef].resultFields,
                  ...resultFields,
                },
              }
            : null;

          return {
            activeEvents: {
              ...state.activeEvents,
              [qaEventId]: {
                ...qaEvent,
                completions: qaEvent.completions.map((completion) => (
                  completion.taskRef === taskRef
                    ? { ...completion, completedAt }
                    : completion
                )),
              },
            },
            tasks: nextTask
              ? {
                  ...state.tasks,
                  [taskRef]: nextTask,
                }
              : state.tasks,
          };
        });
      },

      removeQACompletion: (qaEventId, taskRef) => {
        set((state) => {
          const activeEvent = state.activeEvents[qaEventId];
          if (!activeEvent || activeEvent.eventType !== 'quickActions') {
            return {};
          }
          const qaEvent = activeEvent as QuickActionsEvent;

          return {
            activeEvents: {
              ...state.activeEvents,
              [qaEventId]: {
                ...qaEvent,
                completions: qaEvent.completions.filter((completion) => completion.taskRef !== taskRef),
              },
            },
          };
        });
      },

      removeQAAlbumEntry: (qaEventId, entryId) => {
        set((state) => {
          const activeEvent = state.activeEvents[qaEventId];
          if (!activeEvent || activeEvent.eventType !== 'quickActions') {
            return {};
          }
          const qaEvent = activeEvent as QuickActionsEvent;

          return {
            activeEvents: {
              ...state.activeEvents,
              [qaEventId]: {
                ...qaEvent,
                album: (qaEvent.album ?? []).filter((entry) => entry.id !== entryId),
              },
            },
          };
        });
      },

      updateQAAlbumEntry: (qaEventId, entryId, patch) => {
        set((state) => {
          const activeEvent = state.activeEvents[qaEventId];
          if (!activeEvent || activeEvent.eventType !== 'quickActions') {
            return {};
          }
          const qaEvent = activeEvent as QuickActionsEvent;

          return {
            activeEvents: {
              ...state.activeEvents,
              [qaEventId]: {
                ...qaEvent,
                album: (qaEvent.album ?? []).map((entry) => (
                  entry.id === entryId
                    ? { ...entry, ...patch }
                    : entry
                )),
              },
            },
          };
        });
      },

      updateEvent: (eventId, patch) => {
        set((state) => {
          const activeEvent = state.activeEvents[eventId];
          if (activeEvent && activeEvent.eventType !== 'quickActions') {
            return {
              activeEvents: {
                ...state.activeEvents,
                [eventId]: { ...activeEvent, ...patch },
              },
            };
          }

          const historyEvent = state.historyEvents[eventId];
          if (historyEvent && historyEvent.eventType !== 'quickActions') {
            return {
              historyEvents: {
                ...state.historyEvents,
                [eventId]: { ...historyEvent, ...patch },
              },
            };
          }

          return {};
        });
      },

      removeTaskFromEvent: (taskId, eventId) => {
        set((state) => {
          const tasks = { ...state.tasks };
          delete tasks[taskId];

          const activeEvent = state.activeEvents[eventId];
          if (activeEvent && activeEvent.eventType !== 'quickActions') {
            return {
              tasks,
              activeEvents: {
                ...state.activeEvents,
                [eventId]: {
                  ...activeEvent,
                  tasks: activeEvent.tasks.filter((id) => id !== taskId),
                },
              },
            };
          }

          const historyEvent = state.historyEvents[eventId];
          if (historyEvent && historyEvent.eventType !== 'quickActions') {
            return {
              tasks,
              historyEvents: {
                ...state.historyEvents,
                [eventId]: {
                  ...historyEvent,
                  tasks: historyEvent.tasks.filter((id) => id !== taskId),
                },
              },
            };
          }

          return { tasks };
        });
      },

      archiveEvent: (eventId) =>
        set((state) => {
          const event = state.activeEvents[eventId];
          if (!event) return {};
          const activeEvents = { ...state.activeEvents };
          delete activeEvents[eventId];
          return {
            activeEvents,
            historyEvents: { ...state.historyEvents, [eventId]: event },
          };
        }),

      deleteEvent: (eventId) =>
        set((state) => {
          const activeEvents = { ...state.activeEvents };
          const historyEvents = { ...state.historyEvents };
          delete activeEvents[eventId];
          delete historyEvents[eventId];
          return { activeEvents, historyEvents };
        }),

      setTask: (task) => {
        set((state) => ({ tasks: { ...state.tasks, [task.id]: task } }));
        // TODO: MVP06 — storageSet(storageKey.task(task.id), task)
      },

      removeTask: (taskId) => {
        set((state) => {
          const tasks = { ...state.tasks };
          delete tasks[taskId];
          return { tasks };
        });
        // TODO: MVP06 — storageDelete(storageKey.task(taskId))
      },

      setTaskTemplate: (key, template) => {
        set((state) => ({
          taskTemplates: { ...state.taskTemplates, [key]: template },
        }));
        // TODO: MVP06 — storageSet(storageKey.taskTemplate(key), template)
      },

      removeTaskTemplate: (key) => {
        if (isTemplateQuestLocked(key)) {
          console.warn(`[scheduleStore] removeTaskTemplate blocked — "${key}" is required by an active quest Marker`);
          return;
        }
        set((state) => {
          const taskTemplates = { ...state.taskTemplates };
          delete taskTemplates[key];
          return { taskTemplates };
        });
        // TODO: MVP06 — storageDelete(storageKey.taskTemplate(key))
      },

      reset: () => set(initialState),
    }),
    {
      name: 'cdb-schedule',
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<ScheduleState & ScheduleActions>) ?? {};
        const mergedPlannedEvents =
          (persisted.plannedEvents as Record<string, PlannedEvent> | undefined) ??
          currentState.plannedEvents;
        const stripped = stripLibraryTaskTemplates(
          (persisted.taskTemplates as Record<string, TaskTemplate> | undefined) ?? currentState.taskTemplates,
        );
        const normalizedActiveBase = normalizeEventRecord(
          (persisted.activeEvents as Record<string, Event | QuickActionsEvent> | undefined) ??
            currentState.activeEvents,
        );
        const normalizedHistoryBase = normalizeEventRecord(
          (persisted.historyEvents as Record<string, Event | QuickActionsEvent> | undefined) ??
            currentState.historyEvents,
        );
        const normalizedActive = normalizeLegacyMaterializedEventDates(
          normalizedActiveBase.events,
          mergedPlannedEvents,
        );
        const normalizedHistory = normalizeLegacyMaterializedEventDates(
          normalizedHistoryBase.events,
          mergedPlannedEvents,
        );

        if (
          stripped.changed ||
          normalizedActiveBase.changed ||
          normalizedHistoryBase.changed ||
          normalizedActive.changed ||
          normalizedHistory.changed
        ) {
          persistCleanedScheduleState({
            ...persisted,
            plannedEvents: mergedPlannedEvents,
            activeEvents: normalizedActive.events,
            historyEvents: normalizedHistory.events,
            taskTemplates: stripped.taskTemplates,
          });
        }

        return {
          ...currentState,
          ...persisted,
          plannedEvents: mergedPlannedEvents,
          activeEvents: normalizedActive.events,
          historyEvents: normalizedHistory.events,
          taskTemplates: stripped.taskTemplates,
        };
      },
    },
  ),
);
