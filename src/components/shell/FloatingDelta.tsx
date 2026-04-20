import { useEffect } from 'react';

interface FloatingDeltaProps {
  label: string;
  onDismiss: () => void;
}

/** Auto-dismissing floating indicator for value changes (e.g. +100 XP). Animation is BUILD-time. */
export function FloatingDelta({ label, onDismiss }: FloatingDeltaProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 2000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="pointer-events-none absolute right-4 top-1 z-50 rounded-md bg-purple-600 px-2 py-0.5 text-xs font-semibold text-white shadow"
      aria-live="polite"
    >
      {label}
    </div>
  );
}
