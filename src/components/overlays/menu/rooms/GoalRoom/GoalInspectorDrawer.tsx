import type { Aspiration } from '../../../../../types';
import { IconDisplay } from '../../../../shared/IconDisplay';

export type DrawerView =
  | { level: 'none' }
  | { level: 'orbit'; orbit: 'user' | 'system' }
  | { level: 'aspiration'; orbit: 'user' | 'system'; aspiration: Aspiration };

interface GoalInspectorDrawerProps {
  open: boolean;
  view: DrawerView;
  onBack: () => void;
  userAspirations: Aspiration[];
  adventureAspirations: Aspiration[];
  onSelectAspiration: (aspiration: Aspiration) => void;
  onAddAspiration: () => void;
}

export function GoalInspectorDrawer({
  open,
  view,
  onBack,
  userAspirations,
  adventureAspirations,
  onSelectAspiration,
  onAddAspiration,
}: GoalInspectorDrawerProps) {
  const label = view.level === 'aspiration'
    ? view.aspiration.name || 'Aspiration'
    : view.level === 'orbit'
      ? view.orbit === 'user' ? 'Your Aspirations' : 'Adventures'
      : '';
  const orbitList = view.level === 'orbit'
    ? view.orbit === 'user' ? userAspirations : adventureAspirations
    : [];

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
          onClick={(event) => {
            event.stopPropagation();
            onBack();
          }}
          className="text-white/40 hover:text-white/80 text-xs px-2 py-1 flex items-center gap-1"
        >
          &larr; back
        </button>
      </div>
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 16px' }} />
      {view.level === 'orbit' ? (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {orbitList.map((asp) => (
              <button
                key={asp.id}
                onClick={() => onSelectAspiration(asp)}
                className="w-full flex items-center gap-3 py-3 border-b border-white/5 text-left"
              >
                <IconDisplay iconKey={asp.icon} size={20} className="opacity-80 shrink-0" />
                <span className="flex-1 text-white/80 text-sm truncate">
                  {asp.name || 'Unnamed'}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  asp.completionState === 'complete'
                    ? 'bg-green-900/40 text-green-400'
                    : 'bg-white/5 text-white/30'
                }`}>
                  {asp.completionState}
                </span>
              </button>
            ))}
            {orbitList.length === 0 && (
              <p className="text-white/20 text-xs text-center py-8">
                {view.orbit === 'user' ? 'No aspirations yet' : 'No adventures unlocked'}
              </p>
            )}
          </div>
          {view.orbit === 'user' && (
            <div className="px-4 pb-4 pt-2">
              <button
                onClick={onAddAspiration}
                className="w-full py-2 rounded-lg border border-white/10 text-white/50 text-xs hover:border-white/20 hover:text-white/70"
              >
                + New Aspiration
              </button>
            </div>
          )}
        </>
      ) : null}
      {view.level === 'aspiration' ? (
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <IconDisplay iconKey={view.aspiration.icon} size={28} className="opacity-90 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white/90 text-sm font-medium truncate">{view.aspiration.name || 'Unnamed'}</p>
              {view.aspiration.description && (
                <p className="text-white/40 text-xs mt-0.5 line-clamp-2">{view.aspiration.description}</p>
              )}
            </div>
            {view.aspiration.owner !== 'coach' && (
              <button className="text-white/30 text-xs hover:text-white/60 shrink-0">
                Edit
              </button>
            )}
          </div>

          {view.aspiration.woops.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-white/20 text-xs uppercase tracking-wider mb-1">WOOPs</p>
              {view.aspiration.woops.map((woop, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 py-2 border-b border-white/5"
                >
                  <IconDisplay iconKey={woop.icon} size={14} className="opacity-60 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white/60 text-xs truncate">{woop.name || woop.wish || 'WOOP'}</p>
                    {woop.wish && woop.name && (
                      <p className="text-white/25 text-xs mt-0.5 truncate">{woop.wish}</p>
                    )}
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${
                    woop.completionState === 'complete'
                      ? 'bg-green-900/40 text-green-400'
                      : 'bg-white/5 text-white/20'
                  }`}>
                    {woop.smarters.length} SMARTERs
                  </span>
                </div>
              ))}
            </div>
          )}

          {view.aspiration.woops.length === 0 && (
            <p className="text-white/15 text-xs text-center py-4">No WOOPs defined yet</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
