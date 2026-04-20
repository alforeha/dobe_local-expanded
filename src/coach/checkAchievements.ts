// ─────────────────────────────────────────
// COACH — CHECK ACHIEVEMENTS
// Evaluates all AchievementDefinitions against current user state.
// Returns newly triggered achievements (not yet in BadgeBoard.earned or .pinned).
//
// Pure function — reads stores, never writes to them.
// ─────────────────────────────────────────

import type { User } from '../types/user';
import type { AchievementDefinition } from '../types/coach';
import { useProgressionStore } from '../stores/useProgressionStore';
import { useResourceStore } from '../stores/useResourceStore';
import { achievementLibrary } from './index';

// ── ACHIEVEMENT SNAPSHOT ──────────────────────────────────────────────────────

/**
 * Flat view of user state fields evaluated by AchievementThreshold conditions.
 * All numeric counters are resolved here so the evaluator stays clean.
 */
interface AchievementSnapshot {
  tasksCompleted: number;
  questsCompleted: number;
  eventsCompleted: number;
  /** Count of badges placed on BadgeBoard by user (pinned[].length) */
  badgesPlaced: number;
  /** Count of gear items currently in Equipment.equipment[] */
  gearOwned: number;
  /** Count of Acts in ProgressionStore */
  actsCreated: number;
  /** Count of Resources in ResourceStore */
  resourcesCreated: number;
  streakCurrent: number;
  streakBest: number;
  level: number;
  gold: number;
  /** stat group → statPoints total */
  statPointsByGroup: Record<string, number>;
}

function buildSnapshot(user: User): AchievementSnapshot {
  const milestones = user.progression.stats.milestones;
  const acts = useProgressionStore.getState().acts;
  const resources = useResourceStore.getState().resources;

  const statPointsByGroup: Record<string, number> = {};
  for (const [key, group] of Object.entries(user.progression.stats.talents)) {
    statPointsByGroup[key] = group.statPoints;
  }

  return {
    tasksCompleted: milestones.tasksCompleted,
    questsCompleted: milestones.questsCompleted,
    eventsCompleted: milestones.eventsCompleted,
    badgesPlaced: user.progression.badgeBoard.pinned.length,
    gearOwned: user.progression.equipment.equipment.length,
    actsCreated: Object.keys(acts).length,
    resourcesCreated: Object.keys(resources).length,
    streakCurrent: milestones.streakCurrent,
    streakBest: milestones.streakBest,
    level: user.progression.stats.level,
    gold: user.progression.gold,
    statPointsByGroup,
  };
}

// ── ALREADY AWARDED CHECK ─────────────────────────────────────────────────────

function isAlreadyAwarded(achievementId: string, user: User): boolean {
  const allBadges = [
    ...user.progression.badgeBoard.earned,
    ...user.progression.badgeBoard.pinned,
  ];
  return allBadges.some((b) => b.contents.achievementRef === achievementId);
}

// ── CONDITION EVALUATOR ───────────────────────────────────────────────────────

function evaluateThreshold(def: AchievementDefinition, snap: AchievementSnapshot): boolean {
  const { triggerType, threshold } = def;

  switch (triggerType) {
    case 'first.time':
    case 'counter.threshold': {
      const val = snap[threshold.field as keyof AchievementSnapshot];
      if (typeof val !== 'number') return false;
      return val >= threshold.value;
    }

    case 'streak.threshold': {
      const val = snap[threshold.field as keyof AchievementSnapshot];
      if (typeof val !== 'number') return false;
      return val >= threshold.value;
    }

    case 'level.threshold': {
      if (threshold.anyStatGroup) {
        return Object.values(snap.statPointsByGroup).some((pts) => pts >= threshold.value);
      }
      if (threshold.statGroup) {
        return (snap.statPointsByGroup[threshold.statGroup] ?? 0) >= threshold.value;
      }
      // Default: overall level
      return snap.level >= threshold.value;
    }

    case 'gold.threshold': {
      return snap.gold >= threshold.value;
    }

    case 'combination': {
      if (threshold.allStats) {
        return Object.values(snap.statPointsByGroup).every((pts) => pts >= threshold.value);
      }
      // Generic combination: evaluate the named field
      const val = snap[threshold.field as keyof AchievementSnapshot];
      if (typeof val !== 'number') return false;
      return val >= threshold.value;
    }

    default:
      return false;
  }
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────

/**
 * Check all achievements against current user state.
 * Returns only newly unlocked achievements — not previously awarded.
 *
 * @param user  Current User snapshot — must be the freshest reference from the store.
 */
export function checkAchievements(user: User): AchievementDefinition[] {
  const snap = buildSnapshot(user);
  return achievementLibrary.achievements.filter(
    (def) => !isAlreadyAwarded(def.id, user) && evaluateThreshold(def, snap),
  );
}
