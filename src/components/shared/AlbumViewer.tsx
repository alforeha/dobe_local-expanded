// AlbumViewer — shared grid + full-screen viewer for AlbumEntry collections.
// Used by HomeMetaView (and future: VehicleMetaView, ContactMetaView) to display
// a resource's album of photos with optional grouping and edit/delete actions,
// and a full-screen lightbox with left/right navigation.

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AlbumEntry } from '../../types/resource';
import { IconDisplay } from './IconDisplay';

interface AlbumViewerProps {
  entries: AlbumEntry[];
  onEdit?: (entry: AlbumEntry) => void;
  onDelete?: (entryId: string) => void;
  groupBy?: (entry: AlbumEntry) => string;
  title?: string;
}

interface GroupedEntries {
  label: string;
  entries: AlbumEntry[];
}

function formatReadableDate(iso: string): string {
  if (!iso) return '';
  // AlbumEntry.date is YYYY-MM-DD by convention.
  const parsed = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatLocation(location: AlbumEntry['location']): string | null {
  if (!location) return null;
  if (location.placeName && location.placeName.trim()) return location.placeName.trim();
  return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
}

function getLatestNoteText(entry: AlbumEntry): string {
  const latestNote = entry.notes?.[entry.notes.length - 1];
  return latestNote?.text?.trim() ?? '';
}

const SOURCE_KIND_LABELS: Record<NonNullable<AlbumEntry['sourceKind']>, string> = {
  manual: 'Manual',
  event: 'Event',
  inspection: 'Inspection',
  'placed-item': 'Item',
  'placed-container': 'Container',
};

function PhotoUnavailablePlaceholder({ className, textClassName }: { className?: string; textClassName?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 ${className ?? ''}`}>
      <IconDisplay iconKey="camera" size={28} className="h-7 w-7 object-contain opacity-40" alt="" />
      <span className={textClassName ?? 'text-xs font-medium'}>Photo not available</span>
    </div>
  );
}

function AlbumPhoto({
  photoUri,
  alt,
  className,
  placeholderClassName,
  placeholderTextClassName,
}: {
  photoUri?: string;
  alt: string;
  className: string;
  placeholderClassName: string;
  placeholderTextClassName?: string;
}) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [photoUri]);

  if (!photoUri || hasError) {
    return (
      <PhotoUnavailablePlaceholder
        className={placeholderClassName}
        textClassName={placeholderTextClassName}
      />
    );
  }

  return (
    <img
      src={photoUri}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  );
}

interface FullScreenViewerProps {
  entries: AlbumEntry[];
  startIndex: number;
  onClose: () => void;
  onEdit?: (entry: AlbumEntry) => void;
  onDelete?: (entryId: string) => void;
}

function FullScreenViewer({ entries, startIndex, onClose, onEdit, onDelete }: FullScreenViewerProps) {
  const initialIndex = Math.min(Math.max(0, startIndex), Math.max(0, entries.length - 1));
  const [internalIndex, setInternalIndex] = useState(initialIndex);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Clamp at render time so deletions that shrink the entries list don't blow
  // up. Resetting `confirmingDelete` is unnecessary because the parent closes
  // (and remounts) the viewer after a successful delete.
  const index = Math.min(internalIndex, Math.max(0, entries.length - 1));

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') setInternalIndex((current) => Math.min(entries.length - 1, current + 1));
      else if (event.key === 'ArrowLeft') setInternalIndex((current) => Math.max(0, current - 1));
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [entries.length, onClose]);

  if (entries.length === 0) return null;
  if (typeof document === 'undefined') return null;

  const entry = entries[index];
  const dateLabel = formatReadableDate(entry.date);
  const locationLabel = formatLocation(entry.location);
  const sourceKind = entry.sourceKind && entry.sourceKind !== 'manual' ? entry.sourceKind : null;

  function handleDeleteClick() {
    if (!onDelete) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    onDelete(entry.id);
    setConfirmingDelete(false);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 text-white"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex shrink-0 items-center justify-between gap-2 px-4 py-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-xs text-gray-300">
          <span>{Math.min(index, entries.length - 1) + 1} / {entries.length}</span>
          {sourceKind ? (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
              {SOURCE_KIND_LABELS[sourceKind]}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {onEdit ? (
            <button
              type="button"
              onClick={() => onEdit(entry)}
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
            >
              Edit
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={handleDeleteClick}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                confirmingDelete
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              {confirmingDelete ? 'Tap again to delete' : 'Delete'}
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Photo area with side nav arrows */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-4"
        onClick={(event) => event.stopPropagation()}
      >
        {entries.length > 1 ? (
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => setInternalIndex((current) => Math.max(0, current - 1))}
            disabled={index <= 0}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-base font-semibold hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10"
          >
            ‹
          </button>
        ) : null}

        <AlbumPhoto
          photoUri={entry.photoUri}
          alt={dateLabel}
          className="max-h-full max-w-full object-contain"
          placeholderClassName="h-full min-h-[16rem] w-full rounded-2xl bg-white/5 px-10 py-12 text-gray-300"
          placeholderTextClassName="text-sm"
        />

        {entries.length > 1 ? (
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => setInternalIndex((current) => Math.min(entries.length - 1, current + 1))}
            disabled={index >= entries.length - 1}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-base font-semibold hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10"
          >
            ›
          </button>
        ) : null}
      </div>

      {/* Bottom info area */}
      <div
        className="shrink-0 space-y-1 px-4 py-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-sm font-semibold">{dateLabel || 'No date'}</div>
        {entry.notes?.length ? (
          <div className="space-y-1">
            {entry.notes.map((note) => (
              <div key={note.id} className="text-xs text-gray-200 whitespace-pre-wrap">{note.text}</div>
            ))}
          </div>
        ) : null}
        {locationLabel ? (
          <div className="text-[11px] text-gray-300">{locationLabel}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function AlbumViewer({ entries, onEdit, onDelete, groupBy, title }: AlbumViewerProps) {
  const [viewerStart, setViewerStart] = useState<number | null>(null);

  const grouped = useMemo<GroupedEntries[] | null>(() => {
    if (!groupBy) return null;
    const buckets = new Map<string, AlbumEntry[]>();
    const order: string[] = [];
    for (const entry of entries) {
      const label = groupBy(entry);
      if (!buckets.has(label)) {
        buckets.set(label, []);
        order.push(label);
      }
      buckets.get(label)!.push(entry);
    }
    return order.map((label) => ({ label, entries: buckets.get(label) ?? [] }));
  }, [entries, groupBy]);

  // Flat ordered list matching display order — used to find a startIndex for the
  // viewer and to drive viewer left/right navigation. When grouping is active,
  // the viewer navigates within the tapped entry's group.
  const flatOrder = useMemo<AlbumEntry[]>(() => {
    if (!grouped) return entries;
    return grouped.flatMap((group) => group.entries);
  }, [entries, grouped]);

  const [viewerEntries, setViewerEntries] = useState<AlbumEntry[]>(flatOrder);

  function openViewer(entryId: string, scope: AlbumEntry[]) {
    const index = scope.findIndex((entry) => entry.id === entryId);
    if (index < 0) return;
    setViewerEntries(scope);
    setViewerStart(index);
  }

  function closeViewer() {
    setViewerStart(null);
  }

  function renderCard(entry: AlbumEntry, scope: AlbumEntry[]) {
    const dateLabel = formatReadableDate(entry.date);
    const notePreview = getLatestNoteText(entry);
    return (
      <button
        key={entry.id}
        type="button"
        onClick={() => openViewer(entry.id, scope)}
        className="group flex w-full flex-col overflow-hidden rounded-xl bg-white text-left ring-1 ring-black/5 transition-shadow hover:shadow-md dark:bg-gray-900/70"
      >
        <div className="aspect-square w-full overflow-hidden">
          <AlbumPhoto
            photoUri={entry.photoUri}
            alt={dateLabel}
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            placeholderClassName="h-full w-full"
          />
        </div>
        <div className="space-y-0.5 px-2 py-1.5">
          <div className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">
            {dateLabel || 'No date'}
          </div>
          {notePreview ? (
            <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">{notePreview}</div>
          ) : null}
        </div>
      </button>
    );
  }

  const totalCount = entries.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          {title ? (
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {title}
            </div>
          ) : null}
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            {totalCount} {totalCount === 1 ? 'entry' : 'entries'}
          </div>
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="rounded-xl bg-gray-50 px-3 py-6 text-center text-xs italic text-gray-400 dark:bg-gray-800/60">
          No album entries yet.
        </div>
      ) : grouped ? (
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.label} className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {group.label}
                <span className="ml-2 font-normal text-gray-400">{group.entries.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {group.entries.map((entry) => renderCard(entry, group.entries))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {entries.map((entry) => renderCard(entry, entries))}
        </div>
      )}

      {viewerStart !== null ? (
        <FullScreenViewer
          entries={viewerEntries}
          startIndex={viewerStart}
          onClose={closeViewer}
          onEdit={onEdit
            ? (entry) => {
                closeViewer();
                onEdit(entry);
              }
            : undefined}
          onDelete={onDelete
            ? (entryId) => {
                onDelete(entryId);
                closeViewer();
              }
            : undefined}
        />
      ) : null}
    </div>
  );
}
