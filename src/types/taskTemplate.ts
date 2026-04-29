// ─────────────────────────────────────────
// TASK TEMPLATE — TASK / SCHEDULE CLUSTER
// Universal task blueprint. Instanced into Tasks by Markers, FavouritesList,
// and RecommendationsLibrary. No UUID — lives inside parent objects.
// User custom templates in taskLibrary only (D34).
//
// Also contains: RecurrenceRule, inputFields shapes for all 15 TaskTypes (D38, D41).
// ─────────────────────────────────────────

// ── RECURRENCE RULE ───────────────────────────────────────────────────────────
// Custom lightweight recurrence definition.
// Used by PlannedEvent, Marker, and Resource Account bills/paydays (D28, D37).

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface RecurrenceRule {
  /**
   * daily = shorthand, days[] ignored.
   * monthly defaults to parent seedDate day-of-month when monthlyDay is not set.
   */
  frequency: RecurrenceFrequency;
  /** Which weekdays fire within the period. Ignored for daily and monthly (D37) */
  days: Weekday[];
  /** Optional day-of-month for monthly recurrence. 31 falls back to the month's last day. */
  monthlyDay?: number | null;
  /** Every N periods — default 1 */
  interval: number;
  /** null = indefinite */
  endsOn: string | null; // ISO date
  /** Optional expression for unusual patterns e.g. friday-13th */
  customCondition: string | null;
}

// ── TASK TYPE ENUM (D38) ──────────────────────────────────────────────────────

export type TaskType =
  | 'CHECK'
  | 'COUNTER'
  | 'SETS_REPS'
  | 'CIRCUIT'
  | 'DURATION'
  | 'TIMER'
  | 'RATING'
  | 'TEXT'
  | 'FORM'
  | 'CHOICE'
  | 'CHECKLIST'
  | 'SCAN'
  | 'LOG'
  | 'LOCATION_POINT'
  | 'LOCATION_TRAIL'
  /** D78 — system-generated random roll, one per day, XP multiplier */
  | 'ROLL'
  | 'CONSUME';

// ── INPUT FIELDS — per TaskType (D41) ────────────────────────────────────────
// Each interface defines the inputFields{} shape for a given TaskType.

export interface CheckInputFields {
  label: string;
  /** Result capture — optional note on completion */
  note?: string | null;
}

export interface CounterInputFields {
  target: number;
  unit: string;
  step: number;
  /** Result capture — achieved count on completion */
  count?: number;
}

export interface SetsRepsInputFields {
  sets: number;
  reps: number;
  weight: number | null;
  weightUnit: string | null;
  /** Time to rest after a set (seconds) */
  restAfter: number | null;
  /** true for drop sets — BUILD-time task */
  dropSet: boolean;
}

export type CircuitStepType = 'CHECK' | 'CHOICE' | 'COUNTER' | 'DURATION' | 'TIMER' | 'RATING' | 'TEXT' | 'SCAN';

export interface CircuitStep {
  id: string;
  label: string;
  stepType: CircuitStepType;
  options?: string[];
  scale?: number;
  target?: number;
  unit?: string;
  seconds?: number;
  required?: boolean;
}

export interface CircuitInputFields {
  label: string;
  steps: CircuitStep[];
  rounds: number;
  /** Time to rest between rounds (seconds) */
  restBetweenRounds: number | null;
  /** Result capture — saved per-step values keyed by stepId-roundN */
  stepResults?: Record<string, unknown>;
}

type LegacyCircuitStepInputType = 'TEXT' | 'CHOICE' | 'RATING' | 'CHECK';

interface LegacyCircuitStep {
  key?: string;
  id?: string;
  label?: string;
  inputType?: LegacyCircuitStepInputType | null;
  stepType?: CircuitStepType;
  options?: string[] | null;
  scale?: number | null;
  optional?: boolean;
  required?: boolean;
}

interface LegacyCircuitInputFields {
  label?: string;
  rounds?: number;
  restBetweenRounds?: number | null;
  exercises?: string[];
  steps?: LegacyCircuitStep[];
}

const LEGACY_CIRCUIT_STEP_TYPE_MAP: Record<LegacyCircuitStepInputType, CircuitStepType> = {
  CHECK: 'CHECK',
  CHOICE: 'CHOICE',
  RATING: 'RATING',
  TEXT: 'TEXT',
};

export function normalizeCircuitInputFields(inputFields: LegacyCircuitInputFields | null | undefined): CircuitInputFields {
  const steps = Array.isArray(inputFields?.steps)
    ? inputFields.steps.map((step, index) => ({
        id: step.id?.trim() || step.key?.trim() || `circuit-step-${index + 1}`,
        label: step.label?.trim() || `Step ${index + 1}`,
        stepType: step.stepType ?? LEGACY_CIRCUIT_STEP_TYPE_MAP[step.inputType ?? 'CHECK'] ?? 'CHECK',
        options: Array.isArray(step.options) ? step.options.filter((option): option is string => typeof option === 'string') : undefined,
        scale: typeof step.scale === 'number' ? step.scale : undefined,
        required: typeof step.required === 'boolean'
          ? step.required
          : step.optional === true
            ? false
            : true,
      }))
    : [];

  const fallbackSteps = steps.length > 0
    ? steps
    : Array.isArray(inputFields?.exercises)
      ? inputFields.exercises.map((exercise, index) => ({
          id: `circuit-step-${index + 1}`,
          label: typeof exercise === 'string' && exercise.trim() ? exercise.trim() : `Step ${index + 1}`,
          stepType: 'CHECK' as const,
          required: true,
        }))
      : [];

  const label = typeof inputFields?.label === 'string' && inputFields.label.trim()
    ? inputFields.label.trim()
    : 'Circuit';

  const rounds = typeof inputFields?.rounds === 'number' && inputFields.rounds > 0
    ? inputFields.rounds
    : 1;

  const restBetweenRounds = typeof inputFields?.restBetweenRounds === 'number'
    ? inputFields.restBetweenRounds
    : null;

  return {
    label,
    steps: fallbackSteps,
    rounds,
    restBetweenRounds,
  };
}

export interface DurationInputFields {
  targetDuration: number; // seconds
  unit: 'seconds' | 'minutes' | 'hours';
  /** Result capture — actual duration achieved in seconds */
  actualDuration?: number;
}

export interface TimerInputFields {
  countdownFrom: number; // seconds
}

export interface RatingInputFields {
  scale: number; // e.g. 5 or 10
  label: string;
  /** Result capture — selected rating value */
  value?: number;
}

export interface TextInputFields {
  prompt: string;
  maxLength: number | null;
  /** Result capture — entered text */
  value?: string;
}

export interface FormField {
  key: string;
  label: string;
  fieldType: 'text' | 'number' | 'boolean' | 'date';
  /** Result capture — value entered for this field */
  value?: string | number | boolean | null;
}

export interface FormInputFields {
  fields: FormField[];
}

export interface ChoiceInputFields {
  options: string[];
  multiSelect: boolean;
  /** Result capture — selected option(s) */
  selected?: string[];
}

export interface ChecklistItem {
  key: string;
  label: string;
  /** Result capture — whether this item was checked on completion */
  checked?: boolean;
}

export interface ChecklistInputFields {
  items: ChecklistItem[];
  /** If true, all items must be checked to auto-complete. Default: false (explicit complete allowed) */
  requireAll?: boolean;
}

export interface ScanInputFields {
  scanType: 'barcode' | 'qr' | string;
  /** Result capture — manually entered or scanned value */
  scannedValue?: string;
}

export interface LogInputFields {
  /** Prompt shown to the user — null for open-ended log entry */
  prompt: string | null;
  /** Optional specialized log flow discriminator. */
  logKind?: 'vehicle-mileage' | string | null;
  /** Contextual current numeric value shown before logging. */
  currentValue?: number | null;
  /** Result capture — chosen entry mode for specialized logs. */
  entryMode?: 'set-total' | 'add-distance' | string | null;
  /** Result capture — computed updated numeric value. */
  newValue?: number | null;
  /** Result capture — freetext entry value */
  value?: string;
  /** Result capture — associated Resource ref (enables +2 defense bonus context) */
  resourceRef?: string | null;
  /** Result capture — numeric amount (e.g. dose, distance, cost) */
  amount?: number | null;
  /** Unit label for amount (e.g. mg, km, $) */
  unit?: string | null;
}

export interface ConsumeEntry {
  itemTemplateRef: string;
  quantity: number;
  action: 'consume' | 'replenish';
}

export interface ConsumeInputFields {
  label: string;
  entries: ConsumeEntry[];
}

export interface LocationPointInputFields {
  label: string;
  captureAccuracy: boolean;
  iconKey?: string;
  /** Result capture */
  lat?: number;
  lng?: number;
  accuracy?: number;
  /** ISO timestamp, populated on pin drop completion */
  timestamp?: string;
}

export interface Waypoint {
  lat: number;
  lng: number;
  /** ISO timestamp */
  timestamp: string;
  accuracy?: number;
}

export interface LocationTrailInputFields {
  label: string;
  captureInterval: number | null; // seconds, null = manual
  /** Result capture — collected waypoints */
  waypoints?: Waypoint[];
}

/**
 * D78 — ROLL task input fields.
 * Result is system-generated (1–6). User cannot edit.
 * boostApplied stores any displayed roll bonus note e.g. "+1".
 */
export interface RollInputFields {
  sides: number;
  /** System-generated result (1–sides). Set on completion. */
  result?: number;
  /** e.g. "+1" — computed from result at fire time */
  boostApplied?: string;
}

export type InputFields =
  | CheckInputFields
  | CounterInputFields
  | SetsRepsInputFields
  | CircuitInputFields
  | DurationInputFields
  | TimerInputFields
  | RatingInputFields
  | TextInputFields
  | FormInputFields
  | ChoiceInputFields
  | ChecklistInputFields
  | ScanInputFields
  | LogInputFields
  | ConsumeInputFields
  | LocationPointInputFields
  | LocationTrailInputFields
  | RollInputFields;

// ── SECONDARY TAG ────────────────────────────────────────────────────────────
// Fixed enum for grouping and filtering in the TASK room.
// Enum values are BUILD-time content decisions — extend at BUILD time.
// User-defined tags deferred to a future chapter.

export type TaskSecondaryTag =
  | 'fitness'      // exercise, training, sport (strength + agility stat group)
  | 'nutrition'    // food, diet, meal prep
  | 'health'       // medical, body checks, wellbeing
  | 'mindfulness'  // meditation, mental health, self-care (defense stat group)
  | 'home'         // housekeeping, maintenance, errands
  | 'finance'      // budgeting, bills, saving
  | 'admin'        // scheduling, paperwork, organisation
  | 'learning'     // study, courses, reading (wisdom stat group)
  | 'social'       // relationships, family, friends (charisma stat group)
  | 'work';        // career, professional tasks

// ── XP AWARD ─────────────────────────────────────────────────────────────────
// Partial StatGroup record — values sum to total XP awarded (D43).
// Custom template default: +5 to assigned stat group.

export interface XpAward {
  health: number;
  strength: number;
  agility: number;
  defense: number;
  charisma: number;
  wisdom: number;
}

// ── TASK TEMPLATE ROOT ────────────────────────────────────────────────────────

export interface TaskTemplate {
  /** Identifier used only on prebuilt templates (app bundle). Not present on user custom templates. */
  id?: string;
  /**
   * true  = user-created via TaskTemplatePopup (editable in Task Room).
   * false / undefined = seeded prebuilt template (read-only in Task Room).
   */
  isCustom?: boolean;
  /**
   * true  = onboarding/system template seeded by the coach engine.
   * System templates are hidden from all user-facing task pickers.
   * false / undefined = regular prebuilt or user template.
   */
  isSystem?: boolean;
  name: string;
  description: string;
  /** Ref to icon asset */
  icon: string;
  taskType: TaskType;
  /** Typed input shape per taskType (D41) */
  inputFields: InputFields;
  /** Partial StatGroup record — sum = total XP (D43) */
  xpAward: XpAward;
  /** Optional base XP that should not grant any stat points. */
  xpBonus?: number;
  /** Minutes. null = no cooldown (D41) */
  cooldown: number | null;
  /** Optional instructional content ref — video or image shown before completion */
  media: string | null;
  /** Optional Useable refs — items required for completion */
  items: string[];
  /** Optional category tag for grouping and filtering in TASK room. Enum values BUILD-time. */
  secondaryTag: TaskSecondaryTag | null;
}
