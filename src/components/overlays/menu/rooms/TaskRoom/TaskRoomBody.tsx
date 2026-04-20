import { useMemo, useState } from 'react';
import type { TaskTemplate, TaskSecondaryTag, XpAward } from '../../../../../types';
import type { StatGroupKey } from '../../../../../types/user';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { TaskBlock } from './TaskBlock';

interface TaskRoomBodyProps {
  templates: [string, TaskTemplate, boolean][];
  onEdit: (key: string, template: TaskTemplate) => void;
}

const STAT_KEYS: StatGroupKey[] = ['health', 'strength', 'agility', 'defense', 'charisma', 'wisdom'];
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

function FilterPill({
  active,
  label,
  iconKey,
  onClick,
}: {
  active: boolean;
  label: string;
  iconKey?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
      }`}
    >
      {iconKey ? (
        <IconDisplay iconKey={iconKey} size={16} className="h-4 w-4 object-contain" alt="" />
      ) : null}
      {label}
    </button>
  );
}

export function TaskRoomBody({ templates, onEdit }: TaskRoomBodyProps) {
  const [search, setSearch] = useState('');
  const [statFilter, setStatFilter] = useState<StatGroupKey | 'All'>('All');
  const [tagFilter, setTagFilter] = useState<TaskSecondaryTag | 'All'>('All');

  const visibleTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();

    return templates
      .filter(([, template]) => {
        const primaryStat = getPrimaryStatKey(template.xpAward);
        const matchesSearch =
          query.length === 0 ||
          template.name.toLowerCase().includes(query) ||
          template.description.toLowerCase().includes(query);
        const matchesStat = statFilter === 'All' || primaryStat === statFilter;
        const matchesTag = tagFilter === 'All' || template.secondaryTag === tagFilter;

        return matchesSearch && matchesStat && matchesTag;
      })
      .sort(([, a], [, b]) => a.name.localeCompare(b.name));
  }, [search, statFilter, tagFilter, templates]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pt-3 pb-2">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 pr-9 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-lg leading-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              ×
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <FilterPill active={statFilter === 'All'} label="All" onClick={() => setStatFilter('All')} />
          {STAT_KEYS.map((stat) => (
            <FilterPill
              key={stat}
              active={statFilter === stat}
              label=""
              iconKey={stat}
              onClick={() => setStatFilter(stat)}
            />
          ))}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {SECONDARY_TAGS.map((tag) => (
            <FilterPill
              key={tag}
              active={tagFilter === tag}
              label={tag}
              onClick={() => setTagFilter(tag)}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-3">
        {visibleTemplates.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">No tasks match your filters.</p>
        ) : (
          <div className="space-y-2">
            {visibleTemplates.map(([key, template, isCustom]) => (
              <TaskBlock
                key={key}
                templateKey={key}
                template={template}
                isCustom={isCustom}
                onEdit={isCustom ? () => onEdit(key, template) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
