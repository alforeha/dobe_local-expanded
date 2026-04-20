import { TimeViewTabs } from './TimeViewTabs';
import { CoachComment } from './CoachComment';
import { CoachNavButton } from './CoachNavButton';
import { MenuNavButton } from './MenuNavButton';
import type { TimeView } from '../timeViews/TimeViewContainer';
import { GlowRing } from '../shared/GlowRing';
import { ONBOARDING_GLOW } from '../../constants/onboardingKeys';
import { useGlows } from '../../hooks/useOnboardingGlow';

interface FooterProps {
  activeView: TimeView;
  onViewChange: (view: TimeView) => void;
  onCoachOpen: () => void;
  onMenuOpen: () => void;
}

export function Footer({ activeView, onViewChange, onCoachOpen, onMenuOpen }: FooterProps) {
  const coachButtonGlows = useGlows(ONBOARDING_GLOW.COACH_BUTTON);
  const menuButtonGlows = useGlows(ONBOARDING_GLOW.MENU_BUTTON);

  return (
    <footer className="shrink-0 flex items-stretch h-20 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      {/* LEFT — Coach button, full height, right separator */}
      <div className="w-14 shrink-0 border-r border-gray-200 dark:border-gray-700">
        <GlowRing active={coachButtonGlows} rounded="lg" className="block h-full w-full">
          <CoachNavButton onOpen={onCoachOpen} />
        </GlowRing>
      </div>

      {/* CENTRE — D/W/M tabs (top) + coach comment (bottom) */}
      <div className="flex flex-1 flex-col justify-center min-w-0">
        <TimeViewTabs activeView={activeView} onViewChange={onViewChange} />
        <CoachComment />
      </div>

      {/* RIGHT — Menu button, full height, left separator */}
      <div className="w-14 shrink-0 border-l border-gray-200 dark:border-gray-700">
        <GlowRing active={menuButtonGlows} rounded="lg" className="block h-full w-full">
          <MenuNavButton onOpen={onMenuOpen} />
        </GlowRing>
      </div>
    </footer>
  );
}
