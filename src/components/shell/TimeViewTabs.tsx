import type { TimeView } from '../timeViews/TimeViewContainer';
import { GlowRing } from '../shared/GlowRing';
import { ONBOARDING_GLOW } from '../../constants/onboardingKeys';
import { useGlows } from '../../hooks/useOnboardingGlow';

interface TimeViewTabsProps {
  activeView: TimeView;
  onViewChange: (view: TimeView) => void;
}

const TABS: { view: TimeView; label: string }[] = [
  { view: 'day', label: 'D' },
  { view: 'week', label: 'W' },
  { view: 'explorer', label: 'M' },
];

export function TimeViewTabs({ activeView, onViewChange }: TimeViewTabsProps) {
  const weekViewGlows = useGlows(ONBOARDING_GLOW.WEEK_VIEW_NAV);
  const monthViewGlows = useGlows(ONBOARDING_GLOW.MONTH_VIEW_NAV);

  return (
    <div className="flex items-end gap-2 px-3 pt-2 pb-0">
      {TABS.map(({ view, label }) => (
        <GlowRing
          key={view}
          active={
            (view === 'week' && weekViewGlows) ||
            (view === 'explorer' && monthViewGlows)
          }
          className="flex-1"
        >
          <button
            type="button"
            onClick={() => onViewChange(view)}
            className={`flex h-8 w-full items-center justify-center rounded-t-full text-sm font-bold transition-colors
              ${activeView === view
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
          >
            {label}
          </button>
        </GlowRing>
      ))}
    </div>
  );
}
