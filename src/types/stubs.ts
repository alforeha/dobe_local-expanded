// ─────────────────────────────────────────
// STUBS — MULTI-USER and APP-STORE objects
// Scoped to MULTI-USER and APP-STORE chapters.
// Shell types only in LOCAL — all instances are treated as opaque placeholders.
//
// Objects: Leaderboard, Challenge, EventCenter, ExperienceBoard
// ─────────────────────────────────────────

// ── LEADERBOARD (APP-STORE) ───────────────────────────────────────────────────
// Global + friends leaderboard. Level gate on access.
// Anonymous figures for non-opted global board users.

export interface LeaderboardEntry {
  userRef: string;
  displayName: string;
  /** null if user has not opted in to global board */
  avatarRef: string | null;
  score: number;
  rank: number;
}

export interface Leaderboard {
  id: string;
  type: 'friends' | 'global';
  /** Minimum level required to access */
  levelGate: number;
  entries: LeaderboardEntry[];
  lastUpdated: string; // ISO date
  /** [APP-STORE] weekly rotation preset by developer (D45) */
  weeklyRotationRef: string | null;
}

// ── CHALLENGE (APP-STORE) ─────────────────────────────────────────────────────
// Weekly challenge object. Rotation preset by developer.
// Level gate on leaderboard. Anonymous figures for non-opted global board users.

export interface ChallengeParticipant {
  userRef: string;
  completionState: 'pending' | 'complete' | 'failed';
  progressValue: number;
}

export interface Challenge {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Weekly rotation ref — preset by developer (D45) */
  rotationRef: string;
  startDate: string; // ISO date
  endDate: string;   // ISO date
  taskTemplateRef: string;
  /** Minimum level required to participate */
  levelGate: number;
  participants: ChallengeParticipant[];
  completionState: 'active' | 'complete' | 'expired';
  reward: string | null;
}

// ── EVENT CENTER (APP-STORE / MULTI-USER) ─────────────────────────────────────
// Experience post feed and discovery UI.
// Surfaces Experience posts from contacts and world view.

export interface EventCenterFilter {
  statGroup: string | null;
  tag: string | null;
  dateRange: { from: string; to: string } | null;
}

export interface EventCenter {
  id: string;
  /** Experience refs visible in this context */
  visibleExperienceRefs: string[];
  filter: EventCenterFilter;
  /** [APP-STORE] global world view enabled */
  worldViewEnabled: boolean;
}

// ── EXPERIENCE BOARD (APP-STORE / MULTI-USER) ────────────────────────────────
// Curated display of Experience posts for a user.

export interface ExperienceBoard {
  id: string;
  /** User ref this board belongs to */
  ownerRef: string;
  /** Experience refs displayed on board — sorted by relevanceScore */
  pinnedExperienceRefs: string[];
  /** [MULTI-USER] board visible to contacts */
  publicVisibility: boolean;
}
