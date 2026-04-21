/// <reference types="node" />
// ─────────────────────────────────────────
// MVP09 VALIDATION SCRIPT
// Run via: npx tsx src/engine/__validate__/mvp09.validate.ts
//
// Tests A01 – A04 acceptance criteria for Resources, Feed,
// GTDList, FavouritesList, and ShoppingLists.
//
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

const TODAY = new Date().toISOString().slice(0, 10);
// Birthday that falls within the next 5 days — inside the 30-day GTD window
const nearDate = new Date(Date.now() + 5 * 86_400_000);
const NEAR_BIRTHDAY = `1990-${nearDate.toISOString().slice(5, 10)}`;

// ── FACTORIES ─────────────────────────────────────────────────────────────────

function makeUser(): Record<string, unknown> {
  const groups = ['health', 'strength', 'agility', 'defense', 'charisma', 'wisdom'] as const;
  const talents    = Object.fromEntries(groups.map((g) => [g, { statPoints: 0, xpEarned: 0, tier: 0 }]));
  const talentTree = Object.fromEntries(groups.map((g) => [g, {}]));
  return {
    system:    { id: 'user-1', displayName: 'Tester', wrappedAnchor: '2026-01-01', auth: null },
    personal:  { nameFirst: 'Test', nameLast: 'User', handle: 'testuser', birthday: '1990-01-01' },
    progression: {
      stats: {
        xp: 0, level: 1, talentPoints: 0,
        milestones: { streakCurrent: 0, streakBest: 0, longestHonestStreak: 0, questsCompleted: 0, tasksCompleted: 0, eventsCompleted: 0 },
        talents, talentTree,
      },
      avatar:     { equippedGear: {}, slotTaxonomyRef: '', publicVisibility: null, additionalAnimations: null },
      badgeBoard: { earned: [], pinned: [], publicVisibility: null },
      equipment:  { equipment: [], storeUnlocks: null },
      gold: 0,
      statGroups: { health: 0, strength: 0, agility: 0, defense: 0, charisma: 0, wisdom: 0 },
      talentTree: null,
    },
    lists:    { favouritesList: [], gtdList: [], shoppingLists: [], manualGtdList: [] },
    resources: { homes: [], vehicles: [], contacts: [], accounts: [], inventory: [], docs: [] },
    feed:     { entries: [], unreadCount: 0, sharedActivityEntries: null },
    publicProfile: null,
  };
}

function makeQAEvent(date: string): Record<string, unknown> {
  return {
    id: `qa-${date}`,
    eventType: 'quickActions',
    date,
    completions: [],
    xpAwarded: 0,
    sharedCompletions: null,
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

// ── RESOURCE SEEDS ────────────────────────────────────────────────────────────

function makeContactResource() {
  return {
    id: 'res-contact-1',
    name: 'Alice',
    icon: '',
    description: '',
    type: 'contact' as const,
    attachments: [] as string[],
    log: [] as unknown[],
    meta: {
      info: { birthday: NEAR_BIRTHDAY, phone: '555-1234', email: 'alice@example.com' },
      customTag: null,
      groups: [] as string[],
      notes: '',
    },
  };
}

function makeHomeResource() {
  return {
    id: 'res-home-1',
    name: 'Main Home',
    icon: '',
    description: '',
    type: 'home' as const,
    attachments: [] as string[],
    log: [] as unknown[],
    meta: {
      memberContactRefs: [] as string[],
      rooms: [] as unknown[],
      linkedInventoryRef: null,
      linkedDocs: [] as string[],
      recurringTasksStub: null,
    },
  };
}

function makeVehicleResource() {
  return {
    id: 'res-vehicle-1',
    name: 'My Car',
    icon: '',
    description: '',
    type: 'vehicle' as const,
    attachments: [] as string[],
    log: [] as unknown[],
    meta: {
      make: 'Toyota',
      model: 'Corolla',
      year: 2020,
      mileage: 45_000,
      memberContactRefs: [] as string[],
      linkedDocs: [] as string[],
      recurringTasksStub: null,
    },
  };
}

function makeAccountResource() {
  return {
    id: 'res-account-1',
    name: 'Checking Account',
    icon: '',
    description: '',
    type: 'account' as const,
    attachments: [] as string[],
    log: [] as unknown[],
    meta: {
      kind: 'bank',
      linkedAccountRef: null,
      linkedResourceRef: null,
      linkedDocs: [] as string[],
      balance: 1_000,
      balanceOverriddenAt: null,
      recurrenceRuleRef: 'monthly-ref',
      amount: 500,
      pendingTransactions: [
        {
          id: 'tx-1',
          date: TODAY,
          description: 'Groceries',
          sourceRef: null,
          assignedAccountRef: null,
          amount: 50,
          status: 'pending' as const,
        },
      ],
      transactionTaskRef: null,
    },
  };
}

function makeInventoryResource() {
  return {
    id: 'res-inventory-1',
    name: 'Kitchen Pantry',
    icon: '',
    description: '',
    type: 'inventory' as const,
    attachments: [] as string[],
    log: [] as unknown[],
    meta: {
      containers: [] as unknown[],
      items: [
        { id: 'useable-coffee', icon: '☕', name: 'Coffee', quantity: 0, threshold: 2 },
        { id: 'useable-bread',  icon: '🍞', name: 'Bread',  quantity: 0, threshold: 1 },
      ],
    },
  };
}

function makeDocResource() {
  return {
    id: 'res-doc-1',
    name: 'Lease Agreement',
    icon: '',
    description: '',
    type: 'doc' as const,
    attachments: [] as string[],
    log: [] as unknown[],
    meta: {
      docType: 'contract',
      content: '',
      linkedResourceRef: 'res-home-1',
      courseRef: null,
      progression: null,
      tags: [] as string[],
      createdAt: TODAY,
      updatedAt: TODAY,
    },
  };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Dynamic imports — localStorage stub must be set before any module with
  // Zustand persist middleware is evaluated.
  const { useScheduleStore } = await import('../../stores/useScheduleStore');
  const { useUserStore }     = await import('../../stores/useUserStore');
  const { useSystemStore }   = await import('../../stores/useSystemStore');
  const { useResourceStore } = await import('../../stores/useResourceStore');
  const { storageSet, storageGet, storageKey } = await import('../../storage');

  const {
    generateGTDItems,
    computeGTDList,
    completeGTDItem,
  } = await import('../resourceEngine');

  const {
    addFavourite,
    completeFavourite,
  } = await import('../listsEngine');

  const {
    appendFeedEntry,
    getFeedEntries,
    FEED_SOURCE,
  } = await import('../feedEngine');

  // ── A01 — Six Resource child types instantiate, persist, and load ──────────

  section('A01 — All six Resource child types instantiate, persist, and load');

  useResourceStore.getState().reset();

  const resContact  = makeContactResource();
  const resHome     = makeHomeResource();
  const resVehicle  = makeVehicleResource();
  const resAccount  = makeAccountResource();
  const resInventory = makeInventoryResource();
  const resDoc      = makeDocResource();

  // Persist each resource via storageSet (simulating a hard reload scenario)
  for (const r of [resContact, resHome, resVehicle, resAccount, resInventory, resDoc]) {
    storageSet(storageKey.resource(r.id), r);
  }

  // Load back and verify meta shapes
  type MaybeRecord = Record<string, unknown> | null;

  const ldContact  = storageGet<typeof resContact>(storageKey.resource('res-contact-1'));
  const ldHome     = storageGet<typeof resHome>(storageKey.resource('res-home-1'));
  const ldVehicle  = storageGet<typeof resVehicle>(storageKey.resource('res-vehicle-1'));
  const ldAccount  = storageGet<typeof resAccount>(storageKey.resource('res-account-1'));
  const ldInventory = storageGet<typeof resInventory>(storageKey.resource('res-inventory-1'));
  const ldDoc      = storageGet<typeof resDoc>(storageKey.resource('res-doc-1'));

  // Contact
  assert('Contact — loads from storage',               !!ldContact);
  assert('Contact — type correct',                     ldContact?.type === 'contact');
  assert('Contact — meta.info.birthday present',       !!((ldContact?.meta as MaybeRecord)?.info as MaybeRecord)?.birthday);
  assert('Contact — meta.notes is string',             typeof (ldContact?.meta as MaybeRecord)?.notes === 'string');
  assert('Contact — meta.groups is array',             Array.isArray((ldContact?.meta as MaybeRecord)?.groups));

  // Home
  assert('Home — loads from storage',                  !!ldHome);
  assert('Home — type correct',                        ldHome?.type === 'home');
  assert('Home — meta.rooms is array',                 Array.isArray((ldHome?.meta as MaybeRecord)?.rooms));
  assert('Home — meta.memberContactRefs is array',     Array.isArray((ldHome?.meta as MaybeRecord)?.memberContactRefs));

  // Vehicle
  assert('Vehicle — loads from storage',               !!ldVehicle);
  assert('Vehicle — type correct',                     ldVehicle?.type === 'vehicle');
  assert('Vehicle — meta.make is string',              typeof (ldVehicle?.meta as MaybeRecord)?.make === 'string');
  assert('Vehicle — meta.year is number',              typeof (ldVehicle?.meta as MaybeRecord)?.year === 'number');

  // Account
  assert('Account — loads from storage',               !!ldAccount);
  assert('Account — type correct',                     ldAccount?.type === 'account');
  assert('Account — meta.kind present',                !!(ldAccount?.meta as MaybeRecord)?.kind);
  assert('Account — meta.pendingTransactions is array', Array.isArray((ldAccount?.meta as MaybeRecord)?.pendingTransactions));
  assert('Account — meta.balance is number',           typeof (ldAccount?.meta as MaybeRecord)?.balance === 'number');

  // Inventory
  assert('Inventory — loads from storage',             !!ldInventory);
  assert('Inventory — type correct',                   ldInventory?.type === 'inventory');
  assert('Inventory — meta.items is array',            Array.isArray((ldInventory?.meta as MaybeRecord)?.items));
  assert('Inventory — meta.containers is array',       Array.isArray((ldInventory?.meta as MaybeRecord)?.containers));

  // Doc
  assert('Doc — loads from storage',                   !!ldDoc);
  assert('Doc — type correct',                         ldDoc?.type === 'doc');
  assert('Doc — meta.docType present',                 !!(ldDoc?.meta as MaybeRecord)?.docType);
  assert('Doc — meta.createdAt present',               !!(ldDoc?.meta as MaybeRecord)?.createdAt);

  // ── A02 — GTDList computes correctly from active Resource schedules ─────────

  section('A02 — GTDList computes correctly from active Resource schedules');

  useScheduleStore.getState().reset();
  useUserStore.getState().reset();
  useSystemStore.getState().reset();
  useResourceStore.getState().reset();

  // Seed resources with GTD-generating conditions
  useResourceStore.getState().setResource(resContact  as never);  // birthday within 5 days → CHECK task
  useResourceStore.getState().setResource(resAccount  as never);  // pending transaction     → LOG task
  useResourceStore.getState().setResource(resInventory as never); // low-stock items (qty=0) → COUNTER tasks

  const userA02 = {
    ...makeUser(),
    resources: {
      homes: [], vehicles: [],
      contacts:  ['res-contact-1'],
      accounts:  ['res-account-1'],
      inventory: ['res-inventory-1'],
      docs: [],
    },
  };
  useUserStore.setState({ user: userA02 as never });

  // QA event must exist for completeGTDItem to write its completion
  useScheduleStore.setState({
    activeEvents: { [`qa-${TODAY}`]: makeQAEvent(TODAY) } as never,
  });

  const gtdItems = computeGTDList(userA02 as never);

  assert(
    'GTDList — ≥3 items returned from 3 resources',
    gtdItems.length >= 3,
    `got ${gtdItems.length}`,
  );

  const allHaveRef = gtdItems.every((t) => t.resourceRef !== null && t.resourceRef !== undefined);
  assert('GTDList — every item has a resourceRef',      allHaveRef);

  const refs = new Set(gtdItems.map((t) => t.resourceRef));
  assert('GTDList — Contact generates item',            refs.has('res-contact-1'),  `refs: ${[...refs]}`);
  assert('GTDList — Account generates item',            refs.has('res-account-1'),  `refs: ${[...refs]}`);
  assert('GTDList — Inventory generates item',          refs.has('res-inventory-1'), `refs: ${[...refs]}`);

  // Complete one GTD item → QA event should receive the completion entry
  const gtdTask0 = gtdItems[0]!;
  const userBeforeComplete = useUserStore.getState().user as never;
  completeGTDItem(gtdTask0.id, userBeforeComplete);

  const qaAfterGTD = useScheduleStore.getState().activeEvents[`qa-${TODAY}`] as
    { completions: { taskRef: string }[] } | undefined;
  assert(
    'GTDList — completing item writes to QuickActionsEvent',
    !!qaAfterGTD?.completions.some((c) => c.taskRef === gtdTask0.id),
    `completions count: ${qaAfterGTD?.completions?.length ?? 0}`,
  );

  // ── A03 — FavouritesList + GTDList completions write to QA event ───────────

  section('A03 — FavouritesList + GTDList completion writes to QuickActionsEvent');

  useScheduleStore.getState().reset();
  useUserStore.getState().reset();
  useResourceStore.getState().reset();

  const tmplRef = 'tmpl-fav-1';
  useScheduleStore.setState({
    taskTemplates: { [tmplRef]: makeTaskTemplate() as never },
    activeEvents: { [`qa-${TODAY}`]: makeQAEvent(TODAY) } as never,
  });
  useUserStore.setState({ user: makeUser() as never });

  // FavouritesList completion
  const userPreFav = useUserStore.getState().user as never;
  addFavourite(tmplRef, userPreFav);
  const userWithFav = useUserStore.getState().user as never;
  completeFavourite(tmplRef, userWithFav);

  const qaAfterFav = useScheduleStore.getState().activeEvents[`qa-${TODAY}`] as
    { completions: { taskRef: string }[] } | undefined;
  assert(
    'FavouritesList — completion writes entry to QA event',
    (qaAfterFav?.completions?.length ?? 0) >= 1,
    `completions: ${qaAfterFav?.completions?.length ?? 0}`,
  );

  // GTDList completion in same QA event
  useResourceStore.getState().setResource(resInventory as never);
  const currentUser = useUserStore.getState().user as unknown as Record<string, unknown>;
  const userWithInvRef = {
    ...currentUser,
    resources: {
      ...(currentUser.resources as Record<string, unknown>),
      inventory: ['res-inventory-1'],
    },
  };
  useUserStore.setState({ user: userWithInvRef as never });

  const gtdA03 = generateGTDItems(resInventory as never);
  assert('A03 — GTD item generated for Inventory', gtdA03.length >= 1, `got ${gtdA03.length}`);

  const gtdTaskA03 = gtdA03[0]!;
  const userForGTDA03 = useUserStore.getState().user as never;
  completeGTDItem(gtdTaskA03.id, userForGTDA03);

  const qaAfterBoth = useScheduleStore.getState().activeEvents[`qa-${TODAY}`] as
    { completions: { taskRef: string }[] } | undefined;

  assert(
    'GTDList — completion writes entry to QA event (A03)',
    !!qaAfterBoth?.completions.some((c) => c.taskRef === gtdTaskA03.id),
    `completions: ${qaAfterBoth?.completions?.length ?? 0}`,
  );
  assert(
    'QA event has ≥2 entries (favourite + GTD)',
    (qaAfterBoth?.completions?.length ?? 0) >= 2,
    `got ${qaAfterBoth?.completions?.length ?? 0}`,
  );

  // ── A04 — Feed records ≥5 distinct activity types in reverse chron order ───

  section('A04 — Feed records ≥5 distinct activity types, newest-first');

  useScheduleStore.getState().reset();
  useUserStore.getState().reset();
  useSystemStore.getState().reset();
  useResourceStore.getState().reset();
  useUserStore.setState({ user: makeUser() as never });

  // Append 5 entries with different sourceTypes and strictly ascending timestamps
  // (appendFeedEntry prepends, so the last appended will be index 0 in entries[]).
  const feedSources = [
    FEED_SOURCE.EVENT_COMPLETE,
    FEED_SOURCE.LEVEL_UP,
    FEED_SOURCE.BADGE_AWARDED,
    FEED_SOURCE.GEAR_AWARDED,
    FEED_SOURCE.MARKER_FIRE,
  ] as const;

  const baseTs = Date.now();
  for (let i = 0; i < feedSources.length; i++) {
    const latestUser = useUserStore.getState().user!;
    appendFeedEntry(
      {
        commentBlock: `Test entry — ${feedSources[i]}`,
        sourceType: feedSources[i],
        timestamp: new Date(baseTs + i * 1_000).toISOString(),
      },
      latestUser,
    );
  }

  const latestUser = useUserStore.getState().user!;
  const feedEntries = getFeedEntries(latestUser);

  assert('Feed — ≥5 entries recorded', feedEntries.length >= 5, `got ${feedEntries.length}`);

  // Verify newest-first ordering: each entry's timestamp >= the next entry's timestamp
  let newestFirst = true;
  for (let i = 1; i < feedEntries.length; i++) {
    if ((feedEntries[i - 1]!.timestamp) < (feedEntries[i]!.timestamp)) {
      newestFirst = false;
      break;
    }
  }
  assert('Feed — entries are newest-first', newestFirst);

  // All 5 source types present
  const presentTypes = new Set(feedEntries.map((e) => e.sourceType));
  for (const src of feedSources) {
    assert(
      `Feed — sourceType "${src}" present`,
      presentTypes.has(src),
      `present: ${[...presentTypes].join(', ')}`,
    );
  }

  // Verify unreadCount incremented correctly
  assert(
    'Feed — unreadCount matches entry count',
    latestUser.feed.unreadCount === feedEntries.length,
    `unreadCount=${latestUser.feed.unreadCount}, entries=${feedEntries.length}`,
  );

  // ── SUMMARY ───────────────────────────────────────────────────────────────

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
