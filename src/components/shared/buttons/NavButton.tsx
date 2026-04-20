import type { ReactNode } from 'react';

interface NavButtonProps {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  className?: string;
}

export function NavButton({ children, onClick, label, className = '' }: NavButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex items-center justify-center p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${className}`}
    >
      {children}
    </button>
  );
}
