import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Task, TaskTemplate } from '../../../../../types';
import type { InputFields, TaskSecondaryTag, XpAward } from '../../../../../types/taskTemplate';
import type { StatGroupKey } from '../../../../../types/user';
import { getTaskTypeIconKey, resolveIcon } from '../../../../../constants/iconMap';
import { useUserStore } from '../../../../../stores/useUserStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { GlowRing } from '../../../../shared/GlowRing';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { TaskTemplateIcon } from '../../../../shared/TaskTemplateIcon';
import { ONBOARDING_GLOW } from '../../../../../constants/onboardingKeys';
import { useGlows } from '../../../../../hooks/useOnboardingGlow';
import { autoCompleteSystemTask } from '../../../../../engine/resourceEngine';
import { getCurrentAppNowMs, getTaskCooldownState } from '../../../../../utils/taskCooldown';
import {
  formatLastCompleted,
  getLastCompletedForTemplate,
  getNextScheduledForTemplate,
} from '../../../../../utils/resourceTaskUtils';
import { completeTask } from '../../../../../engine/eventExecution';
import { TaskTypeInputRenderer } from '../../../event/TaskTypeInputRenderer';
import type { TaskRoomBodyMode } from './TaskRoomBody';

interface TaskBlockProps {
  templateKey: string;
  template: TaskTemplate;
  isCustom: boolean;
  mode: TaskRoomBodyMode;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit?: () => void;
  className?: string;
}

const STAT_KEYS: StatGroupKey[] = ['health', 'strength', 'agility', 'defense', 'charisma', 'wisdom'];

const SECONDARY_TAG_COLOURS: Record<TaskSecondaryTag, string> = {
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

function getPrimaryStatKey(xpAward: XpAward): StatGroupKey | null {
  let best: StatGroupKey | null = null;
  let bestValue = 0;

  for (const stat of STAT_KEYS) {
    const value = xpAward[stat] ?? 0;
    if (value > bestValue) {
      best = stat;
      bestValue = value;
    }
  }

  return best;
}

function summariseInputFields(inputFields: TaskTemplate['inputFields']): string[] {
  return Object.entries(inputFields).map(([key, value]) => {
    if (Array.isArray(value)) {
      const formatted = value
        .map((entry) => {
          if (entry && typeof entry === 'object') {
            if ('label' in entry && typeof entry.label === 'string') return entry.label;
            if ('key' in entry && typeof entry.key === 'string') return entry.key;
          }
          return String(entry);
        })
        .join(', ');
      return `${key}: ${formatted || '—'}`;
    }

    if (value && typeof value === 'object') {
      return `${key}: ${Object.entries(value)
        .map(([nestedKey, nestedValue]) => `${nestedKey}=${String(nestedValue)}`)
        .join(', ')}`;
    }

    return `${key}: ${value === null || value === undefined || value === '' ? '—' : String(value)}`;
  });
}

function formatMinutesRemaining(msRemaining: number): string {
  return `${Math.max(1, Math.ceil(msRemaining / 60000))} min remaining`;
}

function getActionButtonClassName(disabled = false): string {
  return `rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
    disabled
      ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500'
      : 'border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'
  }`;
}

export function TaskBlock({ templateKey, template, isCustom, mode, expanded, onToggleExpand, onEdit, className }: TaskBlockProps) {
  const [showCompleteInput, setShowCompleteInput] = useState(false);
  const [nowMs, setNowMs] = useState(() => getCurrentAppNowMs());

  const favouritesList = useUserStore((s) => s.user?.lists.favouritesList ?? []);
  const addFavourite = useUserStore((s) => s.addFavourite);
  const removeFavourite = useUserStore((s) => s.removeFavourite);
  const tasks = useScheduleStore((s) => s.tasks);
  const setTask = useScheduleStore((s) => s.setTask);
  const isFavourited = favouritesList.includes(templateKey);
  const starGlows = useGlows(ONBOARDING_GLOW.TASK_FAVOURITE_STAR);
  const isFavoriteTab = mode === 'favorites';

  const primaryStat = getPrimaryStatKey(template.xpAward);
  const taskTypeIconKey = getTaskTypeIconKey(template.taskType);
  const secondaryTagColour = template.secondaryTag
    ? SECONDARY_TAG_COLOURS[template.secondaryTag] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
    : null;
  const inputSummary = useMemo(() => summariseInputFields(template.inputFields), [template.inputFields]);
  const lastExecuted = getLastCompletedForTemplate(template.id ?? templateKey);
  const nextScheduled = getNextScheduledForTemplate(template.id ?? templateKey);
  const { isCoolingDown, msRemaining, progress: cooldownProgress } = useMemo(
    () => getTaskCooldownState(template, templateKey, tasks, nowMs),
    [template, templateKey, tasks, nowMs],
  );
  const cooldownOverlayWidth = isCoolingDown ? `${Math.max(0, (1 - cooldownProgress) * 100)}%` : '0%';
  const previewTask: Task = useMemo(
    () => ({
      id: `task-room-preview-${templateKey}`,
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

  function handleStarClick() {
    if (isFavoriteTab) return;

    if (isFavourited) {
      removeFavourite(templateKey);
    } else {
      addFavourite(templateKey);
      autoCompleteSystemTask('task-sys-add-favourite');
    }
  }

  function handleInlineComplete(resultFields: Partial<InputFields>) {
    const taskId = uuidv4();
    const eventId = `task-room-inline-${taskId}`;

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

    setShowCompleteInput(false);
    onToggleExpand();
  }

  return (
    <div className={`relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 ${className ?? ''}`}>
      {!expanded ? (
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex w-full items-center gap-3 px-3 py-3 text-left"
          aria-expanded={false}
        >
          <span className="shrink-0" aria-hidden="true">
            <TaskTemplateIcon iconKey={template.icon} size={16} className="h-4 w-4 object-contain" alt="" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {template.name}
          </span>
          <span
            className={`shrink-0 text-lg leading-none ${isFavourited ? 'text-amber-400' : 'text-gray-300 dark:text-gray-600'}`}
            aria-hidden="true"
          >
            {isFavourited ? resolveIcon('star') : resolveIcon('star-outline')}
          </span>
        </button>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          {isCoolingDown && (
            <div
              className="pointer-events-none absolute inset-y-0 left-0 z-10 bg-white/60 dark:bg-gray-900/65"
              style={{ width: cooldownOverlayWidth }}
            />
          )}

          <div className="flex items-start gap-3 border-b border-gray-200 px-4 py-4 dark:border-gray-700">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-700">
              <TaskTemplateIcon iconKey={template.icon} size={30} className="h-8 w-8 object-contain" alt="" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{template.name}</h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    {template.description || 'No description yet.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onToggleExpand}
                  aria-label="Collapse task details"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-300 text-gray-500 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {resolveIcon('close')}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  <IconDisplay iconKey={primaryStat ?? 'agility'} size={16} className="h-4 w-4 object-contain" alt="" />
                  {primaryStat ?? 'No stat'}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  <IconDisplay iconKey={taskTypeIconKey} size={16} className="h-4 w-4 object-contain" alt="" />
                  {template.taskType}
                </span>
                {template.secondaryTag && secondaryTagColour && (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${secondaryTagColour}`}>
                    {template.secondaryTag}
                  </span>
                )}
                {template.cooldown !== null && (
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    Cooldown {template.cooldown} min
                  </span>
                )}
                {isCoolingDown && (
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    {formatMinutesRemaining(msRemaining)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {!showCompleteInput ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-gray-50 px-3 py-3 dark:bg-gray-900/40">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Task Inputs
                    </p>
                    {!isCustom && (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        Library template
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1">
                    {inputSummary.map((line) => (
                      <p key={line} className="text-sm text-gray-700 dark:text-gray-300">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>

                {lastExecuted && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Last executed: {formatLastCompleted(lastExecuted)}
                  </div>
                )}

                {nextScheduled && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Next scheduled: {nextScheduled}
                  </div>
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

          <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
            <div className="flex flex-wrap gap-2">
              <div title={isFavoriteTab ? 'You can unstar from User Tasks or Library' : undefined}>
                <GlowRing active={!isFavoriteTab && starGlows} className="inline-flex">
                  <button
                    type="button"
                    onClick={handleStarClick}
                    disabled={isFavoriteTab}
                    aria-label={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
                    className={getActionButtonClassName(isFavoriteTab)}
                  >
                    {isFavourited ? '⭐ Starred' : '☆ Star'}
                  </button>
                </GlowRing>
              </div>

              {!showCompleteInput && mode === 'userTasks' && isCustom && onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className={getActionButtonClassName()}
                >
                  ✏️ Edit
                </button>
              )}

              {!showCompleteInput ? (
                <button
                  type="button"
                  disabled={isCoolingDown}
                  onClick={() => {
                    if (isCoolingDown) return;
                    setShowCompleteInput(true);
                  }}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    isCoolingDown
                      ? 'cursor-not-allowed bg-gray-300 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                >
                  {isCoolingDown ? 'Cooling down' : '✓ Complete Task'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCompleteInput(false)}
                  className={getActionButtonClassName()}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
