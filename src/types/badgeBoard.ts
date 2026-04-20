// ─────────────────────────────────────────
// BADGE BOARD — DATA (nested in User)
// Holds earned badges awaiting claim and manages the user-curated pinned display.
// Coach checks earned[] on session open and prompts claim if not empty.
// ─────────────────────────────────────────

import type { Badge } from './itemTemplate';

/** STUB: MULTI-USER — reserved for badge-board sharing visibility once the MULTI-USER chapter ships. */
export type BadgeBoardPublicVisibilityStub = null;

// ── BADGE BOARD ROOT ──────────────────────────────────────────────────────────

export interface BadgeBoard {
  /** Badge refs awarded but not yet placed by user */
  earned: Badge[];
  /** Badge refs placed on board by user */
  pinned: Badge[];
  /** STUB: MULTI-USER — stores whether the badge board is publicly visible once the MULTI-USER chapter is enabled. */
  publicVisibility: BadgeBoardPublicVisibilityStub;
}
