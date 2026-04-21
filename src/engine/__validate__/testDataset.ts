/// <reference types="node" />
// ─────────────────────────────────────────
// TEST DATASET — 30-day seeded dataset for W33 storage audit
// Run standalone via: npx tsx src/engine/__validate__/testDataset.ts
//
// Exports:
//   seedTestDataset() - creates 30-day simulated dataset and returns metrics
//
// Dataset spec:
//   - User with 30 days of simulated history
//   - 20 completed events across 30 days (mix of planned types)
//   - At least 3 different stat groups awarded
//   - At least 2 achievements unlocked
//   - Feed with 15+ entries of varied sourceTypes
//   - localStorage usage measured after seeding
// ─────────────────────────────────────────

// ── STUB localStorage (standalone execution only) ────────────────────────────
// Skipped when imported into another script that has already defined localStorage.

const _dsStore: Record<string, string> = {};
if (!Object.getOwnPropertyDescriptor(globalThis, 'localStorage')) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem:    (k: string) => _dsStore[k] ?? null,
      setItem:    (k: string, v: string) => { _dsStore[k] = v; },
      removeItem: (k: string) => { delete _dsStore[k]; },
      clear:      () => { for (const k in _dsStore) delete _dsStore[k]; },
      get length() { return Object.keys(_dsStore).length; },
      key: (i: number) => Object.keys(_dsStore)[i] ?? null,
    },
    writable: true,
    configurable: true,
  });
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const TODAY = new Date().toISOString().slice(0, 10);
const DAY_MINUS_30 = addDays(TODAY, -30);

// ── RESULT SHAPE ─────────────────────────────────────────────────────────────

export interface TestDatasetResult {
  /** Total localStorage usage after seeding in KB */
  usedKB: number;
  /** Number of completed Events in historyEvents */
  eventCount: number;
  /** Number of achievements unlocked (badges earned) */
  achievementCount: number;
  /** Number of Feed entries */
  feedEntryCount: number;
  /** Stat groups with statPoints > 0 */
  statGroupsAwarded: string[];
}

// ── SEED FUNCTION ─────────────────────────────────────────────────────────────

/**
 * Seed a 30-day simulated dataset into stores + localStorage.
 * Resets all stores before seeding for a clean baseline.
 *
 * @returns TestDatasetResult with metrics for the W33 storage audit.
 */
export async function seedTestDataset(): Promise<TestDatasetResult> {
  // Dynamic imports — keep localStorage stub active before Zustand persist.
  const { useUserStore }        = await import('../../stores/useUserStore');
  const { useScheduleStore }    = await import('../../stores/useScheduleStore');
  const { useProgressionStore } = await import('../../stores/useProgressionStore');
  const { useSystemStore }      = await import('../../stores/useSystemStore');
  const { useResourceStore }    = await import('../../stores/useResourceStore');

  const { seedStarterContent, unlockAct, coachActs } = await import('../../coach/StarterQuestLibrary');
  const { awardXP, awardStat }              = await import('../awardPipeline');
  const { checkAchievements }               = await import('../../coach/checkAchievements');
  const { awardBadge }                      = await import('../../coach/rewardPipeline');
  const { appendFeedEntry, getFeedEntries, FEED_SOURCE } = await import('../feedEngine');
  const { storageSet }                      = await import('../../storage');
  const { getStorageUsage }                 = await import('../../storage/storageBudget');

  // ── Reset stores for a clean slate ───────────────────────────────────
  useUserStore.getState().reset();
  useScheduleStore.getState().reset();
  useProgressionStore.getState().reset();
  useSystemStore.getState().reset();
  useResourceStore.getState().reset();
  // Clear localStorage if available (standalone execution)
  try { localStorage.clear(); } catch { /* no-op */ }

  // ── Seed Acts + templates (D87: seed onboarding, then unlock all for dataset) ──
  seedStarterContent(false);
  for (const act of coachActs) {
    unlockAct(act.id);
  }

  // ── Create 30-day user ────────────────────────────────────────────────
  const dsUserId = 'user-dataset-w33-0000-0000-0000-0001';

  const dsUser = {
    system:   { id: dsUserId, displayName: 'Dataset User', wrappedAnchor: DAY_MINUS_30, auth: null },
    personal: { nameFirst: 'Data', nameLast: 'Set', handle: 'dataset', birthday: '1990-01-01' },
    progression: {
      stats: {
        xp: 0,
        level: 1,
        talentPoints: 0,
        milestones: {
          streakCurrent: 28,
          streakBest: 30,
          questsCompleted: 6,
          tasksCompleted: 60,
          eventsCompleted: 20,
        },
        talents: {
          health:   { statPoints: 240, xpEarned: 240, tier: 2 },
          strength: { statPoints: 180, xpEarned: 180, tier: 1 },
          agility:  { statPoints: 120, xpEarned: 120, tier: 1 },
          defense:  { statPoints: 60,  xpEarned: 60,  tier: 0 },
          charisma: { statPoints: 30,  xpEarned: 30,  tier: 0 },
          wisdom:   { statPoints: 90,  xpEarned: 90,  tier: 0 },
        },
        talentTree: {
          health: {}, strength: {}, agility: {},
          defense: {}, charisma: {}, wisdom: {},
        },
      },
      avatar: {
        equippedGear: {},
        slotTaxonomyRef: 'default',
        publicVisibility: null,
        additionalAnimations: null,
      },
      badgeBoard: { earned: [], pinned: [], publicVisibility: null },
      equipment:  { equipment: [], storeUnlocks: null },
      gold: 120,
      statGroups: {
        health: 240, strength: 180, agility: 120,
        defense: 60, charisma: 30, wisdom: 90,
      },
      talentTree: null,
    },
    goals:    { habitats: [], adventures: [] },
    schedule: { planned: [], routines: [] },
    events:   { active: [], history: [] },
    lists: {
      favouritesList: [],
      gtdList: [],
      shoppingLists: [],
      manualGtdList: [],
    },
    resources: {
      homes: [], vehicles: [], contacts: [],
      accounts: [], inventory: [], docs: [],
    },
    feed:  { entries: [], unreadCount: 0, sharedActivityEntries: null },
    publicProfile: null,
  };

  useUserStore.setState({ user: dsUser as never });
  storageSet('user', dsUser);

  // ── Award XP from 3+ stat groups ─────────────────────────────────────
  // awardXP + awardStat use dsUserId for validation — must match store user
  awardXP(dsUserId, 800);
  awardStat(dsUserId, 'health',   80);
  awardStat(dsUserId, 'strength', 60);
  awardStat(dsUserId, 'wisdom',   40);
  awardStat(dsUserId, 'agility',  20);

  // ── Unlock achievements ───────────────────────────────────────────────
  const userForAch = useUserStore.getState().user!;
  const newAchs = checkAchievements(userForAch);
  let dsUserCurrent = userForAch;
  for (const ach of newAchs) {
    dsUserCurrent = awardBadge(ach, dsUserCurrent);
  }

  // ── Seed 20 completed events across 30 days ───────────────────────────
  const templateIds = [
    'task-sys-daily-login',
    'task-hlth-drink-water',
    'task-wis-journal-entry',
    'task-hlth-body-scan',
    'task-wis-mood-entry',
  ] as const;

  let eventCount = 0;
  // Spread 20 events across 30 days: roughly every 1.5 days — use even days
  for (let day = 0; day < 30 && eventCount < 20; day++) {
    const eventDate = addDays(DAY_MINUS_30, day);
    const evId    = `ds-hist-event-${day.toString().padStart(3, '0')}`;
    const taskId  = `ds-hist-task-${day.toString().padStart(3, '0')}`;
    const tmplRef = templateIds[day % templateIds.length];

    // Persist task
    useScheduleStore.getState().setTask({
      id: taskId,
      templateRef: tmplRef,
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
    storageSet(`task:${taskId}`, { id: taskId, templateRef: tmplRef, completionState: 'complete' });

    // Build event
    const histEvent = {
      id: evId,
      eventType: 'planned',
      plannedEventRef: null,
      name: `Completed Event — Day ${day + 1}`,
      startDate: eventDate,
      startTime: '09:00',
      endDate: eventDate,
      endTime: '10:00',
      tasks: [taskId],
      completionState: 'complete',
      xpAwarded: 10 + (day % 3) * 5,
      attachments: [],
      location: null,
      note: null,
      sharedWith: [],
      coAttendees: null,
    };

    // Archive directly into historyEvents
    const currentHistory = useScheduleStore.getState().historyEvents;
    useScheduleStore.setState({ historyEvents: { ...currentHistory, [evId]: histEvent } } as never);
    storageSet(`event:${evId}`, histEvent);

    eventCount++;
  }

  // ── Seed 16 feed entries with varied sourceTypes ──────────────────────
  // Use timestamps spread across 30 days so order is well-defined.
  const feedSourceTypes = [
    FEED_SOURCE.ROLLOVER,
    FEED_SOURCE.EVENT_COMPLETE,
    FEED_SOURCE.BADGE_AWARDED,
    FEED_SOURCE.MARKER_FIRE,
    FEED_SOURCE.LEVEL_UP,
    FEED_SOURCE.GTD_COMPLETE,
    FEED_SOURCE.FAVOURITE_COMPLETE,
    FEED_SOURCE.ROLLOVER,
    FEED_SOURCE.EVENT_COMPLETE,
    FEED_SOURCE.BADGE_AWARDED,
    FEED_SOURCE.MARKER_FIRE,
    FEED_SOURCE.ROLLOVER,
    FEED_SOURCE.EVENT_COMPLETE,
    FEED_SOURCE.LEVEL_UP,
    FEED_SOURCE.GTD_COMPLETE,
    FEED_SOURCE.BADGE_AWARDED,
  ] as const;

  // Append oldest first — appendFeedEntry prepends, so final order is newest-first
  const feedBaseTs = Date.now() - 30 * 86_400_000;
  for (let i = 0; i < feedSourceTypes.length; i++) {
    const currentUser = useUserStore.getState().user!;
    appendFeedEntry(
      {
        commentBlock: `Feed entry ${i + 1} — ${feedSourceTypes[i]}`,
        sourceType: feedSourceTypes[i],
        timestamp: new Date(feedBaseTs + i * (86_400_000 * 2)).toISOString(),
      },
      currentUser,
    );
  }

  // ── Persist final user state ──────────────────────────────────────────
  const finalUser = useUserStore.getState().user!;
  storageSet('user', finalUser);

  // ── Measure storage usage ─────────────────────────────────────────────
  const usage = getStorageUsage();

  // ── Compile results ───────────────────────────────────────────────────
  const feedFinal   = getFeedEntries(finalUser);
  const badgeCount  = finalUser.progression.badgeBoard.earned.length;
  const histEvents  = useScheduleStore.getState().historyEvents;
  const histCount   = Object.keys(histEvents).length;

  const statGroupsAwarded = Object.entries(finalUser.progression.stats.talents)
    .filter(([, t]) => (t as { statPoints: number }).statPoints > 0)
    .map(([k]) => k);

  return {
    usedKB:           usage.usedKB,
    eventCount:       histCount,
    achievementCount: badgeCount,
    feedEntryCount:   feedFinal.length,
    statGroupsAwarded,
  };
}

// ── STANDALONE MAIN ───────────────────────────────────────────────────────────
// Only runs when this file is executed directly.

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

async function main(): Promise<void> {
  console.log('\n' + '═'.repeat(60));
  console.log('  TEST DATASET — 30-Day Seeded Data  (W33 Storage Audit)');
  console.log('═'.repeat(60));

  const result = await seedTestDataset();

  console.log('\n  ── Results ──────────────────────────────────────────');
  console.log(`  Events seeded (history):  ${result.eventCount}`);
  console.log(`  Achievements unlocked:    ${result.achievementCount}`);
  console.log(`  Stat groups awarded:      ${result.statGroupsAwarded.join(', ')}`);
  console.log(`  Feed entries:             ${result.feedEntryCount}`);
  console.log(`  Storage used:             ${result.usedKB.toFixed(2)} KB`);

  assert('20 events in historyEvents',       result.eventCount >= 20,       `got: ${result.eventCount}`);
  assert('≥3 stat groups awarded',           result.statGroupsAwarded.length >= 3, `got: ${result.statGroupsAwarded.length}`);
  assert('≥2 achievements unlocked',         result.achievementCount >= 2,  `got: ${result.achievementCount}`);
  assert('Feed has ≥15 entries',             result.feedEntryCount >= 15,   `got: ${result.feedEntryCount}`);
  assert('usedKB > 0',                       result.usedKB > 0,             `got: ${result.usedKB.toFixed(2)}`);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed / ${failed} failed`);
  console.log('═'.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

if (typeof window === 'undefined' && process.argv[1]) {
  const entryUrl = new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
  if (import.meta.url === entryUrl) {
    main().catch((err: unknown) => {
      console.error('testDataset threw:', err);
      process.exit(1);
    });
  }
}
