import type { ReactNode } from 'react';

interface IconButtonProps {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  className?: string;
  active?: boolean;
  disabled?: boolean;
}

export function IconButton({
  children,
  onClick,
  label,
  className = '',
  active = false,
  disabled = false,
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center rounded-full p-2 transition-colors
        ${active ? 'bg-purple-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        ${className}`}
    >
      {children}
    </button>
  );
}
