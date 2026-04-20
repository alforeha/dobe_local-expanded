type ProfileRoom = 'stats' | 'preferences' | 'storage' | 'badges' | 'equipment' | 'talent';

interface FabProps {
  label: string;
  icon: string;
  onClick: () => void;
}

function Fab({ label, icon, onClick }: FabProps) {
  return (
    <button
      type="button"
      className="flex flex-col items-center gap-1"
      onClick={onClick}
      aria-label={label}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white dark:bg-gray-700 shadow-md text-xl">
        {icon}
      </span>
      <span className="text-xs text-gray-500">{label}</span>
    </button>
  );
}

interface ProfileFloatingActionsProps {
  onNav: (room: ProfileRoom) => void;
}

export function ProfileFloatingActions({ onNav }: ProfileFloatingActionsProps) {
  return (
    <div className="absolute right-4 top-1/4 flex flex-col gap-4">
      <Fab label="Storage" icon="💾" onClick={() => onNav('storage')} />
      <Fab label="Badges" icon="🏅" onClick={() => onNav('badges')} />
      <Fab label="Gear" icon="🎒" onClick={() => onNav('equipment')} />
      <Fab label="Prefs" icon="⚙️" onClick={() => onNav('preferences')} />
    </div>
  );
}
