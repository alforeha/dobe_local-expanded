import { useUserStore } from '../../../../../../stores/useUserStore';
import { removeManualGTDItem, completeManualGTDItem } from '../../../../../../engine/listsEngine';
import type { GTDItem } from '../../../../../../types';
import { GlowRing } from '../../../../../shared/GlowRing';
import { ONBOARDING_GLOW } from '../../../../../../constants/onboardingKeys';
import { useGlows } from '../../../../../../hooks/useOnboardingGlow';

interface GTDManualBlockProps {
  item: GTDItem;
}

export function GTDManualBlock({ item }: GTDManualBlockProps) {
  const user = useUserStore((s) => s.user);
  const gtdItemGlows = useGlows(ONBOARDING_GLOW.GTD_ITEM);

  function handleComplete() {
    if (!user) return;
    completeManualGTDItem(item.id, user);
  }

  function handleDelete() {
    if (!user) return;
    removeManualGTDItem(item.id, user);
  }

  return (
    <GlowRing active={gtdItemGlows} rounded="lg" className="block">
      <div className="flex items-start gap-3 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg">
        <span className="w-2 h-2 rounded-full shrink-0 mt-1.5 bg-blue-300" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-700 dark:text-gray-200 truncate">{item.title}</p>
          {item.note && (
            <p className="text-xs text-gray-400 truncate mt-0.5">{item.note}</p>
          )}
          {item.dueDate && (
            <p className="text-xs text-gray-400 mt-0.5">Due: {item.dueDate}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            type="button"
            onClick={handleComplete}
            title="Complete"
            className="text-xs text-white px-1.5 py-0.5 rounded bg-green-500 hover:bg-green-600"
          >
            OK
          </button>
          <button
            type="button"
            onClick={handleDelete}
            title="Delete"
            className="text-xs text-gray-400 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            X
          </button>
        </div>
      </div>
    </GlowRing>
  );
}
