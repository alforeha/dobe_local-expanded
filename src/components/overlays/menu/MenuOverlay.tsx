import { useState } from 'react';
import { MenuOverlayNav } from './MenuOverlayNav';
import { MenuOverlayContent } from './MenuOverlayContent';

type MenuRoom = 'world' | 'goal' | 'task' | 'schedule' | 'resource' | 'quickaction';

interface MenuOverlayProps {
  onClose: () => void;
  onGoToDay: (dateIso: string) => void;
  initialRoom?: MenuRoom;
}

export function MenuOverlay({ onClose, onGoToDay, initialRoom = 'quickaction' }: MenuOverlayProps) {
  const [activeRoom, setActiveRoom] = useState<MenuRoom>(initialRoom);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [resourceOverlayActive, setResourceOverlayActive] = useState(false);

  const handleNavigate = (room: MenuRoom) => {
    setActiveRoom(room);
    setNavCollapsed(true);
    if (room !== 'resource') {
      setResourceOverlayActive(false);
    }
  };

  const showNav = !(activeRoom === 'resource' && resourceOverlayActive);

  return (
    <div className="flex h-full">
      <MenuOverlayContent
        activeRoom={activeRoom}
        onNavigate={handleNavigate}
        onGoToDay={onGoToDay}
        onResourceOverlayActiveChange={setResourceOverlayActive}
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
