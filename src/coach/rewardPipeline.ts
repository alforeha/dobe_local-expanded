// ─────────────────────────────────────────
// COACH — REWARD PIPELINE
// Creates Badge and Gear item instances and delivers them to user state.
//
// awardBadge()       — Badge → BadgeBoard.earned[], optional Gear drop
// awardGear()        — Gear → Equipment.equipment[]
// checkQuestReward() — Quest.questReward → awardGear if set
// checkCoachDrops()  — Level milestone → coach.drop gear gift
//
// All functions are pure w.r.t. their return value — they return the updated User
// so callers can chain. Store + storage writes happen inside each function.
// ─────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';
import type { User } from '../types/user';
import type { Quest } from '../types/act';
import type { Badge } from '../types/itemTemplate';
import type { AchievementDefinition } from '../types/coach';
import { useUserStore } from '../stores/useUserStore';

import { pushRibbet } from './ribbet';
import { characterLibrary } from './index';
import { appendFeedEntry, FEED_SOURCE } from '../engine/feedEngine';

// ── AWARD BADGE ────────────────────────────────────────────────────────────────

/**
 * Create a Badge item from an AchievementDefinition and push it to
 * user.progression.badgeBoard.earned[].
 *
 * Also writes to ResourceStore and localStorage.
 * If the definition carries a rewardRef, triggers awardGear() as a bonus drop.
 *
 * @returns Updated User — use this reference for downstream chaining.
 */
export function awardBadge(achievementDef: AchievementDefinition, user: User): User {
  const now = new Date().toISOString();
  const badgeId = uuidv4();

  const badge: Badge = {
    id: badgeId,
    type: 'badge',
    name: achievementDef.name,
    description: achievementDef.description,
    icon: achievementDef.icon,
    source: 'badge.reward',
    contents: {
      achievementRef: achievementDef.id,
      awardedDate: now,
      placed: false,
      boardX: undefined,
      boardY: undefined,
      location: null,
    },
  };

  const updatedBadgeBoard = {
    ...user.progression.badgeBoard,
    earned: [badge, ...user.progression.badgeBoard.earned],
  };

  let updatedUser: User = {
    ...user,
    progression: { ...user.progression, badgeBoard: updatedBadgeBoard },
  };

  useUserStore.getState().setUser(updatedUser);

  console.info('[reward.badge]', {
    source: 'badge.reward',
    achievementId: achievementDef.id,
    badgeName: achievementDef.name,
    badgeId,
    rewardRef: achievementDef.rewardRef ?? null,
    userId: user.system.id,
  });

  pushRibbet('badge.awarded', { itemName: achievementDef.name });

  // Feed entry for badge award
  appendFeedEntry({
    commentBlock: `Badge earned: ${achievementDef.name}`,
    sourceType: FEED_SOURCE.BADGE_AWARDED,
    timestamp: new Date().toISOString(),
    triggerRef: badgeId,
  }, updatedUser);

  // Gear reward if the achievement carries a rewardRef
  if (achievementDef.rewardRef) {
    updatedUser = awardGear(achievementDef.rewardRef, 'badge.reward', updatedUser);
  }

  return updatedUser;
}

// ── AWARD GEAR ─────────────────────────────────────────────────────────────────

/**
 * Create a Gear item from CharacterLibrary.gearDefinitions and append its id
 * to user.progression.equipment.equipment[].
 *
 * Also writes to ResourceStore and localStorage.
 *
 * @param gearDefId  id from CharacterLibrary.gearDefinitions
 * @param source     ItemSource string — e.g. 'badge.reward', 'quest.reward', 'coach.drop'
 * @returns Updated User.
 */
export function awardGear(gearDefId: string, source: string, user: User): User {
  const gearDef = characterLibrary.gearDefinitions.find((g) => g.id === gearDefId);
  if (!gearDef) {
    console.warn(`[rewardPipeline] awardGear: gearDefinition "${gearDefId}" not found`);
    return user;
  }

  const alreadyOwned = user.progression.equipment.equipment.includes(gearDefId);

  const updatedEquipment = {
    ...user.progression.equipment,
    equipment: alreadyOwned
      ? user.progression.equipment.equipment
      : [...user.progression.equipment.equipment, gearDefId],
  };

  const updatedUser: User = {
    ...user,
    progression: { ...user.progression, equipment: updatedEquipment },
  };

  useUserStore.getState().setUser(updatedUser);

  console.info('[reward.gear]', {
    source,
    gearDefinitionId: gearDefId,
    gearName: gearDef.name,
    slot: gearDef.slot,
    rarity: gearDef.rarity,
    alreadyOwned,
    userId: user.system.id,
  });

  pushRibbet('gear.awarded', { itemName: gearDef.name });

  // Feed entry for gear award
  appendFeedEntry({
    commentBlock: `Gear awarded: ${gearDef.name}`,
    sourceType: FEED_SOURCE.GEAR_AWARDED,
    timestamp: new Date().toISOString(),
    triggerRef: gearDefId,
  }, updatedUser);

  return updatedUser;
}

// ── QUEST REWARD ───────────────────────────────────────────────────────────────

/**
 * Check quest.questReward — if set, award the referenced gear item on quest completion.
 * Called by completeTask() after a Quest transitions to completionState 'complete'.
 *
 * @returns Updated User (unchanged if no reward set or gear not found).
 */
export function checkQuestReward(quest: Quest, user: User): User {
  if (!quest.questReward) return user;
  console.info('[reward.quest]', {
    source: 'quest.reward',
    questName: quest.name,
    rewardRef: quest.questReward,
    userId: user.system.id,
  });
  return awardGear(quest.questReward, 'quest.reward', user);
}

// ── COACH DROPS ────────────────────────────────────────────────────────────────

/**
 * Milestone levels that trigger a coach.drop gear gift.
 * The ribbon drop is the default coach reward for reaching these levels.
 */
// Temporarily disabled while we revisit coach level-drop pacing.
// const COACH_DROP_LEVELS = new Set<number>([10, 15, 20, 30, 40, 60, 70, 80, 90, 110]);

/**
 * Check whether any coach gear drops should fire after a level-up.
 * Iterates every level crossed between oldLevel and newLevel (inclusive).
 *
 * @param user      Current User (after XP has been applied and level updated).
 * @param oldLevel  Level before the XP award.
 * @param newLevel  Level after the XP award.
 * @returns Updated User after all coach drops applied.
 */
export function checkCoachDrops(user: User, oldLevel: number, newLevel: number): User {
  void oldLevel;
  void newLevel;
  return user;
}
