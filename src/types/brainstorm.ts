import type { RecurrenceRule } from './taskTemplate';

export type StormState = 'active' | 'incubating' | 'archived' | 'resolved' | 'folding';
/** 'work' added Track C (Sprint 5) — ungated single-tree storms surfaced via Work Loads. */
export type StormType = 'exploration' | 'problem' | 'planning' | 'reflection' | 'project' | 'projection' | 'general' | 'work' | 'others';
export type StormCategory = {
  name: string;
  color: string;
};
export type StormDraft = {
  type: StormType;
  category: StormCategory;
};
export type IdeaState = 'open' | 'in-progress' | 'resolved' | 'parked' | 'others';
export type IdeaType =
  // ── existing values unchanged ──
  'insight' | 'question' | 'hypothesis' | 'blocker' | 'action' |
  'node' | 'spark' | 'blip' | 'box' | 'data' | 'peak' | 'prop' |
  'others' |
  // ── Track B additions (additive, no migration) ──
  'statement' | 'principle' | 'stage' | 'outcome' | 'obstacle' |
  'step' | 'kpi' | 'milestone';
export type EntryState = 'outcome' | 'obstacle' | 'question' | 'solved' | 'others';
export type EntryType =
  'general' | 'observation' | 'question' | 'research' | 'hypothesis' |
  'test' | 'review' | 'result' | 'bet' | 'others' |
  /** Track B §2 — engine-written audit entries logged by the KPI sync write-back. */
  'kpi-result';
export type PointerType =
  | 'solution' | 'choice' | 'others' // existing — unchanged
  /** provenance: target was derived/promoted from source (Track B §3) */
  | 'inherits'
  /** source's results contribute to the target KPI idea (Track B §3) */
  | 'feeds-kpi'
  /** source satisfies/completes the target — step → outcome, milestone → stage (Track B §3) */
  | 'fulfils';

// ── TYPE DATA (Track B §2) ────────────────────────────────────────────────────

/** WOOP payload inherited (subset) from types/act.ts Woop — same field names, same shapes. */
export interface StormWoop {
  wish: string;
  outcome: string[];
  obstacle: string[];
  plan: Record<string, unknown>;
}

export type IdeaTypeData =
  | { kind: 'statement'; lockedAt?: string /* ISO — set when principle gate passes */ }
  | { kind: 'principle'; rank?: number /* ordering in the principle list */ }
  | { kind: 'stage'; order: number; status: 'pending' | 'active' | 'complete'; woop: StormWoop }
  | { kind: 'outcome'; stageRef?: string /* idea id of owning stage when hoisted */ }
  | { kind: 'obstacle'; stageRef?: string }
  | { kind: 'step'; order?: number; done?: boolean }
  | { kind: 'kpi'; metric: string; unit?: string | null;
      direction: 'increase' | 'decrease' | 'maintain';
      targetValue: number; currentValue: number;
      /** Optional TaskTemplate ref — when set, the sync engine materialises check-in tasks (§5). */
      taskTemplateRef?: string | null;
      /** Recurrence for generated check-ins — reuses RecurrenceRule from types/taskTemplate.ts. */
      cadence?: RecurrenceRule | null;
      /** Cached 0–100, recomputed on every write-back — mirrors Smarter.progressPercent. */
      progressPercent: number;
      lastSyncedAt?: string /* ISO */ }
  | { kind: 'milestone'; dueDate?: string | null;
      /** Result capture on completion — same inline pattern as types/quest/Milestone.ts resultFields. */
      resultFields?: Record<string, unknown>; completedAt?: string | null };

/** IdeaTypes that carry a typed payload — typeData.kind must match the idea's type. */
const TYPE_DATA_KINDS: ReadonlyArray<IdeaTypeData['kind']> = [
  'statement', 'principle', 'stage', 'outcome', 'obstacle', 'step', 'kpi', 'milestone',
];

/**
 * Normalize-on-read/write (precedent: normalizeCircuitInputFields,
 * normalizeTemplateMuscleGroups): returns a valid payload or undefined.
 * A payload whose kind does not match the idea's type is dropped, never thrown.
 */
export function normalizeIdeaTypeData(
  ideaType: IdeaType,
  typeData: IdeaTypeData | undefined,
): IdeaTypeData | undefined {
  if (!typeData) return undefined;
  if (!TYPE_DATA_KINDS.includes(typeData.kind)) return undefined;
  if (typeData.kind !== ideaType) return undefined;
  return typeData;
}

/** Seed a default typed payload for a newly created idea of a Track B type. */
export function makeDefaultIdeaTypeData(
  ideaType: IdeaType,
  options?: { stageOrder?: number },
): IdeaTypeData | undefined {
  switch (ideaType) {
    case 'statement':
      return { kind: 'statement' };
    case 'principle':
      return { kind: 'principle' };
    case 'stage':
      return {
        kind: 'stage',
        order: options?.stageOrder ?? 1,
        status: 'pending',
        woop: { wish: '', outcome: [], obstacle: [], plan: {} },
      };
    case 'outcome':
      return { kind: 'outcome' };
    case 'obstacle':
      return { kind: 'obstacle' };
    case 'step':
      return { kind: 'step', done: false };
    case 'kpi':
      return {
        kind: 'kpi',
        metric: '',
        direction: 'increase',
        targetValue: 0,
        currentValue: 0,
        taskTemplateRef: null,
        cadence: null,
        progressPercent: 0,
      };
    case 'milestone':
      return { kind: 'milestone', dueDate: null, completedAt: null };
    default:
      return undefined;
  }
}

// ── STORM TYPE META + GATING (Track B §4) ─────────────────────────────────────

export interface StormTypeGating {
  /** Required root MainIdea type. */
  root: IdeaType;
  /** Ordered unlock chain — each step unlocks when `requires` is met on the tree. */
  chain: Array<{
    /** Type that becomes creatable. */
    unlocks: IdeaType;
    /** Gate condition. */
    requires: { type: IdeaType; minCount: number };
  }>;
}

export interface StormTypeMeta {
  displayName: string;
  mainIdeaTerm: string;
  addLabel: string;
  /** Idea types creatable in this storm type. Absent = all types allowed (legacy behavior). */
  allowedIdeaTypes?: IdeaType[];
  /** Absent = ungated (legacy behavior). */
  gating?: StormTypeGating;
}

export const STORM_TYPE_META: Record<StormType, StormTypeMeta> = {
  general: { displayName: 'General Void', mainIdeaTerm: 'Node', addLabel: '+ Node' },
  exploration: { displayName: 'Interest Map', mainIdeaTerm: 'Spark', addLabel: '+ Spark' },
  problem: { displayName: 'Be Aware Radar', mainIdeaTerm: 'Blip', addLabel: '+ Blip' },
  reflection: { displayName: 'Grid Log', mainIdeaTerm: 'Data', addLabel: '+ Data' },
  planning: { displayName: 'Stage Staging', mainIdeaTerm: 'Box', addLabel: '+ Box' },
  project: {
    displayName: 'Top Graphing',
    mainIdeaTerm: 'Peak',
    addLabel: '+ Peak',
    allowedIdeaTypes: ['statement', 'principle', 'stage', 'outcome', 'obstacle', 'step', 'kpi', 'milestone'],
    // PM-specified flow: Statement → min-3 Principles → Stages with WOOP.
    gating: {
      root: 'statement',
      chain: [
        { unlocks: 'principle', requires: { type: 'statement', minCount: 1 } },
        { unlocks: 'stage', requires: { type: 'principle', minCount: 3 } },
        // Stage children unlock with their parent stage:
        { unlocks: 'outcome', requires: { type: 'stage', minCount: 1 } },
        { unlocks: 'obstacle', requires: { type: 'stage', minCount: 1 } },
        { unlocks: 'step', requires: { type: 'stage', minCount: 1 } },
        { unlocks: 'kpi', requires: { type: 'stage', minCount: 1 } },
        { unlocks: 'milestone', requires: { type: 'stage', minCount: 1 } },
      ],
    },
  },
  projection: { displayName: 'Level Rod', mainIdeaTerm: 'Prop', addLabel: '+ Prop' },
  work: {
    displayName: 'Work Loads',
    mainIdeaTerm: 'Load',
    addLabel: '+ Load',
    // Ungated single tree of plain nodes — surfaced via Work Loads (Track C).
    allowedIdeaTypes: ['node'],
  },
  others: { displayName: 'Others', mainIdeaTerm: 'Idea', addLabel: '+ Idea' },
};

export const STORM_STATE_META: Record<StormState, { displayName: string; iconKey: string }> = {
  active: { displayName: 'Active', iconKey: 'storm-state-active' },
  incubating: { displayName: 'Incubating', iconKey: 'storm-state-incubating' },
  archived: { displayName: 'Archived', iconKey: 'storm-state-archived' },
  resolved: { displayName: 'Resolved', iconKey: 'storm-state-resolved' },
  folding: { displayName: 'Folding', iconKey: 'storm-state-folding' },
};

export const ENTRY_TYPE_META: Record<EntryType, { displayName: string }> = {
  general: { displayName: 'General' },
  observation: { displayName: 'Observation' },
  question: { displayName: 'Question' },
  research: { displayName: 'Research' },
  hypothesis: { displayName: 'Hypothesis' },
  test: { displayName: 'Test' },
  review: { displayName: 'Review' },
  result: { displayName: 'Result' },
  bet: { displayName: 'Bet' },
  others: { displayName: 'Others' },
  'kpi-result': { displayName: 'KPI Result' },
};

export interface BrainstormEntry {
  id: string;
  content: string;
  state: EntryState;
  type: EntryType;
  customProperties?: Record<string, string>;
  entries: BrainstormEntry[];
  pointsTo: Array<{
    targetId: string;
    targetType: 'entry' | 'idea';
    pointerType: PointerType;
  }>;
}

export interface BrainstormIdea {
  id: string;
  title: string;
  state: IdeaState;
  type: IdeaType;
  customProperties?: Record<string, string>;
  /** Typed structured payload per IdeaType (Track B). Absent on legacy data — readers must treat undefined as "no payload". */
  typeData?: IdeaTypeData;
  entries: BrainstormEntry[];
  ideas: string[];
  pointsTo: Array<{ targetId: string; pointerType: PointerType }>;
  parentIdeaId: string | null;
  mainIdeaId: string;
}

export interface MainIdea {
  id: string;
  title: string;
  state: IdeaState;
  type: IdeaType;
  customProperties?: Record<string, string>;
  /** Typed structured payload per IdeaType (Track B). Absent on legacy data. */
  typeData?: IdeaTypeData;
  entries: BrainstormEntry[];
  ideas: string[];
}

export interface Storm {
  id: string;
  name: string;
  state: StormState;
  type: StormType;
  /** Optional display icon (iconMap key) — additive; falls back to `storm-${type}` (Sprint 5). */
  icon?: string;
  category: StormCategory;
  brainWidthPoints: number;
  brainWidthCap: number;
  brainWidthStaked: number;
  lastRegenAt: number;
  mainIdeas: Record<string, MainIdea>;
  ideas: Record<string, BrainstormIdea>;
}

export interface BrainstormState {
  storms: Record<string, Storm>;
  selectedStormId: string | null;
  selectedMainIdeaId: string | null;
  selectedIdeaId: string | null;
}

// ── GATING EVALUATION (Track B §4) ────────────────────────────────────────────

function countIdeasByType(storm: Storm): Partial<Record<IdeaType, number>> {
  const counts: Partial<Record<IdeaType, number>> = {};
  for (const mainIdea of Object.values(storm.mainIdeas)) {
    counts[mainIdea.type] = (counts[mainIdea.type] ?? 0) + 1;
  }
  for (const idea of Object.values(storm.ideas)) {
    counts[idea.type] = (counts[idea.type] ?? 0) + 1;
  }
  return counts;
}

/**
 * Pure, cheap gating evaluation: counts ideas by type and walks the gating chain.
 * Returns the idea types currently creatable in this storm, or null when the
 * storm type has no type config at all (legacy behavior — callers keep their
 * existing full type list, so ungated storms are untouched).
 */
export function getUnlockedIdeaTypes(storm: Storm): IdeaType[] | null {
  const meta = STORM_TYPE_META[storm.type];
  if (!meta || (!meta.allowedIdeaTypes && !meta.gating)) return null;

  const allowed = meta.allowedIdeaTypes;
  if (!meta.gating) {
    return allowed ? [...allowed] : null;
  }

  const counts = countIdeasByType(storm);
  const unlocked: IdeaType[] = [];

  // Root type creatable until it exists (cardinality: exactly 1).
  if ((counts[meta.gating.root] ?? 0) === 0) {
    unlocked.push(meta.gating.root);
  }
  for (const step of meta.gating.chain) {
    if ((counts[step.requires.type] ?? 0) >= step.requires.minCount && !unlocked.includes(step.unlocks)) {
      unlocked.push(step.unlocks);
    }
  }

  return allowed ? unlocked.filter((type) => allowed.includes(type)) : unlocked;
}
