import { taskTemplateLibrary } from '../coach';
import { starterTaskTemplates } from '../coach/StarterQuestLibrary';
import type { TaskTemplate } from '../types/taskTemplate';

export function getLibraryTemplatePool(): TaskTemplate[] {
  const deduped = new Map<string, TaskTemplate>();

  for (const template of taskTemplateLibrary) {
    if (!template.id) continue;
    deduped.set(template.id, template);
  }

  for (const template of starterTaskTemplates) {
    if (!template.id || deduped.has(template.id)) continue;
    deduped.set(template.id, template);
  }

  return Array.from(deduped.values());
}

export function resolveTaskTemplate(
  ref: string,
  userTemplates: Record<string, TaskTemplate>,
  starterTemplates: TaskTemplate[],
  libraryTemplates: TaskTemplate[],
): TaskTemplate | undefined {
  return userTemplates[ref]
    ?? starterTemplates.find((template) => template.id === ref)
    ?? libraryTemplates.find((template) => template.id === ref);
}