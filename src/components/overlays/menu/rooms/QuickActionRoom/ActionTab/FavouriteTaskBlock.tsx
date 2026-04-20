import { useEffect, useMemo, useState } from 'react';
import type { Task, TaskTemplate } from '../../../../../../types';
import type { InputFields, XpAward } from '../../../../../../types/taskTemplate';
import type { StatGroupKey } from '../../../../../../types/user';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { completeFavourite } from '../../../../../../engine/listsEngine';
import { getTaskTypeIconKey, resolveIcon } from '../../../../../../constants/iconMap';
import { GlowRing } from '../../../../../shared/GlowRing';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { TaskTemplateIcon } from '../../../../../shared/TaskTemplateIcon';
import { ONBOARDING_GLOW } from '../../../../../../constants/onboardingKeys';
import { useGlows } from '../../../../../../hooks/useOnboardingGlow';
import { TaskTypeInputRenderer } from '../../../../event/TaskTypeInputRenderer';
import { getCurrentAppNowMs, getTaskCooldownState } from '../../../../../../utils/taskCooldown';

interface FavouriteTaskBlockProps {
  templateKey: string;
  template: TaskTemplate;
}

const STAT_KEYS: StatGroupKey[] = [
  'health',
  'strength',
  'agility',
  'defense',
  'charisma',
  'wisdom',
];

function getPrimaryStatKey(xpAward: XpAward): StatGroupKey | null {
  let best: StatGroupKey | null = null;
  let bestVal = 0;
  for (const key of STAT_KEYS) {
    const value = xpAward[key];
    if (value > bestVal) {
      bestVal = value;
      best = key;
    }
  }
  return best;
}

export function FavouriteTaskBlock({ templateKey, template }: FavouriteTaskBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [nowMs, setNowMs] = useState(() => getCurrentAppNowMs());
  const user = useUserStore((s) => s.user);
  const tasks = useScheduleStore((s) => s.tasks);
  const favouriteActionGlows = useGlows(ONBOARDING_GLOW.FAVOURITE_ACTION);
  const statKey = getPrimaryStatKey(template.xpAward);
  const taskTypeIconKey = getTaskTypeIconKey(template.taskType);
  const { isCoolingDown, msRemaining, progress } = useMemo(
    () => getTaskCooldownState(template, templateKey, tasks, nowMs),
    [template, templateKey, tasks, nowMs],
  );
  const cooldownOverlayWidth = isCoolingDown ? `${Math.max(0, (1 - progress) * 100)}%` : '0%';

  const previewTask: Task = {
    id: `favourite-preview-${templateKey}`,
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
  };

  useEffect(() => {
    if (!isCoolingDown) return undefined;

    const interval = window.setInterval(() => {
      setNowMs(getCurrentAppNowMs());
    }, 15000);

    return () => window.clearInterval(interval);
  }, [isCoolingDown]);

  function handleComplete(resultFields: Partial<InputFields>) {
    if (!user) return;
    if (isCoolingDown) return;
    completeFavourite(templateKey, user, resultFields);
    setExpanded(false);
  }

  return (
    <GlowRing active={favouriteActionGlows} rounded="lg" className="block">
      <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {isCoolingDown && (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 z-10 bg-white/60 dark:bg-gray-900/65"
            style={{ width: cooldownOverlayWidth }}
          />
        )}
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="flex w-full items-center gap-3 px-3 py-3 text-left"
        >
          <IconDisplay iconKey={statKey ?? 'agility'} size={20} className="h-5 w-5 shrink-0 object-contain" alt="" />
          <IconDisplay iconKey={taskTypeIconKey} size={20} className="h-5 w-5 shrink-0 object-contain" alt="" />
          <TaskTemplateIcon iconKey={template.icon} size={22} className="h-[22px] w-[22px] shrink-0 object-contain" alt="" />
          <span className="flex-1 flex items-center gap-2 min-w-0">
            <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
              {template.name}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {template.secondaryTag && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                {template.secondaryTag}
              </span>
            )}
            {isCoolingDown && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                {Math.max(1, Math.ceil(msRemaining / 60000))}m
              </span>
            )}
            <span className="text-sm text-gray-500 dark:text-gray-300">
              {resolveIcon(expanded ? 'collapse' : 'expand')}
            </span>
          </span>
        </button>

        {expanded && (
          <div className="border-t border-gray-200 px-3 py-3 dark:border-gray-700">
            {template.description && (
              <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
                {template.description}
              </p>
            )}
            {isCoolingDown ? (
              <div className="rounded-xl bg-gray-100 px-3 py-3 dark:bg-gray-900/40">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Cooling down</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {Math.max(1, Math.ceil(msRemaining / 60000))} min remaining
                </p>
              </div>
            ) : (
              <TaskTypeInputRenderer
                taskType={template.taskType}
                template={template}
                task={previewTask}
                onComplete={handleComplete}
              />
            )}
          </div>
        )}
      </div>
    </GlowRing>
  );
}
