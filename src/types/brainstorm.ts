export type StormState = 'active' | 'incubating' | 'archived' | 'resolved' | 'folding';
export type StormType = 'exploration' | 'problem' | 'planning' | 'reflection' | 'project' | 'projection' | 'general' | 'others';
export type StormCategory = {
  name: string;
  color: string;
};
export type StormDraft = {
  type: StormType;
  category: StormCategory;
};
export type IdeaState = 'open' | 'in-progress' | 'resolved' | 'parked' | 'others';
export type IdeaType =
  'insight' | 'question' | 'hypothesis' | 'blocker' | 'action' |
  'node' | 'spark' | 'blip' | 'box' | 'data' | 'peak' | 'prop' |
  'others';
export type EntryState = 'outcome' | 'obstacle' | 'question' | 'solved' | 'others';
export type EntryType =
  'general' | 'observation' | 'question' | 'research' | 'hypothesis' |
  'test' | 'review' | 'result' | 'bet';
export type PointerType = 'solution' | 'choice' | 'others';

export const STORM_TYPE_META: Record<StormType, { displayName: string; mainIdeaTerm: string; addLabel: string }> = {
  general: { displayName: 'General Void', mainIdeaTerm: 'Node', addLabel: '+ Node' },
  exploration: { displayName: 'Interest Map', mainIdeaTerm: 'Spark', addLabel: '+ Spark' },
  problem: { displayName: 'Be Aware Radar', mainIdeaTerm: 'Blip', addLabel: '+ Blip' },
  reflection: { displayName: 'Grid Log', mainIdeaTerm: 'Data', addLabel: '+ Data' },
  planning: { displayName: 'Stage Staging', mainIdeaTerm: 'Box', addLabel: '+ Box' },
  project: { displayName: 'Top Graphing', mainIdeaTerm: 'Peak', addLabel: '+ Peak' },
  projection: { displayName: 'Level Rod', mainIdeaTerm: 'Prop', addLabel: '+ Prop' },
  others: { displayName: 'Others', mainIdeaTerm: 'Idea', addLabel: '+ Idea' },
};

export const STORM_STATE_META: Record<StormState, { displayName: string; iconKey: string }> = {
  active: { displayName: 'Active', iconKey: 'storm-state-active' },
  incubating: { displayName: 'Incubating', iconKey: 'storm-state-incubating' },
  archived: { displayName: 'Archived', iconKey: 'storm-state-archived' },
  resolved: { displayName: 'Resolved', iconKey: 'storm-state-resolved' },
  folding: { displayName: 'Folding', iconKey: 'storm-state-folding' },
};

export const ENTRY_TYPE_META: Record<EntryType, { displayName: string }> = {
  general: { displayName: 'General' },
  observation: { displayName: 'Observation' },
  question: { displayName: 'Question' },
  research: { displayName: 'Research' },
  hypothesis: { displayName: 'Hypothesis' },
  test: { displayName: 'Test' },
  review: { displayName: 'Review' },
  result: { displayName: 'Result' },
  bet: { displayName: 'Bet' },
};

export interface BrainstormEntry {
  id: string;
  content: string;
  state: EntryState;
  entryType?: EntryType;
  customProperties?: Record<string, string>;
  entries: BrainstormEntry[];
  pointsTo: Array<{
    targetId: string;
    targetType: 'entry' | 'idea';
    pointerType: PointerType;
  }>;
}

export interface BrainstormIdea {
  id: string;
  title: string;
  state: IdeaState;
  type: IdeaType;
  customProperties?: Record<string, string>;
  entries: BrainstormEntry[];
  ideas: string[];
  pointsTo: Array<{ targetId: string; pointerType: PointerType }>;
  parentIdeaId: string | null;
  mainIdeaId: string;
}

export interface MainIdea {
  id: string;
  title: string;
  state: IdeaState;
  type: IdeaType;
  customProperties?: Record<string, string>;
  entries: BrainstormEntry[];
  ideas: string[];
}

export interface Storm {
  id: string;
  name: string;
  state: StormState;
  type: StormType;
  category: StormCategory;
  brainWidthPoints: number;
  brainWidthCap: number;
  brainWidthStaked: number;
  lastRegenAt: number;
  mainIdeas: Record<string, MainIdea>;
  ideas: Record<string, BrainstormIdea>;
}

export interface BrainstormState {
  storms: Record<string, Storm>;
  selectedStormId: string | null;
  selectedMainIdeaId: string | null;
  selectedIdeaId: string | null;
}
