// ─────────────────────────────────────────
// ENGINE — BARREL EXPORT
// Re-exports all engine module public APIs.
// ─────────────────────────────────────────

export { materialisePlannedEvent, advanceCursor } from './materialise';
export type { MaterialiseResult } from './materialise';

export { executeRollover, checkAndRunRolloverOnBoot } from './rollover';

export { completeTask, completeEvent, recordAttachment, addAttachment, removeAttachment } from './eventExecution';
export type { TaskResult, AttachmentRecord, AddAttachmentInput } from './eventExecution';

export { awardXP, awardStat, deriveLevelFromXP, xpProgress } from './awardPipeline';
export type { XPMultipliers } from './awardPipeline';

export {
  evaluateQuestSpecific,
  evaluateMarkerCondition,
  computeProjectedFinish,
  deriveQuestProgress,
  updateQuestProgress,
} from './questEngine';

export {
  encodeQuestRef,
  decodeQuestRef,
  fireMarker,
  completeMilestone,
} from './markerEngine';
export type { FireMarkerParams } from './markerEngine';

export { appendFeedEntry, getFeedEntries, clearFeedBefore, FEED_SOURCE } from './feedEngine';
export type { FeedSource } from './feedEngine';

export {
  generateScheduledTasks,
  generateGTDItems,
  generateDocTasks_stub,
  computeGTDList,
  completeGTDItem,
} from './resourceEngine';

export {
  addFavourite,
  removeFavourite,
  completeFavourite,
  createShoppingList,
  addShoppingItem,
  removeShoppingItem,
  completeShoppingItem,
  completeShoppingList,
  addManualGTDItem,
  removeManualGTDItem,
  completeManualGTDItem,
} from './listsEngine';

// ── COACH MODULE ──────────────────────────────────────────────────────────────

export { ribbet, pushRibbet, flushRibbet, peekRibbet, clearRibbet } from '../coach/ribbet';
export type { RibbetQueueEntry, DynamicValues } from '../coach/ribbet';

export { checkAchievements } from '../coach/checkAchievements';

export { awardBadge, awardGear, checkQuestReward, checkCoachDrops } from '../coach/rewardPipeline';

export { commentLibrary, achievementLibrary, characterLibrary } from '../coach/index';
