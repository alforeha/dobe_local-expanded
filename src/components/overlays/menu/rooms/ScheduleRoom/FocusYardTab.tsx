import type { PlannedEvent } from '../../../../../types';
import { ScheduleRoomBody } from './ScheduleRoomBody';
import { ScheduleRoomSubHeader } from './ScheduleRoomSubHeader';

interface FocusYardTabProps {
  activeTab: 'bearing' | 'workloads';
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
  if (activeTab === 'bearing') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ScheduleRoomSubHeader
          filterValue={routineFilter}
          onFilterChange={onRoutineFilterChange}
          onAddRoutine={onAddRoutine}
        />
        <ScheduleRoomBody
          events={filteredRoutines}
          onEdit={onEdit}
          onDelete={onDelete}
          onExpandedChange={(id) => {
            onExpandedChange?.(id);
            onNavExpandedChange?.(id !== null);
          }}
        />
      </div>
    );
  }

  return <div className="px-4 py-4 text-sm text-gray-700 dark:text-gray-200">Work Loads</div>;
}