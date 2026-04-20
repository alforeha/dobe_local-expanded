// ─────────────────────────────────────────
// EQUIPMENT — DATA (nested in User)
// Passive inventory list of Gear ids owned by the user.
// Definitions live in CharacterLibrary (app bundle). Populated by Coach drops.
// ─────────────────────────────────────────

/** [APP-STORE] stub — null in LOCAL */
export type StoreUnlocksStub = null;

// ── EQUIPMENT ROOT ────────────────────────────────────────────────────────────

export interface Equipment {
  /** Gear id refs — visual definitions resolved from CharacterLibrary at runtime */
  equipment: string[];
  /** [APP-STORE] stub — null in LOCAL */
  storeUnlocks: StoreUnlocksStub;
}
