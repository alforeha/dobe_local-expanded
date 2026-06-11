# Brainstorm Type Taxonomy — Track B

**Date:** 2026-06-10 · **Status:** Reference spec, no code changed · **Gates:** Track C (Sprint 5+)
**Verified against source:** `types/brainstorm.ts`, `stores/useBrainstormStore.ts`, `types/act.ts`, `types/task.ts`, `engine/markerEngine.ts` / `engine/rollover.ts` / `engine/questEngine.ts` (pattern reference only)

---

## 0. Design constraints (verified substrate)

Everything in this doc is an **additive** extension of what exists today. No migration, no destructive change.

| Substrate | Where it lives today | How this spec uses it |
|---|---|---|
| `IdeaType` / `EntryType` unions | `types/brainstorm.ts` | Extended with 8 new idea types (additive — existing data keeps its values) |
| `customProperties?: Record<string,string>` | ideas, main ideas, entries | Stays as-is for freeform user strings. **Not** used for structured payloads — string-only values can't hold WOOP arrays or min-count rules. Structured payloads go in a new typed `typeData` |
| `pointsTo` with `pointerType: 'solution' \| 'choice' \| 'others'` | both ideas and entries | `PointerType` union extended (additive) with `'inherits'`, `'feeds-kpi'`, `'fulfils'` |
| `STORM_TYPE_META` | `types/brainstorm.ts` | The natural gating hook — extended with `allowedIdeaTypes` and `gating` config. **Gating lives in config, not code** |
| `EntryState = 'outcome' \| 'obstacle' \| ...` | `types/brainstorm.ts` | Outcome/Obstacle sub-ideas map onto these existing states naturally |
| WOOP shape | `types/act.ts` `Woop` (`wish`, `outcome[]`, `obstacle[]`, `plan`) | Inherited (subset) as the Stage payload |
| Brain-width staking (`stakeBrainWidth` / `unstakeBrainWidth`), `EntryType 'bet'`, storm type `'projection'` | `useBrainstormStore.ts` | Untouched — pre-staged for Circumchance (Track C), out of scope here |
| Bidirectional sync | **Not supported today** — brainstorm store has no schedule/task refs; `Task` has `questRef`/`actRef` but nothing pointing at storms | Defined in §5 as additive `Task.brainstormRef` + a thin `brainstormTaskEngine` |

---

## 1. The 8 idea types

These are **additive** members of the `IdeaType` union. Existing types (`insight`, `question`, `hypothesis`, `blocker`, `action`, `node`, `spark`, `blip`, `box`, `data`, `peak`, `prop`, `others`) are unchanged.

```ts
export type IdeaType =
  // ── existing values unchanged ──
  | 'insight' | 'question' | 'hypothesis' | 'blocker' | 'action'
  | 'node' | 'spark' | 'blip' | 'box' | 'data' | 'peak' | 'prop'
  | 'others'
  // ── Track B additions (additive, no migration) ──
  | 'statement'   // 1
  | 'principle'   // 2
  | 'stage'       // 3
  | 'outcome'     // 4
  | 'obstacle'    // 5
  | 'step'        // 6
  | 'kpi'         // 7
  | 'milestone';  // 8
```

| # | Type | Role | Lives as | Cardinality (Project storm) |
|---|---|---|---|---|
| 1 | `statement` | The project's mission/definition — what done looks like and why it matters | MainIdea of a Project storm | Exactly 1 per Project storm |
| 2 | `principle` | A guiding constraint or value the project must honor; principles gate stage creation | Idea under the Statement | min-N (default N = 3, config per storm type) |
| 3 | `stage` | A phase of execution carrying a full WOOP payload (wish / outcome / obstacle / plan) | Idea under the Statement | 1+ once principle gate passes |
| 4 | `outcome` | A concrete mental-imagery outcome, hoisted from (or feeding) its Stage's WOOP `outcome[]` | Sub-idea of a Stage | 0+ per stage |
| 5 | `obstacle` | A blocker identified for the Stage, hoisted from (or feeding) its Stage's WOOP `obstacle[]` | Sub-idea of a Stage | 0+ per stage |
| 6 | `step` | An actionable unit of the Stage's WOOP `plan` — the brainstorm-side analog of a quest action | Sub-idea of a Stage | 0+ per stage |
| 7 | `kpi` | A measurable indicator with a target; the only type that syncs with the schedule/task system (§5) | Sub-idea of a Stage (or directly under Statement for project-level KPIs) | 0+ |
| 8 | `milestone` | A dated checkpoint that records results when reached; mirrors `types/quest/Milestone.ts` result capture | Sub-idea of a Stage or of a KPI | 0+ |

Notes:

- `outcome` / `obstacle` as **idea** types complement the existing **entry** states `'outcome' | 'obstacle'`: quick notes stay entries; promoted, first-class items become sub-ideas of these types. Promotion copies `content` → `title` and records provenance via an `'inherits'` pointer (§3).
- Work-type trees use none of the above — a Work storm is an ungated single tree of plain `node` ideas (§4).

---

## 2. Per-type `typeData` schema

A new optional field on `BrainstormIdea` and `MainIdea` (and nothing else — entries do not get `typeData`):

```ts
export interface BrainstormIdea {
  // ... existing fields unchanged ...
  /** Typed structured payload per IdeaType (Track B). Absent on legacy data — readers must treat undefined as "no payload". */
  typeData?: IdeaTypeData;
}
```

`IdeaTypeData` is a discriminated union keyed on `kind`, which must match the idea's `type` (validated at write time in the store; mismatches are dropped, never thrown):

```ts
/** WOOP payload inherited (subset) from types/act.ts Woop — same field names, same shapes. */
export interface StormWoop {
  wish: string;
  outcome: string[];
  obstacle: string[];
  plan: Record<string, unknown>;
}

export type IdeaTypeData =
  | { kind: 'statement'; lockedAt?: string /* ISO — set when principle gate passes; statement edits after lock prompt confirmation */ }
  | { kind: 'principle'; rank?: number /* ordering in the principle list */ }
  | { kind: 'stage'; order: number; status: 'pending' | 'active' | 'complete'; woop: StormWoop }
  | { kind: 'outcome'; stageRef?: string /* idea id of owning stage when hoisted */ }
  | { kind: 'obstacle'; stageRef?: string }
  | { kind: 'step'; order?: number; done?: boolean }
  | { kind: 'kpi'; metric: string; unit?: string | null;
      direction: 'increase' | 'decrease' | 'maintain';
      targetValue: number; currentValue: number;
      /** Optional TaskTemplate ref — when set, the sync engine materialises check-in tasks (§5). */
      taskTemplateRef?: string | null;
      /** Recurrence for generated check-ins — reuses RecurrenceRule from types/taskTemplate.ts. */
      cadence?: RecurrenceRule | null;
      /** Cached 0–100, recomputed on every write-back — mirrors Smarter.progressPercent. */
      progressPercent: number;
      lastSyncedAt?: string /* ISO */ }
  | { kind: 'milestone'; dueDate?: string | null;
      /** Result capture on completion — same inline pattern as types/quest/Milestone.ts resultFields. */
      resultFields?: Record<string, unknown>; completedAt?: string | null };
```

Rules:

- `typeData` is **always optional**. Legacy ideas (and any idea of a type not listed above) simply have no `typeData`.
- `customProperties` remains the freeform string bag and is never interpreted by engines. Anything an engine reads or writes lives in `typeData`.
- Normalize-on-read: a `normalizeIdeaTypeData(idea)` helper (precedent: `normalizeCircuitInputFields`, `normalizeTemplateMuscleGroups`) returns a valid payload or `undefined`; store mutations pass through it. No stored-data migration.
- `EntryType` gets one additive member, `'kpi-result'`, used by the sync engine to log write-backs as entries on the KPI idea (human-readable audit trail).

---

## 3. Pointer and inheritance rules

`PointerType` is extended additively:

```ts
export type PointerType =
  | 'solution' | 'choice' | 'others'   // existing — unchanged
  | 'inherits'                         // provenance: target was derived/promoted from source
  | 'feeds-kpi'                        // source's results contribute to the target KPI idea
  | 'fulfils';                         // source satisfies/completes the target (step → outcome, milestone → stage)
```

`pointsTo` already exists on both ideas (`{ targetId, pointerType }`) and entries (`{ targetId, targetType, pointerType }`) — no shape change, only the union widens.

Inheritance rules (Project storms):

1. **Stage WOOP ↔ sub-ideas.** A Stage's `typeData.woop.outcome[]` / `obstacle[]` string arrays are the compact source of truth. Promoting an array item to a first-class sub-idea creates an `outcome`/`obstacle` idea whose `typeData.stageRef` names the stage and which carries a `pointsTo: [{ targetId: stageId, pointerType: 'inherits' }]`. The string stays in the WOOP array; the promoted idea elaborates it. Demoting (deleting the sub-idea) never mutates the WOOP array.
2. **Statement → Stage inheritance.** Stages inherit project context by position (they are children of the Statement); no pointer needed. A Stage may additionally point at specific Principles with `'inherits'` to record which principles shaped it.
3. **Steps fulfil Outcomes.** A `step` that realizes an `outcome` points at it with `'fulfils'`. When every step pointing at an outcome is `done`, the UI may surface the outcome as satisfied (display-only; no auto state change in v1).
4. **Anything feeds a KPI.** Ideas or entries whose activity should count toward a KPI point at the KPI idea with `'feeds-kpi'`. The sync engine (§5) only *reads* these pointers for display/rollup; the numeric `currentValue` is written exclusively through the task write-back path to keep one writer.
5. Pointers are never required for tree integrity — they are annotations. Deleting a pointer target leaves a dangling ref that readers must tolerate (matches today's behavior; the store does not cascade pointer cleanup).

---

## 4. Gating matrix per storm type

Gating is **config, not code**: `STORM_TYPE_META` is extended so the brainstorm view and drawer read rules per storm type. Hardcoding type checks in components is out.

```ts
export interface StormTypeGating {
  /** Required root MainIdea type. */
  root: IdeaType;
  /** Ordered unlock chain — each step unlocks when `requires` is met on the tree. */
  chain: Array<{
    unlocks: IdeaType;                              // type that becomes creatable
    requires: { type: IdeaType; minCount: number }; // gate condition
  }>;
}

export const STORM_TYPE_META: Record<StormType, {
  displayName: string;
  mainIdeaTerm: string;
  addLabel: string;
  /** Idea types creatable in this storm type. Absent = all types allowed (legacy behavior). */
  allowedIdeaTypes?: IdeaType[];
  /** Absent = ungated (legacy behavior). */
  gating?: StormTypeGating;
}> = { /* existing entries unchanged; project/work entries gain the new fields */ };
```

Matrix:

| Storm type | Surfaced in brainstorm view (initially) | `allowedIdeaTypes` | Gating |
|---|---|---|---|
| `general` | **Yes — remains the only type surfaced initially** | absent (all) | none |
| `exploration` | no | absent | none |
| `problem` | no | absent | none |
| `reflection` | no | absent | none |
| `planning` | no | absent | none |
| `project` | no (Track C surfaces it) | `['statement','principle','stage','outcome','obstacle','step','kpi','milestone']` | **Gated** — see chain below |
| `projection` | no (Circumchance, Track C) | absent | none |
| `work` *(new additive StormType — preferred over overloading `general`)* | no (Work Loads view, Track C) | `['node']` | none — ungated single tree |
| `others` | no | absent | none |

Project gating chain (the PM-specified flow — Statement → min-N Principles → Stages with WOOP):

```ts
gating: {
  root: 'statement',
  chain: [
    { unlocks: 'principle', requires: { type: 'statement', minCount: 1 } },
    { unlocks: 'stage',     requires: { type: 'principle', minCount: 3 } }, // N = 3 default, config-tunable
    // stage children (outcome/obstacle/step/kpi/milestone) unlock with their parent stage:
    { unlocks: 'outcome',   requires: { type: 'stage', minCount: 1 } },
    { unlocks: 'obstacle',  requires: { type: 'stage', minCount: 1 } },
    { unlocks: 'step',      requires: { type: 'stage', minCount: 1 } },
    { unlocks: 'kpi',       requires: { type: 'stage', minCount: 1 } },
    { unlocks: 'milestone', requires: { type: 'stage', minCount: 1 } },
  ],
}
```

Evaluation is pure and cheap: `getUnlockedIdeaTypes(storm): IdeaType[]` counts ideas by type and walks the chain. The drawer's add-buttons render from this list. Because `general` storms have no `gating`, the brainstorm view's current behavior is untouched until Track C flips on the Project view.

Work storms: map to the new additive `'work'` StormType (recommended; `STORM_TYPE_META.work = { displayName: 'Work Loads', mainIdeaTerm: 'Load', addLabel: '+ Load', allowedIdeaTypes: ['node'] }`). Falling back to `general` is acceptable if the union addition is deferred, at the cost of not being able to filter Work storms for the Work Loads view.

---

## 5. KPI sync contract (brainstorm ⇄ schedule/tasks)

Bidirectional sync does not exist today; this section defines the **only** contract by which it may be added. The shape deliberately mirrors the proven quest loop: `markerEngine.ts` (generation) → `rollover.ts` step 5 (cadence) → `questEngine.updateQuestProgress` (cached progress write-back).

### 5.1 Additive task reference

```ts
// types/task.ts — additive, optional; no migration
export interface Task {
  // ... existing fields unchanged ...
  /** Set on tasks generated from a KPI idea. Links completion results back to the storm. */
  brainstormRef?: { stormId: string; ideaId: string } | null;
}
```

### 5.2 Engine: `engine/brainstormTaskEngine.ts` (new, thin)

Two functions, one writer rule:

**Generation (forward, storm → schedule)** — `generateKpiCheckIns(date: string)`
- Called from the midnight rollover alongside marker generation (same call site pattern as `markerEngine`).
- For each active (non-archived/resolved) storm, for each `kpi` idea with `typeData.taskTemplateRef` and a `cadence` that fires on `date` (reuses the existing `RecurrenceRule` evaluation), materialise one Task from the template with `brainstormRef: { stormId, ideaId }`.
- Idempotent per `(ideaId, date)` — skip if a task with the same `brainstormRef` and creation date already exists (same dedupe discipline rollover uses for markers).

**Write-back (reverse, schedule → storm)** — `applyKpiResult(task: Task)`
- Called from the completion dispatcher when a completed task has a `brainstormRef` (single hook, mirroring how quest progress is triggered).
- Resolves the storm + idea; if either is gone or the idea is no longer `kind: 'kpi'`, **no-op** (never throw, never block task completion).
- Extracts the numeric result from `task.resultFields` (per the template's `taskType` — counter `count`, duration `actualDuration`, rating `value`, etc.), then:
  - `direction: 'increase'` → `currentValue += amount`; `'decrease'` → `currentValue -= amount`; `'maintain'` → `currentValue = amount`.
  - Recomputes `progressPercent` (0–100, clamped) from `currentValue` vs `targetValue` — the exact caching pattern of `Smarter.progressPercent` via `questEngine.updateQuestProgress`.
  - Sets `lastSyncedAt`.
  - Appends a `'kpi-result'` entry to the KPI idea recording the raw amount and task ref (audit trail; inline result capture mirrors `types/quest/Milestone.ts` `resultFields`).

### 5.3 Contract rules

1. **One writer.** `typeData.currentValue` / `progressPercent` / `lastSyncedAt` are written only by `applyKpiResult`. UI edits to a KPI go through targets/metric/cadence, never the synced values. `'feeds-kpi'` pointers are display-only rollups (§3.4).
2. **Additive only.** No existing engine changes shape; rollover gains one call, completion dispatch gains one call, `Task` gains one optional field.
3. **Fail-open.** Sync failures never block task completion or rollover; they no-op and may log.
4. **No live back-references.** The brainstorm store never stores task IDs (beyond the audit entries); the schedule side owns task lifecycles. Deleting a KPI idea orphans its future check-ins at the next rollover (generation simply finds no idea).
5. **Scope.** Only `kpi` ideas sync. Stages, steps, milestones do not generate tasks in v1 — milestones are completed by hand in the storm view.

---

## 6. Summary of additive schema changes (consolidated)

| Change | File | Kind |
|---|---|---|
| `IdeaType` += 8 members (§1) | `types/brainstorm.ts` | additive union |
| `EntryType` += `'kpi-result'` (§2) | `types/brainstorm.ts` | additive union |
| `PointerType` += `'inherits' \| 'feeds-kpi' \| 'fulfils'` (§3) | `types/brainstorm.ts` | additive union |
| `StormType` += `'work'` (§4, recommended) | `types/brainstorm.ts` | additive union |
| `typeData?: IdeaTypeData` on `BrainstormIdea` / `MainIdea` (§2) | `types/brainstorm.ts` | additive optional field |
| `STORM_TYPE_META` += `allowedIdeaTypes?`, `gating?` (§4) | `types/brainstorm.ts` | additive config |
| `Task.brainstormRef?` (§5.1) | `types/task.ts` | additive optional field |
| `engine/brainstormTaskEngine.ts` (§5.2) | new file | new, mirrors marker/rollover/quest pattern |

No migrations. No changes to `useBrainstormStore` mutation signatures (new `typeData` plumbing rides through the existing `updates` objects). The brainstorm view continues to surface only `general` storms until Track C ships.
