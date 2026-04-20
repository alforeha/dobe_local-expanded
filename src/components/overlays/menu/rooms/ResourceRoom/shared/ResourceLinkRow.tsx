import { useEffect, useRef, useState } from 'react';
import type { Resource, ResourceLink } from '../../../../../../types/resource';
import { IconDisplay } from '../../../../../shared/IconDisplay';

interface ResourceLinkRowProps {
  link: ResourceLink;
  targetResource?: Resource;
  relationshipOptions: string[];
  inherited?: boolean;
  onNavigate: (resource: Resource) => void;
  onUpdate: (linkId: string, relationship: string) => void;
  onRemove: (linkId: string) => void;
}

export function ResourceLinkRow({
  link,
  targetResource,
  relationshipOptions,
  inherited = false,
  onNavigate,
  onUpdate,
  onRemove,
}: ResourceLinkRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftRelationship, setDraftRelationship] = useState(link.relationship);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const confirmResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (confirmResetRef.current) clearTimeout(confirmResetRef.current);
  }, []);

  function handleRemove() {
    if (!confirmRemove) {
      setConfirmRemove(true);
      confirmResetRef.current = setTimeout(() => {
        setConfirmRemove(false);
        confirmResetRef.current = null;
      }, 3000);
      return;
    }

    if (confirmResetRef.current) {
      clearTimeout(confirmResetRef.current);
      confirmResetRef.current = null;
    }
    onRemove(link.id);
  }

  function handleSaveEdit() {
    if (!draftRelationship.trim()) return;
    onUpdate(link.id, draftRelationship);
    setEditing(false);
  }

  return (
    <div className={`rounded-lg border dark:border-gray-700 ${inherited ? 'border-dashed border-gray-200 bg-gray-50/80 dark:bg-gray-800/40' : 'border-gray-200 bg-white dark:bg-gray-800/70'}`}>
      {inherited ? (
        <div className="flex w-full items-center gap-2 px-3 py-2 text-left">
          <IconDisplay
            iconKey={targetResource?.icon ?? 'doc'}
            size={18}
            className="h-5 w-5 shrink-0 object-contain"
            alt=""
          />
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-gray-500 dark:text-gray-400">
            {targetResource?.name ?? 'Missing resource'}
          </div>
          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-400 dark:bg-gray-800 dark:text-gray-500">
            {link.relationship}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
        >
          <IconDisplay
            iconKey={targetResource?.icon ?? 'doc'}
            size={18}
            className="h-5 w-5 shrink-0 object-contain"
            alt=""
          />
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
            {targetResource?.name ?? 'Missing resource'}
          </div>
          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            {link.relationship}
          </span>
        </button>
      )}

      {expanded && !inherited ? (
        <div className="border-t border-gray-100 px-3 py-2 dark:border-gray-700">
          {editing ? (
            <div className="space-y-2">
              <select
                value={draftRelationship}
                onChange={(event) => setDraftRelationship(event.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              >
                {relationshipOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraftRelationship(link.relationship);
                    setEditing(false);
                  }}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="text-xs font-semibold text-blue-500 hover:text-blue-600"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {targetResource ? (
                <button
                  type="button"
                  onClick={() => onNavigate(targetResource)}
                  className="text-xs font-medium text-blue-500 hover:text-blue-600"
                >
                  Open
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setDraftRelationship(link.relationship);
                  setEditing(true);
                }}
                className="text-xs font-medium text-blue-500 hover:text-blue-600"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className={confirmRemove ? 'ml-auto text-xs font-semibold text-red-600' : 'ml-auto text-xs font-medium text-red-400 hover:text-red-500'}
              >
                {confirmRemove ? 'Tap again to remove' : 'Remove link'}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
