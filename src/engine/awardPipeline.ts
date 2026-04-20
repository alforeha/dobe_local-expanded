// ─────────────────────────────────────────
// AWARD PIPELINE — XP + STAT AWARDS
// Implements the RuneScape XP curve (D43, D49) and stat group routing (D48).
//
// awardXP()   — add XP to user, check for level-up, update cache
// awardStat() — add stat points to a talent group, award talentPoints at threshold
//
// XP threshold table is generated at module init and cached in-process.
// CharacterLibrary (APP BUNDLE) is the canonical source in production —
// this module provides the same table as a code-generated fallback for LOCAL.
//
// RuneScape formula (D49) — A=0.25, B=300, C=7:
//   xpForLevel(L) = floor( A * sum_{i=1}^{L-1} floor(i + B * 2^(i/C)) )
// ─────────────────────────────────────────

import type { GearDefinition } from '../types/coach';
import type { StatGroupKey, User } from '../types/user';
import { useUserStore } from '../stores/useUserStore';

import { checkAchievements } from '../coach/checkAchievements';
import { characterLibrary } from '../coach';
import { awardBadge, awardGear, checkCoachDrops } from '../coach/rewardPipeline';
import { pushRibbet } from '../coach/ribbet';
import { appendFeedEntry, FEED_SOURCE } from './feedEngine';
import { getXPBoostSnapshot, type XPAwardContext } from './xpBoosts';

// ── XP CURVE PARAMETERS (D49) ────────────────────────────────────────────────

const A = 0.25;
const B = 300;
const C = 7;
const MAX_LEVEL = 120; // generate table to lvl 120

// ── XP THRESHOLD TABLE ────────────────────────────────────────────────────────

/**
 * Generates the RuneScape-style XP threshold table up to MAX_LEVEL.
 * levelThresholds[L] = total XP required to reach level L+1 (0-indexed: index 0 = lvl 1).
 *
 * The formula: xpToReachLevel(L) = floor( A * sum_{i=1}^{L-1}( floor(i + B * 2^(i/C)) ) )
 */
function generateLevelThresholds(): number[] {
  const thresholds: number[] = [0]; // Level 1 requires 0 XP
  let runningSum = 0;
  for (let level = 2; level <= MAX_LEVEL; level++) {
    // Sum floor(i + B * 2^(i/C)) for i=1..level-1 (incremental)
    const iVal = level - 1;
    runningSum += Math.floor(iVal + B * Math.pow(2, iVal / C));
    thresholds.push(Math.floor(A * runningSum));
  }
  return thresholds;
}

/** levelThresholds[n] = minimum XP to be at level n+1 (index 0 = level 1 = 0 XP) */
const LEVEL_THRESHOLDS: readonly number[] = generateLevelThresholds();

/**
 * Derive level from total XP.
 * Returns 1 at minimum, MAX_LEVEL at maximum.
 */
export function deriveLevelFromXP(xp: number): number {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
    } else {
      break;
    }
  }
  return Math.min(level, MAX_LEVEL);
}

/**
 * Returns XP progress within the current level.
 * Use for XP bar displays that show xpSinceLastLevel / xpForThisLevel.
 */
export function xpProgress(totalXP: number): {
  level: number;
  xpSinceLastLevel: number;
  xpForThisLevel: number;
} {
  const level = deriveLevelFromXP(totalXP);
  const levelStart = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const levelEnd = LEVEL_THRESHOLDS[level] ?? levelStart + 1000;
  return {
    level,
    xpSinceLastLevel: totalXP - levelStart,
    xpForThisLevel: levelEnd - levelStart,
  };
}

// ── MULTIPLIER SPEC ───────────────────────────────────────────────────────────

export interface XPMultipliers {
  /** True when the award came from a wisdom-tagged task. */
  isWisdomTask?: boolean;
  /** Stat bucket the XP belongs to for gear/talent processing. */
  statGroup?: StatGroupKey | null;
  /** True when the task was completed inside a non-Quick Actions event. */
  isEventTask?: boolean;
  /** Optional secondary tag for future talent pass hooks. */
  secondaryTag?: string | null;
  /** Debug label for reward source tracing. */
  source?: string;
  /** Suppress default pipeline logging when a caller emits a consolidated summary log. */
  suppressLog?: boolean;
}

export interface XPAwardResult {
  source: string;
  rawAmount: number;
  awardedAmount: number;
  userId: string;
  oldXP: number;
  newXP: number;
  oldLevel: number;
  newLevel: number;
  wisdomTask: boolean;
  activeMultipliers: string[];
  multiplierSnapshot: ReturnType<typeof getXPBoostSnapshot>;
}

export interface GoldAwardOptions {
  source?: string;
  suppressLog?: boolean;
}

function getActiveMultiplierLabels(snapshot: ReturnType<typeof getXPBoostSnapshot>): string[] {
  const labels: string[] = [];
  if (snapshot.earlyBirdActive) labels.push(`earlyBird:${snapshot.timeMultiplier}x`);
  if (snapshot.lateNightActive) labels.push(`lateNight:${snapshot.timeMultiplier}x`);
  if (snapshot.streak > 0) labels.push(`streak:${snapshot.streakMultiplier}x`);
  if (snapshot.roll) labels.push(`roll:+${snapshot.roll.additiveBonus.toFixed(2)}`);
  return labels;
}

function getEquippedGearBonus(user: User, statGroup: StatGroupKey | null | undefined): number {
  if (!statGroup) return 0;

  return Object.values(user.progression.avatar.equippedGear).reduce((total, gearId) => {
    if (!gearId) return total;
    const gear = characterLibrary.gearDefinitions.find((entry) => entry.id === gearId);
    return total + (gear?.statBonus?.[statGroup] ?? 0);
  }, 0);
}

function getTalentAdjustedBase(
  baseAmount: number,
  gearBonus: number,
  user: User,
  multipliers?: XPMultipliers,
): number {
  let adjustedBase = baseAmount + gearBonus;
  const statGroup = multipliers?.statGroup;
  if (!statGroup) return adjustedBase;

  const nodes = user.progression.talentTrees?.[statGroup]?.nodes;
  if (!nodes || nodes.length === 0) return adjustedBase;

  adjustedBase += nodes[0]?.currentPoints ?? 0;

  return adjustedBase;
}

function applyTierThreeTalentStub(
  adjustedBase: number,
  _user: User,
  _multipliers?: XPMultipliers,
): number {
  return adjustedBase;
}

// ── AWARD XP ──────────────────────────────────────────────────────────────────

/**
 * Add XP to the user, re-derive level, and emit a levelUp marker if threshold crossed.
 *
 * Reads  — useUserStore.user.progression.stats
 * Writes — useUserStore (stats.xp, stats.level), storageLayer (user)
 *
 * @param userId      User.system.id — validated against current store user
 * @param amount      Raw XP to award before boost rules are applied
 * @param multipliers Optional task context for boost eligibility
 */
export function awardXP(
  userId: string,
  amount: number,
  multipliers?: XPMultipliers,
): XPAwardResult | null {
  const userStore = useUserStore.getState();
  const user = userStore.user;
  if (!user || user.system.id !== userId) return null;

  const gearBonus = getEquippedGearBonus(user, multipliers?.statGroup);
  let adjustedBase = getTalentAdjustedBase(amount, gearBonus, user, multipliers);
  if (multipliers?.statGroup === 'wisdom' && getXPBoostSnapshot(user).lateNightActive) {
    adjustedBase += 2;
  }
  const finalBaseAmount = applyTierThreeTalentStub(adjustedBase, user, multipliers);
  const boostSnapshot = getXPBoostSnapshot(user, multipliers as XPAwardContext | undefined);
  let effectiveAmount = Math.max(1, Math.round(finalBaseAmount * boostSnapshot.finalMultiplier));
  if (multipliers?.isEventTask && multipliers.statGroup) {
    const nodes = user.progression.talentTrees?.[multipliers.statGroup]?.nodes;
    const eventPercent = nodes?.[1]?.currentPoints ?? 0;
    if (eventPercent > 0) {
      effectiveAmount += Math.round(effectiveAmount * (eventPercent / 100));
    }
  }
  if (effectiveAmount <= 0) return null;

  const oldLevel = user.progression.stats.level;
  const oldXP = user.progression.stats.xp;
  const newXP = user.progression.stats.xp + effectiveAmount;
  const newLevel = deriveLevelFromXP(newXP);

  const updatedStats = {
    ...user.progression.stats,
    xp: newXP,
    level: newLevel,
  };

  const updatedUser = {
    ...user,
    progression: { ...user.progression, stats: updatedStats },
  };

  userStore.setUser(updatedUser);

  const result: XPAwardResult = {
    source: multipliers?.source ?? 'unspecified',
    rawAmount: finalBaseAmount,
    awardedAmount: effectiveAmount,
    userId,
    oldXP,
    newXP,
    oldLevel,
    newLevel,
    wisdomTask: multipliers?.isWisdomTask ?? false,
    activeMultipliers: getActiveMultiplierLabels(boostSnapshot),
    multiplierSnapshot: boostSnapshot,
  };

  if (!multipliers?.suppressLog) {
    console.info('[reward.xp]', result);
  }

  if (newLevel > oldLevel) {
    console.info(`[awardPipeline] Level up! ${oldLevel} → ${newLevel} (XP: ${newXP})`);
    pushRibbet('level.up', { level: newLevel });

    // Coach drops for milestone levels — re-fetch after setUser above
    let levelUser = useUserStore.getState().user;
    if (levelUser) {
      levelUser = checkCoachDrops(levelUser, oldLevel, newLevel);

      // Achievement check after drops
      const postDropUser = useUserStore.getState().user ?? levelUser;
      const newAchs = checkAchievements(postDropUser);
      let currentUser = postDropUser;
      for (const ach of newAchs) {
        currentUser = awardBadge(ach, currentUser);
      }

      // Feed entry for level-up
      const levelFeedUser = useUserStore.getState().user ?? currentUser;
      appendFeedEntry({
        commentBlock: `Level up! Now level ${newLevel}`,
        sourceType: FEED_SOURCE.LEVEL_UP,
        timestamp: new Date().toISOString(),
      }, levelFeedUser);
    }
  }

  return result;
}

// ── AWARD GOLD (D98) ──────────────────────────────────────────────────────────

/**
 * Add gold to the user. Returns the updated User — caller must write to store.
 *
 * @param amount  Gold to add (positive integer)
 * @param user    Current User
 */
export function awardGold(amount: number, user: User, options?: string | GoldAwardOptions): User {
  const source = typeof options === 'string' ? options : (options?.source ?? 'unspecified');
  const suppressLog = typeof options === 'string' ? false : (options?.suppressLog ?? false);
  const updatedUser = {
    ...user,
    progression: {
      ...user.progression,
      gold: (user.progression.gold ?? 0) + amount,
    },
  };
  if (!suppressLog) {
    console.info('[reward.gold]', {
      source,
      amount,
      oldGold: user.progression.gold ?? 0,
      newGold: updatedUser.progression.gold ?? 0,
      userId: user.system.id,
    });
  }
  return updatedUser;
}

export function awardRandomCommonGear(user: User): User {
  return awardRandomGearByRarity(user, ['common'], {
    source: 'dailyQuest.complete.common-drop',
    goldFallback: 5,
    fallbackSource: 'dailyQuest.complete.common-gear-bonus',
  });
}

function awardRandomGearByRarity(
  user: User,
  rarities: GearDefinition['rarity'][],
  options: {
    source: string;
    goldFallback: number;
    fallbackSource: string;
  },
): User {
  const eligibleGear = characterLibrary.gearDefinitions.filter((gear) => rarities.includes(gear.rarity));
  const owned = new Set(user.progression.equipment.equipment);
  const unowned = eligibleGear.filter((gear) => !owned.has(gear.id));

  if (unowned.length === 0) {
    return awardGold(options.goldFallback, user, options.fallbackSource);
  }

  const selected = unowned[Math.floor(Math.random() * unowned.length)];
  if (!selected) return user;

  return awardGear(selected.id, options.source, user);
}

export function awardQuestCompletionLoot(user: User): User {
  return awardRandomGearByRarity(user, ['common'], {
    source: 'quest.complete.common-drop',
    goldFallback: 5,
    fallbackSource: 'quest.complete.common-gear-bonus',
  });
}

export function awardChainCompletionLoot(user: User): User {
  const rareOrAbove: GearDefinition['rarity'][] = ['rare', 'epic', 'legendary'];
  return awardRandomGearByRarity(user, rareOrAbove, {
    source: 'chain.complete.rare-drop',
    goldFallback: 10,
    fallbackSource: 'chain.complete.rare-gear-bonus',
  });
}

// ── AWARD STAT ────────────────────────────────────────────────────────────────

const TALENT_POINT_THRESHOLD = 100;

/**
 * Add stat points to a talent group. Awards 1 talentPoint per 100 accumulated statPoints.
 * Custom task fallback: if statGroup is null/undefined, routes to wisdom +25 (D48).
 *
 * Reads  — useUserStore.user.progression.stats.talents + talentPoints
 * Writes — useUserStore (stats.talents, stats.talentPoints), storageLayer
 *
 * @param userId    User.system.id — validated against current store user
 * @param statGroup The StatGroupKey to award points to, or null for wisdom fallback
 * @param points    Points to add to the group
 */
export function awardStat(
  userId: string,
  statGroup: StatGroupKey | null | undefined,
  points: number,
  source = 'unspecified',
): void {
  const userStore = useUserStore.getState();
  const user = userStore.user;
  if (!user || user.system.id !== userId) return;

  // D48 — custom task fallback: route to wisdom if no stat group set
  const targetGroup: StatGroupKey = statGroup ?? 'wisdom';
  const effectivePoints = statGroup ? points : 25;

  const oldGroup = user.progression.stats.talents[targetGroup];
  const newStatPoints = oldGroup.statPoints + effectivePoints;
  const newXpEarned = oldGroup.xpEarned + effectivePoints;

  // Check how many talentPoints should be awarded from the threshold
  const oldThresholdsPassed = Math.floor(oldGroup.statPoints / TALENT_POINT_THRESHOLD);
  const newThresholdsPassed = Math.floor(newStatPoints / TALENT_POINT_THRESHOLD);
  const talentPointsEarned = newThresholdsPassed - oldThresholdsPassed;

  const updatedTalents = {
    ...user.progression.stats.talents,
    [targetGroup]: {
      ...oldGroup,
      statPoints: newStatPoints,
      xpEarned: newXpEarned,
    },
  };

  const updatedStats = {
    ...user.progression.stats,
    talents: updatedTalents,
  };

  const updatedUser = {
    ...user,
    progression: {
      ...user.progression,
      stats: updatedStats,
      talentPoints: user.progression.talentPoints + talentPointsEarned,
    },
  };

  userStore.setUser(updatedUser);

  console.info('[reward.stat]', {
    source,
    requestedGroup: statGroup ?? 'wisdom-fallback',
    awardedGroup: targetGroup,
    requestedPoints: points,
    awardedPoints: effectivePoints,
    oldStatPoints: oldGroup.statPoints,
    newStatPoints,
    talentPointsEarned,
    userId,
  });
}
