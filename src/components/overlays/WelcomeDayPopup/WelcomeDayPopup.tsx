import { CoachSection } from './CoachSection';
import { IconDisplay } from '../../shared/IconDisplay';
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
        <p>Content coming in LE-05b</p>
      </div>
    </section>
  );
}
