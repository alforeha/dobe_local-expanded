import { useState } from 'react';
import type { PlannedEvent } from '../../../../../types';
import { CircumchanceTab } from './CircumchanceTab';
import { ScheduleRoomBody } from './ScheduleRoomBody';
import { ScheduleRoomSubHeader } from './ScheduleRoomSubHeader';
import type { FocusYardSubTab } from './ScheduleTabContent';
import { WorkLoadsTab } from './WorkLoadsTab';

interface FocusYardTabProps {
  activeTab: FocusYardSubTab;
  filteredRoutines: PlannedEvent[];
  routineFilter: string;
  onRoutineFilterChange: (val: string) => void;
  onAddRoutine: () => void;
  onEdit: (event: PlannedEvent) => void;
  onDelete: (event: PlannedEvent) => void;
  onExpandedChange?: (id: string | null) => void;
  onNavExpandedChange?: (isExpanded: boolean) => void;
}

export function FocusYardTab({
  activeTab,
  filteredRoutines,
  routineFilter,
  onRoutineFilterChange,
  onAddRoutine,
  onEdit,
  onDelete,
  onExpandedChange,
  onNavExpandedChange,
}: FocusYardTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (activeTab === 'bearing') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {!expandedId && (
          <ScheduleRoomSubHeader
            filterValue={routineFilter}
            onFilterChange={onRoutineFilterChange}
            onAddRoutine={onAddRoutine}
          />
        )}
        <ScheduleRoomBody
          events={filteredRoutines}
          onEdit={onEdit}
          onDelete={onDelete}
          onExpandedChange={(id) => {
            setExpandedId(id);
            onExpandedChange?.(id);
            onNavExpandedChange?.(id !== null);
          }}
        />
      </div>
    );
  }

  if (activeTab === 'workloads') {
    return <WorkLoadsTab onNavExpandedChange={onNavExpandedChange} />;
  }

  return <CircumchanceTab onNavExpandedChange={onNavExpandedChange} />;
}
