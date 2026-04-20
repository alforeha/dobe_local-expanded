// ─────────────────────────────────────────
// MVP07 VALIDATION SCRIPT
// Run via: npx tsx src/engine/__validate__/mvp07.validate.ts
//
// Tests A01 – A04 acceptance criteria for the Quest System.
// Uses dynamic imports so the localStorage stub is active BEFORE Zustand
// persist middleware initialises (ESM static imports are hoisted and would
// execute before any inline code, defeating a top-level stub).
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
  console.log(`\n${'─'.repeat(56)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(56));
}

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const TODAY     = '2026-03-19';
const YESTERDAY = '2026-03-18';
const QUEST_TMPL_ID = 'tmpl-quest-1';

// ── FACTORIES ─────────────────────────────────────────────────────────────────

function makeUser(xp = 0): Record<string, unknown> {
  const groups = ['health', 'strength', 'agility', 'defense', 'charisma', 'wisdom'] as const;
  const talents     = Object.fromEntries(groups.map((g) => [g, { statPoints: 0, xpEarned: 0, tier: 0 }]));
  const talentTree  = Object.fromEntries(groups.map((g) => [g, {}]));
  return {
    system:    { id: 'user-1', displayName: 'Tester', wrappedAnchor: '2026-01-01', auth: null },
    personal:  { nameFirst: 'Test', nameLast: 'User', handle: 'testuser', birthday: '1990-01-01' },
    progression: {
      stats: {
        xp, level: 1, talentPoints: 0,
        milestones: { streakCurrent: 0, streakBest: 0, questsCompleted: 0, tasksCompleted: 0 },
        talents, talentTree,
      },
      avatar:     { equippedGear: {}, slotTaxonomyRef: '', publicVisibility: null, additionalAnimations: null },
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

function makeQuestTemplate(): Record<string, unknown> {
  return {
    name:        'Quest Check-in',
    description: '',
    icon:        '',
    taskType:    'action',
    inputFields: { type: 'action' },
    xpAward: { health: 10, strength: 0, agility: 0, defense: 0, charisma: 0, wisdom: 0 },
    cooldown: null,
    media:    null,
    items:    [],
  };
}

/** Interval Marker seeded as due for TODAY's rollover (nextFire = YESTERDAY) */
function makeIntervalMarker(actId: string): Record<string, unknown> {
  return {
    questRef:       `${actId}|0|0`,
    conditionType:  'interval',
    interval:       { frequency: 'daily', interval: 1, days: [], endsOn: null },
    xpThreshold:    null,
    taskTemplateRef: QUEST_TMPL_ID,
    lastFired:       null,
    xpAtLastFire:    null,
    nextFire:        YESTERDAY,
    activeState:     true,
  };
}

/** xpThreshold Marker (no nextFire — fires on XP delta) */
function makeXpMarker(actId: string, threshold: number): Record<string, unknown> {
  return {
    questRef:        `${actId}|0|0`,
    conditionType:   'xpThreshold',
    interval:        null,
    xpThreshold:     threshold,
    taskTemplateRef: QUEST_TMPL_ID,
    lastFired:       null,
    xpAtLastFire:    null,
    nextFire:        null,
    activeState:     true,
  };
}

function makeQuest(options: {
  actId:        string;
  targetValue?: number;
  markers?:     Record<string, unknown>[];
  condType?:    string;
  milestones?:  Record<string, unknown>[];
  progressPercent?: number;
  completionState?: string;
}): Record<string, unknown> {
  const {
    actId, targetValue = 5,
    markers, condType = 'interval',
    milestones = [], progressPercent = 0,
    completionState = 'active',
  } = options;

  const resolvedMarkers = markers ?? [makeIntervalMarker(actId)];
  return {
    name:            'Test Quest',
    description:     '',
    icon:            '',
    completionState,
    specific: {
      targetValue,
      unit:             'sessions',
      sourceType:       'taskInput',
      resourceRef:      null,
      resourceProperty: null,
    },
    measurable: { taskTemplateRefs: [] },
    attainable: {},
    relevant:   {},
    timely: {
      conditionType: condType,
      interval: condType === 'interval'
        ? { frequency: 'daily', interval: 1, days: [], endsOn: null }
        : null,
      xpThreshold:    condType === 'xpThreshold' ? 100 : null,
      markers:        resolvedMarkers,
      projectedFinish: null,
    },
    exigency:       { onMissedFinish: 'extend' },
    result:         {},
    milestones,
    questReward:    '',
    progressPercent,
  };
}

function makeAct(actId: string, quest: Record<string, unknown>): Record<string, unknown> {
  return {
    id:   actId,
    name: 'Test Act',
    description: '',
    icon:        '',
    owner:       'user-1',
    chains: [{
      name:            'Test Chain',
      description:     '',
      icon:            '',
      wish: '', outcome: '', obstacle: '',
      plan:            {},
      chainReward:     '',
      quests:          [quest],
      completionState: 'active',
    }],
    accountability: null,
    commitment:     { trackedTaskRefs: [], routineRefs: [] },
    toggle:         {},
    completionState: 'active',
    sharedContacts:  null,
  };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { useScheduleStore }   = await import('../../stores/useScheduleStore');
  const { useUserStore }       = await import('../../stores/useUserStore');
  const { useSystemStore }     = await import('../../stores/useSystemStore');
  const { useProgressionStore} = await import('../../stores/useProgressionStore');
  const { storageSet, storageGet, storageKey } = await import('../../storage');
  const { executeRollover }    = await import('../rollover');
  const { completeTask }       = await import('../eventExecution');
  const {
    fireMarker, encodeQuestRef, decodeQuestRef,
  } = await import('../markerEngine');
  const {
    evaluateMarkerCondition, deriveQuestProgress,
  } = await import('../questEngine');

  function resetAll(): void {
    useScheduleStore.getState().reset();
    useUserStore.getState().reset();
    useSystemStore.getState().reset();
    useProgressionStore.getState().reset();
  }

  // Helper: find the first task in scheduleStore.tasks whose questRef matches
  function findTaskByQuestRef(qRef: string): string | undefined {
    return Object.values(useScheduleStore.getState().tasks)
      .find((t) => t.questRef === qRef)?.id;
  }

  // ── A01 — Hierarchy instantiation + localStorage persistence ─────────────

  section('A01 — Hierarchy instantiation + localStorage persistence');
  resetAll();

  const a01ActId = 'act-a01';

  // Build a Milestone (top of the hierarchy, manually for A01)
  const a01Milestone: Record<string, unknown> = {
    questRef:          `${a01ActId}|0|0`,
    actRef:            a01ActId,
    resourceRef:       null,
    taskTemplateShape: makeQuestTemplate(),
    completedAt:       TODAY,
    resultFields:      { count: 3 },
  };

  const a01Quest = makeQuest({
    actId:        a01ActId,
    targetValue:  5,
    milestones:   [a01Milestone],
    progressPercent: 60,
  });
  const a01Act = makeAct(a01ActId, a01Quest);

  // Seed store + storage (simulating app writing to localStorage)
  useProgressionStore.getState().setAct(a01Act as never);
  storageSet(storageKey.act(a01ActId), a01Act);

  // Simulate hard-reload: read back from localStorage only
  const loaded = storageGet<Record<string, unknown>>(storageKey.act(a01ActId));

  assert('A01.1 — Act reloads from localStorage',          !!loaded);
  assert('A01.2 — Act.id survives round-trip',              loaded?.id === a01ActId);

  const loadedChain = (loaded?.chains as unknown[])?.[0] as Record<string, unknown> | undefined;
  assert('A01.3 — Chain present after reload',              !!loadedChain);

  const loadedQuestArr = loadedChain?.quests as unknown[] | undefined;
  const loadedQuest    = loadedQuestArr?.[0] as Record<string, unknown> | undefined;
  assert('A01.4 — Quest present after reload',              !!loadedQuest);
  assert('A01.5 — Quest.completionState correct',           loadedQuest?.completionState === 'active');
  assert('A01.6 — Quest.progressPercent survived',          loadedQuest?.progressPercent === 60);

  const loadedMilestones = loadedQuest?.milestones as unknown[] | undefined;
  const loadedMs         = loadedMilestones?.[0] as Record<string, unknown> | undefined;
  assert('A01.7 — Milestone present after reload',          !!loadedMs);
  assert('A01.8 — Milestone.questRef encoded correctly',    loadedMs?.questRef === `${a01ActId}|0|0`);
  assert('A01.9 — Milestone.actRef correct',                loadedMs?.actRef === a01ActId);
  assert('A01.10 — Milestone.resultFields.count = 3',
    (loadedMs?.resultFields as Record<string, unknown>)?.count === 3,
  );

  // Also verify the in-memory progressionStore holds the act
  const inMemAct = useProgressionStore.getState().acts[a01ActId];
  assert('A01.11 — Act in progressionStore',                !!inMemAct);
  assert('A01.12 — Quest accessible in progressionStore',
    !!inMemAct?.chains[0]?.quests[0],
  );

  // ── A02 — Marker fires correctly when condition is met ───────────────────

  section('A02a — Interval Marker fires via rollover when nextFire is past');
  resetAll();

  const a02aActId = 'act-a02-iv';
  const a02aQuest = makeQuest({ actId: a02aActId });      // interval, nextFire=YESTERDAY
  const a02aAct   = makeAct(a02aActId, a02aQuest);

  useProgressionStore.getState().setAct(a02aAct as never);
  useUserStore.setState({ user: makeUser() as never });
  useScheduleStore.setState({
    taskTemplates: { [QUEST_TMPL_ID]: makeQuestTemplate() } as never,
  });

  await executeRollover(TODAY, 1);

  const a02aQuestRef = encodeQuestRef(a02aActId, 0, 0);
  const a02aTaskId   = findTaskByQuestRef(a02aQuestRef);

  assert('A02a.1 — Task created in schedule store',
    !!a02aTaskId);
  assert('A02a.2 — Task.questRef matches encoded ref',
    useScheduleStore.getState().tasks[a02aTaskId ?? '']?.questRef === a02aQuestRef,
  );
  assert('A02a.3 — Task.actRef = actId',
    useScheduleStore.getState().tasks[a02aTaskId ?? '']?.actRef === a02aActId,
  );
  assert('A02a.4 — Task pushed to user.lists.gtdList',
    useUserStore.getState().user?.lists.gtdList.includes(a02aTaskId ?? '') ?? false,
  );

  const a02aFiredAct  = useProgressionStore.getState().acts[a02aActId];
  const a02aFiredMkr  = a02aFiredAct?.chains[0]?.quests[0]?.timely.markers[0];
  const realToday = new Date().toISOString().slice(0, 10);
  assert('A02a.5 — Marker.lastFired set to today (wall-clock UTC)',
    a02aFiredMkr?.lastFired === realToday,
    `got ${a02aFiredMkr?.lastFired}, expected ${realToday}`,
  );
  assert('A02a.6 — Marker.nextFire advanced past YESTERDAY',
    (a02aFiredMkr?.nextFire ?? '') > YESTERDAY,
    `got ${a02aFiredMkr?.nextFire}`,
  );

  section('A02b — xpThreshold Marker fires via rollover when XP delta >= threshold');
  resetAll();

  const a02bActId  = 'act-a02-xp';
  const a02bMarker = makeXpMarker(a02bActId, 100);
  const a02bQuest  = makeQuest({
    actId:    a02bActId,
    condType: 'xpThreshold',
    markers:  [a02bMarker],
  });
  const a02bAct = makeAct(a02bActId, a02bQuest);

  useProgressionStore.getState().setAct(a02bAct as never);
  useUserStore.setState({ user: makeUser(100) as never });   // xp = 100 = threshold
  useScheduleStore.setState({
    taskTemplates: { [QUEST_TMPL_ID]: makeQuestTemplate() } as never,
  });

  // Verify evaluateMarkerCondition agrees before running rollover
  assert('A02b.1 — evaluateMarkerCondition returns true at threshold',
    evaluateMarkerCondition(a02bMarker as never, 100),
  );
  assert('A02b.2 — evaluateMarkerCondition returns false below threshold',
    !evaluateMarkerCondition(a02bMarker as never, 99),
  );

  await executeRollover(TODAY, 1);

  const a02bQuestRef = encodeQuestRef(a02bActId, 0, 0);
  const a02bTaskId   = findTaskByQuestRef(a02bQuestRef);

  assert('A02b.3 — Task created for xpThreshold Marker',
    !!a02bTaskId,
  );
  assert('A02b.4 — Task pushed to gtdList',
    useUserStore.getState().user?.lists.gtdList.includes(a02bTaskId ?? '') ?? false,
  );

  const a02bFiredAct = useProgressionStore.getState().acts[a02bActId];
  const a02bFiredMkr = a02bFiredAct?.chains[0]?.quests[0]?.timely.markers[0];
  assert('A02b.5 — Marker.xpAtLastFire snapshots currentXp (100)',
    a02bFiredMkr?.xpAtLastFire === 100,
    `got ${a02bFiredMkr?.xpAtLastFire}`,
  );
  const realTodayB = new Date().toISOString().slice(0, 10);
  assert('A02b.6 — Marker.lastFired set to today (wall-clock UTC)',
    a02bFiredMkr?.lastFired === realTodayB,
    `got ${a02bFiredMkr?.lastFired}, expected ${realTodayB}`,
  );
  assert('A02b.7 — Marker.nextFire stays null (xpThreshold is not date-driven)',
    a02bFiredMkr?.nextFire === null,
    `got ${a02bFiredMkr?.nextFire}`,
  );

  // Verify resets correctly for next round: with xpAtLastFire=100, delta now = 0 < 100
  const a02bRefiredMkr = a02bFiredAct?.chains[0]?.quests[0]?.timely.markers[0];
  assert('A02b.8 — evaluateMarkerCondition false after fire (XP delta = 0)',
    !evaluateMarkerCondition({ ...(a02bRefiredMkr ?? {}), xpAtLastFire: 100 } as never, 100),
  );

  // ── A03 — Milestone creation + task completion hook ──────────────────────

  section('A03 — Manual fireMarker + completeMilestone via completeTask');
  resetAll();

  const a03ActId = 'act-a03';
  const a03Quest = makeQuest({ actId: a03ActId, targetValue: 5 });
  const a03Act   = makeAct(a03ActId, a03Quest);

  useProgressionStore.getState().setAct(a03Act as never);
  useUserStore.setState({ user: makeUser() as never });
  useScheduleStore.setState({
    taskTemplates: { [QUEST_TMPL_ID]: makeQuestTemplate() } as never,
  });

  // Get the marker from the stored act
  const a03StoredAct = useProgressionStore.getState().acts[a03ActId]!;
  const a03Marker    = a03StoredAct.chains[0]!.quests[0]!.timely.markers[0]!;

  // Fire marker manually
  fireMarker({
    marker:      a03Marker,
    markerIndex: 0,
    questIndex:  0,
    chainIndex:  0,
    actId:       a03ActId,
  });

  const a03QuestRef = encodeQuestRef(a03ActId, 0, 0);
  const a03TaskId   = findTaskByQuestRef(a03QuestRef);

  assert('A03.1 — Task created with questRef set',         !!a03TaskId);
  assert('A03.2 — Task.questRef matches encoded ref',
    useScheduleStore.getState().tasks[a03TaskId ?? '']?.questRef === a03QuestRef,
  );
  assert('A03.3 — Task.actRef = actId',
    useScheduleStore.getState().tasks[a03TaskId ?? '']?.actRef === a03ActId,
  );
  assert('A03.4 — Task.resourceRef null (taskInput sourceType)',
    useScheduleStore.getState().tasks[a03TaskId ?? '']?.resourceRef === null,
  );
  assert('A03.5 — Task in gtdList',
    useUserStore.getState().user?.lists.gtdList.includes(a03TaskId ?? '') ?? false,
  );

  // Smoke-test questRef encoding/decoding
  const decoded = decodeQuestRef(a03QuestRef);
  assert('A03.6 — encodeQuestRef format: "${actId}|0|0"',  a03QuestRef === `${a03ActId}|0|0`);
  assert('A03.7 — decodeQuestRef round-trips correctly',
    decoded?.actId === a03ActId && decoded?.chainIndex === 0 && decoded?.questIndex === 0,
  );
  assert('A03.8 — decodeQuestRef returns null for malformed ref',
    decodeQuestRef('bad-ref') === null,
  );

  // Complete the fired task (this triggers completeMilestone)
  completeTask(a03TaskId!, 'evt-dummy', { resultFields: {} });

  const a03PostAct   = useProgressionStore.getState().acts[a03ActId]!;
  const a03PostQuest = a03PostAct.chains[0]!.quests[0]!;
  const ms0          = a03PostQuest.milestones[0] as unknown as Record<string, unknown> | undefined;

  assert('A03.9 — Milestone appended to quest.milestones',  a03PostQuest.milestones.length === 1);
  assert('A03.10 — Milestone.questRef matches encoded ref',  ms0?.questRef === a03QuestRef);
  assert('A03.11 — Milestone.actRef = actId',                ms0?.actRef === a03ActId);
  assert('A03.12 — Milestone.resourceRef null',              ms0?.resourceRef === null);
  assert('A03.13 — Milestone.completedAt is a string',       typeof ms0?.completedAt === 'string');

  // Quest should still be active (1 milestone, targetValue=5, no numeric result)
  assert('A03.14 — Quest still active (finish not yet met)', a03PostQuest.completionState === 'active');

  // updateQuestProgress should have written progressPercent = round(1/5*100) = 20
  assert('A03.15 — Quest.progressPercent updated to 20 (count-based fallback, 1/5)',
    a03PostQuest.progressPercent === 20,
    `got ${a03PostQuest.progressPercent}`,
  );

  // A03.16 — Quest finish condition evaluates true and closes the quest
  // Simulated by firing and completing with a result that meets targetValue
  const a03bActId = 'act-a03b';
  const a03bQuest = makeQuest({ actId: a03bActId, targetValue: 10 });
  const a03bAct   = makeAct(a03bActId, a03bQuest);

  useProgressionStore.getState().setAct(a03bAct as never);

  const a03bStoredAct = useProgressionStore.getState().acts[a03bActId]!;
  const a03bMarker    = a03bStoredAct.chains[0]!.quests[0]!.timely.markers[0]!;

  fireMarker({ marker: a03bMarker, markerIndex: 0, questIndex: 0, chainIndex: 0, actId: a03bActId });

  const a03bTaskId = findTaskByQuestRef(encodeQuestRef(a03bActId, 0, 0));
  completeTask(a03bTaskId!, 'evt-dummy', { resultFields: { score: 10 } as never });

  const a03bPostQuest = useProgressionStore.getState().acts[a03bActId]!.chains[0]!.quests[0]!;
  assert('A03.16 — Quest completes when evaluateQuestSpecific returns true',
    a03bPostQuest.completionState === 'complete',
    `got ${a03bPostQuest.completionState}`,
  );
  assert('A03.17 — progressPercent = 100 on completion',
    a03bPostQuest.progressPercent === 100,
    `got ${a03bPostQuest.progressPercent}`,
  );
  assert('A03.18 — All markers deactivated on quest completion',
    a03bPostQuest.timely.markers.every((m) => !m.activeState),
  );

  // ── A04 — Quest progress accurate across 3 configurations ────────────────

  section('A04 — Progress accuracy across 3 configurations');

  // — Config 1: taskInput with numeric resultFields — value/targetValue × 100 ─

  resetAll();
  const c1ActId = 'act-a04-cfg1';
  const c1Quest = makeQuest({ actId: c1ActId, targetValue: 100 });
  const c1Act   = makeAct(c1ActId, c1Quest);

  useProgressionStore.getState().setAct(c1Act as never);
  useUserStore.setState({ user: makeUser() as never });
  useScheduleStore.setState({
    taskTemplates: { [QUEST_TMPL_ID]: makeQuestTemplate() } as never,
  });

  const c1StoredAct = useProgressionStore.getState().acts[c1ActId]!;
  fireMarker({
    marker:      c1StoredAct.chains[0]!.quests[0]!.timely.markers[0]!,
    markerIndex: 0, questIndex: 0, chainIndex: 0, actId: c1ActId,
  });

  const c1TaskId = findTaskByQuestRef(encodeQuestRef(c1ActId, 0, 0));
  completeTask(c1TaskId!, 'evt-dummy', { resultFields: { reps: 50 } });

  const c1Quest2 = useProgressionStore.getState().acts[c1ActId]!.chains[0]!.quests[0]!;
  assert('A04.C1.1 — Milestone added (Config 1)',           c1Quest2.milestones.length === 1);
  assert('A04.C1.2 — progressPercent = 50 (50/100)',
    c1Quest2.progressPercent === 50,
    `got ${c1Quest2.progressPercent}`,
  );

  // Smoke-test deriveQuestProgress reads last milestone's numeric value, not sum
  const c1QuestFor80 = makeQuest({ actId: c1ActId, targetValue: 100 });
  const c1Milestone80 = {
    questRef: `${c1ActId}|0|0`, actRef: c1ActId, resourceRef: null,
    taskTemplateShape: makeQuestTemplate(), completedAt: TODAY,
    resultFields: { reps: 80 },
  };
  (c1QuestFor80 as Record<string, unknown>).milestones = [c1Milestone80];
  assert('A04.C1.3 — deriveQuestProgress uses last milestone value (80/100 = 80)',
    deriveQuestProgress(c1QuestFor80 as never) === 80,
    `got ${deriveQuestProgress(c1QuestFor80 as never)}`,
  );

  // — Config 2: taskInput count-based (no numeric resultFields) — milestones/targetValue ─

  resetAll();
  const c2ActId = 'act-a04-cfg2';
  const c2Quest = makeQuest({ actId: c2ActId, targetValue: 3 });
  const c2Act   = makeAct(c2ActId, c2Quest);

  useProgressionStore.getState().setAct(c2Act as never);
  useUserStore.setState({ user: makeUser() as never });
  useScheduleStore.setState({
    taskTemplates: { [QUEST_TMPL_ID]: makeQuestTemplate() } as never,
  });

  // Fire and complete once (no numeric result → count-based fallback)
  const c2Stored  = useProgressionStore.getState().acts[c2ActId]!;
  fireMarker({
    marker:      c2Stored.chains[0]!.quests[0]!.timely.markers[0]!,
    markerIndex: 0, questIndex: 0, chainIndex: 0, actId: c2ActId,
  });
  const c2t1 = findTaskByQuestRef(encodeQuestRef(c2ActId, 0, 0));
  completeTask(c2t1!, 'evt-dummy', { resultFields: {} });

  const c2q1 = useProgressionStore.getState().acts[c2ActId]!.chains[0]!.quests[0]!;
  assert('A04.C2.1 — 1 milestone → progressPercent = 33 (1/3 count-based)',
    c2q1.progressPercent === 33,
    `got ${c2q1.progressPercent}`,
  );
  assert('A04.C2.2 — Quest still active (only 1 of 3)',     c2q1.completionState === 'active');

  // Fire and complete a second time
  fireMarker({
    marker:      useProgressionStore.getState().acts[c2ActId]!.chains[0]!.quests[0]!.timely.markers[0]!,
    markerIndex: 0, questIndex: 0, chainIndex: 0, actId: c2ActId,
  });
  const c2t2 = Object.values(useScheduleStore.getState().tasks)
    .filter((t) => t.questRef === encodeQuestRef(c2ActId, 0, 0) && t.completionState === 'pending')
    .map((t) => t.id)[0];
  completeTask(c2t2!, 'evt-dummy', { resultFields: {} });

  const c2q2 = useProgressionStore.getState().acts[c2ActId]!.chains[0]!.quests[0]!;
  assert('A04.C2.3 — 2 milestones → progressPercent = 67 (2/3)',
    c2q2.progressPercent === 67,
    `got ${c2q2.progressPercent}`,
  );
  assert('A04.C2.4 — Quest still active after 2 milestones', c2q2.completionState === 'active');

  // — Config 3: xpThreshold conditionType — same progress math, different fire cadence ─

  resetAll();
  const c3ActId  = 'act-a04-cfg3';
  const c3Marker = makeXpMarker(c3ActId, 200);
  const c3Quest  = makeQuest({
    actId: c3ActId, targetValue: 100, condType: 'xpThreshold', markers: [c3Marker],
  });
  const c3Act = makeAct(c3ActId, c3Quest);

  useProgressionStore.getState().setAct(c3Act as never);
  useUserStore.setState({ user: makeUser(200) as never }); // xp meets threshold
  useScheduleStore.setState({
    taskTemplates: { [QUEST_TMPL_ID]: makeQuestTemplate() } as never,
  });

  // Fire via rollover step5 (xpThreshold path)
  await executeRollover(TODAY, 5);   // resume at step 5 to only run evaluate + fire

  const c3QuestRef = encodeQuestRef(c3ActId, 0, 0);
  const c3TaskId   = findTaskByQuestRef(c3QuestRef);

  assert('A04.C3.1 — xpThreshold Marker fires via rollover', !!c3TaskId);

  // Complete with numeric value = 75: progress = 75/100 = 75%
  completeTask(c3TaskId!, 'evt-dummy', { resultFields: { value: 75 } as never });

  const c3QuestPost = useProgressionStore.getState().acts[c3ActId]!.chains[0]!.quests[0]!;
  assert('A04.C3.2 — progressPercent = 75 (75/100 numeric result)',
    c3QuestPost.progressPercent === 75,
    `got ${c3QuestPost.progressPercent}`,
  );
  assert('A04.C3.3 — Quest still active (75 < 100)',         c3QuestPost.completionState === 'active');

  // ── SUMMARY ──────────────────────────────────────────────────────────────────

  console.log(`\n${'═'.repeat(56)}`);
  console.log(`  RESULTS: ${passed} passed / ${failed} failed`);
  console.log('═'.repeat(56));

  if (failed > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error('Validation script threw:', err);
  process.exit(1);
});
