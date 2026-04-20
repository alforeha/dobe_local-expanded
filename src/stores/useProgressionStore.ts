// ─────────────────────────────────────────
// useProgressionStore — PROGRESSION STORE
// Holds: Acts (nested Chains, Quests, Milestones, Markers).
// DEVICE → cloud sync in MULTI-USER.
// ─────────────────────────────────────────

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Act } from '../types';

// ── STATE ─────────────────────────────────────────────────────────────────────

interface ProgressionState {
  /** Keyed by Act.id for O(1) access */
  acts: Record<string, Act>;
}

// ── ACTIONS ───────────────────────────────────────────────────────────────────

interface ProgressionActions {
  setAct: (act: Act) => void;
  removeAct: (actId: string) => void;
  reset: () => void;
}

// ── INITIAL STATE ─────────────────────────────────────────────────────────────

const initialState: ProgressionState = {
  acts: {},
};

// ── STORE ─────────────────────────────────────────────────────────────────────

export const useProgressionStore = create<ProgressionState & ProgressionActions>()(
  persist(
    (set) => ({
      ...initialState,

      setAct: (act) => {
        set((state) => ({ acts: { ...state.acts, [act.id]: act } }));
        // TODO: MVP06 — storageSet(storageKey.act(act.id), act)
      },

      removeAct: (actId) => {
        set((state) => {
          const acts = { ...state.acts };
          delete acts[actId];
          return { acts };
        });
        // TODO: MVP06 — storageDelete(storageKey.act(actId))
      },

      reset: () => set(initialState),
    }),
    { name: 'cdb-progression' },
  ),
);
