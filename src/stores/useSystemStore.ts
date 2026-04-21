// ─────────────────────────────────────────
// useSystemStore — SYSTEM STORE
// Holds: Settings, session metadata, rollover timestamp.
// Device only — never syncs to cloud.
// MULTI-USER exception: syncs lastRollover timestamp for multi-device coordination (D45).
// ─────────────────────────────────────────

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { NamedLocation, Settings } from '../types';
import type { ResourceType } from '../types/resource';

// ── STATE ─────────────────────────────────────────────────────────────────────

interface SystemState {
  settings: Settings | null;
  /** ISO date of last midnight rollover — stored device-only in LOCAL */
  lastRollover: string | null;
  /** ISO date YYYY-MM-DD when the Welcome Day popup was last shown. */
  lastWelcomeDayDate: string | null;
  /** ISO date of current session start */
  sessionStart: string | null;
  /**
   * Rollover resumability — the step number (1–9) that was in flight when the
   * app last closed. null = no rollover in progress; 0 = rollover fully complete.
   * On boot: if this is set (1–9), rollover resumes from that step.
   */
  rolloverStep: number | null;
  /**
   * Set false when first-run seeding completes. Set true by the Onboarding
   * Adventure quest on completion (W30). null means value not yet initialised.
   */
  onboardingComplete: boolean | null;
  /** Developer mode — enables dev tools in About popup. Enabled by 5-tap on version string. */
  devMode: boolean;
  /** YYYY-MM-DD — set once on app boot, authoritative "what day is it" for all engine code. */
  appDate: string | null;
  /** HH:MM — set once on app boot, base time reference. */
  appTime: string | null;
  /** Hours offset for dev testing (e.g. +3 to simulate 3am). Default 0. */
  timeOffset: number;
  menuResourceTarget: { resourceId: string; resourceType: ResourceType } | null;
}

// ── ACTIONS ───────────────────────────────────────────────────────────────────

interface SystemActions {
  setSettings: (settings: Settings) => void;
  setLastRollover: (timestamp: string) => void;
  setLastWelcomeDayDate: (date: string) => void;
  setSessionStart: (timestamp: string) => void;
  setRolloverStep: (step: number | null) => void;
  setThemeMode: (mode: 'light' | 'dark') => void;
  addNamedLocation: (location: NamedLocation) => void;
  removeNamedLocation: (id: string) => void;
  setActiveLocation: (id: string) => void;
  updateNamedLocation: (id: string, patch: Partial<NamedLocation>) => void;
  setOnboardingComplete: (complete: boolean) => void;
  setDevMode: (val: boolean) => void;
  setAppDateTime: (date: string, time: string) => void;
  setTimeOffset: (offsetHours: number) => void;
  setMenuResourceTarget: (resourceId: string, resourceType: ResourceType) => void;
  clearMenuResourceTarget: () => void;
  reset: () => void;
}

// ── INITIAL STATE ─────────────────────────────────────────────────────────────

const initialState: SystemState = {
  settings: null,
  lastRollover: null,
  lastWelcomeDayDate: null,
  sessionStart: null,
  rolloverStep: null,
  onboardingComplete: null,
  devMode: true,
  appDate: null,
  appTime: null,
  timeOffset: 0,
  menuResourceTarget: null,
};

export const DEFAULT_SETTINGS: Settings = {
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
  displayPreferences: { mode: 'light', theme: 'default' },
  socialPreferences: null,
  notificationPreferences: null,
  storagePreferences: null,
};

// ── STORE ─────────────────────────────────────────────────────────────────────

export const useSystemStore = create<SystemState & SystemActions>()(
  persist(
    (set) => ({
      ...initialState,

      setSettings: (settings) => {
        set({ settings });
        // TODO: MVP06 — also write via storageLayer(STORAGE_KEY_SETTINGS, settings)
      },

      setLastRollover: (lastRollover) => set({ lastRollover }),

      setLastWelcomeDayDate: (lastWelcomeDayDate) => set({ lastWelcomeDayDate }),

      setSessionStart: (sessionStart) => set({ sessionStart }),

      setRolloverStep: (rolloverStep) => set({ rolloverStep }),

      addNamedLocation: (location) =>
        set((state) => {
          const current = state.settings ?? DEFAULT_SETTINGS;
          const existing = current.locationPreferences ?? { locations: [], activeLocationId: null };
          const locations = [...existing.locations, location];
          const activeLocationId = existing.activeLocationId ?? location.id;
          return {
            settings: {
              ...current,
              locationPreferences: { locations, activeLocationId },
            },
          };
        }),

      removeNamedLocation: (id) =>
        set((state) => {
          const current = state.settings ?? DEFAULT_SETTINGS;
          const existing = current.locationPreferences ?? { locations: [], activeLocationId: null };
          const locations = existing.locations.filter((l) => l.id !== id);
          const activeLocationId =
            existing.activeLocationId === id
              ? (locations[0]?.id ?? null)
              : existing.activeLocationId;
          return {
            settings: {
              ...current,
              locationPreferences: { locations, activeLocationId },
            },
          };
        }),

      setActiveLocation: (id) =>
        set((state) => {
          const current = state.settings ?? DEFAULT_SETTINGS;
          const existing = current.locationPreferences ?? { locations: [], activeLocationId: null };
          return {
            settings: {
              ...current,
              locationPreferences: { ...existing, activeLocationId: id },
            },
          };
        }),

      updateNamedLocation: (id, patch) =>
        set((state) => {
          const current = state.settings ?? DEFAULT_SETTINGS;
          const existing = current.locationPreferences ?? { locations: [], activeLocationId: null };
          const locations = existing.locations.map((l) =>
            l.id === id ? { ...l, ...patch } : l,
          );
          return {
            settings: {
              ...current,
              locationPreferences: { ...existing, locations },
            },
          };
        }),

      setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),

      setDevMode: (devMode) => set({ devMode }),

      setAppDateTime: (appDate, appTime) => set({ appDate, appTime }),

      setTimeOffset: (timeOffset) => set({ timeOffset }),

      setMenuResourceTarget: (resourceId, resourceType) =>
        set({ menuResourceTarget: { resourceId, resourceType } }),

      clearMenuResourceTarget: () => set({ menuResourceTarget: null }),

      setThemeMode: (mode) =>
        set((state) => {
          const current = state.settings;
          if (current) {
            return {
              settings: {
                ...current,
                displayPreferences: { ...current.displayPreferences, mode },
              },
            };
          }
          return {
            settings: {
              ...DEFAULT_SETTINGS,
              displayPreferences: { ...DEFAULT_SETTINGS.displayPreferences, mode },
            },
          };
        }),

      reset: () => set(initialState),
    }),
    {
      name: 'cdb-system',
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // ── Migration: convert old { lat, lng } locationPreferences to NamedLocation array ──
        const lp = state.settings?.locationPreferences as
          | { lat?: number; lng?: number; locations?: unknown }
          | undefined;
        if (lp && typeof lp.lat === 'number' && typeof lp.lng === 'number' && !lp.locations) {
          const id = uuidv4();
          state.setSettings({
            ...(state.settings!),
            locationPreferences: {
              locations: [{ id, label: 'Auto', lat: lp.lat, lng: lp.lng, cityName: '' }],
              activeLocationId: id,
            },
          });
        }
      },
    },
  ),
);
