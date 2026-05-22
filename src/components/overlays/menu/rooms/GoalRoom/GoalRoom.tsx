import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProgressionStore } from '../../../../../stores/useProgressionStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import { autoCompleteSystemTask } from '../../../../../engine/resourceEngine';
import { fireInitialIntervalMarkers, generateSmarterMarkers } from '../../../../../engine/markerEngine';
import { GoalCanvas } from './GoalCanvas';
import { GoalInspectorDrawer } from './GoalInspectorDrawer';
import type { DrawerView } from './GoalInspectorDrawer';
import { ChooseYourPath } from './ChooseYourPath';
import { GoalActPage } from './GoalActPage';
import { GoalChainPage } from './GoalChainPage';
import { GoalQuestPage } from './GoalQuestPage';
import { GoalProgressBar, GoalSection, GoalStateBadge } from './GoalEditorShared';
import {
  createBlankAspiration,
  createBlankSmarter,
  getAspirationActiveWoop,
  getWoopProgressPercent,
  getQuestDisplayState,
  getQuestTaskTemplates,
  getQuestTimelySummary,
  normalizeAspirationForSave,
} from './goalEditorUtils';
import type { GoalPage } from './goalEditorUtils';
import { STARTER_ASPIRATION_IDS } from '../../../../../coach/StarterQuestLibrary';
import type { Aspiration, NestedAct, Smarter, Woop } from '../../../../../types';
import type { LogInputFields } from '../../../../../types/taskTemplate';
import { IconDisplay } from '../../../../shared/IconDisplay';

type HabitatFilter = 'habitats' | 'adventures';

interface GoalRoomProps {
  onNavHiddenChange: (hidden: boolean) => void;
}

function GoalListActRow({
  act,
  canEdit,
  isLocked,
  onOpen,
  onOpenChain,
  onOpenQuest,
}: {
  act: Aspiration;
  canEdit: boolean;
  isLocked: boolean;
  onOpen: (act: Aspiration) => void;
  onOpenChain: (act: Aspiration, chainIdx: number) => void;
  onOpenQuest: (act: Aspiration, chainIdx: number, questIdx: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [expandedChainIdx, setExpandedChainIdx] = useState<number | null>(null);
  const activeChain = getAspirationActiveWoop(act).woop;
  const activeProgress = activeChain ? getWoopProgressPercent(activeChain) : 0;
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
            {act.woops.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No woops yet.</p>
            ) : (
              act.woops.map((chain, chainIdx) => (
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
                          {chain.name || `Woop ${chainIdx + 1}`}
                        </p>
                        <GoalStateBadge state={chain.completionState} />
                      </div>
                      <div className="mt-2">
                        <GoalProgressBar value={getWoopProgressPercent(chain)} />
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
                      {chain.smarters.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No smarters yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {chain.smarters.map((quest, questIdx) => (
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
                                  {quest.name || `Smarter ${questIdx + 1}`}
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
                        Open Woop
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

export function GoalRoom({ onNavHiddenChange }: GoalRoomProps) {
  const [habitatFilter, setHabitatFilter] = useState<Set<HabitatFilter>>(
    new Set(['habitats', 'adventures']),
  );
  const [pageStack, setPageStack] = useState<GoalPage[]>([{ type: 'list' }]);
  const [draftActs, setDraftActs] = useState<Record<string, Aspiration>>({});
  const [newActDraftId, setNewActDraftId] = useState<string | null>(null);
  const [drawerView, setDrawerView] = useState<DrawerView>({ level: 'none' });
  const [drawerEditMode, setDrawerEditMode] = useState(false);
  const [aspirationDraft, setAspirationDraft] = useState<Aspiration | null>(null);
  const [woopDraft, setWoopDraft] = useState<{ aspirationId: string; woopIdx: number | null; woop: Woop } | null>(null);
  const [smarterDraft, setSmarterDraft] = useState<{ aspirationId: string; woopIdx: number; smarterIdx: number | null; smarter: Smarter } | null>(null);
  const [isActView, setIsActView] = useState(false);
  const clearCanvasFocusRef = useRef<((scope: 'planet' | 'all') => void) | null>(null);
  const selectAspirationFromDrawerRef = useRef<((id: string) => void) | null>(null);
  const setSelectedWoopRef = useRef<((idx: number | null) => void) | null>(null);
  const setSelectedSmarterRef = useRef<((idx: number | null) => void) | null>(null);
  const editSnapshotRef = useRef<Aspiration | null>(null);
  const woopSnapshotRef = useRef<Woop | null>(null);
  const woopInsertIndexRef = useRef<number | null>(null);
  const drawerViewRef = useRef<DrawerView>(drawerView);
  const drawerViewLevelRef = useRef(drawerView.level);
  const drawerEditModeRef = useRef(drawerEditMode);

  const aspirations = useProgressionStore((s) => s.aspirations);
  const setAspiration = useProgressionStore((s) => s.setAspiration);
  const removeAspiration = useProgressionStore((s) => s.removeAspiration);
  const user = useUserStore((s) => s.user);
  const currentPage = pageStack[pageStack.length - 1] ?? { type: 'list' as const };

  drawerViewRef.current = drawerView;
  drawerEditModeRef.current = drawerEditMode;

  useEffect(() => {
    autoCompleteSystemTask('task-sys-open-adventures');
  }, []);

  useEffect(() => {
    drawerViewLevelRef.current = drawerView.level;
    if (drawerView.level !== 'smarter') {
      setIsActView(false);
    }
  }, [drawerView.level]);

  useEffect(() => {
    onNavHiddenChange(true);
    return () => onNavHiddenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const habitatActs = useMemo(
    () => Object.values(aspirations).filter((act) => act.owner !== 'coach' && (act.habitat ?? 'habitats') === 'habitats'),
    [aspirations],
  );

  const userAspirations = useMemo(
    () => Object.values(aspirations).filter((act) => act.owner !== 'coach'),
    [aspirations],
  );

  const adventureActs = useMemo(() => {
    return Object.values(aspirations).filter((act) => act.owner === 'coach');
  }, [aspirations]);

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

  function updateDraftAct(act: Aspiration) {
    setDraftActs((current) => ({ ...current, [act.id]: normalizeAspirationForSave(act) }));
  }

  function removeDraftAct(actId: string) {
    setDraftActs((current) => {
      const next = { ...current };
      delete next[actId];
      return next;
    });
  }

  function getDraftAct(actId: string): Aspiration | null {
    if (draftActs[actId]) return draftActs[actId];
    return aspirations[actId] ?? null;
  }

  function beginNewAct() {
    const draft = createBlankAspiration(user?.system.id ?? 'user');
    updateDraftAct(draft);
    setNewActDraftId(draft.id);
    pushPage({ type: 'aspiration', aspirationId: null });
  }

  function beginEditAct(act: Aspiration) {
    updateDraftAct(act);
    pushPage({ type: 'aspiration', aspirationId: act.id });
  }

  function beginOpenChain(act: Aspiration, chainIdx: number) {
    updateDraftAct(act);
    pushPage({ type: 'woop', aspirationId: act.id, woopIdx: chainIdx });
  }

  function beginOpenQuest(act: Aspiration, chainIdx: number, questIdx: number) {
    updateDraftAct(act);
    pushPage({ type: 'smarter', aspirationId: act.id, woopIdx: chainIdx, smarterIdx: questIdx });
  }

  function resolvePageAct(page: GoalPage): Aspiration | null {
    if (page.type === 'list') return null;
    if (page.type === 'aspiration' && page.aspirationId === null) {
      return newActDraftId ? getDraftAct(newActDraftId) : null;
    }
    if (page.type === 'aspiration') return page.aspirationId ? getDraftAct(page.aspirationId) : null;
    return getDraftAct(page.aspirationId);
  }

  function saveActDraft(act: Aspiration) {
    const normalized = normalizeAspirationForSave(act);
    setAspiration(normalized);
    updateDraftAct(normalized);
    if (newActDraftId === normalized.id) setNewActDraftId(null);
    popPage();
  }

  function handleSaveAspiration(updated: Aspiration) {
    setAspiration(updated);
    setAspirationDraft(null);
    if (drawerView.level === 'aspiration') {
      setDrawerView({ ...drawerView, aspiration: updated });
    }
    editSnapshotRef.current = null;
  }

  function handleLiveUpdateAspiration(updated: Aspiration) {
    setAspirationDraft(updated);
    if (drawerView.level === 'aspiration') {
      setDrawerView({ ...drawerView, aspiration: updated });
    }
  }

  function handleCancelEdit() {
    if (drawerView.level === 'woop-edit') {
      handleCancelWoopEdit();
      return;
    }

    if (drawerView.level === 'smarter-edit') {
      handleCancelSmarterEdit();
      return;
    }

    if (drawerView.level === 'aspiration') {
      setAspirationDraft(null);
      setDrawerEditMode(false);

      if (editSnapshotRef.current === null) {
        setDrawerView({ level: 'orbit', orbit: 'user' });
      } else {
        setDrawerView({ ...drawerView, aspiration: editSnapshotRef.current });
        editSnapshotRef.current = null;
      }
      return;
    }

    editSnapshotRef.current = null;
    setDrawerEditMode(false);
  }

  function buildAspirationWithWoop(aspiration: Aspiration, updated: Woop, woopIdx: number | null): Aspiration {
    const newWoops = [...aspiration.woops];

    if (woopIdx !== null) {
      newWoops[woopIdx] = updated;
    } else {
      const insertIndex = woopInsertIndexRef.current ?? newWoops.length;
      newWoops[insertIndex] = updated;
    }

    return { ...aspiration, woops: newWoops };
  }

  function handleAddWoop() {
    if (drawerView.level !== 'aspiration') return;

    const asp = drawerView.aspiration;
    woopSnapshotRef.current = null;
    woopInsertIndexRef.current = asp.woops.length;
    selectAspirationFromDrawerRef.current?.(asp.id);
    setDrawerView({
      level: 'woop-edit',
      orbit: drawerView.orbit,
      aspiration: asp,
      woopIdx: null,
    });
  }

  function handleSelectWoop(woopIdx: number) {
    if (drawerView.level !== 'aspiration') return;

    const asp = drawerView.aspiration;
    setDrawerView({ level: 'woop', orbit: drawerView.orbit, aspiration: asp, woopIdx });
    setSelectedSmarterRef.current?.(null);
    setSelectedWoopRef.current?.(woopIdx);
  }

  function handleEditWoop(woopIdx: number) {
    if (drawerView.level !== 'aspiration' && drawerView.level !== 'woop') return;

    woopSnapshotRef.current = drawerView.aspiration.woops[woopIdx] ?? null;
    woopInsertIndexRef.current = null;
    setDrawerView({
      level: 'woop-edit',
      orbit: drawerView.orbit,
      aspiration: drawerView.aspiration,
      woopIdx,
    });
    setSelectedWoopRef.current?.(woopIdx);
  }

  function handleDeleteWoop(woopIdx: number) {
    if (drawerView.level !== 'aspiration' && drawerView.level !== 'woop') return;

    const asp = drawerView.aspiration;
    const newWoops = asp.woops.filter((_, i) => i !== woopIdx);
    const updatedAsp = { ...asp, woops: newWoops };
    setAspiration(updatedAsp);
    setDrawerView({ level: 'aspiration', orbit: drawerView.orbit, aspiration: updatedAsp });
    setSelectedSmarterRef.current?.(null);
    setSelectedWoopRef.current?.(null);
  }

  function handleSaveWoop(updated: Woop, woopIdx: number | null) {
    if (drawerView.level !== 'woop-edit') return;

    const updatedAsp = buildAspirationWithWoop(drawerView.aspiration, updated, woopIdx);
    setAspiration(updatedAsp);
    setWoopDraft(null);
    setDrawerView({ level: 'aspiration', orbit: drawerView.orbit, aspiration: updatedAsp });
    setSelectedWoopRef.current?.(null);
    woopSnapshotRef.current = null;
    woopInsertIndexRef.current = null;
  }

  function handleCancelWoopEdit() {
    if (drawerView.level !== 'woop-edit') return;

    const restoredWoops = [...drawerView.aspiration.woops];
    const insertIndex = woopInsertIndexRef.current;

    if (drawerView.woopIdx !== null && woopSnapshotRef.current) {
      restoredWoops[drawerView.woopIdx] = woopSnapshotRef.current;
    } else if (drawerView.woopIdx === null && insertIndex !== null && restoredWoops.length > insertIndex) {
      restoredWoops.splice(insertIndex, 1);
    }

    const restoredAsp = { ...drawerView.aspiration, woops: restoredWoops };
    setAspiration(restoredAsp);
    setWoopDraft(null);
    setDrawerView({
      level: 'aspiration',
      orbit: drawerView.orbit,
      aspiration: restoredAsp,
    });
    setSelectedWoopRef.current?.(null);
    woopSnapshotRef.current = null;
    woopInsertIndexRef.current = null;
  }

  function handleSelectSmarter(smarterIdx: number) {
    if (drawerView.level !== 'woop') return;

    setDrawerView({
      level: 'smarter',
      orbit: drawerView.orbit,
      aspiration: drawerView.aspiration,
      woopIdx: drawerView.woopIdx,
      smarterIdx,
    });
    setSelectedSmarterRef.current?.(smarterIdx);
  }

  function handleAddSmarter() {
    if (drawerView.level !== 'woop') return;

    const blank = createBlankSmarter();
    setSmarterDraft({
      aspirationId: drawerView.aspiration.id,
      woopIdx: drawerView.woopIdx,
      smarterIdx: null,
      smarter: blank,
    });
    setDrawerView({
      level: 'smarter-edit',
      orbit: drawerView.orbit,
      aspiration: drawerView.aspiration,
      woopIdx: drawerView.woopIdx,
      smarterIdx: null,
    });
  }

  function handleAutoSeedSmarterPlans() {
    if (drawerView.level !== 'woop') return;
    const woop = drawerView.aspiration.woops[drawerView.woopIdx];
    if (!woop) return;

    const resolvedOutcomes = new Set(
      woop.smarters
        .filter(s => (s.relevant as Record<string, string>).resolvesType === 'outcome')
        .map(s => (s.relevant as Record<string, number>).resolvesIdx)
    );
    const resolvedObstacles = new Set(
      woop.smarters
        .filter(s => (s.relevant as Record<string, string>).resolvesType === 'obstacle')
        .map(s => (s.relevant as Record<string, number>).resolvesIdx)
    );

    const newSmarters: Smarter[] = [];

    woop.outcome.forEach((outcome, i) => {
      if (resolvedOutcomes.has(i)) return;
      const blank = createBlankSmarter();
      newSmarters.push({
        ...blank,
        name: outcome.slice(0, 60) || `Outcome ${i + 1} Plan`,
        relevant: { resolvesType: 'outcome', resolvesIdx: i },
      });
    });

    woop.obstacle.forEach((obstacle, i) => {
      if (resolvedObstacles.has(i)) return;
      const blank = createBlankSmarter();
      newSmarters.push({
        ...blank,
        name: obstacle.slice(0, 60) || `Obstacle ${i + 1} Plan`,
        relevant: { resolvesType: 'obstacle', resolvesIdx: i },
      });
    });

    if (newSmarters.length === 0) return;

    const asp = drawerView.aspiration;
    const newWoops = asp.woops.map((w, i) =>
      i === drawerView.woopIdx
        ? { ...w, smarters: [...w.smarters, ...newSmarters] }
        : w
    );
    const updatedAsp = { ...asp, woops: newWoops };
    setAspiration(updatedAsp);
    setDrawerView({ ...drawerView, aspiration: updatedAsp });
  }

  function handleEditSmarter(smarterIdx: number) {
    if (drawerView.level !== 'smarter' && drawerView.level !== 'woop') return;

    setDrawerView({
      level: 'smarter-edit',
      orbit: drawerView.orbit,
      aspiration: drawerView.aspiration,
      woopIdx: drawerView.woopIdx,
      smarterIdx,
    });
    setSelectedSmarterRef.current?.(smarterIdx);
  }

  function handleDeleteSmarter(smarterIdx: number) {
    if (drawerView.level !== 'smarter' && drawerView.level !== 'woop') return;

    const asp = drawerView.aspiration;
    const woop = asp.woops[drawerView.woopIdx];
    if (!woop) return;

    const newSmarters = woop.smarters.filter((_, i) => i !== smarterIdx);
    const newWoops = asp.woops.map((w, i) => i === drawerView.woopIdx ? { ...w, smarters: newSmarters } : w);
    const updatedAsp = { ...asp, woops: newWoops };
    setAspiration(updatedAsp);
    setDrawerView({ level: 'woop', orbit: drawerView.orbit, aspiration: updatedAsp, woopIdx: drawerView.woopIdx });
    setSelectedSmarterRef.current?.(null);
  }

  function createCheckinTemplate(
    smarter: Smarter,
    aspirationId: string,
    woopIdx: number,
    smarterIdx: number,
  ): string {
    const key = `goal-checkin-${aspirationId}-${woopIdx}-${smarterIdx}`;
    const trackedCount = smarter.measurable.taskTemplateRefs?.length ?? 0;
    const template = {
      id: key,
      isCustom: false,
      isSystem: true,
      name: `Check in: ${smarter.name || 'SMARTER'}`,
      description: `Goal check-in for ${smarter.name}. Target: ${smarter.specific.targetValue}${smarter.specific.unit ? ' ' + smarter.specific.unit : ''}. Tracking ${trackedCount} task${trackedCount !== 1 ? 's' : ''}.`,
      icon: smarter.icon || 'quest',
      taskType: 'LOG' as const,
      inputFields: {
        prompt: `Log your current total toward ${smarter.name || 'your goal'}${smarter.specific.unit ? ' (' + smarter.specific.unit + ')' : ''}`,
        unit: smarter.specific.unit ?? null,
        amount: null,
        value: '',
        resourceRef: null,
        logKind: 'goal-checkin',
        currentValue: null,
        newValue: null,
        entryMode: null,
      } as LogInputFields,
      xpAward: { health: 0, strength: 0, agility: 0, defense: 5, charisma: 0, wisdom: 5 },
      xpBonus: 0,
      cooldown: null,
      media: null,
      items: [],
      secondaryTag: null,
    };
    useScheduleStore.getState().setTaskTemplate(key, template);
    return key;
  }

  function handleSaveSmarter(updated: Smarter, smarterIdx: number | null) {
    if (drawerViewLevelRef.current !== 'smarter-edit') return;

    const view = drawerViewRef.current;
    if (view.level !== 'smarter-edit') return;

    const asp = view.aspiration;
    const woop = asp.woops[view.woopIdx];
    if (!woop) return;

    const savedIdx = smarterIdx ?? woop.smarters.length;

    // Generate markers for this smarter if Timely and Measurable are configured
    const checkInRef = createCheckinTemplate(updated, asp.id, view.woopIdx, savedIdx);
    const markers = generateSmarterMarkers(updated, savedIdx, view.woopIdx, asp.id, checkInRef);
    const updatedWithMarkers: Smarter = markers.length > 0
      ? { ...updated, timely: { ...updated.timely, markers } }
      : updated;

    const newSmarters = smarterIdx !== null
      ? woop.smarters.map((s, i) => i === smarterIdx ? updatedWithMarkers : s)
      : [...woop.smarters, updatedWithMarkers];
    const newWoops = asp.woops.map((w, i) =>
      i === view.woopIdx ? { ...w, smarters: newSmarters } : w,
    );
    const updatedAsp = { ...asp, woops: newWoops };
    setAspiration(updatedAsp);
    setSmarterDraft(null);

    // Fire initial markers so first check-in task appears in GTD immediately if due
    if (markers.length > 0) {
      fireInitialIntervalMarkers(asp.id, view.woopIdx);
    }

    setDrawerView({
      level: 'woop',
      orbit: view.orbit,
      aspiration: updatedAsp,
      woopIdx: view.woopIdx,
    });
    setSelectedSmarterRef.current?.(null);
  }

  function handleSaveAct(updatedNestedAct: NestedAct, smarterIdx: number) {
    if (drawerView.level !== 'act-edit') return;

    const asp = drawerView.aspiration;
    const woop = asp.woops[drawerView.woopIdx];
    if (!woop) return;

    const newSmarters = woop.smarters.map((s, i) =>
      i === smarterIdx ? { ...s, nestedAct: updatedNestedAct } : s,
    );
    const newWoops = asp.woops.map((w, i) =>
      i === drawerView.woopIdx ? { ...w, smarters: newSmarters } : w,
    );
    const updatedAsp = { ...asp, woops: newWoops };
    setAspiration(updatedAsp);
    setDrawerView({
      level: 'smarter',
      orbit: drawerView.orbit,
      aspiration: updatedAsp,
      woopIdx: drawerView.woopIdx,
      smarterIdx,
    });
  }

  function handleOpenAct(smarterIdx: number) {
    if (drawerView.level !== 'smarter' && drawerView.level !== 'woop') return;
    setDrawerView({
      level: 'act-edit',
      orbit: drawerView.orbit,
      aspiration: drawerView.aspiration,
      woopIdx: drawerView.woopIdx,
      smarterIdx,
    });
  }

  function handleZoomToAct() {
    setIsActView(true);
  }

  function handleProceedToAct(draft: Smarter, smarterIdx: number | null) {
    if (drawerViewLevelRef.current !== 'smarter-edit') return;

    const view = drawerViewRef.current;
    if (view.level !== 'smarter-edit') return;

    const asp = view.aspiration;
    const woop = asp.woops[view.woopIdx];
    if (!woop) return;

    const savedIdx = smarterIdx ?? woop.smarters.length;

    // Generate markers for this smarter if Timely and Measurable are configured
    const checkInRef = createCheckinTemplate(draft, asp.id, view.woopIdx, savedIdx);
    const markers = generateSmarterMarkers(draft, savedIdx, view.woopIdx, asp.id, checkInRef);
    const draftWithMarkers: Smarter = markers.length > 0
      ? { ...draft, timely: { ...draft.timely, markers } }
      : draft;

    const newSmarters = smarterIdx !== null
      ? woop.smarters.map((s, i) => i === smarterIdx ? draftWithMarkers : s)
      : [...woop.smarters, draftWithMarkers];
    const newWoops = asp.woops.map((w, i) =>
      i === view.woopIdx ? { ...w, smarters: newSmarters } : w,
    );
    const updatedAsp = { ...asp, woops: newWoops };
    setAspiration(updatedAsp);
    setSmarterDraft(null);

    // Fire initial markers so first check-in task appears in GTD immediately if due
    if (markers.length > 0) {
      fireInitialIntervalMarkers(asp.id, view.woopIdx);
    }

    const savedSmarterIdx = smarterIdx ?? newSmarters.length - 1;
    setSelectedSmarterRef.current?.(savedSmarterIdx);
    setDrawerView({
      level: 'act-edit',
      orbit: view.orbit,
      aspiration: updatedAsp,
      woopIdx: view.woopIdx,
      smarterIdx: savedSmarterIdx,
    });
  }

  function handleCancelSmarterEdit() {
    if (drawerView.level !== 'smarter-edit') return;

    setSmarterDraft(null);
    setSelectedSmarterRef.current?.(null);
    setDrawerView({
      level: 'woop',
      orbit: drawerView.orbit,
      aspiration: drawerView.aspiration,
      woopIdx: drawerView.woopIdx,
    });
  }

  const handleDrawerEditModeChange = useCallback((editing: boolean) => {
    const currentView = drawerViewRef.current;
    if (editing && !drawerEditModeRef.current) {
      editSnapshotRef.current = currentView.level === 'aspiration' ? currentView.aspiration : null;
    }
    setDrawerEditMode(editing);
  }, []);

  function handleAddAspiration() {
    const userId = useUserStore.getState().user?.system.id ?? 'user';
    const newAsp = createBlankAspiration(userId);
    editSnapshotRef.current = null;
    setAspirationDraft(newAsp);
    setDrawerView({ level: 'aspiration', orbit: 'user', aspiration: newAsp });
    setDrawerEditMode(true);
  }

  function handleDeleteAspiration(aspirationId: string) {
    removeAspiration(aspirationId);
    setDrawerView({ level: 'orbit', orbit: 'user' });
    setDrawerEditMode(false);
    editSnapshotRef.current = null;
    clearCanvasFocusRef.current?.('planet');
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
    } else if (aspirations[act.id]) {
      updateDraftAct(aspirations[act.id]);
    }
    popPage();
  }

  const showList = currentPage.type === 'list';
  const showChooseYourPath = showList && habitatFilter.has('adventures') && !!aspirations[STARTER_ASPIRATION_IDS.daily];

  const currentAct = resolvePageAct(currentPage);
  const handleFocusedOrbitChange = useCallback((orbit: 'user' | 'system' | null) => {
    const level = drawerViewLevelRef.current;
    if (level === 'woop-edit' || level === 'smarter-edit' || level === 'act-edit') return;
    setSelectedSmarterRef.current?.(null);
    setSelectedWoopRef.current?.(null);
    if (orbit === null) {
      setDrawerView({ level: 'none' });
    } else {
      setDrawerView({ level: 'orbit', orbit });
    }
  }, []);
  const handleSelectedAspirationChange = useCallback((aspiration: Aspiration | null) => {
    const level = drawerViewLevelRef.current;
    if (level === 'woop-edit' || level === 'smarter-edit' || level === 'act-edit') return;
    setSelectedSmarterRef.current?.(null);
    setSelectedWoopRef.current?.(null);
    if (aspiration === null) return;
    const orbit = aspiration.owner === 'coach' ? 'system' : 'user';
    setDrawerView({ level: 'aspiration', orbit, aspiration });
  }, []);
  function handleDrawerBack() {
    if (drawerView.level === 'act-edit') {
      setDrawerView({
        level: 'smarter-edit',
        orbit: drawerView.orbit,
        aspiration: drawerView.aspiration,
        woopIdx: drawerView.woopIdx,
        smarterIdx: drawerView.smarterIdx,
      });
      return;
    }

    if (drawerView.level === 'smarter-edit') {
      handleCancelSmarterEdit();
      return;
    }

    if (drawerView.level === 'woop-edit') {
      handleCancelWoopEdit();
    } else if (drawerView.level === 'smarter') {
      setIsActView(false);
      setDrawerView({
        level: 'woop',
        orbit: drawerView.orbit,
        aspiration: drawerView.aspiration,
        woopIdx: drawerView.woopIdx,
      });
      setSelectedSmarterRef.current?.(null);
    } else if (drawerView.level === 'woop') {
      setDrawerView({ level: 'aspiration', orbit: drawerView.orbit, aspiration: drawerView.aspiration });
      setSelectedSmarterRef.current?.(null);
      setSelectedWoopRef.current?.(null);
    } else if (drawerView.level === 'aspiration') {
      setDrawerView({ level: 'orbit', orbit: drawerView.orbit });
      clearCanvasFocusRef.current?.('planet');
    } else if (drawerView.level === 'orbit') {
      setDrawerView({ level: 'none' });
      clearCanvasFocusRef.current?.('all');
    }
  }
  const drawerOpen = drawerView.level !== 'none';
  const drawerHeightPercent = 55;
  const canvasHeightPercent = drawerOpen ? 100 - drawerHeightPercent : 100;
  const shouldRenderPageStack = false;
  void beginNewAct;
  void toggleFilter;

  const pageStackContent = (
    <>
      {showList ? (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto flex max-w-5xl flex-col gap-4">
            {habitatFilter.has('habitats') ? (
              <GoalSection title="Goal Hubs">
                {habitatActs.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No habitat aspirations yet.</p>
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
      ) : null}

      {currentPage.type === 'aspiration' && currentAct ? (
        <GoalActPage
          act={currentAct}
          readOnly={currentAct.owner === 'coach'}
          onBack={popPage}
          onCancel={() => cancelActDraft(currentPage)}
          onSave={saveActDraft}
          onOpenChain={(updatedAct, chainIdx) => {
            updateDraftAct(updatedAct);
            pushPage({
              type: 'woop',
              aspirationId: updatedAct.id,
              woopIdx: chainIdx,
            });
          }}
          onOpenQuest={(updatedAct, chainIdx, questIdx) => {
            updateDraftAct(updatedAct);
            pushPage({
              type: 'smarter',
              aspirationId: updatedAct.id,
              woopIdx: chainIdx,
              smarterIdx: questIdx,
            });
          }}
        />
      ) : null}

      {currentPage.type === 'woop' && currentAct ? (
        <GoalChainPage
          act={currentAct}
          chainIdx={currentPage.woopIdx}
          readOnly={currentAct.owner === 'coach'}
          onBack={popPage}
          onSave={(updatedAct) => {
            updateDraftAct(updatedAct);
            popPage();
          }}
          onOpenQuest={(updatedAct, chainIdx, questIdx) => {
            updateDraftAct(updatedAct);
            pushPage({
              type: 'smarter',
              aspirationId: updatedAct.id,
              woopIdx: chainIdx,
              smarterIdx: questIdx,
            });
          }}
        />
      ) : null}

      {currentPage.type === 'smarter' && currentAct ? (
        <GoalQuestPage
          act={currentAct}
          chainIdx={currentPage.woopIdx}
          questIdx={currentPage.smarterIdx}
          readOnly={currentAct.owner === 'coach'}
          onBack={popPage}
          onSave={(updatedAct) => {
            updateDraftAct(updatedAct);
            popPage();
          }}
        />
      ) : null}
    </>
  );

  return (
    <div className="relative w-full h-full bg-gray-950 overflow-hidden">
      <div
        className="absolute top-0 left-0 right-0 transition-all duration-300 ease-out"
        style={{ height: `${canvasHeightPercent}%` }}
      >
        <GoalCanvas
          userAspirations={userAspirations}
          adventureAspirations={adventureActs}
          onFocusedOrbitChange={handleFocusedOrbitChange}
          onSelectedAspirationChange={handleSelectedAspirationChange}
          onRegisterClearFocus={(fn) => { clearCanvasFocusRef.current = fn; }}
          onRegisterSelectAspiration={(fn) => { selectAspirationFromDrawerRef.current = fn; }}
          onMoonClick={(woopIdx) => {
            if (drawerView.level === 'aspiration') {
              setDrawerView({
                level: 'woop',
                orbit: drawerView.orbit,
                aspiration: drawerView.aspiration,
                woopIdx,
              });
              setSelectedSmarterRef.current?.(null);
              setSelectedWoopRef.current?.(woopIdx);
            }
          }}
          onSmarterClick={(smarterIdx) => {
            if (drawerView.level === 'woop') {
              setDrawerView({
                level: 'smarter',
                orbit: drawerView.orbit,
                aspiration: drawerView.aspiration,
                woopIdx: drawerView.woopIdx,
                smarterIdx,
              });
              setSelectedSmarterRef.current?.(smarterIdx);
            }
          }}
          onRegisterSetSelectedWoop={(fn) => { setSelectedWoopRef.current = fn; }}
          onRegisterSetSelectedSmarter={(fn) => { setSelectedSmarterRef.current = fn; }}
          aspirationDraft={aspirationDraft}
          woopDraft={woopDraft}
          smarterDraft={smarterDraft}
          isActView={isActView || drawerView.level === 'act-edit'}
          isActEdit={drawerView.level === 'act-edit'}
        />
      </div>
      <GoalInspectorDrawer
        open={drawerOpen}
        view={drawerView}
        onBack={handleDrawerBack}
        userAspirations={userAspirations}
        adventureAspirations={adventureActs}
        onSelectAspiration={(asp) => {
          const orbit = asp.owner === 'coach' ? 'system' : 'user';
          setDrawerView({ level: 'aspiration', orbit, aspiration: asp });
          selectAspirationFromDrawerRef.current?.(asp.id);
          setSelectedSmarterRef.current?.(null);
          setSelectedWoopRef.current?.(null);
        }}
        onAddAspiration={() => {
          handleAddAspiration();
        }}
        editMode={drawerEditMode}
        onEditModeChange={handleDrawerEditModeChange}
        onSaveAspiration={handleSaveAspiration}
        onLiveUpdateAspiration={handleLiveUpdateAspiration}
        onAddWoop={handleAddWoop}
        onSelectWoop={handleSelectWoop}
        onEditWoop={handleEditWoop}
        onDeleteWoop={handleDeleteWoop}
        onSaveWoop={handleSaveWoop}
        onWoopDraftChange={(draft) => {
          const currentView = drawerViewRef.current;
          if (drawerViewLevelRef.current !== 'woop-edit' || currentView.level !== 'woop-edit') return;
          setWoopDraft({ aspirationId: currentView.aspiration.id, woopIdx: currentView.woopIdx, woop: draft });
        }}
        onWoopDraftClear={() => setWoopDraft(null)}
        onAddSmarter={handleAddSmarter}
        onAutoSeedSmarterPlans={handleAutoSeedSmarterPlans}
        onSelectSmarter={handleSelectSmarter}
        onEditSmarter={handleEditSmarter}
        onDeleteSmarter={handleDeleteSmarter}
        onProceedToAct={handleProceedToAct}
        onOpenAct={handleOpenAct}
        onZoomToAct={handleZoomToAct}
        onLeaveActTab={() => setIsActView(false)}
        onSaveAct={handleSaveAct}
        onSaveSmarter={handleSaveSmarter}
        onSmarterDraftChange={(draft) => {
          const currentView = drawerViewRef.current;
          if (drawerViewLevelRef.current !== 'smarter-edit' || currentView.level !== 'smarter-edit') return;
          setSmarterDraft({
            aspirationId: currentView.aspiration.id,
            woopIdx: currentView.woopIdx,
            smarterIdx: currentView.smarterIdx,
            smarter: draft,
          });
        }}
        onSmarterDraftClear={() => setSmarterDraft(null)}
        onCancelSmarterEdit={handleCancelSmarterEdit}
        onCancelEdit={handleCancelEdit}
        onDeleteAspiration={handleDeleteAspiration}
      />
      {/* page stack — reconnects when drawer is wired */}
      {shouldRenderPageStack ? pageStackContent : null}
    </div>
  );
}

