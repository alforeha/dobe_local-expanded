import { v4 as uuidv4 } from 'uuid';
import type { GoalActionSubtype, Task } from '../types/task';

export function createGoalActionTask(params: {
  subtype: GoalActionSubtype;
  goalRef: string;
  templateRef: string | null;
  title: string;
  icon?: string;
  description?: string;
}): Task {
  return {
    id: uuidv4(),
    category: 'goalAction',
    goalActionSubtype: params.subtype,
    goalRef: params.goalRef,
    templateRef: params.templateRef,
    isUnique: false,
    title: params.title,
    icon: params.icon ?? '',
    description: params.description ?? null,
    taskType: null,
    xpAward: null,
    xpAwarded: false,
    completionState: 'pending',
    completedAt: null,
    resultFields: {},
    attachmentRef: null,
    resourceRef: null,
    location: null,
    sharedWith: null,
    questRef: null,
    actRef: null,
    secondaryTag: null,
  };
}
