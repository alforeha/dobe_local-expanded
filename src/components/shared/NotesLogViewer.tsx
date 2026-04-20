// ─────────────────────────────────────────
// NotesLogViewer — D95
// Read-only view of a ResourceNote[] log.
// Used inside MetaView components.
// ─────────────────────────────────────────

import type { ResourceNote } from '../../types/resource';

interface NotesLogViewerProps {
  notes: ResourceNote[] | undefined;
  labelWidth?: string; // e.g. 'w-16' or 'w-20'
}

function formatNoteTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

export function NotesLogViewer({ notes, labelWidth = 'w-16' }: NotesLogViewerProps) {
  if (!notes || notes.length === 0) return null;
  const sorted = [...notes].reverse();
  return (
    <div className="flex gap-2">
      <span className={`text-gray-400 ${labelWidth} shrink-0`}>Notes</span>
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        {sorted.map((note) => (
          <div key={note.id} className="flex flex-col gap-0.5">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatNoteTime(note.createdAt)}
            </span>
            <span className="whitespace-pre-line break-words">{note.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
