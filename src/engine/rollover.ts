// ─────────────────────────────────────────
// ROLLOVER ENGINE — 9-STEP MIDNIGHT SEQUENCE
// Defined in storage schema §7 (D14).
//
// executeRollover() runs all 9 steps in order.
// Each step is a discrete named function.
// Rollover state tracked in useSystemStore (lastRollover, rolloverStep).
//
// Resumability: rolloverStep is written before each step begins and cleared
// (set to null) after step 9 completes. On boot, if rolloverStep is set,
// executeRollover() resumes from that step number.
//
// On app boot: if lastRollover < today, trigger rollover before hydrating UI.
// ─────────────────────────────────────────

import type { PlannedEvent } from '../types/plannedEvent';
import type { Event, QuickActionsEvent } from '../types/event';
import type { Marker } from '../types/act';
import type { Task } from '../types/task';
import { useSystemStore } from '../stores/useSystemStore';
import { useUserStore } from '../stores/useUserStore';
import { useScheduleStore } from '../stores/useScheduleStore';
import { useProgressionStore } from '../stores/useProgressionStore';
import { STARTER_ACT_IDS, STARTER_TEMPLATE_IDS, makeDailyChain } from '../coach/StarterQuestLibrary';
import { materialisePlannedEvent } from './materialise';
import { completeMilestone, fireInitialIntervalMarkers, fireMarker } from './markerEngine';
import { evaluateMarkerCondition, evaluateTaskCountMarker } from './questEngine';
import { ribbet } from '../coach/ribbet';
import { appendFeedEntry, FEED_SOURCE } from './feedEngine';
import { localISODate, addDays, getAppDate } from '../utils/dateUtils';
import { fetchWeatherSummaryForDate } from '../utils/weatherService';

// ── DATE HELPERS ────────────────────────────────────────────────────────────────────────────────

/** Returns today as YYYY-MM-DD — reads from app time reference (D91) */
function todayISO(): string {
  return getAppDate();
}

/** Returns true if isoDate (YYYY-MM-DD) is on or before the cutoff date */
function isOnOrBefore(isoDate: string, cutoff: string): boolean {
  return isoDate <= cutoff;
}

// ── RECURRENCE RULE HELPERS ───────────────────────────────────────────────────

const WEEKDAY_MAP: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

function getLastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function resolveMonthlyDay(targetDate: Date, requestedDay: number): number {
  return Math.min(requestedDay, getLastDayOfMonth(targetDate.getFullYear(), targetDate.getMonth()));
}

/**
 * Return true if a PlannedEvent is due on the given date.
 * Checks activeState, seedDate ≤ targetDate, dieDate not passed,
 * and recurrence pattern.
 *
 * Exported so view components can project recurring PE previews onto
 * every matching day in the visible range (not just pe.seedDate).
 */
export function isPlannedEventDue(pe: PlannedEvent, targetDate: string): boolean {
  if (pe.activeState !== 'active') return false;
  if (pe.seedDate > targetDate) return false;
  if (pe.dieDate && pe.dieDate < targetDate) return false;

  const rule = pe.recurrenceInterval;
  const target = new Date(targetDate + 'T00:00:00');
  const seed   = new Date(pe.seedDate + 'T00:00:00');

  if (rule.endsOn && rule.endsOn < targetDate) return false;

  switch (rule.frequency) {
    case 'daily': {
      // every interval days from seedDate
      const diffDays = Math.round((target.getTime() - seed.getTime()) / 86_400_000);
      return diffDays >= 0 && diffDays % (rule.interval || 1) === 0;
    }
    case 'weekly': {
      const diffDays = Math.round((target.getTime() - seed.getTime()) / 86_400_000);
      const diffWeeks = Math.floor(diffDays / 7);
      if (diffWeeks % (rule.interval || 1) !== 0) return false;
      const dayName = Object.keys(WEEKDAY_MAP).find(
        (k) => WEEKDAY_MAP[k] === target.getDay(),
      )!;
      return rule.days.includes(dayName as import('../types/taskTemplate').Weekday);
    }
    case 'monthly': {
      const requestedDay = rule.monthlyDay ?? seed.getDate();
      const targetDay = resolveMonthlyDay(target, requestedDay);
      if (target.getDate() !== targetDay) return false;
      const monthDiff =
        (target.getFullYear() - seed.getFullYear()) * 12 +
        (target.getMonth() - seed.getMonth());
      return monthDiff >= 0 && monthDiff % (rule.interval || 1) === 0;
    }
    case 'custom':
      // custom conditions not evaluated here — caller handles or skips
      return false;
    default:
      return false;
  }
}

/**
 * Advance a PlannedEvent's seedDate to the next occurrence after the given date.
 * Returns the new seedDate string, or the existing seedDate if no future occurrence found.
 */
function computeNextSeedDate(pe: PlannedEvent, afterDate: string): string {
  const DAYS_LOOKAHEAD = 366;
  const start = new Date(afterDate + 'T00:00:00');
  for (let i = 1; i <= DAYS_LOOKAHEAD; i++) {
    const candidate = new Date(start.getTime() + i * 86_400_000);
    const candidateISO = localISODate(candidate);
    const candidatePe: PlannedEvent = { ...pe, seedDate: pe.seedDate }; // seedDate stays for nth-weekday reference
    if (isPlannedEventDue(candidatePe, candidateISO)) {
      return candidateISO;
    }
  }
  return pe.seedDate;
}

// ── STEP 1 — Identify due PlannedEvents ──────────────────────────────────────

function step1_identifyDuePlannedEvents(rolloverDate: string): PlannedEvent[] {
  const { plannedEvents } = useScheduleStore.getState();
  return Object.values(plannedEvents).filter((pe) =>
    isPlannedEventDue(pe, rolloverDate),
  );
}

// ── STEP 2 — Resolve conflicts ────────────────────────────────────────────────

/**
 * Applies conflictMode for each PE against all other PEs on the same day.
 * For MVP06: concurrent mode always passes; override drops earlier conflicts;
 * shift/truncate are noted but not fully time-shifted (BUILD-time detail).
 * Returns the surviving PE list.
 */
function step2_resolveConflicts(due: PlannedEvent[]): PlannedEvent[] {
  // Group by concurrent vs exclusive
  const concurrent = due.filter((pe) => pe.conflictMode === 'concurrent');
  const exclusive = due.filter((pe) => pe.conflictMode !== 'concurrent');

  // Sort exclusive by startTime — last one wins on strict 'override'
  const sorted = exclusive.sort((a, b) => a.startTime.localeCompare(b.startTime));
  const resolved: PlannedEvent[] = [];
  for (const pe of sorted) {
    const conflicts = resolved.filter(
      (r) => r.startTime < pe.endTime && r.endTime > pe.startTime,
    );
    if (conflicts.length === 0) {
      resolved.push(pe);
    } else if (pe.conflictMode === 'override') {
      // Remove earlier conflicting entries and replace with this one
      for (const c of conflicts) {
        const idx = resolved.indexOf(c);
        if (idx !== -1) resolved.splice(idx, 1);
      }
      resolved.push(pe);
    } else {
      // shift / truncate — include both for MVP (BUILD-time full impl)
      resolved.push(pe);
    }
  }

  return [...resolved, ...concurrent];
}

// ── STEP 3 — Materialise PlannedEvents → Events ───────────────────────────────

function step3_materialisePlannedEvents(
  resolved: PlannedEvent[],
  rolloverDate: string,
): Event[] {
  const { taskTemplates } = useScheduleStore.getState();
  const events: Event[] = [];
  for (const pe of resolved) {
    const { event } = materialisePlannedEvent(pe, rolloverDate, taskTemplates);
    events.push(event);
  }
  return events;
}

// ── STEP 4 — Pull task lists (handled inside materialise, step recorded) ──────

/**
 * Step 4 is folded into materialisePlannedEvent (cursor advance + task creation).
 * This function is a no-op marker so the step index stays aligned.
 */
function step4_pullTaskLists(): void {
  // taskPoolCursor advance and task instantiation handled in step3 / materialise.ts
}

// ── STEP 5 — Evaluate Markers ─────────────────────────────────────────────────

interface DueMarker {
  marker: Marker;
  actId: string;
  chainIndex: number;
  questIndex: number;
  markerIndex: number;
}

function step5_evaluateMarkers(rolloverDate: string): DueMarker[] {
  const { acts } = useProgressionStore.getState();
  // Snapshot current XP once for xpThreshold checks (Q03 since-last-fired)
  const currentXp = useUserStore.getState().user?.progression.stats.xp ?? 0;
  const due: DueMarker[] = [];

  for (const act of Object.values(acts)) {
    if (act.id.startsWith(STARTER_ACT_IDS.daily)) continue;

    act.chains.forEach((chain, chainIndex) => {
      chain.quests.forEach((quest, questIndex) => {
        if (quest.completionState !== 'active') return;
        quest.timely.markers.forEach((marker, markerIndex) => {
          if (!marker.activeState) return;
          // Only evaluate rollover-triggered markers in step5
          const triggerSource = marker.triggerSource ?? 'rollover';
          if (triggerSource !== 'rollover') return;

          if (marker.conditionType === 'interval') {
            // Date-driven: fire when nextFire is on or before rolloverDate
            if (marker.nextFire !== null && isOnOrBefore(marker.nextFire, rolloverDate)) {
              due.push({ marker, actId: act.id, chainIndex, questIndex, markerIndex });
            }
          } else if (marker.conditionType === 'xpThreshold') {
            // XP-driven: fire when qualifying XP delta since last fire meets threshold
            if (evaluateMarkerCondition(marker, currentXp)) {
              due.push({ marker, actId: act.id, chainIndex, questIndex, markerIndex });
            }
          } else if (marker.conditionType === 'taskCount') {
            // Count-driven (D76): fire when tracked task completions reach threshold
            if (evaluateTaskCountMarker(marker)) {
              due.push({ marker, actId: act.id, chainIndex, questIndex, markerIndex });
            }
          }
        });
      });
    });
  }

  return due;
}

// ── STEP 6 — Fire Markers → Tasks ────────────────────────────────────────────

/**
 * Delegate each due Marker to markerEngine.fireMarker().
 * fireMarker handles: Task creation with questRef/actRef, gtdList push,
 * xpAtLastFire snapshot, marker state update, and Act persistence.
 */
function step6_fireMarkers(dueMarkers: DueMarker[]): void {
  for (const dueMarker of dueMarkers) {
    fireMarker(dueMarker);
  }
}

// ── STEP 7 — Archive Events + move QuickActionsEvent ─────────────────────────

function step7_archiveEvents(rolloverDate: string): void {
  const scheduleStore = useScheduleStore.getState();
  const eventIds = Object.keys(scheduleStore.activeEvents);

  for (const eventId of eventIds) {
    const event = scheduleStore.activeEvents[eventId];
    if (!event) continue;

    // QuickActionsEvent — identified by absence of 'startDate' (QA events are single-day)
    if (!('startDate' in event)) {
      // Archive when the QA date is before rolloverDate (yesterday's QA)
      const qaDate = (event as { date: string }).date;
      if (qaDate < rolloverDate) {
        scheduleStore.archiveEvent(eventId);
      }
    } else {
      // Regular Event — archive when endDate has passed (D50)
      // Completion status is irrelevant: a completed multi-day event stays in
      // activeEvents until its end date is in the past.
      const endDate = (event as { endDate: string }).endDate;
      if (endDate < rolloverDate) {
        scheduleStore.archiveEvent(eventId);
      }
    }
  }
}

// ── STEP 8 — Update RecurrenceRules ──────────────────────────────────────────

function step8_rolloverDailyAdventureChain(rolloverDate: string): void {
  const progressionStore = useProgressionStore.getState();
  const dailyAct = progressionStore.acts[STARTER_ACT_IDS.daily];
  if (!dailyAct) return;

  const updatedChains = [...dailyAct.chains];

  if (updatedChains.length > 0) {
    const lastChainIndex = updatedChains.length - 1;
    const lastChain = updatedChains[lastChainIndex];
    if (lastChain && lastChain.completionState !== 'complete') {
      const allQuestsComplete = lastChain.quests.every(
        (quest) => quest.completionState === 'complete',
      );
      updatedChains[lastChainIndex] = {
        ...lastChain,
        completionState: allQuestsComplete ? 'complete' : 'failed',
        quests: lastChain.quests.map((quest) =>
          quest.completionState === 'complete'
            ? quest
            : {
                ...quest,
                completionState: 'failed',
                timely: {
                  ...quest.timely,
                  markers: quest.timely.markers.map((marker) => ({
                    ...marker,
                    activeState: false,
                  })),
                },
              },
        ),
      };
    }
  }

  const nextChain = makeDailyChain(
    STARTER_ACT_IDS.daily,
    updatedChains.length + 1,
    rolloverDate,
  );
  updatedChains.push(nextChain);

  progressionStore.setAct({
    ...dailyAct,
    chains: updatedChains,
    completionState: 'active',
  });

  fireInitialIntervalMarkers(STARTER_ACT_IDS.daily, updatedChains.length - 1);
}

function step8_updateRecurrence(resolved: PlannedEvent[], rolloverDate: string): void {
  step8_rolloverDailyAdventureChain(rolloverDate);

  const scheduleStore = useScheduleStore.getState();

  for (const pe of resolved) {
    if (pe.dieDate) continue; // one-off — no recurrence update needed

    const nextSeed = computeNextSeedDate(pe, rolloverDate);
    if (nextSeed !== pe.seedDate) {
      const updatedPe: PlannedEvent = { ...pe, seedDate: nextSeed };
      scheduleStore.setPlannedEvent(updatedPe);
    }
  }
}

// ── STEP 9 — Coach review + new QuickActionsEvent ────────────────────────────

async function step9_coachReview(newDate: string): Promise<void> {
  const scheduleStore = useScheduleStore.getState();
  const userStore = useUserStore.getState();
  const locationPreferences = useSystemStore.getState().settings?.locationPreferences;

  let weatherSnapshot: QuickActionsEvent['weatherSnapshot'] = null;
  if (locationPreferences) {
    try {
      const weather = await fetchWeatherSummaryForDate(
        locationPreferences.lat,
        locationPreferences.lng,
        newDate,
      );
      weatherSnapshot = weather
        ? { icon: weather.icon, high: weather.high, low: weather.low }
        : null;
    } catch {
      weatherSnapshot = null;
    }
  }

  // Create the new day's QuickActionsEvent
  const qaId = `qa-${newDate}`;
  const hasExistingQa =
    scheduleStore.activeEvents[qaId] !== undefined ||
    scheduleStore.historyEvents[qaId] !== undefined;
  const qa: QuickActionsEvent = {
    id: qaId,
    eventType: 'quickActions',
    date: newDate,
    completions: [],
    xpAwarded: 0,
    weatherSnapshot,
    sharedCompletions: null,
  };

  scheduleStore.setActiveEvent(qa);

  const previousDate = localISODate(addDays(new Date(`${newDate}T00:00:00`), -1));

  const loggedInPreviousDay = Object.values({
    ...scheduleStore.activeEvents,
    ...scheduleStore.historyEvents,
  }).some((event) => {
    if (!('startDate' in event)) {
      const quickActions = event as QuickActionsEvent;
      return quickActions.date === previousDate && quickActions.completions.length > 0;
    }

    return (
      event.completionState === 'complete' &&
      event.startDate <= previousDate &&
      event.endDate >= previousDate
    );
  });

  // Advance or reset the streak based on whether the user logged activity for the prior day.
  const user = userStore.user;
  if (user) {
    if (!hasExistingQa) {
      const current = user.progression.stats.milestones.streakCurrent;
      const nextStreak = loggedInPreviousDay ? current + 1 : 0;
      const bestStreak = Math.max(user.progression.stats.milestones.streakBest, nextStreak);
      userStore.setUser({
        ...user,
        progression: {
          ...user.progression,
          stats: {
            ...user.progression.stats,
            milestones: {
              ...user.progression.stats.milestones,
              streakCurrent: nextStreak,
              streakBest: bestStreak,
            },
          },
        },
      });
    }

    // Push a rollover feed entry if user exists
    const latestUser = userStore.user ?? user;
    appendFeedEntry({
      commentBlock: ribbet(latestUser),
      sourceType: FEED_SOURCE.ROLLOVER,
      timestamp: new Date().toISOString(),
    }, latestUser);
  }
}

function step7_completeDailyClearDeckQuest(rolloverDate: string): void {
  const progressionStore = useProgressionStore.getState();
  const scheduleStore = useScheduleStore.getState();
  const dailyAct = progressionStore.acts[STARTER_ACT_IDS.daily];
  if (!dailyAct || dailyAct.chains.length === 0) return;

  const chainIndex = dailyAct.chains.length - 1;
  const chain = dailyAct.chains[chainIndex];
  const questIndex = 3;
  const quest = chain?.quests[questIndex];
  if (!chain || !quest || quest.completionState !== 'active') return;

  const previousDate = localISODate(addDays(new Date(`${rolloverDate}T00:00:00`), -1));
  const dayEvents = Object.values(scheduleStore.historyEvents).filter(
    (event): event is Event => 'startDate' in event && event.startDate === previousDate,
  );

  if (dayEvents.length > 0 && dayEvents.every((event) => event.completionState === 'complete')) {
    const completedTask: Task = {
      id: `daily-clear-deck-${previousDate}`,
      templateRef: quest.timely.markers[0]?.taskTemplateRef ?? STARTER_TEMPLATE_IDS.clearTheDeck,
      completionState: 'complete',
      completedAt: `${previousDate}T23:59:59.000Z`,
      resultFields: {},
      attachmentRef: null,
      resourceRef: null,
      location: null,
      sharedWith: null,
      questRef: `${STARTER_ACT_IDS.daily}|${chainIndex}|${questIndex}`,
      actRef: STARTER_ACT_IDS.daily,
      secondaryTag: null,
    };
    scheduleStore.setTask(completedTask);
    completeMilestone(completedTask);
    return;
  }

  progressionStore.setAct({
    ...dailyAct,
    chains: dailyAct.chains.map((entry, index) => {
      if (index !== chainIndex) return entry;
      return {
        ...entry,
        quests: entry.quests.map((chainQuest, idx) => {
          if (idx !== questIndex) return chainQuest;
          return {
            ...chainQuest,
            completionState: 'failed',
            timely: {
              ...chainQuest.timely,
              markers: chainQuest.timely.markers.map((marker) => ({ ...marker, activeState: false })),
            },
          };
        }),
      };
    }),
  });
}

// ── EXECUTE ROLLOVER ──────────────────────────────────────────────────────────

/**
 * Run all 9 rollover steps in sequence.
 *
 * @param rolloverDate  The date being rolled over TO (new day, YYYY-MM-DD).
 *                      Defaults to today.
 * @param resumeFrom    Step number to resume from (1–9). Used on interrupted-boot recovery.
 */
export async function executeRollover(
  rolloverDate: string = todayISO(),
  resumeFrom = 1,
): Promise<void> {
  const systemStore = useSystemStore.getState();

  // Step 1 — identify due PlannedEvents
  let due: PlannedEvent[] = [];
  let resolved: PlannedEvent[] = [];

  if (resumeFrom <= 1) {
    systemStore.setRolloverStep(1);
    due = step1_identifyDuePlannedEvents(rolloverDate);
  }

  // Step 2 — resolve conflicts
  if (resumeFrom <= 2) {
    systemStore.setRolloverStep(2);
    // Re-load due list if resuming mid-run (edge case: use all active PEs as fallback)
    if (resumeFrom === 2) {
      due = step1_identifyDuePlannedEvents(rolloverDate);
    }
    resolved = step2_resolveConflicts(due);
  } else {
    // resuming at step 3+: re-derive to avoid stale closures
    due = step1_identifyDuePlannedEvents(rolloverDate);
    resolved = step2_resolveConflicts(due);
  }

  // Step 3 — materialise
  if (resumeFrom <= 3) {
    systemStore.setRolloverStep(3);
    step3_materialisePlannedEvents(resolved, rolloverDate);
  }

  // Step 4 — task lists (no-op, handled in materialise)
  if (resumeFrom <= 4) {
    systemStore.setRolloverStep(4);
    step4_pullTaskLists();
  }

  // Step 5 — evaluate markers
  let dueMarkers: DueMarker[] = [];
  if (resumeFrom <= 5) {
    systemStore.setRolloverStep(5);
    dueMarkers = step5_evaluateMarkers(rolloverDate);
  }

  // Step 6 — fire markers
  if (resumeFrom <= 6) {
    systemStore.setRolloverStep(6);
    if (resumeFrom === 6) {
      dueMarkers = step5_evaluateMarkers(rolloverDate);
    }
    step6_fireMarkers(dueMarkers);
  }

  // Step 7 — archive events
  if (resumeFrom <= 7) {
    systemStore.setRolloverStep(7);
    step7_archiveEvents(rolloverDate);
    step7_completeDailyClearDeckQuest(rolloverDate);
  }

  // Step 8 — update recurrence
  if (resumeFrom <= 8) {
    systemStore.setRolloverStep(8);
    step8_updateRecurrence(resolved, rolloverDate);
  }

  // Step 9 — coach review + new QA event
  if (resumeFrom <= 9) {
    systemStore.setRolloverStep(9);
    await step9_coachReview(rolloverDate);
  }

  // Mark rollover complete
  systemStore.setLastRollover(rolloverDate);
  systemStore.setRolloverStep(null);
}

// ── BOOT CHECK ────────────────────────────────────────────────────────────────

/**
 * Call this on app boot, before hydrating any UI.
 *
 * - If a rollover was interrupted (rolloverStep is set), resume it.
 * - If lastRollover < today, run a rollover for EACH missed day up to and
 *   including today. This ensures a QA event and step-3 materialisation are
 *   created for every skipped day (e.g. a week-long gap = 7 rollovers).
 * - Otherwise no-op.
 */
export async function checkAndRunRolloverOnBoot(): Promise<void> {
  const { lastRollover, rolloverStep } = useSystemStore.getState();
  const today = todayISO();

  if (rolloverStep !== null && rolloverStep >= 1) {
    // Interrupted rollover — resume from step that was in flight
    await executeRollover(today, rolloverStep);
    return;
  }

  if (!lastRollover || lastRollover < today) {
    // Determine the first day to roll forward: day after last completed rollover,
    // or today when there is no prior rollover record.
    const startISO = lastRollover
      ? localISODate(addDays(new Date(lastRollover + 'T00:00:00'), 1))
      : today;

    let current = startISO;
    while (current <= today) {
      await executeRollover(current, 1);
      if (current === today) break;
      current = localISODate(addDays(new Date(current + 'T00:00:00'), 1));
    }
  }
}
