// ─────────────────────────────────────────
// COACH — MODULE INDEX
// Typed imports for the 4 APP BUNDLE static JSON libraries.
// Cast to their TypeScript interfaces — data ships with the binary.
// ─────────────────────────────────────────

import type { CommentLibrary, AchievementLibrary, CharacterLibrary } from '../types/coach';
import { normalizeCircuitInputFields, type TaskTemplate } from '../types/taskTemplate';
import { normalizeTaskTemplateIconKey } from '../constants/iconMap';

import commentLibraryRaw from './CommentLibrary.json';
import achievementLibraryRaw from './AchievementLibrary.json';
import characterLibraryRaw from './CharacterLibrary.json';
import taskTemplateLibraryRaw from './TaskTemplateLibrary.json';

export const commentLibrary = commentLibraryRaw as CommentLibrary;
export const achievementLibrary = achievementLibraryRaw as AchievementLibrary;
export const characterLibrary = characterLibraryRaw as CharacterLibrary;
export const taskTemplateLibrary = (taskTemplateLibraryRaw as unknown as TaskTemplate[]).map((template) => ({
  ...template,
  icon: normalizeTaskTemplateIconKey(template.icon, template.taskType),
  inputFields: template.taskType === 'CIRCUIT'
    ? normalizeCircuitInputFields(template.inputFields as unknown as Parameters<typeof normalizeCircuitInputFields>[0])
    : template.inputFields,
}));
