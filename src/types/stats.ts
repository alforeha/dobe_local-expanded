// ─────────────────────────────────────────
// USER STATS — DATA (nested in User)
// XP, level, streaks, and stat group progression.
// Level is derived at runtime — never source of truth.
// ─────────────────────────────────────────

import type { StatGroupKey } from './user';

// ── TALENT TREE ────────────────────────────────────────────────────────────────

export interface TalentGroupStats {
  statPoints: number;
  xpEarned: number;
  tier: 0 | 1 | 2 | 3 | 4 | 5;
}

export type Talents = Record<StatGroupKey, TalentGroupStats>;

/**
 * WoW-style 6 trees × 5 tiers.
 * Stores user unlocked state only. Enhancement catalogue lives in Coach bundle (D43).
 */

// ── MILESTONES / STREAKS ───────────────────────────────────────────────────────

export interface UserMilestones {
  streakCurrent: number;  // login-based
  streakBest: number;
  /** Best naturally earned streak. Gold saves must not increase this value. */
  longestHonestStreak: number;
  /** Number of missed days currently eligible for a gold streak save. */
  streakSaveMissedDays?: number;
  /** Saved streak boost value restored by gold without changing streakCurrent. */
  streakBoostSavedValue?: number;
  /** Previous streak value available to restore after a break. */
  streakSavePreviousValue?: number;
  questsCompleted: number;
  tasksCompleted: number;
  eventsCompleted: number;
}

// ── USER STATS ROOT ──────────────────────────────────────────────────────────

export interface UserStats {
  /** Total XP earned. Level derived from this at runtime (D43) */
  xp: number;
  /** Cached — derived from XP at runtime. Never source of truth */
  level: number;
  /** Unspent balance — 1 point per 100 statPoints earned */
  milestones: UserMilestones;
  talents: Talents;
  /** Unlocked state only — catalogue in Coach bundle */
}
