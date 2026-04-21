// ─────────────────────────────────────────
// MATERIALISE — PLANNED EVENT → EVENT
// Converts a PlannedEvent into a concrete Event instance.
//
// Called by two paths:
//   1. Same-day creation — immediately after a PlannedEvent is saved with seedDate === today
//   2. Midnight rollover engine — step 3 of the 9-step sequence (D14)
//
// Both paths converge on the same materialisePlannedEvent() output.
// ─────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';
import type { PlannedEvent } from '../types/plannedEvent';
import type { Event } from '../types/event';
import type { Task } from '../types/task';
import type { TaskTemplate, TaskSecondaryTag } from '../types/taskTemplate';
import { useScheduleStore } from '../stores/useScheduleStore';
import { isOneOffEvent } from '../utils/isOneOffEvent';
import { storageDelete } from '../storage';
import { storageKey } from '../storage/storageKeys';
import { useProgressionStore } from '../stores/useProgressionStore';
import { encodeQuestRef } from './markerEngine';
import { addDays, localISODate } from '../utils/dateUtils';


// ── RESULT SHAPE ─────────────────────────────────────────────────────────────

export interface MaterialiseResult {
  event: Event;
  tasks: Task[];
  /** Updated PlannedEvent with advanced taskPoolCursor */
  updatedPlannedEvent: PlannedEvent;
}

// ── CURSOR ADVANCE (D47) ──────────────────────────────────────────────────────

/**
 * Read the current cursor, return the templateRef at that position,
 * and compute the next cursor (wraps at pool end).
 * Returns null for templateRef when taskPool is empty.
 */
export function advanceCursor(pe: PlannedEvent): {
  templateRef: string | null;
  nextCursor: number;
} {
  if (pe.taskPool.length === 0) {
    return { templateRef: null, nextCursor: 0 };
  }
  const cursor = pe.taskPoolCursor ?? 0;
  const safeIndex = cursor % pe.taskPool.length;
  const templateRef = pe.taskPool[safeIndex];
  const nextCursor = (safeIndex + 1) % pe.taskPool.length;
  return { templateRef, nextCursor };
}

// ── TASK INSTANTIATION ────────────────────────────────────────────────────────

/**
 * Create a bare Task instance from a TaskTemplate.
 * Caller is responsible for persisting it.
 */
function instantiateTask(templateRef: string, secondaryTag: TaskSecondaryTag | null): Task {
  return {
    id: uuidv4(),
    templateRef,
    completionState: 'pending',
    completedAt: null,
    resultFields: {},
    attachmentRef: null,
    resourceRef: null,
    location: null,
    sharedWith: null,
    questRef: null,
    actRef: null,
    secondaryTag,
  };
}

// ── QUEST REF LOOKUP ─────────────────────────────────────────────────────────

/**
 * Scan all active Quests in progressionStore to find the first Marker whose
 * taskTemplateRef matches the given templateRef.
 * Returns { questRef, actId } when found, or null when no match.
 *
 * Called during task materialisation so the task carries the correct questRef
 * and actRef fields for completeMilestone() routing (D04).
 */
function findQuestRefForTemplate(
  templateRef: string,
): { questRef: string; actId: string } | null {
  const { acts } = useProgressionStore.getState();
  for (const act of Object.values(acts)) {
    for (let ci = 0; ci < act.chains.length; ci++) {
      const chain = act.chains[ci]!;
      for (let qi = 0; qi < chain.quests.length; qi++) {
        const quest = chain.quests[qi]!;
        if (quest.completionState !== 'active') continue;
        for (const marker of quest.timely.markers) {
          if (marker.activeState && marker.taskTemplateRef === templateRef) {
            return { questRef: encodeQuestRef(act.id, ci, qi), actId: act.id };
          }
        }
      }
    }
  }
  return null;
}

// ── MATERIALISE ───────────────────────────────────────────────────────────────

/**
 * Convert a PlannedEvent into a concrete Event for the given date.
 *
 * Reads   — pe.taskPool, pe.taskPoolCursor, taskTemplates map (for validation)
 * Writes  — useScheduleStore (event + tasks), storageLayer (event, tasks, plannedEvent)
 *
 * @param pe            The PlannedEvent to materialise
 * @param forDate       ISO date string (YYYY-MM-DD) this materialisation targets
 * @param taskTemplates Current taskTemplates map from useScheduleStore (passed in to
 *                      avoid re-reading the store inside the function — keeps it pure-ish)
 * @returns             MaterialiseResult containing the new Event, its Tasks, and the
 *                      updated PlannedEvent with the advanced cursor
 */
export function materialisePlannedEvent(
  pe: PlannedEvent,
  forDate: string,
  taskTemplates: Record<string, TaskTemplate>,
): MaterialiseResult {
  // All events (one-off and recurring routines) materialise ALL pool tasks at once.
  // The cursor is kept in sync but not used to limit which tasks appear.
  const templateRefs: string[] = [...pe.taskPool];
  const nextCursor = pe.taskPoolCursor ?? 0;

  // Build task list for this event instance
  const tasks: Task[] = [];
  for (const templateRef of templateRefs) {
    // Validate the template exists — skip gracefully if missing (e.g. deleted template)
    const templateExists = templateRef in taskTemplates;
    if (templateExists) {
      const tmpl = taskTemplates[templateRef];
      const task = instantiateTask(templateRef, tmpl.secondaryTag ?? null);
      // Populate questRef/actRef if this template matches an active Quest Marker
      const questMatch = findQuestRefForTemplate(templateRef);
      if (questMatch) {
        task.questRef = questMatch.questRef;
        task.actRef = questMatch.actId;
      }
      tasks.push(task);
    } else {
      console.warn(
        `[materialise] TaskTemplate "${templateRef}" not found in store — task skipped for PlannedEvent "${pe.id}"`,
      );
    }
  }

  const taskRefs = tasks.map((t) => t.id);
  // For one-off events, use dieDate as endDate if present. For routines, use overnight logic or forDate.
  let resolvedEndDate: string;
  if (isOneOffEvent(pe) && pe.dieDate) {
    resolvedEndDate = pe.dieDate;
  } else {
    resolvedEndDate = pe.isOvernight === true
      ? localISODate(addDays(new Date(`${forDate}T00:00:00`), 1))
      : forDate;
  }

  // Build the materialised Event
  const event: Event = {
    id: uuidv4(),
    eventType: 'planned',
    plannedEventRef: pe.id,
    icon: pe.icon ?? null,
    color: pe.color ?? null,
    name: pe.name,
    startDate: forDate,
    startTime: pe.startTime,
    endDate: resolvedEndDate,
    endTime: pe.endTime,
    tasks: taskRefs,
    completionState: 'pending',
    xpAwarded: 0,
    attachments: [],
    location: pe.location,
    note: null,
    sharedWith: [],
    coAttendees: null,
  };

  const updatedPlannedEvent: PlannedEvent = {
    ...pe,
    taskPoolCursor: nextCursor,
    taskList: taskRefs,
  };

  // ── Persist ───────────────────────────────────────────────────────────────
  const scheduleStore = useScheduleStore.getState();

  // Persist tasks
  for (const task of tasks) {
    scheduleStore.setTask(task);
  }

  // Persist event
  scheduleStore.setActiveEvent(event);

  // Persist updated PlannedEvent (cursor advanced)
  scheduleStore.setPlannedEvent(updatedPlannedEvent);

  // D137: Remove one-off plannedEvents after materialisation
  if (isOneOffEvent(pe)) {
    scheduleStore.removePlannedEvent(pe.id);
    storageDelete(storageKey.plannedEvent(pe.id));
  }

  return { event, tasks, updatedPlannedEvent };
}
