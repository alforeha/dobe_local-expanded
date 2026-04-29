import { useEffect, useRef, useState } from 'react';
import { ICON_MAP } from '../../constants/iconMap';
import { IconDisplay } from './IconDisplay';

interface IconPickerProps {
  value: string;
  onChange: (key: string) => void;
  label?: string;
  align?: 'left' | 'center' | 'right';
}

export function IconPicker({ value, onChange, label, align = 'center' }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open || !triggerRef.current) {
      return;
    }

    function updatePopoverPosition() {
      if (!triggerRef.current) return;

      const pickerHeight = pickerRef.current?.offsetHeight ?? 300;
      const pickerWidth = pickerRef.current?.offsetWidth ?? 352;
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const shouldOpenUpward = spaceBelow < pickerHeight && triggerRect.top > spaceBelow;
      const shouldAlignRight = window.innerWidth - triggerRect.left < pickerWidth;

      const top = shouldOpenUpward
        ? Math.max(8, triggerRect.top - pickerHeight - 8)
        : Math.min(window.innerHeight - pickerHeight - 8, triggerRect.bottom + 8);

      let left = triggerRect.left;
      if (shouldAlignRight) {
        left = triggerRect.right - pickerWidth;
      } else if (align === 'center') {
        left = triggerRect.left + (triggerRect.width / 2) - (pickerWidth / 2);
      } else if (align === 'right') {
        left = triggerRect.right - pickerWidth;
      }

      setPopoverPosition({
        top,
        left: Math.min(Math.max(8, left), window.innerWidth - pickerWidth - 8),
      });
    }

    updatePopoverPosition();
    window.addEventListener('resize', updatePopoverPosition);
    window.addEventListener('scroll', updatePopoverPosition, true);

    return () => {
      window.removeEventListener('resize', updatePopoverPosition);
      window.removeEventListener('scroll', updatePopoverPosition, true);
    };
  }, [open]);

  const normalised = value?.toLowerCase?.() ?? '';
  const entries = Object.entries(ICON_MAP);
  const popoverClassName = 'fixed z-[120] w-[22rem] max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-600 dark:bg-gray-800';

  return (
    <div ref={rootRef} className="flex flex-col gap-2">
      {label && (
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      )}

      <div className="relative flex flex-col items-center">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label={open ? 'Close icon picker' : 'Choose icon'}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm transition-colors hover:border-purple-400 dark:border-gray-600 dark:bg-gray-800"
        >
          <IconDisplay iconKey={value} size={24} className="h-6 w-6 object-contain" alt="" />
        </button>

        {open && (
          <div
            ref={pickerRef}
            className={popoverClassName}
            style={{ top: popoverPosition.top, left: popoverPosition.left }}
          >
            <div className="max-h-[min(26rem,calc(100dvh-8rem))] overflow-y-auto pr-1">
              <div className="grid grid-cols-6 gap-1.5">
              {entries.map(([key]) => {
                const isSelected = normalised === key || value === key;
                return (
                  <button
                    key={key}
                    type="button"
                    title={key}
                    onClick={() => {
                      onChange(key);
                      setOpen(false);
                    }}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors hover:bg-purple-50 dark:hover:bg-purple-900/30 ${
                      isSelected
                        ? 'border-2 border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <IconDisplay iconKey={key} size={20} className="h-5 w-5 object-contain" alt="" />
                  </button>
                );
              })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
