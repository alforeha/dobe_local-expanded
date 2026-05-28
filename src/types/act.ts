// ─────────────────────────────────────────
// ACT — CORE
// Top of the 4-level quest hierarchy: Act → Chain → Quest → Milestone.
// Only Act has a uuid — Chain, Quest, Milestone are array-indexed (D27).
// MVP07: Quest SMARTER field shapes locked — imports from ./quest/ subdirectory.
// ─────────────────────────────────────────

import type { QuestSpecific } from './quest/specific';
import type { QuestMeasurable } from './quest/measurable';
import type { QuestTimely } from './quest/timely';
import type { QuestExitStrategy } from './quest/exitStrategy';
import type { NestedAct } from './quest/Act';
import type { Milestone } from './quest/Milestone';

// Re-export quest subtypes so existing consumers (e.g. rollover.ts importing
// Marker from '../types/act') continue to resolve without path changes.
export type { GoalType, QuestSourceType, QuestSpecific } from './quest/specific';
export type { MarkerConditionType, Marker } from './quest/Marker';
export type { QuestTimely } from './quest/timely';
export type { Milestone } from './quest/Milestone';
export type { QuestMeasurable } from './quest/measurable';
export type { ExitStrategyOption, QuestExitStrategy } from './quest/exitStrategy';
export type { ActCommitment, NestedAct } from './quest/Act';

// ── QUEST (SMARTER framework — array-indexed within Chain) ───────────────────

export type SmarterCompletionState = 'active' | 'complete' | 'failed';

export interface Smarter {
  name: string;
  description: string;
  /** Ref to icon asset */
  icon: string;
  completionState: SmarterCompletionState;
  /** SMARTER S — end-state target value and sourceType evaluation routing (D01) */
  specific: QuestSpecific;
  /** SMARTER M — task types whose completions count toward progress (D02, Q02: flat list) */
  measurable: QuestMeasurable;
  /** SMARTER A — prereq quests, 91-day feasibility check — shape BUILD-time */
  attainable: Record<string, unknown>;
  /** SMARTER R — stat group, resource, or custom tag — shape BUILD-time */
  relevant: Record<string, unknown>;
  /** SMARTER T — Marker configuration and container object (D05) */
  timely: QuestTimely;
  /** SMARTER E — stub shape for missed finish line handling (D06) */
  exitStrategy: QuestExitStrategy;
  /** SMARTER R — reward grant and completion state handler — shape BUILD-time */
  result: Record<string, unknown>;
  /** Per-Smarter execution container */
  nestedAct: NestedAct;
  /** Logged Milestone results — array-indexed (D04) */
  milestones: Milestone[];
  /** XP or item ref — granted on quest completion */
  questReward: string;
  /**
   * Cached progress percentage 0–100.
   * Updated by questEngine.updateQuestProgress() after each Milestone completion.
   * Derived from measured value vs targetValue (taskInput path) or
   * resource property vs targetValue (resourceRef path).
   */
  progressPercent: number;
}

// ── CHAIN (WOOP framework — array-indexed within Act) ────────────────────────

export type WoopCompletionState = 'active' | 'complete' | 'failed';

export interface ChainUnlockCondition {
  type: 'immediate' | 'previousComplete' | 'manual' | 'date';
  date?: string;
}

export interface Woop {
  name: string;
  description: string;
  /** Ref to icon asset */
  icon: string;
  /** WOOP — exaggerated intention */
  wish: string;
  /** WOOP — mental imagery */
  outcome: string[];
  /** WOOP — blocker identification */
  obstacle: string[];
  /** WOOP — stages Quests, feeds SMARTER fields */
  plan: Record<string, unknown>;
  /** XP or item ref — granted on completion */
  chainReward: string;
  /** Controls when this chain becomes available */
  unlockCondition?: ChainUnlockCondition;
  /** Array of Quest objects — array-indexed (D27) */
  smarters: Smarter[];
  /** DQ5 stub — adaptive quests injected by Coach (future) */
  adaptiveSmarters?: Smarter[];
  /** Cached derived state */
  completionState: WoopCompletionState;
}

// ── ACT ROOT ──────────────────────────────────────────────────────────────────

export type AspirationCompletionState = 'active' | 'complete';

/** STUB: MULTI-USER — reserved for accountability partner/group settings once the MULTI-USER chapter ships. */
export type AccountabilityStub = null;

/** STUB: MULTI-USER — reserved for linked contacts shared into an Act once the MULTI-USER chapter ships. */
export type SharedContactsStub = null;

export type ActHabitat = 'habitats' | 'adventures';

export function makeDefaultChainUnlockCondition(chainIndex: number): ChainUnlockCondition {
  return chainIndex === 0
    ? { type: 'immediate' }
    : { type: 'previousComplete' };
}

export interface Aspiration {
  /** uuid — only Act gets a uuid in the quest hierarchy (D27) */
  id: string;
  name: string;
  description: string;
  /** Ref to icon asset */
  icon: string;
  /** user ref | coach ref — distinguishes habitat (user) from adventure (Coach) */
  owner: string;
  /** Which GOAL room tab this Act appears under (W17) */
  habitat?: ActHabitat;
  /** Array of Chain objects — array-indexed (D27) */
  woops: Woop[];
  completionState: AspirationCompletionState;
}
