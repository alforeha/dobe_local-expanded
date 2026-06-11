import type { ReactNode } from 'react';
import type { Weekday } from '../../../types/taskTemplate';
import { WEEK_DAYS } from './weeklyPlanDays';

/** Optional slot rendered above the weekday rows (e.g. "Warmup", "Meal Prep"). */
export interface WeeklyPlanLeadingSlot {
  key: string;
  label: string;
  /** Assigned content for the slot — chips, summaries, anything. */
  content?: ReactNode;
  /** Shown when the slot has no content. */
  emptyLabel?: string;
  onAdd?: () => void;
}

interface WeeklyPlanViewProps {
  /**
   * Assigned content per weekday — chips, rows, anything renderable.
   * Days without content render emptyDayLabel.
   */
  contentByDay: Partial<Record<Weekday, ReactNode>>;
  /** Shown on days with no assigned content. */
  emptyDayLabel?: string;
  /** When provided, each day row renders a "+" assign action. */
  onAddToDay?: (day: Weekday) => void;
  /** aria-label prefix for the per-day add action (e.g. "Assign workout"). */
  addActionLabel?: string;
  /** Optional slots rendered above the weekday rows (e.g. Warmup). */
  leadingSlots?: WeeklyPlanLeadingSlot[];
  className?: string;
}

/**
 * Weekly plan view — shared Mon–Sun assignment grid used by Power Bay
 * (workout plan) and Gastro Hub (meal plan). Purely presentational and
 * content-type agnostic: consumers own all data, popups, and assignment
 * state and pass rendered content per day.
 */
export function WeeklyPlanView({
  contentByDay,
  emptyDayLabel = 'Nothing planned',
  onAddToDay,
  addActionLabel = 'Assign',
  leadingSlots,
  className,
}: WeeklyPlanViewProps) {
  return (
    <div className={`flex-1 overflow-y-auto ${className ?? ''}`}>
      {leadingSlots?.map((slot) => (
        <div
          key={slot.key}
          className="flex items-center justify-between border-b border-gray-100 px-3 py-2 dark:border-gray-700"
        >
          <span className="w-16 shrink-0 text-sm font-medium text-gray-700 dark:text-gray-200">
            {slot.label}
          </span>
          <div className="flex flex-1 flex-wrap items-center gap-1 pl-2">
            {slot.content ?? (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {slot.emptyLabel ?? emptyDayLabel}
              </span>
            )}
          </div>
          {slot.onAdd && (
            <button
              type="button"
              aria-label={`${addActionLabel} — ${slot.label}`}
              className="shrink-0 text-xs text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200"
              onClick={slot.onAdd}
            >
              +
            </button>
          )}
        </div>
      ))}

      {WEEK_DAYS.map(({ key, label }) => {
        const content = contentByDay[key];
        return (
          <div
            key={key}
            className="flex items-center justify-between border-b border-gray-100 px-3 py-2 dark:border-gray-700"
          >
            <span className="w-16 shrink-0 text-sm font-medium text-gray-700 dark:text-gray-200">
              {label}
            </span>
            <div className="flex flex-1 flex-wrap items-center gap-1 pl-2">
              {content ?? (
                <span className="text-xs text-gray-400 dark:text-gray-500">{emptyDayLabel}</span>
              )}
            </div>
            {onAddToDay && (
              <button
                type="button"
                aria-label={`${addActionLabel} — ${label}`}
                className="shrink-0 text-xs text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200"
                onClick={() => onAddToDay(key)}
              >
                +
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
