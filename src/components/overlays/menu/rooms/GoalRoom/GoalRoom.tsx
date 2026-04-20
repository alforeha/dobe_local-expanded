import { useEffect, useMemo, useState } from 'react';
import { useProgressionStore } from '../../../../../stores/useProgressionStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import { autoCompleteSystemTask } from '../../../../../engine/resourceEngine';
import { GoalRoomHeader } from './GoalRoomHeader';
import { ChooseYourPath } from './ChooseYourPath';
import { GoalActPage } from './GoalActPage';
import { GoalChainPage } from './GoalChainPage';
import { GoalQuestPage } from './GoalQuestPage';
import { GoalProgressBar, GoalSection, GoalStateBadge } from './GoalEditorShared';
import {
  createBlankAct,
  getActActiveChain,
  getChainProgressPercent,
  getQuestDisplayState,
  getQuestTaskTemplates,
  getQuestTimelySummary,
  normalizeActForSave,
} from './goalEditorUtils';
import type { GoalPage } from './goalEditorUtils';
import { STARTER_ACT_IDS } from '../../../../../coach/StarterQuestLibrary';
import type { Act } from '../../../../../types';
import { IconDisplay } from '../../../../shared/IconDisplay';

type HabitatFilter = 'habitats' | 'adventures';

function GoalListActRow({
  act,
  canEdit,
  isLocked,
  onOpen,
  onOpenChain,
  onOpenQuest,
}: {
  act: Act;
  canEdit: boolean;
  isLocked: boolean;
  onOpen: (act: Act) => void;
  onOpenChain: (act: Act, chainIdx: number) => void;
  onOpenQuest: (act: Act, chainIdx: number, questIdx: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [expandedChainIdx, setExpandedChainIdx] = useState<number | null>(null);
  const activeChain = getActActiveChain(act).chain;
  const activeProgress = activeChain ? getChainProgressPercent(activeChain) : 0;
  const scheduleTaskTemplates = useScheduleStore((state) => state.taskTemplates);
  const scheduleTasks = useScheduleStore((state) => state.tasks);

  const completedTaskTemplateRefs = new Set(
    Object.values(scheduleTasks)
      .filter((task) => task.completionState === 'complete')
      .map((task) => task.templateRef),
  );

  function getCompletionNeededLabel(targetValue: number) {
    const safeTarget = Math.max(1, targetValue || 1);
    return `${safeTarget} completion${safeTarget === 1 ? '' : 's'} needed`;
  }

  return (
    <div className={`overflow-hidden rounded-2xl border ${isLocked ? 'border-gray-200 opacity-60 dark:border-gray-800' : 'border-gray-200 dark:border-gray-700'}`}>
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <IconDisplay iconKey={act.icon} size={20} className="h-5 w-5 shrink-0 object-contain" alt="" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{act.name}</p>
            {act.owner === 'coach' ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                Read-only
              </span>
            ) : null}
          </div>
          <div className="mt-2">
            <GoalProgressBar value={activeProgress} />
          </div>
        </div>
        <span className="text-xs text-gray-400">{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded ? (
        <div className="space-y-3 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <div className="space-y-2">
            {act.chains.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No chains yet.</p>
            ) : (
              act.chains.map((chain, chainIdx) => (
                <div key={`${chain.name}-${chainIdx}`} className="overflow-hidden rounded-xl bg-gray-50 dark:bg-gray-900">
                  <button
                    type="button"
                    onClick={() => setExpandedChainIdx((current) => current === chainIdx ? null : chainIdx)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left"
                  >
                    <IconDisplay iconKey={chain.icon} size={16} className="h-4 w-4 shrink-0 object-contain" alt="" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                          {chain.name || `Chain ${chainIdx + 1}`}
                        </p>
                        <GoalStateBadge state={chain.completionState} />
                      </div>
                      <div className="mt-2">
                        <GoalProgressBar value={getChainProgressPercent(chain)} />
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">
                      {expandedChainIdx === chainIdx ? 'Hide' : 'Show'}
                    </span>
                  </button>
                  {expandedChainIdx === chainIdx ? (
                    <div className="space-y-2 border-t border-gray-200 px-3 py-3 text-sm dark:border-gray-700">
                      <p className="text-gray-600 dark:text-gray-300">
                        {chain.description || 'No description yet.'}
                      </p>
                      {chain.quests.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No quests yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {chain.quests.map((quest, questIdx) => (
                            <button
                              key={`${quest.name}-${questIdx}`}
                              type="button"
                              onClick={() => onOpenQuest(act, chainIdx, questIdx)}
                              className="w-full rounded-xl border border-gray-200 px-3 py-3 text-left transition-colors hover:bg-white dark:border-gray-700 dark:hover:bg-gray-800"
                            >
                              {(() => {
                                const displayState = getQuestDisplayState(chain, questIdx);
                                const isUnlocked = displayState !== 'pending';
                                const taskTemplatePills = getQuestTaskTemplates(quest, scheduleTaskTemplates);
                                return (
                                  <>
                              <div className="flex items-center gap-2">
                                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                                  {quest.name || `Quest ${questIdx + 1}`}
                                </p>
                                <span className="text-xs text-gray-500 dark:text-gray-400">{quest.progressPercent}%</span>
                                <GoalStateBadge state={displayState} />
                              </div>
                              <div className="mt-2">
                                <GoalProgressBar value={quest.progressPercent} />
                              </div>
                              <p className="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
                                {quest.description || 'No description yet.'}
                              </p>
                              {taskTemplatePills.length > 0 || quest.measurable.resourceRef ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {taskTemplatePills.map(({ ref, template }) => (
                                    <div
                                      key={ref}
                                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${
                                        isUnlocked && completedTaskTemplateRefs.has(ref)
                                          ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                          : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
                                      }`}
                                    >
                                      <IconDisplay iconKey={template?.icon ?? 'task'} size={14} className="h-3.5 w-3.5 object-contain" alt="" />
                                      <span>{template?.name ?? ref}</span>
                                    </div>
                                  ))}
                                  {quest.measurable.resourceRef ? (
                                    <div
                                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${
                                        isUnlocked && quest.progressPercent > 0
                                          ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                          : 'bg-sky-50 text-sky-800 dark:bg-sky-950/30 dark:text-sky-200'
                                      }`}
                                    >
                                      <IconDisplay iconKey="resource" size={14} className="h-3.5 w-3.5 object-contain" alt="" />
                                      <span>{quest.measurable.resourceRef}</span>
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
                                <span>{getCompletionNeededLabel(quest.specific.targetValue)}</span>
                                <span className="truncate text-right">{getQuestTimelySummary(quest)}</span>
                              </div>
                                  </>
                                );
                              })()}
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenChain(act, chainIdx)}
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        Open Chain
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpen(act)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {canEdit ? 'Edit' : 'View'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function GoalRoom() {
  const [habitatFilter, setHabitatFilter] = useState<Set<HabitatFilter>>(
    new Set(['habitats', 'adventures']),
  );
  const [pageStack, setPageStack] = useState<GoalPage[]>([{ type: 'list' }]);
  const [draftActs, setDraftActs] = useState<Record<string, Act>>({});
  const [newActDraftId, setNewActDraftId] = useState<string | null>(null);

  const acts = useProgressionStore((s) => s.acts);
  const setAct = useProgressionStore((s) => s.setAct);
  const user = useUserStore((s) => s.user);
  const currentPage = pageStack[pageStack.length - 1] ?? { type: 'list' as const };

  useEffect(() => {
    autoCompleteSystemTask('task-sys-open-adventures');
  }, []);

  const habitatActs = useMemo(
    () => Object.values(acts).filter((act) => act.owner !== 'coach' && (act.habitat ?? 'habitats') === 'habitats'),
    [acts],
  );

  const adventureActs = useMemo(() => {
    return Object.values(acts).filter((act) => act.owner === 'coach');
  }, [acts]);

  function pushPage(page: GoalPage) {
    setPageStack((current) => [...current, page]);
  }

  function popPage() {
    setPageStack((current) => current.length > 1 ? current.slice(0, -1) : current);
  }

  function toggleFilter(h: HabitatFilter) {
    setHabitatFilter((prev) => {
      const next = new Set(prev);
      if (next.has(h)) {
        if (next.size === 1) return prev;
        next.delete(h);
      } else {
        next.add(h);
      }
      return next;
    });
  }

  function updateDraftAct(act: Act) {
    setDraftActs((current) => ({ ...current, [act.id]: normalizeActForSave(act) }));
  }

  function removeDraftAct(actId: string) {
    setDraftActs((current) => {
      const next = { ...current };
      delete next[actId];
      return next;
    });
  }

  function getDraftAct(actId: string): Act | null {
    if (draftActs[actId]) return draftActs[actId];
    return acts[actId] ?? null;
  }

  function beginNewAct() {
    const draft = createBlankAct(user?.system.id ?? 'user');
    updateDraftAct(draft);
    setNewActDraftId(draft.id);
    pushPage({ type: 'act', actId: null });
  }

  function beginEditAct(act: Act) {
    updateDraftAct(act);
    pushPage({ type: 'act', actId: act.id });
  }

  function beginOpenChain(act: Act, chainIdx: number) {
    updateDraftAct(act);
    pushPage({ type: 'chain', actId: act.id, chainIdx });
  }

  function beginOpenQuest(act: Act, chainIdx: number, questIdx: number) {
    updateDraftAct(act);
    pushPage({ type: 'quest', actId: act.id, chainIdx, questIdx });
  }

  function resolvePageAct(page: GoalPage): Act | null {
    if (page.type === 'list') return null;
    if (page.type === 'act' && page.actId === null) {
      return newActDraftId ? getDraftAct(newActDraftId) : null;
    }
    if (page.type === 'act') return page.actId ? getDraftAct(page.actId) : null;
    return getDraftAct(page.actId);
  }

  function saveActDraft(act: Act) {
    const normalized = normalizeActForSave(act);
    setAct(normalized);
    updateDraftAct(normalized);
    if (newActDraftId === normalized.id) setNewActDraftId(null);
    popPage();
  }

  function cancelActDraft(page: GoalPage) {
    const act = resolvePageAct(page);
    if (!act) {
      popPage();
      return;
    }
    if (newActDraftId === act.id) {
      removeDraftAct(act.id);
      setNewActDraftId(null);
    } else if (acts[act.id]) {
      updateDraftAct(acts[act.id]);
    }
    popPage();
  }

  const showList = currentPage.type === 'list';
  const showChooseYourPath = showList && habitatFilter.has('adventures') && !!acts[STARTER_ACT_IDS.daily];

  const currentAct = resolvePageAct(currentPage);

  return (
    <div className="flex h-full flex-col">
      {showList ? (
        <>
          <GoalRoomHeader
            habitatFilter={habitatFilter}
            onToggleFilter={toggleFilter}
            onAdd={beginNewAct}
          />

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="mx-auto flex max-w-5xl flex-col gap-4">
              {habitatFilter.has('habitats') ? (
                <GoalSection title="Goal Hubs">
                  {habitatActs.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No habitat acts yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {habitatActs.map((act) => (
                        <GoalListActRow
                          key={act.id}
                          act={act}
                          canEdit
                          isLocked={false}
                          onOpen={beginEditAct}
                          onOpenChain={beginOpenChain}
                          onOpenQuest={beginOpenQuest}
                        />
                      ))}
                    </div>
                  )}
                </GoalSection>
              ) : null}

              {habitatFilter.has('adventures') ? (
                <GoalSection title="Adventures">
                  <div className="space-y-3">
                    {adventureActs.map((act) => {
                      return (
                        <GoalListActRow
                          key={act.id}
                          act={act}
                          canEdit={false}
                          isLocked={act.completionState !== 'active'}
                          onOpen={beginEditAct}
                          onOpenChain={beginOpenChain}
                          onOpenQuest={beginOpenQuest}
                        />
                      );
                    })}
                  </div>
                </GoalSection>
              ) : null}

              {showChooseYourPath ? <ChooseYourPath /> : null}
            </div>
          </div>
        </>
      ) : null}

      {currentPage.type === 'act' && currentAct ? (
        <GoalActPage
          act={currentAct}
          readOnly={currentAct.owner === 'coach'}
          onBack={popPage}
          onCancel={() => cancelActDraft(currentPage)}
          onSave={saveActDraft}
          onOpenChain={(updatedAct, chainIdx) => {
            updateDraftAct(updatedAct);
            pushPage({
              type: 'chain',
              actId: updatedAct.id,
              chainIdx,
            });
          }}
          onOpenQuest={(updatedAct, chainIdx, questIdx) => {
            updateDraftAct(updatedAct);
            pushPage({
              type: 'quest',
              actId: updatedAct.id,
              chainIdx,
              questIdx,
            });
          }}
        />
      ) : null}

      {currentPage.type === 'chain' && currentAct ? (
        <GoalChainPage
          act={currentAct}
          chainIdx={currentPage.chainIdx}
          readOnly={currentAct.owner === 'coach'}
          onBack={popPage}
          onSave={(updatedAct) => {
            updateDraftAct(updatedAct);
            popPage();
          }}
          onOpenQuest={(updatedAct, chainIdx, questIdx) => {
            updateDraftAct(updatedAct);
            pushPage({
              type: 'quest',
              actId: updatedAct.id,
              chainIdx,
              questIdx,
            });
          }}
        />
      ) : null}

      {currentPage.type === 'quest' && currentAct ? (
        <GoalQuestPage
          act={currentAct}
          chainIdx={currentPage.chainIdx}
          questIdx={currentPage.questIdx}
          readOnly={currentAct.owner === 'coach'}
          onBack={popPage}
          onSave={(updatedAct) => {
            updateDraftAct(updatedAct);
            popPage();
          }}
        />
      ) : null}
    </div>
  );
}
