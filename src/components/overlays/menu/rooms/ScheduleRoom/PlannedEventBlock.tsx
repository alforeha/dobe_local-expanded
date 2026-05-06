import { useMemo } from 'react';
import type { PlannedEvent } from '../../../../../types';
import { isOneOffEvent } from '../../../../../utils/isOneOffEvent';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { getAllTemplateRefs } from '../../../../../utils/taskPools';
import { IconDisplay } from '../../../../shared/IconDisplay';

interface PlannedEventBlockProps {
  event: PlannedEvent;
  onEdit: (event: PlannedEvent) => void;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
}

function formatInterval(frequency: string, interval: number): string {
  const safeInterval = Math.max(1, interval || 1);

  if (frequency === 'daily') {
    return safeInterval === 1 ? 'Daily' : `Every ${safeInterval} days`;
  }
  if (frequency === 'weekly') {
    return safeInterval === 1 ? 'Weekly' : `Every ${safeInterval} weeks`;
  }
  if (frequency === 'monthly') {
    return safeInterval === 1 ? 'Monthly' : `Every ${safeInterval} months`;
  }

  return safeInterval === 1 ? 'Custom' : `Every ${safeInterval} cycles`;
}

function formatRecurrence(event: PlannedEvent): string {
  const frequency = event.recurrenceInterval.frequency;
  const interval = formatInterval(frequency, event.recurrenceInterval.interval);

  if (frequency === 'weekly' && event.recurrenceInterval.days.length > 0) {
    const weekdayLabels = event.recurrenceInterval.days.map((day) => WEEKDAY_LABELS[day] ?? day);
    return `${interval} ${weekdayLabels.join('/')}`;
  }
  if (frequency === 'monthly' && event.recurrenceInterval.monthlyDay) {
    return `${interval} · ${event.recurrenceInterval.monthlyDay}${getOrdinalSuffix(event.recurrenceInterval.monthlyDay)}`;
  }
  if (frequency === 'custom' && event.recurrenceInterval.customCondition) {
    return event.recurrenceInterval.customCondition;
  }

  return interval;
}

const WEEKDAY_LABELS: Record<string, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

function formatDateLabel(isoDate: string | null): string {
  if (!isoDate) return 'Never';

  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;

  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatEventSchedule(event: PlannedEvent): string {
  const start = formatDateLabel(event.seedDate);
  const end = event.dieDate && event.dieDate !== event.seedDate ? formatDateLabel(event.dieDate) : null;
  const dateText = end ? `${start} - ${end}` : start;
  return `${dateText} · ${event.startTime} - ${event.endTime}`;
}

function formatConflictMode(mode: PlannedEvent['conflictMode']): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function getOrdinalSuffix(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  const mod10 = day % 10;
  if (mod10 === 1) return 'st';
  if (mod10 === 2) return 'nd';
  if (mod10 === 3) return 'rd';
  return 'th';
}

export function PlannedEventBlock({ event, onEdit, expandedId, setExpandedId }: PlannedEventBlockProps) {
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);
  const oneOff = isOneOffEvent(event);
  const expanded = expandedId === event.id;

  const orderedTasks = useMemo(() => {
    return getAllTemplateRefs(event.pools)
      .map((id) => {
        const template = taskTemplates[id];
        return template
          ? {
              id,
              name: template.name,
            }
          : null;
      })
      .filter((entry): entry is { id: string; name: string } => entry !== null);
  }, [event.pools, taskTemplates]);

  const scheduleSummary = oneOff ? formatEventSchedule(event) : formatRecurrence(event);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-stretch">
        <div
          className="w-1 shrink-0 self-stretch"
          style={{ backgroundColor: event.color || '#6366f1' }}
        />

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setExpandedId(expanded ? null : event.id)}
            className="w-full px-4 py-3 text-left"
          >
            <div className="flex items-center gap-3">
              <IconDisplay iconKey={event.icon} size={32} className="h-8 w-8 shrink-0 object-contain" alt="" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {event.name}
                  </p>
                  {event.activeState === 'sleep' && (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                      Paused
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-300">
                  {scheduleSummary}
                </p>
              </div>
            </div>
          </button>

          {expanded && (
            <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-700">
              {oneOff ? (
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400">Start date</p>
                      <p>{formatDateLabel(event.seedDate)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400">End date</p>
                      <p>{formatDateLabel(event.dieDate ?? event.seedDate)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400">Begin time</p>
                      <p>{event.startTime}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400">End time</p>
                      <p>{event.endTime}</p>
                    </div>
                  </div>

                  {event.description.trim() && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400">Description</p>
                      <p className="whitespace-pre-wrap">{event.description}</p>
                    </div>
                  )}

                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400">Task pool</p>
                    {orderedTasks.length > 0 ? (
                      <ul className="mt-1 space-y-1">
                        {orderedTasks.map((task) => (
                          <li key={task.id} className="truncate rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
                            {task.name}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-gray-400">No tasks selected.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400">Seed date</p>
                      <p>{formatDateLabel(event.seedDate)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400">Die date</p>
                      <p>{formatDateLabel(event.dieDate)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400">Begin time</p>
                      <p>{event.startTime}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400">End time</p>
                      <p>{event.endTime}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400">Task pool</p>
                    {orderedTasks.length > 0 ? (
                      <ul className="mt-1 space-y-1">
                        {orderedTasks.map((task) => (
                          <li key={task.id} className="truncate rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
                            {task.name}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-gray-400">No tasks selected.</p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400">Conflict mode</p>
                    <p>{formatConflictMode(event.conflictMode)}</p>
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(event)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Edit
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
