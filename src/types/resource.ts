import type { CircuitInputFields, LogInputFields, TaskType } from './taskTemplate';

// RESOURCE - RESOURCE CLUSTER
// Parent object for all real-world resources.
// Most type-specific data lives in meta{}.
// Contact is a standalone top-level resource shape.
// Each resource type generates a specific task category via prebuilt
// templates in RecommendationsLibrary (D42).

export type ResourceType = 'contact' | 'home' | 'vehicle' | 'account' | 'inventory' | 'doc';

export interface ResourceLogEntry {
  note: string;
  timestamp: string; // ISO date
  /** Optional Task ref */
  taskRef?: string;
}

export interface ResourceNote {
  id: string;
  text: string;
  createdAt: string; // ISO datetime
}

export interface ResourceLink {
  id: string;
  targetResourceId: string;
  relationship: string;
  createdAt: string;
  sourceResourceId?: string;
  isMirrored?: boolean;
}

export const CONTACT_GROUPS = [
  'family',
  'friend',
  'acquaintance',
  'colleague',
  'coworker',
] as const;

export type ContactGroup = typeof CONTACT_GROUPS[number];

export interface ContactLink {
  contactId: string;
  relationship: string;
}

/**
 * Home meta - generates: chore tasks (CHECK / CHECKLIST)
 * rooms[] - each room has a stable id ref (D42).
 * chores[] - household recurring tasks.
 */
export interface HomeRoom {
  id: string;
  icon: string;
  name: string;
  /** Contact IDs assigned to this room */
  assignedTo: string[];
  /** @deprecated Containers are now owned by InventoryResource and placed via InventoryContainerLink. This field is preserved for backward compatibility only. */
  containers: HomeContainer[];
}

export interface ItemRecurringTask {
  id: string;
  taskTemplateRef: string;
  recurrenceMode?: 'recurring' | 'never';
  recurrence: ResourceRecurrenceRule;
  reminderLeadDays?: number;
  lastCompleted?: string;
}

export interface ItemInstance {
  id: string;
  itemTemplateRef: string;
  quantity?: number;
  threshold?: number;
  unit?: string;
  recurringTasks?: ItemRecurringTask[];
}

export interface HomeContainer {
  id: string;
  name: string;
  icon: string;
  items: ItemInstance[];
}

export interface InventoryContainer {
  id: string;
  name: string;
  icon: string;
  items: ItemInstance[];
  carryTask?: {
    id: string;
    name: string;
    recurrenceMode?: 'recurring' | 'never';
    recurrence: ResourceRecurrenceRule;
    reminderLeadDays?: number;
  };
  notes?: ResourceNote[];
  attachments?: string[];
  links?: InventoryContainerLink[];
}

export interface InventoryContainerLink {
  id: string;
  targetKind: 'home-room' | 'vehicle';
  targetResourceId: string;
  targetRoomId?: string;
  targetAreaId?: string;
  relationship: 'location';
  createdAt: string;
}

export interface InventoryCustomTaskTemplate {
  id: string;
  name: string;
  icon: string;
}

export interface InventoryItemTemplate {
  id: string;
  name: string;
  icon: string;
  kind?: 'consumable' | 'facility';
  customTaskTemplates?: InventoryCustomTaskTemplate[];
}

export interface HomeChore {
  id: string;
  icon: string;
  name: string;
  recurrenceMode?: 'recurring' | 'never';
  recurrence: ResourceRecurrenceRule;
  /** Days before task triggers a GTD push. Default 0. -1 = never. */
  reminderLeadDays?: number;
  /** Single contact ID or 'all' */
  assignedTo: string;
}

export const RECURRENCE_DAYS_OF_WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type RecurrenceDayOfWeek = typeof RECURRENCE_DAYS_OF_WEEK[number];

export interface ResourceRecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** How many frequency units between occurrences. Default 1. */
  interval: number;
  /** Days of week - only meaningful when frequency='weekly'. */
  days: RecurrenceDayOfWeek[];
  /** Day of month - only meaningful when frequency='monthly'. */
  monthlyDay?: number | null;
  /** ISO date YYYY-MM-DD - when the recurrence starts. */
  seedDate: string;
  /** ISO date to stop, or null for indefinite. */
  endsOn: string | null;
}

/** Returns a ResourceRecurrenceRule defaulting to weekly from today. */
export function makeDefaultRecurrenceRule(): ResourceRecurrenceRule {
  return {
    frequency: 'weekly',
    interval: 1,
    days: [],
    monthlyDay: null,
    seedDate: new Date().toISOString().slice(0, 10),
    endsOn: null,
  };
}

/** Coerces legacy string recurrence values to ResourceRecurrenceRule. */
export function toRecurrenceRule(r: unknown): ResourceRecurrenceRule {
  if (r && typeof r === 'object' && 'frequency' in r) {
    const rule = r as Partial<ResourceRecurrenceRule>;
    return {
      frequency: (['daily', 'weekly', 'monthly', 'yearly'].includes(String(rule.frequency))
        ? rule.frequency
        : 'weekly') as ResourceRecurrenceRule['frequency'],
      interval: Math.max(1, Number(rule.interval) || 1),
      days: Array.isArray(rule.days) ? rule.days : [],
      monthlyDay: typeof rule.monthlyDay === 'number' ? rule.monthlyDay : null,
      seedDate: typeof rule.seedDate === 'string' && rule.seedDate ? rule.seedDate : new Date().toISOString().slice(0, 10),
      endsOn: typeof rule.endsOn === 'string' ? rule.endsOn : null,
    };
  }
  const freq = typeof r === 'string' ? r : 'weekly';
  return {
    frequency: (['daily', 'weekly', 'monthly', 'yearly'].includes(freq)
      ? freq
      : 'weekly') as ResourceRecurrenceRule['frequency'],
    interval: 1,
    days: [],
    monthlyDay: null,
    seedDate: new Date().toISOString().slice(0, 10),
    endsOn: null,
  };
}

export function normalizeRecurrenceMode(mode: unknown): 'recurring' | 'never' {
  if (mode === 'recurring') return 'recurring';
  if (mode === 'never' || mode === 'intermittent') return 'never';
  return 'recurring';
}

export interface VehicleMaintenanceTask {
  id: string;
  icon: string;
  name: string;
  kind?: 'maintenance' | 'mileage-log';
  taskType?: Extract<TaskType, 'CIRCUIT' | 'LOG'>;
  inputFields?: CircuitInputFields | LogInputFields;
  recurrenceMode?: 'recurring' | 'never';
  recurrence: ResourceRecurrenceRule;
  /** Days before task triggers a GTD push. Default 14. -1 = never. */
  reminderLeadDays: number;
}

export type VehicleLayoutTemplate = 'bike' | 'car' | 'truck' | 'plane';

export interface VehicleZoneInspection {
  id: string;
  date: string;
  result: 'pass' | 'fail';
  notes?: string;
  photoUri?: string;
}

export interface VehicleLayoutArea {
  id: string;
  zoneId: string;
  name: string;
  icon: string;
  allowsContainers: boolean;
  containerIds: string[];
  inspectionHistory: VehicleZoneInspection[];
}

export interface VehicleLayout {
  template: VehicleLayoutTemplate;
  areas: VehicleLayoutArea[];
}

/**
 * Account resource fields - generates: transaction tasks (LOG)
 * kind discriminator: bank | bill | income | debt | subscription | allowance | crypto (D42).
 * pendingTransactions[] for shopping list -> transaction flow.
 */
export type AccountKind = 'bank' | 'bill' | 'income' | 'debt' | 'subscription' | 'allowance' | 'crypto' | string;

export type CryptoUnit = 'whole' | 'sats';

export type PendingTransactionStatus = 'pending' | 'assigned' | 'posted';

export interface PendingTransaction {
  id: string;
  date: string; // ISO date
  description: string;
  /** Shopping list item ref */
  sourceRef: string | null;
  assignedAccountRef: string | null;
  amount: number | null;
  status: PendingTransactionStatus;
}

export interface AccountTask {
  id: string;
  icon: string;
  name: string;
  kind?: 'account-task' | 'transaction-log';
  anticipatedValue?: number;
  recurrenceMode?: 'recurring' | 'never';
  recurrence: ResourceRecurrenceRule;
  /** Days before task triggers a GTD push. Default 7. -1 = never. */
  reminderLeadDays: number;
}

export type DocType = 'reference' | 'manual' | 'contract' | 'license' | 'recipe' | 'course' | string;

export interface DocRecipeIngredient {
  id: string;
  name: string;
  itemRef?: string;
  quantity?: number;
  unit?: string;
}

export interface DocRecipeStep {
  id: string;
  text: string;
}

export interface DocLayoutArea {
  id: string;
  name: string;
  roomId?: string;
}

export interface DocContractDepositTemplate {
  name: string;
  value?: number;
}

export interface ContractTask {
  id: string;
  isUnique: boolean;
  title?: string;
  taskType?: string;
  templateRef?: string;
  parameters?: Record<string, unknown>;
}

export interface ResourceBase {
  /** uuid */
  id: string;
  name: string;
  /** Ref to icon asset */
  icon: string;
  description: string;
  type: ResourceType;
  /** Attachment refs - optional */
  attachments: string[];
  log: ResourceLogEntry[];
}

export interface ContactResource {
  id: string;
  type: 'contact';
  icon: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  displayName: string;
  groups: ContactGroup[];
  customGroups?: string[];
  phone?: string;
  email?: string;
  birthday?: string; // YYYY-MM-DD
  birthdayLeadDays?: number;
  address?: string;
  linkedContacts?: ContactLink[];
  notes?: ResourceNote[];
  links?: ResourceLink[];
  linkedHomeId?: string;
  linkedAccountIds?: string[];
  /** STUB: MULTI-USER - social graph, shared profile */
  sharedProfile: null;
}

export interface HomeResource {
  type: 'home';
  id: string;
  icon: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  address?: string;
  members?: string[];
  rooms?: HomeRoom[];
  chores?: HomeChore[];
  notes?: ResourceNote[];
  links?: ResourceLink[];
  linkedAccountIds?: string[];
  linkedDocIds?: string[];
  /** STUB: MULTI-USER - shared home, co-owners */
  sharedWith: null;
}

export interface VehicleResource {
  id: string;
  type: 'vehicle';
  icon: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  make?: string;
  model?: string;
  year?: number;
  mileage?: number;
  licensePlate?: string;
  insuranceExpiry?: string;
  insuranceLeadDays?: number;
  serviceNextDate?: string;
  serviceLeadDays?: number;
  layout?: VehicleLayout;
  maintenanceTasks?: VehicleMaintenanceTask[];
  notes?: ResourceNote[];
  links?: ResourceLink[];
  linkedContactId?: string;
  linkedAccountId?: string;
  linkedDocIds?: string[];
  /** STUB: MULTI-USER - shared vehicle */
  sharedWith: null;
}

export interface AccountResource {
  id: string;
  type: 'account';
  icon: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  kind: AccountKind;
  institution?: string;
  balance?: number;
  cryptoUnit?: CryptoUnit;
  cryptoTicker?: string;
  dueDate?: string;
  dueDateLeadDays?: number;
  pendingTransactions?: PendingTransaction[];
  accountTasks?: AccountTask[];
  allowanceTasks?: AccountTask[];
  allowanceContactId?: string;
  notes?: ResourceNote[];
  links?: ResourceLink[];
  linkedHomeId?: string;
  linkedContactId?: string;
  linkedAccountId?: string;
  /** STUB: MULTI-USER - shared account access */
  sharedWith: null;
}

export interface InventoryResource extends ResourceBase {
  type: 'inventory';
  createdAt: string;
  updatedAt: string;
  category?: string;
  /** Legacy per-resource item templates. New reusable items live on user.lists.inventoryItemTemplates. */
  itemTemplates?: InventoryItemTemplate[];
  containers?: InventoryContainer[];
  items: ItemInstance[];
  linkedHomeId?: string;
  linkedRoomId?: string;
  notes?: ResourceNote[];
  links?: ResourceLink[];
  sharedWith: null;
}

export interface DocResource {
  id: string;
  type: 'doc';
  icon: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  docType: DocType;
  url?: string;
  licensePhoto?: string;
  licenseNumber?: string;
  renewalNotes?: string;
  expiryDate?: string;
  expiryLeadDays?: number;
  walkthroughType?: 'linear' | 'checklist' | 'none';
  courseProgress?: null;
  notes?: ResourceNote[];
  links?: ResourceLink[];
  linkedResourceRef?: string;
  linkedResourceRefs?: string[];
  linkedContactIds?: string[];
  linkedAccountId?: string;
  contractDepositTemplate?: DocContractDepositTemplate;
  contractTasks?: ContractTask[];
  trackedTasks?: string[];
  recipeIngredients?: DocRecipeIngredient[];
  recipeSteps?: DocRecipeStep[];
  layoutAreas?: DocLayoutArea[];
  sharedWith: null;
}

export type Resource =
  | ContactResource
  | HomeResource
  | VehicleResource
  | AccountResource
  | InventoryResource
  | DocResource;

export function isContact(resource: Resource): resource is ContactResource {
  return resource.type === 'contact';
}

export function isHome(resource: Resource): resource is HomeResource {
  return resource.type === 'home';
}

export function isVehicle(resource: Resource): resource is VehicleResource {
  return resource.type === 'vehicle';
}

export function isAccount(resource: Resource): resource is AccountResource {
  return resource.type === 'account';
}

export function isInventory(resource: Resource): resource is InventoryResource {
  return resource.type === 'inventory';
}

export function isDoc(resource: Resource): resource is DocResource {
  return resource.type === 'doc';
}

const RESOURCE_RELATIONSHIP_OPTIONS: Partial<Record<ResourceType, Partial<Record<ResourceType, string[]>>>> = {
  contact: {
    contact: ['parent', 'child', 'sibling', 'spouse', 'partner', 'friend', 'colleague', 'acquaintance'],
    home: ['resident', 'owner', 'tenant', 'guest'],
    account: ['account holder', 'authorized user'],
    doc: ['signatory', 'recipient'],
  },
  home: {
    contact: ['member'],
    account: ['mortgage', 'rent', 'utility', 'insurance'],
    vehicle: ['garaged here'],
    doc: ['layout', 'lease', 'deed', 'rental agreement', 'inspection report'],
    inventory: ['stored here'],
  },
  vehicle: {
    contact: ['owner', 'driver'],
    account: ['insurance', 'loan', 'registration'],
    doc: ['registration', 'insurance certificate', 'service record'],
  },
  account: {
    contact: ['account holder', 'beneficiary'],
    home: ['mortgage', 'rent', 'utilities'],
    vehicle: ['insurance', 'loan', 'registration'],
    account: ['sub-account', 'parent account', 'direct transaction'],
    doc: ['statement', 'contract'],
  },
};

export function getRelationshipOptions(sourceType: ResourceType, targetType: ResourceType): string[] {
  return RESOURCE_RELATIONSHIP_OPTIONS[sourceType]?.[targetType] ?? ['related document', 'reference'];
}
