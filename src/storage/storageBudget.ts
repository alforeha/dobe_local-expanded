import { useScheduleStore } from '../stores/useScheduleStore';
import { measureStorageUsage } from '../utils/dataPortability';

export const STORAGE_BUDGET_KB = 4096;
export const STORAGE_BUDGET_DEFAULT_BYTES = STORAGE_BUDGET_KB * 1024;
export const STORAGE_BUDGET_WARN_THRESHOLD = 0.8;
export const ATTACHMENT_MAX_BYTES = 200 * 1024;
export const EVENT_MAX_ATTACHMENTS = 5;
export const STORAGE_WARN_THRESHOLD_KB = 3900;

let _warnThresholdKB = STORAGE_WARN_THRESHOLD_KB;

export function setWarnThresholdKB(kb: number): void {
  _warnThresholdKB = kb;
}

export interface StorageUsageSnapshot {
  usedBytes: number;
  usedKB: number;
  estimatedTotalBytes: number;
  usedPercent: number;
  isAboveWarningThreshold: boolean;
}

export function getStorageUsage(): StorageUsageSnapshot {
  const measurement = measureStorageUsage();
  const usedBytes = measurement.totalBytes;
  const usedKB = measurement.totalKB;
  const usedPercent = (usedBytes / STORAGE_BUDGET_DEFAULT_BYTES) * 100;

  return {
    usedBytes,
    usedKB,
    estimatedTotalBytes: STORAGE_BUDGET_DEFAULT_BYTES,
    usedPercent,
    isAboveWarningThreshold: usedKB >= _warnThresholdKB,
  };
}

export function checkBudget(requiredBytes: number): boolean {
  const usage = getStorageUsage();
  const projectedKB = (usage.usedBytes + requiredBytes) / 1024;
  return projectedKB < _warnThresholdKB;
}

let _evictionHandler: (snapshot: StorageUsageSnapshot) => void = (snapshot) => {
  const state = useScheduleStore.getState();
  const oldestHistoryIds = Object.values(state.historyEvents)
    .map((event) => ({
      id: event.id,
      sortDate: 'startDate' in event ? event.startDate : event.date,
    }))
    .sort((a, b) => a.sortDate.localeCompare(b.sortDate))
    .slice(0, 10)
    .map((event) => event.id);

  if (oldestHistoryIds.length === 0) {
    console.warn('[CAN-DO-BE] Storage eviction was requested, but no history events were available to prune.');
    return;
  }

  const nextHistoryEvents = { ...state.historyEvents };
  for (const eventId of oldestHistoryIds) {
    delete nextHistoryEvents[eventId];
    const storageKey = eventId.startsWith('qa-')
      ? `qa:${eventId.slice(3)}`
      : `event:${eventId}`;
    localStorage.removeItem(storageKey);
  }

  useScheduleStore.setState({ historyEvents: nextHistoryEvents });

  console.warn(
    `[CAN-DO-BE] Storage nearing limit (${snapshot.usedKB.toFixed(1)} KB). Pruned ${oldestHistoryIds.length} oldest history events.`,
  );
};

export function setEvictionHandler(
  fn: (snapshot: StorageUsageSnapshot) => void,
): void {
  _evictionHandler = fn;
}

export function runEvictionHandler(snapshot: StorageUsageSnapshot): void {
  _evictionHandler(snapshot);
}
