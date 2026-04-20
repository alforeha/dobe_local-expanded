/// <reference types="node" />
// ─────────────────────────────────────────
// MVP06 VALIDATION SCRIPT
// Run via: npx tsx src/engine/__validate__/mvp06.validate.ts
//
// Tests A01 – A04 acceptance criteria.
// Uses dynamic imports so the localStorage stub is active BEFORE Zustand
// persist middleware initialises (ESM static imports are hoisted and would
// execute before any inline code, defeating a top-level stub).
// ─────────────────────────────────────────

// ── STUB localStorage ─────────────────────────────────────────────────────────
// Runs before any dynamic import that may trigger Zustand persist hydration.

const _store: Record<string, string> = {};
const _lsStub = {
  getItem: (k: string) => _store[k] ?? null,
  setItem: (k: string, v: string) => { _store[k] = v; },
  removeItem: (k: string) => { delete _store[k]; },
  clear: () => { for (const k in _store) delete _store[k]; },
  get length() { return Object.keys(_store).length; },
  key: (i: number) => Object.keys(_store)[i] ?? null,
};
Object.defineProperty(globalThis, 'localStorage', { value: _lsStub, writable: true, configurable: true });

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
  console.log(`\n${'─'.repeat(56)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(56));
}

// ── SEED FACTORIES ────────────────────────────────────────────────────────────

function makePlannedEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'pe-test-1',
    name: 'Morning Workout',
    description: '',
    icon: '',
    color: '',
    seedDate: '2026-03-10',
    dieDate: null,
    recurrenceInterval: { frequency: 'daily', interval: 1, days: [], endsOn: null },
    activeState: 'active',
    taskPool: ['tmpl-a', 'tmpl-b', 'tmpl-c'],
    taskPoolCursor: 0,
    taskList: [],
    conflictMode: 'concurrent',
    startTime: '07:00',
    endTime: '08:00',
    location: null,
    sharedWith: null,
    pushReminder: null,
    ...overrides,
  };
}

function makeTaskTemplate(xpHealth = 10): Record<string, unknown> {
  return {
    name: 'Test Template',
    description: '',
    icon: '',
    taskType: 'action',
    inputFields: { type: 'action' },
    xpAward: { health: xpHealth, strength: 0, agility: 0, defense: 0, charisma: 0, wisdom: 0 },
    cooldown: null,
    media: null,
    items: [],
  };
}

function makeUser(): Record<string, unknown> {
  const groups = ['health', 'strength', 'agility', 'defense', 'charisma', 'wisdom'] as const;
  const talents = Object.fromEntries(groups.map((g) => [g, { statPoints: 0, xpEarned: 0, tier: 0 }]));
  const talentTree = Object.fromEntries(groups.map((g) => [g, {}]));
  return {
    system: { id: 'user-1', displayName: 'Tester', wrappedAnchor: '2026-01-01', auth: null },
    personal: { nameFirst: 'Test', nameLast: 'User', handle: 'testuser', birthday: '1990-01-01' },
    progression: {
      stats: {
        xp: 0, level: 1, talentPoints: 0,
        milestones: { streakCurrent: 0, streakBest: 0, questsCompleted: 0, tasksCompleted: 0 },
        talents, talentTree,
      },
      avatar: { equippedGear: {}, slotTaxonomyRef: '', publicVisibility: null, additionalAnimations: null },
      badgeBoard: { earned: [], pinned: [], publicVisibility: null },
      equipment: { equipment: [], storeUnlocks: null },
      gold: 0,
      statGroups: { health: 0, strength: 0, agility: 0, defense: 0, charisma: 0, wisdom: 0 },
      talentTree: null,
    },
    lists: { favouritesList: [], gtdList: [], shoppingLists: [], manualGtdList: [] },
    resources: { homes: [], vehicles: [], contacts: [], accounts: [], inventory: [], docs: [] },
    feed: { entries: [], unreadCount: 0, sharedActivityEntries: null },
    publicProfile: null,
  };
}

// ── MAIN — dynamic imports so localStorage stub is set before Zustand loads ───

async function main(): Promise<void> {
  // Import stores and engine AFTER localStorage stub is ready.
  // Dynamic import() fires here (in function body), not at module parse time.
  const { useScheduleStore } = await import('../../stores/useScheduleStore');
  const { useUserStore } = await import('../../stores/useUserStore');
  const { useSystemStore } = await import('../../stores/useSystemStore');
  const { advanceCursor, materialisePlannedEvent } = await import('../materialise');
  const { executeRollover } = await import('../rollover');
  const { completeTask } = await import('../eventExecution');
  const { deriveLevelFromXP } = await import('../awardPipeline');

  const templates: Record<string, unknown> = {
    'tmpl-a': makeTaskTemplate(10),
    'tmpl-b': makeTaskTemplate(10),
    'tmpl-c': makeTaskTemplate(10),
  };

  // ── A01 — PlannedEvent materialises into Event ──────────────────────────────

  section('A01 — PlannedEvent materialises into Event');

  useScheduleStore.getState().reset();
  useUserStore.getState().reset();
  useSystemStore.getState().reset();
  useUserStore.setState({ user: makeUser() as never });
  useScheduleStore.setState({ taskTemplates: templates as never });

  const pe1 = makePlannedEvent({ taskPoolCursor: 0 }) as never;
  const result = materialisePlannedEvent(pe1, '2026-03-19', templates as never);

  assert('Event created', !!result.event);
  assert('Event has correct date', result.event.startDate === '2026-03-19', `got ${result.event.startDate}`);
  assert('Event eventType is planned', result.event.eventType === 'planned');
  assert('Event plannedEventRef matches PE id', result.event.plannedEventRef === 'pe-test-1');
  assert('Event has 1 task', result.event.tasks.length === 1, `got ${result.event.tasks.length}`);
  assert('Task exists in store', !!useScheduleStore.getState().tasks[result.event.tasks[0]!]);
  assert('Task templateRef is tmpl-a (cursor=0)', result.tasks[0]?.templateRef === 'tmpl-a', `got ${result.tasks[0]?.templateRef}`);
  assert('taskPoolCursor advanced to 1', result.updatedPlannedEvent.taskPoolCursor === 1, `got ${result.updatedPlannedEvent.taskPoolCursor}`);
  assert('Event in activeEvents store', !!useScheduleStore.getState().activeEvents[result.event.id]);

  // ── A04 — Cursor wrap ───────────────────────────────────────────────────────

  section('A04 — taskPool cursor wraps at pool end (3-item pool, 4 calls)');

  useScheduleStore.getState().reset();
  useScheduleStore.setState({ taskTemplates: templates as never });

  let currentPE: never = makePlannedEvent({ id: 'pe-wrap', taskPoolCursor: 0 }) as never;
  const cursors: number[] = [(currentPE as unknown as { taskPoolCursor: number }).taskPoolCursor];

  for (let i = 0; i < 3; i++) {
    const r = materialisePlannedEvent(currentPE, `2026-03-${20 + i}`, templates as never);
    currentPE = r.updatedPlannedEvent as never;
    cursors.push((currentPE as unknown as { taskPoolCursor: number }).taskPoolCursor);
  }

  assert('Cursor after call 1: 1', cursors[1] === 1, `got ${cursors[1]}`);
  assert('Cursor after call 2: 2', cursors[2] === 2, `got ${cursors[2]}`);
  assert('Cursor after call 3: 0 (wrapped)', cursors[3] === 0, `got ${cursors[3]}`);

  const advPE0 = makePlannedEvent({ taskPoolCursor: 0 }) as never;
  const advPE1 = makePlannedEvent({ taskPoolCursor: 1 }) as never;
  const advPE2 = makePlannedEvent({ taskPoolCursor: 2 }) as never;
  const a0 = advanceCursor(advPE0);
  const a1 = advanceCursor(advPE1);
  const a2 = advanceCursor(advPE2);
  assert('Cursor 0 -> templateRef tmpl-a', a0.templateRef === 'tmpl-a');
  assert('Cursor 1 -> templateRef tmpl-b', a1.templateRef === 'tmpl-b');
  assert('Cursor 2 -> templateRef tmpl-c', a2.templateRef === 'tmpl-c');
  assert('Cursor advances: 0->1', a0.nextCursor === 1);
  assert('Cursor advances: 1->2', a1.nextCursor === 2);
  assert('Cursor wraps: 2->0', a2.nextCursor === 0);

  // ── A03 — XP + stat award ───────────────────────────────────────────────────

  section('A03 — Completing a Task writes correct XP delta + stat delta');

  useScheduleStore.getState().reset();
  useUserStore.getState().reset();
  useUserStore.setState({ user: makeUser() as never });
  useScheduleStore.setState({ taskTemplates: templates as never });

  const pe2 = makePlannedEvent({ id: 'pe-xp-test', taskPoolCursor: 0 }) as never;
  const r2 = materialisePlannedEvent(pe2, '2026-03-19', templates as never);
  const taskId = r2.event.tasks[0]!;
  const eventId = r2.event.id;

  completeTask(taskId, eventId, { resultFields: {} });

  const updatedUser = useUserStore.getState().user as unknown as Record<string, never>;
  const statsA = (updatedUser?.progression as Record<string, never>)?.stats as Record<string, unknown>;
  const xpAfter = (statsA?.xp as number) ?? 0;
  const talentsA = statsA?.talents as Record<string, { statPoints: number }> | undefined;
  const healthPts = talentsA?.health?.statPoints ?? 0;
  const tasksCompleted = ((statsA?.milestones as Record<string, number>) ?? {}).tasksCompleted ?? 0;

  assert('XP incremented by 10 (template xpAward.health=10)', xpAfter === 10, `got ${xpAfter}`);
  assert('Health stat points incremented by 10', healthPts === 10, `got ${healthPts}`);
  assert('tasksCompleted milestone incremented', tasksCompleted === 1, `got ${tasksCompleted}`);

  // Wisdom fallback — task whose templateRef is NOT in the templates store
  useScheduleStore.getState().reset();
  useUserStore.getState().reset();
  useUserStore.setState({ user: makeUser() as never });

  const orphanTask = {
    id: 'task-orphan',
    templateRef: 'tmpl-nonexistent',
    completionState: 'pending',
    completedAt: null,
    resultFields: {},
    attachmentRef: null,
    resourceRef: null,
    location: null,
    sharedWith: null,
  };
  const orphanEvent = {
    id: 'evt-orphan',
    eventType: 'planned',
    plannedEventRef: 'pe-orphan',
    name: 'Orphan Event',
    startDate: '2026-03-19',
    startTime: '09:00',
    endDate: '2026-03-19',
    endTime: '10:00',
    tasks: ['task-orphan'],
    completionState: 'pending',
    xpAwarded: 0,
    attachments: [],
    location: null,
    note: null,
    sharedWith: null,
    coAttendees: null,
  };
  // Intentionally empty templates map so the templateRef lookup falls back to wisdom
  useScheduleStore.setState({
    tasks: { 'task-orphan': orphanTask } as never,
    activeEvents: { 'evt-orphan': orphanEvent } as never,
    taskTemplates: {} as never,
  });

  completeTask('task-orphan', 'evt-orphan', { resultFields: {} });

  const fbUser = useUserStore.getState().user as unknown as Record<string, never>;
  const fbStats = (fbUser?.progression as Record<string, never>)?.stats as Record<string, unknown>;
  const fbTalents = fbStats?.talents as Record<string, { statPoints: number }> | undefined;
  const wisdomPts = fbTalents?.wisdom?.statPoints ?? 0;
  const xpFb = (fbStats?.xp as number) ?? 0;

  assert('Wisdom fallback: wisdom statPoints +25', wisdomPts === 25, `got ${wisdomPts}`);
  assert('Wisdom fallback: XP +5', xpFb === 5, `got ${xpFb}`);

  assert('deriveLevelFromXP(0) = 1', deriveLevelFromXP(0) === 1);
  assert('deriveLevelFromXP(1154) >= 10 (smoke)', deriveLevelFromXP(1154) >= 10, `got ${deriveLevelFromXP(1154)}`);

  // ── A02 — Full rollover + resume ────────────────────────────────────────────

  section('A02 — Full rollover executes all 9 steps on seeded dataset');

  useScheduleStore.getState().reset();
  useUserStore.getState().reset();
  useSystemStore.getState().reset();
  useUserStore.setState({ user: makeUser() as never });
  useScheduleStore.setState({ taskTemplates: templates as never });

  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const dayOfWeek = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[today.getDay()]!;

  const peDaily = makePlannedEvent({
    id: 'pe-daily',
    seedDate: '2026-03-10',
    recurrenceInterval: { frequency: 'daily', interval: 1, days: [], endsOn: null },
    taskPoolCursor: 0,
  });

  const peWeekly = makePlannedEvent({
    id: 'pe-weekly',
    seedDate: '2026-03-12',
    recurrenceInterval: { frequency: 'weekly', interval: 1, days: [dayOfWeek], endsOn: null },
    taskPool: ['tmpl-b'],
    taskPoolCursor: 0,
  });

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayISO = yesterday.toISOString().slice(0, 10);

  const qaYesterday = {
    id: `qa-${yesterdayISO}`,
    eventType: 'quickActions',
    date: yesterdayISO,
    completions: [],
    xpAwarded: 0,
    sharedCompletions: null,
  };

  useScheduleStore.setState({
    plannedEvents: { 'pe-daily': peDaily, 'pe-weekly': peWeekly } as never,
    activeEvents: { [`qa-${yesterdayISO}`]: qaYesterday } as never,
    taskTemplates: templates as never,
  });

  await executeRollover(todayISO, 1);

  const sysState = useSystemStore.getState();
  const schedState = useScheduleStore.getState();

  assert('lastRollover set to today', sysState.lastRollover === todayISO, `got ${sysState.lastRollover}`);
  assert('rolloverStep cleared (null)', sysState.rolloverStep === null, `got ${sysState.rolloverStep}`);
  assert('New QA event created for today', !!schedState.activeEvents[`qa-${todayISO}`]);
  assert('Yesterday QA event moved to history', !!schedState.historyEvents[`qa-${yesterdayISO}`]);
  assert(
    'Daily PE materialised -> Event in active',
    Object.values(schedState.activeEvents as Record<string, unknown>).some(
      (e) => typeof e === 'object' && e !== null && 'plannedEventRef' in e && (e as { plannedEventRef: string }).plannedEventRef === 'pe-daily',
    ),
    'no event with plannedEventRef=pe-daily found in activeEvents',
  );

  // Resume test
  useSystemStore.setState({ rolloverStep: 4 });
  assert('Resume: rolloverStep set to 4', useSystemStore.getState().rolloverStep === 4);
  await executeRollover(todayISO, 4);
  assert('Resume: rolloverStep cleared to null after completing', useSystemStore.getState().rolloverStep === null);

  // ── SUMMARY ─────────────────────────────────────────────────────────────────

  console.log(`\n${'═'.repeat(56)}`);
  console.log(`  RESULTS: ${passed} passed / ${failed} failed`);
  console.log('═'.repeat(56));

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('Validation script threw:', err);
  process.exit(1);
});
