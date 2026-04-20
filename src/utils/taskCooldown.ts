import { getOffsetNow } from './dateUtils';
import type { Task } from '../types/task';
import type { TaskTemplate } from '../types/taskTemplate';

export interface TaskCooldownState {
  lastCompletedAt: number | null;
  cooldownMs: number;
  cooldownEndAt: number | null;
  msRemaining: number;
  isCoolingDown: boolean;
  progress: number;
}

export function getCurrentAppNowMs(): number {
  return getOffsetNow().getTime();
}

export function findLatestTemplateCompletion(
  tasks: Record<string, Task>,
  templateKey: string,
): number | null {
  let latest: number | null = null;

  for (const task of Object.values(tasks)) {
    if (
      task.templateRef !== templateKey ||
      task.completionState !== 'complete' ||
      !task.completedAt
    ) {
      continue;
    }

    const completedAtMs = new Date(task.completedAt).getTime();
    if (Number.isNaN(completedAtMs)) continue;
    if (latest === null || completedAtMs > latest) latest = completedAtMs;
  }

  return latest;
}

export function getTaskCooldownState(
  template: Pick<TaskTemplate, 'cooldown'>,
  templateKey: string,
  tasks: Record<string, Task>,
  nowMs: number = getCurrentAppNowMs(),
): TaskCooldownState {
  const lastCompletedAt = findLatestTemplateCompletion(tasks, templateKey);
  const cooldownMs = (template.cooldown ?? 0) * 60 * 1000;
  const cooldownEndAt = lastCompletedAt !== null && cooldownMs > 0 ? lastCompletedAt + cooldownMs : null;
  const msRemaining = cooldownEndAt !== null ? Math.max(0, cooldownEndAt - nowMs) : 0;
  const isCoolingDown = msRemaining > 0;
  const progress = cooldownMs > 0 && lastCompletedAt !== null
    ? Math.min(1, Math.max(0, 1 - msRemaining / cooldownMs))
    : 1;

  return {
    lastCompletedAt,
    cooldownMs,
    cooldownEndAt,
    msRemaining,
    isCoolingDown,
    progress,
  };
}
