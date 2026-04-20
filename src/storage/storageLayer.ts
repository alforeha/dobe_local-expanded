// ─────────────────────────────────────────
// STORAGE LAYER
// Typed get / set / delete / list / clear wrappers over localStorage.
// All localStorage access in the app routes through here — never call
// localStorage directly elsewhere in the codebase.
// ─────────────────────────────────────────

import {
  STORAGE_KEY_SETTINGS,
  STORAGE_KEY_USER,
  STORAGE_PREFIX_ACT,
  STORAGE_PREFIX_PLANNED_EVENT,
  STORAGE_PREFIX_EVENT,
  STORAGE_PREFIX_QUICK_ACTIONS,
  STORAGE_PREFIX_RESOURCE,
  STORAGE_PREFIX_TASK,
  STORAGE_PREFIX_TASK_TEMPLATE,
  STORAGE_PREFIX_BADGE,
  STORAGE_PREFIX_GEAR,
  STORAGE_PREFIX_USEABLE,
  STORAGE_PREFIX_ATTACHMENT,
  STORAGE_PREFIX_EXPERIENCE,
} from './storageKeys';
import {
  getStorageUsage,
  checkBudget,
  runEvictionHandler,
  STORAGE_WARN_THRESHOLD_KB,
} from './storageBudget';

// ── GET ───────────────────────────────────────────────────────────────────────

/**
 * Retrieve and deserialise a value from localStorage.
 * Returns null if the key does not exist or JSON.parse fails.
 */
export function storageGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ── SET ───────────────────────────────────────────────────────────────────────

/**
 * Serialise and write a value to localStorage.
 * Fires a console warning if usage is above the threshold.
 * Attempts eviction and throws StorageQuotaError if the write cannot proceed.
 */
export function storageSet<T>(key: string, value: T): void {
  const serialised = JSON.stringify(value);
  const requiredBytes = new Blob([serialised]).size;
  const existingBytes = new Blob([localStorage.getItem(key) ?? '']).size;
  const additionalBytes = Math.max(0, requiredBytes - existingBytes);

  let usage = getStorageUsage();

  if (usage.isAboveWarningThreshold) {
    console.warn(
      `[CAN-DO-BE] Storage above warning threshold: ${usage.usedKB.toFixed(1)} KB used`,
    );
  }

  if (usage.usedKB > STORAGE_WARN_THRESHOLD_KB || !checkBudget(additionalBytes)) {
    runEvictionHandler(usage);
    usage = getStorageUsage();
  }

  const availableAfter = usage.estimatedTotalBytes - usage.usedBytes;
  if (additionalBytes > availableAfter) {
    throw new StorageQuotaError(key, additionalBytes, availableAfter);
  }

  localStorage.setItem(key, serialised);
}

// ── DELETE ────────────────────────────────────────────────────────────────────

/**
 * Remove a single key from localStorage.
 */
export function storageDelete(key: string): void {
  localStorage.removeItem(key);
}

// ── LIST ──────────────────────────────────────────────────────────────────────

/**
 * Return all localStorage keys that start with `prefix:`.
 * Accepts either a bare prefix ('act') or a colon-suffixed prefix ('act:').
 */
export function storageList(prefix: string): string[] {
  const match = prefix.endsWith(':') ? prefix : `${prefix}:`;
  const keys: string[] = [];
  // Snapshot length before iterating — deletion would shift indices
  const len = localStorage.length;
  for (let i = 0; i < len; i++) {
    const key = localStorage.key(i);
    if (key !== null && key.startsWith(match)) {
      keys.push(key);
    }
  }
  return keys;
}

// ── CLEAR ─────────────────────────────────────────────────────────────────────

/**
 * Remove all CAN-DO-BE keys from localStorage.
 * This includes both app-layer storageLayer keys AND the 5 Zustand persist
 * keys (cdb-system, cdb-user, cdb-progression, cdb-schedule, cdb-resources)
 * which are the source of truth per D83.
 */
export function storageClear(): void {
  // Zustand persist keys — must be removed explicitly as they are not
  // registered in storageKeys.ts
  const zustandKeys = [
    'cdb-system',
    'cdb-user',
    'cdb-progression',
    'cdb-schedule',
    'cdb-resources',
  ];
  zustandKeys.forEach((k) => localStorage.removeItem(k));

  const singletonKeys: string[] = [STORAGE_KEY_SETTINGS, STORAGE_KEY_USER];
  const prefixes = [
    `${STORAGE_PREFIX_ACT}:`,
    `${STORAGE_PREFIX_PLANNED_EVENT}:`,
    `${STORAGE_PREFIX_EVENT}:`,
    `${STORAGE_PREFIX_QUICK_ACTIONS}:`,
    `${STORAGE_PREFIX_RESOURCE}:`,
    `${STORAGE_PREFIX_TASK}:`,
    `${STORAGE_PREFIX_TASK_TEMPLATE}:`,
    `${STORAGE_PREFIX_BADGE}:`,
    `${STORAGE_PREFIX_GEAR}:`,
    `${STORAGE_PREFIX_USEABLE}:`,
    `${STORAGE_PREFIX_ATTACHMENT}:`,
    `${STORAGE_PREFIX_EXPERIENCE}:`,
  ];

  // Snapshot all keys first — removing items shifts localStorage indices
  const allKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null) allKeys.push(key);
  }

  allKeys.forEach((key) => {
    if (singletonKeys.includes(key) || prefixes.some((p) => key.startsWith(p))) {
      localStorage.removeItem(key);
    }
  });
}

// ── ERROR TYPES ───────────────────────────────────────────────────────────────

export class StorageQuotaError extends Error {
  constructor(key: string, requiredBytes: number, availableBytes: number) {
    super(
      `StorageQuotaError: cannot write "${key}". ` +
        `Required ${requiredBytes}B, available ${availableBytes}B.`,
    );
    this.name = 'StorageQuotaError';
  }
}
