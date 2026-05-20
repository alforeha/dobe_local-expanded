// ─────────────────────────────────────────
// useProgressionStore — PROGRESSION STORE
// Holds: Acts (nested Chains, Quests, Milestones, Markers).
// DEVICE → cloud sync in MULTI-USER.
// ─────────────────────────────────────────

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Aspiration } from '../types';

// ── STATE ─────────────────────────────────────────────────────────────────────

interface ProgressionState {
  /** Keyed by Act.id for O(1) access */
  aspirations: Record<string, Aspiration>;
}

// ── ACTIONS ───────────────────────────────────────────────────────────────────

interface ProgressionActions {
  setAspiration: (aspiration: Aspiration) => void;
  removeAspiration: (aspirationId: string) => void;
  reset: () => void;
}

// ── INITIAL STATE ─────────────────────────────────────────────────────────────

const initialState: ProgressionState = {
  aspirations: {},
};

// ── STORE ─────────────────────────────────────────────────────────────────────

export const useProgressionStore = create<ProgressionState & ProgressionActions>()(
  persist(
    (set) => ({
      ...initialState,

      setAspiration: (aspiration) => {
        set((state) => ({ aspirations: { ...state.aspirations, [aspiration.id]: aspiration } }));
        // TODO: MVP06 — storageSet(storageKey.act(act.id), act)
      },

      removeAspiration: (aspirationId) => {
        set((state) => {
          const aspirations = { ...state.aspirations };
          delete aspirations[aspirationId];
          return { aspirations };
        });
        // TODO: MVP06 — storageDelete(storageKey.act(actId))
      },

      reset: () => set(initialState),
    }),
    { name: 'cdb-progression' },
  ),
);
