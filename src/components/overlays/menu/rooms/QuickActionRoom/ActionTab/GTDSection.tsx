import { useState } from 'react';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { STARTER_TEMPLATE_IDS, starterTaskTemplates } from '../../../../../../coach/StarterQuestLibrary';
import { AddGTDItemPopup } from './AddGTDItemPopup';
import type { GTDItem, Task } from '../../../../../../types/task';
import type { TaskTemplate, XpAward, InputFields } from '../../../../../../types/taskTemplate';
import type { Resource } from '../../../../../../types/resource';
import type { StatGroupKey } from '../../../../../../types/user';
import { completeGTDItem, dismissGTDItem } from '../../../../../../engine/resourceEngine';
import { completeManualGTDItem, removeManualGTDItem } from '../../../../../../engine/listsEngine';
import { TaskTypeInputRenderer } from '../../../../event/TaskTypeInputRenderer';
import { GlowRing } from '../../../../../shared/GlowRing';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { ONBOARDING_GLOW } from '../../../../../../constants/onboardingKeys';
import { useGlows } from '../../../../../../hooks/useOnboardingGlow';

type GtdEntry =
  | {
      kind: 'system';
      id: string;
      task: Task;
      template: TaskTemplate | null;
      resource: Resource | null;
      isMilestone: boolean;
      title: string;
      note: string | null;
      dueDate: string | null;
    }
  | {
      kind: 'manual';
      id: string;
      item: GTDItem;
      template: TaskTemplate | null;
      resource: Resource | null;
      title: string;
      note: string | null;
      dueDate: string | null;
    };

type GtdFilter = 'all' | 'resource' | 'milestone' | 'user';

const STAT_KEYS: StatGroupKey[] = [
  'health',
  'strength',
  'agility',
  'defense',
  'charisma',
  'wisdom',
];

function getTemplateByRef(
  taskTemplates: Record<string, TaskTemplate>,
  templateRef: string | null | undefined,
): TaskTemplate | null {
  if (!templateRef) return null;
  return taskTemplates[templateRef] ??
    starterTaskTemplates.find((template) => template.id === templateRef) ??
    null;
}

function getPrimaryStatKey(xpAward: XpAward): StatGroupKey | null {
  let best: StatGroupKey | null = null;
  let bestVal = 0;
  for (const key of STAT_KEYS) {
    const value = xpAward[key];
    if (value > bestVal) {
      bestVal = value;
      best = key;
    }
  }
  return best;
}

function getMainIconKey(entry: GtdEntry): string {
  if (entry.kind === 'system' && entry.resource && (!entry.template || entry.template.icon === 'resource-task')) {
    return entry.resource.type;
  }
  if (entry.kind === 'manual' && entry.template) {
    return entry.template.icon;
  }
  if (entry.kind === 'system' && entry.template) {
    return entry.template.icon;
  }
  return 'check';
}

function getTone(entry: GtdEntry): string {
  if (entry.kind === 'system' && entry.isMilestone) {
    return 'border-purple-200 bg-purple-50 text-purple-900 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-100';
  }
  if (entry.resource) {
    return 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100';
  }
  return 'border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
}

function buildPreviewTask(entry: GtdEntry): Task | null {
  if (entry.kind === 'system') return entry.task;
  if (!entry.template) return null;
  return {
    id: `preview-${entry.item.id}`,
    templateRef: entry.item.templateRef ?? `manual-preview:${entry.item.id}`,
    completionState: 'pending',
    completedAt: null,
    resultFields: {},
    attachmentRef: null,
    resourceRef: entry.item.resourceRef,
    location: null,
    sharedWith: null,
    questRef: null,
    actRef: null,
    secondaryTag: entry.template.secondaryTag,
  };
}

function renderTopRightIconKey(entry: GtdEntry): string | null {
  if (entry.kind === 'system' && entry.isMilestone) return null;
  if (entry.resource) return entry.resource.type;
  return null;
}

function detailText(entry: GtdEntry): string | null {
  if (entry.note) return entry.note;
  if (entry.template?.description) return entry.template.description;
  return null;
}

function getEntryFilter(entry: GtdEntry): GtdFilter {
  if (entry.kind === 'manual') return 'user';
  if (entry.isMilestone) return 'milestone';
  if (entry.resource) return 'resource';
  return 'user';
}

const GTD_FILTERS: Array<{ key: GtdFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'resource', label: 'Resource' },
  { key: 'milestone', label: 'Milestone' },
  { key: 'user', label: 'User' },
];

export function GTDSection() {
  const user = useUserStore((s) => s.user);
  const tasks = useScheduleStore((s) => s.tasks);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);
  const resources = useResourceStore((s) => s.resources);
  const gtdItemGlows = useGlows(ONBOARDING_GLOW.GTD_ITEM);
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [filter, setFilter] = useState<GtdFilter>('all');

  const gtdList = user?.lists.gtdList ?? [];
  const manualGtdList = user?.lists.manualGtdList ?? [];

  const autoTracked = new Set<string>([
    STARTER_TEMPLATE_IDS.setupSchedule,
    STARTER_TEMPLATE_IDS.learnGrounds,
    STARTER_TEMPLATE_IDS.claimIdentity,
  ]);

  const systemEntries: GtdEntry[] = gtdList
    .map((id) => tasks[id])
    .filter((task): task is Task => Boolean(task) && task.completionState === 'pending')
    .filter((task) => !task.templateRef || !autoTracked.has(task.templateRef))
    .map((task) => {
      const template = getTemplateByRef(taskTemplates, task.templateRef);
      const resource = task.resourceRef ? resources[task.resourceRef] ?? null : null;
      return {
        kind: 'system',
        id: task.id,
        task,
        template,
        resource,
        isMilestone: task.questRef !== null,
        title: template?.name ?? resource?.name ?? task.title ?? task.templateRef ?? 'Unknown task',
        note: template?.description ?? null,
        dueDate: null,
      };
    });

  const manualEntries: GtdEntry[] = manualGtdList
    .filter((item) => item.completionState === 'pending')
    .map((item) => ({
      kind: 'manual',
      id: item.id,
      item,
      template: getTemplateByRef(taskTemplates, item.templateRef),
      resource: item.resourceRef ? resources[item.resourceRef] ?? null : null,
      title: item.title,
      note: item.note,
      dueDate: item.dueDate,
    }));

  const entries = [...systemEntries, ...manualEntries];
  const filteredEntries = entries.filter((entry) => filter === 'all' || getEntryFilter(entry) === filter);
  const expandedEntry = filteredEntries.find((entry) => entry.id === expandedId) ?? null;
  const isEmpty = filteredEntries.length === 0;

  function handleSystemComplete(task: Task, resultFields: Partial<InputFields>) {
    if (!user) return;
    completeGTDItem(task.id, user, resultFields);
    setExpandedId(null);
    setDeleteConfirmId(null);
  }

  function handleManualComplete(item: GTDItem, resultFields: Partial<InputFields>) {
    if (!user) return;
    completeManualGTDItem(item.id, user, resultFields);
    setExpandedId(null);
    setDeleteConfirmId(null);
  }

  function handleDelete(entry: GtdEntry) {
    if (!user) return;
    if (entry.kind === 'system') {
      if (entry.resource && deleteConfirmId !== entry.id) {
        setDeleteConfirmId(entry.id);
        return;
      }
      dismissGTDItem(entry.task.id, user);
    } else {
      removeManualGTDItem(entry.item.id, user);
    }
    setExpandedId(null);
    setDeleteConfirmId(null);
  }

  return (
    <>
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            GTD List
          </h3>
          <button
            type="button"
            onClick={() => setShowAddPopup(true)}
            className="text-xs font-medium text-blue-500"
          >
            + Add
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {GTD_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setFilter(key);
                setExpandedId(null);
                setDeleteConfirmId(null);
              }}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                filter === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {isEmpty ? (
          <p className="py-2 text-center text-xs text-gray-400">No GTD tasks in this filter.</p>
        ) : expandedEntry ? (
          <ExpandedGtdCard
            entry={expandedEntry}
            deleteConfirm={deleteConfirmId === expandedEntry.id}
            onCancel={
              expandedEntry.kind === 'system' && expandedEntry.isMilestone
                ? null
                : () => {
                    setExpandedId(null);
                    setDeleteConfirmId(null);
                  }
            }
            onDelete={
              expandedEntry.kind === 'system' && expandedEntry.isMilestone
                ? null
                : () => handleDelete(expandedEntry)
            }
            onSystemComplete={handleSystemComplete}
            onManualComplete={handleManualComplete}
          />
        ) : (
          <div className="max-h-[16.75rem] overflow-y-auto pr-1">
            <div className="grid grid-cols-3 justify-center gap-2 auto-rows-[5.25rem]">
              {filteredEntries.map((entry) => {
                const topRightIconKey = renderTopRightIconKey(entry);
                return (
                  <GlowRing key={entry.id} active={gtdItemGlows} rounded="lg" className="block">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedId(entry.id);
                        setDeleteConfirmId(null);
                      }}
                      className={`relative flex h-[5.25rem] w-full flex-col items-center justify-center rounded-2xl border px-2 py-2 text-center shadow-sm transition-transform hover:-translate-y-0.5 ${getTone(entry)}`}
                    >
                      {topRightIconKey && (
                        <span className="absolute right-2 top-2 text-sm leading-none">
                          <IconDisplay iconKey={topRightIconKey} size={14} className="h-3.5 w-3.5 object-contain" alt="" />
                        </span>
                      )}
                      <IconDisplay iconKey={getMainIconKey(entry)} size={32} className="mb-1 h-8 w-8 object-contain" alt="" />
                      <span className="line-clamp-2 text-center text-[11px] font-semibold leading-3.5">
                        {entry.title}
                      </span>
                    </button>
                  </GlowRing>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showAddPopup && <AddGTDItemPopup onClose={() => setShowAddPopup(false)} />}
    </>
  );
}

interface ExpandedGtdCardProps {
  entry: GtdEntry;
  deleteConfirm: boolean;
  onCancel: (() => void) | null;
  onDelete: (() => void) | null;
  onSystemComplete: (task: Task, resultFields: Partial<InputFields>) => void;
  onManualComplete: (item: GTDItem, resultFields: Partial<InputFields>) => void;
}

function ExpandedGtdCard({
  entry,
  deleteConfirm,
  onCancel,
  onDelete,
  onSystemComplete,
  onManualComplete,
}: ExpandedGtdCardProps) {
  const previewTask = buildPreviewTask(entry);
  const detail = detailText(entry);
  const statKey = entry.template ? getPrimaryStatKey(entry.template.xpAward) : null;
  const canUseTemplateInput = Boolean(entry.template && previewTask);

  return (
    <div className={`min-h-[19rem] rounded-3xl border p-4 shadow-sm ${getTone(entry)}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <IconDisplay iconKey={getMainIconKey(entry)} size={40} className="h-10 w-10 shrink-0 object-contain" alt="" />
          <div>
            <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {entry.title}
            </h4>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-300">
              {statKey && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 dark:bg-gray-900/40">
                  <IconDisplay iconKey={statKey} size={14} className="h-3.5 w-3.5 object-contain" alt="" />
                  <span className="capitalize">{statKey}</span>
                </span>
              )}
              {entry.resource && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 dark:bg-gray-900/40">
                  <IconDisplay iconKey={entry.resource.type} size={14} className="h-3.5 w-3.5 object-contain" alt="" />
                  <span>{entry.resource.name}</span>
                </span>
              )}
              {entry.kind === 'system' && entry.isMilestone && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 dark:bg-gray-900/40">
                  <span>Trophy</span>
                  <span>Milestone</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {detail && (
        <p className="mb-3 text-sm text-gray-700 dark:text-gray-200">
          {detail}
        </p>
      )}

      {entry.dueDate && (
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-300">
          Due {entry.dueDate}
        </p>
      )}

      <div className="mb-4 rounded-2xl bg-white/70 p-3 dark:bg-gray-900/40">
        {entry.kind === 'manual' && !entry.template ? (
          <button
            type="button"
            onClick={() => onManualComplete(entry.item, {})}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Complete
          </button>
        ) : canUseTemplateInput ? (
          <TaskTypeInputRenderer
            taskType={entry.template!.taskType}
            template={entry.template}
            task={previewTask}
            onComplete={(resultFields) => {
              if (entry.kind === 'system') {
                onSystemComplete(entry.task, resultFields);
                return;
              }
              onManualComplete(entry.item, resultFields);
            }}
          />
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-300">
            Task input is not available for this item.
          </p>
        )}
      </div>

      <div className="mt-auto flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              deleteConfirm
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            } ${onCancel ? 'flex-1' : 'w-full'}`}
          >
            {deleteConfirm ? 'Confirm Delete' : 'Delete'}
          </button>
        )}
      </div>
    </div>
  );
}
