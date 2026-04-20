import { useUserStore } from '../../stores/useUserStore';
import { IconDisplay } from '../shared/IconDisplay';

interface ProfileNavButtonProps {
  onOpen: () => void;
}

export function ProfileNavButton({ onOpen }: ProfileNavButtonProps) {
  const profileIcon = useUserStore((s) => s.user?.system.icon ?? 'user-default');

  return (
    <button
      type="button"
      aria-label="Open profile"
      onClick={onOpen}
      className="flex h-full w-12 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-sm font-bold text-purple-700 transition-colors hover:bg-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:hover:bg-purple-900/60"
    >
      <IconDisplay iconKey={profileIcon} size={32} className="h-8 w-8 object-contain" alt="Profile" />
    </button>
  );
}
