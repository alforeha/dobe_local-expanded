import type { Task } from '../types/task';
import type { TaskTemplate } from '../types/taskTemplate';

export function resolveTaskDisplayName(
  task: Task,
  templates: Record<string, TaskTemplate>,
  starterTemplates: TaskTemplate[],
): string {
  if (task.isUnique === true) {
    return task.title ?? 'Unnamed task';
  }

  const template = task.templateRef ? templates[task.templateRef] : null;
  if (template) return template.name;

  const starterTemplate = starterTemplates.find((template) => template.id === task.templateRef);
  if (starterTemplate) return starterTemplate.name;

  return 'Unknown task';
}
