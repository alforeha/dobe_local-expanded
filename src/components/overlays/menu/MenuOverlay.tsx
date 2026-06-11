import { useState } from 'react';
import { MenuOverlayNav } from './MenuOverlayNav';
import { MenuOverlayContent } from './MenuOverlayContent';

type MenuRoom = 'world' | 'goal' | 'schedule' | 'resource' | 'quickaction';

interface MenuOverlayProps {
  onClose: () => void;
  onGoToDay: (dateIso: string) => void;
  initialRoom?: MenuRoom;
}

export function MenuOverlay({ onClose, onGoToDay, initialRoom = 'quickaction' }: MenuOverlayProps) {
  const [activeRoom, setActiveRoom] = useState<MenuRoom>(initialRoom);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const [resourceOverlayActive, setResourceOverlayActive] = useState(false);
  const [worldNavHidden, setWorldNavHidden] = useState(false);
  const [goalNavHidden, setGoalNavHidden] = useState(false);

  const handleNavigate = (room: MenuRoom) => {
    setActiveRoom(room);
    if (room !== 'schedule') {
      setScheduleExpanded(false);
    }
    if (room !== 'resource') {
      setResourceOverlayActive(false);
    }
  };

  const showNav = !scheduleExpanded && !(activeRoom === 'resource' && resourceOverlayActive) && !worldNavHidden && !goalNavHidden;

  return (
    <div className="flex h-full">
      <MenuOverlayContent
        activeRoom={activeRoom}
        onNavigate={handleNavigate}
        onGoToDay={onGoToDay}
        onScheduleExpandedChange={setScheduleExpanded}
        onResourceOverlayActiveChange={setResourceOverlayActive}
        onWorldNavHiddenChange={setWorldNavHidden}
        onGoalNavHiddenChange={setGoalNavHidden}
      />
      {showNav && (
        <MenuOverlayNav
          activeRoom={activeRoom}
          onNavigate={handleNavigate}
          onClose={onClose}
          collapsed={navCollapsed}
          onToggleCollapse={() => setNavCollapsed((c) => !c)}
        />
      )}
    </div>
  );
}
