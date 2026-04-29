import { WorldView } from './rooms/WorldView/WorldView';
import { GoalRoom } from './rooms/GoalRoom/GoalRoom';
import { TaskRoom } from './rooms/TaskRoom/TaskRoom';
import { ScheduleRoom } from './rooms/ScheduleRoom/ScheduleRoom';
import { ResourceRoom } from './rooms/ResourceRoom/ResourceRoom';
import { QuickActionRoom } from './rooms/QuickActionRoom/QuickActionRoom';

type MenuRoom = 'world' | 'goal' | 'task' | 'schedule' | 'resource' | 'quickaction';

interface MenuOverlayContentProps {
  activeRoom: MenuRoom;
  onNavigate: (room: MenuRoom) => void;
  onGoToDay: (dateIso: string) => void;
  onResourceOverlayActiveChange?: (active: boolean) => void;
}

export function MenuOverlayContent({ activeRoom, onNavigate, onGoToDay, onResourceOverlayActiveChange }: MenuOverlayContentProps) {
  return (
    <div className="flex-1 overflow-hidden bg-white dark:bg-gray-900">
      {activeRoom === 'world' && <WorldView onGoToDay={onGoToDay} />}
      {activeRoom === 'goal' && <GoalRoom />}
      {activeRoom === 'task' && (
        <TaskRoom onGoToResource={(_id, _type) => onNavigate('resource')} />
      )}
      {activeRoom === 'schedule' && <ScheduleRoom />}
      {activeRoom === 'resource' && <ResourceRoom onOverlayActiveChange={onResourceOverlayActiveChange} />}
      {activeRoom === 'quickaction' && <QuickActionRoom />}
    </div>
  );
}
