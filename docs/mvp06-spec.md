# MVP06 — CORE LOOP ENGINE SPEC
## CAN-DO-BE LOCAL · Structure Spec · 2026-03-19

---

## 1. 9-Step Midnight Rollover Sequence

Defined in storage schema §7 (D14). Runs at midnight or on app boot if missed.
Each step is a discrete named function in `src/engine/rollover.ts`.

| Step | Function name | Reads | Writes | Store(s) touched | Storage keys touched |
|------|--------------|-------|--------|-----------------|---------------------|
| 1 | `step1_identifyDuePlannedEvents` | `useScheduleStore.plannedEvents` — all active PlannedEvents with `activeState === 'active'`, filter by RecurrenceRule against rollover date | list of due PE ids (in-memory) | `useScheduleStore` (read) | `plannedEvent:{uuid}` (read) |
| 2 | `step2_resolveConflicts` | due PE list from step 1, each PE's `startTime`/`endTime`/`conflictMode` | filtered/adjusted PE list (in-memory) | — (pure computation) | — |
| 3 | `step3_materialisePlannedEvents` | resolved PE list from step 2, `taskTemplates` map | new `Event` objects | `useScheduleStore.activeEvents` | `event:{uuid}` (write) |
| 4 | `step4_pullTaskLists` | new Events from step 3, each PlannedEvent's `taskPool` + `taskPoolCursor` | new `Task` instances per Event, updated `PlannedEvent.taskPoolCursor` | `useScheduleStore.tasks`, `useScheduleStore.plannedEvents` | `task:{uuid}` (write), `plannedEvent:{uuid}` (write — cursor++) |
| 5 | `step5_evaluateMarkers` | `useProgressionStore.acts` — all active Quests → timely.markers → filter `activeState && nextFire <= rolloverDate` | list of due Marker + taskTemplateRef pairs (in-memory) | `useProgressionStore` (read) | `act:{uuid}` (read) |
| 6 | `step6_fireMarkers` | due Markers from step 5 | new `Task` instances pushed to `user.lists.gtdList`, Marker `lastFired` + `nextFire` updated | `useScheduleStore.tasks`, `useProgressionStore.acts` (Marker state), `useUserStore.user.lists.gtdList` | `task:{uuid}` (write), `act:{uuid}` (write — marker timestamps) |
| 7 | `step7_archiveEvents` | `useScheduleStore.activeEvents` — completed/skipped Events + today's QA event | Events moved from `activeEvents` → `historyEvents`, today's `QuickActionsEvent` moved to history | `useScheduleStore.activeEvents`, `useScheduleStore.historyEvents` | `event:{uuid}` (delete active, write history), `qa:{YYYY-MM-DD}` (archive) |
| 8 | `step8_updateRecurrence` | all recurring active PlannedEvents (from step 1 due list) | each PE's `seedDate` advanced to next occurrence via RecurrenceRule | `useScheduleStore.plannedEvents` | `plannedEvent:{uuid}` (write — new seedDate) |
| 9 | `step9_coachReview` | `useUserStore.user` (stats, feed, milestones), `useScheduleStore` (history) | Feed entries queued, achievements checked, new `QuickActionsEvent` for new day created in `activeEvents` | `useUserStore.user.feed`, `useScheduleStore.activeEvents` | `qa:{new-date}` (write), `user` (write — feed) |

**Rollover state:** `useSystemStore.lastRollover` stores ISO date of last completed rollover.
Resumability: `useSystemStore` also holds `rolloverStep: number | null` — if set on boot, rollover resumes from that step.

---

## 2. PlannedEvent Materialisation Trigger Logic

Both paths call the same `materialisePlannedEvent(pe, rolloverDate)` in `materialise.ts`.

### Same-day creation path
1. User creates a new `PlannedEvent` with `seedDate === today`
2. UI calls `materialisePlannedEvent(pe, today)` immediately after saving the PE to the store
3. Returns a new `Event` with `eventType: 'planned'`, `plannedEventRef: pe.id`, tasks pulled from `taskPool[taskPoolCursor]`
4. Event saved to `useScheduleStore.activeEvents`; Tasks saved to `useScheduleStore.tasks`
5. `taskPoolCursor` incremented, wrapped mod `taskPool.length`, PE persisted

### Midnight rollover path
1. Rollover step 3 calls `materialisePlannedEvent(pe, rolloverDate)` for each resolved PE
2. Same function, same output shape
3. Step 4 then calls `pullTaskList(pe)` which is factored inside `materialisePlannedEvent`

**Convergence:** both paths produce the same `Event` shape. The only difference is caller context and the date used for `startDate`.

---

## 3. taskPoolCursor Advance (D47)

`PlannedEvent.taskPoolCursor: number` — index into `taskPool[]`. Added to type in MVP06.

**Algorithm:**
```
cursor = pe.taskPoolCursor ?? 0
templateRef = pe.taskPool[cursor % pe.taskPool.length]   // wraps if OOB
nextCursor = (cursor + 1) % pe.taskPool.length           // wraps at pool end
```

**Persistence per step:**
- Read: `pe.taskPoolCursor` from `useScheduleStore.plannedEvents[pe.id]`
- Increment + wrap: `nextCursor = (cursor + 1) % pe.taskPool.length`
- Write: `useScheduleStore.setPlannedEvent({ ...pe, taskPoolCursor: nextCursor })`
  - Also writes to `storageLayer` via `storageSet(storageKey.plannedEvent(pe.id), updatedPe)`
- Edge case: if `taskPool` is empty, no task is created; cursor stays at 0

---

## 4. XP Award Pipeline (D43, D48, D49)

**RuneScape formula** (D49, parameters A=0.25 B=300 C=7):
```
XP to reach level L  =  floor( (1/4) * sum_{i=1}^{L-1} [ floor(i + 300 * 2^(i/7)) ] )
```
XP threshold table generated at module init and cached in-process. Level 99 ≈ halfway to Level 100 by XP design.

**awardXP flow:**
1. Sum all `xpAward` stat values from completed TaskTemplate → `baseXP`
2. Apply context bonuses (+2 agility for QA, +2 defense for resource)
3. Apply multipliers (streak ×3, early bird ×2 — additive by default)
4. Call `useUserStore.setStats(updatedStats)` and write to `storageKey.user`

**awardStat flow:**
1. Route `points` to `UserStats.talents[statGroup].statPoints`
2. Custom task fallback: if no `statGroup` detected → route to `wisdom` +25 (D48)
3. Accumulate `xpEarned` on the talent group
4. Award 1 `talentPoint` per 100 statPoints earned (cumulative check)

**Level-up:** `UserStats.level` is derived at call time from `xp` against threshold table — if derived level > cached level, emit `levelUp` event and update cached level.

---

*Structure spec confirmed — proceeding to BUILD phase.*
