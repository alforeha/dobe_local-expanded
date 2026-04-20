// ─────────────────────────────────────────
// FEED — CORE (nested in User)
// User mailbox and activity stream.
// Receives pushed entries from Coach, task completions, badge awards, and level-ups.
// Belongs to User — Coach reads and writes but does not own it.
// ─────────────────────────────────────────

export interface FeedEntry {
  commentBlock: string;
  sourceType: string;
  timestamp: string; // ISO date
  /** Optional ref to the triggering object */
  triggerRef?: string;
  /** Whether the user has read this entry — false / undefined = unread */
  read?: boolean;
  /** Local-only single reaction key selected by the user (e.g. 'agree', 'motivated', 'ribbit', 'save') */
  reaction?: string;
}

/** STUB: MULTI-USER — reserved for activity entries pulled from other users once the MULTI-USER chapter ships. */
export type SharedActivityEntriesStub = null;

// ── FEED ROOT ─────────────────────────────────────────────────────────────────

export interface Feed {
  entries: FeedEntry[];
  /** UI unread indicator — reset on markRead() */
  unreadCount: number;
  /** STUB: MULTI-USER — stores incoming shared activity stream entries once the MULTI-USER chapter is enabled. */
  sharedActivityEntries: SharedActivityEntriesStub;
}
