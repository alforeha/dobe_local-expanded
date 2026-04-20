import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useSystemStore } from '../../stores/useSystemStore';
import { useScheduleStore } from '../../stores/useScheduleStore';
import { useUserStore } from '../../stores/useUserStore';
import { useResourceStore } from '../../stores/useResourceStore';
import { localISODate, formatHHMM } from '../../utils/dateUtils';
import { checkAndRunRolloverOnBoot } from '../../engine/rollover';
import { Header } from './Header';
import { Body } from './Body';
import { Footer } from './Footer';
import { WelcomeScreen } from './WelcomeScreen';
import { SlideUpOverlay } from '../overlays/SlideUpOverlay';
import { EventOverlay } from '../overlays/event/EventOverlay';
import { CoachOverlay } from '../overlays/coach/CoachOverlay';
import { ProfileOverlay } from '../overlays/profile/ProfileOverlay';
import { MenuOverlay } from '../overlays/menu/MenuOverlay';
import { OneOffEventPopup } from '../overlays/menu/rooms/ScheduleRoom/OneOffEventPopup';
import {
  seedStarterContent,
  seedStarterTemplates,
  STARTER_TEMPLATE_IDS,
  STARTER_ACT_IDS,
} from '../../coach/StarterQuestLibrary';
import { evaluatePlannedEventCreatedMarkers } from '../../engine/markerEngine';
import { autoCompleteSystemTask } from '../../engine/resourceEngine';
import { createDefaultTalentTrees, type User } from '../../types/user';
import type { Event, InventoryResource, Task } from '../../types';
import type { TimeView } from '../timeViews/TimeViewContainer';

export type ActiveOverlay = 'event' | 'coach' | 'profile' | 'menu' | null;

// ── DEFAULT USER FACTORY ──────────────────────────────────────────────────────

function makeDefaultUser(): User {
  const id = uuidv4();
  return {
    system: {
      id,
      displayName: 'Adventurer',
      nameChangedAt: undefined,
      icon: 'user-default',
      wrappedAnchor: '',
      auth: null,
    },
    personal: {
      nameFirst: '',
      nameLast: '',
      handle: '',
      birthday: '',
    },
    progression: {
      stats: {
        xp: 0,
        level: 1,
        milestones: {
          streakCurrent: 0,
          streakBest: 0,
          questsCompleted: 0,
          tasksCompleted: 0,
          eventsCompleted: 0,
        },
        talents: {
          health:   { statPoints: 0, xpEarned: 0, tier: 0 },
          strength: { statPoints: 0, xpEarned: 0, tier: 0 },
          agility:  { statPoints: 0, xpEarned: 0, tier: 0 },
          defense:  { statPoints: 0, xpEarned: 0, tier: 0 },
          charisma: { statPoints: 0, xpEarned: 0, tier: 0 },
          wisdom:   { statPoints: 0, xpEarned: 0, tier: 0 },
        },
      },
      avatar: {
        equippedGear: {},
        slotTaxonomyRef: 'default',
        publicVisibility: null,
        additionalAnimations: null,
      },
      badgeBoard: { earned: [], pinned: [], publicVisibility: null },
      equipment: { equipment: [], storeUnlocks: null },
      gold: 0,
      statGroups: {
        health: 0, strength: 0, agility: 0,
        defense: 0, charisma: 0, wisdom: 0,
      },
      talentPoints: 0,
      talentTrees: createDefaultTalentTrees(),
    },
    lists: {
      favouritesList: [],
      gtdList: [],
      shoppingLists: [],
      manualGtdList: [],
      routineRefs: [],
      inventoryItemTemplates: [],
    },
    resources: {
      homes: [], vehicles: [], contacts: [],
      accounts: [], inventory: [], docs: [],
    },
    feed: { entries: [], unreadCount: 0, sharedActivityEntries: null },
    publicProfile: null,
  };
}

function makeDefaultInventoryResource(): InventoryResource {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    type: 'inventory',
    name: 'Inventory',
    icon: 'inventory',
    description: '',
    attachments: [],
    log: [],
    createdAt: now,
    updatedAt: now,
    itemTemplates: undefined,
    containers: [],
    items: [],
    notes: [],
    links: undefined,
    sharedWith: null,
  };
}

// ── APP SHELL ─────────────────────────────────────────────────────────────────

export function AppShell() {
  // Detect new user: user null in store AND 'cdb-user' absent from localStorage.
  const [showWelcome] = useState(() => {
    const storeUser = useUserStore.getState().user;
    const hasCdbUser = localStorage.getItem('cdb-user') !== null;
    return storeUser === null && !hasCdbUser;
  });

  const [activeView, setActiveView] = useState<TimeView>('day');
  const [overlay, setOverlay] = useState<ActiveOverlay>(null);
  const [menuInitialRoom, setMenuInitialRoom] = useState<'world' | 'goal' | 'task' | 'schedule' | 'resource' | 'quickaction'>('quickaction');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [editPlannedId, setEditPlannedId] = useState<string | null>(null);
  const [weekViewSeed, setWeekViewSeed] = useState<Date | null>(null);
  const [dayViewSeed, setDayViewSeed] = useState<Date | null>(null);
  const [overlayClosing, setOverlayClosing] = useState(false);
  const [todaySignals, setTodaySignals] = useState({ day: 0, week: 0, explorer: 0 });
  const [isBooted, setIsBooted] = useState(!showWelcome);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeViewVisitRef = useRef({ week: false, explorer: false, completed: false });

  const mode = useSystemStore((s) => s.settings?.displayPreferences?.mode ?? 'dark');
  const plannedEvents = useScheduleStore((s) => s.plannedEvents);
  const plannedEventCount = Object.keys(plannedEvents).length;

  // ── BOOT — set app time reference then check rollover ───────────────────────
  // Order matters: setAppDateTime must run before checkAndRunRolloverOnBoot so
  // that getAppDate() in rollover.ts reads the correct local date, not null.
  useEffect(() => {
    const now = new Date();
    useSystemStore.getState().setAppDateTime(localISODate(now), formatHHMM(now));
    checkAndRunRolloverOnBoot().catch((err) => {
      console.error('[AppShell] rollover on boot failed:', err);
    });
  }, []);

  // Apply theme on change
  useEffect(() => {
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [mode]);

  // D80 — evaluate plannedEvent.created markers whenever the PlannedEvent
  // count changes. Engine calls kept out of store files — effect is correct layer.
  const prevPlannedCountRef = useRef(plannedEventCount);
  useEffect(() => {
    if (!isBooted) return;
    if (plannedEventCount !== prevPlannedCountRef.current) {
      prevPlannedCountRef.current = plannedEventCount;
      evaluatePlannedEventCreatedMarkers();
    }
  }, [plannedEventCount, isBooted]);

  // ── BEGIN (first-run) ────────────────────────────────────────────────────────

  const handleBegin = () => {
    const today = localISODate(new Date());

    // 1. Create and persist default user
    const user = makeDefaultUser();
    const starterInventory = makeDefaultInventoryResource();
    useResourceStore.getState().setResource(starterInventory);
    useUserStore.getState().setUser({
      ...user,
      resources: {
        ...user.resources,
        inventory: [starterInventory.id],
      },
    });

    // 2. Apply dark theme (default per D72)
    useSystemStore.getState().setThemeMode('dark');

    // 3. Seed Onboarding Act (D87 — other Acts unlock on game events)
    seedStarterContent();

    // Coach day-one template push — seeds starter set into scheduleStore.taskTemplates (D88)
    seedStarterTemplates();

    // 4. Create Welcome Event and Task directly in schedule store (D86)
    const scheduleStore = useScheduleStore.getState();
    const welcomeTaskId = uuidv4();
    const welcomeTask: Task = {
      id: welcomeTaskId,
      templateRef: STARTER_TEMPLATE_IDS.openWelcomeEvent,
      completionState: 'pending',
      completedAt: null,
      resultFields: {},
      attachmentRef: null,
      resourceRef: null,
      location: null,
      sharedWith: null,
      questRef: `${STARTER_ACT_IDS.onboarding}|0|0`,
      actRef: STARTER_ACT_IDS.onboarding,
      secondaryTag: null,
    };
    const welcomeEventId = uuidv4();
    const now = new Date();
    const startTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const endHour = now.getHours() === 23 ? 23 : now.getHours() + 1;
    const endTime = `${String(endHour).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const welcomeEvent: Event = {
      id: welcomeEventId,
      eventType: 'planned',
      plannedEventRef: null,
      color: '#10b981',
      name: 'Welcome to CAN-DO-BE',
      startDate: today,
      endDate: today,
      startTime,
      endTime,
      tasks: [welcomeTaskId],
      completionState: 'pending',
      xpAwarded: 0,
      attachments: [],
      location: null,
      note: null,
      sharedWith: null,
      coAttendees: null,
    };
    scheduleStore.setTask(welcomeTask);
    scheduleStore.setActiveEvent(welcomeEvent);

    // 5. Set onboardingComplete: false (quest sets it true on completion)
    useSystemStore.getState().setOnboardingComplete(false);

    // 6. Navigate into app — DAY view
    setIsBooted(true);
  };

  // ── OVERLAY HELPERS ──────────────────────────────────────────────────────────

  const handleViewChange = (newView: TimeView) => {
    if (newView === activeView) {
      // Same tab tapped while already on this view — refresh to today
      setTodaySignals((prev) => ({ ...prev, [newView]: prev[newView] + 1 }));
      return;
    }
    setActiveView(newView);
    if (newView === 'week' || newView === 'explorer') {
      const nextVisits = timeViewVisitRef.current;
      nextVisits[newView] = true;
      if (nextVisits.week && nextVisits.explorer && !nextVisits.completed) {
        nextVisits.completed = true;
        autoCompleteSystemTask('task-sys-explore-time-views');
      }
    }
  };

  const handleWeekSelect = (weekStart: Date) => {
    setWeekViewSeed(weekStart);
    setActiveView('week');
    const nextVisits = timeViewVisitRef.current;
    nextVisits.week = true;
    if (nextVisits.week && nextVisits.explorer && !nextVisits.completed) {
      nextVisits.completed = true;
      autoCompleteSystemTask('task-sys-explore-time-views');
    }
  };

  const handleDaySelect = (date: Date) => {
    setDayViewSeed(date);
    setActiveView('day');
  };

  const openEventOverlay = (eventId: string) => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOverlayClosing(false);
    setSelectedEventId(eventId);
    setOverlay('event');
  };

  const closeOverlay = () => {
    setOverlay(null);
    setSelectedEventId(null);
    setOverlayClosing(false);
  };

  const requestClose = () => {
    if (closeTimerRef.current !== null) return;
    setOverlayClosing(true);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      closeOverlay();
    }, 230);
  };

  const navigateToDayView = (_date: string) => {
    setActiveView('day');
  };

  const openResourceInMenu = (resourceId: string) => {
    const resource = useResourceStore.getState().resources[resourceId];
    if (!resource) return;

    useSystemStore.getState().setMenuResourceTarget(resourceId, resource.type);
    setMenuInitialRoom('resource');
    setOverlay('menu');
  };

  // ── RENDER ───────────────────────────────────────────────────────────────────

  if (!isBooted) {
    return <WelcomeScreen onBegin={handleBegin} />;
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      <Header onProfileOpen={() => setOverlay('profile')} />
      <Body
        activeView={activeView}
        onEventOpen={openEventOverlay}
        onResourceOpen={openResourceInMenu}
        onWeekSelect={handleWeekSelect}
        weekViewSeed={weekViewSeed}
        onDaySelect={handleDaySelect}
        dayViewSeed={dayViewSeed}
        onEditPlanned={(id) => setEditPlannedId(id)}
        todaySignals={todaySignals}
      />
      <Footer
        activeView={activeView}
        onViewChange={handleViewChange}
        onCoachOpen={() => setOverlay('coach')}
        onMenuOpen={() => {
          setMenuInitialRoom('quickaction');
          setOverlay('menu');
        }}
      />

      {overlay === 'event' && selectedEventId && (
        <SlideUpOverlay closing={overlayClosing} onBackdropClick={requestClose}>
          <EventOverlay eventId={selectedEventId} onClose={requestClose} />
        </SlideUpOverlay>
      )}
      {overlay === 'coach' && (
        <SlideUpOverlay closing={overlayClosing} onBackdropClick={requestClose}>
          <CoachOverlay
            onClose={requestClose}
            onOpenEvent={openEventOverlay}
            onNavigateToDayView={navigateToDayView}
          />
        </SlideUpOverlay>
      )}
      {overlay === 'profile' && (
        <SlideUpOverlay closing={overlayClosing} onBackdropClick={requestClose}>
          <ProfileOverlay onClose={requestClose} />
        </SlideUpOverlay>
      )}
      {overlay === 'menu' && (
        <SlideUpOverlay closing={overlayClosing} onBackdropClick={requestClose}>
          <MenuOverlay onClose={requestClose} initialRoom={menuInitialRoom} />
        </SlideUpOverlay>
      )}

      {editPlannedId && (
        <OneOffEventPopup
          editEvent={plannedEvents[editPlannedId] ?? null}
          onClose={() => setEditPlannedId(null)}
        />
      )}
    </div>
  );
}
