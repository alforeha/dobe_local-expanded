import { useScheduleStore } from '../stores/useScheduleStore';
import { computeNextSeedDate } from '../engine/rollover';
import { getAppDate } from './dateUtils';

function parseISODate(isoDate: string): Date {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00`);
}

function formatMonthDay(isoDate: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parseISODate(isoDate));
}

export function formatLastCompleted(lastCompleted: string | null, referenceDate = getAppDate()): string {
  if (!lastCompleted) return 'Never';
  const daysAgo = Math.max(0, Math.round((parseISODate(referenceDate).getTime() - parseISODate(lastCompleted).getTime()) / 86_400_000));
  const unit = daysAgo === 1 ? 'day' : 'days';
  return `${formatMonthDay(lastCompleted)} (${daysAgo} ${unit} ago)`;
}

export function getLastCompletedForResourceTask(
  resourceId: string,
  taskId: string,
  resourceType: string,
  placementId?: string,
  taskName?: string,
): string | null {
  const tasks = useScheduleStore.getState().tasks;

  const patterns: string[] = [];
  if (resourceType === 'home') {
    patterns.push(`resource-task:${resourceId}:chore:${taskId}`);
    if (placementId) {
      patterns.push(`resource-task:${resourceId}:home-placement:${placementId}:${taskId}`);
    } else {
      patterns.push(`resource-task:${resourceId}:home-placement:`);
    }
  } else if (resourceType === 'vehicle') {
    patterns.push(`resource-task:${resourceId}:maintenance:${taskId}`);
    patterns.push(`resource-task:${resourceId}:vehicle-task:${taskId}`);
  } else if (resourceType === 'account') {
    patterns.push(`resource-task:${resourceId}:account-task:${taskId}`);
  } else if (resourceType === 'inventory') {
    patterns.push(`resource-task:${resourceId}:inventory:`);
  } else if (resourceType === 'contact') {
    patterns.push(`resource-task:${resourceId}:contact-task:${taskId}`);
  }

  const matches = Object.values(tasks).filter((task) => {
    if (task.completionState !== 'complete' || !task.completedAt) return false;
    if (task.resourceRef !== resourceId) return false;
    const rid = (task.resultFields as Record<string, unknown>)?.resourceTaskId;
    if (typeof rid === 'string') {
      return patterns.some((pattern) => rid === pattern || rid.includes(taskId));
    }
    if (task.templateRef) {
      return patterns.some((pattern) => task.templateRef!.startsWith(pattern) || task.templateRef!.includes(taskId));
    }
    if (taskName && task.title === taskName) return true;
    return false;
  });

  if (matches.length === 0) return null;

  return matches
    .map((task) => task.completedAt!)
    .sort((a, b) => b.localeCompare(a))[0];
}

export function getLastCompletedForTemplate(templateRef: string): string | null {
  const tasks = useScheduleStore.getState().tasks;
  const matches = Object.values(tasks).filter(
    (task) =>
      task.completionState === 'complete' &&
      task.completedAt != null &&
      task.templateRef === templateRef,
  );

  if (matches.length === 0) return null;

  return matches
    .map((task) => task.completedAt!)
    .sort((a, b) => b.localeCompare(a))[0];
}

export function getNextScheduledForTemplate(templateRef: string): string | null {
  const scheduleStore = useScheduleStore.getState();
  const plannedEvents = scheduleStore.plannedEvents;
  const today = getAppDate();

  const activeEvents = Object.values(scheduleStore.activeEvents);
  const isToday = activeEvents.some((event) => {
    if (event.eventType === 'quickActions') return false;
    return (event as { tasks?: string[] }).tasks?.some((taskId) => {
      const task = scheduleStore.tasks[taskId];
      return task?.templateRef === templateRef;
    });
  });

  if (isToday) return today;

  const matchingEvent = Object.values(plannedEvents).find((pe) =>
    pe.pools.some((pool) =>
      pool.entries.some((entry) => entry.kind === 'template' && entry.templateRef === templateRef),
    ),
  );

  if (!matchingEvent) return null;

  const nextDate = computeNextSeedDate(matchingEvent, today);
  return nextDate ?? null;
}
