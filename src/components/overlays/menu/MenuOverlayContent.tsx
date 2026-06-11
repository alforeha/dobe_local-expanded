import { WorldView } from './rooms/WorldView/WorldView';
import { GoalRoom } from './rooms/GoalRoom/GoalRoom';
import { ScheduleRoom } from './rooms/ScheduleRoom/ScheduleRoom';
import { ResourceRoom } from './rooms/ResourceRoom/ResourceRoom';
import { QuickActionRoom } from './rooms/QuickActionRoom/QuickActionRoom';
import type { ResourceType } from '../../../types/resource';

type MenuRoom = 'world' | 'goal' | 'schedule' | 'resource' | 'quickaction';

interface MenuOverlayContentProps {
  activeRoom: MenuRoom;
  onNavigate: (room: MenuRoom) => void;
  onGoToDay: (dateIso: string) => void;
  onScheduleExpandedChange?: (isExpanded: boolean) => void;
  onResourceOverlayActiveChange?: (active: boolean) => void;
  onWorldNavHiddenChange: (hidden: boolean) => void;
  onGoalNavHiddenChange: (hidden: boolean) => void;
}

export function MenuOverlayContent({
  activeRoom,
  onNavigate,
  onGoToDay,
  onScheduleExpandedChange,
  onResourceOverlayActiveChange,
  onWorldNavHiddenChange,
  onGoalNavHiddenChange,
}: MenuOverlayContentProps) {
  const handleGoToResource = (_resourceId: string, _resourceType: ResourceType) => {
    onNavigate('resource');
  };

  return (
    <div className="flex-1 overflow-hidden bg-white dark:bg-gray-900">
      {activeRoom === 'world' && (
        <WorldView
          onGoToDay={onGoToDay}
          onWorldNavHiddenChange={onWorldNavHiddenChange}
        />
      )}
      {activeRoom === 'goal' && <GoalRoom onNavHiddenChange={onGoalNavHiddenChange} />}
      {activeRoom === 'schedule' && (
        <ScheduleRoom
          onGoToResource={handleGoToResource}
          onExpandedChange={onScheduleExpandedChange}
        />
      )}
      {activeRoom === 'resource' && <ResourceRoom onOverlayActiveChange={onResourceOverlayActiveChange} />}
      {activeRoom === 'quickaction' && <QuickActionRoom />}
    </div>
  );
}
