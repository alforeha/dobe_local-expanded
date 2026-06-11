import type { ReactNode } from 'react';

interface HabitatRowProps {
  expanded: boolean;
  /** True when this row is the only one visible (list filtered to the expanded row). */
  soloExpanded?: boolean;
  onToggleExpand: () => void;
  /** Leading icon, already rendered (IconDisplay / TaskTemplateIcon / ...). */
  icon: ReactNode;
  name: string;
  /** One-line summary under the name. */
  summary?: string | null;
  /** Trailing element in the collapsed state (type pill, star, ...). */
  pill?: ReactNode;
  /** Color spine on the left edge; omit for no spine. */
  color?: string | null;
  /** Render the row at reduced opacity (e.g. sleeping/disabled items). */
  dimmed?: boolean;
  /** Expanded takeover content, typically a HabitatRowExpanded. */
  children?: ReactNode;
  className?: string;
}

/**
 * Habitat row — standard list row for habitat views: icon, name, summary line,
 * optional color spine, expand-to-takeover. Standardized on the
 * PlannedEventBlock row pattern (solo-expand filtering is owned by the list
 * container, as in ScheduleRoomBody).
 */
export function HabitatRow({
  expanded,
  soloExpanded = false,
  onToggleExpand,
  icon,
  name,
  summary,
  pill,
  color,
  dimmed = false,
  children,
  className,
}: HabitatRowProps) {
  return (
    <div
      className={`flex flex-row items-stretch overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800 ${dimmed ? 'opacity-50 ' : ''}${expanded && soloExpanded ? 'h-full ' : ''}${className ?? ''}`}
    >
      {color ? (
        <div className="w-1 shrink-0 self-stretch" style={{ backgroundColor: color }} />
      ) : null}

      <div className={`flex min-w-0 flex-1 flex-col ${expanded && soloExpanded ? 'min-h-0' : ''}`}>
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          className="w-full px-4 py-3 text-left"
        >
          <div className="flex items-center gap-3">
            <span className="shrink-0" aria-hidden="true">
              {icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                {name}
              </p>
              {summary ? (
                <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-300">{summary}</p>
              ) : null}
            </div>
            {pill ? <span className="shrink-0">{pill}</span> : null}
          </div>
        </button>

        {expanded && (
          <div className="relative w-full">
            <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            <div className="pointer-events-none absolute inset-x-0 top-0 flex -translate-y-1/2 justify-center">
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-gray-400 dark:bg-gray-800 dark:text-gray-500">
                ▼
              </span>
            </div>
          </div>
        )}

        {expanded && (
          <div className={`border-t border-gray-100 dark:border-gray-700 ${soloExpanded ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-col'}`}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
