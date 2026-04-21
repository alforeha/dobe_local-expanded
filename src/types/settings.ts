// ─────────────────────────────────────────
// SETTINGS — SYSTEM SINGLETON
// Stores all user-controlled application preferences.
// No id — singleton per device.
// ─────────────────────────────────────────

export interface ViewTimeRange {
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
}

/** Time range + which days of the week are visible (0=Mon … 6=Sun) */
export interface WeekViewPreferences extends ViewTimeRange {
  visibleDays: number[];
}

export interface TimePreferences {
  dayView: ViewTimeRange;
  weekView: WeekViewPreferences;
  explorerView: WeekViewPreferences;
}

export interface TrackingSettings {
  // BUILD-time task — shape TBD
  [key: string]: unknown;
}

export interface CoachPreferences {
  tone: string;
  trackingSettings: TrackingSettings;
  character: 'default' | string;
  sourceTypeToggles: Record<string, boolean>;
}

export interface DisplayPreferences {
  mode: 'light' | 'dark';
  theme: 'default' | string; // defers to Coach.activeTheme when 'default'
}

// ── STUB PROPERTIES (LOCAL chapter — stored as null) ──────────────────────────

/** [MULTI-USER] Social and sharing preferences */
export type SocialPreferencesStub = null;

/** [APP-STORE] Push notification and alarm settings */
export type NotificationPreferencesStub = null;

/** [MULTI-USER / APP-STORE] Storage provider, lastSynced, cloudRef */
export type StoragePreferencesStub = null;

// ── LOCATION ─────────────────────────────────────────────────────────────────

export interface NamedLocation {
  id: string;
  label: string;
  lat: number;
  lng: number;
  cityName: string;
}

export interface LocationPreferences {
  locations: NamedLocation[];
  activeLocationId: string | null;
}

// ── SETTINGS ROOT ─────────────────────────────────────────────────────────────

export interface Settings {
  timePreferences: TimePreferences;
  coachPreferences: CoachPreferences;
  displayPreferences: DisplayPreferences;
  locationPreferences?: LocationPreferences;
  /** [MULTI-USER] stub — null in LOCAL */
  socialPreferences: SocialPreferencesStub;
  /** [APP-STORE] stub — null in LOCAL */
  notificationPreferences: NotificationPreferencesStub;
  /** [MULTI-USER / APP-STORE] stub — null in LOCAL */
  storagePreferences: StoragePreferencesStub;
}
