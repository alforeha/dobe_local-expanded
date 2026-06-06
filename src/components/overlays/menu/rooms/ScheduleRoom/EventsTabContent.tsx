import { useState } from 'react';
import type { PlannedEvent } from '../../../../../types';
import type { ResourceType } from '../../../../../types/resource';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { ResourceEventsTab } from './ResourceEventsTab';
import { ScheduleRoomBody } from './ScheduleRoomBody';

type EventsView = 'oneoffs' | 'recurrence';

const EVENTS_VIEWS: Array<{ view: EventsView; iconKey: string; label: string }> = [
  { view: 'oneoffs', iconKey: 'schedule-tab-events', label: 'One-Offs' },
  { view: 'recurrence', iconKey: 'schedule-tab-resources', label: 'Resource Recurrence' },
];

interface EventsTabContentProps {
  filteredOneOffs: PlannedEvent[];
  eventFilter: string;
  onEventFilterChange: (value: string) => void;
  onAddEvent: () => void;
  onEdit: (event: PlannedEvent) => void;
  onDelete: (event: PlannedEvent) => void;
  onExpandedChange?: (id: string | null) => void;
  expandedRowId: string | null;
  onGoToResource?: (resourceId: string, resourceType: ResourceType) => void;
}

export function EventsTabContent({
  filteredOneOffs,
  eventFilter,
  onEventFilterChange,
  onAddEvent,
  onEdit,
  onDelete,
  onExpandedChange,
  expandedRowId,
  onGoToResource,
}: EventsTabContentProps) {
  const [activeView, setActiveView] = useState<EventsView>('oneoffs');

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-4 pb-2 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2 py-2">
          {EVENTS_VIEWS.map(({ view, iconKey, label }) => (
            <button
              key={view}
              type="button"
              onClick={() => setActiveView(view)}
              aria-label={label}
              title={label}
              className={`flex h-7 w-8 items-center justify-center rounded-full transition-colors ${
                activeView === view
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <IconDisplay iconKey={iconKey} size={18} className="leading-none" />
            </button>
          ))}
        </div>
      </div>

      {activeView === 'oneoffs' && (
        <>
          {!expandedRowId && (
            <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
              <input
                type="text"
                value={eventFilter}
                onChange={(e) => onEventFilterChange(e.target.value)}
                placeholder="Filter..."
                className="flex-1 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-300"
              />
              <button
                type="button"
                onClick={onAddEvent}
                className="text-xs text-blue-500 hover:text-blue-700 font-medium shrink-0 whitespace-nowrap"
              >
                + Event
              </button>
            </div>
          )}
          <ScheduleRoomBody
            events={filteredOneOffs}
            onEdit={onEdit}
            onDelete={onDelete}
            onExpandedChange={onExpandedChange}
          />
        </>
      )}

      {activeView === 'recurrence' && <ResourceEventsTab onGoToResource={onGoToResource} />}
    </div>
  );
}