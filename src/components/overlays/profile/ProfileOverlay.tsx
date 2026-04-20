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
      {/* Close button — sits above both halves */}
      <button
        type="button"
        className="absolute right-4 top-4 z-50 text-gray-400 hover:text-gray-600 text-xl"
        onClick={onClose}
        aria-label="Close profile"
      >
        ✕
      </button>

      {/* TOP HALF — avatar area with 4 corner buttons */}
      <ProfileTopSection onNav={setActiveRoom} />

      {/* BOTTOM HALF — active room content */}
      <div className="flex-1 overflow-hidden">
        {activeRoom === 'stats' && (
          <StatGroupRoom onTalentTree={() => setActiveRoom('talent')} />
        )}
        {activeRoom === 'preferences' && <PreferencesRoom />}
        {activeRoom === 'storage' && <StorageRoom />}
        {activeRoom === 'badges' && <BadgeRoom />}
        {activeRoom === 'equipment' && <EquipmentRoom />}
        {activeRoom === 'talent' && <TalentTreeRoom onBack={() => setActiveRoom('stats')} />}
      </div>
    </div>
  );
}

