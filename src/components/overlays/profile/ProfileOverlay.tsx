import { useState } from 'react';
import { ProfileTopSection } from './ProfileTopSection';
import { StatGroupRoom } from './rooms/StatGroupRoom/StatGroupRoom';
import { PreferencesRoom } from './rooms/PreferencesRoom/PreferencesRoom';
import { StorageRoom } from './rooms/StorageRoom';
import { BadgeRoom } from './rooms/BadgeRoom/BadgeRoom';
import { EquipmentRoom } from './rooms/EquipmentRoom/EquipmentRoom';
import { TalentTreeRoom } from './rooms/TalentTreeRoom/TalentTreeRoom';

export type ProfileRoom = 'stats' | 'preferences' | 'storage' | 'badges' | 'equipment' | 'talent';

interface ProfileOverlayProps {
  onClose: () => void;
}

export function ProfileOverlay({ onClose }: ProfileOverlayProps) {
  const [activeRoom, setActiveRoom] = useState<ProfileRoom>('stats');

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* TOP HALF — avatar area with 4 corner buttons */}
      <ProfileTopSection activeRoom={activeRoom} onNav={setActiveRoom} onClose={onClose} />

      {/* BOTTOM HALF — active room content */}
      <div className="flex-1 overflow-hidden">
        {activeRoom === 'stats' && (
          <StatGroupRoom onTalentTree={() => setActiveRoom('talent')} />
        )}
        {activeRoom === 'preferences' && <PreferencesRoom onBack={() => setActiveRoom('stats')} />}
        {activeRoom === 'storage' && <StorageRoom onBack={() => setActiveRoom('stats')} />}
        {activeRoom === 'badges' && <BadgeRoom onBack={() => setActiveRoom('stats')} />}
        {activeRoom === 'equipment' && <EquipmentRoom onBack={() => setActiveRoom('stats')} />}
        {activeRoom === 'talent' && <TalentTreeRoom onBack={() => setActiveRoom('stats')} />}
      </div>
    </div>
  );
}

