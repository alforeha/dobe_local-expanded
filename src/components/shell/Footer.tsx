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
    <footer className="relative z-30 shrink-0 flex h-[4.5rem] items-stretch overflow-visible border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 sm:h-20">
      {/* LEFT — Coach button, full height, right separator */}
      <div className="w-14 shrink-0 border-r border-gray-200 dark:border-gray-700">
        <GlowRing active={coachButtonGlows} rounded="lg" className="block h-full w-full">
          <CoachNavButton onOpen={onCoachOpen} />
        </GlowRing>
      </div>

      {/* CENTRE — D/W/M tabs (top) + coach comment (bottom) */}
      <div className="relative flex min-w-0 flex-1 flex-col justify-end pt-3 sm:pt-[18px]">
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
