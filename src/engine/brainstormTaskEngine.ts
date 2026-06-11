// ─────────────────────────────────────────
// BRAINSTORM TASK ENGINE — KPI sync (Track C §5, thin)
//
// Mirrors the proven quest loop: markerEngine (generation) → rollover step 5
// cadence → questEngine.updateQuestProgress (cached progress write-back).
//
// generateKpiCheckIns(date) — forward, storm → schedule. Called from the
//   midnight rollover alongside marker firing. Idempotent per (ideaId, date).
// applyKpiResult(task)      — reverse, schedule → storm. Called from the
//   completion dispatcher when a completed task carries brainstormRef.
//   The ONLY writer of typeData.currentValue / progressPercent / lastSyncedAt.
//
// Contract rules (§5.3): additive only, fail-open (never block completion or
// rollover), no live back-references — the schedule side owns task lifecycles.
//
// Favorites standard (Sprint 4): KPI check-ins land in the existing
// favouritesList via `brainstorm-kpi:` virtual refs — no separate bucket.
// ─────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';
import type { BrainstormIdea, MainIdea, Storm } from '../types/brainstorm';
import { normalizeIdeaTypeData } from '../types/brainstorm';
import type { RecurrenceRule, TaskTemplate } from '../types/taskTemplate';
import type { Task } from '../types/task';
import { useBrainstormStore } from '../stores/useBrainstormStore';
import { useScheduleStore } from '../stores/useScheduleStore';
import { useUserStore } from '../stores/useUserStore';
import { getAppDate, getAppNowISO } from '../utils/dateUtils';

export const BRAINSTORM_KPI_PREFIX = 'brainstorm-kpi:';

type KpiTypeData = Extract<NonNullable<BrainstormIdea['typeData']>, { kind: 'kpi' }>;

export function isBrainstormKpiRef(ref: string): boolean {
  return ref.startsWith(BRAINSTORM_KPI_PREFIX);
}

/** Build the favorites ref for a KPI idea — `brainstorm-kpi:{stormId}:{ideaId}`. */
export function buildBrainstormKpiRef(stormId: string, ideaId: string): string {
  return `${BRAINSTORM_KPI_PREFIX}${stormId}:${ideaId}`;
}

/** Parse a `brainstorm-kpi:` ref back to its brainstormRef. Null when malformed. */
export function parseBrainstormKpiRef(ref: string): { stormId: string; ideaId: string } | null {
  if (!isBrainstormKpiRef(ref)) return null;
  const parts = ref.slice(BRAINSTORM_KPI_PREFIX.length).split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { stormId: parts[0], ideaId: parts[1] };
}

function findIdea(storm: Storm, ideaId: string): BrainstormIdea | MainIdea | null {
  return storm.ideas[ideaId] ?? storm.mainIdeas[ideaId] ?? null;
}

function getKpiTypeData(idea: BrainstormIdea | MainIdea): KpiTypeData | null {
  const normalized = normalizeIdeaTypeData(idea.type, idea.typeData);
  if (!normalized || normalized.kind !== 'kpi') return null;
  return normalized;
}

/**
 * Resolve a `brainstorm-kpi:` favorites ref to a virtual TaskTemplate
 * (same standard as resource-task refs, Sprint 4). Returns the KPI's
 * configured template when set, named after the KPI idea; undefined when the
 * storm/idea is gone or the idea is no longer a KPI.
 */
export function resolveBrainstormKpiTemplate(ref: string): TaskTemplate | undefined {
  const parsed = parseBrainstormKpiRef(ref);
  if (!parsed) return undefined;

  const storm = useBrainstormStore.getState().storms[parsed.stormId];
  if (!storm) return undefined;
  const idea = findIdea(storm, parsed.ideaId);
  if (!idea) return undefined;
  const kpi = getKpiTypeData(idea);
  if (!kpi) return undefined;

  const baseTemplate = kpi.taskTemplateRef
    ? useScheduleStore.getState().taskTemplates[kpi.taskTemplateRef]
    : undefined;

  return {
    ...(baseTemplate ?? {
      description: '',
      taskType: 'COUNTER' as const,
      inputFields: { target: Math.max(1, kpi.targetValue), unit: kpi.unit ?? 'count', step: 1 },
      xpAward: { health: 0, strength: 0, agility: 0, defense: 0, charisma: 0, wisdom: 5 },
      cooldown: null,
      media: null,
      items: [],
      secondaryTag: null,
    }),
    id: ref,
    name: `KPI: ${idea.title}`,
    icon: baseTemplate?.icon ?? 'idea-kpi',
  } as TaskTemplate;
}

// ── CADENCE EVALUATION ────────────────────────────────────────────────────────

const WEEKDAY_BY_INDEX = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/**
 * Whether a KPI cadence fires on the given date. KPI cadences have no seed
 * anchor (unlike markers, which advance from lastFired), so evaluation is
 * calendar-positional: daily fires every day, weekly on its days[] (Monday
 * when unset), monthly on monthlyDay (1st when unset). Custom rules never
 * auto-fire in v1.
 */
function cadenceFiresOn(rule: RecurrenceRule, dateIso: string): boolean {
  const date = new Date(dateIso.slice(0, 10) + 'T00:00:00');
  if (rule.endsOn && dateIso > rule.endsOn) return false;

  switch (rule.frequency) {
    case 'daily':
      return true;
    case 'weekly': {
      const weekday = WEEKDAY_BY_INDEX[date.getDay()];
      if (rule.days.length === 0) return weekday === 'mon';
      return rule.days.includes(weekday as (typeof rule.days)[number]);
    }
    case 'monthly': {
      const targetDay = rule.monthlyDay ?? 1;
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      return date.getDate() === Math.min(targetDay, lastDay);
    }
    default:
      return false;
  }
}

// ── GENERATION (forward, storm → schedule) ───────────────────────────────────

function hasCheckInForDate(ideaId: string, dateIso: string): boolean {
  // Same dedupe discipline rollover uses for markers — skip if a task with the
  // same brainstormRef and due date already exists.
  return Object.values(useScheduleStore.getState().tasks).some((task) => {
    if (task.brainstormRef?.ideaId !== ideaId) return false;
    const fields = task.resultFields as Record<string, unknown>;
    return fields.dueDate === dateIso;
  });
}

/**
 * Materialise KPI check-in tasks due on `date`. Called from the midnight
 * rollover alongside marker firing. Fail-open: errors log and no-op.
 */
export function generateKpiCheckIns(date: string = getAppDate()): void {
  try {
    const storms = useBrainstormStore.getState().storms;
    const scheduleStore = useScheduleStore.getState();
    const createdTaskIds: string[] = [];

    for (const storm of Object.values(storms)) {
      if (storm.state === 'archived' || storm.state === 'resolved') continue;

      const candidates: Array<BrainstormIdea | MainIdea> = [
        ...Object.values(storm.mainIdeas),
        ...Object.values(storm.ideas),
      ];

      for (const idea of candidates) {
        const kpi = getKpiTypeData(idea);
        if (!kpi || !kpi.taskTemplateRef || !kpi.cadence) continue;
        if (!cadenceFiresOn(kpi.cadence, date)) continue;
        if (hasCheckInForDate(idea.id, date)) continue;

        const task: Task = {
          id: uuidv4(),
          templateRef: kpi.taskTemplateRef,
          completionState: 'pending',
          completedAt: null,
          resultFields: ({
            label: `KPI: ${idea.title}`,
            dueDate: date,
          } as unknown) as Task['resultFields'],
          attachmentRef: null,
          resourceRef: null,
          location: null,
          sharedWith: null,
          questRef: null,
          actRef: null,
          secondaryTag: null,
          brainstormRef: { stormId: storm.id, ideaId: idea.id },
        };

        scheduleStore.setTask(task);
        createdTaskIds.push(task.id);
      }
    }

    if (createdTaskIds.length === 0) return;

    // Enqueue in gtdList so the check-ins surface for the user (same as fireMarker).
    const userStore = useUserStore.getState();
    const user = userStore.user;
    if (user) {
      userStore.setUser({
        ...user,
        lists: {
          ...user.lists,
          gtdList: [...new Set([...user.lists.gtdList, ...createdTaskIds])],
        },
      });
    }
  } catch (error) {
    console.warn('[brainstormTaskEngine] generateKpiCheckIns failed (fail-open):', error);
  }
}

// ── WRITE-BACK (reverse, schedule → storm) ───────────────────────────────────

/**
 * Extract the numeric result amount from a completed task's resultFields,
 * per the template's taskType conventions (counter `count`, duration
 * `actualDuration`, rating/text `value`, transaction `amount`). CHECK-style
 * completions with no numeric capture count as 1.
 */
function extractResultAmount(task: Task): number {
  const fields = task.resultFields as Record<string, unknown>;
  for (const key of ['count', 'actualDuration', 'value', 'amount']) {
    const raw = fields[key];
    const numeric = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseFloat(raw) : NaN;
    if (Number.isFinite(numeric)) return numeric;
  }
  return 1;
}

/** Clamped 0–100 progress — the Smarter.progressPercent caching pattern. */
function computeKpiProgress(kpi: KpiTypeData, nextValue: number): number {
  const target = kpi.targetValue;
  let ratio: number;

  if (kpi.direction === 'increase') {
    ratio = target !== 0 ? nextValue / target : 0;
  } else if (kpi.direction === 'decrease') {
    ratio = nextValue <= target ? 1 : target !== 0 ? target / nextValue : 0;
  } else {
    // maintain — full when on target, degrading with relative drift
    ratio = target !== 0 ? 1 - Math.abs(nextValue - target) / Math.abs(target) : (nextValue === 0 ? 1 : 0);
  }

  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

/**
 * Write a completed task's result back to its KPI idea's typeData.
 * Called from the completion dispatcher when `task.brainstormRef` is set.
 * No-ops (never throws, never blocks completion) when the storm or idea is
 * gone, or the idea is no longer a KPI.
 */
export function applyKpiResult(task: Task): void {
  try {
    if (!task.brainstormRef || task.completionState !== 'complete') return;
    const { stormId, ideaId } = task.brainstormRef;

    const brainstormStore = useBrainstormStore.getState();
    const storm = brainstormStore.storms[stormId];
    if (!storm) return;
    const idea = findIdea(storm, ideaId);
    if (!idea) return;
    const kpi = getKpiTypeData(idea);
    if (!kpi) return;

    const amount = extractResultAmount(task);
    const currentValue =
      kpi.direction === 'increase' ? kpi.currentValue + amount :
      kpi.direction === 'decrease' ? kpi.currentValue - amount :
      amount;

    const nextTypeData: KpiTypeData = {
      ...kpi,
      currentValue,
      progressPercent: computeKpiProgress(kpi, currentValue),
      lastSyncedAt: getAppNowISO(),
    };

    if (storm.ideas[ideaId]) {
      brainstormStore.updateIdea(stormId, ideaId, { typeData: nextTypeData });
    } else {
      brainstormStore.updateMainIdea(stormId, ideaId, { typeData: nextTypeData });
    }

    // Audit trail — human-readable 'kpi-result' entry on the KPI idea
    // (inline result capture mirrors types/quest/Milestone.ts resultFields).
    brainstormStore.appendSystemEntry(stormId, ideaId, {
      content: `${amount >= 0 ? '+' : ''}${amount}${kpi.unit ? ` ${kpi.unit}` : ''} → ${currentValue}/${kpi.targetValue} · task ${task.id}`,
      state: 'others',
      type: 'kpi-result',
      pointsTo: [],
    });
  } catch (error) {
    console.warn('[brainstormTaskEngine] applyKpiResult failed (fail-open):', error);
  }
}
