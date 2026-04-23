import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface PopupShellProps {
  title: string;
  onClose: () => void;
  children?: ReactNode;
  size?: 'default' | 'large';
  headerRight?: ReactNode;
}

/** Shared wrapper for all ADD/EDIT popups — internal layout is BUILD-time per popup */
export function PopupShell({ title, onClose, children, size = 'default', headerRight }: PopupShellProps) {
  const panelClassName = size === 'large'
    ? 'relative flex w-full max-w-5xl flex-col rounded-2xl bg-white shadow-xl dark:bg-gray-800 max-h-[calc(100dvh-2rem)]'
    : 'relative flex w-full max-w-md flex-col rounded-xl bg-white shadow-xl dark:bg-gray-800 max-h-[calc(100dvh-2rem)]';

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4"
      onClick={onClose}
    >
      <div className={panelClassName} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
          <div className="flex items-center gap-2">
            {headerRight}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-full p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              ✕
            </button>
          </div>
        </div>
        {/* Content — scrollable, fills remaining height */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-gray-800 dark:text-gray-100">
          {children ?? (
            <p className="text-sm text-gray-400 italic">Popup content — BUILD-time</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
