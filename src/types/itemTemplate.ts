// ─────────────────────────────────────────
// ITEM TEMPLATE — CORE
// Universal parent for all reward item types.
// Extended by Badge, Gear, Useable, Attachment, and Experience (D21).
// Type-specific data lives in contents{}.
// ─────────────────────────────────────────

// ── ITEM TYPES ────────────────────────────────────────────────────────────────

export type ItemType = 'badge' | 'gear' | 'useable' | 'attachment' | 'experience';

export type ItemSource = 'coach_drop' | 'store' | 'quest_reward' | string;

// ── BASE ITEM TEMPLATE ────────────────────────────────────────────────────────

export interface ItemTemplateBase {
  id: string; // uuid
  type: ItemType;
  name: string;
  description: string;
  /** Ref to icon asset in CharacterLibrary */
  icon: string;
  /** Origin — coach drop, store, quest reward */
  source: ItemSource;
}

// ── BADGE ─────────────────────────────────────────────────────────────────────

export interface BadgeContents {
  /** AchievementDefinition ref — reads icon and sticker from AchievementLibrary */
  achievementRef: string;
  /** Timestamp — used for board render ordering */
  awardedDate: string; // ISO date
  /** true when the badge is actively shown on the board */
  placed?: boolean;
  /** 0-100 percentage placement on the board X axis */
  boardX?: number;
  /** 0-100 percentage placement on the board Y axis */
  boardY?: number;
  /**
   * null = unclaimed
   * {x, y} = placed on board
   * 'claimed' = removed from board
   */
  location: null | { x: number; y: number } | 'claimed';
}

export interface Badge extends ItemTemplateBase {
  type: 'badge';
  contents: BadgeContents;
}

// ── GEAR ──────────────────────────────────────────────────────────────────────

export interface GearContents {
  /** Enum — slot taxonomy BUILD-time task */
  slot: string;
  /** Enum — rarity tier names BUILD-time task */
  rarity: string;
  name: string;
  description: string;
  /** Ref to visual asset in CharacterLibrary — applied to Avatar slot */
  model: string;
  /** XP boost value applied when gear is equipped */
  xpBoost: number;
  /** true when in Avatar.equippedGear slot */
  equippedState: boolean;
}

export interface Gear extends ItemTemplateBase {
  type: 'gear';
  contents: GearContents;
}

// ── USEABLE ───────────────────────────────────────────────────────────────────

export interface UseableMaintenance {
  expiry: string | null;       // ISO date or null
  minQuantity: number;
  inspectionSchedule: string | null;
  howToDocRef: string | null;
  /** Pushes to shoppingList when quantity hits minQuantity */
  autoPushToShoppingList: boolean;
}

export interface UseableContents {
  type: 'consumable' | 'tool';
  name: string;
  /** Ref to icon asset */
  icon: string;
  description: string;
  quantity: number;
  unit: string;
  /** BUILD-time task — full shape TBD */
  maintenance: UseableMaintenance;
}

export interface Useable extends ItemTemplateBase {
  type: 'useable';
  contents: UseableContents;
}

// ── ATTACHMENT ────────────────────────────────────────────────────────────────

export type AttachmentFileType = 'image' | 'text' | 'doc' | string;

export type AttachmentValidationStatus = 'pending' | 'approved' | 'denied';

/** [MULTI-USER] stub — null in LOCAL */
export type ApproverRefStub = null;

export interface AttachmentContents {
  /** Local file reference path */
  fileRef: string;
  /** File size — constrained to 200 KB in LOCAL (D09) */
  size: number;
  /** For renderer */
  type: AttachmentFileType;
  /** Optional Task ref — for contract validation flow */
  taskRef: string | null;
  /** Optional contract validation status */
  validationStatus: AttachmentValidationStatus | null;
  /** [MULTI-USER] stub — null in LOCAL */
  approverRef: ApproverRefStub;
}

export interface Attachment extends ItemTemplateBase {
  type: 'attachment';
  contents: AttachmentContents;
}

// ── EXPERIENCE ────────────────────────────────────────────────────────────────

export interface ExperienceContents {
  rating: number;
  /** Ref to reaction icon */
  iconReaction: string;
  description: string;
  /** Task refs attached to this Experience */
  taskList: string[];
  /** Media refs */
  mediaRoll: string[];
  /** Optional — user-declared completion date */
  dateCompleted: string | null; // ISO date
  /** Sort algorithm — BUILD-time task */
  relevanceScore: number;
  /** User ref */
  authorRef: string;
  /** Linked Event ref */
  eventRef: string;
  timestamp: string; // ISO date
}

export interface Experience extends ItemTemplateBase {
  type: 'experience';
  contents: ExperienceContents;
}

// ── UNION ─────────────────────────────────────────────────────────────────────

export type Item = Badge | Gear | Useable | Attachment | Experience;
