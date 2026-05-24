export type StormState = 'active' | 'incubating' | 'archived' | 'resolved';
export type StormType = 'exploration' | 'problem' | 'planning' | 'reflection' | 'project' | 'others';
export type IdeaState = 'open' | 'in-progress' | 'resolved' | 'parked' | 'others';
export type IdeaType = 'insight' | 'question' | 'hypothesis' | 'blocker' | 'action' | 'others';
export type EntryState = 'outcome' | 'obstacle' | 'question' | 'solved' | 'others';
export type PointerType = 'solution' | 'choice' | 'others';

export interface BrainstormEntry {
  id: string;
  content: string;
  state: EntryState;
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
  entries: BrainstormEntry[];
  ideas: string[];
}

export interface Storm {
  id: string;
  name: string;
  state: StormState;
  type: StormType;
  mainIdeas: Record<string, MainIdea>;
  ideas: Record<string, BrainstormIdea>;
}

export interface BrainstormState {
  storms: Record<string, Storm>;
  selectedStormId: string | null;
  selectedMainIdeaId: string | null;
  selectedIdeaId: string | null;
}
