// ─────────────────────────────────────────
// AVATAR — DATA (nested in User)
// Visual representation of the user.
// Visual state (seed → tree) derived at runtime from XP thresholds via CharacterLibrary.
// Stores equipped gear ids and slot taxonomy reference only.
// ─────────────────────────────────────────

export const GEAR_SLOTS = ['head', 'body', 'hand', 'feet', 'accessory'] as const;

export type GearSlot = typeof GEAR_SLOTS[number];

/** Keyed by canonical gear slot */
export type EquippedGear = Partial<Record<GearSlot, string>>;

/** STUB: MULTI-USER — reserved for avatar sharing visibility once the MULTI-USER chapter ships. */
export type PublicVisibilityStub = null;

/** STUB: APP-STORE — reserved for unlockable extra avatar animation packs once the APP-STORE chapter ships. */
export type AdditionalAnimationsStub = null;

// ── AVATAR ROOT ────────────────────────────────────────────────────────────────

export interface Avatar {
  equippedGear: EquippedGear;
  /** References slot taxonomy version in CharacterLibrary */
  slotTaxonomyRef: string;
  /** STUB: MULTI-USER — stores whether the avatar can be shown to other users once the MULTI-USER chapter is enabled. */
  publicVisibility: PublicVisibilityStub;
  /** STUB: APP-STORE — stores purchased/unlocked extra animations once the APP-STORE chapter is enabled. */
  additionalAnimations: AdditionalAnimationsStub;
}
