import { TimeViewContainer } from '../timeViews/TimeViewContainer';
import type { TimeView } from '../timeViews/TimeViewContainer';

interface TodaySignals {
  day: number;
  week: number;
  explorer: number;
}

interface BodyProps {
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

export function Body({ activeView, onEventOpen, onResourceOpen, onWeekSelect, weekViewSeed, onDaySelect, dayViewSeed, onEditPlanned, todaySignals }: BodyProps) {
  return (
    <main className="flex-1 overflow-hidden">
      <TimeViewContainer
        activeView={activeView}
        onEventOpen={onEventOpen}
        onResourceOpen={onResourceOpen}
        onWeekSelect={onWeekSelect}
        weekViewSeed={weekViewSeed}
        onDaySelect={onDaySelect}
        dayViewSeed={dayViewSeed}
        onEditPlanned={onEditPlanned}
        todaySignals={todaySignals}
      />
    </main>
  );
}
