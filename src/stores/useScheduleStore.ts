// ─────────────────────────────────────────
// useScheduleStore — SCHEDULE STORE
// Holds: PlannedEvents, Events (active + history), QuickActionsEvent,
//        Tasks, TaskTemplates (user custom only — D34).
// DEVICE → cloud sync in MULTI-USER.
// ─────────────────────────────────────────

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlannedEvent, Event, QuickActionsEvent, Task, TaskTemplate } from '../types';
import { isTemplateQuestLocked } from '../utils/isTemplateQuestLocked';

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
    console.warn('[scheduleStore] failed to persist cleaned taskTemplates during hydration', error);
  }
}

function normalizeEventSharedWith(event: Event | QuickActionsEvent): Event | QuickActionsEvent {
  if (event.eventType === 'quickActions') return event;

  return {
    ...event,
    sharedWith: Array.isArray(event.sharedWith) ? event.sharedWith : [],
  };
}

function normalizeEventRecord<T extends Event | QuickActionsEvent>(
  events: Record<string, T> | undefined,
): Record<string, T> {
  const next: Record<string, T> = {};

  for (const [id, event] of Object.entries(events ?? {})) {
    next[id] = normalizeEventSharedWith(event) as T;
  }

  return next;
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
        const stripped = stripLibraryTaskTemplates(
          (persisted.taskTemplates as Record<string, TaskTemplate> | undefined) ?? currentState.taskTemplates,
        );

        if (stripped.changed) {
          persistCleanedScheduleState({
            ...persisted,
            taskTemplates: stripped.taskTemplates,
          });
        }

        return {
          ...currentState,
          ...persisted,
          activeEvents: normalizeEventRecord(
            (persisted.activeEvents as Record<string, Event | QuickActionsEvent> | undefined) ??
              currentState.activeEvents,
          ),
          historyEvents: normalizeEventRecord(
            (persisted.historyEvents as Record<string, Event | QuickActionsEvent> | undefined) ??
              currentState.historyEvents,
          ),
          taskTemplates: stripped.taskTemplates,
        };
      },
    },
  ),
);
