import type { PlannedEvent } from '../../../../../types';
import { PlannedEventBlock } from './PlannedEventBlock';

interface ScheduleRoomBodyProps {
  events: PlannedEvent[];
  onEdit: (event: PlannedEvent) => void;
}

export function ScheduleRoomBody({ events, onEdit }: ScheduleRoomBodyProps) {
  if (events.length === 0) {
    return (
      <p className="text-center text-gray-400 text-sm py-10">No events or routines yet.</p>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {events.map((e) => (
        <PlannedEventBlock key={e.id} event={e} onEdit={onEdit} />
      ))}
    </div>
  );
}
