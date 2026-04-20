import { useMemo } from 'react';
import { STARTER_ACT_IDS } from '../coach/StarterQuestLibrary';
import { ONBOARDING_GLOW, type OnboardingGlowKey } from '../constants/onboardingKeys';
import { useProgressionStore } from '../stores/useProgressionStore';

const QUEST_GLOWS: Record<number, OnboardingGlowKey[]> = {
  0: [ONBOARDING_GLOW.WELCOME_EVENT_CARD],
  1: [
    ONBOARDING_GLOW.COACH_BUTTON,
    ONBOARDING_GLOW.RECOMMENDATIONS_NAV,
    ONBOARDING_GLOW.RECOMMENDATIONS_TASKS,
    ONBOARDING_GLOW.RECOMMENDATIONS_ROUTINES,
    ONBOARDING_GLOW.WEEK_VIEW_NAV,
    ONBOARDING_GLOW.MONTH_VIEW_NAV,
  ],
  2: [
    ONBOARDING_GLOW.MENU_BUTTON,
    ONBOARDING_GLOW.TASK_ROOM_NAV,
    ONBOARDING_GLOW.TASK_FAVOURITE_STAR,
    ONBOARDING_GLOW.FAVOURITE_ACTION,
    ONBOARDING_GLOW.SCHEDULE_ROOM_NAV,
    ONBOARDING_GLOW.RESOURCES_ROOM_NAV,
    ONBOARDING_GLOW.LUCKY_DICE,
  ],
  3: [
    ONBOARDING_GLOW.PROFILE_BUTTON,
    ONBOARDING_GLOW.BADGE_ROOM_NAV,
    ONBOARDING_GLOW.EQUIPMENT_ROOM_NAV,
    ONBOARDING_GLOW.ADVENTURES_TAB,
  ],
};

export function useOnboardingGlow(): Set<OnboardingGlowKey> {
  const acts = useProgressionStore((state) => state.acts);

  return useMemo(() => {
    const onboardingAct = acts[STARTER_ACT_IDS.onboarding];
    if (!onboardingAct || onboardingAct.completionState === 'complete') {
      return new Set<OnboardingGlowKey>();
    }

    const onboardingChain = onboardingAct.chains[0];
    if (!onboardingChain) {
      return new Set<OnboardingGlowKey>();
    }

    const activeQuestIndex = onboardingChain.quests.findIndex(
      (quest) => quest.completionState === 'active',
    );

    if (activeQuestIndex === -1) {
      return new Set<OnboardingGlowKey>();
    }

    return new Set(QUEST_GLOWS[activeQuestIndex] ?? []);
  }, [acts]);
}

export function useGlows(key: string): boolean {
  const glowing = useOnboardingGlow();
  return glowing.has(key as OnboardingGlowKey);
}
