import type {
  TaskType,
  InputFields,
  CircuitInputFields,
  TaskTemplate,
} from '../../../types/taskTemplate';
import type { Task } from '../../../types/task';
import { CircuitInput } from './inputs/CircuitInput';
import { TaskTypeInputContent } from './TaskTypeInputContent';

interface TaskTypeInputRendererProps {
  taskType: TaskType;
  template: TaskTemplate | null | undefined;
  task: Task | null;
  eventId?: string;
  onComplete: (result: Partial<InputFields>) => void;
  hideSubmit?: boolean;
  onResultChange?: (result: Partial<InputFields>) => void;
}

export function TaskTypeInputRenderer({
  taskType,
  template,
  task,
  eventId,
  onComplete,
  hideSubmit,
  onResultChange,
}: TaskTypeInputRendererProps) {
  if (!task || !template) {
    return (
      <div className="rounded bg-gray-50 px-3 py-2 dark:bg-gray-700">
        <p className="text-xs italic text-gray-400">Task data not available</p>
      </div>
    );
  }

  switch (taskType) {
    case 'CIRCUIT':
      return (
        <CircuitInput
          inputFields={template.inputFields as CircuitInputFields}
          task={task}
          onComplete={onComplete as (r: Partial<CircuitInputFields>) => void}
        />
      );
    default:
      return (
        <TaskTypeInputContent
          taskType={taskType}
          template={template}
          task={task}
          eventId={eventId}
          onComplete={onComplete}
          hideSubmit={hideSubmit}
          onResultChange={onResultChange}
        />
      );
    }
}
