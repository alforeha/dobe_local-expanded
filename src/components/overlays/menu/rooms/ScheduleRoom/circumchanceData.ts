import type { Aspiration } from '../../../../../types';
import type { BrainstormEntry, Storm } from '../../../../../types/brainstorm';

/**
 * Circumchance data helpers — Track C (Sprint 6). UI-side shaping over
 * existing primitives: storm type 'projection' (sportsbooks), EntryType
 * 'bet' (bets), stakeBrainWidth/unstakeBrainWidth (the staking economy).
 * Bet metadata rides in entry customProperties (the freeform string bag —
 * no engine reads it; the brainstorm store stays the single source).
 */

export type BetStatus = 'active' | 'won' | 'lost';

export interface BetRecord {
  entryId: string;
  /** Main idea ('prop') the bet entry lives under. */
  propId: string;
  stormId: string;
  content: string;
  stake: number;
  status: BetStatus;
  goalRef: string | null;
  goalLabel: string | null;
  placedAt: string | null;
  resolvedAt: string | null;
}

export interface GoalTrackOption {
  /** `${aspirationId}` or `${aspirationId}|${woopIdx}|${smarterIdx}` */
  ref: string;
  label: string;
  /** Cached quest progress 0–100 when the track is a Smarter, else null. */
  progressPercent: number | null;
}

export function isProjectionStorm(storm: Storm): boolean {
  return storm.type === 'projection';
}

function betFromEntry(entry: BrainstormEntry, propId: string, stormId: string): BetRecord | null {
  if (entry.type !== 'bet') return null;
  const props = entry.customProperties ?? {};
  const stake = Number(props.stake ?? '0');
  const status: BetStatus = props.status === 'won' || props.status === 'lost' ? props.status : 'active';
  return {
    entryId: entry.id,
    propId,
    stormId,
    content: entry.content,
    stake: Number.isFinite(stake) ? stake : 0,
    status,
    goalRef: props.goalRef ?? null,
    goalLabel: props.goalLabel ?? null,
    placedAt: props.placedAt ?? null,
    resolvedAt: props.resolvedAt ?? null,
  };
}

function walkEntries(
  entries: BrainstormEntry[],
  propId: string,
  stormId: string,
  out: BetRecord[],
): void {
  entries.forEach((entry) => {
    const bet = betFromEntry(entry, propId, stormId);
    if (bet) out.push(bet);
    walkEntries(entry.entries, propId, stormId, out);
  });
}

/** All bet entries in a projection storm, newest-first by placedAt. */
export function collectBets(storm: Storm): BetRecord[] {
  const bets: BetRecord[] = [];
  Object.values(storm.mainIdeas).forEach((mainIdea) => {
    walkEntries(mainIdea.entries, mainIdea.id, storm.id, bets);
  });
  Object.values(storm.ideas).forEach((idea) => {
    walkEntries(idea.entries, idea.id, storm.id, bets);
  });
  return bets.sort((a, b) => (b.placedAt ?? '').localeCompare(a.placedAt ?? ''));
}

export interface CircumchanceStats {
  totalStaked: number;
  activeBets: number;
  won: number;
  lost: number;
}

/** Aggregate stats across all projection storms (top dashboard section). */
export function computeCircumchanceStats(storms: Storm[]): CircumchanceStats {
  const stats: CircumchanceStats = { totalStaked: 0, activeBets: 0, won: 0, lost: 0 };
  storms.forEach((storm) => {
    stats.totalStaked += storm.brainWidthStaked;
    collectBets(storm).forEach((bet) => {
      if (bet.status === 'active') stats.activeBets += 1;
      else if (bet.status === 'won') stats.won += 1;
      else stats.lost += 1;
    });
  });
  return stats;
}

/**
 * Active goal tracks to bet on — active Aspirations and their active
 * Smarters (with cached progressPercent). The Circumchance hub surfaces
 * these against active projection storms.
 */
export function buildGoalTrackOptions(aspirations: Aspiration[]): GoalTrackOption[] {
  const options: GoalTrackOption[] = [];
  aspirations
    .filter((aspiration) => aspiration.completionState === 'active')
    .forEach((aspiration) => {
      options.push({
        ref: aspiration.id,
        label: aspiration.name,
        progressPercent: null,
      });
      aspiration.woops.forEach((woop, woopIdx) => {
        if (woop.completionState !== 'active') return;
        woop.smarters.forEach((smarter, smarterIdx) => {
          if (smarter.completionState !== 'active') return;
          options.push({
            ref: `${aspiration.id}|${woopIdx}|${smarterIdx}`,
            label: `${aspiration.name} · ${smarter.name}`,
            progressPercent: smarter.progressPercent,
          });
        });
      });
    });
  return options;
}

/** Resolve the current progress of a goalRef against live aspiration data. */
export function resolveGoalProgress(
  goalRef: string | null,
  aspirations: Record<string, Aspiration>,
): number | null {
  if (!goalRef) return null;
  const [aspirationId, woopIdx, smarterIdx] = goalRef.split('|');
  const aspiration = aspirations[aspirationId];
  if (!aspiration) return null;
  if (woopIdx === undefined || smarterIdx === undefined) return null;
  const smarter = aspiration.woops[Number(woopIdx)]?.smarters[Number(smarterIdx)];
  return smarter ? smarter.progressPercent : null;
}
