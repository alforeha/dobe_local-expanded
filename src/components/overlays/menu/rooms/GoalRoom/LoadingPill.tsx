type LoadingPillProps = {
  currentCount: number;
  totalCount: number;
  isComplete: boolean;
  isUserExploring: boolean;
  onToggleExplore: () => void;
};

export function LoadingPill({
  currentCount,
  totalCount,
  isComplete,
  isUserExploring,
  onToggleExplore,
}: LoadingPillProps) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(0, 0, 0, 0.55)',
        border: `1px solid ${isUserExploring ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: 20,
        padding: '6px 14px',
        color: 'rgba(255, 255, 255, 0.75)',
        fontSize: 13,
        fontFamily: 'sans-serif',
        userSelect: 'none',
        pointerEvents: isComplete ? 'auto' : 'none',
        transition: 'border-color 0.3s ease',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {!isComplete ? (
        <span style={{ opacity: 0.6 }}>Loading... {currentCount}/{totalCount}</span>
      ) : (
        <button
          onClick={onToggleExplore}
          style={{
            background: 'none',
            border: 'none',
            color: isUserExploring ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)',
            fontSize: 13,
            cursor: 'pointer',
            padding: 0,
            letterSpacing: '0.04em',
          }}
        >
          {isUserExploring ? 'Exploring' : 'Explore'}
        </button>
      )}
    </div>
  );
}
