import { CoachSection } from './CoachSection';
import { DayPieChart } from './DayPieChart';
import { IconDisplay } from '../../shared/IconDisplay';
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
      <button
        type="button"
        className="welcome-day-popup__close"
        aria-label="Close Welcome Day"
        onClick={onClose}
      >
        <IconDisplay iconKey="close" />
      </button>

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
    </section>
  );
}
