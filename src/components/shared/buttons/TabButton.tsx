interface TabButtonProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export function TabButton({ label, active = false, onClick, disabled = false }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors
        ${active
          ? 'bg-purple-600 text-white'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {label}
    </button>
  );
}
