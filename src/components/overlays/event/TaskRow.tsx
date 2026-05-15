import { starterTaskTemplates } from '../../../coach/StarterQuestLibrary';
import { getTaskTypeIconKey, normalizeTaskTemplateIconKey } from '../../../constants/iconMap';
import { completeTask, removeTaskFromEvent } from '../../../engine/eventExecution';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import type { TaskType } from '../../../types/taskTemplate';
import { resolveTaskDisplayName } from '../../../utils/resolveTaskDisplayName';
import { IconDisplay } from '../../shared/IconDisplay';

interface TaskRowProps {
  taskId: string;
  eventId: string;
  isEditMode: boolean;
  isSelected: boolean;
  onSelect: (taskId: string) => void;
  onTaskComplete: () => void;
}

export function TaskRow({ taskId, eventId, isEditMode, isSelected, onSelect, onTaskComplete }: TaskRowProps) {
  const tasks = useScheduleStore((state) => state.tasks);
  const taskTemplates = useScheduleStore((state) => state.taskTemplates);
  const task = tasks[taskId];
  const template = task?.templateRef
    ? taskTemplates[task.templateRef] ?? starterTaskTemplates.find((entry) => entry.id === task.templateRef) ?? null
    : null;

  const taskType = ((task?.isUnique ? task.taskType : template?.taskType) ?? 'CHECK') as TaskType;
  const displayName = task ? resolveTaskDisplayName(task, taskTemplates, starterTaskTemplates) : taskId;
  const taskIconKey = normalizeTaskTemplateIconKey(task?.icon ?? template?.icon ?? getTaskTypeIconKey(taskType), taskType);

  const handleComplete = () => {
    if (!task || task.completionState === 'complete') return;
    completeTask(taskId, eventId, { resultFields: task.resultFields ?? {} });
    onTaskComplete();
  };
  void handleComplete;

  const handleDeleteTask = () => {
    removeTaskFromEvent(taskId, eventId);
  };

  if (!task) return null;

  return (
    <div className={`border-b border-gray-100 dark:border-gray-700 ${isSelected ? 'bg-purple-50 dark:bg-purple-900/20' : ''}`}>
      <div className="flex items-center gap-3 px-3 py-3">
        <span
          className={`flex h-8 w-8 shrink-0 cursor-default items-center justify-center rounded-full border text-sm font-semibold ${
            task.completionState === 'complete'
              ? 'border-green-400 bg-green-100 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300'
              : 'border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500'
          }`}
        >
          {task.completionState === 'complete' ? '✓' : '○'}
        </span>

        <button
          type="button"
          onClick={() => onSelect(taskId)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <IconDisplay iconKey={taskIconKey} size={20} className="h-5 w-5 shrink-0 object-contain opacity-80" alt="" />
          <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{displayName}</span>
        </button>

        {isEditMode && (
          <button
            type="button"
            onClick={handleDeleteTask}
            className="shrink-0 rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
