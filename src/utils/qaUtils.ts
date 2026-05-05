import type { QAAlbumEntry, QuickActionsEvent } from '../types';

export function createQuickActionsEvent(
  date: string,
  overrides: Partial<QuickActionsEvent> = {},
): QuickActionsEvent {
  return {
    id: overrides.id ?? `qa-${date}`,
    eventType: 'quickActions',
    date,
    completions: overrides.completions ?? [],
    xpAwarded: overrides.xpAwarded ?? 0,
    weatherSnapshot: overrides.weatherSnapshot ?? null,
    locationSnapshots: overrides.locationSnapshots ?? null,
    album: overrides.album ?? [],
    sharedCompletions: overrides.sharedCompletions ?? null,
  };
}

export function appendQAAlbumEntry(
  event: QuickActionsEvent,
  albumEntry: QAAlbumEntry,
): QuickActionsEvent {
  return {
    ...event,
    album: [...(event.album ?? []), albumEntry],
  };
}