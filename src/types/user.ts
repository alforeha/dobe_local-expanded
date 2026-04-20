// ─────────────────────────────────────────
// USER — CORE SINGLETON
// Root owner of all account data. One per device.
// ─────────────────────────────────────────

import type { UserStats } from './stats';
import type { Avatar } from './avatar';
import type { BadgeBoard } from './badgeBoard';
import type { Equipment } from './equipment';
import type { Feed } from './feed';
import type { InventoryItemTemplate } from './resource';
import type { GTDItem } from './task';

// ── AUTH (STUB) ────────────────────────────────────────────────────────────────

/** STUB: MULTI-USER — reserved for cloud auth/session identity once the MULTI-USER chapter ships. */
export type AuthStub = null;

// ── SUB-OBJECTS ────────────────────────────────────────────────────────────────

export interface UserSystem {
  id: string; // uuid
  displayName: string; // settable annually
  nameChangedAt?: string; // ISO datetime — gates display-name changes
  icon?: string;
  wrappedAnchor: string; // ISO date — gates annual review (D31)
  /** STUB: MULTI-USER — stores the signed-in account/session identity when the MULTI-USER chapter is enabled. */
  auth: AuthStub;
}

export interface UserPersonal {
  nameFirst: string;
  nameLast: string;
  handle: string;
  birthday: string; // ISO date
}

export type StatGroupKey = 'health' | 'strength' | 'agility' | 'defense' | 'charisma' | 'wisdom';

export type StatGroups = Record<StatGroupKey, number>;

export const STAT_GROUP_KEYS: StatGroupKey[] = [
  'health',
  'strength',
  'agility',
  'defense',
  'charisma',
  'wisdom',
];

export interface TalentNode {
  id: string;
  tier: 1 | 2 | 3;
  position: number;
  currentPoints: number;
  maxPoints: number;
  unlocked: boolean;
}

export interface StatTalentTree {
  nodes: TalentNode[];
  totalSpent: number;
}

export interface TalentTrees {
  health: StatTalentTree;
  strength: StatTalentTree;
  agility: StatTalentTree;
  defense: StatTalentTree;
  charisma: StatTalentTree;
  wisdom: StatTalentTree;
}

function makeTalentNodes(stat: StatGroupKey): TalentNode[] {
  return [
    { id: `${stat}-tier1-core`, tier: 1, position: 0, currentPoints: 0, maxPoints: 5, unlocked: true },
    { id: `${stat}-tier2-gear`, tier: 2, position: 0, currentPoints: 0, maxPoints: 5, unlocked: false },
    { id: `${stat}-tier2-event`, tier: 2, position: 1, currentPoints: 0, maxPoints: 5, unlocked: false },
    { id: `${stat}-tier3-capstone`, tier: 3, position: 0, currentPoints: 0, maxPoints: 1, unlocked: false },
  ];
}

export function createDefaultTalentTrees(): TalentTrees {
  return {
    health: { nodes: makeTalentNodes('health'), totalSpent: 0 },
    strength: { nodes: makeTalentNodes('strength'), totalSpent: 0 },
    agility: { nodes: makeTalentNodes('agility'), totalSpent: 0 },
    defense: { nodes: makeTalentNodes('defense'), totalSpent: 0 },
    charisma: { nodes: makeTalentNodes('charisma'), totalSpent: 0 },
    wisdom: { nodes: makeTalentNodes('wisdom'), totalSpent: 0 },
  };
}

export interface UserProgression {
  stats: UserStats;
  avatar: Avatar;
  badgeBoard: BadgeBoard;
  equipment: Equipment;
  gold: number;
  statGroups: StatGroups;
  /** STUB: TALENT-TREE — reserved for unlocked talent-node state when the TALENT-TREE chapter is enabled. */
  talentPoints: number;
  talentTrees: TalentTrees | null;
}

export interface UserLists {
  /** TaskTemplate refs */
  favouritesList: string[];
  /** Task refs (D05) — system/resource/quest-generated */
  gtdList: string[];
  /** Tagged item lists */
  shoppingLists: ShoppingList[];
  /** Manual GTD items — user-created (MVP11 W19) */
  manualGtdList: GTDItem[];
  /** PlannedEvent (Routine) UUID refs owned by this user */
  routineRefs: string[];
  inventoryItemTemplates?: InventoryItemTemplate[];
}

export interface ShoppingItem {
  /** uuid */
  id: string;
  /** Display name — may mirror a Useable name */
  name: string;
  /** Optional Useable Resource ref */
  useableRef: string | null;
  quantity: number | null;
  unit: string | null;
  /** Optional Account Resource ref — enables pending transaction flow on completion */
  accountRef: string | null;
  completed: boolean;
  completedAt: string | null; // ISO date
}

export interface ShoppingList {
  /** uuid */
  id: string;
  /** List name / tag — e.g. "Groceries", "Hardware" */
  name: string;
  items: ShoppingItem[];
}

export interface UserResources {
  homes: string[];
  vehicles: string[];
  contacts: string[];
  accounts: string[];
  inventory: string[];
  docs: string[];
}

/** STUB: MULTI-USER — reserved for the user's shareable public-facing profile once the MULTI-USER chapter ships. */
export type PublicProfileStub = null;

// ── USER ROOT ──────────────────────────────────────────────────────────────────

export interface User {
  system: UserSystem;
  personal: UserPersonal;
  progression: UserProgression;
  lists: UserLists;
  resources: UserResources;
  feed: Feed;
  /** STUB: MULTI-USER — stores the user's shareable profile card once the MULTI-USER chapter is enabled. */
  publicProfile: PublicProfileStub;
}
