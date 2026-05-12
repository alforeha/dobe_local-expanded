import { useEffect, useMemo, useState } from 'react';
import type { PlannedEvent } from '../../../../../types';
import { PlannedEventBlock } from './PlannedEventBlock';

interface ScheduleRoomBodyProps {
  events: PlannedEvent[];
  onEdit: (event: PlannedEvent) => void;
  onDelete: (event: PlannedEvent) => void;
  onExpandedChange?: (id: string | null) => void;
}

export function ScheduleRoomBody({ events, onEdit, onDelete, onExpandedChange }: ScheduleRoomBodyProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    onExpandedChange?.(expandedId);
  }, [expandedId, onExpandedChange]);

  useEffect(() => {
    if (expandedId && !events.some((event) => event.id === expandedId)) {
      setTimeout(() => {
        setExpandedId(null);
      }, 0);
    }
  }, [events, expandedId]);

  const visibleEvents = useMemo(
    () => events.filter((event) => !expandedId || event.id === expandedId),
    [events, expandedId],
  );

  if (events.length === 0) {
    return (
      <p className="text-center text-gray-400 text-sm py-10">No events or routines yet.</p>
    );
  }

  return (
    <div className={expandedId ? 'flex-1 overflow-hidden px-4 py-3' : 'flex-1 overflow-y-auto px-4 py-3 space-y-2'}>
      {visibleEvents.map((e) => (
        <PlannedEventBlock
          key={e.id}
          event={e}
          onEdit={onEdit}
          onDelete={onDelete}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          soloExpanded={Boolean(expandedId)}
        />
      ))}
    </div>
  );
}
