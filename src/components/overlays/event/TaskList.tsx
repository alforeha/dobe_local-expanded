import { useScheduleStore } from '../../../stores/useScheduleStore';
import { starterTaskTemplates } from '../../../coach/StarterQuestLibrary';
import { resolveTaskDisplayName } from '../../../utils/resolveTaskDisplayName';

interface TaskListProps {
  taskIds: string[];
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
}

const STATE_LABELS: Record<string, string> = {
  pending: 'Pending',
  complete: '✓',
  skipped: 'Skip',
};

export function TaskList({ taskIds, selectedTaskId, onSelect }: TaskListProps) {
  const tasks = useScheduleStore((s) => s.tasks);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);

  if (taskIds.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-xs text-gray-400">No tasks</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {taskIds.map((id) => {
        const task = tasks[id];
        const template = task?.templateRef ? taskTemplates[task.templateRef] : null;
        const displayName = task ? resolveTaskDisplayName(task, taskTemplates, starterTaskTemplates) : id;
        const displayType = task?.isUnique ? task.taskType : template?.taskType;
        const isSelected = id === selectedTaskId;
        const state = task?.completionState ?? 'pending';

        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={`flex w-full items-center px-3 py-2 text-left border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors
              ${isSelected ? 'bg-purple-50 dark:bg-purple-900/20' : ''}`}
          >
            <span className="flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">{displayName}</span>
            <span className="w-20 text-center text-xs text-gray-500">{displayType ?? '—'}</span>
            <span className={`w-16 text-right text-xs font-medium
              ${state === 'complete' ? 'text-green-600' : state === 'skipped' ? 'text-gray-400' : 'text-gray-500'}`}>
              {STATE_LABELS[state] ?? state}
            </span>
          </button>
        );
      })}
    </div>
  );
}
