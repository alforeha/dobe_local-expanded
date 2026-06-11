import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Task, TaskTemplate } from '../../../types';
import type { InputFields } from '../../../types/taskTemplate';
import { ONBOARDING_GLOW } from '../../../constants/onboardingKeys';
import { autoCompleteSystemTask } from '../../../engine/resourceEngine';
import { completeTask } from '../../../engine/eventExecution';
import { useGlows } from '../../../hooks/useOnboardingGlow';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { useUserStore } from '../../../stores/useUserStore';
import { getAppDate } from '../../../utils/dateUtils';
import { getCurrentAppNowMs, getTaskCooldownState } from '../../../utils/taskCooldown';
import { buildTaskInputFields } from '../../../utils/taskUtils';
import { formatLastCompleted, getLastCompletedForTemplate } from '../../../utils/resourceTaskUtils';
import { TaskTypeInputRenderer } from '../../overlays/event/TaskTypeInputRenderer';
import { GlowRing } from '../GlowRing';

interface HabitatRowExpandedProps {
  templateKey: string;
  template: TaskTemplate;
  /** Collapses the takeover, e.g. after an inline execution completes. */
  onCollapse?: () => void;
  /** Fires after an inline execution completes — e.g. to log against the meal log. */
  onExecuted?: (resultFields: Partial<InputFields>) => void;
  /** Shown as the Configure action when provided. */
  onConfigure?: () => void;
  /**
   * Render the Execute action. Default true. Pass false for rows that are not
   * task-backed (e.g. resource date rows: birthdays, insurance dates).
   */
  showExecute?: boolean;
  /** Optional detail content rendered above the action bar (description, stats, ...). */
  children?: ReactNode;
}

function actionButtonClassName(disabled = false): string {
  return `rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
    disabled
      ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500'
      : 'border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'
  }`;
}

/**
 * Habitat row takeover content for task-template-backed rows: detail body plus
 * the standard bottom action bar — Execute · Favorite · GTD · Configure.
 * Action logic extracted from the retired TaskRoom TaskBlock.
 */
export function HabitatRowExpanded({
  templateKey,
  template,
  onCollapse,
  onExecuted,
  onConfigure,
  showExecute = true,
  children,
}: HabitatRowExpandedProps) {
  const [showExecuteInput, setShowExecuteInput] = useState(false);
  const [nowMs, setNowMs] = useState(() => getCurrentAppNowMs());

  const favouritesList = useUserStore((s) => s.user?.lists.favouritesList ?? []);
  const addFavourite = useUserStore((s) => s.addFavourite);
  const removeFavourite = useUserStore((s) => s.removeFavourite);
  const tasks = useScheduleStore((s) => s.tasks);
  const setTask = useScheduleStore((s) => s.setTask);
  const isFavourited = favouritesList.includes(templateKey);
  const starGlows = useGlows(ONBOARDING_GLOW.TASK_FAVOURITE_STAR);

  const lastExecuted = getLastCompletedForTemplate(template.id ?? templateKey);
  const { isCoolingDown, msRemaining } = useMemo(
    () => getTaskCooldownState(template, templateKey, tasks, nowMs),
    [template, templateKey, tasks, nowMs],
  );

  const previewTask: Task = useMemo(
    () => ({
      id: `habitat-preview-${templateKey}`,
      templateRef: templateKey,
      completionState: 'pending',
      completedAt: null,
      resultFields: {},
      attachmentRef: null,
      resourceRef: null,
      location: null,
      sharedWith: null,
      questRef: null,
      actRef: null,
      secondaryTag: template.secondaryTag,
    }),
    [template.secondaryTag, templateKey],
  );

  useEffect(() => {
    if (!isCoolingDown) return undefined;

    const interval = window.setInterval(() => {
      setNowMs(getCurrentAppNowMs());
    }, 15000);

    return () => window.clearInterval(interval);
  }, [isCoolingDown]);

  function handleFavouriteClick() {
    if (isFavourited) {
      removeFavourite(templateKey);
    } else {
      addFavourite(templateKey);
      autoCompleteSystemTask('task-sys-add-favourite');
    }
  }

  function handleInlineComplete(resultFields: Partial<InputFields>) {
    const taskId = uuidv4();
    const eventId = `habitat-inline-${taskId}`;

    setTask({
      id: taskId,
      templateRef: templateKey,
      completionState: 'pending',
      completedAt: null,
      resultFields: {},
      attachmentRef: null,
      resourceRef: null,
      location: null,
      sharedWith: null,
      questRef: null,
      actRef: null,
      secondaryTag: template.secondaryTag,
    });

    completeTask(taskId, eventId, { resultFields });

    onExecuted?.(resultFields);
    setShowExecuteInput(false);
    onCollapse?.();
  }

  const pushToGtd = useCallback(() => {
    const latestUser = useUserStore.getState().user;
    if (!latestUser || !template) return;

    const dueDate = getAppDate();
    const templateRef = `user-task:${template.id ?? templateKey}`;
    const existingPending = latestUser.lists.gtdList.find((tid) => {
      const t = useScheduleStore.getState().tasks[tid];
      if (!t || t.completionState !== 'pending') return false;
      const fields = t.resultFields as Record<string, unknown>;
      return fields.templateRef === templateRef && fields.dueDate === dueDate;
    });
    if (existingPending) return;

    const taskType = template.taskType ?? 'CHECK';
    const nextTask: Task = {
      id: uuidv4(),
      templateRef,
      isUnique: true,
      title: template.name ?? 'Untitled Task',
      icon: template.icon ?? undefined,
      taskType,
      completionState: 'pending',
      completedAt: null,
      resultFields: ({
        ...buildTaskInputFields(taskType, template.name ?? '', (template.inputFields ?? {}) as unknown as Record<string, unknown>),
        templateRef,
        dueDate,
        label: template.name ?? 'Untitled Task',
      } as unknown) as Task['resultFields'],
      attachmentRef: null,
      resourceRef: template.id ?? null,
      location: null,
      sharedWith: null,
      questRef: null,
      actRef: null,
      secondaryTag: null,
    };
    const { setTask: setScheduleTask } = useScheduleStore.getState();
    const { setUser } = useUserStore.getState();
    setScheduleTask(nextTask);
    setUser({
      ...latestUser,
      lists: {
        ...latestUser.lists,
        gtdList: [...new Set([...latestUser.lists.gtdList, nextTask.id])],
      },
    });
  }, [template, templateKey]);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!showExecuteInput ? (
          <div className="space-y-3">
            {children ?? (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {template.description || 'No description yet.'}
              </p>
            )}

            {isCoolingDown && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Cooling down · {Math.max(1, Math.ceil(msRemaining / 60000))} min remaining
              </p>
            )}

            {lastExecuted && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Last executed: {formatLastCompleted(lastExecuted)}
              </p>
            )}
          </div>
        ) : (
          <TaskTypeInputRenderer
            taskType={template.taskType}
            template={template}
            task={previewTask}
            onComplete={handleInlineComplete}
          />
        )}
      </div>

      <div className="mt-auto shrink-0 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex flex-wrap gap-2">
          {!showExecuteInput ? (
            <>
              {showExecute && (
                <button
                  type="button"
                  disabled={isCoolingDown}
                  onClick={() => {
                    if (isCoolingDown) return;
                    setShowExecuteInput(true);
                  }}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    isCoolingDown
                      ? 'cursor-not-allowed bg-gray-300 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      : 'bg-accent text-white hover:bg-accent/90'
                  }`}
                >
                  {isCoolingDown ? 'Cooling down' : '▶ Execute'}
                </button>
              )}

              <GlowRing active={starGlows} className="inline-flex">
                <button
                  type="button"
                  onClick={handleFavouriteClick}
                  aria-label={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
                  className={actionButtonClassName()}
                >
                  {isFavourited ? '⭐ Favorited' : '☆ Favorite'}
                </button>
              </GlowRing>

              <button
                type="button"
                onClick={pushToGtd}
                className="rounded-xl border border-accent-border px-3 py-2 text-sm font-medium text-accent hover:bg-accent-bg"
              >
                + GTD
              </button>

              {onConfigure && (
                <button
                  type="button"
                  onClick={onConfigure}
                  className={actionButtonClassName()}
                >
                  ⚙ Configure
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowExecuteInput(false)}
              className={actionButtonClassName()}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </>
  );
}
