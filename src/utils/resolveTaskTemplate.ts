import type { TaskTemplate } from '../types/taskTemplate';

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