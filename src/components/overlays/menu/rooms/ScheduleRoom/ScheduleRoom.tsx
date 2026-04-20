import { useEffect, useState } from 'react';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { ScheduleRoomHeader } from './ScheduleRoomHeader';
import { ScheduleRoomSubHeader } from './ScheduleRoomSubHeader';
import { ScheduleRoomBody } from './ScheduleRoomBody';
import { LeaguesTabStub } from './LeaguesTabStub';
import { ResourceEventsTab } from './ResourceEventsTab';
import { RoutinePopup } from './RoutinePopup';
import { OneOffEventPopup } from './OneOffEventPopup';
import { isOneOffEvent } from '../../../../../utils/isOneOffEvent';
import type { PlannedEvent } from '../../../../../types';
import { autoCompleteSystemTask } from '../../../../../engine/resourceEngine';

type ScheduleTab = 'routines' | 'events' | 'resources' | 'leagues';

type PopupState =
  | { mode: 'add-routine' }
  | { mode: 'edit-routine'; routine: PlannedEvent }
  | { mode: 'add-event' }
  | { mode: 'edit-event'; event: PlannedEvent }
  | null;

export function ScheduleRoom() {
  const [tab, setTab] = useState<ScheduleTab>('routines');
  const [routineFilter, setRoutineFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [popup, setPopup] = useState<PopupState>(null);
  const plannedEvents = useScheduleStore((s) => s.plannedEvents);

  useEffect(() => {
    autoCompleteSystemTask('task-sys-explore-schedule-room');
  }, []);

  const allRoutines = Object.values(plannedEvents).filter((e) => !isOneOffEvent(e));
  const filteredRoutines = routineFilter
    ? allRoutines.filter((e) => e.name.toLowerCase().includes(routineFilter.toLowerCase()))
    : allRoutines;

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

  return (
    <div className="flex flex-col h-full">
      <ScheduleRoomHeader activeTab={tab} onTabChange={setTab} />
      {tab === 'routines' && (
        <>
          <ScheduleRoomSubHeader
            filterValue={routineFilter}
            onFilterChange={setRoutineFilter}
            onAddRoutine={() => setPopup({ mode: 'add-routine' })}
          />
          <ScheduleRoomBody events={filteredRoutines} onEdit={handleEdit} />
        </>
      )}
      {tab === 'events' && (
        <>
          <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <input
              type="text"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              placeholder="Filter..."
              className="flex-1 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-300"
            />
            <button
              type="button"
              onClick={() => setPopup({ mode: 'add-event' })}
              className="text-xs text-blue-500 hover:text-blue-700 font-medium shrink-0 whitespace-nowrap"
            >
              + Event
            </button>
          </div>
          <ScheduleRoomBody events={filteredOneOffs} onEdit={handleEdit} />
        </>
      )}
      {tab === 'resources' && <ResourceEventsTab />}
      {tab === 'leagues' && <LeaguesTabStub />}

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
