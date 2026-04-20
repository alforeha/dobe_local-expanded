import { measureStorageUsage } from '../../../../utils/dataPortability';

const DISPLAY_KEYS = [
  'cdb-progression',
  'cdb-schedule',
  'cdb-user',
  'cdb-resources',
  'cdb-system',
] as const;

function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function StorageRoom() {
  const usage = measureStorageUsage();
  const percentUsed = Math.min(usage.percentUsed, 100);
  const tone =
    percentUsed > 80
      ? {
          bar: 'bg-red-500',
          text: 'text-red-600',
          badge: 'bg-red-50 text-red-700',
        }
      : percentUsed >= 50
        ? {
            bar: 'bg-amber-500',
            text: 'text-amber-600',
            badge: 'bg-amber-50 text-amber-700',
          }
        : {
            bar: 'bg-emerald-500',
            text: 'text-emerald-600',
            badge: 'bg-emerald-50 text-emerald-700',
          };

  const extraEntries = Object.entries(usage.perKey)
    .filter(([key]) => !DISPLAY_KEYS.includes(key as (typeof DISPLAY_KEYS)[number]))
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-bold text-gray-700">Storage</h3>
        <p className="text-xs text-gray-400">Local device storage (read-only)</p>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        <div className="bg-gray-50 px-4 py-4 dark:bg-gray-800">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-gray-700">Total used</span>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${tone.badge}`}>
              {usage.totalKB.toFixed(1)} KB / {usage.budgetKB} KB ({usage.percentUsed.toFixed(1)}%)
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-full rounded-full transition-all ${tone.bar}`}
              style={{ width: `${percentUsed}%` }}
            />
          </div>
          {usage.percentUsed > 80 && (
            <p className="mt-3 text-xs text-red-600">
              Storage is getting full. Consider clearing old data or exporting a backup.
            </p>
          )}
        </div>

        <div className="px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Per-key breakdown</p>
        </div>

        {DISPLAY_KEYS.map((key) => (
          <div key={key} className="flex items-center justify-between px-4 py-2">
            <span className="text-xs text-gray-600">{key}</span>
            <span className={`text-xs ${tone.text}`}>{formatKB(usage.perKey[key] ?? 0)}</span>
          </div>
        ))}

        {extraEntries.map(([key, bytes]) => (
          <div key={key} className="flex items-center justify-between px-4 py-2">
            <span className="max-w-[70%] truncate text-xs text-gray-500">{key}</span>
            <span className="text-xs text-gray-400">{formatKB(bytes)}</span>
          </div>
        ))}

        {Object.keys(usage.perKey).length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-gray-400">No data stored yet.</p>
        )}
      </div>
    </div>
  );
}
