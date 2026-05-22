// Keyword engine for WOOP visual effects
// Replace analyzeWoopField with LLM call when local model is available

export type WoopBankMatch = 'wish-bank' | 'outcome-bank' | 'obstacle-bank';

export const BANK_COLORS: Record<WoopBankMatch, string> = {
  'wish-bank': 'rgba(99, 102, 241, 1)',
  'outcome-bank': 'rgba(52, 211, 153, 1)',
  'obstacle-bank': 'rgba(239, 68, 68, 1)',
};

const WISH_KEYWORDS = ['build', 'create', 'fix', 'start', 'learn', 'restore', 'design', 'master', 'become', 'achieve', 'develop', 'grow'];
const OUTCOME_KEYWORDS = ['relax', 'relief', 'pride', 'peak', 'triumph', 'clear', 'finish', 'success', 'freedom', 'confident', 'healthy', 'strong'];
const OBSTACLE_KEYWORDS = ['stuck', 'overwhelmed', 'frustrated', 'tired', 'clutter', 'doubt', 'blocked', 'fear', 'busy', 'distracted', 'money', 'time'];

function matchesKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

export function analyzeWoopField(text: string): WoopBankMatch[] {
  if (!text.trim() || text.trim().length < 4) return [];

  const matches: WoopBankMatch[] = [];
  if (matchesKeywords(text, WISH_KEYWORDS)) matches.push('wish-bank');
  if (matchesKeywords(text, OUTCOME_KEYWORDS)) matches.push('outcome-bank');
  if (matchesKeywords(text, OBSTACLE_KEYWORDS)) matches.push('obstacle-bank');
  return matches;
}

export function analyzeWoopText(text: string): WoopBankMatch[] {
  if (!text.trim()) return [];

  const words = text.toLowerCase().split(/\s+/);
  const matches: WoopBankMatch[] = [];
  for (const word of words) {
    if (WISH_KEYWORDS.some((keyword) => word.includes(keyword))) matches.push('wish-bank');
    else if (OUTCOME_KEYWORDS.some((keyword) => word.includes(keyword))) matches.push('outcome-bank');
    else if (OBSTACLE_KEYWORDS.some((keyword) => word.includes(keyword))) matches.push('obstacle-bank');
  }
  return matches;
}

// Stub for future LLM replacement:
// export async function analyzeWoopFieldLLM(field: string, text: string): Promise<WoopBankMatch[]> {
//   const result = await localModel.analyze(field, text);
//   return result.effects;
// }
