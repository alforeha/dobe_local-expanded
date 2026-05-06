import type { TaskEntry, TaskSet } from '../types/plannedEvent';

export function createTemplateTaskSet(
  templateRefs: string[],
  createId: () => string = () => crypto.randomUUID(),
): TaskSet {
  return {
    id: createId(),
    entries: templateRefs.map((templateRef) => ({
      kind: 'template' as const,
      id: createId(),
      templateRef,
    })),
  };
}

export function getAllTaskEntries(pools: TaskSet[] | undefined): TaskEntry[] {
  return (pools ?? []).flatMap((pool) => pool.entries ?? []);
}

export function getAllTemplateRefs(pools: TaskSet[] | undefined): string[] {
  return getAllTaskEntries(pools)
    .filter((entry): entry is Extract<TaskEntry, { kind: 'template' }> => entry.kind === 'template')
    .map((entry) => entry.templateRef);
}

export function clampTaskPoolCursor(pools: TaskSet[] | undefined, cursor: number | undefined): number {
  const safePools = pools ?? [];
  if (safePools.length <= 1) return 0;
  const nextCursor = typeof cursor === 'number' ? cursor : 0;
  return Math.min(Math.max(nextCursor, 0), safePools.length - 1);
}

export function ensureTaskPools(
  pools: TaskSet[] | undefined,
  createId: () => string = () => crypto.randomUUID(),
): TaskSet[] {
  return pools && pools.length > 0 ? pools : [{ id: createId(), entries: [] }];
}