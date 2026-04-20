import { useMemo, useState } from 'react';
import { useUserStore } from '../../../../../stores/useUserStore';
import { autoCompleteSystemTask } from '../../../../../engine/resourceEngine';
import { PopupShell } from '../../../../shared/popups/PopupShell';

const DAY_MS = 86_400_000;
const CHANGE_WINDOW_DAYS = 365;
const NAME_CHANGE_COOLDOWN_MS = CHANGE_WINDOW_DAYS * DAY_MS;

function getNameChangeStatus(nameChangedAt?: string): {
  unlockAt: Date | null;
  remainingDays: number;
} {
  if (!nameChangedAt) return { unlockAt: null, remainingDays: 0 };

  const changedAtMs = new Date(nameChangedAt).getTime();
  if (Number.isNaN(changedAtMs)) return { unlockAt: null, remainingDays: 0 };

  const unlockAtMs = changedAtMs + NAME_CHANGE_COOLDOWN_MS;
  const remainingMs = unlockAtMs - Date.now();

  return {
    unlockAt: new Date(unlockAtMs),
    remainingDays: remainingMs > 0 ? Math.ceil(remainingMs / DAY_MS) : 0,
  };
}

interface DisplayNameChangeProps {
  compact?: boolean;
  open?: boolean;
  onClose?: () => void;
}

export function DisplayNameChange({
  compact = false,
  open = false,
  onClose,
}: DisplayNameChangeProps) {
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);

  const displayName = user?.system.displayName ?? '';
  const nameChangedAt = user?.system.nameChangedAt;
  const [draft, setDraft] = useState(displayName);
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { unlockAt, remainingDays } = useMemo(() => getNameChangeStatus(nameChangedAt), [nameChangedAt]);
  const canChange = remainingDays === 0;
  const trimmedDraft = draft.trim();
  const canSave = Boolean(user && canChange && trimmedDraft && trimmedDraft !== displayName);
  const unlockLabel = unlockAt
    ? unlockAt.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  function closeEditor() {
    setDraft(displayName);
    setEditing(false);
    setConfirmOpen(false);
    onClose?.();
  }

  function handlePrimaryClick() {
    if (editing) {
      if (!canSave) return;
      setConfirmOpen(true);
      return;
    }
    if (!canChange) return;
    setDraft(displayName);
    setEditing(true);
  }

  function handleConfirmSave() {
    if (!user || !canSave) {
      setConfirmOpen(false);
      return;
    }
    setUser({
      ...user,
      system: {
        ...user.system,
        displayName: trimmedDraft,
        nameChangedAt: new Date().toISOString(),
      },
    });
    autoCompleteSystemTask('task-sys-set-display-name');
    closeEditor();
  }

  const isEditing = compact ? open : editing;

  if (compact && !open) return null;

  const content = (
    <div className="rounded-2xl border border-gray-200 bg-white/90 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/80">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave) {
                  e.preventDefault();
                  setConfirmOpen(true);
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  closeEditor();
                }
              }}
              maxLength={30}
              placeholder="Enter your name"
              autoFocus
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          ) : (
            <p className="truncate text-base font-semibold text-gray-800 dark:text-gray-100">
              {displayName || 'Name'}
            </p>
          )}
        </div>

        {!compact ? (
          <button
            type="button"
            onClick={handlePrimaryClick}
            disabled={isEditing ? !canSave : !canChange}
            className="shrink-0 rounded-xl border border-emerald-400 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400 dark:border-emerald-500 dark:text-emerald-300 dark:hover:bg-emerald-500/10 dark:disabled:border-gray-600 dark:disabled:text-gray-500"
          >
            {isEditing ? 'Save' : canChange ? 'Change' : 'Locked'}
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-400 dark:text-gray-500">
        <span>
          {canChange
            ? 'Can be changed once per year'
            : `Name locked until ${unlockLabel} (${remainingDays} day${remainingDays === 1 ? '' : 's'} remaining)`}
        </span>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeEditor}
              className="font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => canSave && setConfirmOpen(true)}
              disabled={!canSave}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-600"
            >
              Save
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      {compact ? (
        content
      ) : (
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Your name
          </label>
          {content}
        </div>
      )}

      {confirmOpen ? (
        <PopupShell title="Confirm display name" onClose={() => setConfirmOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Set your display name to <span className="font-semibold text-gray-900 dark:text-gray-100">{trimmedDraft}</span>?
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              After saving, you will need to wait 365 days before changing it again.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
              >
                Confirm
              </button>
            </div>
          </div>
        </PopupShell>
      ) : null}
    </>
  );
}
