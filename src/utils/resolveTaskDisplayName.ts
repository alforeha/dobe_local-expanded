import type { Task } from '../types/task';
import type { TaskTemplate } from '../types/taskTemplate';
import { taskTemplateLibrary } from '../coach';
import { resolveTaskTemplate } from './resolveTaskTemplate';

export function resolveTaskDisplayName(
  task: Task,
  templates: Record<string, TaskTemplate>,
  starterTemplates: TaskTemplate[],
): string {
  if (task.isUnique === true) {
    return task.title ?? 'Unnamed task';
  }

  const template = task.templateRef
    ? resolveTaskTemplate(task.templateRef, templates, starterTemplates, taskTemplateLibrary)
    : undefined;
  if (template) return template.name;

  return 'Unknown task';
}
