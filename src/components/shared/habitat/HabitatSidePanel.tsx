import { useState, type ReactNode } from 'react';

export interface HabitatSidePanelSection {
  key: string;
  /** Full label shown in the expanded panel (e.g. "chest"). */
  label: string;
  /** Compact label shown on the collapsed strip (e.g. "CHT"). */
  shortLabel: string;
  /** Stat / summary value rendered next to the label in both states. */
  value?: ReactNode;
  /** Rows shown when the section is expanded — rendered in a ~4-row scroll list. */
  rows?: ReactNode[];
  /** Optional add action for the section ("+" button in the expanded panel). */
  onAdd?: () => void;
}

interface HabitatSidePanelProps {
  sections: HabitatSidePanelSection[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional content rendered above the section list when expanded (e.g. a diagram). */
  topContent?: ReactNode;
  emptyRowsLabel?: string;
}

/**
 * Habitat side panel — collapsed summary strip that expands into a sectioned
 * panel with scrollable row lists. Generalized from the retired WorkoutPlanTab left strip.
 */
export function HabitatSidePanel({
  sections,
  open,
  onOpenChange,
  topContent,
  emptyRowsLabel = 'None yet',
}: HabitatSidePanelProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <div
      className={`${open ? 'w-48' : 'w-10'} flex shrink-0 flex-col overflow-hidden border-r border-gray-100 transition-all duration-200 dark:border-gray-700`}
    >
      {!open ? (
        <button
          type="button"
          aria-label="Expand side panel"
          className="flex w-full flex-1 flex-col items-center justify-start gap-1 py-2"
          onClick={() => onOpenChange(true)}
        >
          {sections.map((section) => (
            <div key={section.key} className="flex flex-col items-center py-1">
              <span className="text-xs font-bold leading-none text-gray-600 dark:text-gray-300">
                {section.shortLabel}
              </span>
              {section.value !== undefined && (
                <span className="text-xs leading-none text-gray-400 dark:text-gray-500">
                  {section.value}
                </span>
              )}
            </div>
          ))}
        </button>
      ) : (
        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex justify-end px-2 py-1">
            <button
              type="button"
              aria-label="Collapse side panel"
              className="text-xs text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200"
              onClick={() => {
                onOpenChange(false);
                setExpandedKey(null);
              }}
            >
              x
            </button>
          </div>

          {topContent}

          {sections.map((section) => {
            const isOpen = expandedKey === section.key;
            return (
              <div key={section.key} className="flex flex-col border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <button
                    type="button"
                    className="flex flex-1 items-center justify-between text-left"
                    onClick={() => setExpandedKey(isOpen ? null : section.key)}
                  >
                    <span className="text-xs font-semibold capitalize text-gray-700 dark:text-gray-200">
                      {section.label}
                    </span>
                    {section.value !== undefined && (
                      <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">
                        {section.value}
                      </span>
                    )}
                  </button>
                  {section.onAdd && (
                    <button
                      type="button"
                      aria-label={`Add to ${section.label}`}
                      className="ml-1 shrink-0 text-xs text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200"
                      onClick={section.onAdd}
                    >
                      +
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="flex max-h-28 flex-col gap-0.5 overflow-y-auto pb-1 pl-3">
                    {!section.rows || section.rows.length === 0 ? (
                      <span className="text-xs text-gray-400 dark:text-gray-500">{emptyRowsLabel}</span>
                    ) : (
                      section.rows
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
