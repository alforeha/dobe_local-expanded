import type { ReactNode } from 'react';

interface HabitatShellProps {
  /** Left-hand side panel, typically a HabitatSidePanel. */
  sidePanel?: ReactNode;
  /** Top bar, typically a HabitatTopBar. Hide it (pass nothing) when a row is solo-expanded. */
  topBar?: ReactNode;
  /** Habitat body — row lists, placeholders, etc. */
  children: ReactNode;
  className?: string;
}

/**
 * Habitat shell — shared layout wrapper for habitat views (Focus Yard, Power Bay,
 * Gastro Hub, ...): side panel on the left, top bar above the body on the right.
 *
 * The shell is purely structural; all state (panel open, search, expansion) is
 * owned by the consumer.
 */
export function HabitatShell({ sidePanel, topBar, children, className }: HabitatShellProps) {
  return (
    <div className={`relative flex h-full min-h-0 flex-row ${className ?? ''}`}>
      {sidePanel}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {topBar ? <div className="shrink-0">{topBar}</div> : null}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
