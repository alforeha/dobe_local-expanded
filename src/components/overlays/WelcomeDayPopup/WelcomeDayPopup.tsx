import { CoachSection } from './CoachSection';
import { DayPieChart } from './DayPieChart';
import { RolloverIncompleteEvents } from './RolloverIncompleteEvents';
import { TodayEventRow } from './TodayEventRow';
import { TodayQuestRow } from './TodayQuestRow';
import './WelcomeDayPopup.css';

interface WelcomeDayPopupProps {
  onClose: () => void;
}

export function WelcomeDayPopup({ onClose }: WelcomeDayPopupProps) {
  return (
    <section className="welcome-day-popup" aria-label="Welcome Day">
      <CoachSection />

      <div className="welcome-day-popup__content">
        <RolloverIncompleteEvents />

        <section className="welcome-day-summary" aria-label="Today summary">
          <DayPieChart />
          <div className="welcome-day-summary__rows" aria-label="Today rows">
            <TodayEventRow />
            <TodayQuestRow />
          </div>
        </section>
      </div>

      <button
        type="button"
        className="welcome-day-popup__begin"
        onClick={onClose}
      >
        Begin today
      </button>
    </section>
  );
}
