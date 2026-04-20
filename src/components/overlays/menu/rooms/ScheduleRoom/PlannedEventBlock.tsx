import { useMemo, useState } from 'react';
import type { PlannedEvent } from '../../../../../types';
import { isOneOffEvent } from '../../../../../utils/isOneOffEvent';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import type { TaskTemplate, TaskType } from '../../../../../types/taskTemplate';
import type { StatGroupKey } from '../../../../../types/user';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { TaskTemplateIcon } from '../../../../shared/TaskTemplateIcon';

interface PlannedEventBlockProps {
  event: PlannedEvent;
  onEdit: (event: PlannedEvent) => void;
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
    return `${interval} · ${event.recurrenceInterval.days.join(', ')}`;
  }
  if (frequency === 'monthly' && event.recurrenceInterval.monthlyDay) {
    return `${interval} · ${event.recurrenceInterval.monthlyDay}${getOrdinalSuffix(event.recurrenceInterval.monthlyDay)}`;
  }
  if (frequency === 'custom' && event.recurrenceInterval.customCondition) {
    return event.recurrenceInterval.customCondition;
  }

  return interval;
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

function getPrimaryStat(template: TaskTemplate): StatGroupKey {
  const groups: StatGroupKey[] = ['health', 'strength', 'agility', 'defense', 'charisma', 'wisdom'];
  let best: StatGroupKey = 'health';
  let bestValue = -1;

  for (const group of groups) {
    const value = template.xpAward[group] ?? 0;
    if (value > bestValue) {
      best = group;
      bestValue = value;
    }
  }

  return bestValue > 0 ? best : 'wisdom';
}

function getTaskTypeIconKey(taskType: TaskType): string {
  const map: Record<TaskType, string> = {
    CHECK: 'check',
    COUNTER: 'counter',
    SETS_REPS: 'sets_reps',
    CIRCUIT: 'circuit',
    DURATION: 'duration',
    TIMER: 'timer',
    RATING: 'rating',
    TEXT: 'text',
    FORM: 'form',
    CHOICE: 'choice',
    CHECKLIST: 'checklist',
    SCAN: 'scan',
    LOG: 'log',
    LOCATION_POINT: 'location_point',
    LOCATION_TRAIL: 'location_trail',
    ROLL: 'roll',
  };

  return map[taskType];
}

export function PlannedEventBlock({ event, onEdit }: PlannedEventBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);
  const oneOff = isOneOffEvent(event);

  const orderedTasks = useMemo(() => {
    return event.taskPool
      .map((id) => {
        const template = taskTemplates[id];
        return template
          ? {
              id,
              name: template.name,
              icon: template.icon,
              primaryStat: getPrimaryStat(template),
              taskType: template.taskType,
            }
          : null;
      })
      .filter((entry): entry is { id: string; name: string; icon: string; primaryStat: StatGroupKey; taskType: TaskType } => entry !== null);
  }, [event.taskPool, taskTemplates]);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800">
      <button
        type="button"
        onClick={() => {
          if (oneOff) {
            onEdit(event);
            return;
          }
          setExpanded((current) => !current);
        }}
        className="flex w-full items-center gap-3 px-3 py-3 text-left"
      >
        <div
          className="h-12 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: event.color || '#6366f1' }}
        />

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <IconDisplay iconKey={event.icon} size={28} className="h-7 w-7 shrink-0 object-contain" alt="" />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
              {event.name}
            </p>
            {event.activeState === 'sleep' && (
              <p className="text-xs uppercase tracking-wide text-gray-400">Paused</p>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-300">
            {event.startTime} - {event.endTime}
          </p>
          <p className="text-[11px] text-gray-400">
            {oneOff ? event.seedDate : formatRecurrence(event)}
          </p>
          {oneOff && <p className="text-[11px] text-indigo-500">Tap to edit</p>}
        </div>
      </button>

      {expanded && !oneOff && (
        <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-700">
          <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Schedule</p>
              <p className="text-gray-700 dark:text-gray-200">{event.startTime} - {event.endTime}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Recurrence</p>
              <p className="text-gray-700 dark:text-gray-200">{formatRecurrence(event)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Seed date</p>
              <p className="text-gray-700 dark:text-gray-200">{event.seedDate}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Die date</p>
              <p className="text-gray-700 dark:text-gray-200">{event.dieDate ?? 'NEVER'}</p>
            </div>
          </div>

          <div className="mb-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-gray-400">Task pool order</p>
            <div className="space-y-1.5">
              {orderedTasks.length === 0 && (
                <p className="text-sm text-gray-400">No tasks selected.</p>
              )}
              {orderedTasks.map((task, index) => (
                <div key={task.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900/40">
                  <span className="w-5 text-center text-xs text-gray-400">{index + 1}</span>
                  <span className="w-6 text-center text-base" aria-hidden="true"><IconDisplay iconKey={task.primaryStat} size={16} className="mx-auto h-4 w-4 object-contain" alt="" /></span>
                  <span className="w-6 text-center text-base" aria-hidden="true"><IconDisplay iconKey={getTaskTypeIconKey(task.taskType)} size={16} className="mx-auto h-4 w-4 object-contain" alt="" /></span>
                  <span className="w-6 text-center text-base" aria-hidden="true"><TaskTemplateIcon iconKey={task.icon} size={16} className="mx-auto h-4 w-4 object-contain" alt="" /></span>
                  <span className="truncate text-gray-700 dark:text-gray-200">{task.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onEdit(event)}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Edit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
