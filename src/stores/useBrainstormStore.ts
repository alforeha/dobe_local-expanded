import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { awardStat, awardXP } from '../engine/awardPipeline';
import { useUserStore } from './useUserStore';
import type {
  BrainstormEntry,
  BrainstormIdea,
  BrainstormState,
  EntryState,
  EntryType,
  IdeaState,
  IdeaType,
  IdeaTypeData,
  MainIdea,
  Storm,
  StormCategory,
  StormState,
  StormType,
} from '../types/brainstorm';
import { normalizeIdeaTypeData } from '../types/brainstorm';

type BrainstormEntryDraft = Omit<BrainstormEntry, 'id' | 'entries' | 'type'> & {
  id?: string;
  entries?: BrainstormEntryDraft[];
  type?: EntryType;
  entryType?: EntryType;
};

type BrainstormIdeaUpdates = {
  title?: string;
  state?: IdeaState;
  type?: IdeaType;
  customProperties?: Record<string, string>;
  /** Typed payload (Track B §2) — validated against the idea's type on write; mismatches are dropped. */
  typeData?: IdeaTypeData;
};

type BrainstormEntryUpdates = {
  content?: string;
  state?: EntryState;
  type?: EntryType;
  customProperties?: Record<string, string>;
};

interface BrainstormActions {
  addStorm: (name: string, type: StormType, state?: StormState, category?: StormCategory, icon?: string) => string;
  addMainIdea: (
    stormId: string,
    title: string,
    state?: IdeaState,
    type?: IdeaType,
    customProperties?: Record<string, string>,
    typeData?: IdeaTypeData,
  ) => void;
  addIdea: (
    stormId: string,
    mainIdeaId: string,
    title: string,
    state?: IdeaState,
    type?: IdeaType,
    customProperties?: Record<string, string>,
    typeData?: IdeaTypeData,
  ) => void;
  addChildIdea: (
    stormId: string,
    parentIdeaId: string,
    title: string,
    state?: IdeaState,
    type?: IdeaType,
    customProperties?: Record<string, string>,
    typeData?: IdeaTypeData,
  ) => void;
  addEntry: (
    stormId: string,
    ideaId: string,
    entry: BrainstormEntryDraft,
    entryType?: EntryType,
    customProperties?: Record<string, string>,
  ) => void;
  addEntryToMainIdea: (
    stormId: string,
    mainIdeaId: string,
    entry: BrainstormEntryDraft,
    entryType?: EntryType,
    customProperties?: Record<string, string>,
  ) => void;
  addNestedEntry: (stormId: string, ideaId: string, parentEntryId: string, entry: BrainstormEntryDraft) => void;
  addSubEntry: (stormId: string, parentEntryId: string, entry: BrainstormEntryDraft) => void;
  deleteStorm: (stormId: string) => void;
  deleteMainIdea: (stormId: string, mainIdeaId: string) => void;
  deleteIdea: (stormId: string, ideaId: string) => void;
  deleteEntry: (stormId: string, entryId: string) => void;
  renameStorm: (stormId: string, name: string) => void;
  setStormType: (stormId: string, type: StormType) => void;
  setStormIcon: (stormId: string, icon: string) => void;
  /**
   * Engine-written audit entry (Track C §5.2 — 'kpi-result' write-backs).
   * Unlike addEntry, spends no brain width and awards no XP.
   */
  appendSystemEntry: (stormId: string, ideaId: string, entry: BrainstormEntryDraft) => void;
  setStormCategory: (stormId: string, category: StormCategory) => void;
  setStormState: (stormId: string, state: StormState) => void;
  updateMainIdea: (stormId: string, mainIdeaId: string, updates: BrainstormIdeaUpdates) => void;
  updateIdea: (stormId: string, ideaId: string, updates: BrainstormIdeaUpdates) => void;
  updateEntry: (stormId: string, entryId: string, updates: BrainstormEntryUpdates) => void;
  renameMainIdea: (stormId: string, mainIdeaId: string, name: string) => void;
  renameIdea: (stormId: string, ideaId: string, name: string) => void;
  spendBrainWidth: (stormId: string, amount: number) => boolean;
  raiseBrainWidthCap: (stormId: string, amount: number) => void;
  regenBrainWidth: (stormId: string) => void;
  stakeBrainWidth: (stormId: string, amount: number) => boolean;
  unstakeBrainWidth: (stormId: string, amount: number, won: boolean) => void;
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

function buildEntry(
  entry: BrainstormEntryDraft,
  entryType?: EntryType,
  customProperties?: Record<string, string>,
): BrainstormEntry {
  return {
    ...entry,
    type: entryType ?? entry.type ?? entry.entryType ?? 'general',
    customProperties: customProperties ?? entry.customProperties,
    id: crypto.randomUUID(),
    entries: [],
  };
}

function normalizeEntry(entry: BrainstormEntryDraft): BrainstormEntry {
  return {
    ...entry,
    id: entry.id ?? crypto.randomUUID(),
    type: entry.type ?? entry.entryType ?? 'general',
    customProperties: entry.customProperties ?? {},
    entries: (entry.entries ?? []).map((childEntry) => normalizeEntry(childEntry)),
  };
}

function normalizeMainIdea(mainIdea: MainIdea): MainIdea {
  return {
    ...mainIdea,
    customProperties: mainIdea.customProperties ?? {},
    entries: mainIdea.entries.map((entry) => normalizeEntry(entry)),
  };
}

function normalizeIdea(idea: BrainstormIdea): BrainstormIdea {
  return {
    ...idea,
    customProperties: idea.customProperties ?? {},
    entries: idea.entries.map((entry) => normalizeEntry(entry)),
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

function updateEntryInList(
  entries: BrainstormEntry[],
  entryId: string,
  updates: BrainstormEntryUpdates,
): { entries: BrainstormEntry[]; found: boolean } {
  let found = false;

  const nextEntries = entries.map((entry) => {
    if (entry.id !== entryId) {
      return entry;
    }

    found = true;
    return {
      ...entry,
      ...(updates.content !== undefined ? { content: updates.content } : {}),
      ...(updates.state !== undefined ? { state: updates.state } : {}),
      ...(updates.type !== undefined ? { type: updates.type } : {}),
      ...(updates.customProperties !== undefined ? { customProperties: updates.customProperties } : {}),
    };
  });

  return { entries: nextEntries, found };
}

function deleteEntryFromList(entries: BrainstormEntry[], entryId: string): { entries: BrainstormEntry[]; found: boolean } {
  const nextEntries = entries.filter((entry) => entry.id !== entryId);
  return {
    entries: nextEntries,
    found: nextEntries.length !== entries.length,
  };
}

function collectIdeaIdsForDeletion(ideas: Record<string, BrainstormIdea>, ideaId: string): string[] {
  const idea = ideas[ideaId];
  if (!idea) return [];

  return [ideaId, ...idea.ideas.flatMap((childId) => collectIdeaIdsForDeletion(ideas, childId))];
}

function stormContainsIdea(storm: Storm, ideaId: string): boolean {
  const visited = new Set<string>();

  function visitIdea(currentIdeaId: string): boolean {
    if (currentIdeaId === ideaId) return true;
    if (visited.has(currentIdeaId)) return false;

    visited.add(currentIdeaId);
    const currentIdea = storm.ideas[currentIdeaId];
    if (!currentIdea) return false;

    return currentIdea.ideas.some((childIdeaId) => visitIdea(childIdeaId));
  }

  return Object.values(storm.mainIdeas).some((mainIdea) => mainIdea.ideas.some((childIdeaId) => visitIdea(childIdeaId)));
}

function fixStormIdeaRelationships(storm: Storm): Storm {
  const fixedMainIdeas = Object.fromEntries(
    Object.entries(storm.mainIdeas).map(([mainIdeaId, mainIdea]) => [mainIdeaId, normalizeMainIdea(mainIdea)]),
  ) as Record<string, MainIdea>;
  const fixedIdeas = Object.fromEntries(
    Object.entries(storm.ideas).map(([ideaId, idea]) => {
      const parentIdeaId = idea.parentIdeaId ?? null;
      const mainIdeaId = idea.mainIdeaId ?? (
        parentIdeaId
          ? storm.ideas[parentIdeaId]?.mainIdeaId ?? ''
          : Object.values(fixedMainIdeas).find((mainIdea) => mainIdea.ideas.includes(ideaId))?.id ?? ''
      );

      return [ideaId, {
        ...normalizeIdea(idea),
        parentIdeaId,
        mainIdeaId,
      }];
    }),
  ) as Record<string, BrainstormIdea>;

  return {
    ...storm,
    mainIdeas: fixedMainIdeas,
    ideas: fixedIdeas,
  };
}

function fixStormsRecord(storms: Record<string, Storm>): Record<string, Storm> {
  return Object.fromEntries(
    Object.entries(storms).map(([stormId, storm]) => [stormId, fixStormIdeaRelationships(storm)]),
  ) as Record<string, Storm>;
}

function awardBrainstormWisdomXP(): void {
  const userId = useUserStore.getState().user?.system?.id;
  if (!userId) return;

  awardXP(userId, 1, { statGroup: 'wisdom', source: 'brainstorm.add' });
  awardStat(userId, 'wisdom', 1, 'brainstorm.add');
}

export const useBrainstormStore = create<BrainstormState & BrainstormActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      addStorm: (name, type, stormState, category, icon) => {
        const id = crypto.randomUUID();
        const storm: Storm = {
          id,
          name,
          state: stormState ?? 'active',
          type,
          ...(icon ? { icon } : {}),
          category: category ?? { name: 'Thought Train', color: '#7c3aed' },
          brainWidthPoints: 1000,
          brainWidthCap: 1000,
          brainWidthStaked: 0,
          lastRegenAt: Date.now(),
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

      addMainIdea: (stormId, title, ideaState, ideaType, customProperties, typeData) => {
        const id = crypto.randomUUID();
        const resolvedType = ideaType ?? 'insight';
        const normalizedTypeData = normalizeIdeaTypeData(resolvedType, typeData);
        const mainIdea: MainIdea = {
          id,
          title,
          state: ideaState ?? 'open',
          type: resolvedType,
          customProperties: customProperties ?? {},
          ...(normalizedTypeData ? { typeData: normalizedTypeData } : {}),
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

        get().spendBrainWidth(stormId, 10);
        get().raiseBrainWidthCap(stormId, 1);
        awardBrainstormWisdomXP();
      },

      addIdea: (stormId, mainIdeaId, title, ideaState, ideaType, customProperties, typeData) => {
        const id = crypto.randomUUID();
        const resolvedType = ideaType ?? 'insight';
        const normalizedTypeData = normalizeIdeaTypeData(resolvedType, typeData);
        const idea: BrainstormIdea = {
          id,
          title,
          state: ideaState ?? 'open',
          type: resolvedType,
          customProperties: customProperties ?? {},
          ...(normalizedTypeData ? { typeData: normalizedTypeData } : {}),
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

        get().spendBrainWidth(stormId, 10);
        get().raiseBrainWidthCap(stormId, 1);
        awardBrainstormWisdomXP();
      },

      addChildIdea: (stormId, parentIdeaId, title, ideaState, ideaType, customProperties, typeData) => {
        set((state) => {
          const storm = state.storms[stormId];
          const parentIdea = storm?.ideas[parentIdeaId];
          if (!storm || !parentIdea) return state;

          const id = crypto.randomUUID();
          const resolvedType = ideaType ?? 'insight';
          const normalizedTypeData = normalizeIdeaTypeData(resolvedType, typeData);
          const idea: BrainstormIdea = {
            id,
            title,
            state: ideaState ?? 'open',
            type: resolvedType,
            customProperties: customProperties ?? {},
            ...(normalizedTypeData ? { typeData: normalizedTypeData } : {}),
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

        get().spendBrainWidth(stormId, 10);
        get().raiseBrainWidthCap(stormId, 1);
        awardBrainstormWisdomXP();
      },

      addEntry: (stormId, ideaId, entry, entryType, customProperties) => {
        const nextEntry = buildEntry(entry, entryType, customProperties);

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

        get().spendBrainWidth(stormId, 10);
        get().raiseBrainWidthCap(stormId, 1);
        awardBrainstormWisdomXP();
      },

      addEntryToMainIdea: (stormId, mainIdeaId, entry, entryType, customProperties) => {
        const nextEntry = buildEntry(entry, entryType, customProperties);

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

        get().spendBrainWidth(stormId, 10);
        get().raiseBrainWidthCap(stormId, 1);
        awardBrainstormWisdomXP();
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

      addSubEntry: (stormId, parentEntryId, entry) => {
        const nextEntry = buildEntry(entry);

        set((state) => {
          const storm = state.storms[stormId];
          if (!storm) return state;

          for (const [mainIdeaId, mainIdea] of Object.entries(storm.mainIdeas)) {
            const result = addNestedEntryToTree(mainIdea.entries, parentEntryId, nextEntry);
            if (!result.found) continue;

            return {
              storms: {
                ...state.storms,
                [stormId]: {
                  ...storm,
                  mainIdeas: {
                    ...storm.mainIdeas,
                    [mainIdeaId]: {
                      ...mainIdea,
                      entries: result.entries,
                    },
                  },
                },
              },
            };
          }

          for (const [ideaId, idea] of Object.entries(storm.ideas)) {
            const result = addNestedEntryToTree(idea.entries, parentEntryId, nextEntry);
            if (!result.found) continue;

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
          }

          return state;
        });

        get().spendBrainWidth(stormId, 10);
        get().raiseBrainWidthCap(stormId, 1);
        awardBrainstormWisdomXP();
      },

      deleteStorm: (stormId) => {
        set((state) => {
          const storm = state.storms[stormId];
          if (!storm) return state;

          const nextStorms = { ...state.storms };
          delete nextStorms[stormId];

          return {
            storms: nextStorms,
          };
        });
      },

      deleteMainIdea: (stormId, mainIdeaId) => {
        set((state) => {
          const storm = state.storms[stormId];
          const mainIdea = storm?.mainIdeas[mainIdeaId];
          if (!storm || !mainIdea) return state;

          const nextMainIdeas = { ...storm.mainIdeas };
          delete nextMainIdeas[mainIdeaId];

          const nextIdeas = Object.fromEntries(
            Object.entries(storm.ideas).filter(([, idea]) => idea.mainIdeaId !== mainIdeaId),
          ) as Record<string, BrainstormIdea>;

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

      deleteEntry: (stormId, entryId) => {
        set((state) => {
          const storm = state.storms[stormId];
          if (!storm) return state;

          for (const [mainIdeaId, mainIdea] of Object.entries(storm.mainIdeas)) {
            const result = deleteEntryFromList(mainIdea.entries, entryId);
            if (!result.found) continue;

            return {
              storms: {
                ...state.storms,
                [stormId]: {
                  ...storm,
                  mainIdeas: {
                    ...storm.mainIdeas,
                    [mainIdeaId]: {
                      ...mainIdea,
                      entries: result.entries,
                    },
                  },
                },
              },
            };
          }

          for (const [ideaId, idea] of Object.entries(storm.ideas)) {
            const result = deleteEntryFromList(idea.entries, entryId);
            if (!result.found) continue;

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
          }

          return state;
        });
      },

      renameStorm: (stormId, name) => {
        set((state) => {
          const storm = state.storms[stormId];
          if (!storm) return state;

          return {
            storms: {
              ...state.storms,
              [stormId]: {
                ...storm,
                name,
              },
            },
          };
        });
      },

      setStormType: (stormId, type) => {
        set((state) => {
          const storm = state.storms[stormId];
          if (!storm) return state;

          return {
            storms: {
              ...state.storms,
              [stormId]: {
                ...storm,
                type,
              },
            },
          };
        });
      },

      setStormIcon: (stormId, icon) => {
        set((state) => {
          const storm = state.storms[stormId];
          if (!storm) return state;

          return {
            storms: {
              ...state.storms,
              [stormId]: {
                ...storm,
                icon,
              },
            },
          };
        });
      },

      appendSystemEntry: (stormId, ideaId, entry) => {
        const nextEntry = buildEntry(entry);

        set((state) => {
          const storm = state.storms[stormId];
          if (!storm) return state;

          const idea = storm.ideas[ideaId];
          if (idea) {
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
          }

          const mainIdea = storm.mainIdeas[ideaId];
          if (mainIdea) {
            return {
              storms: {
                ...state.storms,
                [stormId]: {
                  ...storm,
                  mainIdeas: {
                    ...storm.mainIdeas,
                    [ideaId]: {
                      ...mainIdea,
                      entries: [...mainIdea.entries, nextEntry],
                    },
                  },
                },
              },
            };
          }

          return state;
        });
      },

      setStormCategory: (stormId, category) => {
        set((state) => {
          const storm = state.storms[stormId];
          if (!storm) return state;

          return {
            storms: {
              ...state.storms,
              [stormId]: {
                ...storm,
                category,
              },
            },
          };
        });
      },

      setStormState: (stormId, nextState) => {
        set((state) => {
          const storm = state.storms[stormId];
          if (!storm) return state;

          return {
            storms: {
              ...state.storms,
              [stormId]: {
                ...storm,
                state: nextState,
              },
            },
          };
        });
      },

      updateMainIdea: (stormId, mainIdeaId, updates) => {
        set((state) => {
          const storm = state.storms[stormId];
          const mainIdea = storm?.mainIdeas[mainIdeaId];
          if (!storm || !mainIdea) return state;

          const nextType = updates.type ?? mainIdea.type;
          const normalizedTypeData = updates.typeData !== undefined
            ? normalizeIdeaTypeData(nextType, updates.typeData)
            : undefined;

          return {
            storms: {
              ...state.storms,
              [stormId]: {
                ...storm,
                mainIdeas: {
                  ...storm.mainIdeas,
                  [mainIdeaId]: {
                    ...mainIdea,
                    ...(updates.title !== undefined ? { title: updates.title } : {}),
                    ...(updates.state !== undefined ? { state: updates.state } : {}),
                    ...(updates.type !== undefined ? { type: updates.type } : {}),
                    ...(updates.customProperties !== undefined ? { customProperties: updates.customProperties } : {}),
                    ...(normalizedTypeData ? { typeData: normalizedTypeData } : {}),
                  },
                },
              },
            },
          };
        });
      },

      updateIdea: (stormId, ideaId, updates) => {
        set((state) => {
          const storm = state.storms[stormId];
          const idea = storm?.ideas[ideaId];
          if (!storm || !idea || !stormContainsIdea(storm, ideaId)) return state;

          const nextType = updates.type ?? idea.type;
          const normalizedTypeData = updates.typeData !== undefined
            ? normalizeIdeaTypeData(nextType, updates.typeData)
            : undefined;

          return {
            storms: {
              ...state.storms,
              [stormId]: {
                ...storm,
                ideas: {
                  ...storm.ideas,
                  [ideaId]: {
                    ...idea,
                    ...(updates.title !== undefined ? { title: updates.title } : {}),
                    ...(updates.state !== undefined ? { state: updates.state } : {}),
                    ...(updates.type !== undefined ? { type: updates.type } : {}),
                    ...(updates.customProperties !== undefined ? { customProperties: updates.customProperties } : {}),
                    ...(normalizedTypeData ? { typeData: normalizedTypeData } : {}),
                  },
                },
              },
            },
          };
        });
      },

      updateEntry: (stormId, entryId, updates) => {
        set((state) => {
          const storm = state.storms[stormId];
          if (!storm) return state;

          for (const [mainIdeaId, mainIdea] of Object.entries(storm.mainIdeas)) {
            const result = updateEntryInList(mainIdea.entries, entryId, updates);
            if (!result.found) continue;

            return {
              storms: {
                ...state.storms,
                [stormId]: {
                  ...storm,
                  mainIdeas: {
                    ...storm.mainIdeas,
                    [mainIdeaId]: {
                      ...mainIdea,
                      entries: result.entries,
                    },
                  },
                },
              },
            };
          }

          for (const [ideaId, idea] of Object.entries(storm.ideas)) {
            const result = updateEntryInList(idea.entries, entryId, updates);
            if (!result.found) continue;

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
          }

          return state;
        });
      },

      renameMainIdea: (stormId, mainIdeaId, name) => {
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
                    title: name,
                  },
                },
              },
            },
          };
        });
      },

      renameIdea: (stormId, ideaId, name) => {
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
                    title: name,
                  },
                },
              },
            },
          };
        });
      },

      spendBrainWidth: (stormId, amount) => {
        let spent = false;

        set((state) => {
          const storm = state.storms[stormId];
          if (!storm || storm.brainWidthPoints - storm.brainWidthStaked < amount) {
            return state;
          }

          spent = true;
          return {
            storms: {
              ...state.storms,
              [stormId]: {
                ...storm,
                brainWidthPoints: storm.brainWidthPoints - amount,
              },
            },
          };
        });

        return spent;
      },

      raiseBrainWidthCap: (stormId, amount) => {
        set((state) => {
          const storm = state.storms[stormId];
          if (!storm) return state;

          return {
            storms: {
              ...state.storms,
              [stormId]: {
                ...storm,
                brainWidthCap: storm.brainWidthCap + amount,
                brainWidthPoints: storm.brainWidthPoints + amount,
              },
            },
          };
        });
      },

      regenBrainWidth: (stormId) => {
        set((state) => {
          const storm = state.storms[stormId];
          const now = Date.now();
          if (!storm || now - storm.lastRegenAt < 86400000) return state;

          return {
            storms: {
              ...state.storms,
              [stormId]: {
                ...storm,
                brainWidthPoints: Math.min(storm.brainWidthPoints + 100, storm.brainWidthCap),
                lastRegenAt: now,
              },
            },
          };
        });
      },

      stakeBrainWidth: (stormId, amount) => {
        let staked = false;

        set((state) => {
          const storm = state.storms[stormId];
          if (!storm || storm.brainWidthPoints - storm.brainWidthStaked < amount) {
            return state;
          }

          staked = true;
          return {
            storms: {
              ...state.storms,
              [stormId]: {
                ...storm,
                brainWidthStaked: storm.brainWidthStaked + amount,
              },
            },
          };
        });

        return staked;
      },

      unstakeBrainWidth: (stormId, amount, won) => {
        set((state) => {
          const storm = state.storms[stormId];
          if (!storm) return state;

          const nextStaked = Math.max(0, storm.brainWidthStaked - amount);
          return {
            storms: {
              ...state.storms,
              [stormId]: {
                ...storm,
                brainWidthStaked: nextStaked,
                brainWidthCap: won ? storm.brainWidthCap + amount : storm.brainWidthCap,
                brainWidthPoints: won ? storm.brainWidthPoints + amount : storm.brainWidthPoints,
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
      version: 3,
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
