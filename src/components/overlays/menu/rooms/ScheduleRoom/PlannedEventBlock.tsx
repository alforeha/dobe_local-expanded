import { useEffect, useState } from 'react';
import type { PlannedEvent } from '../../../../../types';
import { isOneOffEvent } from '../../../../../utils/isOneOffEvent';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { TaskPoolEditor } from './TaskPoolEditor';

interface PlannedEventBlockProps {
  event: PlannedEvent;
  onEdit: (event: PlannedEvent) => void;
  onDelete: (event: PlannedEvent) => void;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  soloExpanded?: boolean;
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

function getOrdinalSuffix(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  const mod10 = day % 10;
  if (mod10 === 1) return 'st';
  if (mod10 === 2) return 'nd';
  if (mod10 === 3) return 'rd';
  return 'th';
}

export function PlannedEventBlock({ event, onEdit, onDelete, expandedId, setExpandedId, soloExpanded = false }: PlannedEventBlockProps) {
  const oneOff = isOneOffEvent(event);
  const expanded = expandedId === event.id;
  const coAttendees = event.coAttendees ?? [];
  const [activeTab, setActiveTab] = useState<'details' | 'tasks'>('details');

  useEffect(() => {
    if (!expanded) {
      setActiveTab('details');
    }
  }, [expanded]);

  const scheduleSummary = oneOff ? formatEventSchedule(event) : formatRecurrence(event);

  return (
    <div className={`flex flex-row items-stretch overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800 ${expanded && soloExpanded ? 'h-full' : ''}`}>
      <div
        className="w-1 shrink-0 self-stretch"
        style={{ backgroundColor: event.color || '#6366f1' }}
      />

      <div className={`min-w-0 flex-1 ${expanded && soloExpanded ? 'flex min-h-0 flex-col' : 'flex flex-col'}`}>
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
          <div className={`border-t border-gray-100 dark:border-gray-700 ${soloExpanded ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-col'}`}>
            <div className="px-4 py-3">
              <div className="inline-flex rounded-full bg-gray-100 p-1 dark:bg-gray-900/60">
                <button
                  type="button"
                  onClick={() => setActiveTab('details')}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${activeTab === 'details' ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}
                >
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('tasks')}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${activeTab === 'tasks' ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}
                >
                  Tasks
                </button>
              </div>
            </div>

            {activeTab === 'details' ? (
              <div className="space-y-4 px-4 pb-3 text-sm text-gray-700 dark:text-gray-200">
                {oneOff ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-900/40">
                      <p className="text-xs uppercase tracking-wide text-gray-400">Start</p>
                      <p className="mt-1">{formatDateLabel(event.seedDate)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{event.startTime}</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-900/40">
                      <p className="text-xs uppercase tracking-wide text-gray-400">End</p>
                      <p className="mt-1">{formatDateLabel(event.dieDate ?? event.seedDate)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{event.endTime}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-900/40">
                        <p className="text-xs uppercase tracking-wide text-gray-400">Recurrence</p>
                        <p className="mt-1">{formatRecurrence(event)}</p>
                      </div>
                      <div className="rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-900/40">
                        <p className="text-xs uppercase tracking-wide text-gray-400">Time</p>
                        <p className="mt-1">{event.startTime} - {event.endTime}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-900/40">
                        <p className="text-xs uppercase tracking-wide text-gray-400">Seed Date</p>
                        <p className="mt-1">Starting {formatDateLabel(event.seedDate)}</p>
                      </div>
                      {event.dieDate ? (
                        <div className="rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-900/40">
                          <p className="text-xs uppercase tracking-wide text-gray-400">Die Date</p>
                          <p className="mt-1">Until {formatDateLabel(event.dieDate)}</p>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}

                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400">Description</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-900/40">{event.description.trim() || 'No description.'}</p>
                </div>

                {event.location?.placeName?.trim() && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400">Location</p>
                    <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">{event.location.placeName.trim()}</div>
                  </div>
                )}

                {coAttendees.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400">Co-attendees</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {coAttendees.map((attendee) => (
                        <span key={attendee.contactId} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                          {attendee.displayName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-hidden px-4 pb-3">
                <TaskPoolEditor
                  pools={event.pools}
                  activeCursor={event.taskPoolCursor}
                  onChange={() => undefined}
                  readOnly
                />
              </div>
            )}

            <div className="mt-auto flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 px-4 py-2 dark:border-gray-700">
              <button
                type="button"
                onClick={() => onDelete(event)}
                className="text-xs font-medium text-red-500 transition-colors hover:text-red-600"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => onEdit(event)}
                className="text-xs font-medium text-blue-500 transition-colors hover:text-blue-600"
              >
                Edit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
