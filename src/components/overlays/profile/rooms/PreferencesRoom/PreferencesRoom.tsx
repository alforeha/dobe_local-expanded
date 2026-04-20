import { useMemo, useState } from 'react';
import { characterLibrary } from '../../../../../coach';
import { ICON_MAP, isImageIcon, resolveIcon } from '../../../../../constants/iconMap';
import { FEED_SOURCE } from '../../../../../engine/feedEngine';
import { useSystemStore } from '../../../../../stores/useSystemStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import type { Settings } from '../../../../../types';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { DisplayNameChange } from './DisplayNameChange';
import { ThemeModeToggle } from './ThemeModeToggle';
import { TimeViewFilterSettings } from './TimeViewFilterSettings';

type PreferencesTab = 'filter' | 'coach' | 'appearance';

const DEFAULT_SETTINGS: Settings = {
  timePreferences: {
    dayView: { startTime: '06:00', endTime: '23:00' },
    weekView: { startTime: '06:00', endTime: '22:00', visibleDays: [0, 1, 2, 3, 4, 5, 6] },
    explorerView: { startTime: '00:00', endTime: '23:59', visibleDays: [0, 1, 2, 3, 4, 5, 6] },
  },
  coachPreferences: {
    tone: 'friendly',
    trackingSettings: {},
    character: 'default',
    sourceTypeToggles: {},
  },
  displayPreferences: {
    mode: 'dark',
    theme: 'default',
  },
  socialPreferences: null,
  notificationPreferences: null,
  storagePreferences: null,
};

const TABS: Array<{ id: PreferencesTab; label: string }> = [
  { id: 'filter', label: 'Filter' },
  { id: 'coach', label: 'Coach' },
  { id: 'appearance', label: 'Appearance' },
];

const ICON_PRESET_KEYS = [
  'user-default',
  ...Object.keys(ICON_MAP)
    .filter((key) => {
      const resolved = resolveIcon(key);
      return !isImageIcon(resolved) && resolved !== key;
    })
    .filter((key) => !key.startsWith('gear:') && !key.startsWith('stake-') && !key.startsWith('boost-'))
    .filter((key) => ['star', 'glow', 'gold', 'badge', 'equipment', 'inventory', 'quest', 'check', 'daily', 'night', 'streak', 'boost', 'home', 'finance', 'social', 'learning'].includes(key)),
];

function ensureSettings(settings: Settings | null): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    timePreferences: {
      ...DEFAULT_SETTINGS.timePreferences,
      ...settings?.timePreferences,
      dayView: { ...DEFAULT_SETTINGS.timePreferences.dayView, ...settings?.timePreferences?.dayView },
      weekView: { ...DEFAULT_SETTINGS.timePreferences.weekView, ...settings?.timePreferences?.weekView },
      explorerView: { ...DEFAULT_SETTINGS.timePreferences.explorerView, ...settings?.timePreferences?.explorerView },
    },
    coachPreferences: {
      ...DEFAULT_SETTINGS.coachPreferences,
      ...settings?.coachPreferences,
      sourceTypeToggles: settings?.coachPreferences?.sourceTypeToggles ?? {},
    },
    displayPreferences: {
      ...DEFAULT_SETTINGS.displayPreferences,
      ...settings?.displayPreferences,
    },
  };
}

function formatSourceType(sourceType: string): string {
  return sourceType
    .split('.')
    .flatMap((part) => part.split('_'))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function PreferencesRoom() {
  const [activeTab, setActiveTab] = useState<PreferencesTab>('filter');
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [nameEditorOpen, setNameEditorOpen] = useState(false);
  const [customStubOpen, setCustomStubOpen] = useState(false);

  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);
  const settings = useSystemStore((state) => state.settings);
  const setSettings = useSystemStore((state) => state.setSettings);

  const fullSettings = ensureSettings(settings);
  const displayName = user?.system.displayName ?? 'Adventurer';
  const selectedIconKey = user?.system.icon ?? 'user-default';

  const sourceTypeOptions = useMemo(() => {
    const feedSourceSet = new Set<string>(Object.values(FEED_SOURCE));
    for (const entry of user?.feed.entries ?? []) {
      if (entry.sourceType) feedSourceSet.add(entry.sourceType);
    }
    return [...feedSourceSet].sort((left, right) => left.localeCompare(right));
  }, [user?.feed.entries]);

  function updateSettings(nextSettings: Settings) {
    setSettings(ensureSettings(nextSettings));
  }

  function updateCoachPreference(patch: Partial<Settings['coachPreferences']>) {
    updateSettings({
      ...fullSettings,
      coachPreferences: {
        ...fullSettings.coachPreferences,
        ...patch,
      },
    });
  }

  function updateIcon(icon: string) {
    if (!user) return;
    setUser({
      ...user,
      system: {
        ...user.system,
        icon,
      },
    });
    setIconPickerOpen(false);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">Preferences</h3>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          <section className="rounded-3xl border border-gray-200 bg-white/90 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/80">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIconPickerOpen((current) => !current)}
                  className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-3xl shadow-sm transition hover:scale-[1.02] dark:bg-emerald-950/40"
                  aria-label="Change profile icon"
                >
                  <IconDisplay iconKey={selectedIconKey} size={40} className="h-10 w-10 object-contain" alt="Profile icon" />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Name</p>
                  <p className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">{displayName}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setNameEditorOpen(true)}
                className="sm:ml-auto rounded-full border border-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-500 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
              >
                Change Name
              </button>
            </div>

            {iconPickerOpen ? (
              <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50/90 p-3 dark:border-gray-700 dark:bg-gray-800/80">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Choose icon</p>
                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {ICON_PRESET_KEYS.map((iconKey) => (
                    <button
                      key={iconKey}
                      type="button"
                      onClick={() => updateIcon(iconKey)}
                      className={`flex aspect-square items-center justify-center rounded-2xl border text-2xl transition ${
                        selectedIconKey === iconKey
                          ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-950/40'
                          : 'border-gray-200 bg-white hover:border-emerald-300 dark:border-gray-700 dark:bg-gray-900/70'
                      }`}
                      title={formatSourceType(iconKey)}
                    >
                      <IconDisplay iconKey={iconKey} size={32} className="h-8 w-8 object-contain" alt={formatSourceType(iconKey)} />
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-3 py-3 dark:border-amber-700/70 dark:bg-amber-950/20">
                  <div>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Custom (costs 50 gold)</p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">Bring your own icon later.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCustomStubOpen((current) => !current)}
                    className="rounded-full bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-400"
                  >
                    Custom
                  </button>
                </div>
                {customStubOpen ? (
                  <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">Coming soon.</p>
                ) : null}
              </div>
            ) : null}

            {nameEditorOpen ? (
              <div className="mt-4">
                <DisplayNameChange compact open onClose={() => setNameEditorOpen(false)} />
              </div>
            ) : null}
          </section>

          <div className="flex rounded-2xl bg-gray-100 p-1 dark:bg-gray-800">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'filter' ? (
            <section className="space-y-3">
              <TimeViewFilterSettings />
            </section>
          ) : null}

          {activeTab === 'coach' ? (
            <section className="space-y-4 rounded-3xl border border-gray-200 bg-white/90 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/80">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Tone</span>
                  <select
                    value={fullSettings.coachPreferences.tone}
                    onChange={(event) => updateCoachPreference({ tone: event.target.value })}
                    className="w-full rounded-2xl border border-gray-300 bg-white px-3 py-3 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="friendly">Friendly</option>
                    <option value="muted">Muted</option>
                    <option value="militant">Militant</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Character</span>
                  <select
                    value={
                      fullSettings.coachPreferences.character === 'default'
                        ? (characterLibrary.coachCharacters[0]?.id ?? 'default')
                        : fullSettings.coachPreferences.character
                    }
                    onChange={(event) => updateCoachPreference({ character: event.target.value })}
                    className="w-full rounded-2xl border border-gray-300 bg-white px-3 py-3 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  >
                    {characterLibrary.coachCharacters.map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="space-y-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Comment types</p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Turn off coach updates you find noisy. Any type without a saved value stays on.</p>
                </div>

                <div className="space-y-2">
                  {sourceTypeOptions.map((sourceType) => {
                    const enabled = fullSettings.coachPreferences.sourceTypeToggles[sourceType] ?? true;
                    return (
                      <div
                        key={sourceType}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/70"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{formatSourceType(sourceType)}</p>
                          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{sourceType}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            updateCoachPreference({
                              sourceTypeToggles: {
                                ...fullSettings.coachPreferences.sourceTypeToggles,
                                [sourceType]: !enabled,
                              },
                            })
                          }
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                            enabled
                              ? 'bg-emerald-600 text-white'
                              : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {enabled ? 'On' : 'Off'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === 'appearance' ? (
            <section className="space-y-4 rounded-3xl border border-gray-200 bg-white/90 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/80">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Mode</p>
                <div className="mt-3">
                  <ThemeModeToggle />
                </div>
              </div>

              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4 dark:border-gray-700 dark:bg-gray-800/70">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Theme</p>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">More themes coming soon.</p>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
