import { useEffect, useMemo, useState } from 'react';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { completeTask, uncompleteTask, removeTaskFromEvent } from '../../../engine/eventExecution';
import { starterTaskTemplates } from '../../../coach/StarterQuestLibrary';
import type { TaskType, InputFields } from '../../../types/taskTemplate';
import { TaskTypeInputRenderer } from './TaskTypeInputRenderer';
import { getOffsetNow } from '../../../utils/dateUtils';
import { getTaskCooldownState } from '../../../utils/taskCooldown';
import { resolveTaskDisplayName } from '../../../utils/resolveTaskDisplayName';

interface TaskBlockProps {
  taskId: string | null;
  eventId: string;
  onTaskComplete: () => void;
  className?: string;
}

const SECONDARY_TAG_COLOURS: Record<string, string> = {
  fitness: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  nutrition: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  health: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  mindfulness: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  home: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  finance: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  admin: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  learning: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  social: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  work: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
};

function getSubmitLabel(taskType: TaskType): string {
  switch (taskType) {
    case 'TEXT': return 'Save';
    case 'LOG': return 'Save Log';
    case 'FORM': return 'Submit';
    case 'CHECKLIST': return 'Complete';
    case 'CHECK': return 'Complete';
    case 'COUNTER': return 'Log Count';
    default: return 'Mark Done';
  }
}

export function TaskBlock({ taskId, eventId, onTaskComplete, className }: TaskBlockProps) {
  const [nowMs, setNowMs] = useState(() => getOffsetNow().getTime());
  const [resultState, setResultState] = useState<{ taskId: string | null; result: Partial<InputFields> }>({
    taskId: null,
    result: {},
  });
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null);

  const tasks = useScheduleStore((s) => s.tasks);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);
  const task = taskId ? tasks[taskId] : null;
  const template = task
    ? (task.templateRef
       ? taskTemplates[task.templateRef] ??
         starterTaskTemplates.find((t) => t.id === task.templateRef) ??
         null
       : null)
    : null;
  const taskType: TaskType = (task?.isUnique && task.taskType ? task.taskType as TaskType : template?.taskType) ?? 'CHECK';
  const taskDisplayName = task ? resolveTaskDisplayName(task, taskTemplates, starterTaskTemplates) : 'Unknown task';
  const secondaryTag = task?.secondaryTag ?? template?.secondaryTag ?? null;

  const { isCoolingDown, msRemaining, progress } = useMemo(
    () => (
      template && task
        ? getTaskCooldownState(template, task.templateRef ?? '', tasks, nowMs)
        : { lastCompletedAt: null, cooldownMs: 0, cooldownEndAt: null, msRemaining: 0, isCoolingDown: false, progress: 1 }
    ),
    [template, task, tasks, nowMs],
  );

  const blockOpacity = isCoolingDown ? 0.45 + progress * 0.55 : 1;
  const canRepeatAfterCooldown = Boolean(template?.cooldown && task?.completionState === 'complete' && !isCoolingDown);
  const displayTask = canRepeatAfterCooldown && task
    ? { ...task, completionState: 'pending' as const, completedAt: null }
    : task;

  const isComplete = task?.completionState === 'complete' && !canRepeatAfterCooldown;
  const currentResult = resultState.taskId === taskId ? resultState.result : {};
  const confirmDelete = confirmDeleteTaskId === taskId;

  useEffect(() => {
    if (!isCoolingDown) return undefined;
    const interval = window.setInterval(() => setNowMs(getOffsetNow().getTime()), 15000);
    return () => window.clearInterval(interval);
  }, [isCoolingDown]);

  if (!taskId) {
    return (
      <div className={`flex items-center justify-center rounded-lg border border-dashed border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 ${className ?? 'min-h-16'}`}>
        <p className="text-xs text-gray-400">Select a task to begin</p>
      </div>
    );
  }

  const handleComplete = (resultFields: Partial<InputFields>) => {
    if (!task || isCoolingDown) return;
    if (task.completionState === 'complete' && !canRepeatAfterCooldown) return;
    completeTask(taskId, eventId, { resultFields });
    onTaskComplete();
  };

  const handleUndo = () => {
    uncompleteTask(taskId, eventId);
    setResultState({ taskId, result: {} });
  };

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDeleteTaskId(taskId); return; }
    removeTaskFromEvent(taskId, eventId);
  };

  const tagColour = secondaryTag
    ? (SECONDARY_TAG_COLOURS[secondaryTag] ?? 'bg-gray-100 text-gray-600')
    : null;

  return (
    <div
      className={`flex flex-col rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 transition-opacity ${className ?? ''}`}
      style={{ opacity: blockOpacity }}
    >
      {/* TOP — name + tags */}
      <div className="shrink-0 flex items-start justify-between gap-2 px-3 pt-3 pb-2">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          {taskDisplayName}
        </span>
        <div className="flex shrink-0 flex-wrap gap-1">
          {secondaryTag && (
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${tagColour}`}>
              {secondaryTag}
            </span>
          )}
          <span className="rounded bg-purple-100 dark:bg-purple-900/40 px-1.5 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-300">
            {taskType}
          </span>
          {isCoolingDown && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              Cooling down
            </span>
          )}
        </div>
      </div>

      {/* MIDDLE — inputs */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3">
        {isCoolingDown ? (
          <div className="rounded bg-gray-50 px-3 py-3 dark:bg-gray-700/40">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Cooling down</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {Math.max(1, Math.ceil(msRemaining / 60000))} min remaining
            </p>
          </div>
        ) : (
          <TaskTypeInputRenderer
            taskType={taskType}
            template={template}
            task={displayTask ?? null}
            onComplete={handleComplete}
            hideSubmit={true}
            onResultChange={(result) => setResultState({ taskId, result })}
          />
        )}
      </div>

      {/* BOTTOM — action + delete/undo */}
      <div className="shrink-0 flex items-center gap-2 border-t border-gray-100 dark:border-gray-700 px-3 py-2">
        {isComplete ? (
          <>
            <button
              type="button"
              disabled
              className="flex-1 rounded-lg bg-green-100 dark:bg-green-900/30 px-4 py-2 text-sm font-medium text-green-700 dark:text-green-400 cursor-default"
            >
              ✓ Done
            </button>
            <button
              type="button"
              onClick={handleUndo}
              className="rounded-lg border border-amber-400 px-3 py-2 text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            >
              Undo
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={isCoolingDown}
              onClick={() => handleComplete(currentResult)}
              className="flex-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 active:bg-purple-800 disabled:opacity-40 transition-colors"
            >
              {getSubmitLabel(taskType)}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                confirmDelete
                  ? 'border-red-500 bg-red-500 text-white'
                  : 'border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
              }`}
            >
              {confirmDelete ? 'Confirm?' : 'Remove'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
