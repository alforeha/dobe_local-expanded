// ─────────────────────────────────────────
// STORAGE KEYS
// All localStorage key constants for the CAN-DO-BE LOCAL chapter.
// Derived from CAN-DO-BE_LOCAL_STORAGE-SCHEMA.md § 2 localStorage Key Map.
// ─────────────────────────────────────────

// ── SINGLETON KEYS ────────────────────────────────────────────────────────────

/** Settings singleton */
export const STORAGE_KEY_SETTINGS = 'settings' as const;

/** User singleton */
export const STORAGE_KEY_USER = 'user' as const;

// ── KEYED COLLECTION PREFIXES ─────────────────────────────────────────────────

/** Act — UUID suffix: act:{uuid} */
export const STORAGE_PREFIX_ACT = 'act' as const;

/** PlannedEvent — UUID suffix: plannedEvent:{uuid} */
export const STORAGE_PREFIX_PLANNED_EVENT = 'plannedEvent' as const;

/** Event — UUID suffix: event:{uuid} */
export const STORAGE_PREFIX_EVENT = 'event' as const;

/** QuickActionsEvent — date suffix: qa:{YYYY-MM-DD} */
export const STORAGE_PREFIX_QUICK_ACTIONS = 'qa' as const;

/** Resource — UUID suffix: resource:{uuid} */
export const STORAGE_PREFIX_RESOURCE = 'resource' as const;

/** Task — UUID suffix: task:{uuid} */
export const STORAGE_PREFIX_TASK = 'task' as const;

/** TaskTemplate (user custom only, D34) — UUID suffix: taskTemplate:{uuid} */
export const STORAGE_PREFIX_TASK_TEMPLATE = 'taskTemplate' as const;

/** Badge — UUID suffix: badge:{uuid} */
export const STORAGE_PREFIX_BADGE = 'badge' as const;

/** Gear — UUID suffix: gear:{uuid} */
export const STORAGE_PREFIX_GEAR = 'gear' as const;

/** Useable — UUID suffix: useable:{uuid} */
export const STORAGE_PREFIX_USEABLE = 'useable' as const;

/** Attachment — UUID suffix: attachment:{uuid} */
export const STORAGE_PREFIX_ATTACHMENT = 'attachment' as const;

/** Experience — UUID suffix: experience:{uuid} */
export const STORAGE_PREFIX_EXPERIENCE = 'experience' as const;

// ── KEY BUILDER HELPERS ───────────────────────────────────────────────────────

export const storageKey = {
  act: (uuid: string) => `${STORAGE_PREFIX_ACT}:${uuid}`,
  plannedEvent: (uuid: string) => `${STORAGE_PREFIX_PLANNED_EVENT}:${uuid}`,
  event: (uuid: string) => `${STORAGE_PREFIX_EVENT}:${uuid}`,
  quickActions: (date: string) => `${STORAGE_PREFIX_QUICK_ACTIONS}:${date}`,
  resource: (uuid: string) => `${STORAGE_PREFIX_RESOURCE}:${uuid}`,
  task: (uuid: string) => `${STORAGE_PREFIX_TASK}:${uuid}`,
  taskTemplate: (uuid: string) => `${STORAGE_PREFIX_TASK_TEMPLATE}:${uuid}`,
  badge: (uuid: string) => `${STORAGE_PREFIX_BADGE}:${uuid}`,
  gear: (uuid: string) => `${STORAGE_PREFIX_GEAR}:${uuid}`,
  useable: (uuid: string) => `${STORAGE_PREFIX_USEABLE}:${uuid}`,
  attachment: (uuid: string) => `${STORAGE_PREFIX_ATTACHMENT}:${uuid}`,
  experience: (uuid: string) => `${STORAGE_PREFIX_EXPERIENCE}:${uuid}`,
} as const;

// ── APP BUNDLE KEYS (never in localStorage — documented here for reference) ───

/**
 * @remarks APP BUNDLE objects — never written to localStorage.
 * Listed here for documentation alignment with schema doc § 2.
 */
export const APP_BUNDLE_KEYS = [
  'coach',
  'achievementLibrary',
  'commentLibrary',
  'recommendationsLibrary',
  'characterLibrary',
] as const;
