// ─────────────────────────────────────────
// COACH — RIBBET
// Coach speech engine — pure function, no LLM, no Zustand store (D44).
//
// Two call sites:
//   Passive — step9 rollover, returns a single ambient string based on user state.
//   Reactive — in-memory session queue, push/flush per-event contextual comments.
//
// Both routes resolve {{placeholder}} tokens before returning.
// Tone is read from Settings.coachPreferences.tone at call time (D26).
// ─────────────────────────────────────────

import type { User } from '../types/user';
import type { CoachTone } from '../types/coach';
import { useSystemStore } from '../stores/useSystemStore';
import { useProgressionStore } from '../stores/useProgressionStore';
import { getOffsetNow } from '../utils/dateUtils';
import { commentLibrary } from './index';
import { STARTER_ACT_IDS } from './StarterQuestLibrary';

// ── TONE RESOLVER ─────────────────────────────────────────────────────────────

const VALID_TONES = new Set<string>(['muted', 'friendly', 'militant']);

function activeTone(): CoachTone {
  const stored = useSystemStore.getState().settings?.coachPreferences.tone ?? 'friendly';
  return VALID_TONES.has(stored) ? (stored as CoachTone) : 'friendly';
}

// ── TOKEN RESOLVER ────────────────────────────────────────────────────────────

export type DynamicValues = Record<string, string | number>;

function resolveTokens(template: string, values: DynamicValues): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = values[key];
    return val !== undefined ? String(val) : '';
  });
}

// ── COMMENT PICKER ────────────────────────────────────────────────────────────

function pickComment(contextKey: string, tone: CoachTone, values: DynamicValues = {}): string {
  const entry = commentLibrary.comments.find((c) => c.contextKey === contextKey);
  if (!entry) return '';
  const pool = entry.variants[tone];
  if (!pool || pool.length === 0) return '';
  const raw = pool[Math.floor(Math.random() * pool.length)];
  return resolveTokens(raw, values);
}

// ── PASSIVE CALL SITE ─────────────────────────────────────────────────────────

/**
 * Select and return an ambient coach comment for the rollover step9 feed push.
 *
 * Priority chain:
 *   1. Morning boost window (05:00–09:59)
 *   2. Evening boost window (18:00–23:59)
 *   3. Active streak
 *   4. Active quest in progress
 *   5. Recent activity (tasks completed this session)
 *   6. General fallback
 *
 * @param user  Current User — reads milestones and acts from state.
 */
export function ribbet(user: User): string {
  const tone = activeTone();
  const hour = getOffsetNow().getHours();
  const milestones = user.progression.stats.milestones;
  const acts = useProgressionStore.getState().acts;

  if (hour >= 5 && hour < 10) {
    return pickComment('ambient.morning', tone);
  }

  if (hour >= 18) {
    return pickComment('ambient.evening', tone);
  }

  // Onboarding Act — return quest-specific comment when a Q1-Q4 quest is active
  const onboardingAct = acts[STARTER_ACT_IDS.onboarding];
  if (onboardingAct && onboardingAct.completionState !== 'complete') {
    const chain = onboardingAct.chains[0];
    if (chain) {
      const activeQuestIndex = chain.quests.findIndex(
        (q) => q.completionState === 'active',
      );
      if (activeQuestIndex !== -1) {
        const key = `onboarding.q${activeQuestIndex + 1}`;
        const comment = pickComment(key, tone);
        if (comment) return comment;
      }
    }
  }

  if (milestones.streakCurrent > 0) {
    return pickComment('ambient.general.streak', tone, { streakCount: milestones.streakCurrent });
  }

  const hasActiveQuest = Object.values(acts).some((act) =>
    act.chains.some((chain) =>
      chain.quests.some((q) => q.completionState === 'active'),
    ),
  );
  if (hasActiveQuest) {
    return pickComment('ambient.general.activeQuest', tone);
  }

  if (milestones.tasksCompleted > 0) {
    return pickComment('ambient.general.recentActivity', tone);
  }

  return pickComment('ambient.general.fallback', tone);
}

// ── REACTIVE SESSION QUEUE ────────────────────────────────────────────────────

export interface RibbetQueueEntry {
  contextKey: string;
  values: DynamicValues;
  timestamp: string;
}

/**
 * In-memory session queue — never written to localStorage.
 * Accumulates reactive comment context during a session.
 * Flushed to feed on login return via flushRibbet().
 */
const sessionQueue: RibbetQueueEntry[] = [];

/**
 * Push a reactive comment context to the session queue.
 * Called from engine modules after significant state changes.
 */
export function pushRibbet(contextKey: string, values: DynamicValues = {}): void {
  sessionQueue.push({ contextKey, values, timestamp: new Date().toISOString() });
}

/**
 * Flush the session queue to a resolved string array and clear it.
 * Use for login-return feed construction.
 */
export function flushRibbet(): string[] {
  const tone = activeTone();
  const results = sessionQueue
    .map((entry) => pickComment(entry.contextKey, tone, entry.values))
    .filter(Boolean);
  sessionQueue.length = 0;
  return results;
}

/**
 * Read the session queue without clearing it.
 * Use for inline display during an active session.
 */
export function peekRibbet(): string[] {
  const tone = activeTone();
  return sessionQueue
    .map((entry) => pickComment(entry.contextKey, tone, entry.values))
    .filter(Boolean);
}

/** Clear the session queue without reading. */
export function clearRibbet(): void {
  sessionQueue.length = 0;
}
