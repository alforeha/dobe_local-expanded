import { v4 as uuidv4 } from 'uuid';
import type {
  Aspiration,
  Woop,
  ChainUnlockCondition,
  Marker,
  Smarter,
  SmarterCompletionState,
  QuestExitStrategy,
  QuestTimely,
  StatGroupKey,
  TaskTemplate,
  RecurrenceRule,
} from '../../../../../types';
import { makeDefaultChainUnlockCondition } from '../../../../../types';
import { taskTemplateLibrary } from '../../../../../coach';
import { starterTaskTemplates } from '../../../../../coach/StarterQuestLibrary';
import { resolveTaskDisplayName } from '../../../../../utils/resolveTaskDisplayName';
import type { Task } from '../../../../../types/task';

export type GoalPage =
  | { type: 'list' }
  | { type: 'aspiration'; aspirationId: string | null }
  | { type: 'woop'; aspirationId: string; woopIdx: number | null }
  | { type: 'smarter'; aspirationId: string; woopIdx: number; smarterIdx: number | null };

export type QuestUnlockMode = 'immediate' | 'previousComplete' | 'manual';
export type QuestDisplayState = 'pending' | SmarterCompletionState;

export const STAT_GROUP_OPTIONS: StatGroupKey[] = [
  'health',
  'strength',
  'agility',
  'defense',
  'charisma',
  'wisdom',
];

export function createBlankAspiration(owner: string): Aspiration {
  return {
    id: uuidv4(),
    name: '',
    description: '',
    icon: 'quest',
    owner,
    habitat: 'habitats',
    woops: [],
    completionState: 'active',
  };
}

export function createBlankWoop(woopIndex: number): Woop {
  return {
    name: '',
    description: '',
    icon: 'chain',
    wish: '',
    outcome: [],
    obstacle: [],
    plan: {},
    chainReward: '',
    unlockCondition: makeDefaultChainUnlockCondition(woopIndex),
    smarters: [],
    adaptiveSmarters: [],
    completionState: 'active',
  };
}

export function createBlankSmarter(): Smarter {
  return {
    name: '',
    description: '',
    icon: 'quest',
    completionState: 'active',
    specific: {
      targetValue: 1,
      unit: null,
      sourceType: 'taskInput',
      resourceRef: null,
      resourceProperty: null,
    },
    measurable: {},
    attainable: {},
    relevant: {},
    timely: {
      conditionType: 'none',
      interval: null,
      xpThreshold: null,
      markers: [],
      projectedFinish: null,
    },
    exitStrategy: { onMissedFinish: 'sleep' },
    result: {},
    nestedAct: {
      accountability: null,
      commitment: { trackedTaskRefs: [], routineRefs: [] },
      tether: null,
    },
    milestones: [],
    questReward: '',
    progressPercent: 0,
  };
}

interface ActToggle {
  activeChainIndex: number;
  autoAdvanceChains: boolean;
  sleepWithChain: boolean;
}

function makeDefaultActToggle(): ActToggle {
  return {
    activeChainIndex: 0,
    autoAdvanceChains: true,
    sleepWithChain: true,
  };
}

export function getActToggle(aspiration: Aspiration): ActToggle {
  return (aspiration as unknown as { toggle?: ActToggle | null }).toggle ?? makeDefaultActToggle();
}

export function getWoopProgressPercent(woop: Woop): number {
  if (woop.smarters.length === 0) return woop.completionState === 'complete' ? 100 : 0;
  const total = woop.smarters.reduce((sum, smarter) => sum + smarter.progressPercent, 0);
  return Math.round(total / woop.smarters.length);
}

export function getAspirationActiveWoop(aspiration: Aspiration): { woop: Woop | null; index: number } {
  return { woop: aspiration.woops[0] ?? null, index: 0 };
}

export function getUnlockConditionLabel(condition?: ChainUnlockCondition): string {
  switch (condition?.type) {
    case 'date':
      return condition.date ? `Unlocks on ${condition.date}` : 'Unlocks on a date';
    case 'manual':
      return 'Manual activation';
    case 'previousComplete':
      return 'After previous chain';
    case 'immediate':
    default:
      return 'Immediate';
  }
}

export function getQuestUnlockMode(smarter: Smarter): QuestUnlockMode {
  const value = smarter.attainable['unlockCondition'];
  return value === 'manual' || value === 'previousComplete' || value === 'immediate'
    ? value
    : 'previousComplete';
}

export function setQuestUnlockMode(smarter: Smarter, mode: QuestUnlockMode): Smarter {
  return {
    ...smarter,
    attainable: { ...smarter.attainable, unlockCondition: mode },
  };
}

export function getQuestDisplayState(woop: Woop, smarterIdx: number): QuestDisplayState {
  const smarter = woop.smarters[smarterIdx];
  if (!smarter) return 'pending';
  if (smarter.completionState === 'complete' || smarter.completionState === 'failed') {
    return smarter.completionState;
  }

  const unlockMode = getQuestUnlockMode(smarter);
  if (smarterIdx === 0 || unlockMode === 'immediate') return 'active';
  if (unlockMode === 'manual') return 'pending';

  const previousSmarter = woop.smarters[smarterIdx - 1];
  return previousSmarter?.completionState === 'complete' ? 'active' : 'pending';
}

export function createPlaceholderMarker(
  questRef: string,
  taskTemplateRef: string,
  timely: QuestTimely,
  existingMarker?: Marker,
): Marker {
  return {
    questRef,
    conditionType: timely.conditionType,
    triggerSource: existingMarker?.triggerSource ?? 'rollover',
    interval: timely.conditionType === 'interval' ? (timely.interval ?? null) : null,
    xpThreshold: timely.conditionType === 'xpThreshold' ? (timely.xpThreshold ?? null) : null,
    threshold: timely.conditionType === 'taskCount' ? (existingMarker?.threshold ?? 1) : null,
    taskCountScope: timely.conditionType === 'taskCount'
      ? (existingMarker?.taskCountScope ?? {
          type: 'taskTemplateRef',
          ref: taskTemplateRef,
        })
      : null,
    taskTemplateRef,
    lastFired: existingMarker?.lastFired ?? null,
    xpAtLastFire: existingMarker?.xpAtLastFire ?? null,
    taskCountAtLastFire: existingMarker?.taskCountAtLastFire ?? null,
    nextFire: timely.conditionType === 'interval' ? (existingMarker?.nextFire ?? null) : null,
    activeState: existingMarker?.activeState ?? true,
    sideEffects: existingMarker?.sideEffects ?? null,
  };
}

export function normalizeQuestForSave(
  smarter: Smarter,
  aspirationId: string,
  woopIdx: number,
  smarterIdx: number,
  taskCountThreshold: number | null = null,
): Smarter {
  const taskTemplateRef = smarter.measurable.taskTemplateRefs?.[0] ?? smarter.timely.markers[0]?.taskTemplateRef ?? '';
  const questRef = `${aspirationId}|${woopIdx}|${smarterIdx}`;
  const existingMarker = smarter.timely.markers[0];

  let timely: QuestTimely = { ...smarter.timely };
  if (timely.conditionType === 'none') {
    timely = {
      ...timely,
      interval: null,
      xpThreshold: null,
      markers: [],
    };
  } else {
    const marker = createPlaceholderMarker(questRef, taskTemplateRef, timely, existingMarker);
    if (timely.conditionType === 'taskCount') {
      marker.threshold = taskCountThreshold ?? existingMarker?.threshold ?? 1;
      marker.taskCountScope = {
        type: 'taskTemplateRef',
        ref: taskTemplateRef,
      };
    }
    timely = {
      ...timely,
      markers: taskTemplateRef ? [marker] : timely.markers,
    };
  }

  return {
    ...smarter,
    timely,
  };
}

export function normalizeAspirationForSave(aspiration: Aspiration): Aspiration {
  return {
    ...aspiration,
    woops: aspiration.woops.map((woop, woopIdx) => ({
      ...woop,
      unlockCondition: woop.unlockCondition ?? makeDefaultChainUnlockCondition(woopIdx),
    })),
  };
}

export function getQuestStateBadgeClass(state: SmarterCompletionState): string {
  if (state === 'complete') return 'bg-green-100 text-green-700';
  if (state === 'failed') return 'bg-red-100 text-red-700';
  return 'bg-blue-100 text-blue-700';
}

export function getExitStrategyLabel(value: QuestExitStrategy['onMissedFinish']): string {
  switch (value) {
    case 'reschedule':
      return 'Set new end date';
    case 'extend':
      return 'Extend interval';
    case 'sleep':
      return 'Go to sleep';
    case 'restart':
    default:
      return 'Do nothing';
  }
}

const starterTaskTemplateMap = new Map(
  starterTaskTemplates
    .filter((template): template is typeof template & { id: string } => !!template.id)
    .map((template) => [template.id, template]),
);

const bundledTaskTemplateMap = new Map(
  taskTemplateLibrary
    .filter((template): template is typeof template & { id: string } => !!template.id)
    .map((template) => [template.id, template]),
);

const ANY_TASK_DONE_TEMPLATE: TaskTemplate = {
  id: 'task-sys-any-task-done',
  isCustom: false,
  isSystem: true,
  name: 'Task Done',
  description: 'Any non-system task completed today counts toward progress.',
  icon: 'check',
  taskType: 'CHECK',
  inputFields: { label: 'Task Done' },
  xpAward: {
    health: 0,
    strength: 0,
    agility: 0,
    defense: 0,
    charisma: 0,
    wisdom: 0,
  },
  xpBonus: 0,
  cooldown: null,
  media: null,
  items: [],
  secondaryTag: null,
};

function isAnyTaskQuest(quest: Smarter): boolean {
  return quest.timely.conditionType === 'none' &&
    (quest.measurable.taskTemplateRefs?.length ?? 0) === 0 &&
    quest.specific.unit === 'tasks';
}

export function getQuestTaskTemplateRefs(quest: Smarter): string[] {
  if (isAnyTaskQuest(quest)) {
    return [ANY_TASK_DONE_TEMPLATE.id!];
  }

  return Array.from(
    new Set(
      [
        ...(quest.measurable.taskTemplateRefs ?? []),
        ...quest.timely.markers
          .map((marker) => marker.taskTemplateRef)
          .filter((ref): ref is string => !!ref),
      ],
    ),
  );
}

export function getQuestTaskTemplates(
  quest: Smarter,
  scheduleTemplates: Record<string, TaskTemplate>,
): Array<{ ref: string; template: TaskTemplate | null }> {
  if (isAnyTaskQuest(quest)) {
    return [{ ref: ANY_TASK_DONE_TEMPLATE.id!, template: ANY_TASK_DONE_TEMPLATE }];
  }

  return getQuestTaskTemplateRefs(quest).map((ref) => ({
    ref,
    template: scheduleTemplates[ref] ?? starterTaskTemplateMap.get(ref) ?? bundledTaskTemplateMap.get(ref) ?? null,
  }));
}

function formatRecurrenceSummary(rule: RecurrenceRule | null): string {
  if (!rule) return 'custom';
  if (rule.frequency === 'daily') return 'daily';
  if (rule.frequency === 'weekly') return rule.interval > 1 ? `every ${rule.interval} weeks` : 'weekly';
  if (rule.frequency === 'monthly') return rule.interval > 1 ? `every ${rule.interval} months` : 'monthly';
  return rule.interval > 1 ? `every ${rule.interval} custom cycles` : 'custom';
}

export function getQuestMeasurableSummary(
  quest: Smarter,
  scheduleTemplates: Record<string, TaskTemplate>,
): string {
  const templates = getQuestTaskTemplates(quest, scheduleTemplates);
  if (templates.length > 0) {
    const names = templates.map(({ ref }) => {
      const taskForDisplay: Task = {
        id: `quest-display:${ref}`,
        templateRef: ref,
        completionState: 'pending',
        completedAt: null,
        resultFields: {},
        attachmentRef: null,
        resourceRef: null,
        location: null,
        sharedWith: null,
        questRef: null,
        actRef: null,
        secondaryTag: null,
      };
      return resolveTaskDisplayName(taskForDisplay, scheduleTemplates, starterTaskTemplates);
    }).join(', ');
    const targetValue = Math.max(1, quest.specific.targetValue || 1);
    return `Tracking: ${names} (${targetValue} completion${targetValue === 1 ? '' : 's'} needed)`;
  }

  if (quest.measurable.resourceRef) {
    return `Tracking resource: ${quest.measurable.resourceRef}`;
  }

  return 'No measurable templates';
}

export function getQuestTimelySummary(quest: Smarter): string {
  if (quest.timely.conditionType === 'none') return 'No markers (system quest)';
  if (quest.timely.conditionType === 'interval') {
    return `Check-in: ${formatRecurrenceSummary(quest.timely.interval)}`;
  }
  if (quest.timely.conditionType === 'xpThreshold') {
    return `Check-in: every ${quest.timely.xpThreshold ?? 0} XP`;
  }

  const threshold = quest.timely.markers[0]?.threshold ?? 1;
  return `Check-in: every ${threshold} completion${threshold === 1 ? '' : 's'}`;
}
