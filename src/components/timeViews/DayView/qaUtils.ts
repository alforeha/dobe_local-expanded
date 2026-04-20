import { taskTemplateLibrary } from '../../../coach';
import { starterTaskTemplates } from '../../../coach/StarterQuestLibrary';
import { getTaskTypeIconKey } from '../../../constants/iconMap';
import type { TaskTemplate } from '../../../types';
import type { Event } from '../../../types/event';
import type { QuickActionsEvent } from '../../../types/event';

export function resolveTaskIcon(template: TaskTemplate | null): string {
  if (!template) return getTaskTypeIconKey('CIRCUIT');
  return getTaskTypeIconKey(template.taskType);
}

/** Resolve a TaskTemplate from templateRef - store -> JSON bundle -> starter */
export function resolveTemplate(
  templateRef: string,
  storeTemplates: Record<string, TaskTemplate>,
): TaskTemplate | null {
  return (
    storeTemplates[templateRef] ??
    taskTemplateLibrary.find((t) => t.id === templateRef) ??
    starterTaskTemplates.find((t) => t.id === templateRef) ??
    null
  );
}

function utcDateStringToLocalIso(utcDate: string): string {
  const d = new Date(`${utcDate}T00:00:00Z`);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function findQAEventForDate(
  activeEvents: Record<string, Event | QuickActionsEvent>,
  historyEvents: Record<string, Event | QuickActionsEvent>,
  dateIso: string,
): QuickActionsEvent | undefined {
  const localKey = `qa-${dateIso}`;

  const byLocalKey = (activeEvents[localKey] ?? historyEvents[localKey]) as QuickActionsEvent | undefined;
  if (byLocalKey?.eventType === 'quickActions') return byLocalKey;

  for (const source of [activeEvents, historyEvents]) {
    for (const ev of Object.values(source)) {
      const qa = ev as QuickActionsEvent;
      if (qa.eventType !== 'quickActions') continue;
      if (
        qa.date === dateIso ||
        qa.id === localKey ||
        utcDateStringToLocalIso(qa.date) === dateIso
      ) {
        return qa;
      }
    }
  }

  for (const source of [activeEvents, historyEvents]) {
    for (const ev of Object.values(source)) {
      const qa = ev as QuickActionsEvent;
      if (qa.eventType !== 'quickActions') continue;
      const storedMs = new Date(qa.date).getTime();
      const targetMs = new Date(dateIso).getTime();
      const diffDays = Math.abs(storedMs - targetMs) / (1000 * 60 * 60 * 24);
      if (diffDays < 0.5) return qa;
    }
  }

  return undefined;
}
