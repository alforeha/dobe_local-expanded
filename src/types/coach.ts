// ─────────────────────────────────────────
// COACH — APP BUNDLE TYPES (scope: APP)
// Pure function engine. Reads from Zustand stores, returns results, never owns state.
// No LLM ever (D11). No Zustand store (D44).
//
// Contains types for the 4 libraries that live in the Coach app bundle:
//   AchievementLibrary, CommentLibrary, RecommendationsLibrary, CharacterLibrary.
// ─────────────────────────────────────────

import type { TaskTemplate, RecurrenceRule, XpAward } from './taskTemplate';
import type { StatGroupKey } from './user';
import type { GearSlot } from './avatar';

// re-export so coach.ts consumers can use it without importing from user.ts
export type { StatGroupKey };

// ── ACHIEVEMENT LIBRARY ───────────────────────────────────────────────────────

export type AchievementTriggerType =
  | 'first.time'
  | 'counter.threshold'
  | 'streak.threshold'
  | 'level.threshold'
  | 'gold.threshold'
  | 'combination';

export interface AchievementThreshold {
  /** Snapshot field to evaluate — e.g. 'tasksCompleted', 'level', 'gold' */
  field: string;
  /** Required minimum value */
  value: number;
  /** For per-stat achievements — which stat group's statPoints to check */
  statGroup?: string;
  /** For combination type — all six stat groups must meet value */
  allStats?: boolean;
  /** For stat depth achievements — any one stat group must meet value */
  anyStatGroup?: boolean;
}

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  /** Icon ref for Badge rendering */
  icon: string;
  /** Sticker ref for BadgeBoard display */
  sticker: string;
  triggerType: AchievementTriggerType;
  threshold: AchievementThreshold;
  /** Gear item id for badge-triggered Gear drop (optional) */
  rewardRef: string | null;
  /** true for gold tier achievements */
  gold: boolean;
}

export interface AchievementLibrary {
  achievements: AchievementDefinition[];
}

// ── COMMENT LIBRARY ───────────────────────────────────────────────────────────
// Keyed collection of comment copy Coach draws from via ribbet().
// Tone variants per context entry.

/** D-MVP08-T01 — locked tone enum */
export type CoachTone = 'muted' | 'friendly' | 'militant';

export interface CommentEntry {
  /** Context key — from CommentLibrary context key enum (D-MVP08-CL01) */
  contextKey: string;
  variants: Record<CoachTone, string[]>;
}

export interface CommentLibrary {
  comments: CommentEntry[];
}

// ── RECOMMENDATIONS LIBRARY ───────────────────────────────────────────────────
// Prebuilt TaskTemplates and PlannedEvents Coach can suggest or assign.
// Organised by stat group.

export interface RecommendedTask {
  id: string;
  statGroup: StatGroupKey;
  template: TaskTemplate;
  /** Prebuilt RecurrenceRule suggestion */
  suggestedRecurrence: RecurrenceRule | null;
}

export interface RecommendedPlannedEvent {
  id: string;
  statGroup: StatGroupKey;
  name: string;
  description: string;
  taskTemplateRefs: string[];
  suggestedRecurrence: RecurrenceRule | null;
}

export interface RecommendationsLibrary {
  tasks: RecommendedTask[];
  plannedEvents: RecommendedPlannedEvent[];
}

// ── CHARACTER LIBRARY ─────────────────────────────────────────────────────────
// Holds all visual asset definitions for Avatar states, Coach characters,
// holiday overlays, gear models, and XP level threshold table.

export interface AvatarState {
  /** e.g. 'seed' | 'sprout' | 'sapling' | 'tree' */
  id: string;
  label: string;
  xpThreshold: number;
  assetRef: string;
}

export interface CoachCharacter {
  id: string;
  name: string;
  tagline: string;
  catchphrase: string;
  assetRef: string;
  /** Holiday overlay refs — BUILD-time task (optional until populated) */
  holidayOverlays?: Record<string, string>;
  /** true = default frog character */
  isDefault: boolean;
}

export interface GearDefinition {
  id: string;
  /** Slot enum — head | body | hand | feet | accessory (D-MVP08-G01) */
  slot: GearSlot;
  /** Rarity enum — common | rare | epic | legendary (D-MVP08-G02) */
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  name: string;
  description: string;
  assetRef: string;
  /** XP boost multiplier applied when gear is equipped */
  xpBoost: number;
  /** Per-stat bonus displayed in Gear tab e.g. '+5 XP agility' */
  statBonus?: Partial<Record<'health' | 'strength' | 'agility' | 'defense' | 'charisma' | 'wisdom', number>>;
}

export interface BadgeStickerModel {
  achievementRef: string;
  assetRef: string;
}

export interface TalentTierEntry {
  id: string;
  tier: 1 | 2 | 3 | 4 | 5;
  name: string;
  description: string;
  /** Flat stat point bonus added when tier is unlocked */
  statBonus: number;
  /** XP multiplier applied to this stat group's awards — null if no change */
  xpMultiplier: number | null;
  /** Talent points required to unlock this tier */
  talentPointCost: number;
}

/** 5-tier enhancement array for one stat group */
export type TalentTreeDefinition = TalentTierEntry[];

export interface XpLevelThreshold {
  level: number;
  xpRequired: number;
}

export interface SlotTaxonomyVersion {
  version: string;
  slots: GearSlot[];
}

export interface CharacterLibrary {
  avatarStates: AvatarState[];
  coachCharacters: CoachCharacter[];
  gearDefinitions: GearDefinition[];
  badgeStickerModels: BadgeStickerModel[];
  /** 6 trees × 5 tiers — WoW-style talent catalogue (D43) */
  talentTreeDefinitions: Record<string, TalentTreeDefinition>;
  /** RuneScape exponential curve thresholds A=0.25, B=300, C=7 (D43, D49) */
  xpLevelThresholds: XpLevelThreshold[];
  slotTaxonomy: SlotTaxonomyVersion;
}

// ── COACH OBJECT ─────────────────────────────────────────────────────────────
// Properties the Coach function engine carries in its app bundle context.

export interface CoachProperties {
  achievementLibrary: AchievementLibrary;
  commentLibrary: CommentLibrary;
  recommendationsLibrary: RecommendationsLibrary;
  characterLibrary: CharacterLibrary;
  /** Active theme applied when Settings.displayPreferences.theme === 'default' */
  activeTheme: string;
  /** Active character id — read from Settings.coachPreferences.character at call time (D26) */
  activeCharacterId: string;
  /** Active tone — read from Settings.coachPreferences.tone at call time (D26) */
  activeTone: CoachTone;
  /** Seasonal/holiday overlay state */
  seasonalOverlay: string | null;
  /** XP award shape used when no explicit award is defined — +5 to assigned stat group */
  defaultXpAward: XpAward;
}
