import { useSystemStore } from '../../../../../stores/useSystemStore';

const TONES = ['muted', 'friendly', 'militant'] as const;

export function CoachToneSelector() {
  const settings = useSystemStore((s) => s.settings);
  const setSettings = useSystemStore((s) => s.setSettings);

  const tone = settings?.coachPreferences.tone ?? 'friendly';

  const handleChange = (value: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      coachPreferences: { ...settings.coachPreferences, tone: value },
    });
  };

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Coach tone</p>
      <div className="flex gap-2">
        {TONES.map((t) => (
          <button
            key={t}
            type="button"
            className={`rounded px-3 py-1.5 text-sm capitalize ${
              tone === t
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
            onClick={() => handleChange(t)}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
