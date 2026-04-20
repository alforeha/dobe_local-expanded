// ─────────────────────────────────────────
// ACT — CORE
// Top of the 4-level quest hierarchy: Act → Chain → Quest → Milestone.
// Only Act has a uuid — Chain, Quest, Milestone are array-indexed (D27).
// MVP07: Quest SMARTER field shapes locked — imports from ./quest/ subdirectory.
// ─────────────────────────────────────────

import type { QuestSpecific } from './quest/specific';
import type { QuestMeasurable } from './quest/measurable';
import type { QuestTimely } from './quest/timely';
import type { QuestExigency } from './quest/exigency';
import type { ActCommitment } from './quest/Act';
import type { Milestone } from './quest/Milestone';

// Re-export quest subtypes so existing consumers (e.g. rollover.ts importing
// Marker from '../types/act') continue to resolve without path changes.
export type { QuestSourceType, QuestSpecific } from './quest/specific';
export type { MarkerConditionType, Marker } from './quest/Marker';
export type { QuestTimely } from './quest/timely';
export type { Milestone } from './quest/Milestone';
export type { QuestMeasurable } from './quest/measurable';
export type { ExigencyOption, QuestExigency } from './quest/exigency';
export type { ActCommitment } from './quest/Act';

// ── QUEST (SMARTER framework — array-indexed within Chain) ───────────────────

export type QuestCompletionState = 'active' | 'complete' | 'failed';

export interface Quest {
  name: string;
  description: string;
  /** Ref to icon asset */
  icon: string;
  completionState: QuestCompletionState;
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
  exigency: QuestExigency;
  /** SMARTER R — reward grant and completion state handler — shape BUILD-time */
  result: Record<string, unknown>;
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

export type ChainCompletionState = 'active' | 'complete' | 'failed';

export interface ChainUnlockCondition {
  type: 'immediate' | 'previousComplete' | 'manual' | 'date';
  date?: string;
}

export interface Chain {
  name: string;
  description: string;
  /** Ref to icon asset */
  icon: string;
  /** WOOP — exaggerated intention */
  wish: string;
  /** WOOP — mental imagery */
  outcome: string;
  /** WOOP — blocker identification */
  obstacle: string;
  /** WOOP — stages Quests, feeds SMARTER fields */
  plan: Record<string, unknown>;
  /** XP or item ref — granted on completion */
  chainReward: string;
  /** Controls when this chain becomes available */
  unlockCondition?: ChainUnlockCondition;
  /** Array of Quest objects — array-indexed (D27) */
  quests: Quest[];
  /** DQ5 stub — adaptive quests injected by Coach (future) */
  adaptiveQuests?: Quest[];
  /** Cached derived state */
  completionState: ChainCompletionState;
}

// ── ACT ROOT ──────────────────────────────────────────────────────────────────

export type ActCompletionState = 'active' | 'complete';

/** STUB: MULTI-USER — reserved for accountability partner/group settings once the MULTI-USER chapter ships. */
export type AccountabilityStub = null;

/** STUB: MULTI-USER — reserved for linked contacts shared into an Act once the MULTI-USER chapter ships. */
export type SharedContactsStub = null;

export type ActHabitat = 'habitats' | 'adventures';

export interface ActToggle {
  activeChainIndex: number;
  autoAdvanceChains: boolean;
  sleepWithChain: boolean;
  /** STUB: MULTI-USER — additional toggle fields */
}

export const DEFAULT_ACT_TOGGLE: ActToggle = {
  activeChainIndex: 0,
  autoAdvanceChains: true,
  sleepWithChain: true,
};

export function makeDefaultActToggle(): ActToggle {
  return { ...DEFAULT_ACT_TOGGLE };
}

export function makeDefaultChainUnlockCondition(chainIndex: number): ChainUnlockCondition {
  return chainIndex === 0
    ? { type: 'immediate' }
    : { type: 'previousComplete' };
}

export interface Act {
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
  chains: Chain[];
  /** STUB: MULTI-USER — tracks accountability partners and shared progress rules when the MULTI-USER chapter is enabled. */
  accountability: AccountabilityStub;
  /** ACTS C — trackedTaskRefs and routineRefs (D07, D08) */
  commitment: ActCommitment;
  /** ACTS T — gating logic stub — BUILD-time (D08) */
  toggle: ActToggle | null;
  completionState: ActCompletionState;
  /** STUB: MULTI-USER — stores contact refs shared into this Act when the MULTI-USER chapter is enabled. */
  sharedContacts: SharedContactsStub;
}
