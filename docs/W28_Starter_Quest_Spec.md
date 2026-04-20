# CAN-DO-BE · LOCAL CHAPTER
## W28 — Starter Quest Set
**Design Spec · MVP11 RELEASE · Advisor Output**
**Approved for W29 Implementation · 2026-03-22**

---

## 1. Act Structure

The starter content lives entirely in the Adventures tab. The Habitats tab is user-created only — nothing is seeded there. On first run, the Adventures tab is populated with eight Acts.

| Act | Owner | State on First Run | Notes |
|---|---|---|---|
| Onboarding Adventure | coach | Active — auto-committed | Feeds the user immediately on first run |
| Health Path | coach | Visible — locked | Unlocks after Onboarding complete |
| Strength Path | coach | Visible — locked | Unlocks after Onboarding complete |
| Agility Path | coach | Visible — locked | Unlocks after Onboarding complete |
| Defense Path | coach | Visible — locked | Unlocks after Onboarding complete |
| Charisma Path | coach | Visible — locked | Unlocks after Onboarding complete |
| Wisdom Path | coach | Visible — locked | Unlocks after Onboarding complete |
| Daily Adventure | coach | Hidden on first run | Appears + auto-activates on Onboarding complete |

> ⚠ Locked stat paths are visible but not greyed out — they appear as uncommitted Acts. Pending Quests within a stat path are hidden entirely until the prior Quest completes.

### Stat Path Rules
- Only one stat path active at a time — user chooses which to commit to after Onboarding
- Chain 1 is the only chain available in LOCAL v1. Chain 2 is stubbed — unlocks after all six stat group Chain 1s are complete
- Quest thresholds gate sequentially: 3-day → 6-day → 12-day → 24-day
- Completed Quests stay active — they continue granting XP when their tracked task is completed
- Chain award drops when the 24-day Quest completes
- Previous task completions count toward thresholds — no reset on Quest unlock

### Daily Adventure Rules
- The Onboarding Act transforms into the Daily Adventure Act on Onboarding completion — same Act object, relabelled
- The Onboarding Chain (Chain 0) remains visible in Daily Adventure history as the first entry
- Rollover appends a new Chain each day — Chain 1, 2, 3, etc.
- All daily Quests are simultaneously active — no gating between them
- Incomplete day closes at rollover without reward, logs as incomplete in history, cannot be reactivated
- Daily Adventure is auto-enrolled — no manual commit required

---

## 2. Onboarding Adventure

Single Chain, four Quests. All Marker conditions are interval-type — each Quest fires once, gates sequentially. The Onboarding Adventure is the only content active on day one.

### Chain — Welcome to CAN-DO-BE

| WOOP Field | Value |
|---|---|
| Wish | Build a life worth levelling up |
| Outcome | A fully configured system that works with your real life |
| Obstacle | Skipping setup means missing the loop |
| Plan | Four quests that walk you through the core system |

### Welcome Event — Auto-Created on First Run

A special Event is auto-created simultaneously with the Onboarding Adventure on first run. It is visually distinct from regular Events — shiny, prominent, clearly wants to be tapped. It contains one CHECK task.

| Property | Value |
|---|---|
| Event name | Welcome to the Pond |
| Task inside | Open the Welcome Event (CHECK) |
| Completion behaviour | 1/1 tasks complete → Event auto-closes → XP + event completion XP drops |
| Achievement | ach-first-task fires on task completion · ach-first-event-completed fires on close |
| Coach comment | Quest-level key: onboarding.q1 — e.g. "Let's get started! Open the Welcome event" |

---

### Quest 1 — Ripple

| Property | Value |
|---|---|
| Steps | 1. Open the Welcome Event · 2. Complete the task inside it |
| Marker | interval — fires immediately on first run |
| TaskTemplate | CHECK — 'Open the Welcome Event' |
| Stat group | health |
| XP range | light (20–30) |
| Side effect | Marker also pushes a GTD task to user's gtdList on fire — implementer flag |
| Close condition | Welcome Event auto-closes on 1/1 task complete |
| Coach comment key | onboarding.q1 |

> ⚠ Quest 1 Marker has a dual output: fires standard Milestone AND pushes a task to gtdList. This is a new Marker behaviour — implementer must handle side-effect write to gtdList alongside Milestone generation.

---

### Quest 2 — Splash

| Property | Value |
|---|---|
| Steps | 1. Explore prebuilts and add a default routine · 2. Switch to Week view · 3. Switch to Month view |
| Marker | interval — fires after Quest 1 complete |
| TaskTemplate | CHECKLIST — 'Set Up Your Schedule' |
| Stat group | wisdom |
| XP range | standard (30–50) |
| Close condition | All checklist items confirmed |
| Coach comment key | onboarding.q2 |

---

### Quest 3 — High Ground

| Property | Value |
|---|---|
| Steps | 1. Add Drink Water as a favourite task · 2. Open each Resource room · 3. Open Task and Schedule rooms · 4. Complete the GTD task from Quest 1 |
| Marker | interval — fires after Quest 2 complete |
| TaskTemplate | CHECKLIST — 'Learn the Grounds' |
| Stat group | defense |
| XP range | standard (30–50) |
| Close condition | All exploration steps visited + GTD task complete |
| Coach comment key | onboarding.q3 |
| Coach sub-comments | Resource room: contextual comments per resource type (contacts → birthday tasks, homes → chore tasks, etc.) |

---

### Quest 4 — Stake Your Claim

| Property | Value |
|---|---|
| Steps | 1. Set display name → badge grants · 2. Place first badge in Badge Room → gear drops · 3. Equip gear in Equipment Room · 4. Open Adventures tab |
| Marker | interval — fires after Quest 3 complete |
| TaskTemplate | FORM — 'Claim Your Identity' (display name field) |
| Stat group | charisma |
| XP range | standard (30–50) |
| Close condition | User opens Adventures tab → chain completes → Act transforms to Daily Adventure |
| Achievement triggers | ach-first-badge-placed on step 2 · ach-first-gear-equipped on step 3 |
| Coach comment key | onboarding.q4 |
| Transform behaviour | Act relabels to Daily Adventure. Chain 0 (Onboarding) stays in history. No data deleted. |

> ⚠ Quest 4 close condition is navigation-triggered (user opens Adventures tab), not task-completion-triggered. Implementer must handle this as a special completion condition.

---

### Coach Comment Keys — Onboarding

Quest-level keys required. One comment stack per Quest, three tone variants each (muted / friendly / militant).

| Key | Context / Trigger |
|---|---|
| onboarding.q1 | Welcome Event active — user needs to open and complete it |
| onboarding.q2 | Schedule setup — user adding routine and exploring time views |
| onboarding.q3 | App exploration — user visiting rooms, adding favourites |
| onboarding.q4 | Identity setup — display name, badge placement, gear equip, Adventures tab |

---

## 3. Daily Adventure

Persistent Act. Transforms from Onboarding Act on completion. Rollover appends a new Chain each day. Chain 0 is the Onboarding Chain — it remains in history.

### Fixed Quest Set — LOCAL v1

All four fixed Quests are simultaneously active when a daily Chain spawns. No gating between them.

| # | Quest | Tasks | TaskType | Completion Condition |
|---|---|---|---|---|
| DQ1 | Daily Roll | 1 — tap to roll | ROLL (new taskType) | Roll task completed in Quick Actions |
| DQ2 | Daily Water | 3 × Drink Water | CHECK + cooldown (D75) | 3 completions across the day |
| DQ3 | Log Something | 1 — any Doc entry | LOG | Entry written to any Doc |
| DQ4 | Clear the Deck | None | Condition-based — no TaskTemplate | All day's Events complete at rollover evaluation |
| DQ5 | Adaptive Quests | Coach-generated | Stub null — LOCAL v1 | Populated in MULTI-USER |

---

### Lucky Dice — ROLL TaskType Spec

| Property | Value |
|---|---|
| TaskType | ROLL — new enum value, add to TaskType alongside CHECK, COUNTER etc. |
| inputFields shape | `{ sides: number, result: number, boostApplied: string }` |
| Interaction | Dice icon in dedicated Quick Actions UI section — tap to roll visually |
| Result generation | System-generated on tap — not user-entered |
| Cooldown | 1440 minutes (24 hours) — one roll per day |
| Boost model | Fixed multiplier — roll result = XP multiplier (roll 2 = 2× XP, roll 6 = 6× XP) |
| State after completion | Shows today's result value — locked, no reroll |
| If not rolled | Dies with that day's Chain at rollover — no carryover |
| Edit permissions | User cannot edit, reroll, delete, or change time entry — locked task |
| Custom use | Other users can add ROLL taskType to their own events (heads/tails mechanic etc.) |
| Quick Actions UI | Separate section in Quick Actions — not in GTD list, not in Favourites |
| Quick Actions logic | Render checks if today's DQ1 is complete: not complete → dice available; complete → result displayed |

> ⚠ ROLL taskType must be added to the TaskType enum in LOCAL v1. This is a new enum value not previously in the system.

### Adaptive Quest Stub

DQ5 is a stub for MULTI-USER. The Daily Adventure Chain needs the following stub property:

`adaptiveQuests: []` — null in LOCAL v1. Coach populates in MULTI-USER based on active quest tracking, reading that day's scheduled task counts per stat group.

---

## 4. Stat Path Template — Quest Structure

One Chain per stat Act. Four Quests per Chain. Marker conditionType: `taskCount` (D76 — implemented in LOCAL v1, extends D52). Thresholds: 3 / 6 / 12 / 24 completions of the tracked task.

> ⚠ D76: taskCount added to Marker conditionType enum. D77: taskCount Marker supports a scope filter field — `taskTemplateRef | statGroup | systemEvent`. Some Quest conditions read system events (event creation, login) rather than task completions — implementer must handle these trigger sources.

---

### Health Path

| Quest | Threshold | Tracked Task | TaskType | Notes |
|---|---|---|---|---|
| H1 | 3 | Log body scan | LOG | Writes to user's body scan Doc |
| H2 | 6 | Complete daily water quest | CHECK + cooldown | DQ2 completion counts — cross-quest tracking |
| H3 | 12 | Log meal | LOG | Writes to user's meal Doc |
| H4 | 24 | Log in | CHECK | Daily login — Marker scope: systemEvent.login |

### Strength Path

| Quest | Threshold | Tracked Task | TaskType | Notes |
|---|---|---|---|---|
| S1 | 3 | Track sleep | CIRCUIT | Subtype: DURATION (begin/end time) + RATING (restedness). New prebuilt CIRCUIT template. |
| S2 | 6 | Complete walk route | LOCATION_TRAIL | Route task completion |
| S3 | 12 | Complete workout event | CHECK | Any workout Event completion |
| S4 | 24 | Log workout count | COUNTER | Cumulative workout log entry |

### Agility Path

| Quest | Threshold | Tracked Task | TaskType | Notes |
|---|---|---|---|---|
| A1 | 3 | Complete chore task | CHECK | Chore prebuilt task |
| A2 | 6 | Complete clear inbox task | CHECKLIST | GTD/inbox clear task |
| A3 | 12 | Complete any Event (count) | CHECK | Marker scope: any event completion |
| A4 | 24 | Quick Actions completions (count) | CHECK | Marker scope: any Quick Action completion |

### Defense Path

| Quest | Threshold | Tracked Task | TaskType | Notes |
|---|---|---|---|---|
| DF1 | 3 | Schedule one-time event | — | Marker trigger: plannedEvent.created (new trigger source — not task completion) |
| DF2 | 6 | Complete all scheduled events | — | Condition: Clear the Deck pattern — all day's Events complete |
| DF3 | 12 | Log transaction | LOG | Writes to user's account Doc |
| DF4 | 24 | Inventory items (count) | COUNTER or SCAN | Items logged to inventory |

### Charisma Path

| Quest | Threshold | Tracked Task | TaskType | Notes |
|---|---|---|---|---|
| C1 | 3 | Log a self compliment | CIRCUIT | Multi-field entry — layout control. Simple LOG acceptable fallback at build time. |
| C2 | 6 | Log a piece of gratitude | CIRCUIT | Same pattern as C1 |
| C3 | 12 | Log an act of kindness | CIRCUIT | Same pattern as C1 |
| C4 | 24 | Shared activity (count) | CHECK | Stub — MULTI-USER social feature |

### Wisdom Path

| Quest | Threshold | Tracked Task | TaskType | Notes |
|---|---|---|---|---|
| W1 | 3 | Complete meditation task | TIMER or DURATION | Meditation prebuilt task |
| W2 | 6 | Log mood | RATING or LOG | Mood log entry |
| W3 | 12 | Complete form task (count) | FORM | Any FORM task completion |
| W4 | 24 | Complete wisdom task (count) | CHECK | Marker scope: statGroup = wisdom. Coach prebuilts + user-created wisdom tasks both count. |

> ⚠ W29 scope is quest structure only. Prebuilt TaskTemplates referenced above that do not yet exist are stubbed by name. Prebuilt TaskTemplate expansion is a separate work item.

---

### Marker taskCount Scope Filter Reference

| Scope type | Used by | Description |
|---|---|---|
| taskTemplateRef | H1, H2, H3, S1, S2, S4, DF3, DF4, C1, C2, C3, W1, W2, W3 | Count completions of a specific TaskTemplate |
| statGroup | W4 | Count completions of any task where statGroup matches |
| systemEvent | H4 (login), DF1 (plannedEvent.created), A3 (event.completed), A4 (quickAction.completed) | Count system-level events — not task completions |

---

## 5. Marker Configuration Summary

Two Marker conditionTypes in use across the starter quest set.

| conditionType | Used by | Behaviour |
|---|---|---|
| interval | All Onboarding Quests · Daily Adventure Quests | Fires once (or on schedule) — time-based. Onboarding fires each Quest once sequentially. Daily fires at rollover. |
| taskCount (D76) | All Stat Path Quests | Fires when tracked task/event reaches threshold count. Scope filter determines what counts. Previous completions count — no reset on Quest unlock. |

> ⚠ DF1 (Defense) uses a new Marker trigger source: plannedEvent.created. The Marker listens for event creation, not task completion. Implementer must add this trigger source to the Marker engine alongside task completion.

---

## 6. Achievement Targets — Days 1–7

| Day | Achievement | Trigger |
|---|---|---|
| Day 1 | ach-first-task | Welcome Event task completion (Onboarding Q1) |
| Day 1 | ach-first-event-completed | Welcome Event auto-closes on 1/1 task complete |
| Day 1 | ach-first-badge-placed | Badge placed in Badge Room (Onboarding Q4 step 2) |
| Day 1 | ach-first-gear-equipped | Gear equipped in Equipment Room (Onboarding Q4 step 3) |
| Day 3 | ach-streak-I | 3-day login streak |
| Day 3 | ach-task-milestone-I | 10 tasks completed across Onboarding + daily Chains |
| Day 7 | ach-streak-II | 7-day login streak |

✓ `ach-first-act-created` fires when user creates their first Habitat Act — not triggered by Coach-seeded content. No onboarding quest drives it. It is a discovery achievement with a badge reward.

> ⚠ Achievement values (task thresholds, XP targets) are rough estimates for LOCAL v1. All values to be dialled during MVP12 polish pass when full XP model is rebalanced.

---

## 7. First-Run Feeling

### Does It Tell a Coherent Story?

The starter content has a clear three-act structure:

- **Act I (Day 1):** The user is welcomed into a world. They open a shiny event, complete a task, earn XP, explore the app, build their identity, and earn their first badge and gear. By end of Day 1 they have four achievements, a display name, a badge on their board, and gear equipped. The app feels alive.
- **Act II (Days 2–7):** The Daily Adventure materialises. The Lucky Dice rolls. Water is tracked. Events are cleared. A stat path is chosen. Habits begin. The Coach is contextually aware. XP accumulates. Streaks start building.
- **Act III (Day 8+):** Stat path Quests unlock progressively. Each completed Quest grants additional XP going forward. The system rewards consistency over single actions. The user starts to see how past effort compounds.

### Does It Feel Like a Life RPG?

- The Welcome Event is shiny and prominent — it feels like a quest item appearing in the world, not a tutorial prompt
- The Lucky Dice in Quick Actions adds genuine daily unpredictability — the same mechanic players chase in loot-based games
- Stat paths are progression trees, not checklists — completing a Quest doesn't end it, it upgrades it
- The Daily Adventure transforms from Onboarding — the user's history is preserved, the world grows around them
- XP rewards consistency and intent over single actions — the model discourages "one thing fixes everything" loops

### Naming

Current working names are placeholders — a full naming and copy polish pass is planned for MVP12 publish stage.

| Element | Working Name | Notes |
|---|---|---|
| Onboarding Adventure | Onboarding Adventure | Rename in polish — should feel like a world name |
| Onboarding Chain | Welcome to CAN-DO-BE | Chain 0 in Daily Adventure history |
| Onboarding Q1 | Ripple | First action in the pond |
| Onboarding Q2 | Splash | Schedule and time views |
| Onboarding Q3 | High Ground | App exploration |
| Onboarding Q4 | Stake Your Claim | Identity, badge, gear, Adventures |
| Stat paths | Health / Strength / Agility / Defense / Charisma / Wisdom Path | Polish round may rename |
| Daily Adventure | Daily Adventure | Rename in polish — should feel like an ongoing world event |

---

## 8. New Decisions — W28

| Ref | Decision |
|---|---|
| D76 | taskCount added to Marker conditionType enum in LOCAL v1. Extends D52 (which deferred taskCount post-LOCAL v1). Stat path Quests require it — deferral is lifted. |
| D77 | Marker taskCount conditionType supports a scope filter field with three values: `taskTemplateRef` (specific template), `statGroup` (any task in a stat group), `systemEvent` (non-task system actions like login or event creation). |
| D75 (confirmed) | Daily water intake is a CHECK task with cooldown — not a COUNTER. Lives in Daily Adventure DQ2 (3 Drink Water tasks per day) and is tracked by Health Path Quest H2. |
| D78 | ROLL is a new TaskType added to the TaskType enum. inputFields shape: `{ sides: number, result: number, boostApplied: string }`. Result is system-generated. One roll per day (cooldown 1440 min). Lives in Quick Actions as a dedicated UI section — not in GTD list. |
| D79 | Onboarding Act transforms into Daily Adventure Act on Onboarding Chain completion. Same Act object — name, description, icon, and behavioural mode update. Onboarding Chain (Chain 0) stays in history. No data deleted. Daily Adventure is auto-enrolled. |
| D80 | Marker has a new trigger source: plannedEvent.created. Used by Defense Path DF1 (Schedule one-time event). Implementer must add this trigger source to the Marker engine alongside task completion triggers. |
| D81 | Quest 1 Marker has a dual output: it fires the standard Milestone AND pushes a task to the user's gtdList. Implementer must handle side-effect writes from Marker fire. |
| D82 | XP model rebalance is flagged for MVP12 polish. Current task XP is considered too heavy — ROLL multipliers, streak boosts, and tier enhancements need to be evaluated as a complete picture before final threshold values are set. Consistency and repetition should drive progression over single-action spikes. |

---

## 9. W29 Implementation Scope

**W29 builds:**
- Onboarding Adventure — Act, Chain, 4 Quests, Welcome Event, all Markers and TaskTemplates
- Daily Adventure — stub Act (transforms from Onboarding), DQ1–DQ4 structure, ROLL taskType, Lucky Dice Quick Actions UI section, adaptive stub (DQ5)
- Stat Paths — 6 Acts, 6 Chains, 24 Quests total, all Markers with taskCount conditionType and scope filters
- New Marker conditionType: taskCount with scope filter (D76, D77)
- New Marker trigger source: plannedEvent.created (D80)
- New TaskType: ROLL (D78)
- Dual Marker output: Milestone + gtdList write (D81)
- Coach comment keys: onboarding.q1 through onboarding.q4

✓ W29 builds quest structure only. Prebuilt TaskTemplate expansion (body scan, meal log, sleep CIRCUIT, walk route, chore, clear inbox, meditation, mood log) is a separate work item scoped outside W29.

✓ Stat path Chain 2 is a placeholder in LOCAL v1. Structure is stubbed but not activated. Chain 2 unlocks after all six stat group Chain 1s complete — scope for a future work item.

---

*CAN-DO-BE · LOCAL · MVP11 RELEASE · W28 STARTER QUEST SET · Advisor Output · 2026-03-22*
