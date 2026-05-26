//import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProgressionStore } from '../../../../../stores/useProgressionStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import { useBrainstormStore } from '../../../../../stores/useBrainstormStore';
import { autoCompleteSystemTask } from '../../../../../engine/resourceEngine';
import { fireInitialIntervalMarkers, generateSmarterMarkers } from '../../../../../engine/markerEngine';
import { GoalCanvas } from './GoalCanvas';
import { GeneralStormCanvas } from './GeneralStormCanvas';
import { GoalInspectorDrawer } from './GoalInspectorDrawer';
import type { DrawerView } from './GoalInspectorDrawer';
import {
  createBlankAspiration,
  createBlankSmarter,
} from './goalEditorUtils';
import type { Aspiration, NestedAct, Smarter, Woop } from '../../../../../types';
import type { BrainstormEntry, IdeaState, IdeaType, StormCategory } from '../../../../../types/brainstorm';
import type { LogInputFields } from '../../../../../types/taskTemplate';

interface GoalRoomProps {
  onNavHiddenChange: (hidden: boolean) => void;
}

export function GoalRoom({ onNavHiddenChange }: GoalRoomProps) {
  const [drawerView, setDrawerView] = useState<DrawerView>({ level: 'root' });
  const [drawerEditMode, setDrawerEditMode] = useState(false);
  const [aspirationDraft, setAspirationDraft] = useState<Aspiration | null>(null);
  const [woopDraft, setWoopDraft] = useState<{ aspirationId: string; woopIdx: number | null; woop: Woop } | null>(null);
  const [smarterDraft, setSmarterDraft] = useState<{ aspirationId: string; woopIdx: number; smarterIdx: number | null; smarter: Smarter } | null>(null);
  const [isActView, setIsActView] = useState(false);
  const [navHidden, setNavHidden] = useState(true);
  const [brainstormFocused, setBrainstormFocused] = useState(false);
  const [addingStorm, setAddingStorm] = useState(false);
  const [stormCanvasOpen, setStormCanvasOpen] = useState(false);
  const [addingMainIdea, setAddingMainIdea] = useState(false);
  const [draftMainIdeaTitle, setDraftMainIdeaTitle] = useState('');
  const [draftMainIdeaState, setDraftMainIdeaState] = useState<IdeaState>('open');
  const [draftMainIdeaType, setDraftMainIdeaType] = useState<IdeaType>('insight');
  const [draftCustomStateColor, setDraftCustomStateColor] = useState('#ffffff');
  const [draftCustomColor, setDraftCustomColor] = useState('#ffffff');
  const focusOrbitRef = useRef<((orbit: 'user' | 'system' | null) => void) | null>(null);
  const clearCanvasFocusRef = useRef<((scope: 'planet' | 'all') => void) | null>(null);
  const selectAspirationFromDrawerRef = useRef<((id: string) => void) | null>(null);
  const setSelectedWoopRef = useRef<((idx: number | null) => void) | null>(null);
  const setSelectedSmarterRef = useRef<((idx: number | null) => void) | null>(null);
  const stormScrollRef = useRef<((ratio: number) => void) | null>(null);
  const drawerStormScrollRef = useRef<HTMLDivElement>(null);
  const editSnapshotRef = useRef<Aspiration | null>(null);
  const woopSnapshotRef = useRef<Woop | null>(null);
  const woopInsertIndexRef = useRef<number | null>(null);
  const drawerViewRef = useRef<DrawerView>(drawerView);
  const drawerViewLevelRef = useRef(drawerView.level);
  const drawerEditModeRef = useRef(drawerEditMode);

  const aspirations = useProgressionStore((s) => s.aspirations);
  const setAspiration = useProgressionStore((s) => s.setAspiration);
  const removeAspiration = useProgressionStore((s) => s.removeAspiration);
  const storms = useBrainstormStore((s) => s.storms);
  const selectedStormId = useBrainstormStore((s) => s.selectedStormId);
  const selectedMainIdeaId = useBrainstormStore((s) => s.selectedMainIdeaId);
  const selectedIdeaId = useBrainstormStore((s) => s.selectedIdeaId);
  const {
    addStorm,
    addMainIdea,
    addIdea,
    addChildIdea,
    addEntry,
    addEntryToMainIdea,
    deleteStorm,
    deleteMainIdea,
    deleteIdea,
    renameStorm,
    setStormType,
    setStormState,
    setStormCategory,
    renameMainIdea,
    renameIdea,
    setSelectedStorm,
    setSelectedMainIdea,
    setSelectedIdea,
  } = useBrainstormStore();
  const currentStorm = selectedStormId ? storms[selectedStormId] ?? null : null;
  const mainIdeas = currentStorm?.mainIdeas ?? {};
  const ideas = currentStorm?.ideas ?? {};

  useEffect(() => {
    autoCompleteSystemTask('task-sys-open-adventures');
  }, []);

  useEffect(() => {
    drawerViewRef.current = drawerView;
    drawerEditModeRef.current = drawerEditMode;
  }, [drawerView, drawerEditMode]);

  useEffect(() => {
    if (selectedStormId === null) {
      setStormCanvasOpen(false);
    }
  }, [selectedStormId]);

  useEffect(() => {
    drawerViewLevelRef.current = drawerView.level;
    let timer: number | null = null;

    if (drawerView.level !== 'smarter') {
      timer = window.setTimeout(() => {
        setIsActView(false);
      }, 0);
    }
    if (drawerView.level !== 'brainstorm') {
      const nextTimer = window.setTimeout(() => {
        setBrainstormFocused(false);
      }, 0);
      if (timer !== null) {
        return () => {
          window.clearTimeout(timer);
          window.clearTimeout(nextTimer);
        };
      }

      return () => {
        window.clearTimeout(nextTimer);
      };
    }

    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [drawerView.level]);

  useEffect(() => {
    onNavHiddenChange(navHidden);
  }, [navHidden, onNavHiddenChange]);

  const userAspirations = useMemo(
    () => Object.values(aspirations).filter((act) => act.owner !== 'coach'),
    [aspirations],
  );

  const systemAspirations = useMemo(() => {
    return Object.values(aspirations).filter((act) => act.owner === 'coach');
  }, [aspirations]);

  const handleRegisterStormScroll = useCallback((fn: (ratio: number) => void) => {
    stormScrollRef.current = fn;
  }, []);

  const handleStormScrollProgress = useCallback((ratio: number) => {
    stormScrollRef.current?.(ratio);
  }, []);

  function handleAddMainIdea(title: string) {
    if (selectedStormId) {
      addMainIdea(selectedStormId, title);
    }
  }

  function handleAddIdea(mainIdeaId: string, title: string) {
    if (selectedStormId) {
      addIdea(selectedStormId, mainIdeaId, title);
    }
  }

  function handleAddChildIdea(parentIdeaId: string, title: string) {
    if (selectedStormId) {
      addChildIdea(selectedStormId, parentIdeaId, title);
    }
  }

  function handleAddEntry(
    ideaId: string,
    entry: Omit<BrainstormEntry, 'id' | 'entries'>,
  ) {
    if (selectedStormId) {
      addEntry(selectedStormId, ideaId, entry);
    }
  }

  function handleAddEntryToMainIdea(
    mainIdeaId: string,
    entry: Omit<BrainstormEntry, 'id' | 'entries'>,
  ) {
    if (selectedStormId) {
      addEntryToMainIdea(selectedStormId, mainIdeaId, entry);
    }
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

  const handleFocusedOrbitChange = useCallback((orbit: 'user' | 'system' | null) => {
    const level = drawerViewLevelRef.current;
    if (level === 'woop-edit' || level === 'smarter-edit' || level === 'act-edit') return;
    setSelectedSmarterRef.current?.(null);
    setSelectedWoopRef.current?.(null);
    if (orbit === null) {
      setDrawerView({ level: 'root' });
    } else {
      setBrainstormFocused(false);
      setDrawerView({ level: 'orbit', orbit });
    }
  }, []);
  const handleFocusUserOrbit = useCallback(() => {
    focusOrbitRef.current?.('user');
    handleFocusedOrbitChange('user');
  }, [handleFocusedOrbitChange]);
  const handleFocusAdventureOrbit = useCallback(() => {
    focusOrbitRef.current?.('system');
    handleFocusedOrbitChange('system');
  }, [handleFocusedOrbitChange]);
  const handleFocusBrainstorm = useCallback(() => {
    setSelectedStorm(null);
    setBrainstormFocused(true);
    clearCanvasFocusRef.current?.('all');
    setDrawerView({ level: 'brainstorm' });
  }, [setSelectedStorm]);
  const handleSelectedAspirationChange = useCallback((aspiration: Aspiration | null) => {
    const level = drawerViewLevelRef.current;
    if (level === 'woop-edit' || level === 'smarter-edit' || level === 'act-edit') return;
    setSelectedSmarterRef.current?.(null);
    setSelectedWoopRef.current?.(null);
    if (aspiration === null) return;
    const orbit = aspiration.owner === 'coach' ? 'system' : 'user';
    setDrawerView({ level: 'aspiration', orbit, aspiration });
  }, []);

  const handleSelectMainIdea = useCallback((id: string | null) => {
    if (id === null) {
      setSelectedIdea(null);
      setSelectedMainIdea(null);
      return;
    }

    if (selectedMainIdeaId !== id) {
      setSelectedIdea(null);
    }
    setSelectedMainIdea(id);
  }, [selectedMainIdeaId, setSelectedIdea, setSelectedMainIdea]);

  const handleEnterStorm = useCallback(() => {
    if (!selectedStormId) return;
    setStormCanvasOpen(true);
  }, [selectedStormId]);

  const handleExitStorm = useCallback(() => {
    setStormCanvasOpen(false);
  }, []);

  function handleDrawerBack() {
    if (drawerView.level === 'brainstorm') {
      const stormState = useBrainstormStore.getState();
      const stormId = stormState.selectedStormId;
      if (selectedIdeaId) {
        const idea = stormId && selectedIdeaId
          ? stormState.storms[stormId]?.ideas[selectedIdeaId]
          : null;
        if (idea?.parentIdeaId) {
          setSelectedIdea(idea.parentIdeaId);
        } else {
          setSelectedIdea(null);
        }
      } else if (selectedMainIdeaId) {
        handleSelectMainIdea(null);
      } else if (selectedStormId) {
        setSelectedStorm(null);
      } else {
        setDrawerView({ level: 'root' });
      }
      return;
    }

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
      setDrawerView({ level: 'root' });
      clearCanvasFocusRef.current?.('all');
    }
  }
  const drawerOpen = drawerView.level !== 'none';
  const drawerHeightPercent = 55;
  const canvasHeightPercent = drawerOpen ? 100 - drawerHeightPercent : 100;

  return (
    <div className="relative w-full h-full bg-gray-950 overflow-hidden">
      <button
        type="button"
        onClick={() => {
          setNavHidden((prev) => !prev);
          onNavHiddenChange(!navHidden);
        }}
        className="absolute top-3 right-3 z-50 flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-gray-900/85 text-white/70 shadow-lg transition hover:bg-gray-800 hover:text-white"
        aria-label={navHidden ? 'Show navigation' : 'Hide navigation'}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {navHidden ? (
            <>
              <path d="M4 4L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </>
          ) : (
            <>
              <path d="M4 6H14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M4 12H14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </>
          )}
        </svg>
      </button>
      <div
        className="absolute top-0 left-0 right-0 transition-all duration-300 ease-out"
        style={{ height: `${canvasHeightPercent}%` }}
      >
        <div
          className="absolute inset-0 transition-opacity duration-300 ease-out"
          style={{
            opacity: stormCanvasOpen ? 0 : 1,
            pointerEvents: stormCanvasOpen ? 'none' : undefined,
          }}
        >
          <GoalCanvas
            selectedStormId={selectedStormId}
            addingStorm={addingStorm}
            userAspirations={userAspirations}
            adventureAspirations={systemAspirations}
            onFocusedOrbitChange={handleFocusedOrbitChange}
            onRegisterFocusOrbit={(fn) => { focusOrbitRef.current = fn; }}
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
            onBrainstormSelect={handleFocusBrainstorm}
            onSelectStorm={setSelectedStorm}
            brainstormFocused={brainstormFocused}
            selectedMainIdeaId={selectedMainIdeaId}
            selectedIdeaId={selectedIdeaId}
            onSelectMainIdea={handleSelectMainIdea}
            onSelectIdea={setSelectedIdea}
            onRegisterSetSelectedWoop={(fn) => { setSelectedWoopRef.current = fn; }}
            onRegisterSetSelectedSmarter={(fn) => { setSelectedSmarterRef.current = fn; }}
            onRegisterStormScroll={handleRegisterStormScroll}
            onStormWheelScroll={(delta) => {
              if (drawerStormScrollRef.current) {
                drawerStormScrollRef.current.scrollTop += delta * 0.3;
              }
            }}
            aspirationDraft={aspirationDraft}
            woopDraft={woopDraft}
            smarterDraft={smarterDraft}
            isActView={isActView || drawerView.level === 'act-edit'}
            isActEdit={drawerView.level === 'act-edit'}
          />
        </div>
        {stormCanvasOpen && selectedStormId ? (
          <GeneralStormCanvas
            selectedStormId={selectedStormId}
            selectedMainIdeaId={selectedMainIdeaId}
            selectedIdeaId={selectedIdeaId}
            onSelectMainIdea={handleSelectMainIdea}
            onSelectIdea={setSelectedIdea}
            addingMainIdea={addingMainIdea}
            draftMainIdeaTitle={draftMainIdeaTitle}
            draftMainIdeaState={draftMainIdeaState}
            draftMainIdeaType={draftMainIdeaType}
            draftCustomStateColor={draftCustomStateColor}
            draftCustomColor={draftCustomColor}
          />
        ) : null}
      </div>
      <GoalInspectorDrawer
        selectedStormId={selectedStormId}
        storms={storms}
        open={drawerOpen}
        view={drawerView}
        onBack={handleDrawerBack}
        onFocusUserOrbit={handleFocusUserOrbit}
        onFocusAdventureOrbit={handleFocusAdventureOrbit}
        onFocusBrainstorm={handleFocusBrainstorm}
        userAspirations={userAspirations}
        adventureAspirations={systemAspirations}
        mainIdeas={mainIdeas}
        ideas={ideas}
        selectedMainIdeaId={selectedMainIdeaId}
        selectedIdeaId={selectedIdeaId}
        stormCanvasOpen={stormCanvasOpen}
        onExitStorm={handleExitStorm}
        onStormScrollProgress={handleStormScrollProgress}
        stormScrollContainerRef={drawerStormScrollRef}
        addingStorm={addingStorm}
        setAddingStorm={setAddingStorm}
        onSelectStorm={(id) => {
          setSelectedStorm(id);
        }}
        onAddStorm={(name, type, state, category?: StormCategory) => {
          addStorm(name, type, state, category);
        }}
        onSetStormType={(type) => {
          if (selectedStormId) {
            setStormType(selectedStormId, type);
          }
        }}
        onSetStormState={(state) => {
          if (selectedStormId) {
            setStormState(selectedStormId, state);
          }
        }}
        onSetStormCategory={(category) => {
          if (selectedStormId) {
            setStormCategory(selectedStormId, category);
          }
        }}
        onSelectMainIdea={handleSelectMainIdea}
        onSelectIdea={setSelectedIdea}
        onAddMainIdea={handleAddMainIdea}
        onAddIdea={handleAddIdea}
        onAddChildIdea={handleAddChildIdea}
        onAddEntry={(ideaId, content, state) => {
          handleAddEntry(ideaId, { content, state, pointsTo: [] });
        }}
        onAddEntryToMainIdea={handleAddEntryToMainIdea}
        onAddingMainIdeaChange={setAddingMainIdea}
        onDraftMainIdeaTitleChange={setDraftMainIdeaTitle}
        onDraftMainIdeaStateChange={setDraftMainIdeaState}
        onDraftMainIdeaTypeChange={setDraftMainIdeaType}
        onDraftCustomStateColorChange={setDraftCustomStateColor}
        onDraftCustomColorChange={setDraftCustomColor}
        onDeleteStorm={() => {
          if (selectedStormId) {
            deleteStorm(selectedStormId);
            setSelectedStorm(null);
          }
        }}
        onEnterStorm={handleEnterStorm}
        onDeleteMainIdea={() => {
          if (selectedStormId && selectedMainIdeaId) {
            deleteMainIdea(selectedStormId, selectedMainIdeaId);
            setSelectedMainIdea(null);
            setSelectedIdea(null);
          }
        }}
        onDeleteIdea={() => {
          if (selectedStormId && selectedIdeaId) {
            deleteIdea(selectedStormId, selectedIdeaId);
            setSelectedIdea(null);
          }
        }}
        onRenameStorm={(name) => {
          if (selectedStormId) {
            renameStorm(selectedStormId, name);
          }
        }}
        onRenameMainIdea={(name) => {
          if (selectedStormId && selectedMainIdeaId) {
            renameMainIdea(selectedStormId, selectedMainIdeaId, name);
          }
        }}
        onRenameIdea={(name) => {
          if (selectedStormId && selectedIdeaId) {
            renameIdea(selectedStormId, selectedIdeaId, name);
          }
        }}
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
    </div>
  );
}
