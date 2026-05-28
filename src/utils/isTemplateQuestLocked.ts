// ─────────────────────────────────────────
// isTemplateQuestLocked (D89)
// Returns true if any active quest Marker references the given template id.
// Used to block deactivation of quest-required templates.
// Traverses: aspirations → woops[] → smarters[] → timely.markers[] (activeState)
// ─────────────────────────────────────────

import { useProgressionStore } from '../stores/useProgressionStore';

/**
 * Returns true if any active Marker in progressionStore references templateId.
 * Safe to call outside React render cycles (uses getState).
 */
export function isTemplateQuestLocked(templateId: string): boolean {
  const aspirations = useProgressionStore.getState().aspirations;
  for (const act of Object.values(aspirations)) {
    for (const chain of act.woops) {
      for (const quest of chain.smarters) {
        for (const marker of quest.timely.markers) {
          if (marker.activeState && marker.taskTemplateRef === templateId) return true;
        }
      }
    }
  }
  return false;
}

