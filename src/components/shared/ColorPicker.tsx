import { useEffect, useRef, useState } from 'react';

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  align?: 'left' | 'center' | 'right';
}

const SWATCHES = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
];

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '').padEnd(6, '0').slice(0, 6);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16) || 0,
    g: Number.parseInt(normalized.slice(2, 4), 16) || 0,
    b: Number.parseInt(normalized.slice(4, 6), 16) || 0,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${clampChannel(r).toString(16).padStart(2, '0')}${clampChannel(g).toString(16).padStart(2, '0')}${clampChannel(b).toString(16).padStart(2, '0')}`;
}

export function ColorPicker({ value, onChange, align = 'center' }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverClassName = align === 'left'
    ? 'absolute left-0 top-full z-20 mt-2 min-w-[14rem] rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-600 dark:bg-gray-800'
    : align === 'right'
      ? 'absolute right-0 top-full z-20 mt-2 min-w-[14rem] -translate-x-5 rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-600 dark:bg-gray-800'
      : 'absolute left-1/2 top-full z-20 mt-2 min-w-[14rem] -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-600 dark:bg-gray-800';

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setShowCustom(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative flex flex-col items-center">
      <button
        type="button"
        aria-label="Choose color"
        onClick={() => setOpen((current) => !current)}
        className="h-10 w-10 rounded-xl border border-gray-200 shadow-sm transition-transform hover:scale-105 dark:border-gray-600"
        style={{ backgroundColor: value }}
      />

      {open && (
        <div className={popoverClassName}>
          <div className="mb-3 grid grid-cols-4 gap-2">
            {SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={`Choose ${hex}`}
                onClick={() => {
                  onChange(hex);
                  setOpen(false);
                  setShowCustom(false);
                }}
                className={`h-8 w-8 rounded-lg border-2 transition-transform hover:scale-105 ${
                  value.toLowerCase() === hex.toLowerCase() ? 'border-purple-500' : 'border-transparent'
                }`}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowCustom((current) => !current)}
            className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 transition-colors hover:border-purple-400 hover:text-purple-600 dark:border-gray-600 dark:text-gray-300"
          >
            <span>Pick color</span>
            <span
              className="h-8 w-10 rounded border border-gray-200 dark:border-gray-600"
              style={{ backgroundColor: value }}
            />
          </button>

          {showCustom && (
            <CustomColorEditor
              value={value}
              onChange={onChange}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface CustomColorEditorProps {
  value: string;
  onChange: (hex: string) => void;
}

function CustomColorEditor({ value, onChange }: CustomColorEditorProps) {
  const rgb = hexToRgb(value);

  function updateChannel(channel: 'r' | 'g' | 'b', next: number) {
    const updated = { ...rgb, [channel]: clampChannel(next) };
    onChange(rgbToHex(updated.r, updated.g, updated.b));
  }

  return (
    <div className="mt-3 rounded-lg border border-gray-300 p-3 dark:border-gray-600">
      <div className="mb-3 flex items-center gap-3">
        <span
          className="h-10 w-10 shrink-0 rounded-lg border border-gray-200 dark:border-gray-600"
          style={{ backgroundColor: value }}
        />
        <input
          type="text"
          value={value}
          onChange={(event) => {
            const raw = event.target.value.trim();
            const normalized = raw.startsWith('#') ? raw : `#${raw}`;
            if (/^#[0-9a-fA-F]{0,6}$/.test(normalized)) {
              if (normalized.length === 7) {
                onChange(normalized.toLowerCase());
              } else {
                onChange(normalized);
              }
            }
          }}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
        />
      </div>

      <div className="grid grid-cols-[auto_1fr_56px] items-center gap-2 text-sm">
        <span className="text-red-500">R</span>
        <input
          type="range"
          min={0}
          max={255}
          value={rgb.r}
          onChange={(event) => updateChannel('r', Number(event.target.value))}
          className="w-full"
        />
        <input
          type="number"
          min={0}
          max={255}
          value={rgb.r}
          onChange={(event) => updateChannel('r', Number(event.target.value))}
          className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
        />

        <span className="text-green-500">G</span>
        <input
          type="range"
          min={0}
          max={255}
          value={rgb.g}
          onChange={(event) => updateChannel('g', Number(event.target.value))}
          className="w-full"
        />
        <input
          type="number"
          min={0}
          max={255}
          value={rgb.g}
          onChange={(event) => updateChannel('g', Number(event.target.value))}
          className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
        />

        <span className="text-blue-500">B</span>
        <input
          type="range"
          min={0}
          max={255}
          value={rgb.b}
          onChange={(event) => updateChannel('b', Number(event.target.value))}
          className="w-full"
        />
        <input
          type="number"
          min={0}
          max={255}
          value={rgb.b}
          onChange={(event) => updateChannel('b', Number(event.target.value))}
          className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
        />
      </div>
    </div>
  );
}
