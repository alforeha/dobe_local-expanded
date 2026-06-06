import { useEffect, useState } from 'react';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { ScheduleRoomHeader } from './ScheduleRoomHeader';
import { RoutinePopup } from './RoutinePopup';
import { OneOffEventPopup } from './OneOffEventPopup';
import { EventsTabContent } from './EventsTabContent';
import { LeaguesTabContent } from './LeaguesTabContent';
import { ScheduleTabContent } from './ScheduleTabContent';
import { isOneOffEvent } from '../../../../../utils/isOneOffEvent';
import type { PlannedEvent } from '../../../../../types';
import { autoCompleteSystemTask } from '../../../../../engine/resourceEngine';
import type { ResourceType } from '../../../../../types/resource';

type ScheduleTab = 'schedule' | 'events' | 'leagues';

type PopupState =
  | { mode: 'add-routine' }
  | { mode: 'edit-routine'; routine: PlannedEvent }
  | { mode: 'add-event' }
  | { mode: 'edit-event'; event: PlannedEvent }
  | null;

interface ScheduleRoomProps {
  onGoToResource?: (resourceId: string, resourceType: ResourceType) => void;
  onExpandedChange?: (isExpanded: boolean) => void;
}

export function ScheduleRoom({ onGoToResource, onExpandedChange }: ScheduleRoomProps) {
  const [tab, setTab] = useState<ScheduleTab>('schedule');
  const [eventFilter, setEventFilter] = useState('');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [popup, setPopup] = useState<PopupState>(null);
  const plannedEvents = useScheduleStore((s) => s.plannedEvents);
  const removePlannedEvent = useScheduleStore((s) => s.removePlannedEvent);

  useEffect(() => {
    autoCompleteSystemTask('task-sys-explore-schedule-room');
  }, []);

  useEffect(() => {
    setTimeout(() => {
      setExpandedRowId(null);
    }, 0);
  }, [tab]);

  useEffect(() => {
    onExpandedChange?.(Boolean(expandedRowId));
  }, [expandedRowId, onExpandedChange]);

  const allOneOffs = Object.values(plannedEvents).filter((e) => isOneOffEvent(e));
  const filteredOneOffs = eventFilter
    ? allOneOffs.filter((e) => e.name.toLowerCase().includes(eventFilter.toLowerCase()))
    : allOneOffs;

  function handleEdit(event: PlannedEvent) {
    if (isOneOffEvent(event)) {
      setPopup({ mode: 'edit-event', event });
    } else {
      setPopup({ mode: 'edit-routine', routine: event });
    }
  }

  function handleDelete(event: PlannedEvent) {
    removePlannedEvent(event.id);
    setExpandedRowId((current) => (current === event.id ? null : current));
  }

  return (
    <div className="flex flex-col h-full">
      <ScheduleRoomHeader activeTab={tab} onTabChange={setTab} />
      {tab === 'schedule' && <ScheduleTabContent />}
      {tab === 'events' && (
        <EventsTabContent
          filteredOneOffs={filteredOneOffs}
          eventFilter={eventFilter}
          onEventFilterChange={setEventFilter}
          onAddEvent={() => setPopup({ mode: 'add-event' })}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onExpandedChange={setExpandedRowId}
          expandedRowId={expandedRowId}
          onGoToResource={onGoToResource}
        />
      )}
      {tab === 'leagues' && <LeaguesTabContent />}

      {(popup?.mode === 'add-routine' || popup?.mode === 'edit-routine') && (
        <RoutinePopup
          editRoutine={popup.mode === 'edit-routine' ? popup.routine : null}
          onClose={() => setPopup(null)}
        />
      )}
      {(popup?.mode === 'add-event' || popup?.mode === 'edit-event') && (
        <OneOffEventPopup
          editEvent={popup.mode === 'edit-event' ? popup.event : null}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}
