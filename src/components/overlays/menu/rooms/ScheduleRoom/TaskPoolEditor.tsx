import { useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import type { Task } from '../../../../../types/task';
import type { TaskSet } from '../../../../../types/plannedEvent';
import { useResourceStore } from '../../../../../stores/useResourceStore';
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

export function TaskPoolEditor({ pools, activeCursor, onChange }: TaskPoolEditorProps) {
  const taskTemplates = useScheduleStore((state) => state.taskTemplates);
  const resources = useResourceStore((state) => state.resources);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);

  const safePools = ensureTaskPools(pools);
  const safeCursor = clampTaskPoolCursor(safePools, activeCursor);
  const activePool = safePools[safeCursor] ?? safePools[0];
  const libraryTemplates = useMemo(() => getLibraryTemplatePool(), []);
  const templateLookup = useMemo(() => {
    const lookup = new Map<string, (typeof libraryTemplates)[number]>();
    for (const template of libraryTemplates) {
      if (!template.id) continue;
      lookup.set(template.id, template);
    }
    return lookup;
  }, [libraryTemplates]);

  function updateEntries(nextEntries: TaskSet['entries']) {
    const nextPools = safePools.map((pool, index) => (
      index === safeCursor ? { ...pool, entries: nextEntries } : pool
    ));
    onChange(nextPools, safeCursor);
  }

  function handleAddPool() {
    const nextPools = [...safePools, { id: crypto.randomUUID(), entries: [] }];
    onChange(nextPools, nextPools.length - 1);
  }

  function handleRemovePool(poolId: string) {
    if (safePools.length <= 1) return;
    const removedIndex = safePools.findIndex((pool) => pool.id === poolId);
    const nextPools = safePools.filter((pool) => pool.id !== poolId);
    const nextCursor = removedIndex < safeCursor
      ? safeCursor - 1
      : Math.min(safeCursor, nextPools.length - 1);
    onChange(nextPools, nextCursor);
  }

  function moveEntry(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    updateEntries(reorderList(activePool.entries, activePool.entries.findIndex((entry) => entry.id === draggedId), activePool.entries.findIndex((entry) => entry.id === targetId)));
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-700 dark:bg-gray-900/20">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {safePools.map((pool, index) => (
          <div key={pool.id} className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChange(safePools, index)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                index === safeCursor
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              Pool {index + 1}
            </button>
            {safePools.length >= 2 ? (
              <button
                type="button"
                onClick={() => handleRemovePool(pool.id)}
                className="rounded-full px-2 py-1 text-sm text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                aria-label={`Remove pool ${index + 1}`}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}

        <button
          type="button"
          onClick={handleAddPool}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-gray-300 bg-white text-lg text-gray-500 transition-colors hover:border-purple-400 hover:text-purple-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-purple-500 dark:hover:text-purple-300"
          aria-label="Add pool"
        >
          +
        </button>
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">Active Pool</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">Pool {safeCursor + 1}</p>
        </div>
        <button
          type="button"
          onClick={() => setIsAddPanelOpen(true)}
          className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500"
        >
          Add Task
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        {activePool.entries.length === 0 ? (
          <div className="flex h-full min-h-24 items-center justify-center px-4 text-sm text-gray-400">
            No tasks in this pool. Add tasks using the button above.
          </div>
        ) : (
          <ol className="divide-y divide-gray-100 dark:divide-gray-700">
            {activePool.entries.map((entry) => {
              if (entry.kind === 'template') {
                const displayName = resolveTaskDisplayName(buildDisplayTask(entry.templateRef), taskTemplates, libraryTemplates);
                const template = taskTemplates[entry.templateRef] ?? templateLookup.get(entry.templateRef) ?? null;

                return (
                  <li
                    key={entry.id}
                    draggable
                    onDragStart={() => setDraggedId(entry.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event: DragEvent<HTMLLIElement>) => {
                      event.preventDefault();
                      moveEntry(entry.id);
                    }}
                    onDragEnd={() => setDraggedId(null)}
                    className="flex items-center gap-3 px-3 py-3"
                  >
                    <span className="text-sm text-gray-400">☰</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{displayName}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                          {template?.taskType ?? 'Unknown'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateEntries(activePool.entries.filter((activeEntry) => activeEntry.id !== entry.id))}
                      className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      Remove
                    </button>
                  </li>
                );
              }

              const resource = resources[entry.resourceId] ?? null;

              return (
                <li
                  key={entry.id}
                  draggable
                  onDragStart={() => setDraggedId(entry.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event: DragEvent<HTMLLIElement>) => {
                    event.preventDefault();
                    moveEntry(entry.id);
                  }}
                  onDragEnd={() => setDraggedId(null)}
                  className="flex items-center gap-3 px-3 py-3"
                >
                  <span className="text-sm text-gray-400">☰</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{entry.taskName}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 capitalize dark:bg-gray-700 dark:text-gray-300">
                        <IconDisplay iconKey={resource?.icon ?? 'task'} size={12} className="h-3 w-3 object-contain" alt="" />
                        {entry.resourceType}
                      </span>
                      <span>{resource?.name ?? entry.resourceId}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateEntries(activePool.entries.filter((activeEntry) => activeEntry.id !== entry.id))}
                    className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {isAddPanelOpen ? (
        <TaskPoolAddPanel
          onAdd={(entry) => updateEntries([...activePool.entries, entry])}
          onClose={() => setIsAddPanelOpen(false)}
        />
      ) : null}
    </div>
  );
}