import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Resource, ResourceNote, ResourceType } from '../../types/resource';
import { ResourceLinksTab } from '../overlays/menu/rooms/ResourceRoom/shared/ResourceLinksTab';

interface NotesLogEditorProps {
  notes: ResourceNote[];
  onChange: (notes: ResourceNote[]) => void;
  resource?: Resource;
  linkTabLabel?: string;
  allowedLinkTypes?: ResourceType[];
  fixedLinkRelationship?: string;
}

function formatNoteTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

export function NotesLogEditor({
  notes,
  onChange,
  resource,
  linkTabLabel = 'Links',
  allowedLinkTypes,
  fixedLinkRelationship,
}: NotesLogEditorProps) {
  const [newText, setNewText] = useState('');
  const [activeTab, setActiveTab] = useState<'notes' | 'attachments' | 'links'>('links');

  function addNote() {
    const text = newText.trim();
    if (!text) return;
    const note: ResourceNote = {
      id: uuidv4(),
      text,
      createdAt: new Date().toISOString(),
    };
    onChange([...notes, note]);
    setNewText('');
  }

  function removeNote(id: string) {
    onChange(notes.filter((n) => n.id !== id));
  }

  const sorted = [...notes].reverse();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-4 border-b border-gray-100 pb-1 dark:border-gray-700">
        {(['links', 'notes', 'attachments'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`border-b-2 pb-0.5 text-xs font-medium transition-colors ${
              activeTab === tab
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            {tab === 'notes' ? 'Notes' : tab === 'attachments' ? 'Attachments' : linkTabLabel}
          </button>
        ))}
      </div>

      {activeTab === 'notes' && (
        <>
          {sorted.length === 0 && (
            <p className="text-xs italic text-gray-400">No notes yet.</p>
          )}
          {sorted.map((note) => (
            <div
              key={note.id}
              className="flex items-start gap-2 rounded-md bg-gray-50 px-2.5 py-2 dark:bg-gray-700/60"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {formatNoteTime(note.createdAt)}
                </span>
                <span className="whitespace-pre-line break-words text-sm text-gray-800 dark:text-gray-100">
                  {note.text}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeNote(note.id)}
                aria-label="Remove note"
                className="mt-0.5 shrink-0 text-xs font-bold leading-none text-gray-400 hover:text-red-400"
              >
                x
              </button>
            </div>
          ))}

          <div className="flex items-start gap-2">
            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addNote();
                }
              }}
              placeholder="Add a note..."
              maxLength={500}
              className="flex-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
            <button
              type="button"
              onClick={addNote}
              disabled={!newText.trim()}
              className="shrink-0 rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </>
      )}

      {activeTab === 'attachments' && (
        <div className="rounded-lg bg-gray-50 px-3 py-4 text-center dark:bg-gray-700/60">
          <p className="text-xs italic text-gray-400">Attachments coming soon.</p>
        </div>
      )}

      {activeTab === 'links' && (
        resource ? (
          <ResourceLinksTab
            resource={resource}
            linkLabel={linkTabLabel}
            allowedTargetTypes={allowedLinkTypes}
            fixedRelationship={fixedLinkRelationship}
          />
        ) : (
          <div className="rounded-lg bg-gray-50 px-3 py-4 text-center dark:bg-gray-700/60">
            <p className="text-xs italic text-gray-400">Save this resource first to add {linkTabLabel.toLowerCase()}.</p>
          </div>
        )
      )}
    </div>
  );
}
