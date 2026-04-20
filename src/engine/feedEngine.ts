// ─────────────────────────────────────────
// FEED ENGINE — User activity stream management
//
// Feed belongs to User — Coach reads and writes but does not own it.
// Entries are stored newest-first (prepend pattern) so getFeedEntries()
// returns reverse chronological order without sort.
//
// appendFeedEntry() is the single write path — all engine hooks route here.
// clearFeedBefore() is called during rollover or on manual clear.
// ─────────────────────────────────────────

import type { Feed, FeedEntry } from '../types/feed';
import type { User } from '../types/user';
import { useUserStore } from '../stores/useUserStore';

// ── DEFAULT LIMIT ─────────────────────────────────────────────────────────────

const DEFAULT_FEED_LIMIT = 50;

// ── APPEND FEED ENTRY ─────────────────────────────────────────────────────────

/**
 * Prepend a FeedEntry to User.feed.entries and increment unreadCount.
 * Persists via useUserStore + storageLayer.
 *
 * The newest-first prepend pattern means getFeedEntries() needs no sort.
 *
 * @param entry  FeedEntry to append (caller sets sourceType, commentBlock, timestamp)
 * @param user   Current User — used as base; latest store state applied on write
 */
export function appendFeedEntry(entry: FeedEntry, user: User): void {
  const userStore = useUserStore.getState();
  // Re-fetch from store in case concurrent writes have occurred
  const latest = userStore.user ?? user;

  const updatedFeed: Feed = {
    ...latest.feed,
    entries: [entry, ...latest.feed.entries],
    unreadCount: latest.feed.unreadCount + 1,
  };

  const updatedUser: User = { ...latest, feed: updatedFeed };
  userStore.setUser(updatedUser);
}

// ── GET FEED ENTRIES ──────────────────────────────────────────────────────────

/**
 * Return feed entries in reverse chronological order (newest first).
 * Entries are already stored newest-first, so this is a simple slice.
 *
 * @param user   Current User
 * @param limit  Maximum entries to return. Defaults to 50.
 * @returns      FeedEntry[] — newest first, up to limit
 */
export function getFeedEntries(user: User, limit = DEFAULT_FEED_LIMIT): FeedEntry[] {
  return user.feed.entries.slice(0, limit);
}

// ── CLEAR FEED BEFORE ─────────────────────────────────────────────────────────

/**
 * Prune Feed entries older than the given ISO date.
 * Called during rollover pruning or manual user clear.
 *
 * Persists via useUserStore + storageLayer.
 *
 * @param date  ISO date string (YYYY-MM-DD or ISO timestamp). Entries with
 *              timestamp < date are removed.
 * @param user  Current User
 */
export function clearFeedBefore(date: string, user: User): void {
  const userStore = useUserStore.getState();
  const latest = userStore.user ?? user;

  const cutoff = date.length === 10 ? `${date}T00:00:00.000Z` : date;

  const filtered = latest.feed.entries.filter((e) => e.timestamp >= cutoff);

  const updatedFeed: Feed = {
    ...latest.feed,
    entries: filtered,
    // Reset unreadCount to reflect what remains — if filtered set is smaller, cap it
    unreadCount: Math.min(latest.feed.unreadCount, filtered.length),
  };

  const updatedUser: User = { ...latest, feed: updatedFeed };
  userStore.setUser(updatedUser);
}

// ── SOURCE TYPE CONSTANTS ─────────────────────────────────────────────────────
// Centralised sourceType labels used by engine hooks.

export const FEED_SOURCE = {
  ROLLOVER: 'rollover',
  EVENT_COMPLETE: 'event.complete',
  LEVEL_UP: 'level.up',
  BADGE_AWARDED: 'badge.awarded',
  GEAR_AWARDED: 'gear.awarded',
  MARKER_FIRE: 'marker.fire',
  GTD_COMPLETE: 'gtd.complete',
  FAVOURITE_COMPLETE: 'favourite.complete',
} as const;

export type FeedSource = (typeof FEED_SOURCE)[keyof typeof FEED_SOURCE];
