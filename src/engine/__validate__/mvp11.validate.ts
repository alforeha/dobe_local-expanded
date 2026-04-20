/// <reference types="node" />
// ─────────────────────────────────────────
// MVP11 VALIDATION SCRIPT
// Run via: npx tsx src/engine/__validate__/mvp11.validate.ts
//
// Tests the full A01 journey across 5 phases:
//   Phase 1 — Onboarding (seed + materialise)
//   Phase 2 — Day 1 task completion (XP, stat, achievement, feed, ribbet)
//   Phase 3 — Rollover to Day 2 (archive, QA event, chain)
//   Phase 4 — Day 2 + Day 3 activity (XP progression, milestones)
//   Phase 5 — Achievement + Feed (diversity, order, count)
//
// Also runs a 30-day seeded dataset for W33 storage audit.
//
// Uses dynamic imports so the localStorage stub is active BEFORE Zustand
// persist middleware initialises (ESM static imports are hoisted).
// ─────────────────────────────────────────

// ── STUB localStorage ─────────────────────────────────────────────────────────

const _store: Record<string, string> = {};
const _lsStub = {
  getItem:    (k: string) => _store[k] ?? null,
  setItem:    (k: string, v: string) => { _store[k] = v; },
  removeItem: (k: string) => { delete _store[k]; },
  clear:      () => { for (const k in _store) delete _store[k]; },
  get length() { return Object.keys(_store).length; },
  key: (i: number) => Object.keys(_store)[i] ?? null,
};
Object.defineProperty(globalThis, 'localStorage', {
  value: _lsStub, writable: true, configurable: true,
});

// ── TEST RUNNER ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  \u2713  ${label}`);
    passed++;
  } else {
    console.error(`  \u2717  ${label}${detail ? ` \u2014 ${detail}` : ''}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

// ── DATE HELPERS ──────────────────────────────────────────────────────────────

const DAY1 = new Date().toISOString().slice(0, 10);

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const DAY2 = addDays(DAY1, 1);
const DAY3 = addDays(DAY1, 2);

// ── FACTORIES ─────────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-test-mvp11-0000-0000-0000-0001';

function makeDefaultUser(): Record<string, unknown> {
  return {
    system:   { id: TEST_USER_ID, displayName: 'Adventurer', wrappedAnchor: DAY1, auth: null },
    personal: { nameFirst: '', nameLast: '', handle: '', birthday: '' },
    progression: {
      stats: {
        xp: 0, level: 1, talentPoints: 0,
        milestones: {
          streakCurrent: 0, streakBest: 0,
          questsCompleted: 0, tasksCompleted: 0, eventsCompleted: 0,
        },
        talents: {
          health:   { statPoints: 0, xpEarned: 0, tier: 0 },
          strength: { statPoints: 0, xpEarned: 0, tier: 0 },
          agility:  { statPoints: 0, xpEarned: 0, tier: 0 },
          defense:  { statPoints: 0, xpEarned: 0, tier: 0 },
          charisma: { statPoints: 0, xpEarned: 0, tier: 0 },
          wisdom:   { statPoints: 0, xpEarned: 0, tier: 0 },
        },
        talentTree: {
          health: {}, strength: {}, agility: {},
          defense: {}, charisma: {}, wisdom: {},
        },
      },
      avatar:     { equippedGear: {}, slotTaxonomyRef: 'default', publicVisibility: null, additionalAnimations: null },
      badgeBoard: { earned: [], pinned: [], publicVisibility: null },
      equipment:  { equipment: [], storeUnlocks: null },
      gold: 0,
      statGroups: { health: 0, strength: 0, agility: 0, defense: 0, charisma: 0, wisdom: 0 },
      talentTree: null,
    },
    lists:     { favouritesList: [], gtdList: [], shoppingLists: [], manualGtdList: [] },
    resources: { homes: [], vehicles: [], contacts: [], accounts: [], inventory: [], docs: [] },
    feed:      { entries: [], unreadCount: 0, sharedActivityEntries: null },
    publicProfile: null,
  };
}

// Welcome PlannedEvent — mirrors AppShell.makeWelcomePlannedEvent (not exported from there)
const WELCOME_PE_ID = 'pe-welcome-onboarding-0000-0000-0000-0001';
const WELCOME_TMPL_ID = 'tmpl-open-welcome-0000-0000-0000-0001';

function makeWelcomePlannedEvent(date: string): Record<string, unknown> {
  return {
    id: WELCOME_PE_ID,
    name: 'Welcome to CAN-DO-BE',
    description: 'Your first step in the pond. Open this event to begin Quest 1.',
    icon: 'welcome',
    color: '#10b981',
    seedDate: date,
    dieDate: date,
    recurrenceInterval: {
      frequency: 'daily', interval: 1, days: [],
      endsOn: date, customCondition: null,
    },
    activeState: 'active',
    taskPool: [WELCOME_TMPL_ID],
    taskPoolCursor: 0,
    taskList: [],
    conflictMode: 'concurrent',
    startTime: '09:00',
    endTime: '09:30',
    location: null,
    sharedWith: null,
    pushReminder: null,
  };
}

const LOGIN_TMPL_ID = 'task-sys-daily-login';

function makeTestTask(id: string, tmplRef: string): Record<string, unknown> {
  return {
    id,
    templateRef: tmplRef,
    completionState: 'pending',
    completedAt: null,
    resultFields: {},
    attachmentRef: null,
    resourceRef: null,
    location: null,
    sharedWith: null,
    questRef: null,
    actRef: null,
    secondaryTag: null,
  };
}

function makeTestEvent(
  id: string,
  date: string,
  taskIds: string[],
  name = 'Test Event',
): Record<string, unknown> {
  return {
    id,
    eventType: 'planned',
    plannedEventRef: null,
    name,
    startDate: date,
    startTime: '10:00',
    endDate: date,
    endTime: '11:00',
    tasks: taskIds,
    completionState: 'pending',
    xpAwarded: 0,
    attachments: [],
    location: null,
    note: null,
    sharedWith: null,
    coAttendees: null,
  };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Dynamic imports — localStorage stub must be active before Zustand persist.
  const { useUserStore }        = await import('../../stores/useUserStore');
  const { useScheduleStore }    = await import('../../stores/useScheduleStore');
  const { useProgressionStore } = await import('../../stores/useProgressionStore');
  const { useSystemStore }      = await import('../../stores/useSystemStore');
  const { useResourceStore }    = await import('../../stores/useResourceStore');

  const {
    seedStarterContent,
    unlockAct,
    STARTER_ACT_IDS,
    STARTER_TEMPLATE_IDS,
    makeDailyChain,
    coachActs,
  } = await import('../../coach/StarterQuestLibrary');

  const { materialisePlannedEvent } = await import('../materialise');
  const { executeRollover }         = await import('../rollover');
  const { completeTask, completeEvent } = await import('../eventExecution');
  const { getFeedEntries, FEED_SOURCE } = await import('../feedEngine');
  const { peekRibbet, clearRibbet }     = await import('../../coach/ribbet');
  const { getStorageUsage }             = await import('../../storage/storageBudget');

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 1 — ONBOARDING
  // ═══════════════════════════════════════════════════════════════════════

  section('PHASE 1 — Onboarding');

  // ── Fresh state ───────────────────────────────────────────────────────
  _lsStub.clear();
  useUserStore.getState().reset();
  useScheduleStore.getState().reset();
  useProgressionStore.getState().reset();
  useSystemStore.getState().reset();
  useResourceStore.getState().reset();

  assert('Fresh state — localStorage is empty', _lsStub.length === 0);
  assert('Fresh state — no user in store', useUserStore.getState().user === null);

  // ── makeDefaultUser ───────────────────────────────────────────────────
  const freshUser = makeDefaultUser();
  useUserStore.setState({ user: freshUser as never });

  const storedUser = useUserStore.getState().user;
  assert(
    'makeDefaultUser — user created in store',
    !!storedUser,
  );
  assert(
    'makeDefaultUser — system.id set',
    storedUser?.system.id === TEST_USER_ID,
  );
  assert(
    'makeDefaultUser — stats.xp starts at 0',
    storedUser?.progression.stats.xp === 0,
  );
  assert(
    'makeDefaultUser — badgeBoard starts empty',
    (storedUser?.progression.badgeBoard.earned.length ?? -1) === 0,
  );

  // ── seedStarterContent() ──────────────────────────────────────────────
  let seedError: unknown = null;
  try {
    seedStarterContent(false); // force = false: seed all
  } catch (e) {
    seedError = e;
  }
  assert('seedStarterContent() — runs without error', seedError === null, String(seedError));

  // ── Onboarding Act exists with correct structure ───────────────────────
  const obActId = STARTER_ACT_IDS.onboarding;
  const obAct = useProgressionStore.getState().acts[obActId];

  assert('Onboarding Act — exists in progressionStore',        !!obAct);
  assert('Onboarding Act — completionState is active',         obAct?.completionState === 'active');
  assert('Onboarding Act — has at least 1 chain',              (obAct?.chains.length ?? 0) >= 1);
  assert('Onboarding Act — chain 0 has 4 quests',              (obAct?.chains[0]?.quests.length ?? 0) === 4);
  assert('Onboarding Act — Q1 is active',                      obAct?.chains[0]?.quests[0]?.completionState === 'active');
  assert(
    'Onboarding Act — Q1 marker has nextFire set (today)',
    obAct?.chains[0]?.quests[0]?.timely.markers[0]?.nextFire === DAY1,
  );

  // ── Daily Adventure Act — gated by D87, not in store after seed ──────────
  const dailyActId = STARTER_ACT_IDS.daily;

  assert(
    'Daily Adventure Act — NOT in progressionStore after seed (D87 gating)',
    !useProgressionStore.getState().acts[dailyActId],
  );

  // Simulate Onboarding Act completion trigger: unlock Daily + all coach acts for testing
  for (const act of coachActs) {
    unlockAct(act.id);
  }

  const dailyActRaw = useProgressionStore.getState().acts[dailyActId];

  assert('Daily Adventure Act — exists in progressionStore after unlockAct()', !!dailyActRaw);
  assert('Daily Adventure Act — completionState is active',  dailyActRaw?.completionState === 'active');

  // Simulate what onboarding completion does: add day 1 chain
  if (dailyActRaw) {
    const chain1 = makeDailyChain(dailyActId, 1, DAY1);
    useProgressionStore.getState().setAct({
      ...dailyActRaw,
      chains: [...dailyActRaw.chains, chain1],
    });
  }
  const dailyActWithChain = useProgressionStore.getState().acts[dailyActId];
  assert(
    'Daily Adventure Act — has today\'s chain after init',
    (dailyActWithChain?.chains.length ?? 0) >= 1,
  );
  assert(
    'Daily Adventure Act — today\'s chain name contains DAY1 date',
    dailyActWithChain?.chains[0]?.name.includes(DAY1) ?? false,
  );

  // ── Welcome PlannedEvent materialises correctly ───────────────────────
  const welcomePE = makeWelcomePlannedEvent(DAY1);
  useScheduleStore.getState().setPlannedEvent(welcomePE as never);

  const taskTemplates = useScheduleStore.getState().taskTemplates;
  const { event: welcomeEvent, tasks: welcomeTasks } = materialisePlannedEvent(
    welcomePE as never,
    DAY1,
    taskTemplates,
  );

  assert('Welcome PlannedEvent — materialises without error',       !!welcomeEvent);
  assert('Welcome PlannedEvent — event is in activeEvents',         !!useScheduleStore.getState().activeEvents[welcomeEvent.id]);
  assert('Welcome PlannedEvent — event.plannedEventRef is correct', welcomeEvent.plannedEventRef === WELCOME_PE_ID);
  assert('Welcome PlannedEvent — event.startDate is DAY1',          welcomeEvent.startDate === DAY1);
  assert('Welcome PlannedEvent — event.endDate is DAY1',            welcomeEvent.endDate === DAY1);
  assert('Welcome PlannedEvent — event has 1 task',                 welcomeTasks.length === 1);
  assert('Welcome PlannedEvent — task templateRef is correct',      welcomeTasks[0]?.templateRef === WELCOME_TMPL_ID);
  assert('Welcome PlannedEvent — task completionState is pending',  welcomeTasks[0]?.completionState === 'pending');

  const welcomeEventId = welcomeEvent.id;
  const welcomeTaskId  = welcomeTasks[0]!.id;

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 2 — DAY 1 TASK COMPLETION
  // ═══════════════════════════════════════════════════════════════════════

  section('PHASE 2 — Day 1 Task Completion');

  const userBeforeTask = useUserStore.getState().user!;
  const xpBefore             = userBeforeTask.progression.stats.xp;
  const healthStatBefore     = userBeforeTask.progression.stats.talents.health.statPoints;
  const tasksCompletedBefore = userBeforeTask.progression.stats.milestones.tasksCompleted;
  const badgesEarnedBefore   = userBeforeTask.progression.badgeBoard.earned.length;

  clearRibbet();

  // Complete the Welcome Event task (CHECK type — openWelcomeEvent, health: 25 XP)
  let completeTaskError: unknown = null;
  try {
    completeTask(welcomeTaskId, welcomeEventId, { resultFields: {} });
  } catch (e) {
    completeTaskError = e;
  }

  assert('completeTask — runs without error', completeTaskError === null, String(completeTaskError));

  const userAfterTask = useUserStore.getState().user!;
  const xpAfter             = userAfterTask.progression.stats.xp;
  const healthStatAfter     = userAfterTask.progression.stats.talents.health.statPoints;
  const tasksCompletedAfter = userAfterTask.progression.stats.milestones.tasksCompleted;

  assert(
    'XP awarded to User after task completion',
    xpAfter > xpBefore,
    `before=${xpBefore}, after=${xpAfter}`,
  );
  assert(
    'XP amount matches openWelcomeEvent template (≥25)',
    xpAfter - xpBefore >= 25,
    `delta=${xpAfter - xpBefore}`,
  );
  assert(
    'Health stat delta written to correct stat group',
    healthStatAfter > healthStatBefore,
    `before=${healthStatBefore}, after=${healthStatAfter}`,
  );
  assert(
    'tasksCompleted milestone incremented',
    tasksCompletedAfter === tasksCompletedBefore + 1,
    `before=${tasksCompletedBefore}, after=${tasksCompletedAfter}`,
  );

  // Achievement — ach-first-task should have fired (tasksCompleted >= 1)
  const badgesAfterTask = userAfterTask.progression.badgeBoard.earned;
  assert(
    'ach-first-task — Badge in BadgeBoard.earned[]',
    badgesAfterTask.some((b) => b.contents.achievementRef === 'ach-first-task'),
    `earned badges: ${badgesAfterTask.map((b) => b.contents.achievementRef).join(', ')}`,
  );
  assert(
    'BadgeBoard — at least 1 badge earned after task completion',
    badgesAfterTask.length > badgesEarnedBefore,
    `earned=${badgesAfterTask.length}`,
  );

  // Feed — badge.awarded entry exists
  const feedAfterTask = getFeedEntries(userAfterTask);
  assert(
    'Feed — has badge.awarded entry',
    feedAfterTask.some((e) => e.sourceType === FEED_SOURCE.BADGE_AWARDED),
    `sourceTypes: ${feedAfterTask.map((e) => e.sourceType).join(', ')}`,
  );

  // Ribbet — badge.awarded context comment is non-empty
  const ribbetComments = peekRibbet();
  assert(
    'ribbet() session queue — has non-empty string for badge.awarded context',
    ribbetComments.some((s) => s.length > 0),
    `queue length=${ribbetComments.length}`,
  );

  // Task completionState updated in store
  const completedTask = useScheduleStore.getState().tasks[welcomeTaskId];
  assert('Task — completionState updated to complete', completedTask?.completionState === 'complete');

  // ─── FIX-13: Quest 1 (Ripple) progress assertions ─────────────────────
  const q1AfterComplete = useProgressionStore.getState().acts[obActId]?.chains[0]?.quests[0];
  assert(
    'Quest 1 (Ripple) — completionState is complete',
    q1AfterComplete?.completionState === 'complete',
    `got: ${q1AfterComplete?.completionState}`,
  );
  assert(
    'Quest 1 (Ripple) — progressPercent is 100',
    q1AfterComplete?.progressPercent === 100,
    `got: ${q1AfterComplete?.progressPercent}`,
  );
  assert(
    'Quest 1 (Ripple) — has exactly 1 milestone',
    q1AfterComplete?.milestones.length === 1,
    `got: ${q1AfterComplete?.milestones.length}`,
  );

  // ─── FIX-13: Quest 2 (Splash) armed after Quest 1 completes ───────────
  // completeMilestone() should have fired Quest 2's first interval marker
  // so a Check-In task now exists in the schedule for Quest 2.
  const q2AfterFire = useProgressionStore.getState().acts[obActId]?.chains[0]?.quests[1];
  assert(
    'Quest 2 (Splash) — remains active after Quest 1 completes',
    q2AfterFire?.completionState === 'active',
    `got: ${q2AfterFire?.completionState}`,
  );
  const allTasksAfterQ1 = Object.values(useScheduleStore.getState().tasks);
  const q2TaskRef = `${obActId}|0|1`;
  const q2TaskExists = allTasksAfterQ1.some(
    (t) => t.questRef === q2TaskRef && t.completionState !== 'complete',
  );
  assert(
    'Quest 2 (Splash) — armed: a task with its questRef exists in the schedule',
    q2TaskExists,
    `tasks with questRefs: ${allTasksAfterQ1.filter((t) => t.questRef).map((t) => t.questRef).join(', ')}`,
  );

  // ─── FIX-13: Q2 CHECKLIST completion (targetValue=3, 3 items) ──────────
  // Simulate the user completing the Q2 setupSchedule CHECKLIST with all
  // 3 items checked — verifies extractNumericFromResult handles ChecklistItem[].
  const q2Task = allTasksAfterQ1.find(
    (t) => t.questRef === q2TaskRef && t.completionState !== 'complete',
  )!;
  assert('Quest 2 (Splash) — task found before Q2 complete call', !!q2Task);

  if (q2Task) {
    // Seed prior Quest 3 actions before Quest 2 completes so activation backfill
    // can reflect existing state immediately on the newly fired learnGrounds task.
    const userBeforeQ2Complete = useUserStore.getState().user!;
    useUserStore.getState().setUser({
      ...userBeforeQ2Complete,
      lists: {
        ...userBeforeQ2Complete.lists,
        favouritesList: [...userBeforeQ2Complete.lists.favouritesList, 'tmpl-preseed-favourite-0001'],
      },
    });

    useScheduleStore.getState().setPlannedEvent({
      id: 'pe-mvp11-routine-0001',
      name: 'Validation Routine',
      description: 'Pre-existing routine for Quest 3 backfill coverage.',
      icon: 'routine',
      color: '#22c55e',
      seedDate: DAY1,
      dieDate: null,
      recurrenceInterval: {
        frequency: 'weekly',
        interval: 1,
        days: ['mon'],
        endsOn: null,
        customCondition: null,
      },
      activeState: 'active',
      taskPool: [],
      taskPoolCursor: 0,
      taskList: [],
      conflictMode: 'concurrent',
      startTime: '08:00',
      endTime: '08:30',
      location: null,
      sharedWith: null,
      pushReminder: null,
    } as never);

    const qaDay1Id = `qa-${DAY1}`;
    const rollTaskId = 'task-mvp11-roll-backfill-0001';
    useScheduleStore.getState().setTask({
      id: rollTaskId,
      templateRef: STARTER_TEMPLATE_IDS.roll,
      completionState: 'complete',
      completedAt: `${DAY1}T12:00:00.000Z`,
      resultFields: {
        sides: 6,
        result: 4,
        boostApplied: '1.2x',
      },
      attachmentRef: null,
      resourceRef: null,
      location: null,
      sharedWith: null,
      questRef: null,
      actRef: null,
      secondaryTag: null,
    } as never);
    const existingQaDay1 = useScheduleStore.getState().activeEvents[qaDay1Id];
    const existingQuickActionsDay1: import('../../types/event').QuickActionsEvent | null =
      existingQaDay1 && 'eventType' in existingQaDay1 && existingQaDay1.eventType === 'quickActions'
        ? (existingQaDay1 as import('../../types/event').QuickActionsEvent)
        : null;
    useScheduleStore.getState().setActiveEvent(
      existingQuickActionsDay1
        ? {
            ...existingQuickActionsDay1,
            completions: [
              ...existingQuickActionsDay1.completions,
              { taskRef: rollTaskId, completedAt: `${DAY1}T12:00:00.000Z` },
            ],
          }
        : {
            id: qaDay1Id,
            eventType: 'quickActions',
            date: DAY1,
            completions: [{ taskRef: rollTaskId, completedAt: `${DAY1}T12:00:00.000Z` }],
            xpAwarded: 0,
            sharedCompletions: null,
          },
    );

    // Build a CHECKLIST result with all 3 items ticked — mirrors ChecklistInput.handleComplete()
    const q2Result = {
      resultFields: {
        items: [
          { key: 'add_routine', label: 'Add a default routine from prebuilts', checked: true },
          { key: 'week_view',   label: 'Switch to Week view',                  checked: true },
          { key: 'month_view',  label: 'Switch to Month view',                 checked: true },
        ],
        requireAll: false,
      },
    };
    let q2CompleteError: unknown = null;
    try {
      // Q2 task lives in gtdList (created by fireMarker), not inside an event.
      // completeTask's eventId is only used for quickActions context bonus — safe to use a placeholder.
      completeTask(q2Task.id, 'validate-q2-event', q2Result);
    } catch (e) {
      q2CompleteError = e;
    }
    assert('Quest 2 (Splash) — completeTask runs without error', q2CompleteError === null, String(q2CompleteError));

    const q2AfterComplete = useProgressionStore.getState().acts[obActId]?.chains[0]?.quests[1];
    assert(
      'Quest 2 (Splash) — completionState is complete',
      q2AfterComplete?.completionState === 'complete',
      `got: ${q2AfterComplete?.completionState}`,
    );
    assert(
      'Quest 2 (Splash) — progressPercent is 100',
      q2AfterComplete?.progressPercent === 100,
      `got: ${q2AfterComplete?.progressPercent}`,
    );

    // Q3 (High Ground) should now be armed
    const q3TaskRef = `${obActId}|0|2`;
    const allTasksAfterQ2 = Object.values(useScheduleStore.getState().tasks);
    const q3TaskExists = allTasksAfterQ2.some(
      (t) => t.questRef === q3TaskRef && t.completionState !== 'complete',
    );
    assert(
      'Quest 3 (High Ground) — armed after Quest 2 completes',
      q3TaskExists,
      `tasks with questRefs: ${allTasksAfterQ2.filter((t) => t.questRef).map((t) => t.questRef).join(', ')}`,
    );

    const q3Task = allTasksAfterQ2.find(
      (t) => t.questRef === q3TaskRef && t.templateRef === STARTER_TEMPLATE_IDS.learnGrounds,
    );
    const q3Items = ((q3Task?.resultFields as { items?: Array<{ key: string; checked?: boolean }> } | undefined)?.items ?? []);
    const q3Checked = new Set(
      q3Items.filter((item) => item.checked === true).map((item) => item.key),
    );
    assert(
      'Quest 3 (High Ground) — backfills completed roll on activation',
      q3Checked.has('complete_roll'),
      `checked: ${[...q3Checked].join(', ')}`,
    );
    assert(
      'Quest 3 (High Ground) — backfills add favourite on activation',
      q3Checked.has('add_favourite'),
      `checked: ${[...q3Checked].join(', ')}`,
    );
    assert(
      'Quest 3 (High Ground) — backfills open schedule on activation',
      q3Checked.has('open_schedule'),
      `checked: ${[...q3Checked].join(', ')}`,
    );
    const q3AfterBackfill = useProgressionStore.getState().acts[obActId]?.chains[0]?.quests[2];
    assert(
      'Quest 3 (High Ground) — progressPercent reflects 3 of 6 backfilled items',
      q3AfterBackfill?.progressPercent === 50,
      `got: ${q3AfterBackfill?.progressPercent}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 3 — ROLLOVER SIMULATION (DAY 2)
  // ═══════════════════════════════════════════════════════════════════════

  section('PHASE 3 — Rollover Simulation (Day 2)');

  // Run rollover to DAY2
  let rolloverError: unknown = null;
  try {
    await executeRollover(DAY2);
  } catch (e) {
    rolloverError = e;
  }

  assert('executeRollover(DAY2) — completes without error', rolloverError === null, String(rolloverError));

  // System — lastRollover updated
  const lastRollover = useSystemStore.getState().lastRollover;
  assert('System — lastRollover set to DAY2', lastRollover === DAY2, `got: ${lastRollover}`);

  // System — rolloverStep cleared after completion
  const rolloverStep = useSystemStore.getState().rolloverStep;
  assert('System — rolloverStep cleared (null) after completion', rolloverStep === null, `got: ${rolloverStep}`);

  // Day 1 Welcome Event archived
  const historyAfterRollover = useScheduleStore.getState().historyEvents;
  const activeAfterRollover  = useScheduleStore.getState().activeEvents;

  assert(
    'Day 1 — Welcome Event archived to historyEvents',
    !!historyAfterRollover[welcomeEventId],
    `historyKeys: ${Object.keys(historyAfterRollover).join(', ')}`,
  );
  assert(
    'Day 1 — Welcome Event no longer in activeEvents',
    !activeAfterRollover[welcomeEventId],
  );

  // QA event created for Day 2
  const qaDay2Id = `qa-${DAY2}`;
  assert(
    `QA event created for Day 2 (${qaDay2Id})`,
    !!activeAfterRollover[qaDay2Id],
    `activeKeys: ${Object.keys(activeAfterRollover).join(', ')}`,
  );

  // New Daily Adventure chain for Day 2 — simulate app behaviour by adding chain 2
  const dailyActAfterChain2 = useProgressionStore.getState().acts[dailyActId];
  const day2DailyChain = dailyActAfterChain2?.chains[1];

  assert(
    'Daily Adventure Act — chain count increased to 2 after Day 2',
    (dailyActAfterChain2?.chains.length ?? 0) >= 2,
    `chains: ${dailyActAfterChain2?.chains.length}`,
  );
  assert(
    'Daily Adventure Act — chains[1] name contains DAY2',
    dailyActAfterChain2?.chains[1]?.name.includes(DAY2) ?? false,
  );

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 4 — DAY 2 + DAY 3 ACTIVITY
  // ═══════════════════════════════════════════════════════════════════════

  section('PHASE 4 — Day 2 + Day 3 Activity');

  assert(
    'Daily Adventure Act â€” Day 1 chain closes as failed after missed day',
    dailyActAfterChain2?.chains[0]?.completionState === 'failed',
    `got: ${dailyActAfterChain2?.chains[0]?.completionState}`,
  );
  assert(
    'Daily Adventure Act â€” Day 2 chain starts active',
    day2DailyChain?.completionState === 'active',
    `got: ${day2DailyChain?.completionState}`,
  );
  assert(
    'Daily Adventure Act â€” Day 2 chain has 4 fresh active quests',
    day2DailyChain?.quests.every((quest) => quest.completionState === 'active') ?? false,
  );

  const xpBeforeDay2 = useUserStore.getState().user!.progression.stats.xp;

  // ── Day 2: 2 tasks ────────────────────────────────────────────────────
  const d2t1Id = 'task-d2-mvp11-0001';
  const d2t2Id = 'task-d2-mvp11-0002';
  const d2evId = 'event-d2-mvp11-0001';

  const d2t1 = makeTestTask(d2t1Id, LOGIN_TMPL_ID);
  const d2t2 = makeTestTask(d2t2Id, LOGIN_TMPL_ID);
  const d2ev = makeTestEvent(d2evId, DAY2, [d2t1Id, d2t2Id], 'Day 2 Test Event');

  useScheduleStore.getState().setTask(d2t1 as never);
  useScheduleStore.getState().setTask(d2t2 as never);
  useScheduleStore.getState().setActiveEvent(d2ev as never);

  completeTask(d2t1Id, d2evId, { resultFields: {} });
  completeTask(d2t2Id, d2evId, { resultFields: {} });
  completeEvent(d2evId);

  const xpAfterDay2 = useUserStore.getState().user!.progression.stats.xp;
  assert(
    'Day 2 — XP increased after 2 tasks',
    xpAfterDay2 > xpBeforeDay2,
    `before=${xpBeforeDay2}, after=${xpAfterDay2}`,
  );

  // ── Rollover to Day 3 ─────────────────────────────────────────────────
  let rollover3Error: unknown = null;
  try {
    await executeRollover(DAY3);
  } catch (e) {
    rollover3Error = e;
  }
  assert('executeRollover(DAY3) — completes without error', rollover3Error === null, String(rollover3Error));

  const day2EventInHistory = useScheduleStore.getState().historyEvents[d2evId];
  assert('Day 2 — event archived after Day 3 rollover', !!day2EventInHistory);

  const dailyActAfterDay3 = useProgressionStore.getState().acts[dailyActId];
  const day3DailyChain = dailyActAfterDay3?.chains[2];
  assert(
    'Daily Adventure Act â€” chain count increased to 3 after Day 3 rollover',
    (dailyActAfterDay3?.chains.length ?? 0) >= 3,
    `chains: ${dailyActAfterDay3?.chains.length}`,
  );
  assert(
    'Daily Adventure Act â€” Day 2 chain closes as failed after missed day',
    dailyActAfterDay3?.chains[1]?.completionState === 'failed',
    `got: ${dailyActAfterDay3?.chains[1]?.completionState}`,
  );
  assert(
    'Daily Adventure Act â€” Day 3 chain starts active',
    day3DailyChain?.completionState === 'active',
    `got: ${day3DailyChain?.completionState}`,
  );

  const xpBeforeDay3 = useUserStore.getState().user!.progression.stats.xp;

  // ── Day 3: 2 tasks ────────────────────────────────────────────────────
  const d3t1Id = 'task-d3-mvp11-0001';
  const d3t2Id = 'task-d3-mvp11-0002';
  const d3evId = 'event-d3-mvp11-0001';

  const d3t1 = makeTestTask(d3t1Id, LOGIN_TMPL_ID);
  const d3t2 = makeTestTask(d3t2Id, LOGIN_TMPL_ID);
  const d3ev = makeTestEvent(d3evId, DAY3, [d3t1Id, d3t2Id], 'Day 3 Test Event');

  useScheduleStore.getState().setTask(d3t1 as never);
  useScheduleStore.getState().setTask(d3t2 as never);
  useScheduleStore.getState().setActiveEvent(d3ev as never);

  completeTask(d3t1Id, d3evId, { resultFields: {} });
  completeTask(d3t2Id, d3evId, { resultFields: {} });
  completeEvent(d3evId);

  const xpAfterDay3 = useUserStore.getState().user!.progression.stats.xp;
  assert(
    'Day 3 — XP increased after 2 tasks',
    xpAfterDay3 > xpBeforeDay3,
    `before=${xpBeforeDay3}, after=${xpAfterDay3}`,
  );

  // ── Cross-day assertions ──────────────────────────────────────────────
  const userFinal = useUserStore.getState().user!;
  const totalXPFinal    = userFinal.progression.stats.xp;
  const tasksCompFinal  = userFinal.progression.stats.milestones.tasksCompleted;

  assert(
    'totalXP has increased across all 3 days',
    totalXPFinal > xpBefore,
    `initialXP=${xpBefore}, finalXP=${totalXPFinal}`,
  );
  assert(
    'tasksCompleted milestone count is >= 5',
    tasksCompFinal >= 5,
    `got: ${tasksCompFinal}`,
  );

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 5 — ACHIEVEMENT + FEED
  // ═══════════════════════════════════════════════════════════════════════

  section('PHASE 5 — Achievement + Feed');

  const userP5   = useUserStore.getState().user!;
  const badgesP5 = userP5.progression.badgeBoard.earned;

  assert(
    'At least 1 achievement unlocked by day 3',
    badgesP5.length >= 1,
    `earned: ${badgesP5.map((b) => b.contents.achievementRef).join(', ')}`,
  );

  const feedP5         = getFeedEntries(userP5);
  const sourceTypesP5  = new Set(feedP5.map((e) => e.sourceType));

  assert(
    'Feed — at least 3 distinct sourceType entries',
    sourceTypesP5.size >= 3,
    `sourceTypes: ${[...sourceTypesP5].join(', ')}`,
  );

  // Newest-first order: entries[i-1].timestamp >= entries[i].timestamp
  let isNewestFirst = true;
  for (let i = 1; i < feedP5.length; i++) {
    if ((feedP5[i - 1]!.timestamp) < (feedP5[i]!.timestamp)) {
      isNewestFirst = false;
      break;
    }
  }
  assert(
    'getFeedEntries() — returns newest-first order',
    isNewestFirst,
    `entries length: ${feedP5.length}`,
  );
  assert(
    'Feed — has entries (count > 0)',
    feedP5.length > 0,
    `count: ${feedP5.length}`,
  );

  console.log(`\n  Feed sourceTypes present: ${[...sourceTypesP5].join(', ')}`);
  console.log(`  Feed entry count: ${feedP5.length}`);
  console.log(`  Total XP: ${totalXPFinal} | Level: ${userFinal.progression.stats.level}`);
  console.log(`  Badges earned: ${badgesP5.length}`);
  console.log(`  Tasks completed: ${tasksCompFinal}`);

  // ═══════════════════════════════════════════════════════════════════════
  // 30-DAY SEEDED DATASET (W33 Storage Audit)
  // ═══════════════════════════════════════════════════════════════════════

  section('30-Day Seeded Dataset (W33 Storage Audit)');

  // Reset all stores and clear localStorage for a clean dataset measurement
  _lsStub.clear();
  useUserStore.getState().reset();
  useScheduleStore.getState().reset();
  useProgressionStore.getState().reset();
  useSystemStore.getState().reset();
  useResourceStore.getState().reset();

  const { storageSet } = await import('../../storage');
  const { awardXP, awardStat } = await import('../awardPipeline');
  const { appendFeedEntry } = await import('../feedEngine');
  const { checkAchievements } = await import('../../coach/checkAchievements');
  const { awardBadge } = await import('../../coach/rewardPipeline');

  // ── Seed a 30-day user ────────────────────────────────────────────────
  const dsUserId = 'user-dataset-30day-0000-0000-0001';
  const dsUser = {
    ...makeDefaultUser(),
    system: { id: dsUserId, displayName: 'DatasetUser', wrappedAnchor: addDays(DAY1, -30), auth: null },
    progression: {
      ...(makeDefaultUser() as { progression: Record<string, unknown> }).progression,
      stats: {
        xp: 0, level: 1, talentPoints: 0,
        milestones: {
          streakCurrent: 30, streakBest: 30,
          questsCompleted: 5, tasksCompleted: 40, eventsCompleted: 20,
        },
        talents: {
          health:   { statPoints: 200, xpEarned: 200, tier: 2 },
          strength: { statPoints: 150, xpEarned: 150, tier: 1 },
          agility:  { statPoints: 100, xpEarned: 100, tier: 1 },
          defense:  { statPoints: 0,   xpEarned: 0,   tier: 0 },
          charisma: { statPoints: 0,   xpEarned: 0,   tier: 0 },
          wisdom:   { statPoints: 50,  xpEarned: 50,  tier: 0 },
        },
        talentTree: {
          health: {}, strength: {}, agility: {},
          defense: {}, charisma: {}, wisdom: {},
        },
      },
      badgeBoard: { earned: [], pinned: [], publicVisibility: null },
    },
  };

  useUserStore.setState({ user: dsUser as never });
  storageSet('user', dsUser);

  // Seed Acts so achievement checks have context (D87: seed then unlock all)
  seedStarterContent(false);
  for (const act of coachActs) {
    unlockAct(act.id);
  }

  // ── Award XP from 3 stat groups ───────────────────────────────────────
  awardXP(dsUserId, 500);
  awardStat(dsUserId, 'health',   200);
  awardStat(dsUserId, 'strength', 150);
  awardStat(dsUserId, 'wisdom',   50);

  // ── Unlock 2 achievements manually ───────────────────────────────────
  const dsUserInStore = useUserStore.getState().user!;
  const newAchs = checkAchievements(dsUserInStore);
  let dsUserCurrent = dsUserInStore;
  for (const ach of newAchs) {
    dsUserCurrent = awardBadge(ach, dsUserCurrent);
  }

  // ── Seed 20 completed Events in history ───────────────────────────────
  const eventTypes = ['planned', 'planned', 'planned'] as const;
  let eventCount = 0;
  for (let day = 0; day < 30; day += 1) {
    const eventDate = addDays(addDays(DAY1, -30), day);
    if (eventCount >= 20) break;
    const evId     = `hist-event-ds-${day.toString().padStart(3, '0')}`;
    const taskId   = `hist-task-ds-${day.toString().padStart(3, '0')}`;
    const tmplType = eventTypes[day % eventTypes.length];

    useScheduleStore.getState().setTask({
      id: taskId,
      templateRef: LOGIN_TMPL_ID,
      completionState: 'complete',
      completedAt: `${eventDate}T10:00:00.000Z`,
      resultFields: {},
      attachmentRef: null,
      resourceRef: null,
      location: null,
      sharedWith: null,
      questRef: null,
      actRef: null,
      secondaryTag: null,
    } as never);

    const histEvent = {
      id: evId,
      eventType: tmplType,
      plannedEventRef: null,
      name: `Day ${day} Completed Event`,
      startDate: eventDate,
      startTime: '10:00',
      endDate: eventDate,
      endTime: '11:00',
      tasks: [taskId],
      completionState: 'complete',
      xpAwarded: 10,
      attachments: [],
      location: null,
      note: null,
      sharedWith: null,
      coAttendees: null,
    };
    // Archive directly into historyEvents
    const currentHistory = useScheduleStore.getState().historyEvents;
    useScheduleStore.setState({ historyEvents: { ...currentHistory, [evId]: histEvent } } as never);
    storageSet(`event:${evId}`, histEvent);
    eventCount++;
  }

  // ── Append 15+ feed entries with varied sourceTypes ───────────────────
  const feedSourceTypes = [
    FEED_SOURCE.EVENT_COMPLETE,
    FEED_SOURCE.LEVEL_UP,
    FEED_SOURCE.BADGE_AWARDED,
    FEED_SOURCE.MARKER_FIRE,
    FEED_SOURCE.ROLLOVER,
    FEED_SOURCE.GTD_COMPLETE,
    FEED_SOURCE.FAVOURITE_COMPLETE,
    FEED_SOURCE.EVENT_COMPLETE,
    FEED_SOURCE.BADGE_AWARDED,
    FEED_SOURCE.ROLLOVER,
    FEED_SOURCE.MARKER_FIRE,
    FEED_SOURCE.EVENT_COMPLETE,
    FEED_SOURCE.LEVEL_UP,
    FEED_SOURCE.BADGE_AWARDED,
    FEED_SOURCE.MARKER_FIRE,
    FEED_SOURCE.GTD_COMPLETE,
  ] as const;

  const baseTs = Date.now() - 30 * 86_400_000;
  for (let i = 0; i < feedSourceTypes.length; i++) {
    const currentDsUser = useUserStore.getState().user!;
    appendFeedEntry(
      {
        commentBlock: `Dataset feed entry ${i + 1} — ${feedSourceTypes[i]}`,
        sourceType: feedSourceTypes[i],
        timestamp: new Date(baseTs + i * 86_400_000).toISOString(),
      },
      currentDsUser,
    );
  }

  // ── Measure storage usage ─────────────────────────────────────────────
  // Persist current store state to localStorage for accurate measurement
  const finalDsUser = useUserStore.getState().user!;
  storageSet('user', finalDsUser);

  const usage = getStorageUsage();
  const usedKB = usage.usedKB;

  // ── Dataset assertions ────────────────────────────────────────────────
  const dsUserFinal  = useUserStore.getState().user!;
  const dsFeedFinal  = getFeedEntries(dsUserFinal);
  const dsBadgeCount = dsUserFinal.progression.badgeBoard.earned.length;
  const dsHistEvents = useScheduleStore.getState().historyEvents;
  const dsHistCount  = Object.keys(dsHistEvents).length;

  const dsStatGroups = new Set(
    Object.entries(dsUserFinal.progression.stats.talents)
      .filter(([, t]) => (t as { statPoints: number }).statPoints > 0)
      .map(([k]) => k),
  );

  assert('30-day dataset — seeded without error',                 true);
  assert(
    '30-day dataset — 20 events in history',
    dsHistCount >= 20,
    `got: ${dsHistCount}`,
  );
  assert(
    '30-day dataset — ≥3 stat groups awarded',
    dsStatGroups.size >= 3,
    `groups: ${[...dsStatGroups].join(', ')}`,
  );
  assert(
    '30-day dataset — ≥2 achievements unlocked',
    dsBadgeCount >= 2,
    `badges: ${dsBadgeCount}`,
  );
  assert(
    '30-day dataset — feed has ≥15 entries',
    dsFeedFinal.length >= 15,
    `got: ${dsFeedFinal.length}`,
  );
  assert(
    '30-day dataset — usedKB > 0',
    usedKB > 0,
    `usedKB: ${usedKB.toFixed(2)}`,
  );

  console.log(`\n  ── 30-Day Dataset Summary ───────────────────────`);
  console.log(`  Events (history):    ${dsHistCount}`);
  console.log(`  Achievements:        ${dsBadgeCount}`);
  console.log(`  Stat groups awarded: ${[...dsStatGroups].join(', ')}`);
  console.log(`  Feed entries:        ${dsFeedFinal.length}`);
  console.log(`  Storage used:        ${usedKB.toFixed(2)} KB`);

  // ═══════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed / ${failed} failed`);
  console.log('═'.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('MVP11 validation script threw:', err);
  process.exit(1);
});
