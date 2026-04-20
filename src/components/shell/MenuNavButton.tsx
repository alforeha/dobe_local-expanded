import menuButtonSrc from '../../assets/icons/menu-button.svg';

interface MenuNavButtonProps {
  onOpen: () => void;
}

export function MenuNavButton({ onOpen }: MenuNavButtonProps) {
  return (
    <button
      type="button"
      aria-label="Open menu"
      onClick={onOpen}
      className="flex h-full w-full items-center justify-center bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
    >
      <img src={menuButtonSrc} alt="" aria-hidden="true" className="h-8 w-8 object-contain" />
    </button>
  );
}
