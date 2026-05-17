import { useScheduleStore } from '../stores/useScheduleStore';

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
