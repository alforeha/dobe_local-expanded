// ─────────────────────────────────────────
// Quest.measurable{} — SMARTER: M
// Defines which task types count as completion events toward Quest progress.
// Q02 DECISION (confirmed): flat list — all listed task types count equally.
// The list is a filter on which task type completions the system recognises
// as meaningful progress events for this Quest.
// ─────────────────────────────────────────

export interface QuestMeasurable {
  taskTemplateRefs?: string[];
  resourceRef?: string;
}
