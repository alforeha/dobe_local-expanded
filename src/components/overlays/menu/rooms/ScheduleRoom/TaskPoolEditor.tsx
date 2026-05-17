import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Task } from '../../../../../types/task';
import type { TaskSet } from '../../../../../types/plannedEvent';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { resolveTaskDisplayName } from '../../../../../utils/resolveTaskDisplayName';
import { clampTaskPoolCursor, ensureTaskPools } from '../../../../../utils/taskPools';
import { getLibraryTemplatePool } from '../../../../../utils/resolveTaskTemplate';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { TaskPoolAddPanel } from './TaskPoolAddPanel';

interface TaskPoolEditorProps {
  pools: TaskSet[];
  activeCursor: number;
  onChange: (pools: TaskSet[], cursor: number) => void;
  readOnly?: boolean;
  singlePool?: boolean;
}

function reorderList<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return list;
  next.splice(to, 0, moved);
  return next;
}

function buildDisplayTask(templateRef: string): Task {
  return {
    id: templateRef,
    templateRef,
    completionState: 'pending',
    completedAt: null,
    resultFields: {},
    attachmentRef: null,
    resourceRef: null,
    location: null,
    sharedWith: null,
    questRef: null,
    actRef: null,
    secondaryTag: null,
  };
}

export function TaskPoolEditor({ pools, activeCursor, onChange, readOnly = false, singlePool = false }: TaskPoolEditorProps) {
  const taskTemplates = useScheduleStore((state) => state.taskTemplates);
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [confirmSetActive, setConfirmSetActive] = useState(false);
  const [confirmDeletePool, setConfirmDeletePool] = useState(false);

  const safePools = ensureTaskPools(pools);
  const safeCursor = clampTaskPoolCursor(safePools, activeCursor);
  const activePool = safePools[safeCursor] ?? safePools[0];
  const libraryTemplates = useMemo(() => getLibraryTemplatePool(), []);
  const canEdit = !readOnly;
  const isActivePool = safeCursor === 0;
  const turnsAway = safeCursor;
  const setActiveLabel = isActivePool
    ? 'Active'
    : turnsAway === 1
      ? 'Next Up'
      : `${turnsAway} away`;

  function updateEntries(nextEntries: TaskSet['entries']) {
    const nextPools = safePools.map((pool, index) => (
      index === safeCursor ? { ...pool, entries: nextEntries } : pool
    ));
    onChange(nextPools, safeCursor);
  }

  function moveUp(entryId: string) {
    const index = activePool.entries.findIndex((entry) => entry.id === entryId);
    if (index <= 0) return;
    updateEntries(reorderList(activePool.entries, index, index - 1));
  }

  function moveDown(entryId: string) {
    const index = activePool.entries.findIndex((entry) => entry.id === entryId);
    if (index < 0 || index >= activePool.entries.length - 1) return;
    updateEntries(reorderList(activePool.entries, index, index + 1));
  }

  function removeEntry(entryId: string) {
    updateEntries(activePool.entries.filter((activeEntry) => activeEntry.id !== entryId));
  }

  function handleSetActive() {
    const reordered = [
      ...safePools.slice(safeCursor),
      ...safePools.slice(0, safeCursor),
    ];
    onChange(reordered, 0);
    setConfirmSetActive(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-700 dark:bg-gray-900/20">
      <div className="mb-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {!singlePool ? (
              <select
                value={safeCursor}
                disabled={readOnly || isEditMode}
                onChange={(event) => {
                  if (event.target.value === '__add__') {
                    const newPool: TaskSet = { id: uuidv4(), entries: [] };
                    const updated = [...safePools, newPool];
                    onChange(updated, updated.length - 1);
                  } else {
                    onChange(safePools, Number(event.target.value));
                  }
                }}
                className="min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                {safePools.map((pool, index) => (
                  <option key={pool.id} value={index}>
                    {pool.name?.trim() || `Pool ${index + 1}`}
                  </option>
                ))}
                <option value="__add__">+ Add Pool</option>
              </select>
            ) : null}
          </div>

          {canEdit ? (
            <div className="flex items-center gap-2">
              {!isEditMode ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsAddPanelOpen(true)}
                    className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500"
                  >
                    Add Task
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditMode(true)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Edit
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditMode(false);
                    setConfirmRemoveId(null);
                    setConfirmSetActive(false);
                    setConfirmDeletePool(false);
                  }}
                  className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500"
                >
                  Done
                </button>
              )}
            </div>
          ) : null}
        </div>

        {canEdit && isEditMode ? (
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={activePool.name ?? ''}
              placeholder={`Pool ${safeCursor + 1}`}
              onChange={(event) => {
                const updated = safePools.map((pool, index) => (
                  index === safeCursor ? { ...pool, name: event.target.value } : pool
                ));
                onChange(updated, safeCursor);
              }}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            />
            {isActivePool ? (
              <button
                type="button"
                disabled
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-500 transition-colors disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400"
              >
                {setActiveLabel}
              </button>
            ) : confirmSetActive ? (
              <button
                type="button"
                onClick={handleSetActive}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30"
              >
                Confirm Active
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmSetActive(true)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {setActiveLabel}
              </button>
            )}
            {safePools.length > 1 ? (
              confirmDeletePool ? (
                <button
                  type="button"
                  onClick={() => {
                    const updated = safePools.filter((_, index) => index !== safeCursor);
                    const newCursor = Math.min(safeCursor, updated.length - 1);
                    onChange(updated, newCursor);
                    setConfirmDeletePool(false);
                  }}
                  className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30"
                >
                  Confirm Delete
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeletePool(true)}
                  className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  Delete Pool
                </button>
              )
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        {activePool.entries.length === 0 ? (
          <div className="flex h-full min-h-24 items-center justify-center px-4 text-sm text-gray-400">
            {readOnly ? 'No tasks in this pool.' : 'No tasks in this pool. Add tasks using the button above.'}
          </div>
        ) : (
          <ol className="divide-y divide-gray-100 dark:divide-gray-700">
            {activePool.entries.map((entry, index) => {
              const rowControls = canEdit && isEditMode ? (
                <>
                  <button
                    type="button"
                    onClick={() => moveUp(entry.id)}
                    disabled={index === 0}
                    className="rounded-lg border border-gray-300 px-2 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(entry.id)}
                    disabled={index === activePool.entries.length - 1}
                    className="rounded-lg border border-gray-300 px-2 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    ↓
                  </button>
                  {confirmRemoveId === entry.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          removeEntry(entry.id);
                          setConfirmRemoveId(null);
                        }}
                        className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveId(null)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRemoveId(entry.id)}
                      className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      Remove
                    </button>
                  )}
                </>
              ) : null;

              if (entry.kind === 'template') {
                const resolvedName = resolveTaskDisplayName(buildDisplayTask(entry.templateRef), taskTemplates, libraryTemplates);

                return (
                  <li key={entry.id} className="flex items-center gap-3 px-3 py-3">
                    <IconDisplay iconKey={entry.icon ?? 'task'} size={16} className="h-4 w-4 shrink-0 object-contain" alt="" />
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-100">{resolvedName}</span>
                    {rowControls}
                  </li>
                );
              }

              if (entry.kind === 'inline') {
                return (
                  <li key={entry.id} className="flex items-center gap-3 px-3 py-3">
                    <IconDisplay iconKey={entry.icon ?? 'task'} size={16} className="h-4 w-4 shrink-0 object-contain" alt="" />
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-100">{entry.name}</span>
                    {rowControls}
                  </li>
                );
              }

              return (
                <li key={entry.id} className="flex items-center gap-3 px-3 py-3">
                  <IconDisplay iconKey={entry.icon ?? 'task'} size={16} className="h-4 w-4 shrink-0 object-contain" alt="" />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-100">{entry.taskName}</span>
                  {rowControls}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {!readOnly && !isEditMode && isAddPanelOpen ? (
        <TaskPoolAddPanel
          onAdd={(entry) => updateEntries([...activePool.entries, entry])}
          onClose={() => setIsAddPanelOpen(false)}
        />
      ) : null}
    </div>
  );
}
