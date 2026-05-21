import type { Aspiration } from '../../../../../types';

export type DrawerView =
  | { level: 'none' }
  | { level: 'orbit'; orbit: 'user' | 'system' }
  | { level: 'aspiration'; orbit: 'user' | 'system'; aspiration: Aspiration };

interface GoalInspectorDrawerProps {
  open: boolean;
  view: DrawerView;
  onBack: () => void;
}

export function GoalInspectorDrawer({ open, view, onBack }: GoalInspectorDrawerProps) {
  const label = view.level === 'aspiration'
    ? view.aspiration.name || 'Aspiration'
    : view.level === 'orbit'
      ? view.orbit === 'user' ? 'Your Aspirations' : 'Adventures'
      : '';

  return (
    <div
      className="absolute bottom-0 left-0 right-0 transition-transform duration-300 ease-out"
      style={{
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        height: '55%',
        background: 'rgba(15, 15, 25, 0.96)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px 16px 0 0',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-white/80 text-sm font-medium">
          {label}
        </span>
        <button
          onClick={onBack}
          className="text-white/40 hover:text-white/80 text-xs px-2 py-1 flex items-center gap-1"
        >
          &larr; back
        </button>
      </div>
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 16px' }} />
      <div className="flex-1 flex items-center justify-center">
        <span className="text-white/20 text-xs">
          {view.level === 'aspiration' ? 'Aspiration editor - coming next' : 'Orbit overview - coming next'}
        </span>
      </div>
    </div>
  );
}
