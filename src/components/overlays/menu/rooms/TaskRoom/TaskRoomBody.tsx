import { useEffect, useMemo, useState } from 'react';
import type { TaskTemplate, TaskSecondaryTag, XpAward } from '../../../../../types';
import type { StatGroupKey } from '../../../../../types/user';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import { getLibraryTemplatePool } from '../../../../../utils/resolveTaskTemplate';
import { resolveIcon } from '../../../../../constants/iconMap';
import { TaskBlock } from './TaskBlock';

interface TaskRoomBodyProps {
  mode: TaskRoomBodyMode;
  onAdd: () => void;
  onEdit: (key: string, template: TaskTemplate) => void;
  onExpandedChange?: (isExpanded: boolean) => void;
}

interface TaskEntry {
  key: string;
  template: TaskTemplate;
  isCustom: boolean;
}

export type TaskRoomBodyMode = 'userTasks' | 'library' | 'favorites' | 'resourceTasks';

const STAT_KEYS: StatGroupKey[] = ['health', 'strength', 'agility', 'defense', 'charisma', 'wisdom'];
const STAT_OPTIONS: Array<StatGroupKey | 'All'> = ['All', ...STAT_KEYS];
const SECONDARY_TAGS: Array<TaskSecondaryTag | 'All'> = [
  'All',
  'fitness',
  'health',
  'nutrition',
  'mindfulness',
  'home',
  'admin',
  'finance',
  'social',
  'learning',
];

function getPrimaryStatKey(xpAward: XpAward): StatGroupKey | null {
  let best: StatGroupKey | null = null;
  let bestValue = 0;

  for (const stat of STAT_KEYS) {
    const value = xpAward[stat] ?? 0;
    if (value > bestValue) {
      best = stat;
      bestValue = value;
    }
  }

  return best;
}

function formatOptionLabel(value: StatGroupKey | TaskSecondaryTag | 'All'): string {
  if (value === 'All') return 'All';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getModeEmptyMessage(mode: TaskRoomBodyMode): string {
  switch (mode) {
    case 'userTasks':
      return 'No user tasks match your filters.';
    case 'library':
      return 'No library tasks match your filters.';
    case 'favorites':
      return 'No favorite tasks match your filters.';
    default:
      return 'No tasks match your filters.';
  }
}

function TaskRoomBodyContent({ mode, onAdd, onEdit, onExpandedChange }: TaskRoomBodyProps) {
  const [search, setSearch] = useState('');
  const [statFilter, setStatFilter] = useState<StatGroupKey | 'All'>('All');
  const [tagFilter, setTagFilter] = useState<TaskSecondaryTag | 'All'>('All');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);
  const favouritesList = useUserStore((s) => s.user?.lists.favouritesList ?? []);

  useEffect(() => {
    onExpandedChange?.(Boolean(expandedKey));
  }, [expandedKey, onExpandedChange]);

  const templates = useMemo<TaskEntry[]>(() => {
    if (mode === 'resourceTasks') return [];

    const libraryEntries = getLibraryTemplatePool()
      .filter((template) => template.isSystem !== true && !!template.id && !template.id.startsWith('resource-task:'))
      .map((template) => ({
        key: template.id as string,
        template,
        isCustom: false,
      }));

    if (mode === 'library') {
      return libraryEntries;
    }

    if (mode === 'userTasks') {
      return Object.entries(taskTemplates)
        .filter(([key, template]) => template.isCustom === true && template.isSystem !== true && !key.startsWith('resource-task:'))
        .map(([key, template]) => ({
          key,
          template,
          isCustom: true,
        }));
    }

    const libraryMap = new Map(libraryEntries.map((entry) => [entry.key, entry]));

    return favouritesList
      .map((key) => {
        const userTemplate = taskTemplates[key];
        if (userTemplate && userTemplate.isSystem !== true && !key.startsWith('resource-task:')) {
          return {
            key,
            template: userTemplate,
            isCustom: userTemplate.isCustom === true,
          };
        }

        return libraryMap.get(key) ?? null;
      })
      .filter((entry): entry is TaskEntry => entry !== null);
  }, [favouritesList, mode, taskTemplates]);

  const visibleTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();

    return templates
      .filter(({ template }) => {
        const primaryStat = getPrimaryStatKey(template.xpAward);
        const matchesSearch =
          query.length === 0 ||
          template.name.toLowerCase().includes(query) ||
          template.description.toLowerCase().includes(query);
        const matchesStat = statFilter === 'All' || primaryStat === statFilter;
        const matchesTag = tagFilter === 'All' || template.secondaryTag === tagFilter;

        return matchesSearch && matchesStat && matchesTag;
      })
      .sort((left, right) => left.template.name.localeCompare(right.template.name));
  }, [search, statFilter, tagFilter, templates]);

  const expandedEntry = useMemo(
    () => (expandedKey ? visibleTemplates.find((entry) => entry.key === expandedKey) ?? null : null),
    [expandedKey, visibleTemplates],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!expandedEntry && (
        <div className="shrink-0 px-4 pb-2 pt-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setExpandedKey(null);
                }}
                placeholder="Search tasks..."
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 pr-9 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearch('');
                    setExpandedKey(null);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-lg leading-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  ×
                </button>
              )}
            </div>

            {mode === 'userTasks' && (
              <button
                type="button"
                onClick={onAdd}
                aria-label="Add task template"
                title="Add Task"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500 text-lg font-medium text-white transition-colors hover:bg-blue-600"
              >
                {resolveIcon('add')}
              </button>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Stat Type
              </span>
              <select
                value={statFilter}
                onChange={(e) => {
                  setStatFilter(e.target.value as StatGroupKey | 'All');
                  setExpandedKey(null);
                }}
                aria-label="Filter by stat type"
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                {STAT_OPTIONS.map((stat) => (
                  <option key={stat} value={stat}>
                    {formatOptionLabel(stat)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Category
              </span>
              <select
                value={tagFilter}
                onChange={(e) => {
                  setTagFilter(e.target.value as TaskSecondaryTag | 'All');
                  setExpandedKey(null);
                }}
                aria-label="Filter by category"
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                {SECONDARY_TAGS.map((tag) => (
                  <option key={tag} value={tag}>
                    {formatOptionLabel(tag)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      <div className={`min-h-0 flex-1 ${expandedEntry ? 'px-4 pb-3 pt-3' : 'overflow-y-auto px-4 pb-3'}`}>
        {expandedEntry ? (
          <TaskBlock
            templateKey={expandedEntry.key}
            template={expandedEntry.template}
            isCustom={expandedEntry.isCustom}
            mode={mode}
            expanded
            onToggleExpand={() => setExpandedKey(null)}
            onEdit={expandedEntry.isCustom ? () => onEdit(expandedEntry.key, expandedEntry.template) : undefined}
            className="h-full"
          />
        ) : visibleTemplates.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">{getModeEmptyMessage(mode)}</p>
        ) : (
          <div className="space-y-2">
            {visibleTemplates.map(({ key, template, isCustom }) => (
              <TaskBlock
                key={key}
                templateKey={key}
                template={template}
                isCustom={isCustom}
                mode={mode}
                expanded={false}
                onToggleExpand={() => setExpandedKey(key)}
                onEdit={isCustom ? () => onEdit(key, template) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function TaskRoomBody(props: TaskRoomBodyProps) {
  return <TaskRoomBodyContent key={props.mode} {...props} />;
}
