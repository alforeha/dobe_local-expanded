import { useMemo } from 'react';
import { PopupShell } from '../../shared/popups/PopupShell';
import { IconDisplay } from '../../shared/IconDisplay';
import { useResourceStore } from '../../../stores/useResourceStore';
import { format } from '../../../utils/dateUtils';
import { getResourceIndicatorsForDate } from '../../../utils/resourceSchedule';

interface DayResourcePopupProps {
  date: Date;
  onClose: () => void;
  onOpenResource?: (resourceId: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  contact: 'Contact',
  home: 'Home',
  vehicle: 'Vehicle',
  account: 'Account',
  inventory: 'Inventory',
  doc: 'Doc',
};

export function DayResourcePopup({ date, onClose, onOpenResource }: DayResourcePopupProps) {
  const resourceMap = useResourceStore((s) => s.resources);
  const resources = useMemo(() => Object.values(resourceMap), [resourceMap]);
  const dateISO = format(date, 'iso');
  const indicators = useMemo(
    () => getResourceIndicatorsForDate(dateISO, resources),
    [dateISO, resources],
  );

  return (
    <PopupShell title="Resource Reminders" onClose={onClose}>
      {indicators.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">No resource reminders for this day.</p>
      ) : (
        <div className="space-y-2">
          {indicators.map((indicator, index) => {
            const resource = resourceMap[indicator.resourceId];
            if (!resource) return null;

            return (
              <button
                key={`${indicator.resourceId}:${indicator.iconKey}:${indicator.label}:${index}`}
                type="button"
                onClick={() => {
                  onOpenResource?.(indicator.resourceId);
                  onClose();
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/60"
              >
                <IconDisplay iconKey={indicator.iconKey} size={20} className="h-5 w-5 shrink-0 object-contain" alt="" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{resource.name}</div>
                  <div className="truncate text-xs text-gray-500 dark:text-gray-400">{indicator.label}</div>
                </div>
                <span className="shrink-0 rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:border-gray-600 dark:text-gray-300">
                  {TYPE_LABELS[indicator.resourceType] ?? indicator.resourceType}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </PopupShell>
  );
}
