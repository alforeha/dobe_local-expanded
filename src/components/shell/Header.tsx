import { useState, useEffect, useRef } from 'react';
import { useUserStore } from '../../stores/useUserStore';
import { xpProgress } from '../../engine/awardPipeline';
import { ProfileNavButton } from './ProfileNavButton';
import { XPBar } from './XPBar';
import { StatRow } from './StatRow';
import { BoostRow } from './BoostRow';
import { FloatingDelta } from './FloatingDelta';
import { GlowRing } from '../shared/GlowRing';
import { ONBOARDING_GLOW } from '../../constants/onboardingKeys';
import { useGlows } from '../../hooks/useOnboardingGlow';

interface HeaderProps {
  onProfileOpen: () => void;
}

export interface DeltaItem {
  id: string;
  label: string;
}

export function Header({ onProfileOpen }: HeaderProps) {
  const user = useUserStore((s) => s.user);
  const profileButtonGlows = useGlows(ONBOARDING_GLOW.PROFILE_BUTTON);
  const [deltas, setDeltas] = useState<DeltaItem[]>([]);
  const prevXP = useRef<number | null>(null);

  const xp = user?.progression?.stats?.xp ?? 0;
  const { level, xpSinceLastLevel, xpForThisLevel } = xpProgress(xp);

  // Detect XP changes and fire floating delta
  useEffect(() => {
    if (prevXP.current !== null && prevXP.current !== xp) {
      const diff = xp - prevXP.current;
      const id = `xp-${Date.now()}`;
      setDeltas((d) => [...d, { id, label: `${diff > 0 ? '+' : ''}${diff} XP` }]);
    }
    prevXP.current = xp;
  }, [xp]);

  const dismissDelta = (id: string) => {
    setDeltas((d) => d.filter((item) => item.id !== id));
  };

  const handleProfileOpen = () => {
    onProfileOpen();
  };

  return (
    <header className="relative flex shrink-0 items-stretch gap-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2">
      <GlowRing active={profileButtonGlows} rounded="lg" className="flex shrink-0 self-stretch">
        <ProfileNavButton onOpen={handleProfileOpen} />
      </GlowRing>

      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <XPBar
          displayName={user?.system?.displayName ?? '—'}
          level={level}
          current={xpSinceLastLevel}
          max={xpForThisLevel}
        />
        <StatRow />
        <BoostRow />
      </div>


      {deltas.map((d) => (
        <FloatingDelta key={d.id} label={d.label} onDismiss={() => dismissDelta(d.id)} />
      ))}
    </header>
  );
}
