// ─────────────────────────────────────────
// isTemplateQuestLocked (D89)
// Returns true if any active quest Marker references the given template id.
// Used to block deactivation of quest-required templates.
// Traverses: acts → chains[] → quests[] → timely.markers[] (activeState)
// ─────────────────────────────────────────

import { useProgressionStore } from '../stores/useProgressionStore';

/**
 * Returns true if any active Marker in progressionStore references templateId.
 * Safe to call outside React render cycles (uses getState).
 */
export function isTemplateQuestLocked(templateId: string): boolean {
  const acts = useProgressionStore.getState().acts;
  for (const act of Object.values(acts)) {
    for (const chain of act.chains) {
      for (const quest of chain.quests) {
        for (const marker of quest.timely.markers) {
          if (marker.activeState && marker.taskTemplateRef === templateId) return true;
        }
      }
    }
  }
  return false;
}
