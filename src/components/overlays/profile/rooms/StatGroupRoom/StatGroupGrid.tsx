import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { resolveIcon } from '../../../../../constants/iconMap';
import { localISODate } from '../../../../../utils/dateUtils';
import type { Event, QuickActionsEvent } from '../../../../../types/event';
import type { TalentGroupStats } from '../../../../../types/stats';
import type { Task } from '../../../../../types/task';
import type { TaskTemplate } from '../../../../../types/taskTemplate';
import type { StatGroupKey } from '../../../../../types/user';
import { resolveTaskIcon, resolveTemplate } from '../../../../timeViews/DayView/qaUtils';
import { IconDisplay } from '../../../../shared/IconDisplay';

const STAT_ORDER: StatGroupKey[] = ['health', 'strength', 'agility', 'defense', 'charisma', 'wisdom'];

const STAT_LABELS: Record<StatGroupKey, string> = {
  health: 'Health',
  strength: 'Strength',
  agility: 'Agility',
  defense: 'Defense',
  charisma: 'Charisma',
  wisdom: 'Wisdom',
};

const CUBE_BG: Record<StatGroupKey, string> = {
  health: 'bg-red-500',
  strength: 'bg-orange-500',
  agility: 'bg-green-500',
  defense: 'bg-blue-500',
  charisma: 'bg-pink-500',
  wisdom: 'bg-purple-500',
};

const STAT_TEXT: Record<StatGroupKey, string> = {
  health: 'text-red-500',
  strength: 'text-orange-500',
  agility: 'text-green-500',
  defense: 'text-blue-500',
  charisma: 'text-pink-500',
  wisdom: 'text-purple-500',
};

const DATE_COUNT = 91;
const LABEL_W = 124;
const ROW_GAP = 10;
const CUBE_GAP = 6;
const H_PAD = 10;
const DATE_H = 32;
const DATE_GAP = 12;
const GRID_PAD_TOP = 27;
const GRID_PAD_BOT = 12;

function buildDates(): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; i < DATE_COUNT; i++) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    dates.push(localISODate(date));
  }
  return dates;
}

const DATES = buildDates();

interface TaskXpDetail {
  taskId: string;
  taskName: string;
  taskIcon: string;
  xp: number;
}

interface CellData {
  xp: number;
  rows: TaskXpDetail[];
}

type StatXpMap = Record<StatGroupKey, Record<string, CellData>>;

function createEmptyMap(): StatXpMap {
  return {
    health: {},
    strength: {},
    agility: {},
    defense: {},
    charisma: {},
    wisdom: {},
  };
}

function addTaskXp(
  result: StatXpMap,
  stat: StatGroupKey,
  date: string,
  task: Task,
  template: TaskTemplate,
) {
  const xp = template.xpAward[stat] ?? 0;
  if (xp <= 0) return;

  if (!result[stat][date]) {
    result[stat][date] = { xp: 0, rows: [] };
  }

  result[stat][date].xp += xp;
  result[stat][date].rows.push({
    taskId: task.id,
    taskName: template.name,
    taskIcon: resolveTaskIcon(template),
    xp,
  });
}

function buildStatXpMap(
  historyEvents: Record<string, Event | QuickActionsEvent>,
  tasks: Record<string, Task>,
  taskTemplates: Record<string, TaskTemplate>,
): StatXpMap {
  const dateSet = new Set(DATES);
  const result = createEmptyMap();

  const processTask = (taskId: string, fallbackDate?: string) => {
    const task = tasks[taskId];
    if (!task || task.completionState !== 'complete') return;

    const date = task.completedAt?.slice(0, 10) ?? fallbackDate ?? null;
    if (!date || !dateSet.has(date)) return;

    const template = resolveTemplate(task.templateRef, taskTemplates);
    if (!template) return;

    for (const stat of STAT_ORDER) {
      addTaskXp(result, stat, date, task, template);
    }
  };

  for (const event of Object.values(historyEvents)) {
    if ('completions' in event) {
      for (const completion of event.completions) {
        processTask(completion.taskRef, completion.completedAt.slice(0, 10));
      }
      continue;
    }

    for (const taskId of event.tasks) {
      processTask(taskId, event.startDate);
    }
  }

  return result;
}

export interface StatGroupGridProps {
  talents: Record<StatGroupKey, TalentGroupStats>;
  historyEvents: Record<string, Event | QuickActionsEvent>;
  tasks: Record<string, Task>;
  taskTemplates: Record<string, TaskTemplate>;
}

interface SelectedCube {
  stat: StatGroupKey;
  date: string;
}

interface CubePopupProps {
  selected: SelectedCube;
  statXpMap: StatXpMap;
  onClose: () => void;
}

function CubePopup({ selected, statXpMap, onClose }: CubePopupProps) {
  const cell = statXpMap[selected.stat][selected.date];
  const totalXp = cell?.xp ?? 0;
  const rows = cell?.rows ?? [];
  const dateLabel = new Date(`${selected.date}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[28rem] rounded-3xl bg-white p-5 shadow-xl dark:bg-gray-800"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className={`inline-flex items-center gap-2 text-base font-semibold ${STAT_TEXT[selected.stat]}`}>
              <IconDisplay iconKey={selected.stat} size={20} className="h-5 w-5 object-contain" />
              <span>{STAT_LABELS[selected.stat]}</span>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{dateLabel}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            aria-label="Close"
          >
            {resolveIcon('close')}
          </button>
        </div>

        <div className="mb-4 rounded-2xl bg-gray-50 px-4 py-3 dark:bg-gray-900/40">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">XP earned</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">+{totalXp} XP</p>
        </div>

        {rows.length > 0 ? (
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {rows.map((row) => (
              <div
                key={`${row.taskId}-${row.taskName}-${row.xp}`}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-900/40"
              >
                <span className="text-2xl leading-none">{row.taskIcon}</span>
                <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{row.taskName}</p>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">+{row.xp} XP</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">No XP recorded for this day.</p>
        )}
      </div>
    </div>
  );
}

export function StatGroupGrid({ talents, historyEvents, tasks, taskTemplates }: StatGroupGridProps) {
  const [selected, setSelected] = useState<SelectedCube | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const cubeGridRef = useRef<HTMLDivElement>(null);
  const [cubeSize, setCubeSize] = useState(36);

  useLayoutEffect(() => {
    const element = cubeGridRef.current;
    if (!element) return;

    const measure = () => {
      setCubeSize(
        Math.max(
          32,
          Math.floor((element.clientHeight - (STAT_ORDER.length - 1) * ROW_GAP) / STAT_ORDER.length),
        ),
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      element.scrollLeft += event.deltaY + event.deltaX;
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const statXpMap = useMemo(
    () => buildStatXpMap(historyEvents, tasks, taskTemplates),
    [historyEvents, tasks, taskTemplates],
  );

  const todayIso = localISODate(new Date());
  const scrollWidth = DATE_COUNT * cubeSize + (DATE_COUNT - 1) * CUBE_GAP + H_PAD * 2;
  const statIconSize = 57;
  const pointSize = '1.9rem';
  const cubeTextSize = `${Math.max(33, Math.min(50, Math.round((cubeSize / 36) * 90)))}%`;
  const dateSize = '1.5rem';

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex shrink-0 flex-col" style={{ width: LABEL_W }}>
        <div className="shrink-0" style={{ height: GRID_PAD_TOP + DATE_H + DATE_GAP }} />
        <div className="flex min-h-0 flex-1 flex-col" style={{ gap: ROW_GAP }}>
          {STAT_ORDER.map((stat) => (
            <div key={stat} className="flex flex-1 items-center justify-center">
              <div className="flex min-w-[82px] items-center justify-center gap-3">
                <IconDisplay iconKey={stat} size={statIconSize} className="h-[34px] w-[34px] shrink-0 object-contain" />
                <span className={`font-bold leading-none ${STAT_TEXT[stat]}`} style={{ fontSize: pointSize }}>
                  {talents[stat]?.statPoints ?? 0}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="shrink-0" style={{ height: '37px' }} />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden">
        <div
          className="flex h-full flex-col"
          style={{
            width: scrollWidth,
            paddingTop: GRID_PAD_TOP,
            paddingBottom: GRID_PAD_BOT,
            paddingLeft: H_PAD,
            paddingRight: H_PAD,
            boxSizing: 'border-box',
          }}
        >
          <div className="flex shrink-0" style={{ height: DATE_H, gap: CUBE_GAP, marginBottom: DATE_GAP }}>
            {DATES.map((date) => {
              const day = parseInt(date.slice(8), 10);
              const isFirst = day === 1;
              const isToday = date === todayIso;
              const monthLabel = isFirst
                ? new Date(`${date}T12:00:00`).toLocaleString('default', { month: 'short' })
                : null;

              return (
                <div
                  key={date}
                  className="relative flex shrink-0 items-center justify-center select-none"
                  style={{ width: cubeSize, height: DATE_H }}
                >
                  {isFirst ? (
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: -Math.ceil(CUBE_GAP / 2) - 1,
                        top: 0,
                        bottom: -DATE_GAP,
                        width: 2,
                        background: 'rgba(129,140,248,0.9)',
                        borderRadius: 1,
                      }}
                    />
                  ) : null}
                  <span
                    className={`leading-none ${
                      isFirst
                        ? 'font-bold text-indigo-400 dark:text-indigo-300'
                        : isToday
                          ? 'font-semibold text-gray-900 dark:text-gray-100'
                          : 'text-gray-400 dark:text-gray-500'
                    }`}
                    style={{ fontSize: dateSize }}
                  >
                    {monthLabel ?? day}
                  </span>
                </div>
              );
            })}
          </div>

          <div ref={cubeGridRef} className="flex min-h-0 flex-1 flex-col" style={{ gap: ROW_GAP }}>
            {STAT_ORDER.map((stat) => (
              <div key={stat} className="flex flex-1 items-center" style={{ gap: CUBE_GAP }}>
                {DATES.map((date) => {
                  const cell = statXpMap[stat][date];
                  const xp = cell?.xp ?? 0;
                  const isToday = date === todayIso;
                  const isSelected = selected?.stat === stat && selected?.date === date;
                  const day = parseInt(date.slice(8), 10);
                  const isFirst = day === 1;

                  return (
                    <div key={date} className="relative shrink-0" style={{ width: cubeSize, height: cubeSize }}>
                      {isFirst ? (
                        <div
                          className="absolute inset-y-0 pointer-events-none"
                          style={{
                            left: -Math.ceil(CUBE_GAP / 2) - 1,
                            width: 2,
                            background: 'rgba(129,140,248,0.9)',
                            borderRadius: 1,
                          }}
                        />
                      ) : null}

                      <button
                        type="button"
                        onClick={() => setSelected((current) => (current?.stat === stat && current.date === date ? null : { stat, date }))}
                        aria-label={`${STAT_LABELS[stat]} ${date}: ${xp} XP`}
                        className={`absolute inset-0 flex items-center justify-center rounded-sm font-semibold leading-none ${
                          xp > 0 ? `${CUBE_BG[stat]} text-white` : 'bg-gray-300 dark:bg-gray-600'
                        } ${isToday ? 'ring-1 ring-yellow-400' : ''} ${isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-900' : ''}`}
                        style={{ fontSize: `${cubeSize}px` }}
                      >
                        {xp > 0 ? <span className="leading-none" style={{ fontSize: cubeTextSize }}>+{xp}</span> : null}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {selected ? <CubePopup selected={selected} statXpMap={statXpMap} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
