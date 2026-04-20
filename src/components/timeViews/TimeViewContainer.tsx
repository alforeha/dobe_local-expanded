import { DayView } from './DayView/DayView';
import { WeekView } from './WeekView/WeekView';
import { WeekExplorer } from './WeekExplorer/WeekExplorer';

export type TimeView = 'day' | 'week' | 'explorer';

interface TodaySignals {
  day: number;
  week: number;
  explorer: number;
}

interface TimeViewContainerProps {
  activeView: TimeView;
  onEventOpen: (eventId: string) => void;
  onResourceOpen?: (resourceId: string) => void;
  onWeekSelect?: (weekStart: Date) => void;
  weekViewSeed?: Date | null;
  onDaySelect?: (date: Date) => void;
  dayViewSeed?: Date | null;
  onEditPlanned?: (plannedId: string) => void;
  todaySignals?: TodaySignals;
}

/** Single source of truth for active time view. Footer TimeViewTabs dispatches to AppShell which passes here. */
export function TimeViewContainer({ activeView, onEventOpen, onResourceOpen, onWeekSelect, weekViewSeed, onDaySelect, dayViewSeed, onEditPlanned, todaySignals }: TimeViewContainerProps) {
  return (
    <div className="h-full overflow-hidden">
      {activeView === 'day' && <DayView key={dayViewSeed?.toISOString() ?? 'default'} onEventOpen={onEventOpen} onResourceOpen={onResourceOpen} onEditPlanned={onEditPlanned} todaySignal={todaySignals?.day} initialDate={dayViewSeed ?? undefined} />}
      {activeView === 'week' && <WeekView initialWeekStart={weekViewSeed ?? undefined} todaySignal={todaySignals?.week} onDaySelect={onDaySelect} />}
      {activeView === 'explorer' && <WeekExplorer onWeekSelect={onWeekSelect} todaySignal={todaySignals?.explorer} />}
    </div>
  );
}
