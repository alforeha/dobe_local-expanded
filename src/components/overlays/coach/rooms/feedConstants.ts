// ─────────────────────────────────────────
// Feed source-type icon map
// ─────────────────────────────────────────

const FEED_SOURCE_ICONS: Record<string, string> = {
  'badge.awarded':      '🏅',
  'gear.awarded':       '⚔️',
  'quest.progress':     '📈',
  'quest.completed':    '✅',
  'level.up':           '⬆️',
  'streak.milestone':   '🔥',
  'marker.fire':        '🎯',
  'event.completed':    '📅',
};

const FEED_SOURCE_ICON_DEFAULT = '💬';

export function getFeedSourceIcon(sourceType: string): string {
  return FEED_SOURCE_ICONS[sourceType] ?? FEED_SOURCE_ICON_DEFAULT;
}
