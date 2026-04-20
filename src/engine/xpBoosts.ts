import type { User } from '../types/user';
import type { TaskTemplate } from '../types/taskTemplate';
import { getAppTime, getTodayRollResult } from '../utils/dateUtils';

export const EARLY_BIRD_MULTIPLIER = 1.5;
export const LATE_NIGHT_MULTIPLIER = 1.5;
export const STREAK_DAILY_STEP = 1;

export interface XPAwardContext {
  isWisdomTask?: boolean;
}

export interface RollBoostInfo {
  result: number;
  additiveBonus: number;
  display: string;
}

export interface XPBoostSnapshot {
  earlyBirdActive: boolean;
  lateNightActive: boolean;
  streak: number;
  streakMultiplier: number;
  roll: RollBoostInfo | null;
  timeMultiplier: number;
  finalMultiplier: number;
}

function getAppHour(): number {
  const [hour] = getAppTime().split(':').map(Number);
  return Number.isFinite(hour) ? hour : 0;
}

export function isEarlyBirdActive(): boolean {
  const hour = getAppHour();
  return hour >= 5 && hour <= 9;
}

export function isLateNightActive(): boolean {
  const hour = getAppHour();
  return hour >= 22 && hour <= 23;
}

export function getTodayRollBoost(): RollBoostInfo | null {
  const result = getTodayRollResult();
  if (result <= 0) return null;

  return {
    result,
    additiveBonus: Math.max(0, result - 1),
    display: `${result}x`,
  };
}

export function isWisdomTemplate(
  template: Pick<TaskTemplate, 'xpAward' | 'secondaryTag'> | null | undefined,
): boolean {
  if (!template) return false;
  return (template.xpAward.wisdom ?? 0) > 0 || template.secondaryTag === 'learning';
}

export function getXPBoostSnapshot(
  user: User | null | undefined,
  context?: XPAwardContext,
): XPBoostSnapshot {
  const earlyBirdActive = isEarlyBirdActive();
  const lateNightActive = isLateNightActive();
  const streak = user?.progression.stats.milestones.streakCurrent ?? 0;
  const streakMultiplier = streak > 0 ? streak * STREAK_DAILY_STEP : 0;
  const roll = getTodayRollBoost();
  const timeMultiplier =
    (earlyBirdActive ? EARLY_BIRD_MULTIPLIER : 0) +
    (lateNightActive ? LATE_NIGHT_MULTIPLIER : 0);
  void context;
  const finalMultiplier = 1 + timeMultiplier + streakMultiplier + (roll?.additiveBonus ?? 0);

  return {
    earlyBirdActive,
    lateNightActive,
    streak,
    streakMultiplier,
    roll,
    timeMultiplier,
    finalMultiplier,
  };
}

export function calculateAwardedXP(
  baseAmount: number,
  user: User | null | undefined,
  context?: XPAwardContext,
): number {
  if (baseAmount <= 0) return 0;

  const boosts = getXPBoostSnapshot(user, context);
  return Math.max(1, Math.round(baseAmount * boosts.finalMultiplier));
}
