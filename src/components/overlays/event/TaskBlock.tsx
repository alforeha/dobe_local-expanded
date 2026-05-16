import { useCallback, useEffect, useMemo, useState } from 'react';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { useResourceStore } from '../../../stores/useResourceStore';
import { completeTask, uncompleteTask, removeTaskFromEvent } from '../../../engine/eventExecution';
import { starterTaskTemplates } from '../../../coach/StarterQuestLibrary';
import type { TaskType, InputFields, TaskTemplate } from '../../../types/taskTemplate';
import type { AccountResource } from '../../../types/resource';
import { TaskTypeInputRenderer } from './TaskTypeInputRenderer';
import { IconDisplay } from '../../shared/IconDisplay';
import { getOffsetNow } from '../../../utils/dateUtils';
import { getTaskCooldownState } from '../../../utils/taskCooldown';
import { resolveTaskDisplayName } from '../../../utils/resolveTaskDisplayName';
import type { Task } from '../../../types/task';

interface TaskBlockProps {
  taskId: string | null;
  eventId: string;
  onTaskComplete: () => void;
  onPreviewResultChange?: (taskId: string, result: Partial<InputFields>) => void;
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

function buildUniqueTaskTemplate(task: Task | null): TaskTemplate | null {
  if (!task?.isUnique || !task.taskType) return null;

  return {
    name: task.title ?? 'Unique task',
    description: '',
    icon: 'task',
    taskType: task.taskType as TaskType,
    inputFields: task.resultFields as InputFields,
    xpAward: {
      health: 0,
      strength: 0,
      agility: 0,
      defense: 0,
      charisma: 0,
      wisdom: 0,
    },
    cooldown: null,
    media: null,
    items: [],
    secondaryTag: task.secondaryTag ?? null,
  };
}

export function TaskBlock({ taskId, eventId, onTaskComplete, onPreviewResultChange, className }: TaskBlockProps) {
  const [nowMs, setNowMs] = useState(() => getOffsetNow().getTime());
  const [resultState, setResultState] = useState<{ taskId: string | null; result: Partial<InputFields> }>({
    taskId: null,
    result: {},
  });
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null);

  const tasks = useScheduleStore((s) => s.tasks);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);
  const resources = useResourceStore((s) => s.resources);
  const task = taskId ? tasks[taskId] : null;
  const resolvedTemplate = task?.templateRef
    ? taskTemplates[task.templateRef] ?? starterTaskTemplates.find((t) => t.id === task.templateRef) ?? null
    : null;
  const template = task
    ? (resolvedTemplate ?? buildUniqueTaskTemplate(task))
    : null;
  const taskType: TaskType = (task?.isUnique && task.taskType ? task.taskType as TaskType : template?.taskType) ?? 'CHECK';
  const taskDisplayName = task ? resolveTaskDisplayName(task, taskTemplates, starterTaskTemplates) : 'Unknown task';
  const secondaryTag = task?.secondaryTag ?? template?.secondaryTag ?? null;
  const resource = task?.resourceRef ? resources[task.resourceRef] : null;
  const accountResource: AccountResource | null = resource?.type === 'account' ? resource : null;
  const linkedAccount = accountResource?.pullFromAccountId
    ? resources[accountResource.pullFromAccountId] ?? null
    : null;
  const isTransactionLog =
    accountResource != null &&
    (
      typeof (task?.resultFields as Record<string, unknown> | undefined)?.resourceTaskId === 'string' ||
      Boolean(accountResource.accountTasks?.some((t) => t.id && task?.title === t.name && t.kind === 'transaction-log'))
    );
  const [txAmount, setTxAmount] = useState<string>(
    (task?.resultFields as Record<string, unknown> | undefined)?.anticipatedValue != null
      ? String((task?.resultFields as Record<string, unknown>).anticipatedValue)
      : '',
  );
  const [txNote, setTxNote] = useState<string>('');

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
  const currentResult = useMemo(
    () => (resultState.taskId === taskId ? resultState.result : {}),
    [resultState.result, resultState.taskId, taskId],
  );
  const confirmDelete = confirmDeleteTaskId === taskId;

  useEffect(() => {
    if (!isCoolingDown) return undefined;
    const interval = window.setInterval(() => setNowMs(getOffsetNow().getTime()), 15000);
    return () => window.clearInterval(interval);
  }, [isCoolingDown]);

  useEffect(() => {
    if (!taskId) return;
    onPreviewResultChange?.(taskId, currentResult);
  }, [currentResult, onPreviewResultChange, taskId]);

  const handleResultChange = useCallback(
    (result: Partial<InputFields>) => {
      if (!taskId) return;
      setResultState({ taskId, result });
      onPreviewResultChange?.(taskId, result);
    },
    [taskId, onPreviewResultChange],
  );

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
    setResultState({ taskId, result: {} });
    onPreviewResultChange?.(taskId, {});
    onTaskComplete();
  };

  const handleUndo = () => {
    uncompleteTask(taskId, eventId);
    setResultState({ taskId, result: {} });
    onPreviewResultChange?.(taskId, {});
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
        {isTransactionLog ? (
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
            <IconDisplay iconKey={accountResource?.icon ?? 'finance'} size={18} className="h-[18px] w-[18px] object-contain" alt="" />
            <span>{accountResource?.name ?? 'Account'} · Transaction</span>
          </div>
        ) : (
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {taskDisplayName}
          </span>
        )}
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
        ) : task && isTransactionLog && !isComplete ? (
          <div className="space-y-3 py-1">
            {linkedAccount ? (
              <div className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-gray-700 shadow-sm dark:bg-gray-800 dark:text-gray-200">
                <span>{accountResource?.kind === 'income' ? 'Deposits into:' : 'Withdraws from:'}</span>
                <IconDisplay
                  iconKey={linkedAccount.icon}
                  size={16}
                  className="h-4 w-4 object-contain"
                  alt=""
                />
                <span className="font-medium">{linkedAccount.name}</span>
              </div>
            ) : null}

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Amount</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={txAmount}
                onChange={(event) => setTxAmount(event.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Note (optional)</label>
              <input
                type="text"
                value={txNote}
                onChange={(event) => setTxNote(event.target.value)}
                placeholder="Add a note"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>

            <button
              type="button"
              disabled={txAmount === ''}
              onClick={() => {
                const direction = accountResource?.kind === 'income' ? 'deposit' : 'withdrawal';
                handleComplete(({
                  ...task.resultFields,
                  amount: parseFloat(txAmount),
                  note: txNote.trim(),
                  value: txNote.trim() || txAmount,
                  direction,
                  newBalance:
                    accountResource?.kind === 'bank'
                      ? direction === 'deposit'
                        ? (accountResource.balance ?? 0) + parseFloat(txAmount)
                        : (accountResource.balance ?? 0) - parseFloat(txAmount)
                      : undefined,
                  linkedAccountId: accountResource?.pullFromAccountId ?? undefined,
                  linkedAccountName: linkedAccount?.name ?? undefined,
                  linkedAccountIcon: linkedAccount?.icon ?? undefined,
                } as unknown) as Partial<InputFields>);
              }}
              className="w-full rounded-lg bg-purple-600 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-40"
            >
              Confirm
            </button>
          </div>
        ) : task && isTransactionLog && isComplete ? (
          <div className="space-y-3 py-1">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
              <div className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-200">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {String(
                    (task.resultFields as Record<string, unknown> | undefined)?.value ??
                    (task.resultFields as Record<string, unknown> | undefined)?.amount ??
                    '',
                  )}
                </span>
                {typeof (task.resultFields as Record<string, unknown> | undefined)?.direction === 'string' && (
                  <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {(task.resultFields as Record<string, unknown>).direction === 'deposit' ? 'Deposited' : 'Withdrawn'}
                  </span>
                )}
                {linkedAccount && (
                  <div className="inline-flex items-center gap-2">
                    <IconDisplay iconKey={linkedAccount.icon ?? 'finance'} size={16} className="h-4 w-4 object-contain" alt="" />
                    <span>{linkedAccount.name}</span>
                  </div>
                )}
                {(task.resultFields as Record<string, unknown> | undefined)?.newBalance != null && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Balance: {String((task.resultFields as Record<string, unknown>).newBalance)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          !isTransactionLog && (
            <TaskTypeInputRenderer
              taskType={taskType}
              template={template}
              task={displayTask ?? null}
              eventId={eventId}
              onComplete={handleComplete}
              hideSubmit={true}
              onResultChange={handleResultChange}
            />
          )
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
