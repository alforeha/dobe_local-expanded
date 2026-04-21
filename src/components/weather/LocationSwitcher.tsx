import { useRef, useState, useEffect } from 'react';
import { useSystemStore } from '../../stores/useSystemStore';

export function LocationSwitcher() {
  const locationPreferences = useSystemStore((s) => s.settings?.locationPreferences);
  const setActiveLocation = useSystemStore((s) => s.setActiveLocation);

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const locations = locationPreferences?.locations ?? [];
  const activeLocationId = locationPreferences?.activeLocationId ?? null;
  const activeLocation = locations.find((l) => l.id === activeLocationId) ?? locations[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (!activeLocation) return null;

  const displayName = activeLocation.cityName || activeLocation.label;

  // Single location: plain text only
  if (locations.length <= 1) {
    return (
      <span className="max-w-[120px] truncate text-xs text-gray-500 dark:text-gray-400">
        {displayName}
      </span>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[120px] items-center gap-1 truncate rounded-md px-1 py-0.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        aria-label="Switch active location"
        aria-expanded={open}
      >
        <span className="truncate">{displayName}</span>
        <span className="shrink-0 text-[10px]">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[150px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {locations.map((loc) => {
            const isActive = loc.id === activeLocationId || loc.id === activeLocation.id;
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => {
                  setActiveLocation(loc.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${isActive ? 'font-semibold text-purple-700 dark:text-purple-300' : 'text-gray-700 dark:text-gray-200'}`}
              >
                <span className="min-w-0 flex-1 truncate">{loc.cityName || loc.label}</span>
                {isActive && <span className="shrink-0 text-purple-500 dark:text-purple-400">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
