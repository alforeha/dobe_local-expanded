# Build Plan — Habitat Consolidation & Project/Goal System

**Date:** 2026-06-09 · **Status:** Planning only, no code changed · **Verified against source** (all file paths relative to `src/`)

---

## 0. Corrections to the proposal, verified against source

1. **GoalCanvas is Canvas 2D, not WebGL.** `GoalRoom/GoalCanvas.tsx` uses `canvas.getContext('2d')` (line ~426). Same for `GeneralStormCanvas.tsx`. Reuse feasibility for Track C visualization is *better* than assumed — no WebGL complexity.
2. **The Events tab has 2 views today, not 3.** `EventsTabContent.tsx` defines `EVENTS_VIEWS = ['oneoffs', 'recurrence']`. Holidays is net-new, as proposed.
3. **The "days until" pill is occurrence-based, not reminder-based.** `ResourceEventsTab.tsx` `dayBadge(ev.daysAway)` shows days to the next *occurrence* (`computeNextOccurrence`/`daysUntilDate`); `reminderLeadDays` renders only inside the expanded row ("Reminder: N days before"). The semantics are already correct — the fix is labeling/affordance, not logic. One real ambiguity: for lead-day resources (vehicle insurance, account due dates) the GTD task fires `reminderLeadDays` *before* the badge date, which is invisible at the row level.
4. **The "Add from Library" popup largely exists.** `ScheduleRoom/TaskPoolAddPanel.tsx` (28k) is a 4-tab generic picker (Library / My Templates / New Task / Resource Tasks) built on `PopupShell`. It's coupled to `TaskEntry` output but is the right extraction seed — closer to done than "likely need a new pattern."
5. **The onboarding mission is not a brainstorm.** It's an Aspiration (`coach/StarterQuestLibrary.ts`, `act-onboarding-...`) in the Act → Woop → Smarter hierarchy. There is no seeded Project-type storm anywhere. Track B should treat the onboarding Act's *structure* (WOOP at chain level, SMARTER quests, milestones) as the conceptual reference, then define a brainstorm equivalent from scratch.
6. **Entries already carry outcome/obstacle states.** `types/brainstorm.ts` `EntryState = 'outcome' | 'obstacle' | 'question' | 'solved' | 'others'` and `EntryType` includes `'bet'`. Storm types already include `'project'` and `'general'`. Brain-width staking (`stakeBrainWidth`/`unstakeBrainWidth`) already exists in `useBrainstormStore`. Track B/C is more extension than invention.
7. **"Circumchance" appears nowhere in the codebase** — fully net-new, but the betting primitives above are its foundation.

---

## TRACK A — UI Consolidation

### A1. Habitat shell

**Current state**
- Reference row pattern (the one to standardize on): `ScheduleRoom/PlannedEventBlock.tsx` — icon, name, summary line, color spine, expand-to-takeover with `soloExpanded` + bottom action bar; list container `ScheduleRoom/ScheduleRoomBody.tsx` (solo-expand filtering already implemented).
- TaskRoom (`TaskRoom/TaskRoom.tsx`, `TaskRoomBody.tsx`, `TaskBlock.tsx`): functional. Already hides search/filter row on expand (`{!expandedEntry && ...}`), already has favorite + GTD + execute logic (`TaskBlock.tsx` lines 109–240 use `lists.favouritesList`, `lists.gtdList`, `getLastCompletedForTemplate`).
- Popups: "Create Custom Task" = `TaskRoom/TaskTemplatePopup.tsx` (PopupShell + IconPicker + `TaskTypeConfigEditor`, all 17 task types) — directly reusable. "Add from Catalog" = extract from `TaskPoolAddPanel.tsx` (see correction 4).
- Side panel: only precedent is `WorkoutPlanTab.tsx`'s left strip (collapsed stat strip → expanded w-48 panel). It "pokes out" exactly as the audit says; no takeover behavior. No shared side-panel component exists.

**Assessment: build new shell components, assembled almost entirely from existing pieces.**

| New file (suggested) | Source of truth to extract from |
|---|---|
| `shared/habitat/HabitatShell.tsx` (layout: side panel + top bar + body) | new |
| `shared/habitat/HabitatSidePanel.tsx` (collapsed summary / expanded sections w/ 4-row scroll lists) | generalize `WorkoutPlanTab.tsx` strip |
| `shared/habitat/HabitatRow.tsx` + `HabitatRowExpanded.tsx` (icon / name / type pill / takeover + action bar: Execute · Favorite · GTD · Configure) | `PlannedEventBlock.tsx` + action logic from `TaskRoom/TaskBlock.tsx` |
| `shared/habitat/HabitatTopBar.tsx` (search · Add from Catalog · Create Custom) | `TaskRoomBody.tsx` search row |
| `shared/popups/AddFromLibraryPopup.tsx` (generic, item-source + renderer props) | `TaskPoolAddPanel.tsx` |

**Retiring TaskRoom:** TaskRoom is a top-level menu room (`MenuOverlayContent.tsx` line 46, `MenuOverlayNav.tsx` `MenuRoom` union). Retiring it means a nav change (6 rooms → 5) and rehoming its catalog/favorites/custom-creation intent into the Schedule habitats. Note `ONBOARDING_GLOW.TASK_ROOM_NAV` and `autoCompleteSystemTask('task-sys-explore-task-room')` reference it — onboarding flow needs a touch-up when it goes.

**Effort: L** (the shell itself M; TaskRoom retirement + onboarding/nav cleanup adds the rest). No data-model changes.

### A2. Focus Yard

- **Routines hide-on-expand fix:** `FocusYardTab.tsx` renders `ScheduleRoomSubHeader` unconditionally. `TaskRoomBody` and `PowerBayTab` both already implement the desired `{!expandedId && ...}` pattern — copy it. **Effort: XS** (can ship independently, any time).
- **Work Loads stub:** currently the bare div at `FocusYardTab.tsx:49`. Replace with a labeled placeholder inside the Habitat shell layout. **Effort: XS, depends on A1.** Real build is Track C.
- **Circumchance stub:** no sub-tab exists (`FocusYardSubTab = 'bearing' | 'workloads'` in `ScheduleTabContent.tsx:12`). Add the third tab + stub. **Effort: XS, depends on A1.**

### A3. Events tab

- **One-offs:** functional (`EventsTabContent` → `ScheduleRoomBody` + `OneOffEventPopup`, 30k, mature). Light polish only. **Effort: S.**
- **Resources view:** `ResourceEventsTab.tsx` (591 lines) computes virtual events from resource meta (D97 — nothing stored). Expanded row currently offers only "Jump to Resource." Adding Execute / Add to GTD / Add to Favorites:
  - GTD: reuse `engine/resourceTaskEngine.ts` + `listsEngine.addManualGTDItem` / gtd patterns from `TaskBlock.tsx`.
  - Execute: these rows are heterogeneous (birthdays, insurance dates, recurring resource tasks). Execute makes sense only for task-backed rows (`ItemRecurringTask`, `ContactTask`, `AccountTask`, `VehicleMaintenanceTask`) — gate the button by row kind.
  - Favorites: `favouritesList` stores taskTemplateRefs; resource tasks use `resource-task:` prefixed keys which TaskRoom explicitly filters out (`TaskRoomBody.tsx:89`). Favoriting resource events either lifts that filter or needs a parallel list. **Flag: minor data-model decision, no migration.**
  - Days-until pill: logic is correct (correction 3). Fix = pill label ("in 12d" vs bare "12d"), plus show reminder-fire date alongside occurrence date in the expanded row.
  - **Effort: M, depends on A1** (rows should land in Habitat style once, not twice).
- **Holidays:** net-new stub. Needs a `coach/HolidayLibrary.ts` (or JSON) of holiday blocks with prebuilt task lists, surfaced as Routine-style cards that push to one-offs — `PlannedEventBlock`'s existing "Push to One-Off Event" flow (lines 121–164) is exactly the mechanic to reuse. **Effort: S for stub; M for working version.**

### A4. Gastro Hub — full build (largest Track A item)

Current state: `GastroHubTab.tsx` is 18 lines, three placeholder divs. Confirmed complete stub. But the substrate is real:

| Proposal need | Exists today |
|---|---|
| On-hand totals + thresholds | `ItemInstance.quantity/threshold/unit` (`types/resource.ts:148`) |
| Threshold → shopping trigger | `resourceEngine._genInventoryGTD` already generates "Restock X" GTD tasks when `quantity <= threshold` (~line 1011). **Open question from proposal is answered: the trigger exists; Food Core just needs to surface it** (and optionally write into `ShoppingList`, also existing in `listsEngine`). |
| Nutrition per item | `InventoryItemTemplate.nutritionalValue`, `kind: 'consumable'` |
| Recipe data | **Duplicated** — `TaskTemplate` recipe fields (`durationEstimate`, `nutritionalValue`, `craftsItem`, `difficulty`) *and* `DocResource` `docType: 'recipe'` with `recipeIngredients[]`/`recipeSteps[]`. **Conflict — must pick one canonical shape before building Cook Book.** Recommend TaskTemplate (gets execution, XP, favorites for free) with ingredients added, and migrate/alias recipe-docs. |
| Steps consume inventory | `CONSUME` task type + `ConsumeInput.tsx` + `eventExecution.ts` inventory decrement — works today |
| "Begin Cooking" duration mechanic | `DURATION`/`TIMER` task types + `DurationInput`/`TimerInput` + `durationEstimate` on templates — verified present. A cook flow = CIRCUIT of steps with CONSUME + DURATION steps; `CircuitStepType` already includes both shapes' primitives (no `CONSUME` step type though — **small schema addition to `CircuitStepType`**). |
| Meal log / last-3-day averages | **Does not exist.** `NutritionStats` (`types/user.ts:42`) holds only protein/carb target+consumed totals. Needs a new persisted meal-log structure (timestamped entries with per-meal nutrition) + rollover integration. **New store or extension of user progression — flag as the one real data-model build in Track A.** |
| Radar diagram | **No radar/spider chart component anywhere in the codebase.** New shared SVG component (`shared/charts/RadarChart.tsx`), dual-scale + collapsible variants for side panel and recipe popups. |
| Storage locations (Freezer/Fridge/Pantry/Snack Drawer) | `InventoryContainer` models this; seed four default containers on a designated "kitchen" `InventoryResource`. Decision needed: dedicated kitchen inventory resource vs. category convention. |
| Meal Plan weekly view | Same "weekly lock" hack as Power Bay (A5) — share the component. |

New files: `GastroHub/FoodCoreView.tsx`, `CookBookView.tsx`, `MealPlanView.tsx`, `RecipePopup.tsx` (catalog + create, with collapsible radial nutrition section), `shared/charts/RadarChart.tsx`, meal-log store/types. **Effort: XL. Depends on A1 (shell) and the shared weekly-plan component (A5).**

### A5. Power Bay

- Exercises list (`PowerBayTab.tsx`): functional-rough; already has search/filter/expand/execute/configure and hide-on-expand. Port into Habitat shell = mostly restyling + moving energy bar into the side panel. `FitnessTaskPopup.tsx` covers create/configure.
- Side panel: replace `WorkoutPlanTab`'s strip with `HabitatSidePanel`. Collapsed = power stats (`user.progression.stats.physicalStats.muscleGroupVolume` exists). Expanded top = static body-diagram placeholder image (author has asset — new `shared/BodyDiagram.tsx` wrapping an `<img>`/inline SVG for now); bottom = exercise list reusing HabitatRow.
- Weekly plan: `WorkoutPlanTab.tsx` day slots are `console.log` stubs. Build the real thing as `shared/habitat/WeeklyPlanView.tsx` (shared with Meal Plan): a `PlannedEvent` with weekly recurrence locked, `category: 'workout-<group>'` convention already in use (line 36).
- **Muscle-group taxonomy flag (verified):** `TaskTemplate.muscleGroup?` is a *single* value from 8 options. Multi-discipline combos (flexibility + legs) are **not** supported. Change to `muscleGroups?: string[]` with a read-shim for the old field (additive; no destructive migration — keep accepting `muscleGroup` and normalize on read like `normalizeCircuitInputFields` does).
- Stretch (note, don't block): challenge-mode progression can build on `PlannedEvent.pools[]` + `taskPoolCursor` (rotation machinery exists; auto-increment of reps/weight on success is new logic in rollover/completion); surprise-workout = generator over the template library filtered by `muscleGroups`.

**Effort: L. Depends on A1.**

### A6. Color system cleanup

Verified token: `--accent: #aa3bff` (light) / `#c084fc` (dark) in `index.css:18/50` — note **neither equals Tailwind `purple-600` (#9333ea)**. Decide the canonical value first (recommend wiring Tailwind config `accent` to the CSS var, then class-level `bg-accent`), otherwise the cleanup re-introduces a third purple.

Verified offender locations (the audit's list, confirmed, plus extras):
`ScheduleTabContent.tsx:60` (bg-blue-500 nav), `ScheduleRoomHeader.tsx:31`, `ScheduleRoomSubHeader.tsx:19,24` (indigo-300/500 — the "FocusYard sub-header"), `EventsTabContent.tsx:53,72,77`, `TaskRoomHeader.tsx:31`, `TaskRoomBody.tsx` (search/select focus rings + add button), `TaskBlock.tsx`, `PowerBayTab.tsx:143,286`, `PlannedEventBlock.tsx:251,368` (blue links), `ResourceRoomHeader.tsx:36,52`, `LevelIndicator.tsx:7` (indigo-600). Broader grep shows ~30 files with `blue-500`/`indigo-*` including shared editors (`RecurrenceRuleEditor`, `TaskTypeConfigEditor`, `ColorPicker`, etc.) — recommend scoping the pass to the audit's rooms first, shared components second.

**Effort: S. No dependencies — runs standalone or folds into each rebuild. Cheapest done *before* A1 extraction so the shell is born clean.**

---

## TRACK B — Brainstorm Type Taxonomy (document deliverable)

Verified substrate in `types/brainstorm.ts` / `useBrainstormStore.ts`:

- Storm: `type` includes `'project'`, `'general'`; `STORM_TYPE_META` drives per-type display/labels — **this is the natural gating hook** (extend meta with `allowedIdeaTypes`, `gating` config rather than hardcoding).
- Ideas/MainIdeas/Entries all carry `customProperties?: Record<string,string>` — the proposal's new types *could* ship without schema change, but string-only values can't cleanly hold WOOP arrays or min-count rules. **Recommend: extend `IdeaType`/`EntryType` unions (additive, no migration — existing data keeps its values) + a typed `typeData?` discriminated union for Statement/Principle/Stage/KPI payloads.**
- `pointsTo` with `pointerType: 'solution' | 'choice' | 'others'` exists on both ideas and entries — the "open-ended pointer attribute" to be specified. Extend the union (`'inherits'`, `'feeds-kpi'`, ...).
- WOOP shape to inherit from: `types/act.ts` `Woop` (`wish`, `outcome[]`, `obstacle[]`, `plan`). `EntryState` already has `'outcome' | 'obstacle'` — Outcome/Obstacle sub-ideas map naturally; inheritance rule = copy/ref from Stage's WOOP `typeData`.
- **Bidirectional sync: not supported today.** Brainstorm store has no schedule/task references and `Task` has `questRef`/`actRef`/`goalRef` but nothing pointing at storms/ideas. KPI sync needs an additive `Task.brainstormRef` (or `{stormId, ideaId}`) + a small `brainstormTaskEngine` mirroring how `Milestone`/`Marker` capture results (`types/quest/Milestone.ts` stores `resultFields` inline — same pattern works for writing results back to KPI idea `typeData`).
- Project-only vs Work-type: map Project → storm `type: 'project'` (gated: Statement → min-N Principles → Stages w/ WOOP), Work → storm `type: 'general'` or new `'work'` (single ungated tree). PM note honored: gating lives in `STORM_TYPE_META` config so `general` can remain the only type surfaced in the brainstorm view initially.

**Deliverable:** one reference doc (`docs/brainstorm-taxonomy.md`) defining the 8 idea types, per-type `typeData` schema, pointer/inheritance rules, gating matrix per storm type, and the sync contract. **Effort: S–M (writing + review). Blocks Track C. No code.**

---

## TRACK C — Project/Goal System

| Item | Reuse vs rebuild | Notes |
|---|---|---|
| Project-type brainstorm (Statement → Principles → Stages → KPI) | **Extend** brainstorm store + drawer | `BrainstormDrawer.tsx` (102k) already does per-storm-type idea creation; add type-gated creation rules from Track B meta. Store mutations (`addIdea`, `updateIdea`, `customProperties`) suffice; add `typeData` plumbing. |
| KPI → milestone → schedule task, syncing back | **Adapt the Marker/Milestone engine** | `markerEngine.ts` + `rollover.ts` step 5 + `questEngine.updateQuestProgress` is exactly this loop for quests. Either generalize markers to fire from KPI ideas, or write a thin `brainstormTaskEngine` copying the pattern. Needs additive `Task.brainstormRef` (flagged in Track B). |
| Work-type brainstorm | **Mostly config** | Stripped tree = `general` storm behavior, which exists. Main work is making the gating config-driven so Work skips it. |
| Tree + pie view, milestone curves | **Extend `GeneralStormCanvas.tsx`** | It already computes layout trees (`getIdeaLayoutTree`, `flattenIdeaTree`, ~line 953) on Canvas 2D. Pie view = new layout/draw mode in the same canvas; milestone curves = additional draw pass. New canvas *files* per PM expectation are fine (`ProjectTreeCanvas.tsx` extracting the layout utils) but no new rendering tech needed. GoalCanvas's orbital view is a separate concern — don't entangle. |
| Non-Project goals scope boundary | **Confirmed: extension, not modification** | Aspirations/orbits (`types/act.ts`, `useProgressionStore`, `GoalCanvas`) stay linked to user actions/stats and are untouched. The Project system lives entirely in the brainstorm store. No migration of orbit/aspiration data. |
| Work Loads (Focus Yard) | New view on Work-type storms | Build against Track B schema, inside Habitat shell stub from A2. |
| Circumchance | New "sportsbook" UI, **betting primitives exist** | `stakeBrainWidth`/`unstakeBrainWidth(amount, won)` + `EntryType 'bet'` + storm type `'projection'` ("Level Rod", `'prop'` ideas) are clearly pre-staged for this. UI is net-new. |

**Effort: XL across 2+ sprints. Hard dependency on Track B.**

---

## Migration / conflict flags (consolidated)

1. **Recipe duality** — `TaskTemplate` recipe fields vs `DocResource docType:'recipe'`. Pick canonical before Cook Book (A4). Only true migration risk in the plan.
2. **`muscleGroup` single → multi** (A5) — additive with read-shim; normalize-on-read precedent exists (`normalizeCircuitInputFields`).
3. **Meal log** — net-new persisted structure; `NutritionStats` too thin. Design before A4 build.
4. **Accent value mismatch** — `--accent #aa3bff` ≠ `purple-600`. Decide canonical before A6.
5. **`Task.brainstormRef`** — additive field for KPI sync (Track B/C). No migration (optional field).
6. **Favoriting resource events** — `resource-task:` keys are filtered from favorites today (A3). Decision, not migration.
7. **TaskRoom retirement** — nav union change + onboarding glow/system-task refs (A1).
8. **`CircuitStepType` lacks `CONSUME`** — small additive union change for cook flows (A4).

## Suggested sprint sequence

| Sprint | Contents | Rationale |
|---|---|---|
| **0 (days)** | A6 color pass (rooms in scope) · A2 routines hide-on-expand fix · A3 one-offs polish | Independent quick wins; shell is born on clean tokens |
| **1** | A1 Habitat shell extraction + generic AddFromLibrary popup + TaskRoom retirement · A2 Work Loads/Circumchance stubs | Everything downstream consumes the shell |
| **2** | A5 Power Bay on the shell + shared WeeklyPlanView | Closest existing functionality → cheapest proof of the shell; produces the weekly component Gastro needs. **Track B doc written in parallel this sprint.** |
| **3** | A4 Gastro Hub (meal-log store + RadarChart first, then Food Core → Cook Book → Meal Plan) | Largest net-new; consumes shell + weekly view; recipe-duality decision gates Cook Book |
| **4** | A3 Resources-view row upgrade + days-until clarity + Holidays stub/library | Habitat row style is stable by now |
| **5** | Track C core: taxonomy types + `typeData` + gating config + Project/Work storm behavior + KPI sync engine | Needs Track B (done sprint 2) |
| **6** | Track C visualization (tree/pie, milestone curves) · Work Loads real build · Circumchance UI | Builds on settled schema |
