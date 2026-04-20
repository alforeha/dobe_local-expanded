import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useSystemStore } from '../../../stores/useSystemStore';
import { executeRollover } from '../../../engine/rollover';
import { seedTestDataset } from '../../../engine/__validate__/testDataset';
import { localISODate, addDays, getAppDate, getAppTime } from '../../../utils/dateUtils';
import { downloadExport, importAppData } from '../../../utils/dataPortability';

const APP_VERSION = '0.1.0-local';

function tomorrowISO(): string {
  return localISODate(addDays(new Date(getAppDate() + 'T00:00:00'), 1));
}

function todayDisplay(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

interface AboutPopupProps {
  onClose: () => void;
}

export function AboutPopup({ onClose }: AboutPopupProps) {
  const devMode = useSystemStore((s) => s.devMode);
  const setDevMode = useSystemStore((s) => s.setDevMode);
  const lastRollover = useSystemStore((s) => s.lastRollover);
  const appDate = useSystemStore((s) => s.appDate);
  const timeOffset = useSystemStore((s) => s.timeOffset);
  const setTimeOffset = useSystemStore((s) => s.setTimeOffset);
  const setAppDateTime = useSystemStore((s) => s.setAppDateTime);
  const [versionTaps, setVersionTaps] = useState(0);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [skippingWeek, setSkippingWeek] = useState(false);
  const [importConfirm, setImportConfirm] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  function handleVersionTap() {
    if (devMode) return;
    const next = versionTaps + 1;
    setVersionTaps(next);
    if (next >= 5) {
      setDevMode(true);
    }
  }

  async function handleTriggerRollover() {
    if (rolling) return;
    setRolling(true);
    try {
      const nextDate = tomorrowISO();
      await executeRollover(nextDate);
      setAppDateTime(nextDate, getAppTime());
      setRolling(false);
    } catch (err) {
      setRolling(false);
      alert(`Rollover failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleSkipWeek() {
    if (skippingWeek) return;
    setSkippingWeek(true);
    try {
      const today = new Date(getAppDate() + 'T00:00:00');
      let finalDate = getAppDate();
      for (let i = 1; i <= 7; i++) {
        const date = localISODate(addDays(today, i));
        await executeRollover(date);
        finalDate = date;
      }
      setAppDateTime(finalDate, getAppTime());
      setSkippingWeek(false);
    } catch (err) {
      setSkippingWeek(false);
      alert(`Week skip failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function handleClearData() {
    if (!clearConfirm) {
      setClearConfirm(true);
      return;
    }
    setTimeOffset(0);
    localStorage.removeItem('cdb-system');
    localStorage.removeItem('cdb-user');
    localStorage.removeItem('cdb-progression');
    localStorage.removeItem('cdb-schedule');
    localStorage.removeItem('cdb-resources');
    localStorage.clear();
    window.location.reload();
  }

  function handleExportData() {
    downloadExport();
    setImportMessage(null);
    setSeedMessage(null);
  }

  function handleImportClick() {
    if (!importConfirm) {
      setImportConfirm(true);
      setImportMessage(null);
      return;
    }

    importInputRef.current?.click();
  }

  function handleImportSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setImportConfirm(false);

    if (!file) return;

    const reader = new FileReader();
    setImporting(true);
    setImportMessage(null);
    setSeedMessage(null);

    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const success = importAppData(text);

      if (!success) {
        setImporting(false);
        setImportMessage('Import failed - invalid file');
        return;
      }

      setImportMessage('Imported - reloading...');
      window.setTimeout(() => {
        window.location.reload();
      }, 400);
    };

    reader.onerror = () => {
      setImporting(false);
      setImportMessage('Import failed - invalid file');
    };

    reader.readAsText(file);
  }

  async function handleSeedTestData() {
    if (seeding) return;
    setSeeding(true);
    setSeedMessage(null);
    setImportMessage(null);
    try {
      const result = await seedTestDataset();
      setSeedMessage(`Seeded 30-day dataset (${result.usedKB.toFixed(1)} KB). Reloading...`);
      window.setTimeout(() => {
        window.location.reload();
      }, 400);
    } catch (err) {
      setSeeding(false);
      setSeedMessage(`Seed failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const disableDevButtons = rolling || skippingWeek || importing || seeding;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="mx-4 flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">About</h2>
          <button
            type="button"
            aria-label="Close about"
            onClick={onClose}
            className="text-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col items-center gap-1 py-2">
          <span className="text-5xl">🐸</span>
          <p className="text-xl font-bold tracking-wide text-gray-900 dark:text-gray-100">CAN-DO-BE</p>
          <p className="text-sm italic text-gray-500 dark:text-gray-400">Your life. Your quest.</p>
          <button
            type="button"
            onClick={handleVersionTap}
            className="mt-1 select-none text-xs text-gray-400 dark:text-gray-500"
            aria-label="Version"
          >
            v{APP_VERSION}
            {devMode && (
              <span className="ml-2 font-semibold text-amber-500">[DEV]</span>
            )}
          </button>
        </div>

        <p className="text-center text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          A personal life-management app that turns your goals, routines, and resources into a daily quest.
        </p>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500">{todayDisplay()}</p>

        {devMode && (
          <div className="mt-2 flex flex-col gap-3 border-t border-amber-200 pt-4 dark:border-amber-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Dev Tools</p>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              App date:{' '}
              <span className="font-mono text-amber-700 dark:text-amber-300">
                {appDate ?? lastRollover ?? localISODate(new Date())}
              </span>
            </p>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 dark:text-gray-400">
                Time offset (hours)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Decrease time offset"
                  onClick={() => setTimeOffset(Math.max(-12, timeOffset - 1))}
                  className="h-8 w-8 rounded bg-amber-100 font-bold text-amber-800 transition-colors hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:hover:bg-amber-800"
                >
                  -
                </button>
                <span className="w-8 text-center font-mono text-sm text-gray-800 dark:text-gray-200">
                  {timeOffset >= 0 ? `+${timeOffset}` : String(timeOffset)}
                </span>
                <button
                  type="button"
                  aria-label="Increase time offset"
                  onClick={() => setTimeOffset(Math.min(12, timeOffset + 1))}
                  className="h-8 w-8 rounded bg-amber-100 font-bold text-amber-800 transition-colors hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:hover:bg-amber-800"
                >
                  +
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Effective time:{' '}
                <span className="font-mono text-amber-700 dark:text-amber-300">
                  {getAppTime()}
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={handleExportData}
              disabled={disableDevButtons}
              className="w-full rounded-lg bg-amber-100 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-200 disabled:opacity-50 dark:bg-amber-900 dark:text-amber-200 dark:hover:bg-amber-800"
            >
              Export Data
            </button>

            <button
              type="button"
              onClick={handleImportClick}
              disabled={disableDevButtons}
              className="w-full rounded-lg bg-amber-100 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-200 disabled:opacity-50 dark:bg-amber-900 dark:text-amber-200 dark:hover:bg-amber-800"
            >
              {importing
                ? 'Importing...'
                : importConfirm
                  ? 'This will replace all current data. Continue?'
                  : 'Import Data'}
            </button>

            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportSelected}
            />

            {importMessage && (
              <p className="text-xs text-amber-700 dark:text-amber-300">{importMessage}</p>
            )}

            <button
              type="button"
              onClick={handleSeedTestData}
              disabled={disableDevButtons}
              className="w-full rounded-lg bg-amber-100 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-200 disabled:opacity-50 dark:bg-amber-900 dark:text-amber-200 dark:hover:bg-amber-800"
            >
              {seeding ? 'Seeding test data...' : 'Seed Test Data'}
            </button>

            {seedMessage && (
              <p className="text-xs text-amber-700 dark:text-amber-300">{seedMessage}</p>
            )}

            <button
              type="button"
              onClick={handleTriggerRollover}
              disabled={disableDevButtons}
              className="w-full rounded-lg bg-amber-100 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-200 disabled:opacity-50 dark:bg-amber-900 dark:text-amber-200 dark:hover:bg-amber-800"
            >
              {rolling ? 'Rolling over...' : 'Trigger Rollover'}
            </button>

            <button
              type="button"
              onClick={handleSkipWeek}
              disabled={disableDevButtons}
              className="w-full rounded-lg bg-amber-100 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-200 disabled:opacity-50 dark:bg-amber-900 dark:text-amber-200 dark:hover:bg-amber-800"
            >
              {skippingWeek ? 'Skipping 7 days...' : 'Skip Forward 1 Week'}
            </button>

            <button
              type="button"
              onClick={handleClearData}
              className="w-full rounded-lg bg-red-100 py-2 text-sm font-medium text-red-800 transition-colors hover:bg-red-200 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800"
            >
              {clearConfirm ? 'Tap again to confirm clear' : 'Clear All Data'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
