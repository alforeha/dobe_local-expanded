import { taskTemplateLibrary } from '../coach';
import { starterTaskTemplates } from '../coach/StarterQuestLibrary';
import type { TaskTemplate } from '../types/taskTemplate';

export function getEventLibraryTemplatePool(): TaskTemplate[] {
  return getLibraryTemplatePool().filter(
    (template) => !template.isSystem && !!template.id && !template.id.startsWith('resource-task:'),
  );
}

export function getCustomTemplatePool(userTemplates: Record<string, TaskTemplate>): Array<{ ref: string; template: TaskTemplate }> {
  return Object.entries(userTemplates)
    .filter(([ref, template]) => template.isCustom === true && !template.isSystem && !ref.startsWith('resource-task:'))
    .sort(([, left], [, right]) => left.name.localeCompare(right.name))
    .map(([ref, template]) => ({ ref, template }));
}

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