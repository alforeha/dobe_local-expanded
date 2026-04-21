// ─────────────────────────────────────────
// useScheduleStore — SCHEDULE STORE
// Holds: PlannedEvents, Events (active + history), QuickActionsEvent,
//        Tasks, TaskTemplates (user custom only — D34).
// DEVICE → cloud sync in MULTI-USER.
// ─────────────────────────────────────────

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlannedEvent, Event, QuickActionsEvent, Task, TaskTemplate } from '../types';
import { taskTemplateLibrary } from '../coach';
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

const bundledTemplateById = new Map(
  taskTemplateLibrary
    .filter((template): template is TaskTemplate & { id: string } => Boolean(template.id))
    .map((template) => [template.id, template]),
);

function refreshBundledTaskTemplates(taskTemplates: Record<string, TaskTemplate>): Record<string, TaskTemplate> {
  const next: Record<string, TaskTemplate> = {};

  for (const [key, template] of Object.entries(taskTemplates)) {
    const bundled = bundledTemplateById.get(key);
    next[key] = bundled
      ? {
          ...template,
          name: bundled.name,
          description: bundled.description,
          icon: bundled.icon,
          taskType: bundled.taskType,
          secondaryTag: bundled.secondaryTag,
          inputFields: bundled.inputFields,
          xpAward: bundled.xpAward,
          cooldown: bundled.cooldown,
          media: bundled.media,
          items: bundled.items,
          isCustom: bundled.isCustom,
          isSystem: bundled.isSystem,
          xpBonus: bundled.xpBonus,
        }
      : template;
  }

  return next;
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
          taskTemplates: refreshBundledTaskTemplates(
            (persisted.taskTemplates as Record<string, TaskTemplate> | undefined) ?? currentState.taskTemplates,
          ),
        };
      },
    },
  ),
);
