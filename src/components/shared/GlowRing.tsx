import type { ReactNode } from 'react';

interface GlowRingProps {
  active: boolean;
  children: ReactNode;
  rounded?: 'full' | 'lg';
  className?: string;
}

const ROUNDED_CLASS = {
  full: 'rounded-full',
  lg: 'rounded-lg',
} as const;

export function GlowRing({
  active,
  children,
  rounded = 'full',
  className = 'inline-flex',
}: GlowRingProps) {
  return (
    <div className={`relative ${className}`}>
      {children}
      {active && (
        <div
          className={`pointer-events-none absolute inset-0 animate-pulse ring-2 ring-emerald-400 ${ROUNDED_CLASS[rounded]}`}
        />
      )}
    </div>
  );
}
