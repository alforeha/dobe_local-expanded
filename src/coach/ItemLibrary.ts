// ItemLibrary - static item definitions.
// Authoring-time catalogue of all consumables and facilities
// surfaced in the Items tab of RecommendationsRoom.

import type { ResourceType } from '../types/resource';

export type ItemKind = 'consumable' | 'facility';
export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type ItemCategory =
  | 'kitchen'
  | 'bedroom'
  | 'cleaning'
  | 'garden'
  | 'vehicle'
  | 'bathroom'
  | 'workspace';

export interface ItemTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  kind: ItemKind;
  dimensions?: {
    width: number;
    depth: number;
    height: number;
  };
  resourceType: ResourceType;
  category: ItemCategory;
  rarity: ItemRarity;
  isCustom?: boolean;
  builtInTasks?: {
    taskTemplateRef: string;
  }[];
  associatedTaskTemplateRef?: string | null;
}

export interface ItemTaskTemplateMeta {
  ref: string;
  name: string;
  icon: string;
}

export const CUSTOM_ITEM_TEMPLATE_PREFIX = 'custom-item:';

export const itemLibrary: ItemTemplate[] = [
  {
    id: 'item-onion',
    name: 'Onion',
    icon: 'item-onion',
    description: 'A kitchen staple. Good for soups, stews, and building discipline.',
    kind: 'consumable',
    resourceType: 'inventory',
    associatedTaskTemplateRef: 'item-tmpl-cut-onions-01',
    category: 'kitchen',
    rarity: 'common',
    isCustom: false,
  },
  {
    id: 'item-coffee-beans',
    name: 'Coffee Beans',
    icon: 'item-coffee-beans',
    description: 'The foundation of a productive morning.',
    kind: 'consumable',
    resourceType: 'inventory',
    associatedTaskTemplateRef: 'item-tmpl-morning-coffee-01',
    category: 'kitchen',
    rarity: 'common',
    isCustom: false,
  },
  {
    id: 'item-cleaning-supplies',
    name: 'Cleaning Supplies',
    icon: 'item-cleaning-supplies',
    description: 'Sprays, cloths, and brushes - the kit for a clean space.',
    kind: 'consumable',
    resourceType: 'inventory',
    associatedTaskTemplateRef: 'item-tmpl-clean-room-01',
    category: 'cleaning',
    rarity: 'common',
    isCustom: false,
  },
  {
    id: 'item-laundry-detergent',
    name: 'Laundry Detergent',
    icon: 'item-laundry-detergent',
    description: 'Fresh clothes start here.',
    kind: 'consumable',
    resourceType: 'inventory',
    associatedTaskTemplateRef: 'item-tmpl-do-laundry-01',
    category: 'cleaning',
    rarity: 'common',
    isCustom: false,
  },
  {
    id: 'item-cooking-oil',
    name: 'Cooking Oil',
    icon: 'item-cooking-oil',
    description: 'Essential for cooking almost anything well.',
    kind: 'consumable',
    resourceType: 'inventory',
    associatedTaskTemplateRef: null,
    category: 'kitchen',
    rarity: 'common',
    isCustom: false,
  },
  {
    id: 'item-bread',
    name: 'Bread',
    icon: 'item-bread',
    description: 'A staple on every table.',
    kind: 'consumable',
    resourceType: 'inventory',
    associatedTaskTemplateRef: null,
    category: 'kitchen',
    rarity: 'common',
    isCustom: false,
  },
  {
    id: 'item-eggs',
    name: 'Eggs',
    icon: 'item-eggs',
    description: 'Versatile, nutritious, and always in demand.',
    kind: 'consumable',
    resourceType: 'inventory',
    associatedTaskTemplateRef: null,
    category: 'kitchen',
    rarity: 'common',
    isCustom: false,
  },
  {
    id: 'item-bin-bags',
    name: 'Bin Bags',
    icon: 'item-bin-bags',
    description: 'Keep the house clean - always have a spare roll.',
    kind: 'consumable',
    resourceType: 'inventory',
    associatedTaskTemplateRef: null,
    category: 'cleaning',
    rarity: 'common',
    isCustom: false,
  },
  {
    id: 'item-toilet-paper',
    name: 'Toilet Paper',
    icon: 'item-toilet-paper',
    description: 'Never let this run out.',
    kind: 'consumable',
    resourceType: 'inventory',
    associatedTaskTemplateRef: null,
    category: 'bathroom',
    rarity: 'common',
    isCustom: false,
  },
  {
    id: 'item-shampoo',
    name: 'Shampoo',
    icon: 'item-shampoo',
    description: 'Daily grooming essential.',
    kind: 'consumable',
    resourceType: 'inventory',
    associatedTaskTemplateRef: null,
    category: 'bathroom',
    rarity: 'common',
    isCustom: false,
  },
  {
    id: 'item-bed',
    name: 'Bed',
    icon: 'item-bed',
    description: 'Make it every morning. Start the day right.',
    kind: 'facility',
    resourceType: 'home',
    associatedTaskTemplateRef: null,
    category: 'bedroom',
    rarity: 'common',
    isCustom: false,
    builtInTasks: [
      { taskTemplateRef: 'item-tmpl-make-bed-01' },
      { taskTemplateRef: 'item-tmpl-clean-sheets-01' },
    ],
  },
  {
    id: 'item-car',
    name: 'Car',
    icon: 'item-car',
    description: 'A monthly maintenance rhythm keeps it running safely.',
    kind: 'facility',
    resourceType: 'vehicle',
    associatedTaskTemplateRef: null,
    category: 'vehicle',
    rarity: 'common',
    isCustom: false,
    builtInTasks: [
      { taskTemplateRef: 'item-tmpl-weekly-car-check-01' },
      { taskTemplateRef: 'task-res-vehicles-maintenance' },
    ],
  },
  {
    id: 'item-oven',
    name: 'Oven',
    icon: 'item-oven',
    description: 'Monthly cleaning prevents buildup and fire hazards.',
    kind: 'facility',
    resourceType: 'home',
    associatedTaskTemplateRef: null,
    category: 'kitchen',
    rarity: 'common',
    isCustom: false,
    builtInTasks: [
      { taskTemplateRef: 'item-tmpl-clean-oven-01' },
    ],
  },
  {
    id: 'item-garden',
    name: 'Garden',
    icon: 'item-garden',
    description: 'Water daily and it will reward you.',
    kind: 'facility',
    resourceType: 'home',
    associatedTaskTemplateRef: null,
    category: 'garden',
    rarity: 'common',
    isCustom: false,
    builtInTasks: [
      { taskTemplateRef: 'item-tmpl-water-plants-01' },
    ],
  },
  {
    id: 'item-washing-machine',
    name: 'Washing Machine',
    icon: 'item-washing-machine',
    description: 'Run a wash whenever the basket fills.',
    kind: 'facility',
    resourceType: 'home',
    associatedTaskTemplateRef: null,
    category: 'cleaning',
    rarity: 'common',
    isCustom: false,
    builtInTasks: [
      { taskTemplateRef: 'item-tmpl-run-wash-01' },
    ],
  },
  {
    id: 'item-fridge',
    name: 'Fridge',
    icon: 'item-fridge',
    description: 'Clean it monthly to keep food fresh and safe.',
    kind: 'facility',
    resourceType: 'home',
    associatedTaskTemplateRef: null,
    category: 'kitchen',
    rarity: 'common',
    isCustom: false,
    builtInTasks: [
      { taskTemplateRef: 'item-tmpl-clean-fridge-01' },
    ],
  },
  {
    id: 'item-desk',
    name: 'Desk',
    icon: 'item-desk',
    description: 'A clear desk is a clear mind.',
    kind: 'facility',
    resourceType: 'home',
    associatedTaskTemplateRef: null,
    category: 'workspace',
    rarity: 'common',
    isCustom: false,
    builtInTasks: [
      { taskTemplateRef: 'item-tmpl-clear-desk-01' },
    ],
  },
  {
    id: 'item-shower',
    name: 'Shower',
    icon: 'item-shower',
    description: 'Weekly descale keeps it fresh and flowing.',
    kind: 'facility',
    resourceType: 'home',
    associatedTaskTemplateRef: null,
    category: 'bathroom',
    rarity: 'common',
    isCustom: false,
    builtInTasks: [
      { taskTemplateRef: 'item-tmpl-clean-shower-01' },
    ],
  },
  {
    id: 'item-lawnmower',
    name: 'Lawnmower',
    icon: 'item-lawnmower',
    description: 'Fire it up weekly in growing season.',
    kind: 'facility',
    resourceType: 'home',
    associatedTaskTemplateRef: null,
    category: 'garden',
    rarity: 'rare',
    isCustom: false,
    builtInTasks: [
      { taskTemplateRef: 'item-tmpl-mow-lawn-01' },
      { taskTemplateRef: 'task-res-homes-chore' },
    ],
  },
  {
    id: 'item-bicycle',
    name: 'Bicycle',
    icon: 'item-bicycle',
    description: 'Check tyre pressure regularly for a safe ride.',
    kind: 'facility',
    resourceType: 'vehicle',
    associatedTaskTemplateRef: null,
    category: 'vehicle',
    rarity: 'common',
    isCustom: false,
    builtInTasks: [
      { taskTemplateRef: 'item-tmpl-check-tyre-01' },
    ],
  },
];

const ITEM_TASK_TEMPLATE_META: Record<string, ItemTaskTemplateMeta> = {
  'item-tmpl-cut-onions-01': { ref: 'item-tmpl-cut-onions-01', name: 'Cut Onions', icon: 'item-onion' },
  'item-tmpl-morning-coffee-01': { ref: 'item-tmpl-morning-coffee-01', name: 'Morning Coffee', icon: 'item-coffee-beans' },
  'item-tmpl-clean-room-01': { ref: 'item-tmpl-clean-room-01', name: 'Clean Room', icon: 'item-cleaning-supplies' },
  'item-tmpl-do-laundry-01': { ref: 'item-tmpl-do-laundry-01', name: 'Do Laundry', icon: 'item-laundry-detergent' },
  'item-tmpl-make-bed-01': { ref: 'item-tmpl-make-bed-01', name: 'Make Bed', icon: 'item-bed' },
  'item-tmpl-clean-sheets-01': { ref: 'item-tmpl-clean-sheets-01', name: 'Clean Sheets', icon: 'item-bed' },
  'item-tmpl-weekly-car-check-01': { ref: 'item-tmpl-weekly-car-check-01', name: 'Weekly Car Check', icon: 'item-car' },
  'item-tmpl-clean-oven-01': { ref: 'item-tmpl-clean-oven-01', name: 'Clean Oven', icon: 'item-oven' },
  'item-tmpl-water-plants-01': { ref: 'item-tmpl-water-plants-01', name: 'Water Plants', icon: 'item-garden' },
  'item-tmpl-run-wash-01': { ref: 'item-tmpl-run-wash-01', name: 'Run Wash', icon: 'item-washing-machine' },
  'item-tmpl-clean-fridge-01': { ref: 'item-tmpl-clean-fridge-01', name: 'Clean Fridge', icon: 'item-fridge' },
  'item-tmpl-clear-desk-01': { ref: 'item-tmpl-clear-desk-01', name: 'Clear Desk', icon: 'item-desk' },
  'item-tmpl-clean-shower-01': { ref: 'item-tmpl-clean-shower-01', name: 'Clean Shower', icon: 'item-shower' },
  'item-tmpl-mow-lawn-01': { ref: 'item-tmpl-mow-lawn-01', name: 'Mow Lawn', icon: 'item-lawnmower' },
  'item-tmpl-check-tyre-01': { ref: 'item-tmpl-check-tyre-01', name: 'Check Tyre', icon: 'item-bicycle' },
};

export function makeCustomItemTemplateRef(
  name: string,
  kind: ItemKind,
  icon = 'resource-task',
): string {
  return `${CUSTOM_ITEM_TEMPLATE_PREFIX}${kind}:${icon}:${encodeURIComponent(name.trim())}`;
}

export function getItemTemplateByRef(itemTemplateRef: string): ItemTemplate | null {
  const builtIn = itemLibrary.find((item) => item.id === itemTemplateRef);
  if (builtIn) return builtIn;

  if (!itemTemplateRef.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX)) return null;

  const raw = itemTemplateRef.slice(CUSTOM_ITEM_TEMPLATE_PREFIX.length);
  const [kindPart, iconPart, ...nameParts] = raw.split(':');
  const name = decodeURIComponent(nameParts.join(':') || 'Custom Item');
  const kind = kindPart === 'facility' ? 'facility' : 'consumable';

  return {
    id: itemTemplateRef,
    name,
    icon: iconPart || 'resource-task',
    description: 'Custom item',
    kind,
    resourceType: 'inventory',
    category: 'workspace',
    rarity: 'common',
    isCustom: true,
    associatedTaskTemplateRef: null,
  };
}

export function getItemTaskTemplateMeta(taskTemplateRef: string): ItemTaskTemplateMeta | null {
  return ITEM_TASK_TEMPLATE_META[taskTemplateRef] ?? null;
}
