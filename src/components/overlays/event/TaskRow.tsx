import { useMemo } from 'react';
import { starterTaskTemplates } from '../../../coach/StarterQuestLibrary';
import { completeTask, removeTaskFromEvent } from '../../../engine/eventExecution';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { resolveTaskDisplayName } from '../../../utils/resolveTaskDisplayName';
import type { LocationTrailInputFields, TaskType } from '../../../types/taskTemplate';

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
  const template = task?.templateRef ? taskTemplates[task.templateRef] ?? starterTaskTemplates.find((entry) => entry.id === task.templateRef) ?? null : null;

  const taskType = ((task?.isUnique ? task.taskType : template?.taskType) ?? 'CHECK') as TaskType;
  const displayName = task ? resolveTaskDisplayName(task, taskTemplates, starterTaskTemplates) : taskId;
  const stateLabel = task?.completionState === 'complete' ? 'Complete' : task?.completionState === 'skipped' ? 'Skipped' : 'Pending';
  const trailFields = (task?.resultFields ?? {}) as Partial<LocationTrailInputFields>;
  const waypoints = Array.isArray(trailFields.waypoints) ? trailFields.waypoints : [];

  const handleComplete = () => {
    if (!task || task.completionState === 'complete') return;
    completeTask(taskId, eventId, { resultFields: task.resultFields ?? {} });
    onTaskComplete();
  };

  const handleDeleteTask = () => {
    removeTaskFromEvent(taskId, eventId);
  };

  const summary = useMemo(() => {
    if (taskType !== 'LOCATION_TRAIL') return null;
    return `${waypoints.length} waypoint${waypoints.length === 1 ? '' : 's'}`;
  }, [taskType, waypoints.length]);

  if (!task) return null;

  return (
    <div className={`border-b border-gray-100 dark:border-gray-700 ${isSelected ? 'bg-purple-50 dark:bg-purple-900/20' : ''}`}>
      <div className="flex items-start gap-3 px-3 py-3">
        {isEditMode ? (
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 cursor-default items-center justify-center rounded-full border text-sm font-semibold opacity-60 ${
              task.completionState === 'complete'
                ? 'border-green-400 bg-green-100 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300'
                : 'border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500'
            }`}
          >
            {task.completionState === 'complete' ? '✓' : '○'}
          </span>
        ) : (
          <button
            type="button"
            onClick={handleComplete}
            disabled={task.completionState === 'complete'}
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors ${
              task.completionState === 'complete'
                ? 'border-green-500 bg-green-500 text-white'
                : 'border-gray-300 text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {task.completionState === 'complete' ? '✓' : '○'}
          </button>
        )}

        <button
          type="button"
          onClick={() => onSelect(taskId)}
          className="flex min-w-0 flex-1 flex-col items-start text-left"
        >
          <div className="flex w-full items-start justify-between gap-3">
            <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{displayName}</span>
            {!isEditMode && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${task.completionState === 'complete' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                {stateLabel}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">{taskType}</span>
            {summary && <span className="text-xs text-gray-500 dark:text-gray-400">{summary}</span>}
          </div>
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