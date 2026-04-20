import { getAppDate } from './dateUtils';

const STORAGE_KEYS = {
  system: 'cdb-system',
  user: 'cdb-user',
  progression: 'cdb-progression',
  schedule: 'cdb-schedule',
  resources: 'cdb-resources',
} as const;

type StoreName = keyof typeof STORAGE_KEYS;

interface AppDataExport {
  exportedAt: string;
  version: string;
  stores: Record<StoreName, string | null>;
}

export function exportAppData(): string {
  const data: AppDataExport = {
    exportedAt: new Date().toISOString(),
    version: '0.1.0-local',
    stores: {
      system: localStorage.getItem(STORAGE_KEYS.system),
      user: localStorage.getItem(STORAGE_KEYS.user),
      progression: localStorage.getItem(STORAGE_KEYS.progression),
      schedule: localStorage.getItem(STORAGE_KEYS.schedule),
      resources: localStorage.getItem(STORAGE_KEYS.resources),
    },
  };

  return JSON.stringify(data, null, 2);
}

export function measureStorageUsage(): {
  totalBytes: number;
  totalKB: number;
  perKey: Record<string, number>;
  budgetKB: number;
  percentUsed: number;
} {
  const BUDGET_KB = 4096;
  const perKey: Record<string, number> = {};
  let totalBytes = 0;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const value = localStorage.getItem(key) ?? '';
    const bytes = new Blob([value]).size;
    perKey[key] = bytes;
    totalBytes += bytes;
  }

  const totalKB = totalBytes / 1024;
  return {
    totalBytes,
    totalKB,
    perKey,
    budgetKB: BUDGET_KB,
    percentUsed: (totalKB / BUDGET_KB) * 100,
  };
}

export function downloadExport(): void {
  const json = exportAppData();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `candobe-export-${getAppDate()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importAppData(jsonString: string): boolean {
  try {
    const data = JSON.parse(jsonString) as { stores?: Partial<Record<StoreName, unknown>> };
    const stores = data.stores;
    if (!stores || typeof stores !== 'object') return false;

    const hasPortableStore = (Object.keys(STORAGE_KEYS) as StoreName[]).some((key) => key in stores);
    if (!hasPortableStore) return false;

    for (const key of Object.values(STORAGE_KEYS)) {
      localStorage.removeItem(key);
    }

    for (const [storeName, storageKey] of Object.entries(STORAGE_KEYS) as Array<[StoreName, string]>) {
      const value = stores[storeName];
      if (typeof value === 'string') {
        localStorage.setItem(storageKey, value);
      }
    }

    return true;
  } catch {
    return false;
  }
}
