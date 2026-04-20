import { useSystemStore } from '../../../../../stores/useSystemStore';

export function ThemeModeToggle() {
  const mode = useSystemStore((s) => s.settings?.displayPreferences?.mode ?? 'dark');
  const setThemeMode = useSystemStore((s) => s.setThemeMode);

  return (
    <div className="flex gap-2">
      {(['light', 'dark'] as const).map((nextMode) => (
        <button
          key={nextMode}
          type="button"
          onClick={() => setThemeMode(nextMode)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            mode === nextMode
              ? 'bg-emerald-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {nextMode === 'light' ? 'Light' : 'Dark'}
        </button>
      ))}
    </div>
  );
}
