import { completeTask, type TaskResult as EventTaskResult } from './eventExecution';
import { completeFavourite, completeManualGTDItem } from './listsEngine';
import { completeGTDItem } from './resourceEngine';
import type { Task, TaskCategory } from '../types/task';
import type { InputFields } from '../types/taskTemplate';
import type { User } from '../types/user';

type DispatchTaskResult = EventTaskResult & {
  resultFields: Task['resultFields'];
};

export type DispatchPayload = {
  category: TaskCategory;
  taskId: string;
  eventId?: string;
  result?: DispatchTaskResult;
  taskTemplateRef?: string;
  user?: User;
  resultFields?: Partial<InputFields>;
};

export async function dispatchTaskCompletion(payload: DispatchPayload): Promise<void> {
  switch (payload.category) {
    case 'event':
      completeTask(payload.taskId, payload.eventId!, payload.result!);
      return;
    case 'userTemplate':
      completeFavourite(payload.taskTemplateRef!, payload.user!, payload.resultFields ?? {});
      return;
    case 'resource':
      completeGTDItem(payload.taskId, payload.user!, payload.resultFields ?? {});
      return;
    case 'variable':
      completeManualGTDItem(payload.taskId, payload.user!, payload.resultFields ?? {});
      return;
    case 'system':
      completeFavourite(payload.taskTemplateRef!, payload.user!, payload.resultFields ?? {});
      return;
    case 'goalAction':
      console.warn('goalAction completion not yet implemented');
      return;
    default:
      console.warn(`Unknown task completion category: ${String(payload.category)}`);
      return;
  }
}
