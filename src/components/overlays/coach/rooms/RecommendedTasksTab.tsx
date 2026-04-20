import { useMemo, useState } from 'react';
import { taskTemplateLibrary } from '../../../../coach';
import { starterTaskTemplates } from '../../../../coach/StarterQuestLibrary';
import { getTaskTypeIconKey, resolveIcon } from '../../../../constants/iconMap';
import { useProgressionStore } from '../../../../stores/useProgressionStore';
import { useScheduleStore } from '../../../../stores/useScheduleStore';
import type { InputFields, TaskSecondaryTag, TaskTemplate, TaskType, XpAward } from '../../../../types/taskTemplate';
import type { StatGroupKey } from '../../../../types/user';
import { IconDisplay } from '../../../shared/IconDisplay';
import { TaskTemplateIcon } from '../../../shared/TaskTemplateIcon';

const STAT_KEYS: StatGroupKey[] = ['health', 'strength', 'agility', 'defense', 'charisma', 'wisdom'];

const TYPE_OPTIONS: Array<TaskType | 'ALL'> = [
  'ALL',
  'CHECK',
  'COUNTER',
  'SETS_REPS',
  'CIRCUIT',
  'DURATION',
  'TIMER',
  'RATING',
  'TEXT',
  'FORM',
  'CHOICE',
  'CHECKLIST',
  'SCAN',
  'LOG',
  'LOCATION_POINT',
  'LOCATION_TRAIL',
  'ROLL',
];

type TemplateState = 'active' | 'used' | 'quest' | 'inactive';

interface TemplateUsage {
  state: TemplateState;
  usedByName: string | null;
  questName: string | null;
}

function getPrimaryStatKey(xpAward: XpAward): StatGroupKey {
  let best: StatGroupKey = 'agility';
  let bestValue = -1;

  for (const key of STAT_KEYS) {
    const value = xpAward[key] ?? 0;
    if (value > bestValue) {
      best = key;
      bestValue = value;
    }
  }

  return best;
}

function getMergedTemplates(): TaskTemplate[] {
  const map = new Map<string, TaskTemplate>();

  for (const template of taskTemplateLibrary) {
    if (template.isSystem) continue;
    if (template.id) map.set(template.id, template);
  }

  for (const template of starterTaskTemplates) {
    if (template.isSystem) continue;
    if (template.id && !map.has(template.id)) {
      map.set(template.id, template);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function formatTaskType(taskType: TaskType): string {
  return taskType.replaceAll('_', ' ');
}

function formatCooldown(cooldown: number | null): string {
  if (cooldown === null) return 'No cooldown';
  if (cooldown < 60) return `${cooldown} min`;
  const hours = Math.floor(cooldown / 60);
  const minutes = cooldown % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

function summariseInputFields(inputFields: InputFields): string[] {
  if ('label' in inputFields && typeof inputFields.label === 'string') {
    const fields = [inputFields.label];
    if ('note' in inputFields && inputFields.note) fields.push(`Note: ${inputFields.note}`);
    return fields;
  }
  if ('target' in inputFields) return [`Target ${inputFields.target} ${inputFields.unit}`];
  if ('sets' in inputFields) {
    return [
      `${inputFields.sets} sets x ${inputFields.reps} reps`,
      inputFields.weight ? `Weight ${inputFields.weight}${inputFields.weightUnit ?? ''}` : 'Bodyweight',
    ];
  }
  if ('exercises' in inputFields) return [`${inputFields.rounds} rounds`, `${inputFields.exercises.join(', ')}`];
  if ('targetDuration' in inputFields) return [`${inputFields.targetDuration} ${inputFields.unit}`];
  if ('countdownFrom' in inputFields) return [`Countdown ${inputFields.countdownFrom}s`];
  if ('scale' in inputFields && 'label' in inputFields) return [`${inputFields.label} · ${inputFields.scale}-point scale`];
  if ('prompt' in inputFields && 'maxLength' in inputFields) return [`Prompt: ${inputFields.prompt}`, inputFields.maxLength ? `Max ${inputFields.maxLength} chars` : 'No max length'];
  if ('fields' in inputFields) return inputFields.fields.map((field) => `${field.label} (${field.fieldType})`);
  if ('options' in inputFields) return [`Options: ${inputFields.options.join(', ')}`, inputFields.multiSelect ? 'Multi-select' : 'Single choice'];
  if ('items' in inputFields) return inputFields.items.map((item) => item.label);
  if ('scanType' in inputFields) return [`Scan type: ${inputFields.scanType}`];
  if ('prompt' in inputFields) return [inputFields.prompt ?? 'Open log entry'];
  if ('captureAccuracy' in inputFields) return [inputFields.captureAccuracy ? 'Capture with accuracy' : 'Simple location point'];
  if ('captureInterval' in inputFields) return [inputFields.captureInterval ? `Capture every ${inputFields.captureInterval}s` : 'Manual waypoint capture'];
  if ('sides' in inputFields) return [`${inputFields.sides}-sided roll`];
  return ['No input summary available'];
}

function buildUsageState(
  templateId: string | undefined,
  taskTemplates: Record<string, TaskTemplate>,
  usageByTemplateId: Record<string, string>,
  questUsageByTemplateId: Record<string, string>,
): TemplateUsage {
  if (!templateId) {
    return { state: 'inactive', usedByName: null, questName: null };
  }

  const usedByName = usageByTemplateId[templateId] ?? null;
  const questName = questUsageByTemplateId[templateId] ?? null;
  const active = templateId in taskTemplates;

  if (questName) return { state: 'quest', usedByName, questName };
  if (usedByName) return { state: 'used', usedByName, questName: null };
  if (active) return { state: 'active', usedByName: null, questName: null };
  return { state: 'inactive', usedByName: null, questName: null };
}

export function RecommendedTasksTab() {
  const taskTemplates = useScheduleStore((state) => state.taskTemplates);
  const plannedEvents = useScheduleStore((state) => state.plannedEvents);
  const setTaskTemplate = useScheduleStore((state) => state.setTaskTemplate);
  const removeTaskTemplate = useScheduleStore((state) => state.removeTaskTemplate);
  const acts = useProgressionStore((state) => state.acts);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TaskType | 'ALL'>('ALL');
  const [statFilter, setStatFilter] = useState<StatGroupKey | 'ALL'>('ALL');
  const [showInactive, setShowInactive] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const allTemplates = useMemo(() => getMergedTemplates(), []);

  const usageByTemplateId = useMemo(() => {
    const usage: Record<string, string> = {};
    for (const plannedEvent of Object.values(plannedEvents)) {
      for (const templateId of plannedEvent.taskPool) {
        if (!usage[templateId]) usage[templateId] = plannedEvent.name;
      }
    }
    return usage;
  }, [plannedEvents]);

  const questUsageByTemplateId = useMemo(() => {
    const usage: Record<string, string> = {};
    for (const act of Object.values(acts)) {
      for (const chain of act.chains) {
        for (const quest of chain.quests) {
          for (const marker of quest.timely.markers) {
            if (marker.activeState && marker.taskTemplateRef && !usage[marker.taskTemplateRef]) {
              usage[marker.taskTemplateRef] = quest.name;
            }
          }
        }
      }
    }
    return usage;
  }, [acts]);

  const visible = useMemo(() => {
    return allTemplates.filter((template) => {
      const usage = buildUsageState(template.id, taskTemplates, usageByTemplateId, questUsageByTemplateId);
      if (!showInactive && usage.state === 'inactive') return false;
      if (typeFilter !== 'ALL' && template.taskType !== typeFilter) return false;
      if (statFilter !== 'ALL' && getPrimaryStatKey(template.xpAward) !== statFilter) return false;
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        if (!template.name.toLowerCase().includes(query)) return false;
      }
      return true;
    });
  }, [allTemplates, questUsageByTemplateId, search, showInactive, statFilter, taskTemplates, typeFilter, usageByTemplateId]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-4 pb-2 pt-3">
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-2">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search templates..."
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 pr-9 text-sm text-gray-800 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear task search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-lg leading-none text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
                >
                  ×
                </button>
              ) : null}
            </div>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as TaskType | 'ALL')}
              className="min-h-10 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              {TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type === 'ALL' ? 'All Types' : formatTaskType(type)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterPill active={statFilter === 'ALL'} onClick={() => setStatFilter('ALL')} label="All Stats" />
            {STAT_KEYS.map((key) => (
              <IconFilterPill
                key={key}
                active={statFilter === key}
                onClick={() => setStatFilter(key)}
                iconKey={key}
                title={key}
              />
            ))}
            <button
              type="button"
              onClick={() => setShowInactive((current) => !current)}
              className={`ml-auto min-h-10 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                showInactive
                  ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {showInactive ? 'Showing Inactive' : 'Hide Inactive'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex flex-col gap-3">
          {visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              No task templates match the current filters.
            </p>
          ) : null}

          {visible.map((template) => {
            const usage = buildUsageState(template.id, taskTemplates, usageByTemplateId, questUsageByTemplateId);
            return (
              <TaskTemplateCard
                key={template.id ?? template.name}
                template={template}
                usage={usage}
                expanded={expandedId === (template.id ?? template.name)}
                onToggleExpand={() => setExpandedId((current) => current === (template.id ?? template.name) ? null : (template.id ?? template.name))}
                onAdd={() => {
                  if (!template.id) return;
                  setTaskTemplate(template.id, template);
                }}
                onRemove={() => {
                  if (!template.id) return;
                  removeTaskTemplate(template.id);
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface FilterPillProps {
  active: boolean;
  label: string;
  onClick: () => void;
  title?: string;
}

function FilterPill({ active, label, onClick, title }: FilterPillProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`min-h-10 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-purple-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );
}

interface IconFilterPillProps {
  active: boolean;
  iconKey: string;
  onClick: () => void;
  title?: string;
}

function IconFilterPill({ active, iconKey, onClick, title }: IconFilterPillProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-purple-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
      }`}
    >
      <IconDisplay iconKey={iconKey} size={18} className="h-[18px] w-[18px] object-contain" alt="" />
    </button>
  );
}

interface TaskTemplateCardProps {
  template: TaskTemplate;
  usage: TemplateUsage;
  expanded: boolean;
  onToggleExpand: () => void;
  onAdd: () => void;
  onRemove: () => void;
}

function TaskTemplateCard({ template, usage, expanded, onToggleExpand, onAdd, onRemove }: TaskTemplateCardProps) {
  const primaryStat = getPrimaryStatKey(template.xpAward);
  const stateBadge = getStateBadge(usage.state);
  const inputSummaries = summariseInputFields(template.inputFields);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <IconDisplay iconKey={primaryStat} size={20} className="h-5 w-5 object-contain" />
        <IconDisplay iconKey={getTaskTypeIconKey(template.taskType)} size={20} className="h-5 w-5 object-contain" />
        <TaskTemplateIcon iconKey={template.icon} size={20} className="h-5 w-5 object-contain" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{template.name}</span>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${stateBadge.className}`}>
          {stateBadge.label}
        </span>
        <span className="shrink-0 text-sm text-gray-400" aria-hidden="true">
          {expanded ? resolveIcon('collapse') : resolveIcon('expand')}
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-gray-100 px-4 py-4 dark:border-gray-700">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-purple-50 text-3xl dark:bg-purple-900/20">
              <TaskTemplateIcon iconKey={template.icon} size={36} className="h-9 w-9 object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">{template.name}</h4>
                {template.secondaryTag ? <SecondaryTag tag={template.secondaryTag} /> : null}
                {template.isSystem ? (
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                    System
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{template.description}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <DetailChip label="Stat group" value={primaryStat} iconKey={primaryStat} />
            <DetailChip label="Task type" value={formatTaskType(template.taskType)} iconKey={getTaskTypeIconKey(template.taskType)} />
            <DetailChip label="Cooldown" value={formatCooldown(template.cooldown)} />
            <DetailChip label="Items" value={template.items.length > 0 ? template.items.join(', ') : 'None'} />
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Input Fields</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {inputSummaries.map((summary) => (
                <span
                  key={summary}
                  className="rounded-full bg-gray-100 px-3 py-1.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                >
                  {summary}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4">
            {template.isSystem ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">System templates stay coach-managed.</p>
            ) : usage.state === 'inactive' ? (
              <button
                type="button"
                onClick={onAdd}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
              >
                + Add to Templates
              </button>
            ) : usage.state === 'active' ? (
              <button
                type="button"
                onClick={onRemove}
                className="rounded-full bg-red-100 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
              >
                Remove
              </button>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Used by {usage.state === 'quest' ? usage.questName : usage.usedByName}
                {' '}— cannot remove
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getStateBadge(state: TemplateState): { label: string; className: string } {
  switch (state) {
    case 'active':
      return { label: 'Active', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' };
    case 'used':
      return { label: 'Used', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
    case 'quest':
      return { label: `${resolveIcon('lock')} Quest`, className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' };
    default:
      return { label: 'Inactive', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' };
  }
}

function SecondaryTag({ tag }: { tag: TaskSecondaryTag }) {
  return (
    <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium capitalize text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
      {tag}
    </span>
  );
}

interface DetailChipProps {
  label: string;
  value: string;
  icon?: string;
  iconKey?: string;
}

function DetailChip({ label, value, icon, iconKey }: DetailChipProps) {
  return (
    <div className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
        {iconKey ? <IconDisplay iconKey={iconKey} size={16} className="h-4 w-4 object-contain" /> : null}
        {!iconKey && icon ? <span aria-hidden="true">{icon}</span> : null}
        <span>{value}</span>
      </p>
    </div>
  );
}
