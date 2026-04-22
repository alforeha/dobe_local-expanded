// ─────────────────────────────────────────
// STARTER QUEST LIBRARY — W28 Spec
// All Coach-seeded Acts for first-run content.
// Source of truth: docs/W28_Starter_Quest_Spec.md
//
// Exports:
//   starterQuestLibrary — { acts: Act[], taskTemplates: TaskTemplate[] }
//   seedStarterContent() — writes Acts to progressionStore
//
// Seeding triggered by W30 first-run flow. Export is the handoff point.
// ─────────────────────────────────────────

import {
  type Act,
  type Chain,
  type Quest,
  type ActCommitment,
  makeDefaultActToggle,
  makeDefaultChainUnlockCondition,
} from '../types/act';
import type { Marker, MarkerConditionType, MarkerTriggerSource } from '../types/quest/Marker';
import type { QuestTimely } from '../types/quest/timely';
import type { QuestSpecific } from '../types/quest/specific';
import type { QuestMeasurable } from '../types/quest/measurable';
import type { QuestExigency } from '../types/quest/exigency';
import type { TaskTemplate, XpAward, TaskSecondaryTag, RecurrenceRule } from '../types/taskTemplate';
import { normalizeTaskTemplateIconKey } from '../constants/iconMap';
import { useProgressionStore } from '../stores/useProgressionStore';

// ── STABLE ACT IDs ────────────────────────────────────────────────────────────
// Fixed UUIDs so seeding is idempotent — re-seeding won't duplicate Acts.

export const STARTER_ACT_IDS = {
  onboarding:  'act-onboarding-00000000-0000-0000-0000',
  daily:       'act-daily-00000000-0000-0000-0000-0001',
  health:      'act-health-00000000-0000-0000-0000-0002',
  strength:    'act-strength-00000000-0000-0000-0003',
  agility:     'act-agility-00000000-0000-0000-0004',
  defense:     'act-defense-00000000-0000-0000-0005',
  charisma:    'act-charisma-00000000-0000-0000-0006',
  wisdom:      'act-wisdom-00000000-0000-0000-00007',
} as const;

// ── STABLE TASK TEMPLATE IDs ─────────────────────────────────────────────────

export const STARTER_TEMPLATE_IDS = {
  roll:             'task-sys-lucky-roll',
  drinkWater:       'task-hlth-drink-water',
  logEntry:         'task-wis-journal-entry',
  openWelcomeEvent: 'task-sys-open-welcome-event',
  exploreCoach:     'task-sys-explore-coach',
  addRoutine:       'task-sys-add-routine',
  exploreTimeViews: 'task-sys-explore-time-views',
  completeLuckyRoll:'task-sys-complete-lucky-roll',
  completeGtd:      'task-sys-complete-gtd',
  exploreTaskRoom:  'task-sys-explore-task-room',
  exploreScheduleRoom: 'task-sys-explore-schedule-room',
  exploreResources: 'task-sys-explore-resources',
  addFavourite:     'task-sys-add-favourite',
  setDisplayName:   'task-sys-set-display-name',
  openBadgeRoom:    'task-sys-open-badge-room',
  openEquipmentRoom:'task-sys-open-equipment-room',
  placeBadge:       'task-sys-place-badge',
  equipGear:        'task-sys-equip-gear',
  openAdventures:   'task-sys-open-adventures',
  clearTheDeck:     'task-sys-clear-the-deck',
  completeOnboardingAdventure: 'task-sys-complete-onboarding-adventure',
  setupSchedule:    'tmpl-setup-schedule-000-0000-0000-01',
  learnGrounds:     'tmpl-learn-grounds-000-0000-0000-0001',
  claimIdentity:    'tmpl-claim-identity-00-0000-0000-0001',
  bodyLog:          'task-hlth-body-scan',
  mealLog:          'task-hlth-log-meal',
  loginCheck:       'task-sys-daily-login',
  sleepCircuit:     'task-hlth-track-sleep',
  walkRoute:        'task-str-go-for-walk',
  workoutCheck:     'task-str-full-body-circuit',
  chore:            'task-agi-put-dishes-away',
  clearInbox:       'task-agi-clear-inbox',
  logTransaction:   'task-res-accounts-transaction',
  inventoryReplenish: 'task-res-inventory-replenish',
  selfCompliment:   'task-chr-self-compliment',
  gratitude:        'task-chr-give-gratitude',
  kindness:         'task-chr-act-of-kindness',
  reachOut:         'task-chr-reach-out',
  meditation:       'task-wis-meditation-timer',
  moodLog:          'task-wis-mood-entry',
  studySession:     'task-wis-study-session',
  dreamEntry:       'task-wis-dream-entry',
} as const;

// ── HELPERS ───────────────────────────────────────────────────────────────────

const DAILY_RULE: RecurrenceRule = {
  frequency: 'daily',
  days: [],
  interval: 1,
  endsOn: null,
  customCondition: null,
};

function makeTaskCountMarker(
  questRef: string,
  templateRef: string,
  threshold: number,
  scopeType: 'taskTemplateRef' | 'statGroup' | 'systemEvent',
  scopeRef: string,
  triggerSource: MarkerTriggerSource = 'rollover',
): Marker {
  return {
    questRef,
    conditionType: 'taskCount',
    triggerSource,
    interval: null,
    xpThreshold: null,
    threshold,
    taskCountScope: { type: scopeType, ref: scopeRef },
    taskTemplateRef: templateRef,
    lastFired: null,
    xpAtLastFire: null,
    taskCountAtLastFire: null,
    nextFire: null,
    activeState: true,
    sideEffects: null,
  };
}

function makeTimely(marker: Marker, conditionType: MarkerConditionType = 'interval'): QuestTimely {
  return {
    conditionType,
    interval: conditionType === 'interval' ? DAILY_RULE : null,
    xpThreshold: null,
    markers: [marker],
    projectedFinish: null,
  };
}

function withImmediateUnlock(quest: Quest): Quest {
  return {
    ...quest,
    completionState: 'active',
    attainable: {
      ...quest.attainable,
      unlockCondition: 'immediate',
    },
  };
}

const EMPTY_COMMITMENT: ActCommitment = {
  trackedTaskRefs: [],
  routineRefs: [],
};

const EMPTY_MEASURABLE: QuestMeasurable = {};

function noStatXp(): XpAward {
  return { health: 0, strength: 0, agility: 0, defense: 0, charisma: 0, wisdom: 0 };
}

// ── STARTER TASK TEMPLATES ────────────────────────────────────────────────────
// Only templates NOT already present in TaskTemplateLibrary.json.
// Prebuilt IDs (drinkWater, walkRoute, meditation, studySession) are referenced
// via STARTER_TEMPLATE_IDS but NOT re-declared here — they already exist.

const rawStarterTaskTemplates: TaskTemplate[] = [
  // ONBOARDING SYSTEM TASKS — hidden from user-facing pickers and completed automatically.
  {
    id: STARTER_TEMPLATE_IDS.openWelcomeEvent,
    isSystem: true,
    isCustom: false,
    name: 'Open the Welcome Event',
    description: 'System onboarding completion for opening the Welcome Event.',
    icon: 'check',
    taskType: 'CHECK',
    inputFields: { label: 'Open the Welcome Event' },
    xpAward: { health: 0, strength: 0, agility: 5, defense: 0, charisma: 0, wisdom: 0 },
    xpBonus: 0,
    secondaryTag: null,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.exploreCoach,
    isSystem: true,
    isCustom: false,
    name: 'Explore the Coach',
    description: 'System onboarding completion for opening the Coach.',
    icon: 'coach',
    taskType: 'CHECK',
    inputFields: { label: 'Explore the Coach' },
    xpAward: noStatXp(),
    xpBonus: 0,
    secondaryTag: null,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.addRoutine,
    isSystem: true,
    isCustom: false,
    name: 'Add a Routine',
    description: 'System onboarding completion for adding a routine.',
    icon: 'routine',
    taskType: 'CHECK',
    inputFields: { label: 'Add a Routine' },
    xpAward: noStatXp(),
    xpBonus: 0,
    secondaryTag: null,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.exploreTimeViews,
    isSystem: true,
    isCustom: false,
    name: 'Explore Time Views',
    description: 'System onboarding completion for visiting Week and Explorer views.',
    icon: 'calendar',
    taskType: 'CHECK',
    inputFields: { label: 'Explore Time Views' },
    xpAward: noStatXp(),
    xpBonus: 0,
    secondaryTag: null,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.completeLuckyRoll,
    isSystem: true,
    isCustom: false,
    name: 'Complete the Lucky Roll',
    description: 'System onboarding completion for rolling the Lucky Dice.',
    icon: 'roll',
    taskType: 'CHECK',
    inputFields: { label: 'Complete the Lucky Roll' },
    xpAward: noStatXp(),
    xpBonus: 0,
    secondaryTag: null,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.completeGtd,
    isSystem: true,
    isCustom: false,
    name: 'Complete a GTD Task',
    description: 'System onboarding completion for finishing a GTD task.',
    icon: 'checklist',
    taskType: 'CHECK',
    inputFields: { label: 'Complete a GTD Task' },
    xpAward: noStatXp(),
    xpBonus: 0,
    secondaryTag: null,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.exploreTaskRoom,
    isSystem: true,
    isCustom: false,
    name: 'Explore the Task Room',
    description: 'System onboarding completion for opening the Task Room.',
    icon: 'task',
    taskType: 'CHECK',
    inputFields: { label: 'Explore the Task Room' },
    xpAward: noStatXp(),
    xpBonus: 0,
    secondaryTag: null,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.exploreScheduleRoom,
    isSystem: true,
    isCustom: false,
    name: 'Explore the Schedule Room',
    description: 'System onboarding completion for opening the Schedule Room.',
    icon: 'calendar',
    taskType: 'CHECK',
    inputFields: { label: 'Explore the Schedule Room' },
    xpAward: noStatXp(),
    xpBonus: 0,
    secondaryTag: null,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.exploreResources,
    isSystem: true,
    isCustom: false,
    name: 'Explore Resources',
    description: 'System onboarding completion for opening Resources.',
    icon: 'resource-task',
    taskType: 'CHECK',
    inputFields: { label: 'Explore Resources' },
    xpAward: noStatXp(),
    xpBonus: 0,
    secondaryTag: null,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.addFavourite,
    isSystem: true,
    isCustom: false,
    name: 'Add a Favourite Task',
    description: 'System onboarding completion for favouriting a task.',
    icon: 'star',
    taskType: 'CHECK',
    inputFields: { label: 'Add a Favourite Task' },
    xpAward: noStatXp(),
    xpBonus: 0,
    secondaryTag: null,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.setDisplayName,
    isSystem: true,
    isCustom: false,
    name: 'Set Display Name',
    description: 'System onboarding completion for setting a display name.',
    icon: 'contact',
    taskType: 'CHECK',
    inputFields: { label: 'Set Display Name' },
    xpAward: noStatXp(),
    xpBonus: 0,
    secondaryTag: null,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.openBadgeRoom,
    isSystem: true,
    isCustom: false,
    name: 'Open Badge Room',
    description: 'System onboarding completion for opening the Badge Room.',
    icon: 'badge',
    taskType: 'CHECK',
    inputFields: { label: 'Open Badge Room' },
    xpAward: noStatXp(),
    xpBonus: 0,
    secondaryTag: null,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.openEquipmentRoom,
    isSystem: true,
    isCustom: false,
    name: 'Open Equipment Room',
    description: 'System onboarding completion for opening the Equipment Room.',
    icon: 'equipment',
    taskType: 'CHECK',
    inputFields: { label: 'Open Equipment Room' },
    xpAward: noStatXp(),
    xpBonus: 0,
    secondaryTag: null,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.placeBadge,
    isSystem: true,
    isCustom: false,
    name: 'Place a Badge',
    description: 'System onboarding completion for placing a badge.',
    icon: 'badge',
    taskType: 'CHECK',
    inputFields: { label: 'Place a Badge' },
    xpAward: noStatXp(),
    xpBonus: 0,
    secondaryTag: null,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.equipGear,
    isSystem: true,
    isCustom: false,
    name: 'Equip Gear',
    description: 'System onboarding completion for equipping gear.',
    icon: 'equipment',
    taskType: 'CHECK',
    inputFields: { label: 'Equip Gear' },
    xpAward: noStatXp(),
    xpBonus: 0,
    secondaryTag: null,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.openAdventures,
    isSystem: true,
    isCustom: false,
    name: 'Open the Goal Room',
    description: 'System onboarding completion for opening the Goal Room.',
    icon: 'act-onboarding',
    taskType: 'CHECK',
    inputFields: { label: 'Open the Goal Room' },
    xpAward: noStatXp(),
    xpBonus: 0,
    secondaryTag: null,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.clearTheDeck,
    isSystem: true,
    isCustom: false,
    name: 'Clear the Deck',
    description: 'System daily quest check-in for completing all scheduled events.',
    icon: 'check',
    taskType: 'CHECK',
    inputFields: { label: 'Clear the Deck' },
    xpAward: noStatXp(),
    xpBonus: 0,
    secondaryTag: null,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.completeOnboardingAdventure,
    isSystem: true,
    isCustom: false,
    name: 'Completed Onboarding Adventure!',
    description: 'Mark onboarding as acknowledged and closed out.',
    icon: 'act-onboarding',
    taskType: 'CHECK',
    inputFields: { label: 'Completed Onboarding Adventure!' },
    xpAward: noStatXp(),
    xpBonus: 0,
    secondaryTag: null,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.setupSchedule,
    isSystem: true,
    name: 'Set Up Your Schedule',
    description: 'Explore prebuilts, add a default routine, and switch between time views.',
    icon: 'checklist',
    taskType: 'CHECKLIST',
    inputFields: {
      items: [
        { key: 'add_routine', label: 'Add a default routine from prebuilts' },
        { key: 'week_view', label: 'Switch to Week view' },
        { key: 'month_view', label: 'Switch to Month view' },
      ],
    },
    xpAward: noStatXp(),
    xpBonus: 40,
    secondaryTag: 'admin' as TaskSecondaryTag,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.learnGrounds,
    isSystem: true,
    name: 'Learn the Grounds',
    description: 'Explore resources, add a favourite task, and complete one favourite from Quick Actions.',
    icon: 'checklist',
    taskType: 'CHECKLIST',
    inputFields: {
      items: [
        { key: 'complete_roll', label: 'Roll the lucky dice' },
        { key: 'complete_favourite', label: 'Complete a favourite action' },
        { key: 'open_schedule', label: 'Open the Schedule room' },
        { key: 'open_task_room', label: 'Open the Task room' },
        { key: 'open_resources', label: 'Open the Resources room' },
        { key: 'add_favourite', label: 'Add a favourite task' },
      ],
    },
    xpAward: noStatXp(),
    xpBonus: 40,
    secondaryTag: 'admin' as TaskSecondaryTag,
    cooldown: null,
    media: null,
    items: [],
  },
  {
    id: STARTER_TEMPLATE_IDS.claimIdentity,
    isSystem: true,
    name: 'Claim Your Identity',
    description: 'Open your profile, set your display name, visit Badge and Equipment, and open the Goals room in the menu.',
    icon: 'checklist',
    taskType: 'CHECKLIST',
    inputFields: {
      items: [
        { key: 'open_profile', label: 'Open your profile' },
        { key: 'display_name', label: 'Set your display name' },
        { key: 'open_badges', label: 'Open the Badge Room' },
        { key: 'open_equipment', label: 'Open the Equipment Room' },
        { key: 'open_adventures', label: 'Open the Goals room in the menu' },
      ],
    },
    xpAward: noStatXp(),
    xpBonus: 40,
    secondaryTag: 'social' as TaskSecondaryTag,
    cooldown: null,
    media: null,
    items: [],
  },
];

export const starterTaskTemplates: TaskTemplate[] = rawStarterTaskTemplates.map((template) => ({
  ...template,
  icon: normalizeTaskTemplateIconKey(template.icon, template.taskType),
}));

// ── QUEST FACTORY HELPERS ─────────────────────────────────────────────────────

const DEFAULT_EXIGENCY: QuestExigency = { onMissedFinish: 'sleep' };

function makeQuest(
  name: string,
  description: string,
  timely: QuestTimely,
  measurable: QuestMeasurable,
  specific: QuestSpecific,
  questReward: string,
): Quest {
  return {
    name,
    description,
    icon: 'quest',
    completionState: 'active',
    specific,
    measurable,
    attainable: {},
    relevant: {},
    timely,
    exigency: DEFAULT_EXIGENCY,
    result: {},
    milestones: [],
    questReward,
    progressPercent: 0,
  };
}

function taskInputSpecific(targetValue: number, unit: string | null = null): QuestSpecific {
  return {
    targetValue,
    unit,
    sourceType: 'taskInput',
    resourceRef: null,
    resourceProperty: null,
  };
}

// ── ACT 1 — ONBOARDING ADVENTURE ─────────────────────────────────────────────

const OB_ACT_ID = STARTER_ACT_IDS.onboarding;

// Quest 1 — Ripple
const q1: Quest = makeQuest(
  'Ripple',
  'Open the Welcome Event and complete the task inside it to make your first ripple.',
  {
    conditionType: 'none',
    interval: null,
    xpThreshold: null,
    markers: [],
    projectedFinish: null,
  },
  { taskTemplateRefs: [STARTER_TEMPLATE_IDS.openWelcomeEvent] },
  taskInputSpecific(1),
  '',
);
q1.relevant = { statGroup: 'health' };

const q2: Quest = makeQuest(
  'Splash',
  'Set up your schedule, explore prebuilt routines, and switch between time views.',
  {
    conditionType: 'none',
    interval: null,
    xpThreshold: null,
    markers: [],
    projectedFinish: null,
  },
  {
    taskTemplateRefs: [
      STARTER_TEMPLATE_IDS.exploreCoach,
      STARTER_TEMPLATE_IDS.addRoutine,
      STARTER_TEMPLATE_IDS.exploreTimeViews,
    ],
  },
  taskInputSpecific(3),
  '',
);
q2.relevant = { statGroup: 'defense' };

const q3: Quest = makeQuest(
  'High Ground',
  'Roll the lucky dice, explore core rooms, and add a favourite task.',
  {
    conditionType: 'none',
    interval: null,
    xpThreshold: null,
    markers: [],
    projectedFinish: null,
  },
  {
    taskTemplateRefs: [
      STARTER_TEMPLATE_IDS.completeLuckyRoll,
      STARTER_TEMPLATE_IDS.exploreTaskRoom,
      STARTER_TEMPLATE_IDS.exploreScheduleRoom,
      STARTER_TEMPLATE_IDS.exploreResources,
      STARTER_TEMPLATE_IDS.addFavourite,
    ],
  },
  taskInputSpecific(5),
  'gear-starter-hat',
);
q3.relevant = { statGroup: 'wisdom' };

const q4: Quest = makeQuest(
  'Stake Your Claim',
  'Set your display name, open Badge Room, open Equipment Room, and open the Goal Room.',
  {
    conditionType: 'none',
    interval: null,
    xpThreshold: null,
    markers: [],
    projectedFinish: null,
  },
  {
    taskTemplateRefs: [
      STARTER_TEMPLATE_IDS.setDisplayName,
      STARTER_TEMPLATE_IDS.openBadgeRoom,
      STARTER_TEMPLATE_IDS.openEquipmentRoom,
      STARTER_TEMPLATE_IDS.openAdventures,
    ],
  },
  taskInputSpecific(4),
  '',
);
q4.relevant = { statGroup: 'charisma' };

const onboardingChain: Chain = {
  name: 'Welcome to CAN-DO-BE',
  description: 'Four quests that walk you through the core system.',
  icon: 'chain',
  wish: 'Build a life worth levelling up',
  outcome: 'A fully configured system that works with your real life',
  obstacle: 'Skipping setup means missing the loop',
  plan: {},
  chainReward: 'xp-chain-onboarding',
  unlockCondition: makeDefaultChainUnlockCondition(0),
  quests: [q1, q2, q3, q4],
  completionState: 'active',
};

export const onboardingAct: Act = {
  id: OB_ACT_ID,
  name: 'Onboarding Adventure',
  description: 'Your first chapter. Complete four quests to set up your system and step into the pond.',
  icon: 'act-onboarding',
  owner: 'coach',
  habitat: 'adventures',
  chains: [onboardingChain],
  accountability: null,
  commitment: EMPTY_COMMITMENT,
  toggle: makeDefaultActToggle(),
  completionState: 'active',
  sharedContacts: null,
};

// ── ACT 2 — DAILY ADVENTURE ───────────────────────────────────────────────────
// D79: Transforms from Onboarding Act on completion — same Act object, relabelled.
// Chain 0 (Onboarding) stays in history. Rollover appends a new Chain each day.
// This is the template for the daily Chain structure only.

const DA_ACT_ID = STARTER_ACT_IDS.daily;

function makeDailyRollQuest(_actId: string, _chainIdx: number): Quest {
  const quest = withImmediateUnlock(
    makeQuest(
      'Daily Roll',
      'Roll the Lucky Dice in Quick Actions for today\'s XP boost.',
      {
        conditionType: 'none',
        interval: null,
        xpThreshold: null,
        markers: [],
        projectedFinish: null,
      },
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.roll] },
      taskInputSpecific(1),
      'xp-roll',
    ),
  );
  quest.relevant = { statGroup: 'charisma' };
  return quest;
}

function makeDailyWaterQuest(_actId: string, _chainIdx: number): Quest {
  const quest = withImmediateUnlock(
    makeQuest(
      'Daily Water',
      'Complete 3 Drink Water tasks across the day.',
      {
        conditionType: 'none',
        interval: null,
        xpThreshold: null,
        markers: [],
        projectedFinish: null,
      },
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.drinkWater] },
      taskInputSpecific(3, 'tasks'),
      'xp-water',
    ),
  );
  quest.relevant = { statGroup: 'health' };
  return quest;
}

function makeDailyLogQuest(_actId: string, _chainIdx: number): Quest {
  const quest = withImmediateUnlock(
    makeQuest(
      'Complete Tasks',
      'Complete 10 tasks today - any stat or resource task counts.',
      {
        conditionType: 'none',
        interval: null,
        xpThreshold: null,
        markers: [],
        projectedFinish: null,
      },
      { taskTemplateRefs: [] },
      taskInputSpecific(10, 'tasks'),
      'xp-log',
    ),
  );
  quest.relevant = { statGroup: 'strength' };
  return quest;
}

function makeDailyClearDeckQuest(actId: string, chainIdx: number): Quest {
  const marker: Marker = {
    questRef: `${actId}|${chainIdx}|3`,
    conditionType: 'none',
    triggerSource: 'rollover',
    interval: null,
    xpThreshold: null,
    threshold: null,
    taskCountScope: null,
    taskTemplateRef: STARTER_TEMPLATE_IDS.clearTheDeck,
    lastFired: null,
    xpAtLastFire: null,
    taskCountAtLastFire: null,
    nextFire: null,
    activeState: true,
    sideEffects: null,
  };
  const quest = withImmediateUnlock(
    makeQuest(
      'Clear the Deck',
      'Complete all scheduled events by the end of the day.',
      makeTimely(marker, 'none'),
      EMPTY_MEASURABLE,
      taskInputSpecific(1),
      'xp-clear-deck',
    ),
  );
  quest.relevant = { statGroup: 'agility' };
  return quest;
}

/** Build a single daily Chain (Chain 1 = first post-onboarding day, etc.) */
export function makeDailyChain(actId: string, chainIdx: number, date: string): Chain {
  return {
    name: `Day ${chainIdx} — ${date}`,
    description: 'Four daily quests. Complete them before midnight.',
    icon: 'chain-daily',
    wish: 'Show up every day',
    outcome: 'A streak of consistent daily action',
    obstacle: 'Getting distracted or forgetting to check in',
    plan: {},
    chainReward: 'xp-daily-chain',
    unlockCondition: makeDefaultChainUnlockCondition(chainIdx),
    quests: [
      makeDailyRollQuest(actId, chainIdx),
      makeDailyWaterQuest(actId, chainIdx),
      makeDailyLogQuest(actId, chainIdx),
      makeDailyClearDeckQuest(actId, chainIdx),
    ],
    adaptiveQuests: [],
    completionState: 'active',
  };
}

export const dailyAct: Act = {
  id: DA_ACT_ID,
  name: 'Daily Adventure',
  description: 'A new chain each day. Roll, hydrate, log, and clear the deck.',
  icon: 'act-daily',
  owner: 'coach',
  habitat: 'adventures',
  chains: [], // populated at onboarding completion and daily rollover
  accountability: null,
  commitment: EMPTY_COMMITMENT,
  toggle: makeDefaultActToggle(),
  completionState: 'active',
  sharedContacts: null,
};

// ── STAT PATH ACTS ────────────────────────────────────────────────────────────
// One Chain per Act, four Quests, taskCount Markers with thresholds 3/6/12/24.

function makeStatPathAct(
  id: string,
  name: string,
  description: string,
  quests: Quest[],
): Act {
  const chain: Chain = {
    name: `${name} — Chain 1`,
    description: `Four progressive quests building your ${name.toLowerCase().replace(' path', '')} stat.`,
    icon: 'chain-stat',
    wish: `Build consistent ${name.toLowerCase().replace(' path', '')} habits`,
    outcome: `Measurable improvement in ${name.toLowerCase().replace(' path', '')} over 24 sessions`,
    obstacle: 'Inconsistency and skipping sessions',
    plan: {},
    chainReward: `xp-chain-${id.slice(4, 14)}`,
    unlockCondition: makeDefaultChainUnlockCondition(0),
    quests,
    completionState: 'active',
  };

  return {
    id,
    name,
    description,
    icon: `act-${id.split('-')[1]}`,
    owner: 'coach',
    habitat: 'adventures',
    chains: [chain],
    accountability: null,
    commitment: EMPTY_COMMITMENT,
    toggle: makeDefaultActToggle(),
    completionState: 'active',
    sharedContacts: null,
  };
}

// Health Path
const HP_ID = STARTER_ACT_IDS.health;
const healthAct = makeStatPathAct(
  HP_ID,
  'Health Path',
  'Track your body, hydration, meals, and daily presence.',
  [
    makeQuest('H1 — Body Scan',
      'Log 3 body scans to tune into your physical state.',
      makeTimely(makeTaskCountMarker(`${HP_ID}|0|0`, STARTER_TEMPLATE_IDS.bodyLog, 3, 'taskTemplateRef', STARTER_TEMPLATE_IDS.bodyLog), 'taskCount'),
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.bodyLog] }, taskInputSpecific(1), 'xp-h1'),
    makeQuest('H2 — Hydration',
      'Complete the Daily Water quest 6 times.',
      makeTimely(makeTaskCountMarker(`${HP_ID}|0|1`, STARTER_TEMPLATE_IDS.drinkWater, 6, 'taskTemplateRef', STARTER_TEMPLATE_IDS.drinkWater), 'taskCount'),
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.drinkWater] }, taskInputSpecific(1), 'xp-h2'),
    makeQuest('H3 — Meal Log',
      'Log 12 meals across your history.',
      makeTimely(makeTaskCountMarker(`${HP_ID}|0|2`, STARTER_TEMPLATE_IDS.mealLog, 12, 'taskTemplateRef', STARTER_TEMPLATE_IDS.mealLog), 'taskCount'),
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.mealLog] }, taskInputSpecific(1), 'xp-h3'),
    makeQuest('H4 — Daily Presence',
      'Log in 24 times — one per day.',
      makeTimely(makeTaskCountMarker(`${HP_ID}|0|3`, STARTER_TEMPLATE_IDS.loginCheck, 24, 'systemEvent', 'login'), 'taskCount'),
      EMPTY_MEASURABLE, taskInputSpecific(1), 'xp-h4'),
  ],
);

// Strength Path
const SP_ID = STARTER_ACT_IDS.strength;
const strengthAct = makeStatPathAct(
  SP_ID,
  'Strength Path',
  'Sleep, move, train, and log your physical output.',
  [
    makeQuest('S1 — Sleep',
      'Track your sleep 3 times.',
      makeTimely(makeTaskCountMarker(`${SP_ID}|0|0`, STARTER_TEMPLATE_IDS.sleepCircuit, 3, 'taskTemplateRef', STARTER_TEMPLATE_IDS.sleepCircuit), 'taskCount'),
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.sleepCircuit] }, taskInputSpecific(1), 'xp-s1'),
    makeQuest('S2 — Walk Route',
      'Complete 6 walk route sessions.',
      makeTimely(makeTaskCountMarker(`${SP_ID}|0|1`, STARTER_TEMPLATE_IDS.walkRoute, 6, 'taskTemplateRef', STARTER_TEMPLATE_IDS.walkRoute), 'taskCount'),
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.walkRoute] }, taskInputSpecific(1), 'xp-s2'),
    makeQuest('S3 — Workout Events',
      'Complete 12 full body circuits.',
      makeTimely(makeTaskCountMarker(`${SP_ID}|0|2`, STARTER_TEMPLATE_IDS.workoutCheck, 12, 'taskTemplateRef', STARTER_TEMPLATE_IDS.workoutCheck), 'taskCount'),
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.workoutCheck] }, taskInputSpecific(1), 'xp-s3'),
    makeQuest('S4 — Circuit Streak',
      'Complete 24 full body circuits cumulatively.',
      makeTimely(makeTaskCountMarker(`${SP_ID}|0|3`, STARTER_TEMPLATE_IDS.workoutCheck, 24, 'taskTemplateRef', STARTER_TEMPLATE_IDS.workoutCheck), 'taskCount'),
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.workoutCheck] }, taskInputSpecific(1), 'xp-s4'),
  ],
);

// Agility Path
const AG_ID = STARTER_ACT_IDS.agility;
const agilityAct = makeStatPathAct(
  AG_ID,
  'Agility Path',
  'Maintain your home, clear your inbox, and master your events.',
  [
    makeQuest('A1 — Chores',
      'Complete 3 chore tasks.',
      makeTimely(makeTaskCountMarker(`${AG_ID}|0|0`, STARTER_TEMPLATE_IDS.chore, 3, 'taskTemplateRef', STARTER_TEMPLATE_IDS.chore), 'taskCount'),
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.chore] }, taskInputSpecific(1), 'xp-a1'),
    makeQuest('A2 — Clear Inbox',
      'Clear your inbox 6 times.',
      makeTimely(makeTaskCountMarker(`${AG_ID}|0|1`, STARTER_TEMPLATE_IDS.clearInbox, 6, 'taskTemplateRef', STARTER_TEMPLATE_IDS.clearInbox), 'taskCount'),
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.clearInbox] }, taskInputSpecific(1), 'xp-a2'),
    makeQuest('A3 — Event Completions',
      'Complete 12 events of any type.',
      makeTimely(makeTaskCountMarker(`${AG_ID}|0|2`, STARTER_TEMPLATE_IDS.openWelcomeEvent, 12, 'systemEvent', 'event.completed'), 'taskCount'),
      EMPTY_MEASURABLE, taskInputSpecific(1), 'xp-a3'),
    makeQuest('A4 — Quick Actions',
      'Complete 24 Quick Action tasks.',
      makeTimely(makeTaskCountMarker(`${AG_ID}|0|3`, STARTER_TEMPLATE_IDS.openWelcomeEvent, 24, 'systemEvent', 'quickAction.completed'), 'taskCount'),
      EMPTY_MEASURABLE, taskInputSpecific(1), 'xp-a4'),
  ],
);

// Defense Path
const DF_ID = STARTER_ACT_IDS.defense;
const defenseAct = makeStatPathAct(
  DF_ID,
  'Defense Path',
  'Schedule intentionally, clear your day, log finances, and track inventory.',
  [
    makeQuest('DF1 — Schedule',
      'Create 3 one-time events.',
      makeTimely(makeTaskCountMarker(`${DF_ID}|0|0`, STARTER_TEMPLATE_IDS.openWelcomeEvent, 3, 'systemEvent', 'plannedEvent.created', 'plannedEvent.created'), 'taskCount'),
      EMPTY_MEASURABLE, taskInputSpecific(1), 'xp-df1'),
    makeQuest('DF2 — Clear the Deck',
      'Complete all scheduled events on 6 different days.',
      makeTimely(makeTaskCountMarker(`${DF_ID}|0|1`, STARTER_TEMPLATE_IDS.openWelcomeEvent, 6, 'systemEvent', 'clearDeck.completed'), 'taskCount'),
      EMPTY_MEASURABLE, taskInputSpecific(1), 'xp-df2'),
    makeQuest('DF3 — Log Transactions',
      'Log 12 financial transactions.',
      makeTimely(makeTaskCountMarker(`${DF_ID}|0|2`, STARTER_TEMPLATE_IDS.logTransaction, 12, 'taskTemplateRef', STARTER_TEMPLATE_IDS.logTransaction), 'taskCount'),
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.logTransaction] }, taskInputSpecific(1), 'xp-df3'),
    makeQuest('DF4 — Inventory',
      'Replenish 24 inventory items.',
      makeTimely(makeTaskCountMarker(`${DF_ID}|0|3`, STARTER_TEMPLATE_IDS.inventoryReplenish, 24, 'taskTemplateRef', STARTER_TEMPLATE_IDS.inventoryReplenish), 'taskCount'),
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.inventoryReplenish] }, taskInputSpecific(1), 'xp-df4'),
  ],
);

// Charisma Path
const CH_ID = STARTER_ACT_IDS.charisma;
const charismaAct = makeStatPathAct(
  CH_ID,
  'Charisma Path',
  'Build self-awareness, gratitude, kindness, and social connection.',
  [
    makeQuest('C1 — Self Compliment',
      'Log 3 self compliments.',
      makeTimely(makeTaskCountMarker(`${CH_ID}|0|0`, STARTER_TEMPLATE_IDS.selfCompliment, 3, 'taskTemplateRef', STARTER_TEMPLATE_IDS.selfCompliment), 'taskCount'),
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.selfCompliment] }, taskInputSpecific(1), 'xp-c1'),
    makeQuest('C2 — Gratitude',
      'Log 6 pieces of gratitude.',
      makeTimely(makeTaskCountMarker(`${CH_ID}|0|1`, STARTER_TEMPLATE_IDS.gratitude, 6, 'taskTemplateRef', STARTER_TEMPLATE_IDS.gratitude), 'taskCount'),
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.gratitude] }, taskInputSpecific(1), 'xp-c2'),
    makeQuest('C3 — Acts of Kindness',
      'Log 12 acts of kindness.',
      makeTimely(makeTaskCountMarker(`${CH_ID}|0|2`, STARTER_TEMPLATE_IDS.kindness, 12, 'taskTemplateRef', STARTER_TEMPLATE_IDS.kindness), 'taskCount'),
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.kindness] }, taskInputSpecific(1), 'xp-c3'),
    makeQuest('C4 — Reach Out',
      'Reach out to people 24 times.',
      makeTimely(makeTaskCountMarker(`${CH_ID}|0|3`, STARTER_TEMPLATE_IDS.reachOut, 24, 'taskTemplateRef', STARTER_TEMPLATE_IDS.reachOut), 'taskCount'),
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.reachOut] }, taskInputSpecific(1), 'xp-c4'),
  ],
);

// Wisdom Path
const WS_ID = STARTER_ACT_IDS.wisdom;
const wisdomAct = makeStatPathAct(
  WS_ID,
  'Wisdom Path',
  'Meditate, track mood, complete form tasks, and build wisdom habits.',
  [
    makeQuest('W1 — Meditation',
      'Complete 3 meditation sessions.',
      makeTimely(makeTaskCountMarker(`${WS_ID}|0|0`, STARTER_TEMPLATE_IDS.meditation, 3, 'taskTemplateRef', STARTER_TEMPLATE_IDS.meditation), 'taskCount'),
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.meditation] }, taskInputSpecific(1), 'xp-w1'),
    makeQuest('W2 — Mood Log',
      'Log your mood 6 times.',
      makeTimely(makeTaskCountMarker(`${WS_ID}|0|1`, STARTER_TEMPLATE_IDS.moodLog, 6, 'taskTemplateRef', STARTER_TEMPLATE_IDS.moodLog), 'taskCount'),
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.moodLog] }, taskInputSpecific(1), 'xp-w2'),
    makeQuest('W3 — Study Session',
      'Complete 12 study sessions.',
      makeTimely(makeTaskCountMarker(`${WS_ID}|0|2`, STARTER_TEMPLATE_IDS.studySession, 12, 'taskTemplateRef', STARTER_TEMPLATE_IDS.studySession), 'taskCount'),
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.studySession] }, taskInputSpecific(1), 'xp-w3'),
    makeQuest('W4 — Dream Journal',
      'Complete 24 dream entries.',
      makeTimely(makeTaskCountMarker(`${WS_ID}|0|3`, STARTER_TEMPLATE_IDS.dreamEntry, 24, 'taskTemplateRef', STARTER_TEMPLATE_IDS.dreamEntry), 'taskCount'),
      { taskTemplateRefs: [STARTER_TEMPLATE_IDS.dreamEntry] }, taskInputSpecific(1), 'xp-w4'),
  ],
);

// ── SPLIT ACT EXPORTS (D87) ───────────────────────────────────────────────────

/** Acts seeded on first run — Onboarding only (D87). */
export const starterActs: Act[] = [onboardingAct];

/** Acts held in the coach bundle until triggered by game events (D87). */
export const coachActs: Act[] = [
  dailyAct,
  healthAct,
  strengthAct,
  agilityAct,
  defenseAct,
  charismaAct,
  wisdomAct,
];

// ── LIBRARY EXPORT ────────────────────────────────────────────────────────────

export const starterQuestLibrary = {
  /** All starter acts — used by test utilities that need the full set. */
  acts: [...starterActs, ...coachActs] as Act[],
  taskTemplates: starterTaskTemplates,
};

// ── STARTER TEMPLATE SET (D88) ───────────────────────────────────────────────

/**
 * Coach's day-one template push — the templates seeded into scheduleStore
 * on first run so the Task Room is populated immediately.
 *
 * Includes:
 *   - System onboarding task refs used by the current onboarding flow
 *   - Curated Daily / lifestyle picks
 */
export const starterTaskTemplateIds: string[] = [
  STARTER_TEMPLATE_IDS.openWelcomeEvent,
  STARTER_TEMPLATE_IDS.exploreCoach,
  STARTER_TEMPLATE_IDS.addRoutine,
  STARTER_TEMPLATE_IDS.exploreTimeViews,
  STARTER_TEMPLATE_IDS.completeLuckyRoll,
  STARTER_TEMPLATE_IDS.completeGtd,
  STARTER_TEMPLATE_IDS.exploreTaskRoom,
  STARTER_TEMPLATE_IDS.exploreScheduleRoom,
  STARTER_TEMPLATE_IDS.exploreResources,
  STARTER_TEMPLATE_IDS.addFavourite,
  STARTER_TEMPLATE_IDS.setDisplayName,
  STARTER_TEMPLATE_IDS.openBadgeRoom,
  STARTER_TEMPLATE_IDS.openEquipmentRoom,
  STARTER_TEMPLATE_IDS.placeBadge,
  STARTER_TEMPLATE_IDS.equipGear,
  STARTER_TEMPLATE_IDS.openAdventures,
];

/**
 * Coach's day-one template push into scheduleStore.
 * Includes the system onboarding task refs plus curated general templates that now
// ── SEED FUNCTION ─────────────────────────────────────────────────────────────

/**
 * Write the Onboarding Act and all starter TaskTemplates to their stores.
 * Idempotent — skips items already present when skipExisting is true (default).
 *
 * Per D87: only starterActs (Onboarding) is seeded here.
 * Other Acts (Daily, stat paths) unlock via unlockAct() when triggered.
 */
export function seedStarterContent(skipExisting = true): void {
  const progressionStore = useProgressionStore.getState();

  // Seed Acts — Onboarding only (D87)
  for (const act of starterActs) {
    if (skipExisting && progressionStore.acts[act.id]) continue;
    progressionStore.setAct(act);
  }
}

// ── UNLOCK ACT (D87) ──────────────────────────────────────────────────────────

/**
 * Unlock a coach bundle Act and add it to progressionStore.
 * Called when game events trigger an Act to become available (D87).
 *
 * @param actId  One of STARTER_ACT_IDS values for a coach bundle act
 */
export function unlockAct(actId: string): void {
  const act = coachActs.find((a) => a.id === actId);
  if (!act) return;
  useProgressionStore.getState().setAct(act);
}
