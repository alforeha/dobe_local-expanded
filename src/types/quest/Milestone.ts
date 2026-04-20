// ─────────────────────────────────────────
// Milestone — condition-generated result node
// D04: Milestone is not calendar-generated. Created when:
//   1. A Marker fires and pushes a Task to User.gtdList[]
//   2. The user completes that Task
//   3. Quest.specific{} end-state condition is evaluated
// Carries questRef, actRef, and resourceRef for cross-referencing (D04).
// Full TaskTemplate shape inherited at time of Marker fire (D03).
// resultFields captured from completed Task so progress calculation is self-contained.
// ─────────────────────────────────────────

import type { TaskTemplate, InputFields } from '../taskTemplate';

export interface Milestone {
  /** Encoded navigation ref: "${actId}|${chainIndex}|${questIndex}" */
  questRef: string;
  /** Parent Act uuid ref (D04) — Act is the only hierarchy level with a uuid (D27) */
  actRef: string;
  /**
   * Resource id ref — null if Quest is not resource-linked (D04).
   * Populated from Quest.specific.resourceRef when sourceType is resourceRef.
   */
  resourceRef: string | null;
  /**
   * Full TaskTemplate shape captured at the time this Milestone's Task was fired.
   * Stored inline so historical check-ins are immutable even if the source
   * TaskTemplate is later updated (D03).
   */
  taskTemplateShape: TaskTemplate;
  /** ISO date — when the Milestone Task was completed */
  completedAt: string;
  /**
   * Result fields recorded by the user at Task completion.
   * Captured here for self-contained progress evaluation —
   * allows deriveQuestProgress to read the last measured value without
   * requiring a Task lookup.
   */
  resultFields: Partial<InputFields>;
}
