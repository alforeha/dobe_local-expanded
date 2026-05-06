import { WorldView } from './rooms/WorldView/WorldView';
import { GoalRoom } from './rooms/GoalRoom/GoalRoom';
import { TaskRoom } from './rooms/TaskRoom/TaskRoom';
import { ScheduleRoom } from './rooms/ScheduleRoom/ScheduleRoom';
import { ResourceRoom } from './rooms/ResourceRoom/ResourceRoom';
import { QuickActionRoom } from './rooms/QuickActionRoom/QuickActionRoom';
import type { ResourceType } from '../../../types/resource';

type MenuRoom = 'world' | 'goal' | 'task' | 'schedule' | 'resource' | 'quickaction';

interface MenuOverlayContentProps {
  activeRoom: MenuRoom;
  onNavigate: (room: MenuRoom) => void;
  onGoToDay: (dateIso: string) => void;
  onResourceOverlayActiveChange?: (active: boolean) => void;
}

export function MenuOverlayContent({ activeRoom, onNavigate, onGoToDay, onResourceOverlayActiveChange }: MenuOverlayContentProps) {
  const handleGoToResource = (_resourceId: string, _resourceType: ResourceType) => {
    onNavigate('resource');
  };

  return (
    <div className="flex-1 overflow-hidden bg-white dark:bg-gray-900">
      {activeRoom === 'world' && <WorldView onGoToDay={onGoToDay} />}
      {activeRoom === 'goal' && <GoalRoom />}
      {activeRoom === 'task' && (
        <TaskRoom onGoToResource={handleGoToResource} />
      )}
      {activeRoom === 'schedule' && <ScheduleRoom onGoToResource={handleGoToResource} />}
      {activeRoom === 'resource' && <ResourceRoom onOverlayActiveChange={onResourceOverlayActiveChange} />}
      {activeRoom === 'quickaction' && <QuickActionRoom />}
    </div>
  );
}
