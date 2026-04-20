// ─────────────────────────────────────────
// QUEST ENGINE — condition evaluation, progress calculation, projectedFinish
//
// evaluateQuestSpecific() — routes to taskInput or resourceRef evaluation path (D01)
// evaluateMarkerCondition() — xpThreshold delta check only; interval handled by rollover
// deriveQuestProgress()    — returns 0–100 from measured value vs targetValue
// updateQuestProgress()    — persists progressPercent + projectedFinish to Quest
// computeProjectedFinish() — XP rate estimate per Q01 Option B (pending PM confirm)
// ─────────────────────────────────────────

import type { Quest } from '../types/act';
import type { Task } from '../types/task';
import type { Marker } from '../types/quest/Marker';
import type { RecurrenceRule } from '../types/taskTemplate';
import { useProgressionStore } from '../stores/useProgressionStore';
import { useScheduleStore } from '../stores/useScheduleStore';
import { useResourceStore } from '../stores/useResourceStore';
import { useUserStore } from '../stores/useUserStore';
import { localISODate, getAppDate } from '../utils/dateUtils';
import { starterTaskTemplates, STARTER_ACT_IDS } from '../coach/StarterQuestLibrary';

// ── HELPERS ────────────────────────────────────────────────────────────────────────────────

function todayISO(): string {
  return getAppDate();
}

function isDailyQuestRef(questRef: string | null | undefined): boolean {
  return typeof questRef === 'string' && questRef.startsWith(STARTER_ACT_IDS.daily);
}

function isTodayCompletion(completedAt: string | null | undefined): boolean {
  if (typeof completedAt !== 'string') return false;
  return localISODate(new Date(completedAt)) === getAppDate();
}

function isAnyTaskQuest(quest: Quest): boolean {
  return quest.timely.conditionType === 'none' &&
    (quest.measurable.taskTemplateRefs?.length ?? 0) === 0 &&
    quest.specific.unit === 'tasks';
}

function getResourcePropertyValue(resource: unknown, property: string): unknown {
  if (!resource || typeof resource !== 'object') return undefined;
  const record = resource as Record<string, unknown>;
  if (property in record) return record[property];

  const meta = record.meta;
  if (meta && typeof meta === 'object') {
    return (meta as Record<string, unknown>)[property];
  }

  return undefined;
}

function countCompletedTaskTemplateRefs(
  taskTemplateRefs: string[],
  options?: { todayOnly?: boolean },
): number {
  if (taskTemplateRefs.length === 0) return 0;
  const { tasks } = useScheduleStore.getState();
  const measurableSet = new Set(taskTemplateRefs);
  return Object.values(tasks).filter(
    (task) =>
      task.completionState === 'complete' &&
      measurableSet.has(task.templateRef) &&
      (!options?.todayOnly || isTodayCompletion(task.completedAt)),
  ).length;
}

export function countCompletedNonSystemTasksToday(): number {
  const { tasks, taskTemplates } = useScheduleStore.getState();
  const coachBundleById = new Map(
    starterTaskTemplates.filter((t): t is typeof t & { id: string } => !!t.id).map((t) => [t.id, t]),
  );

  return Object.values(tasks).filter((task) => {
    if (task.completionState !== 'complete') return false;
    if (!isTodayCompletion(task.completedAt)) return false;
    const template = taskTemplates[task.templateRef] ?? coachBundleById.get(task.templateRef);
    return template?.isSystem !== true;
  }).length;
}

/**
 * Walk task.resultFields and return the first numeric value found.
 *
 * Handles:
 *   COUNTER/RATING/ROLL etc  — top-level numeric field
 *   CIRCUIT/SETS_REPS etc    — first numeric in a nested plain object
 *   CHECKLIST                — count of `checked === true` items in the items array
 *                              (future: ChecklistItem.systemEventRef lets the UI
 *                               auto-check items on nav/state events without a task commit)
 *
 * Returns null when no numeric value is present (CHECK, LOG, FORM, TEXT, …).
 * For CHECKLIST with 0 items checked, also returns null so the milestone-count
 * fallback in evaluateQuestSpecific handles the edge case gracefully.
 */
function extractNumericFromResult(task: Task): number | null {
  for (const value of Object.values(task.resultFields)) {
    if (typeof value === 'number') return value;

    // CHECKLIST: resultFields.items is ChecklistItem[] — count how many were ticked
    if (Array.isArray(value)) {
      const count = value.filter(
        (item) =>
          item !== null &&
          typeof item === 'object' &&
          (item as Record<string, unknown>).checked === true,
      ).length;
      if (count > 0) return count;
      // count === 0: fall through to return null so the quest doesn't count a blank submit
      continue;
    }

    if (value !== null && typeof value === 'object') {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        if (typeof nested === 'number') return nested;
      }
    }
  }
  return null;
}

/**
 * Estimate how many times a PlannedEvent fires per week from its RecurrenceRule.
 * Used by computeProjectedFinish to derive a daily XP rate.
 */
function estimateWeeklyFrequency(rule: RecurrenceRule): number {
  const n = rule.interval || 1;
  switch (rule.frequency) {
    case 'daily':   return 7 / n;
    case 'weekly':  return (rule.days.length || 1) / n;
    case 'monthly': return 1 / (n * 4.33);   // ~1/month ≈ 0.23/week per interval
    case 'custom':  return 0;
    default:        return 0;
  }
}

/**
 * Count completed tasks for a taskCount Marker scope filter (D76, D77).
 * Reads from scheduleStore tasks; systemEvent counting is handled by
 * the event-specific system counter stored on the User object where applicable.
 * This function handles taskTemplateRef and statGroup scopes.
 */
export function countTasksForScope(marker: Marker): number {
  if (!marker.taskCountScope) return 0;
  const { tasks, taskTemplates } = useScheduleStore.getState();
  const { type, ref } = marker.taskCountScope;
  const coachBundleById = new Map(
    starterTaskTemplates.filter((t): t is typeof t & { id: string } => !!t.id).map((t) => [t.id, t]),
  );
  const isDailyMarker = isDailyQuestRef(marker.questRef);

  if (type === 'taskTemplateRef') {
    return Object.values(tasks).filter(
      (t) =>
        t.completionState === 'complete' &&
        t.templateRef === ref &&
        (!isDailyMarker || isTodayCompletion(t.completedAt)),
    ).length;
  }

  if (type === 'statGroup') {
    return Object.values(tasks).filter((t) => {
      if (t.completionState !== 'complete') return false;
      if (ref === 'any') {
        if (!isTodayCompletion(t.completedAt)) return false;
        const template = taskTemplates[t.templateRef] ?? coachBundleById.get(t.templateRef);
        if (template?.isSystem) return false;
        return true;
      }
      if (isDailyMarker && !isTodayCompletion(t.completedAt)) return false;
      const template = taskTemplates[t.templateRef] ?? coachBundleById.get(t.templateRef);
      if (!template) return false;
      // XP award fields: the primary stat group is the one with the highest value
      const { xpAward } = template;
      const maxStat = Object.entries(xpAward).reduce(
        (best, [k, v]) => (v > best.val ? { key: k, val: v } : best),
        { key: '', val: -1 },
      );
      return maxStat.key === ref;
    }).length;
  }

  // systemEvent — caller is responsible for passing pre-counted value via
  // evaluateTaskCountMarker; this path returns 0 as fallback.
  return 0;
}

/**
 * Evaluate whether a taskCount Marker should fire (D76, D77).
 * @param marker               The Marker to evaluate (conditionType must be taskCount)
 * @param systemEventCount     Pre-counted system event count (for systemEvent scope)
 */
export function evaluateTaskCountMarker(marker: Marker, systemEventCount = 0): boolean {
  if (!marker.activeState) return false;
  if (marker.conditionType !== 'taskCount') return false;
  if (marker.threshold === null) return false;
  if (!marker.taskCountScope) return false;

  let count: number;
  if (marker.taskCountScope.type === 'systemEvent') {
    count = systemEventCount;
  } else {
    count = countTasksForScope(marker);
  }

  // Already fired at this threshold level — don't fire again for same count
  const countAtLastFire = marker.taskCountAtLastFire ?? 0;
  if (count <= countAtLastFire) return false;

  return count >= marker.threshold;
}

// ── EVALUATE QUEST SPECIFIC (D01) ─────────────────────────────────────────────

/**
 * Evaluate whether the Quest finish condition is met at Milestone completion.
 *
 * taskInput path  — extracts the first numeric value from completedTask.resultFields
 *                   and checks it against specific.targetValue.
 * resourceRef path — reads specific.resourceProperty from the Resource's meta object
 *                    (or root properties) and checks against specific.targetValue.
 *
 * Returns false when data is missing rather than throwing.
 */
export function evaluateQuestSpecific(quest: Quest, completedTask: Task): boolean {
  const { specific } = quest;

  if (quest.timely.conditionType === 'none') {
    const measurableRefs = quest.measurable.taskTemplateRefs ?? [];
    if (measurableRefs.length > 0) {
      const completedCount = countCompletedTaskTemplateRefs(measurableRefs, {
        todayOnly: isDailyQuestRef(completedTask.questRef ?? quest.timely.markers[0]?.questRef ?? null),
      });
      return completedCount >= specific.targetValue;
    }

    if (isAnyTaskQuest(quest)) {
      return countCompletedNonSystemTasksToday() >= specific.targetValue;
    }

    const value = extractNumericFromResult(completedTask);
    if (value !== null) {
      return value >= specific.targetValue;
    }

    return (quest.milestones.length + 1) >= specific.targetValue;
  }

  if (quest.timely.conditionType === 'taskCount') {
    const taskCountMarker = quest.timely.markers.find((marker) => marker.conditionType === 'taskCount');
    if (!taskCountMarker) return false;
    return countTasksForScope(taskCountMarker) >= specific.targetValue;
  }

  if (specific.sourceType === 'taskInput') {
    const value = extractNumericFromResult(completedTask);
    let isFinished: boolean;
    if (value !== null) {
      isFinished = value >= specific.targetValue;
    } else {
      // Fallback: milestone count for non-numeric tasks (e.g. CHECK).
      // quest.milestones is pre-addition at call time; add 1 for the task being completed now.
      isFinished = (quest.milestones.length + 1) >= specific.targetValue;
    }
    // FIX-13 trace — confirm the finish condition result for each check-in
    console.log(
      `[evaluateQuestSpecific] quest="${quest.name}" milestones=${quest.milestones.length} ` +
      `targetValue=${specific.targetValue} numericValue=${value ?? 'null'} isFinished=${isFinished}`,
    );
    return isFinished;
  }

  if (
    specific.sourceType === 'resourceRef' &&
    specific.resourceRef !== null &&
    specific.resourceProperty !== null
  ) {
    const resource = useResourceStore.getState().resources[specific.resourceRef];
    if (!resource) return false;
    const value = getResourcePropertyValue(resource, specific.resourceProperty);
    if (typeof value === 'number') return value >= specific.targetValue;
  }

  return false;
}

// ── EVALUATE MARKER CONDITION ─────────────────────────────────────────────────

/**
 * Evaluate whether an xpThreshold Marker should fire.
 *
 * Interval markers are date-driven and evaluated by rollover step5 (nextFire check).
 * taskCount markers are evaluated by evaluateTaskCountMarker().
 * This function handles the xpThreshold conditionType only.
 *
 * Q03 decision: threshold is XP earned since lastFired (repeating interval).
 * xpAtLastFire snapshots User.stats.xp at each fire; delta is checked here.
 *
 * @param marker         The Marker to evaluate
 * @param currentUserXp  User.progression.stats.xp at evaluation time
 */
export function evaluateMarkerCondition(marker: Marker, currentUserXp: number): boolean {
  if (!marker.activeState) return false;
  if (marker.conditionType === 'none') return false;
  if (marker.conditionType !== 'xpThreshold') return false;
  if (marker.xpThreshold === null) return false;
  const baseline = marker.xpAtLastFire ?? 0;
  return (currentUserXp - baseline) >= marker.xpThreshold;
}

// ── DERIVE QUEST PROGRESS ─────────────────────────────────────────────────────

/**
 * Derive progress percentage (0–100) for a Quest.
 *
 * taskInput path:
 *   Reads the last Milestone's resultFields to extract the latest measured value.
 *   Progress = (latestValue / targetValue) × 100.
 *   Falls back to (milestoneCount / targetValue) × 100 for non-numeric tasks.
 *
 * resourceRef path:
 *   Reads the current value of specific.resourceProperty on the linked Resource.
 *   Progress = (currentValue / targetValue) × 100.
 *
 * Returns 0 when no milestones exist or data is unavailable.
 */
export function deriveQuestProgress(quest: Quest): number {
  const { specific, milestones } = quest;
  if (specific.targetValue <= 0) return 0;

  if (quest.timely.conditionType === 'none') {
    if (isAnyTaskQuest(quest)) {
      const completedCount = countCompletedNonSystemTasksToday();
      return Math.min(100, Math.round((completedCount / specific.targetValue) * 100));
    }

    const completedCount = countCompletedTaskTemplateRefs(quest.measurable.taskTemplateRefs ?? [], {
      todayOnly: isDailyQuestRef(quest.timely.markers[0]?.questRef ?? null),
    });
    return Math.min(100, Math.round((completedCount / specific.targetValue) * 100));
  }

  if (quest.timely.conditionType === 'taskCount') {
    const taskCountMarker = quest.timely.markers.find((marker) => marker.conditionType === 'taskCount');
    if (!taskCountMarker) return 0;
    const count = countTasksForScope(taskCountMarker);
    return Math.min(100, Math.round((count / specific.targetValue) * 100));
  }

  if (specific.sourceType === 'taskInput') {
    if (milestones.length === 0) return 0;
    const latest = milestones[milestones.length - 1]!;
    // Attempt to extract a numeric value from milestone resultFields
    for (const value of Object.values(latest.resultFields)) {
      if (typeof value === 'number') {
        return Math.min(100, Math.round((value / specific.targetValue) * 100));
      }
    }
    // Fallback: count-based progress (e.g. "complete 12 sessions")
    return Math.min(100, Math.round((milestones.length / specific.targetValue) * 100));
  }

  if (
    specific.sourceType === 'resourceRef' &&
    specific.resourceRef !== null &&
    specific.resourceProperty !== null
  ) {
    const resource = useResourceStore.getState().resources[specific.resourceRef];
    if (!resource) return 0;
    const val = getResourcePropertyValue(resource, specific.resourceProperty);
    if (typeof val === 'number') {
      return Math.min(100, Math.round((val / specific.targetValue) * 100));
    }
  }

  return 0;
}

// ── COMPUTE PROJECTED FINISH ──────────────────────────────────────────────────

/**
 * Estimate next check-in date as a proxy for Quest.timely.projectedFinish.
 *
 * Q01 DECISION — Option B applied (pending PM confirmation):
 *   Only PlannedEvents whose taskList includes a TaskTemplate referenced in
 *   Quest.measurable.taskTemplateRefs contribute to the XP rate estimate.
 *   To switch to Option A (all active PlannedEvents), remove the measurable
 *   template-ref filter below.
 *
 * interval path:
 *   Returns the nextFire date of the first active Marker, or null.
 *   (The interval itself defines the cadence — no rate computation needed.)
 *
 * xpThreshold path:
 *   Computes daily XP rate from qualifying PlannedEvents in the schedule store.
 *   Estimates days until the threshold delta is met from current XP position.
 *   Returns null when no qualifying events are found in the store.
 *   Note: taskTemplates in the store are user custom only (D34). System
 *   templates from the Coach bundle are not visible here — the function will
 *   return null for quests that reference only system-provided task templates.
 */
export function computeProjectedFinish(quest: Quest): string | null {
  if (quest.completionState !== 'active') return null;

  if (quest.timely.conditionType === 'interval') {
    const active = quest.timely.markers.find((m) => m.activeState && m.nextFire !== null);
    return active?.nextFire ?? null;
  }

  if (quest.timely.conditionType === 'xpThreshold') {
    const threshold = quest.timely.xpThreshold;
    if (!threshold) return null;

    const scheduleStore = useScheduleStore.getState();
    const user = useUserStore.getState().user;
    if (!user) return null;

    const measurableTemplateRefs = new Set(quest.measurable.taskTemplateRefs ?? []);
    if (measurableTemplateRefs.size === 0) return null;

    // Option B: only PlannedEvents with qualifying task types
    let dailyXP = 0;
    for (const pe of Object.values(scheduleStore.plannedEvents)) {
      if (pe.activeState !== 'active') continue;

      const sessionXP = pe.taskList.reduce((sum, templateRef) => {
        const template = scheduleStore.taskTemplates[templateRef];
        if (!template || !measurableTemplateRefs.has(templateRef)) return sum;
        return sum + Object.values(template.xpAward).reduce((s, v) => s + v, 0) + (template.xpBonus ?? 0);
      }, 0);

      if (sessionXP === 0) continue;
      dailyXP += (sessionXP * estimateWeeklyFrequency(pe.recurrenceInterval)) / 7;
    }

    if (dailyXP <= 0) return null;

    // XP earned since last fire (Q03 since-last-fired model)
    const activeMarker = quest.timely.markers.find((m) => m.activeState);
    const xpBaseline = activeMarker?.xpAtLastFire ?? user.progression.stats.xp;
    const xpEarnedSinceLastFire = user.progression.stats.xp - xpBaseline;
    const xpRemaining = threshold - xpEarnedSinceLastFire;

    if (xpRemaining <= 0) return todayISO();

    const days = Math.ceil(xpRemaining / dailyXP);
    const target = new Date();
    target.setDate(target.getDate() + days);
    return localISODate(target);
  }

  return null;
}

// ── UPDATE QUEST PROGRESS ─────────────────────────────────────────────────────

/**
 * Recalculate and persist Quest.progressPercent and Quest.timely.projectedFinish.
 * Called after each Milestone completion by markerEngine.completeMilestone().
 *
 * @param actId        Act uuid
 * @param chainIndex   0-based index of the Chain within Act.chains[]
 * @param questIndex   0-based index of the Quest within Chain.quests[]
 */
export function updateQuestProgress(
  actId: string,
  chainIndex: number,
  questIndex: number,
): void {
  const progressionStore = useProgressionStore.getState();
  const act = progressionStore.acts[actId];
  if (!act) return;
  const chain = act.chains[chainIndex];
  if (!chain) return;
  const quest = chain.quests[questIndex];
  if (!quest) return;

  const progressPercent = deriveQuestProgress(quest);
  const projectedFinish = computeProjectedFinish(quest);

  const updatedAct = {
    ...act,
    chains: act.chains.map((c, ci) => {
      if (ci !== chainIndex) return c;
      return {
        ...c,
        quests: c.quests.map((q, qi) => {
          if (qi !== questIndex) return q;
          return {
            ...q,
            progressPercent,
            timely: { ...q.timely, projectedFinish },
          };
        }),
      };
    }),
  };

  progressionStore.setAct(updatedAct);
}
