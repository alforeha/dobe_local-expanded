import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  BrainstormEntry,
  BrainstormIdea,
  BrainstormState,
  MainIdea,
  Storm,
  StormType,
} from '../types/brainstorm';

interface BrainstormActions {
  addStorm: (name: string, type: StormType) => string;
  addMainIdea: (stormId: string, title: string) => void;
  addIdea: (stormId: string, mainIdeaId: string, title: string) => void;
  addChildIdea: (stormId: string, parentIdeaId: string, title: string) => void;
  addEntry: (stormId: string, ideaId: string, entry: Omit<BrainstormEntry, 'id' | 'entries'>) => void;
  addEntryToMainIdea: (stormId: string, mainIdeaId: string, entry: Omit<BrainstormEntry, 'id' | 'entries'>) => void;
  addNestedEntry: (stormId: string, ideaId: string, parentEntryId: string, entry: Omit<BrainstormEntry, 'id' | 'entries'>) => void;
  deleteIdea: (stormId: string, ideaId: string) => void;
  setSelectedStorm: (id: string | null) => void;
  setSelectedMainIdea: (id: string | null) => void;
  setSelectedIdea: (id: string | null) => void;
}

const initialState: BrainstormState = {
  storms: {},
  selectedStormId: null,
  selectedMainIdeaId: null,
  selectedIdeaId: null,
};

function buildEntry(entry: Omit<BrainstormEntry, 'id' | 'entries'>): BrainstormEntry {
  return {
    ...entry,
    id: crypto.randomUUID(),
    entries: [],
  };
}

function addNestedEntryToTree(
  entries: BrainstormEntry[],
  parentEntryId: string,
  nextEntry: BrainstormEntry,
): { entries: BrainstormEntry[]; found: boolean } {
  let found = false;

  const nextEntries = entries.map((entry) => {
    if (entry.id === parentEntryId) {
      found = true;
      return {
        ...entry,
        entries: [...entry.entries, nextEntry],
      };
    }

    const childResult = addNestedEntryToTree(entry.entries, parentEntryId, nextEntry);
    if (!childResult.found) {
      return entry;
    }

    found = true;
    return {
      ...entry,
      entries: childResult.entries,
    };
  });

  return { entries: nextEntries, found };
}

function collectIdeaIdsForDeletion(ideas: Record<string, BrainstormIdea>, ideaId: string): string[] {
  const idea = ideas[ideaId];
  if (!idea) return [];

  return [ideaId, ...idea.ideas.flatMap((childId) => collectIdeaIdsForDeletion(ideas, childId))];
}

function fixStormIdeaRelationships(storm: Storm): Storm {
  const fixedIdeas = Object.fromEntries(
    Object.entries(storm.ideas).map(([ideaId, idea]) => {
      const parentIdeaId = idea.parentIdeaId ?? null;
      const mainIdeaId = idea.mainIdeaId ?? (
        parentIdeaId
          ? storm.ideas[parentIdeaId]?.mainIdeaId ?? ''
          : Object.values(storm.mainIdeas).find((mainIdea) => mainIdea.ideas.includes(ideaId))?.id ?? ''
      );

      return [ideaId, {
        ...idea,
        parentIdeaId,
        mainIdeaId,
      }];
    }),
  ) as Record<string, BrainstormIdea>;

  return {
    ...storm,
    ideas: fixedIdeas,
  };
}

function fixStormsRecord(storms: Record<string, Storm>): Record<string, Storm> {
  return Object.fromEntries(
    Object.entries(storms).map(([stormId, storm]) => [stormId, fixStormIdeaRelationships(storm)]),
  ) as Record<string, Storm>;
}

export const useBrainstormStore = create<BrainstormState & BrainstormActions>()(
  persist(
    (set) => ({
      ...initialState,

      addStorm: (name, type) => {
        const id = crypto.randomUUID();
        const storm: Storm = {
          id,
          name,
          state: 'active',
          type,
          mainIdeas: {},
          ideas: {},
        };

        set((state) => ({
          storms: {
            ...state.storms,
            [id]: storm,
          },
        }));

        return id;
      },

      addMainIdea: (stormId, title) => {
        const id = crypto.randomUUID();
        const mainIdea: MainIdea = {
          id,
          title,
          state: 'open',
          type: 'insight',
          entries: [],
          ideas: [],
        };

        set((state) => {
          const storm = state.storms[stormId];
          if (!storm) return state;

          return {
            storms: {
              ...state.storms,
              [stormId]: {
                ...storm,
                mainIdeas: {
                  ...storm.mainIdeas,
                  [id]: mainIdea,
                },
              },
            },
          };
        });
      },

      addIdea: (stormId, mainIdeaId, title) => {
        const id = crypto.randomUUID();
        const idea: BrainstormIdea = {
          id,
          title,
          state: 'open',
          type: 'insight',
          entries: [],
          ideas: [],
          pointsTo: [],
          parentIdeaId: null,
          mainIdeaId,
        };

        set((state) => {
          const storm = state.storms[stormId];
          const mainIdea = storm?.mainIdeas[mainIdeaId];
          if (!storm || !mainIdea) return state;

          return {
            storms: {
              ...state.storms,
              [stormId]: {
                ...storm,
                ideas: {
                  ...storm.ideas,
                  [id]: idea,
                },
                mainIdeas: {
                  ...storm.mainIdeas,
                  [mainIdeaId]: {
                    ...mainIdea,
                    ideas: [...mainIdea.ideas, id],
                  },
                },
              },
            },
          };
        });
      },

      addChildIdea: (stormId, parentIdeaId, title) => {
        set((state) => {
          const storm = state.storms[stormId];
          const parentIdea = storm?.ideas[parentIdeaId];
          if (!storm || !parentIdea) return state;

          const id = crypto.randomUUID();
          const idea: BrainstormIdea = {
            id,
            title,
            state: 'open',
            type: 'insight',
            entries: [],
            ideas: [],
            pointsTo: [],
            parentIdeaId,
            mainIdeaId: parentIdea.mainIdeaId,
          };

          return {
            storms: {
              ...state.storms,
              [stormId]: {
                ...storm,
                ideas: {
                  ...storm.ideas,
                  [id]: idea,
                  [parentIdeaId]: {
                    ...parentIdea,
                    ideas: [...parentIdea.ideas, id],
                  },
                },
              },
            },
          };
        });
      },

      addEntry: (stormId, ideaId, entry) => {
        const nextEntry = buildEntry(entry);

        set((state) => {
          const storm = state.storms[stormId];
          const idea = storm?.ideas[ideaId];
          if (!storm || !idea) return state;

          return {
            storms: {
              ...state.storms,
              [stormId]: {
                ...storm,
                ideas: {
                  ...storm.ideas,
                  [ideaId]: {
                    ...idea,
                    entries: [...idea.entries, nextEntry],
                  },
                },
              },
            },
          };
        });
      },

      addEntryToMainIdea: (stormId, mainIdeaId, entry) => {
        const nextEntry = buildEntry(entry);

        set((state) => {
          const storm = state.storms[stormId];
          const mainIdea = storm?.mainIdeas[mainIdeaId];
          if (!storm || !mainIdea) return state;

          return {
            storms: {
              ...state.storms,
              [stormId]: {
                ...storm,
                mainIdeas: {
                  ...storm.mainIdeas,
                  [mainIdeaId]: {
                    ...mainIdea,
                    entries: [...mainIdea.entries, nextEntry],
                  },
                },
              },
            },
          };
        });
      },

      addNestedEntry: (stormId, ideaId, parentEntryId, entry) => {
        const nextEntry = buildEntry(entry);

        set((state) => {
          const storm = state.storms[stormId];
          const idea = storm?.ideas[ideaId];
          if (!storm || !idea) return state;

          const result = addNestedEntryToTree(idea.entries, parentEntryId, nextEntry);
          if (!result.found) return state;

          return {
            storms: {
              ...state.storms,
              [stormId]: {
                ...storm,
                ideas: {
                  ...storm.ideas,
                  [ideaId]: {
                    ...idea,
                    entries: result.entries,
                  },
                },
              },
            },
          };
        });
      },

      deleteIdea: (stormId, ideaId) => {
        set((state) => {
          const storm = state.storms[stormId];
          const idea = storm?.ideas[ideaId];
          if (!storm || !idea) return state;

          const idsToDelete = new Set(collectIdeaIdsForDeletion(storm.ideas, ideaId));
          const nextIdeas = { ...storm.ideas };

          idsToDelete.forEach((id) => {
            delete nextIdeas[id];
          });

          const nextMainIdeas = { ...storm.mainIdeas };
          const ownerMainIdea = nextMainIdeas[idea.mainIdeaId];
          if (ownerMainIdea) {
            nextMainIdeas[idea.mainIdeaId] = {
              ...ownerMainIdea,
              ideas: ownerMainIdea.ideas.filter((id) => id !== ideaId),
            };
          }

          const parentIdeaId = idea.parentIdeaId;
          const parentIdea = parentIdeaId ? nextIdeas[parentIdeaId] : null;
          if (parentIdea && parentIdeaId) {
            nextIdeas[parentIdeaId] = {
              ...parentIdea,
              ideas: parentIdea.ideas.filter((id) => id !== ideaId),
            };
          }

          return {
            storms: {
              ...state.storms,
              [stormId]: {
                ...storm,
                mainIdeas: nextMainIdeas,
                ideas: nextIdeas,
              },
            },
          };
        });
      },

      setSelectedStorm: (id) => {
        set({ selectedStormId: id });
      },

      setSelectedMainIdea: (id) => {
        set({ selectedMainIdeaId: id });
      },

      setSelectedIdea: (id) => {
        set({ selectedIdeaId: id });
      },
    }),
    {
      name: 'cdb-brainstorm',
      partialize: (state) => ({
        storms: state.storms,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.storms = fixStormsRecord(state.storms);
      },
    },
  ),
);
