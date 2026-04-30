import type { AlbumEntry } from '../types/resource';

export function createAlbumEntry(options: {
  photoUri?: string;
  location?: AlbumEntry['location'];
  note?: string;
  sourceRef?: string;
  sourceKind?: AlbumEntry['sourceKind'];
  date?: string;
}): AlbumEntry {
  return {
    id: crypto.randomUUID(),
    date: options.date ?? new Date().toISOString().split('T')[0],
    note: options.note,
    photoUri: options.photoUri,
    location: options.location,
    sourceRef: options.sourceRef,
    sourceKind: options.sourceKind ?? 'manual',
  };
}
