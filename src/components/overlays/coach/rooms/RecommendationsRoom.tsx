import { useState } from 'react';
import { LootDropBanner } from './LootDropBanner';
import { RecommendedTasksTab } from './RecommendedTasksTab';
import { RecommendedRoutinesTab } from './RecommendedRoutinesTab';
import { RecommendedGearTab } from './RecommendedGearTab';
import { RecommendedItemsTab } from './RecommendedItemsTab';
import { GlowRing } from '../../../shared/GlowRing';
import { IconDisplay } from '../../../shared/IconDisplay';
import { ONBOARDING_GLOW } from '../../../../constants/onboardingKeys';
import { useGlows } from '../../../../hooks/useOnboardingGlow';

type RecTab = 'Tasks' | 'Routines' | 'Gear' | 'Items';

const TAB_CONFIG: { tab: RecTab; iconKey: string; label: string }[] = [
  { tab: 'Tasks', iconKey: 'checklist-legacy', label: 'Tasks' },
  { tab: 'Routines', iconKey: 'routine', label: 'Routines' },
  { tab: 'Gear', iconKey: 'equipment', label: 'Gear' },
  { tab: 'Items', iconKey: 'inventory', label: 'Items' },
];

export function RecommendationsRoom() {
  const [activeTab, setActiveTab] = useState<RecTab>('Tasks');
  const [gearViewed, setGearViewed] = useState(false);
  const tasksTabGlows = useGlows(ONBOARDING_GLOW.RECOMMENDATIONS_TASKS);
  const routinesTabGlows = useGlows(ONBOARDING_GLOW.RECOMMENDATIONS_ROUTINES);

  function handleTabClick(tab: RecTab) {
    setActiveTab(tab);
    if (tab === 'Gear') setGearViewed(true);
  }

  const showGearBadge = !gearViewed;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-gray-200 px-4 py-2 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <h3 className="shrink-0 text-sm font-bold text-gray-900 dark:text-gray-100">
            Recommendations
          </h3>

          {showGearBadge && (
            <button
              type="button"
              onClick={() => handleTabClick('Gear')}
              className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              New gear
            </button>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {TAB_CONFIG.map(({ tab, iconKey, label }) => (
              <GlowRing
                key={tab}
                active={
                  (tab === 'Tasks' && tasksTabGlows) ||
                  (tab === 'Routines' && routinesTabGlows)
                }
                rounded="lg"
                className="inline-flex"
              >
                <button
                  type="button"
                  aria-label={label}
                  onClick={() => handleTabClick(tab)}
                  className={`flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  <IconDisplay iconKey={iconKey} size={16} className="h-4 w-4 object-contain" />
                  <span className="ml-2 hidden sm:inline">{label}</span>
                </button>
              </GlowRing>
            ))}
          </div>
        </div>
      </div>

      <LootDropBanner />

      <div className="flex-1 overflow-hidden">
        {activeTab === 'Tasks' && <RecommendedTasksTab />}
        {activeTab === 'Routines' && <RecommendedRoutinesTab />}
        {activeTab === 'Gear' && <RecommendedGearTab />}
        {activeTab === 'Items' && <RecommendedItemsTab />}
      </div>
    </div>
  );
}
