import { IconDisplay } from '../../shared/IconDisplay';

interface QACompletionIconProps {
  iconKey: string;
  offsetIndex: number;
  topPx: number;
  onClick: () => void;
}

export function QACompletionIcon({ iconKey, offsetIndex, topPx, onClick }: QACompletionIconProps) {
  const leftOffset = offsetIndex * 30;

  return (
    <button
      type="button"
      aria-label={`Quick action completion ${iconKey}`}
      onClick={onClick}
      className="absolute flex h-7 w-7 items-center justify-center rounded-full bg-purple-500 text-sm shadow ring-2 ring-white transition-transform hover:bg-purple-600 active:scale-95"
      style={{ top: `${topPx}px`, left: `${leftOffset}px`, zIndex: 20 + offsetIndex }}
    >
      <IconDisplay iconKey={iconKey} size={16} className="h-4 w-4 object-contain" alt="" />
    </button>
  );
}
