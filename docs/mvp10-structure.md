# CAN-DO-BE · LOCAL CHAPTER
## MVP10 UI SHELL — STRUCTURE DOCUMENT
**Phase: STRUCTURE · 2026-03-20**

Reference: MVP10_CONCEPT_PART1.md, MVP10_CONCEPT_PART2.md, MVP10_CONCEPT_PART3.md  
OOD: _CANDOBE_LOCAL_OOD.md v0.2  
Schema: CAN-DO-BE_LOCAL_STORAGE-SCHEMA.md v0.2

---

## 1. COMPONENT TREE

```
App
  AppShell
    Header
      ProfileNavButton           ← opens ProfileOverlay
      HeaderRight
        XPBar                    ← displayName, next level, XP bar
        StatRow                  ← 6 stat icons + current values
        BoostRow                 ← active boost icons + streak icon + gold value
      FloatingDelta              ← auto-dismissing value-change indicator
    Body
      TimeViewContainer          ← renders active time view
        DayView                  ← conditional: activeView === 'day'
          DayViewHeader          ← back/forward nav, date, weather placeholder, GTD/QA icons
          DayViewBody            ← hour rows, event blocks, time indicator
            EventBlock           ← per event (colour, name, time range, task count)
        WeekView                 ← conditional: activeView === 'week'
          WeekViewHeader         ← back/forward nav, date range
          WeekViewBody           ← horizontal scroll, day blocks
            WeekDayBlock         ← per day (date, weather icon, event cards)
              WeekEventCard      ← name only, colour
        WeekExplorer             ← conditional: activeView === 'explorer'
          WeekExplorerHeader     ← seed date, range display
          WeekExplorerSubHeader  ← day-of-week labels (fixed)
          WeekExplorerBody       ← vertical scroll week rows
            ExplorerWeekRow      ← tapping opens WeekView for that week
              ExplorerDayBlock   ← per day (date, weather icon, QA icons, colour-only event cards)
    Footer
      TimeViewTabs               ← D / W / M buttons
      CoachComment               ← passive ambient text, occasional actionable link
      CoachNavButton             ← opens CoachOverlay
      MenuNavButton              ← opens MenuOverlay

  EventOverlay                   ← triggered from DayView EventBlock (past/present only)
    EventOverlayHeader           ← eventName, date+time range, close button
    TaskBlock                    ← live task representation, dynamic shape per TaskType (15 types — see note §4)
    EventTaskTable
      ActionBar                  ← play, attachment, link, shared (stub), location
      TaskTableHeader            ← task / type / state columns
      TaskList                   ← vertical scroll, selects task into TaskBlock

  CoachOverlay                   ← triggered from footer CoachNavButton
    CoachOverlayHeader           ← info button, feed notification button (conditional), coach avatar, coach callout (BUILD-time)
    CoachOverlayBody             ← renders active room
      FeedRoom                   ← default when feed has content
        FeedMessageList          ← user state messages + coach reactive messages
          FeedMessage            ← per message (react action, auto-delete schedule BUILD-time)
      RecommendationsRoom        ← default when feed empty
        RecommendationsTabs      ← Tasks / Routines / Gear / Items
        RecommendationsList      ← plugs into RecommendationsLibrary
          RecommendationCard     ← owned indicator, remove from library action
        LootDropBanner           ← level-gated new items available (BUILD-time threshold)
      ReviewingRoom              ← past events interface
        ReviewingStatSurface     ← e.g. most XP earned day (taps → DayView)
        ReviewingIncompleteList  ← incomplete events from history (taps → EventOverlay)
      TrackingRoom               ← ongoing + upcoming events
        TrackingEventList        ← tapping resource-linked event → nav to resource in MenuOverlay
      LeaderboardRoom            ← level-gated; hidden until gate — stub LOCAL
    CoachOverlayFooter           ← one nav button per room (Leaderboard hidden until gate)

  ProfileOverlay                 ← triggered from Header ProfileNavButton
    ProfileFloatingActions       ← 4 FABs (Storage, Badge Room, Equipment, Preferences)
    ProfileTopSection
      ProgressiveAvatar          ← visual state via CharacterLibrary XP threshold; taps → StatGroupRoom
      AvatarFloatingCard         ← displayName + top stat icon + value
      LevelIndicator             ← level display on avatar
      ProfileXPBar               ← total accumulated XP
      TrophyShortcut             ← nav to BadgeRoom
      BackpackShortcut           ← nav to EquipmentRoom
    ProfileRoomContainer         ← renders active profile room
      StatGroupRoom              ← default
        StatGroupGrid            ← 6 rows (one per stat), fixed left col, horizontal scroll 91-day cubes
          StatCubePopup          ← BUILD-time stub: tasks completed that day
          StatIconPopup          ← talent tier, 91-day summary, task history, talent points
        StatGroupBottomBar       ← talent points available, star button → TalentTreeRoom
      PreferencesRoom
        CoachToneSelector        ← muted / friendly / militant
        CharacterSelector        ← future chapter — stub
        ThemeOverrides           ← stub
        TimeViewFilterSettings   ← persistent day/time range filters for all 3 time views
        DisplayNameChange        ← annual gate via User.system.wrappedAnchor (D31)
      StorageRoom                ← read-only localStorage usage display
      BadgeRoom
        BadgeBoardCanvas         ← free-form drag placement
        EarnedBadgesTray         ← badges awaiting placement from BadgeBoard.earned[]
      EquipmentRoom
        EquipmentTabs            ← Avatar Equip / Inventory List
        AvatarEquipView          ← slot display (left) + gear list with filter (right)
        InventoryListView        ← all owned items, vertical scroll
      TalentTreeRoom
        TalentTreeStatNav        ← one button per stat group (6) — default: highest stat
        TalentTreeScroll         ← tier slots for active tree (vertical scroll, contained)
          TalentTierSlot         ← BUILD-time: visual design, spend/reclaim/reset interactions

  MenuOverlay                    ← triggered from footer MenuNavButton
    MenuOverlayNav               ← collapsible right panel: WORLD / GOAL / TASK / SCHEDULE / RESOURCE / QUICK ACTION / EXIT MENU
    MenuOverlayContent           ← renders active room
      WorldRoom                  ← placeholder — "coming soon" centred, map graphic bg
      GoalRoom
        GoalRoomHeader           ← title, Habitats/Adventures tabs, Add Act button (Habitats only)
        GoalRoomBody             ← vertical scroll
          ActBlock               ← collapsed: icon + name + status indicator
            ActBlockExpanded     ← chain list within block
              ChainPopup         ← BUILD-time stub: Quest + Milestone management
      TaskRoom
        TaskRoomHeader           ← title, Stat Tasks / Resource Tasks tabs, Add Task button
        TaskRoomBody             ← vertical scroll table
          TaskBlock              ← name, info, quick-complete, edit (stat) / jump-to-resource (resource), favourite
      ScheduleRoom
        ScheduleRoomHeader       ← title, Routines / Leagues tabs
        ScheduleRoomSubHeader    ← filter controls + Add button
        ScheduleRoomBody         ← vertical scroll
          PlannedEventBlock      ← name, info, edit button
        LeaguesTabStub           ← stub LOCAL — tab visible, locked state
      ResourceRoom
        ResourceRoomHeader       ← type nav: Contacts / Homes / Vehicles / Accounts / Inventory / Docs
        ResourceRoomSubHeader    ← title, filters, add button
        ResourceRoomBody         ← vertical scroll
          ResourceBlock          ← collapsed: icon + name
            ResourceBlockExpanded ← icon/name/close, type-specific info (BUILD-time per type), edit button
      QuickActionRoom
        QuickActionRoomHeader    ← title, Action/Shopping tabs, schedule one-off event button
        ActionTab
          GTDSection             ← title + add button
          GTDTaskList
            GTDTaskBlock         ← execute button + popup confirm
          FavouritesSection      ← title
          FavouriteTaskList
            FavouriteTaskBlock   ← execute button + popup confirm
        ShoppingTab
          ShoppingSection        ← title + add button
          ShoppingItemList
            ShoppingItemBlock    ← check off and log
```

---

## 2. ZUSTAND STORE BINDINGS

### useSystemStore
_Contents: Settings, session metadata, rollover timestamp_

| Component | Slice(s) Read |
|---|---|
| PreferencesRoom | Settings.coachPreferences.tone, Settings.displayPreferences, Settings.timePreferences |
| TimeViewFilterSettings (in PreferencesRoom) | Settings.timePreferences (day filter, time range per view) |
| DayView, WeekView, WeekExplorer | Settings.timePreferences (start of week, time range filter) |
| AppShell | Settings.displayPreferences.theme (mode / theme) |

---

### useUserStore
_Contents: User, UserStats, Avatar, BadgeBoard, Equipment, Feed_

| Component | Slice(s) Read |
|---|---|
| Header / XPBar | UserStats.xp, UserStats.level (cached), User.system.displayName |
| StatRow | UserStats.talents.{stat}.statPoints (each of 6 stats) |
| BoostRow | UserStats.milestones.streakCurrent, User.progression.gold |
| FloatingDelta | UserStats.xp delta, stat deltas, gold delta (derived from state change) |
| ProfileNavButton | User.system.displayName, Avatar (for userIcon) |
| ProgressiveAvatar | UserStats.xp (threshold → CharacterLibrary lookup for visual state) |
| AvatarFloatingCard | User.system.displayName, UserStats.talents (top stat) |
| LevelIndicator | UserStats.level |
| ProfileXPBar | UserStats.xp |
| StatGroupRoom / StatGroupGrid | UserStats.talents.{stat}.statPoints, statPoints per-day history |
| StatGroupBottomBar | UserStats.talentPoints |
| StatIconPopup | UserStats.talents.{stat}, UserStats.talentPoints |
| TalentTreeRoom / TalentTreeScroll | UserStats.talentTree (unlocked state), UserStats.talentPoints |
| AvatarEquipView | User.progression.avatar.equippedGear, User.progression.avatar.slotTaxonomyRef |
| InventoryListView | User.progression.equipment.equipment[] |
| BadgeRoom / BadgeBoardCanvas | User.progression.badgeBoard.pinned[] |
| BadgeRoom / EarnedBadgesTray | User.progression.badgeBoard.earned[] |
| DisplayNameChange | User.system.displayName, User.system.wrappedAnchor |
| FeedRoom / FeedMessageList | User.feed.entries[], User.feed.unreadCount |
| CoachOverlayHeader (feed notification button) | User.feed.unreadCount |
| EventOverlay | UserStats (XP writes via award pipeline on task completion) |

---

### useProgressionStore
_Contents: Acts (with nested Chains, Quests, Milestones, Markers)_

| Component | Slice(s) Read / Written |
|---|---|
| GoalRoom / ActBlock | Acts (all), Act.status, Act.chains[] |
| GoalRoom (Habitats tab) | User.goals.habitats[] (user-created Acts) |
| GoalRoom (Adventures tab) | User.goals.adventures[] (Coach-generated Acts) |
| ChainPopup (stub) | Act.chains[], Quest state, Milestone state — BUILD-time |
| CoachOverlay / TrackingRoom | Relevant Markers / Quests for upcoming events cross-reference |

---

### useScheduleStore
_Contents: PlannedEvents, Events (active[] + history[]), QuickActionsEvent, Tasks, TaskTemplates (user custom)_

| Component | Slice(s) Read / Written |
|---|---|
| DayView / EventBlock | Events.active[] + Events.history[] (past/present), PlannedEvents (future) |
| WeekView / WeekDayBlock | Events + PlannedEvents (same logic as DayView) |
| WeekExplorer / ExplorerDayBlock | Events + PlannedEvents (same logic) |
| EventOverlay | Event (selected), Event.tasks[] → Task instances |
| EventOverlay / TaskBlock | Task.completionState, Task.resultFields (writes) |
| EventOverlay / ActionBar | Event.attachments[], Event.location (reads, popup opens) |
| TaskRoom / TaskBlock | User.lists.taskLibrary[] (user custom TaskTemplates), secondaryTag filter |
| TaskRoom (Stat Tasks tab) | TaskTemplates NOT from resources |
| TaskRoom (Resource Tasks tab) | TaskTemplates created by Resources |
| ScheduleRoom / PlannedEventBlock | PlannedEvents |
| QuickActionRoom / GTDTaskBlock | User.lists.gtdList[] (Task refs) |
| QuickActionRoom / FavouriteTaskBlock | User.lists.favouritesList[] (TaskTemplate refs) |
| QuickActionRoom / ShoppingItemBlock | User.lists.shoppingLists[] |
| CoachOverlay / ReviewingRoom | Events.history[] (past events) |
| CoachOverlay / TrackingRoom | Events.active[] (ongoing), PlannedEvents (upcoming) |

---

### useResourceStore
_Contents: Resources (all 6 types), Useables, Attachments, Badges, Gear_

| Component | Slice(s) Read / Written |
|---|---|
| ResourceRoom / ResourceBlock | Resources.homes[], .vehicles[], .contacts[], .accounts[], .inventory[], .docs[] |
| ResourceBlockExpanded | Resource.meta{} (type-specific — BUILD-time per type) |
| EventOverlay / ActionBar (attachment popup) | Attachments[] |
| EventOverlay / ActionBar (link popup) | Resources (context linking) |
| TaskRoom (Resource Tasks tab) | Resources (tasks generated by resources) |
| RecommendationsRoom | RecommendationsLibrary items cross-referenced with user taskLibrary |
| BadgeRoom / BadgeBoardCanvas | Badges (pinned refs resolved) |
| BadgeRoom / EarnedBadgesTray | Badges (earned refs resolved) |
| AvatarEquipView | Gear (equipped gear resolved from Avatar.equippedGear refs) |
| InventoryListView | Gear, Useables (resolved from Equipment.equipment[]) |
| TalentTreeRoom | Gear (auto-unequip on tier reclaim/reset) |
| QuickActionRoom / ShoppingItemBlock | Inventory Useables (shopping list item resolution) |

---

## 3. FILE AND FOLDER STRUCTURE

```
src/
  components/
    shell/
      AppShell.tsx
      Header.tsx
        XPBar.tsx
        StatRow.tsx
        BoostRow.tsx
        FloatingDelta.tsx
        ProfileNavButton.tsx
      Body.tsx
      Footer.tsx
        TimeViewTabs.tsx
        CoachComment.tsx
        CoachNavButton.tsx
        MenuNavButton.tsx

    timeViews/
      TimeViewContainer.tsx
      DayView/
        DayView.tsx
        DayViewHeader.tsx
        DayViewBody.tsx
        EventBlock.tsx
      WeekView/
        WeekView.tsx
        WeekViewHeader.tsx
        WeekViewBody.tsx
        WeekDayBlock.tsx
        WeekEventCard.tsx
      WeekExplorer/
        WeekExplorer.tsx
        WeekExplorerHeader.tsx
        WeekExplorerSubHeader.tsx
        WeekExplorerBody.tsx
        ExplorerWeekRow.tsx
        ExplorerDayBlock.tsx

    overlays/
      event/
        EventOverlay.tsx
        TaskBlock.tsx            ← dynamic per TaskType — 15 shapes (BUILD-time per type)
        EventTaskTable.tsx
        ActionBar.tsx
        TaskList.tsx

      coach/
        CoachOverlay.tsx
        CoachOverlayHeader.tsx
        CoachOverlayFooter.tsx
        rooms/
          FeedRoom.tsx
            FeedMessage.tsx
          RecommendationsRoom.tsx
            RecommendationCard.tsx
            LootDropBanner.tsx
          ReviewingRoom.tsx
          TrackingRoom.tsx
          LeaderboardRoom.tsx   ← stub; hidden until level gate

      profile/
        ProfileOverlay.tsx
        ProfileFloatingActions.tsx
        ProfileTopSection.tsx
          ProgressiveAvatar.tsx
          AvatarFloatingCard.tsx
          LevelIndicator.tsx
          ProfileXPBar.tsx
        rooms/
          StatGroupRoom.tsx
            StatGroupGrid.tsx
            StatCubePopup.tsx   ← stub; BUILD-time detail
            StatIconPopup.tsx
            StatGroupBottomBar.tsx
          PreferencesRoom.tsx
            TimeViewFilterSettings.tsx
            CoachToneSelector.tsx
            DisplayNameChange.tsx
          StorageRoom.tsx
          BadgeRoom.tsx
            BadgeBoardCanvas.tsx
            EarnedBadgesTray.tsx
          EquipmentRoom.tsx
            AvatarEquipView.tsx
            InventoryListView.tsx
          TalentTreeRoom.tsx
            TalentTreeStatNav.tsx
            TalentTreeScroll.tsx
            TalentTierSlot.tsx  ← stub; BUILD-time visual design

      menu/
        MenuOverlay.tsx
        MenuOverlayNav.tsx
        rooms/
          WorldRoom.tsx
          GoalRoom.tsx
            ActBlock.tsx
            ActBlockExpanded.tsx
            ChainPopup.tsx      ← stub; BUILD-time internal layout
          TaskRoom.tsx
            TaskBlock.tsx       ← shared name with event overlay TaskBlock — different component
          ScheduleRoom.tsx
            PlannedEventBlock.tsx
          ResourceRoom.tsx
            ResourceBlock.tsx
            ResourceBlockExpanded.tsx  ← BUILD-time per resource type
          QuickActionRoom.tsx
            GTDTaskBlock.tsx
            FavouriteTaskBlock.tsx
            ShoppingItemBlock.tsx

    shared/
      cards/
        Card.tsx               ← generic card shell
      buttons/
        IconButton.tsx
        NavButton.tsx
        TabButton.tsx
      inputs/
        TextInput.tsx
        NumberInput.tsx
      popups/
        PopupShell.tsx         ← shared wrapper for ADD/EDIT popups (BUILD-time content)
      StatIcon.tsx             ← stat icon + value, used in StatRow + StatIconPopup
      XPBarVisual.tsx          ← reusable XP bar fill component (Header + Profile)
```

---

## 4. KEY OPEN ITEMS — FLAGGED FOR IMPLEMENTER

### BUILD-time stubs — implement shells only

| Component | Reason |
|---|---|
| `TaskBlock` (EventOverlay) | 15 TaskType input shapes — each has a unique input form (CHECK, COUNTER, SETS_REPS, CIRCUIT, DURATION, TIMER, RATING, TEXT, FORM, CHOICE, CHECKLIST, SCAN, LOG, LOCATION_POINT, LOCATION_TRAIL). Render a placeholder per type at STRUCTURE phase. Full shapes defined in schema §3a. |
| `ChainPopup` | Quest and Milestone management detail — internal layout is BUILD-time (Part 3 callout). Stub as empty popup shell. |
| `ResourceBlockExpanded` | Expanded view detail differs per resource type (all 6). BUILD-time per type (Part 3 callout). Stub as empty expanded state. |
| `TalentTierSlot` | Visual design of tier slots is BUILD-time (Part 3 callout). Stub as labelled placeholder row. |
| `StatCubePopup` | Task list per day popup — BUILD-time detail. Stub as empty popup. |
| `LootDropBanner` | Level gate threshold is BUILD-time. Stub as visible banner component with hardcoded sample text. |
| `LeaderboardRoom` | Level-gated, stub in LOCAL. Render as locked/unavailable state. Nav button hidden below gate. |
| `LeaguesTabStub` (ScheduleRoom) | Stub in LOCAL — tab visible but locked state (MULTI-USER full activation). |
| All ADD/EDIT popups | Add Task, Add Routine, Add Act, Add Chain, Add GTD, Add Shopping, Schedule one-off event, Edit PlannedEvent — all popup internal layouts are BUILD-time. Stub with `PopupShell` wrapper only. |

### Deferred display decisions

| Item | Reference |
|---|---|
| Weather display (DayView, WeekDayBlock, ExplorerDayBlock) | Placeholder in LOCAL (Part 1). Implement in MULTI-USER. Render empty weather region. |
| Coach callout bubble (CoachOverlayHeader) | BUILD-time decision (Part 2). Omit from initial structure. |
| Feed message auto-delete interval | BUILD-time (Part 2). Do not implement timer logic at STRUCTURE phase. |
| Floating delta animation spec | BUILD-time (Part 1). Implement component — leave animation as stub. |
| Play mode media auto-advance edge cases | BUILD-time (Part 1). Implement Play button toggle — leave advance logic as stub. |
| 4th ProfileFloatingAction button icon + destination | BUILD-time (Part 2 callout: "TBD"). Stub as fourth FAB with no icon. |
| Time range filter default values | BUILD-time (Part 1). Use 24hr as default. |
| One vs multiple ResourceBlocks expanded simultaneously | BUILD-time UX decision (Part 3 callout). Default: single expanded. |
| Act block status visual states (active/pending/inactive) | BUILD-time (Part 3 callout). Stub with text label. |
| Equipment room gear list filter options | BUILD-time (Part 3 callout). Omit filter at STRUCTURE phase. |
| Secondary tag (`TaskSecondaryTag`) filter in TaskRoom | Enum values and filter UI are BUILD-time. Wire filter control to `secondaryTag` field on TaskTemplate. |
| Talent tree internal nav default (highest stat) | Requires runtime read of UserStats.talents to determine highest — flag for STRUCTURE implementer to wire correctly. |
| CoachOverlayFooter button reflow when Leaderboard unlocked | BUILD-time. At STRUCTURE phase, render as always-reflowed without gate logic. |
| GTD popup spec for future event taps (DayView) | Deferred to Overlays session (Part 1 callout). Stub tap handler. |
| Floating delta position relative to triggering element | BUILD-time animation. Render component fixed-position as placeholder. |

### Structural decisions made here

| Decision | Rationale |
|---|---|
| `TaskBlock` in `overlays/event/` and `TaskBlock` in `overlays/menu/` are **separate components** | Event TaskBlock renders live task execution (dynamic per 15 TaskTypes). Menu Task room TaskBlock renders task library rows (name, info, buttons). Different jobs. |
| `XPBarVisual` extracted to `shared/` | Used in both `Header/XPBar` and `ProfileOverlay/ProfileXPBar` — same visual fill component, different data bindings. |
| `StatIcon` extracted to `shared/` | Used in `StatRow` (Header), `StatIconPopup` (Profile), and potentially coach rooms. |
| `PopupShell` in `shared/popups/` | All add/edit popups share a common wrapper shell. Content is BUILD-time per popup. Single shell avoids duplicated modal chrome. |
| Menu rooms placed in `overlays/menu/rooms/` | Parallel structure to coach rooms (`overlays/coach/rooms/`) and profile rooms (`overlays/profile/rooms/`). Consistent nesting across all three overlay types. |
| `TimeViewContainer` owns active-view state | Single source of truth for which time view is active. Footer `TimeViewTabs` dispatches to it. Avoids view state leaking into Footer or AppShell. |
| `DayViewHeader` owns back/forward nav + date display | Keeps per-view navigation logic self-contained. WeekView and WeekExplorer have their own header components for the same reason. |

---

*CAN-DO-BE · LOCAL · MVP10 UI SHELL · STRUCTURE · 2026-03-20*
