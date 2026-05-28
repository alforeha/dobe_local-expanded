import { useEffect, useRef, useState, type UIEvent } from 'react';
import type { Aspiration, NestedAct, Smarter, Woop } from '../../../../../types';
import type {
  BrainstormEntry,
  BrainstormIdea,
  EntryState,
  EntryType,
  IdeaState,
  IdeaType,
  MainIdea,
  Storm,
  StormCategory,
  StormState,
  StormType,
} from '../../../../../types/brainstorm';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { BrainstormDrawer, type BrainstormModalMode } from './BrainstormDrawer';
import { GoalActEditor } from './GoalActEditor';
import { GoalAspirationEditor } from './GoalAspirationEditor';
import { GoalSmarterEditor } from './GoalSmarterEditor';
import { GoalWoopEditor } from './GoalWoopEditor';
import { brainstormDraftRef } from './brainstormDraftRef';
import { createBlankSmarter, createBlankWoop } from './goalEditorUtils';
import { analyzeWoopText, BANK_COLORS, type WoopBankMatch } from './woopKeywordEngine';

export type DrawerView =
  | { level: 'none' }
  | { level: 'root' }
  | { level: 'brainstorm' }
  | { level: 'orbit'; orbit: 'user' | 'system' }
  | { level: 'aspiration'; orbit: 'user' | 'system'; aspiration: Aspiration }
  | { level: 'woop-edit'; orbit: 'user' | 'system'; aspiration: Aspiration; woopIdx: number | null }
  | { level: 'woop'; orbit: 'user' | 'system'; aspiration: Aspiration; woopIdx: number }
  | { level: 'smarter-edit'; orbit: 'user' | 'system'; aspiration: Aspiration; woopIdx: number; smarterIdx: number | null }
  | { level: 'smarter'; orbit: 'user' | 'system'; aspiration: Aspiration; woopIdx: number; smarterIdx: number }
  | { level: 'act-edit'; orbit: 'user' | 'system'; aspiration: Aspiration; woopIdx: number; smarterIdx: number };

interface GoalInspectorDrawerProps {
  selectedStormId: string | null;
  storms: Record<string, Storm>;
  open: boolean;
  view: DrawerView;
  onBack: () => void;
  onFocusUserOrbit: () => void;
  onFocusAdventureOrbit: () => void;
  onFocusBrainstorm: () => void;
  userAspirations: Aspiration[];
  adventureAspirations: Aspiration[];
  mainIdeas: Record<string, MainIdea>;
  ideas: Record<string, BrainstormIdea>;
  selectedMainIdeaId: string | null;
  selectedIdeaId: string | null;
  stormCanvasOpen: boolean;
  onExitStorm: () => void;
  onSelectStorm: (id: string | null) => void;
  onStormScrollProgress?: (ratio: number) => void;
  stormScrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  addingStorm: boolean;
  setAddingStorm: (adding: boolean) => void;
  onAddStorm: (name: string, type: StormType, state?: StormState, category?: StormCategory) => void;
  onSetStormType: (type: StormType) => void;
  onSetStormState: (state: StormState) => void;
  onSetStormCategory: (category: StormCategory) => void;
  onSelectMainIdea: (id: string | null) => void;
  onSelectIdea: (id: string | null) => void;
  onAddMainIdea: (title: string) => void;
  onAddIdea: (mainIdeaId: string, title: string) => void;
  onAddChildIdea: (parentIdeaId: string, title: string) => void;
  onAddEntry: (
    ideaId: string,
    entry: Omit<BrainstormEntry, 'id' | 'entries'>,
    entryType?: EntryType,
    customProperties?: Record<string, string>,
  ) => void;
  onAddEntryToMainIdea: (
    mainIdeaId: string,
    entry: Omit<BrainstormEntry, 'id' | 'entries'>,
    entryType?: EntryType,
    customProperties?: Record<string, string>,
  ) => void;
  onAddingMainIdeaChange?: (adding: boolean) => void;
  onDraftMainIdeaTitleChange?: (title: string) => void;
  onDraftMainIdeaStateChange: (state: IdeaState) => void;
  onDraftMainIdeaTypeChange: (type: IdeaType) => void;
  onDraftCustomStateColorChange?: (color: string) => void;
  onDraftCustomColorChange?: (color: string) => void;
  onAddingChildIdeaChange: (adding: boolean) => void;
  onEditingChildIdeaChange?: (editing: boolean) => void;
  onDraftChildIdeaStateChange: (state: IdeaState) => void;
  onDraftChildIdeaTypeChange: (type: IdeaType) => void;
  onDraftChildIdeaCustomColorChange?: (color: string) => void;
  onDraftChildIdeaCustomStateColorChange?: (color: string) => void;
  onAddingEntryChange: (adding: boolean) => void;
  onAddingSubEntryChange?: (adding: boolean) => void;
  onSubEntryParentIdChange?: (id: string | null) => void;
  onDraftEntryStateChange: (state: EntryState) => void;
  onDraftEntryTypeChange: (type: EntryType) => void;
  onDraftEntryCustomColorChange?: (color: string) => void;
  onDraftEntryCustomStateColorChange?: (color: string) => void;
  onEntryScrollAngleChange: (angle: number) => void;
  onDeleteStorm: () => void;
  onDeleteMainIdea: () => void;
  onDeleteIdea: () => void;
  onDeleteEntry: (entryId: string) => void;
  onUpdateMainIdea: (mainIdeaId: string, updates: {
    title?: string;
    state?: IdeaState;
    type?: IdeaType;
    customProperties?: Record<string, string>;
  }) => void;
  onUpdateIdea: (ideaId: string, updates: {
    title?: string;
    state?: IdeaState;
    type?: IdeaType;
    customProperties?: Record<string, string>;
  }) => void;
  onUpdateEntry: (entryId: string, updates: {
    content?: string;
    state?: import('../../../../../types/brainstorm').EntryState;
    type?: EntryType;
    customProperties?: Record<string, string>;
  }) => void;
  onEnterStorm: () => void;
  onRenameStorm: (name: string) => void;
  onRenameMainIdea: (name: string) => void;
  onRenameIdea: (name: string) => void;
  onSelectAspiration: (aspiration: Aspiration) => void;
  onAddAspiration: () => void;
  editMode: boolean;
  onEditModeChange: (editing: boolean) => void;
  onSaveAspiration: (aspiration: Aspiration) => void;
  onLiveUpdateAspiration: (aspiration: Aspiration) => void;
  onAddWoop: () => void;
  onSelectWoop: (woopIdx: number) => void;
  onEditWoop: (woopIdx: number) => void;
  onDeleteWoop: (woopIdx: number) => void;
  onSaveWoop: (woop: Woop, woopIdx: number | null) => void;
  onWoopDraftChange: (draft: Woop) => void;
  onWoopDraftClear: () => void;
  onAddSmarter: () => void;
  onAutoSeedSmarterPlans: () => void;
  onSelectSmarter: (smarterIdx: number) => void;
  onEditSmarter: (smarterIdx: number) => void;
  onDeleteSmarter: (smarterIdx: number) => void;
  onProceedToAct: (draft: Smarter, smarterIdx: number | null) => void;
  onOpenAct: (smarterIdx: number) => void;
  onZoomToAct: () => void;
  onLeaveActTab: () => void;
  onSaveAct: (nestedAct: NestedAct, smarterIdx: number) => void;
  onSaveSmarter: (smarter: Smarter, smarterIdx: number | null) => void;
  onSmarterDraftChange: (draft: Smarter) => void;
  onSmarterDraftClear: () => void;
  onCancelSmarterEdit: () => void;
  onCancelEdit: () => void;
  onDeleteAspiration: (aspirationId: string) => void;
  brainstormDrawerResetKey: number;
}

function AspirationActionsMenu({
  aspirationId,
  onEdit,
  onAddWoop,
  onDelete,
}: {
  aspirationId: string;
  onEdit: () => void;
  onAddWoop: () => void;
  onDelete: (aspirationId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    }

    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        onClick={() => {
          setMenuOpen((p) => !p);
          setConfirmDelete(false);
        }}
        className="text-white/30 hover:text-white/60 px-2 py-1 text-base leading-none"
      >
        ...
      </button>

      {menuOpen && !confirmDelete && (
        <div className="absolute right-0 top-7 bg-gray-900 border border-white/10 rounded-lg overflow-hidden z-10 min-w-[120px]">
          <button
            onClick={() => {
              setMenuOpen(false);
              onEdit();
            }}
            className="w-full px-4 py-2.5 text-left text-white/70 text-sm hover:bg-white/5"
          >
            Edit
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              onAddWoop();
            }}
            className="w-full px-4 py-2.5 text-left text-white/70 text-sm hover:bg-white/5"
          >
            Add WOOP
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full px-4 py-2.5 text-left text-red-400/80 text-sm hover:bg-white/5"
          >
            Delete
          </button>
        </div>
      )}

      {menuOpen && confirmDelete && (
        <div className="absolute right-0 top-7 bg-gray-900 border border-red-500/20 rounded-lg overflow-hidden z-10 min-w-[150px]">
          <p className="px-4 pt-3 pb-1 text-white/40 text-xs">Delete this aspiration?</p>
          <button
            onClick={() => {
              onDelete(aspirationId);
              setMenuOpen(false);
              setConfirmDelete(false);
            }}
            className="w-full px-4 py-2.5 text-left text-red-400 text-sm hover:bg-white/5"
          >
            Yes, delete
          </button>
          <button
            onClick={() => {
              setConfirmDelete(false);
              setMenuOpen(false);
            }}
            className="w-full px-4 py-2.5 text-left text-white/40 text-sm hover:bg-white/5 border-t border-white/5"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function WoopActionsMenu({
  woopIdx,
  onEdit,
  onDelete,
  onAddSmarter,
}: {
  woopIdx: number;
  onEdit: (woopIdx: number) => void;
  onDelete: (woopIdx: number) => void;
  onAddSmarter: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    }

    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        onClick={() => {
          setMenuOpen((p) => !p);
          setConfirmDelete(false);
        }}
        className="text-white/30 hover:text-white/60 px-2 py-1 text-base leading-none"
      >
        ...
      </button>

      {menuOpen && !confirmDelete && (
        <div className="absolute right-0 top-7 bg-gray-900 border border-white/10 rounded-lg overflow-hidden z-10 min-w-[120px]">
          <button
            onClick={() => {
              setMenuOpen(false);
              onEdit(woopIdx);
            }}
            className="w-full px-4 py-2.5 text-left text-white/70 text-sm hover:bg-white/5"
          >
            Edit
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full px-4 py-2.5 text-left text-red-400/80 text-sm hover:bg-white/5"
          >
            Delete
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              onAddSmarter();
            }}
            className="w-full px-4 py-2.5 text-left text-white/70 text-sm hover:bg-white/5"
          >
            Add SMARTER
          </button>
        </div>
      )}

      {menuOpen && confirmDelete && (
        <div className="absolute right-0 top-7 bg-gray-900 border border-red-500/20 rounded-lg overflow-hidden z-10 min-w-[150px]">
          <p className="px-4 pt-3 pb-1 text-white/40 text-xs">Delete this WOOP?</p>
          <button
            onClick={() => {
              onDelete(woopIdx);
              setMenuOpen(false);
              setConfirmDelete(false);
            }}
            className="w-full px-4 py-2.5 text-left text-red-400 text-sm hover:bg-white/5"
          >
            Yes, delete
          </button>
          <button
            onClick={() => {
              setConfirmDelete(false);
              setMenuOpen(false);
            }}
            className="w-full px-4 py-2.5 text-left text-white/40 text-sm hover:bg-white/5 border-t border-white/5"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function SmarterActionsMenu({
  smarterIdx,
  onEdit,
  onDelete,
}: {
  smarterIdx: number;
  onEdit: (smarterIdx: number) => void;
  onDelete: (smarterIdx: number) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    }

    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        onClick={() => {
          setMenuOpen((p) => !p);
          setConfirmDelete(false);
        }}
        className="text-white/30 hover:text-white/60 px-2 py-1 text-base leading-none"
      >
        ...
      </button>

      {menuOpen && !confirmDelete && (
        <div className="absolute right-0 top-7 bg-gray-900 border border-white/10 rounded-lg overflow-hidden z-10 min-w-[140px]">
          <button
            onClick={() => {
              setMenuOpen(false);
              onEdit(smarterIdx);
            }}
            className="w-full px-4 py-2.5 text-left text-white/70 text-sm hover:bg-white/5"
          >
            Edit SMARTER
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full px-4 py-2.5 text-left text-red-400/80 text-sm hover:bg-white/5"
          >
            Delete SMARTER
          </button>
        </div>
      )}

      {menuOpen && confirmDelete && (
        <div className="absolute right-0 top-7 bg-gray-900 border border-red-500/20 rounded-lg overflow-hidden z-10 min-w-[150px]">
          <p className="px-4 pt-3 pb-1 text-white/40 text-xs">Delete this SMARTER?</p>
          <button
            onClick={() => {
              onDelete(smarterIdx);
              setMenuOpen(false);
              setConfirmDelete(false);
            }}
            className="w-full px-4 py-2.5 text-left text-red-400 text-sm hover:bg-white/5"
          >
            Yes, delete
          </button>
          <button
            onClick={() => {
              setConfirmDelete(false);
              setMenuOpen(false);
            }}
            className="w-full px-4 py-2.5 text-left text-white/40 text-sm hover:bg-white/5 border-t border-white/5"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export function GoalInspectorDrawer({
  selectedStormId,
  storms,
  open,
  view,
  onBack,
  onFocusUserOrbit,
  onFocusAdventureOrbit,
  onFocusBrainstorm,
  userAspirations,
  adventureAspirations,
  mainIdeas,
  ideas,
  selectedMainIdeaId,
  selectedIdeaId,
  stormCanvasOpen,
  onExitStorm,
  onSelectStorm,
  onStormScrollProgress,
  stormScrollContainerRef,
  addingStorm,
  setAddingStorm,
  onAddStorm,
  onSetStormType,
  onSetStormState,
  onSetStormCategory,
  onSelectMainIdea,
  onSelectIdea,
  onAddMainIdea,
  onAddIdea,
  onAddChildIdea,
  onAddEntry,
  onAddEntryToMainIdea,
  onAddingMainIdeaChange,
  onDraftMainIdeaTitleChange,
  onDraftMainIdeaStateChange,
  onDraftMainIdeaTypeChange,
  onDraftCustomStateColorChange,
  onDraftCustomColorChange,
  onAddingChildIdeaChange,
  onEditingChildIdeaChange,
  onDraftChildIdeaStateChange,
  onDraftChildIdeaTypeChange,
  onDraftChildIdeaCustomColorChange,
  onDraftChildIdeaCustomStateColorChange,
  onAddingEntryChange,
  onAddingSubEntryChange,
  onSubEntryParentIdChange,
  onDraftEntryStateChange,
  onDraftEntryTypeChange,
  onDraftEntryCustomColorChange,
  onDraftEntryCustomStateColorChange,
  onEntryScrollAngleChange,
  onDeleteStorm,
  onDeleteMainIdea,
  onDeleteIdea,
  onDeleteEntry,
  onUpdateMainIdea,
  onUpdateIdea,
  onUpdateEntry,
  onEnterStorm,
  onRenameStorm,
  onRenameMainIdea,
  onRenameIdea,
  onSelectAspiration,
  onAddAspiration,
  editMode,
  onEditModeChange,
  onSaveAspiration,
  onLiveUpdateAspiration,
  onAddWoop,
  onSelectWoop,
  onEditWoop,
  onDeleteWoop,
  onSaveWoop,
  onWoopDraftChange,
  onWoopDraftClear,
  onAddSmarter,
  onAutoSeedSmarterPlans,
  onSelectSmarter,
  onEditSmarter,
  onDeleteSmarter,
  onProceedToAct,
  onOpenAct,
  onZoomToAct,
  onLeaveActTab,
  onSaveAct,
  onSaveSmarter,
  onSmarterDraftChange,
  onSmarterDraftClear,
  onCancelSmarterEdit,
  onCancelEdit,
  onDeleteAspiration,
  brainstormDrawerResetKey,
}: GoalInspectorDrawerProps) {
  const prevLevelRef = useRef(view.level);
  const [editingStorm, setEditingStorm] = useState(false);
  const [newStormName, setNewStormName] = useState('');
  const [newStormType, setNewStormType] = useState<StormType>('general');
  const [newStormState, setNewStormState] = useState<StormState>('active');
  const [newStormCategory, setNewStormCategory] = useState<StormCategory>({ name: 'Thought Train', color: '#7c3aed' });
  const [categoryInput, setCategoryInput] = useState('');
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [modalMode, setModalMode] = useState<BrainstormModalMode | null>(null);
  const [ideaActiveTab, setIdeaActiveTab] = useState<'ideas' | 'entries'>('entries');
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stormScrollRef = stormScrollContainerRef ?? scrollRef;
  const stormScrollRatioRef = useRef(0);
  const [rowHeight, setRowHeight] = useState(48);
  const selectedMainIdea = selectedMainIdeaId ? mainIdeas[selectedMainIdeaId] ?? null : null;
  const selectedIdea = selectedIdeaId ? ideas[selectedIdeaId] ?? null : null;
  const currentEntryOwner = selectedIdea ?? selectedMainIdea;
  const currentChildIdeas = currentEntryOwner?.ideas
    .map((ideaId) => ideas[ideaId])
    .filter((idea): idea is BrainstormIdea => Boolean(idea)) ?? [];
  const currentEntries = currentEntryOwner?.entries ?? [];
  const stormList = Object.values(storms);
  const selectedStorm = selectedStormId ? storms[selectedStormId] ?? null : null;
  const showStormOverview = view.level === 'brainstorm' && selectedStormId === null;
  const existingStormCategories = Array.from(
    new Map(
      Object.values(storms).map((storm) => [storm.category.name, storm.category]),
    ).values(),
  );

  function resetAddStormState() {
    setAddingStorm(false);
    setEditingStorm(false);
    setNewStormName('');
    setNewStormType('general');
    setNewStormState('active');
    setNewStormCategory({ name: 'Thought Train', color: '#7c3aed' });
    setCategoryInput('');
    setCategoryPickerOpen(false);
    setTypePickerOpen(false);
    setStatePickerOpen(false);
    brainstormDraftRef.current = null;
  }

  useEffect(() => {
    if (prevLevelRef.current === 'aspiration' && view.level !== 'aspiration') {
      onEditModeChange(false);
    }
    prevLevelRef.current = view.level;
  }, [view.level, onEditModeChange]);

  useEffect(() => {
    if (view.level !== 'brainstorm') {
      const timer = window.setTimeout(() => {
        setModalMode(null);
        setActionMenuOpen(false);
        setConfirmDelete(false);
      }, 0);

      return () => window.clearTimeout(timer);
    }
  }, [view.level]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setActionMenuOpen(false);
      setConfirmDelete(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [selectedMainIdeaId, selectedIdeaId, selectedStormId]);

  useEffect(() => {
    if (!editingStorm || !selectedStorm) return;

    setNewStormName(selectedStorm.name);
    setNewStormType(selectedStorm.type);
    setNewStormState(selectedStorm.state);
    setNewStormCategory(selectedStorm.category);
    setCategoryInput(selectedStorm.category.name);
    setCategoryPickerOpen(false);
    setTypePickerOpen(false);
    setStatePickerOpen(false);
  }, [editingStorm, selectedStorm]);

  useEffect(() => {
    if (selectedStormId === null) {
      setEditingStorm(false);
      brainstormDraftRef.current = null;
    }
  }, [selectedStormId]);

  useEffect(() => {
    if (!stormScrollRef.current) return;

    const measure = () => {
      const h = stormScrollRef.current?.clientHeight ?? 0;
      if (h > 0) {
        setRowHeight(Math.floor(h / 6));
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stormScrollRef.current);

    return () => ro.disconnect();
  }, [showStormOverview, stormScrollRef]);

  useEffect(() => {
    if (showStormOverview && stormScrollRef.current) {
      const el = stormScrollRef.current;
      el.scrollTop = stormScrollRatioRef.current * Math.max(1, el.scrollHeight - el.clientHeight);
      const ratio = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
      stormScrollRatioRef.current = ratio;
      onStormScrollProgress?.(ratio);
    }
  }, [showStormOverview, onStormScrollProgress, stormScrollRef]);

  function handleBrainstormModalConfirm(name: string, type?: StormType) {
    if (modalMode === 'storm') {
      onAddStorm(name, type ?? 'exploration');
    } else if (modalMode === 'mainIdea') {
      onAddMainIdea(name);
    } else if (modalMode === 'idea' && selectedMainIdea) {
      onAddIdea(selectedMainIdea.id, name);
    } else if (modalMode === 'childIdea' && selectedIdea) {
      onAddChildIdea(selectedIdea.id, name);
    } else if (modalMode === 'rename') {
      if (selectedIdeaId !== null) {
        onRenameIdea(name);
      } else if (selectedMainIdeaId !== null) {
        onRenameMainIdea(name);
      } else {
        onRenameStorm(name);
      }
    }

    setModalMode(null);
  }

  function handleAddStormOpen() {
    const draft = { type: 'general' as StormType, category: { name: 'Thought Train', color: '#7c3aed' } };
    setAddingStorm(true);
    brainstormDraftRef.current = draft;
    setEditingStorm(false);
    setNewStormName('');
    setNewStormType(draft.type);
    setNewStormState('active');
    setNewStormCategory(draft.category);
    setCategoryInput('');
    setCategoryPickerOpen(false);
    setTypePickerOpen(false);
    setStatePickerOpen(false);
  }

  function handleAddStormConfirm() {
    const trimmed = newStormName.trim();
    if (!trimmed) return;
    if (editingStorm && selectedStorm) {
      if (trimmed !== selectedStorm.name) {
        onRenameStorm(trimmed);
      }
      if (newStormType !== selectedStorm.type) {
        onSetStormType(newStormType);
      }
      if (newStormState !== selectedStorm.state) {
        onSetStormState(newStormState);
      }
      if (
        newStormCategory.name !== selectedStorm.category.name
        || newStormCategory.color !== selectedStorm.category.color
      ) {
        onSetStormCategory(newStormCategory);
      }
      setEditingStorm(false);
      setAddingStorm(false);
      brainstormDraftRef.current = null;
      return;
    }

    onAddStorm(trimmed, newStormType, newStormState, newStormCategory);
    resetAddStormState();
  }

  function handleStormScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const scrollRatio = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
    stormScrollRatioRef.current = scrollRatio;
    onStormScrollProgress?.(scrollRatio);
  }

  const label = view.level === 'act-edit'
    ? 'Act'
    : view.level === 'smarter-edit'
    ? view.smarterIdx !== null ? 'Edit SMARTER' : 'New SMARTER'
    : view.level === 'smarter'
    ? view.aspiration.woops[view.woopIdx]?.smarters[view.smarterIdx]?.name || 'SMARTER'
    : view.level === 'woop-edit'
    ? view.woopIdx !== null ? 'Edit WOOP' : 'New WOOP'
    : view.level === 'woop'
    ? view.aspiration.woops[view.woopIdx]?.name || 'WOOP'
    : view.level === 'aspiration'
      ? view.aspiration.name || 'Aspiration'
      : view.level === 'root'
        ? 'Goals'
      : view.level === 'brainstorm'
        ? 'Brainstorm Alley'
      : view.level === 'orbit'
        ? view.orbit === 'user' ? 'Your Aspirations' : 'Adventures'
        : '';
  const orbitList = view.level === 'orbit'
    ? view.orbit === 'user' ? userAspirations : adventureAspirations
    : [];
  const selectedStormMainIdeas = selectedStorm ? Object.values(selectedStorm.mainIdeas) : [];

  return (
    <div
      className="absolute bottom-0 left-0 right-0 transition-transform duration-300 ease-out"
      style={{
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        height: '55%',
        background: 'rgba(15, 15, 25, 0.96)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px 16px 0 0',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {view.level === 'brainstorm' ? (
        <BrainstormDrawer
          key={brainstormDrawerResetKey}
          selectedStormId={selectedStormId}
          selectedStorm={selectedStorm}
          selectedMainIdeaId={selectedMainIdeaId}
          selectedMainIdea={selectedMainIdea}
          selectedIdeaId={selectedIdeaId}
          selectedIdea={selectedIdea}
          stormCanvasOpen={stormCanvasOpen}
          currentEntries={currentEntries}
          currentChildIdeas={currentChildIdeas}
          stormList={stormList}
          selectedStormMainIdeas={selectedStormMainIdeas}
          showStormOverview={showStormOverview}
          addingStorm={addingStorm}
          editingStorm={editingStorm}
          newStormName={newStormName}
          newStormType={newStormType}
          newStormState={newStormState}
          newStormCategory={newStormCategory}
          categoryInput={categoryInput}
          categoryPickerOpen={categoryPickerOpen}
          typePickerOpen={typePickerOpen}
          statePickerOpen={statePickerOpen}
          modalMode={modalMode}
          ideaActiveTab={ideaActiveTab}
          actionMenuOpen={actionMenuOpen}
          confirmDelete={confirmDelete}
          existingStormCategories={existingStormCategories}
          rowHeight={rowHeight}
          stormScrollRef={stormScrollRef}
          onBack={onBack}
          onExitStorm={onExitStorm}
          onSelectStorm={onSelectStorm}
          onSelectMainIdea={onSelectMainIdea}
          onSelectIdea={onSelectIdea}
          onAddEntry={onAddEntry}
          onAddEntryToMainIdea={onAddEntryToMainIdea}
          onDeleteStorm={onDeleteStorm}
          onDeleteMainIdea={onDeleteMainIdea}
          onDeleteIdea={onDeleteIdea}
          onDeleteEntry={onDeleteEntry}
          onUpdateMainIdea={onUpdateMainIdea}
          onUpdateIdea={onUpdateIdea}
          onUpdateEntry={onUpdateEntry}
          onEnterStorm={onEnterStorm}
          onHandleAddStormOpen={handleAddStormOpen}
          onHandleAddStormConfirm={handleAddStormConfirm}
          onHandleStormScroll={handleStormScroll}
          onResetAddStormState={resetAddStormState}
          onHandleBrainstormModalConfirm={handleBrainstormModalConfirm}
        onAddingMainIdeaChange={onAddingMainIdeaChange}
        onDraftMainIdeaTitleChange={onDraftMainIdeaTitleChange}
        onDraftMainIdeaStateChange={onDraftMainIdeaStateChange}
        onDraftMainIdeaTypeChange={onDraftMainIdeaTypeChange}
        onDraftCustomStateColorChange={onDraftCustomStateColorChange}
        onDraftCustomColorChange={onDraftCustomColorChange}
        onAddingChildIdeaChange={onAddingChildIdeaChange}
        onEditingChildIdeaChange={onEditingChildIdeaChange}
        onDraftChildIdeaStateChange={onDraftChildIdeaStateChange}
        onDraftChildIdeaTypeChange={onDraftChildIdeaTypeChange}
        onDraftChildIdeaCustomColorChange={onDraftChildIdeaCustomColorChange}
        onDraftChildIdeaCustomStateColorChange={onDraftChildIdeaCustomStateColorChange}
        onAddingEntryChange={onAddingEntryChange}
        onAddingSubEntryChange={onAddingSubEntryChange}
        onSubEntryParentIdChange={onSubEntryParentIdChange}
        onDraftEntryStateChange={onDraftEntryStateChange}
        onDraftEntryTypeChange={onDraftEntryTypeChange}
        onDraftEntryCustomColorChange={onDraftEntryCustomColorChange}
        onDraftEntryCustomStateColorChange={onDraftEntryCustomStateColorChange}
        onEntryScrollAngleChange={onEntryScrollAngleChange}
        setAddingStorm={setAddingStorm}
          setEditingStorm={setEditingStorm}
          setNewStormName={setNewStormName}
          setNewStormType={setNewStormType}
          setNewStormState={setNewStormState}
          setNewStormCategory={setNewStormCategory}
          setCategoryInput={setCategoryInput}
          setCategoryPickerOpen={setCategoryPickerOpen}
          setTypePickerOpen={setTypePickerOpen}
          setStatePickerOpen={setStatePickerOpen}
          setModalMode={setModalMode}
          setIdeaActiveTab={setIdeaActiveTab}
          setActionMenuOpen={setActionMenuOpen}
          setConfirmDelete={setConfirmDelete}
        />
      ) : (
        <>
          {view.level === 'root' ? (
            <div className="px-4 py-4">
              <span className="block w-full text-center text-white/80 text-sm font-medium">
                Cranium Constructions
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between px-4 py-4">
              <span className="text-white/80 text-sm font-medium">
                {label}
              </span>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onBack();
                }}
                className="text-white/40 hover:text-white/80 text-xs px-2 py-1 flex items-center gap-1"
              >
                BACK
              </button>
            </div>
          )}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 16px' }} />
          {view.level === 'root' ? (
            <div className="flex-1 overflow-y-auto px-4 py-2">
              <button
                type="button"
                onClick={onFocusUserOrbit}
                className="w-full flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3.5 text-left transition hover:bg-white/[0.05]"
              >
                <IconDisplay iconKey="goal-user" size={26} className="shrink-0 opacity-90" />
                <span className="flex-1 min-w-0 text-white text-base font-semibold truncate">
                  User Aspirations
                </span>
                <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/30">
                  {userAspirations.length}
                </span>
              </button>
              <button
                type="button"
                onClick={onFocusAdventureOrbit}
                className="mt-3 w-full flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3.5 text-left transition hover:bg-white/[0.05]"
              >
                <IconDisplay iconKey="goal-adventure" size={26} className="shrink-0 opacity-90" />
                <span className="flex-1 min-w-0 text-white text-base font-semibold truncate">
                  System Adventures
                </span>
                <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/30">
                  {adventureAspirations.length}
                </span>
              </button>
              <button
                type="button"
                onClick={onFocusBrainstorm}
                className="mt-3 w-full flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3.5 text-left transition hover:bg-white/[0.05]"
              >
                <IconDisplay iconKey="goal-brainstorm" size={26} className="shrink-0 opacity-90" />
                <span className="flex-1 min-w-0 text-white text-base font-semibold truncate">
                  Brainstorm Alley
                </span>
              </button>
            </div>
          ) : null}
        </>
      )}
      {view.level === 'orbit' ? (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {orbitList.map((asp) => (
              <button
                key={asp.id}
                onClick={() => onSelectAspiration(asp)}
                className="w-full flex items-center gap-3 py-3 border-b border-white/5 text-left"
              >
                <IconDisplay iconKey={asp.icon} size={20} className="opacity-80 shrink-0" />
                <span className="flex-1 text-white/80 text-sm truncate">
                  {asp.name || 'Unnamed'}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  asp.completionState === 'complete'
                    ? 'bg-green-900/40 text-green-400'
                    : 'bg-white/5 text-white/30'
                }`}>
                  {asp.completionState}
                </span>
              </button>
            ))}
            {orbitList.length === 0 && (
              <p className="text-white/20 text-xs text-center py-8">
                {view.orbit === 'user' ? 'No aspirations yet' : 'No adventures unlocked'}
              </p>
            )}
          </div>
          {view.orbit === 'user' && (
            <div className="px-4 pb-4 pt-2">
              <button
                onClick={onAddAspiration}
                className="w-full py-2 rounded-lg border border-white/10 text-white/50 text-xs hover:border-white/20 hover:text-white/70"
              >
                + New Aspiration
              </button>
            </div>
          )}
        </>
      ) : null}
      {view.level === 'aspiration' && editMode ? (
        <GoalAspirationEditor
          aspiration={view.aspiration}
          onSave={(updated) => {
            onSaveAspiration(updated);
            onEditModeChange(false);
          }}
          onCancel={onCancelEdit}
          onLiveUpdate={onLiveUpdateAspiration}
        />
      ) : null}
      {view.level === 'aspiration' && !editMode ? (
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <IconDisplay iconKey={view.aspiration.icon} size={28} className="opacity-90 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white/90 text-sm font-medium truncate">{view.aspiration.name || 'Unnamed'}</p>
              {view.aspiration.description && (
                <p className="text-white/40 text-xs mt-0.5 line-clamp-2">{view.aspiration.description}</p>
              )}
            </div>
            {view.aspiration.owner !== 'coach' && (
              <AspirationActionsMenu
                aspirationId={view.aspiration.id}
                onEdit={() => onEditModeChange(true)}
                onAddWoop={onAddWoop}
                onDelete={onDeleteAspiration}
              />
            )}
          </div>

          {view.aspiration.woops.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-white/20 text-xs uppercase tracking-wider mb-1">WOOPs</p>
              {view.aspiration.woops.map((woop, i) => (
                <button
                  key={i}
                  onClick={() => onSelectWoop(i)}
                  className="w-full flex items-center gap-2 py-2 border-b border-white/5 text-left"
                >
                  <IconDisplay iconKey={woop.icon} size={14} className="opacity-60 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white/60 text-xs truncate">{woop.name || woop.wish || 'WOOP'}</p>
                    {woop.wish && woop.name && (
                      <p className="text-white/25 text-xs mt-0.5 truncate">{woop.wish}</p>
                    )}
                  </div>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/5 text-white/20 shrink-0">
                    {woop.smarters.length} SMARTERs
                  </span>
                </button>
              ))}
            </div>
          )}

          {view.aspiration.woops.length === 0 && (
            <p className="text-white/15 text-xs text-center py-4">No WOOPs defined yet</p>
          )}
        </div>
      ) : null}
      {view.level === 'woop-edit' ? (() => {
        const editingWoop = view.woopIdx !== null
          ? view.aspiration.woops[view.woopIdx]
          : createBlankWoop(view.aspiration.woops.length);
        if (!editingWoop) return null;

        return (
          <GoalWoopEditor
            woop={editingWoop}
            onSave={(updated) => onSaveWoop(updated, view.woopIdx)}
            onCancel={onCancelEdit}
            onDraftChange={onWoopDraftChange}
            onDraftClear={onWoopDraftClear}
          />
        );
      })() : null}
      {view.level === 'woop' ? (() => {
        const woop = view.aspiration.woops[view.woopIdx];
        if (!woop) return null;

        return (
          <WoopDetailView
            woop={woop}
            aspirationOwner={view.aspiration.owner}
            woopIdx={view.woopIdx}
            onEditWoop={onEditWoop}
            onDeleteWoop={onDeleteWoop}
            onAddSmarter={onAddSmarter}
            onAutoSeedSmarterPlans={onAutoSeedSmarterPlans}
            onSelectSmarter={onSelectSmarter}
          />
        );
      })() : null}
      {view.level === 'smarter-edit' ? (() => {
        const woop = view.aspiration.woops[view.woopIdx];
        const editingSmarter = view.smarterIdx !== null
          ? woop?.smarters[view.smarterIdx]
          : createBlankSmarter();
        if (!editingSmarter) return null;

        return (
          <GoalSmarterEditor
            smarter={editingSmarter}
            woopOutcomes={woop?.outcome ?? []}
            woopObstacles={woop?.obstacle ?? []}
            onSave={(updated) => onSaveSmarter(updated, view.smarterIdx)}
            onProceedToAct={(draft) => onProceedToAct(draft, view.smarterIdx)}
            onCancel={onCancelSmarterEdit}
            onDraftChange={onSmarterDraftChange}
            onDraftClear={onSmarterDraftClear}
          />
        );
      })() : null}
      {view.level === 'act-edit' ? (() => {
        const woop = view.aspiration.woops[view.woopIdx];
        const smarter = woop?.smarters[view.smarterIdx];
        if (!smarter) return null;

        return (
          <GoalActEditor
            nestedAct={smarter.nestedAct}
            onSave={(updated) => onSaveAct(updated, view.smarterIdx)}
            onBack={() => onBack()}
          />
        );
      })() : null}
      {view.level === 'smarter' ? (() => {
        const woop = view.aspiration.woops[view.woopIdx];
        const smarter = woop?.smarters[view.smarterIdx];
        if (!smarter) return null;

        return (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-3">
              <IconDisplay iconKey={smarter.icon} size={24} className="opacity-80 shrink-0" />
              <p className="text-white/80 text-sm font-medium flex-1 truncate">
                {smarter.name || 'SMARTER'}
              </p>
              <div className="flex items-center gap-1 shrink-0">
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  smarter.completionState === 'complete'
                    ? 'bg-green-900/40 text-green-400'
                    : 'bg-white/5 text-white/20'
                }`}>
                  {smarter.completionState}
                </span>
                {view.aspiration.owner !== 'coach' && (
                  <SmarterActionsMenu
                    smarterIdx={view.smarterIdx}
                    onEdit={onEditSmarter}
                    onDelete={onDeleteSmarter}
                  />
                )}
              </div>
            </div>
            <SmarterDetailView
              smarter={smarter}
              onEditAct={() => onOpenAct(view.smarterIdx)}
              onZoomToAct={onZoomToAct}
              onLeaveActTab={onLeaveActTab}
            />
          </div>
        );
      })() : null}
    </div>
  );
}

function WoopDetailView({
  woop,
  aspirationOwner,
  woopIdx,
  onEditWoop,
  onDeleteWoop,
  onAddSmarter,
  onAutoSeedSmarterPlans,
  onSelectSmarter,
}: {
  woop: Woop;
  aspirationOwner: string;
  woopIdx: number;
  onEditWoop: (idx: number) => void;
  onDeleteWoop: (idx: number) => void;
  onAddSmarter: () => void;
  onAutoSeedSmarterPlans: () => void;
  onSelectSmarter: (idx: number) => void;
}) {
  const [activeTab, setActiveTab] = useState(0);
  const TABS = ['W', 'O', 'O', 'P'];
  const wishSeq = analyzeWoopText(woop.wish);
  const outcomeSeq = analyzeWoopText(woop.outcome.join(' '));
  const obstacleSeq = analyzeWoopText(woop.obstacle.join(' '));

  function buildDisplayGradient(seq: WoopBankMatch[], alpha = 0.18): string {
    if (seq.length === 0) return 'transparent';
    const colors = seq.map(bank => BANK_COLORS[bank].replace('1)', `${alpha})`));
    if (colors.length === 1) return `linear-gradient(to bottom, ${colors[0]}, transparent)`;
    return `linear-gradient(to right, ${colors.join(', ')})`;
  }

  function buildAllGradient(): string {
    const allSeq = [...wishSeq, ...outcomeSeq, ...obstacleSeq];
    if (allSeq.length === 0) return 'transparent';
    const colors = allSeq.map(bank => BANK_COLORS[bank].replace('1)', '0.18)'));
    if (colors.length === 1) return `linear-gradient(to bottom, ${colors[0]}, transparent)`;
    return `linear-gradient(to right, ${colors.join(', ')})`;
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-3 pb-2 border-b border-white/5">
        <IconDisplay iconKey={woop.icon} size={20} className="opacity-80 shrink-0" />
        <p className="text-white/80 text-sm font-medium flex-1 truncate">
          {woop.name || woop.wish || 'WOOP'}
        </p>
        {aspirationOwner !== 'coach' && (
          <WoopActionsMenu
            woopIdx={woopIdx}
            onEdit={onEditWoop}
            onDelete={onDeleteWoop}
            onAddSmarter={onAddSmarter}
          />
        )}
      </div>

      <div className="flex border-b border-white/5">
        {TABS.map((letter, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
              activeTab === i
                ? 'text-white border-indigo-400'
                : 'text-white/25 border-transparent hover:text-white/50'
            }`}
          >
            {letter}
          </button>
        ))}
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 transition-all duration-700"
        style={{
          background: activeTab === 3
            ? buildAllGradient()
            : activeTab === 0
            ? buildDisplayGradient(wishSeq)
            : activeTab === 1
            ? buildDisplayGradient(outcomeSeq)
            : buildDisplayGradient(obstacleSeq),
        }}
      >
        {activeTab === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 py-4">
            <p className="text-white/30 text-xs uppercase tracking-wider">Wish</p>
            <div className="w-full rounded-lg border border-white/10 px-4 py-3 bg-black/20">
              <p className="text-white/70 text-sm text-center leading-relaxed">
                {woop.wish || 'No wish set'}
              </p>
            </div>
          </div>
        )}
        {activeTab === 1 && (
          <div className="flex flex-col gap-3 py-4">
            <p className="text-white/30 text-xs uppercase tracking-wider text-center">Outcome</p>
            {woop.outcome.length > 0
              ? woop.outcome.map((o, i) => (
                  <div key={i} className="w-full rounded-lg border border-white/10 px-4 py-3 bg-black/20">
                    <p className="text-white/70 text-sm leading-relaxed">{o}</p>
                  </div>
                ))
              : <p className="text-white/25 text-xs text-center py-4">No outcomes defined</p>
            }
          </div>
        )}
        {activeTab === 2 && (
          <div className="flex flex-col gap-3 py-4">
            <p className="text-white/30 text-xs uppercase tracking-wider text-center">Obstacle</p>
            {woop.obstacle.length > 0
              ? woop.obstacle.map((o, i) => (
                  <div key={i} className="w-full rounded-lg border border-white/10 px-4 py-3 bg-black/20">
                    <p className="text-white/70 text-sm leading-relaxed">{o}</p>
                  </div>
                ))
              : <p className="text-white/25 text-xs text-center py-4">No obstacles defined</p>
            }
          </div>
        )}
        {activeTab === 3 && (
          <div className="flex flex-col gap-2">
            {woop.smarters.length > 0
              ? woop.smarters.map((smarter, i) => (
                  <div
                    key={i}
                    onClick={() => onSelectSmarter(i)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') onSelectSmarter(i);
                    }}
                    className="flex items-center gap-2 py-2 border-b border-white/5 cursor-pointer"
                  >
                    <IconDisplay iconKey={smarter.icon} size={14} className="opacity-60 shrink-0" />
                    <p className="text-white/60 text-xs flex-1 truncate">{smarter.name || 'SMARTER'}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      smarter.completionState === 'complete'
                        ? 'bg-green-900/40 text-green-400'
                        : 'bg-white/5 text-white/20'
                    }`}>
                      {smarter.completionState}
                    </span>
                  </div>
                ))
              : <p className="text-white/25 text-xs text-center py-4">No SMARTERs yet</p>
            }
            {aspirationOwner !== 'coach' && (() => {
              // Count outcomes and obstacles without a resolver
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
              const unresolvedCount =
                woop.outcome.filter((_, i) => !resolvedOutcomes.has(i)).length +
                woop.obstacle.filter((_, i) => !resolvedObstacles.has(i)).length;

              return unresolvedCount > 0 ? (
                <button
                  onClick={onAutoSeedSmarterPlans}
                  className="w-full py-2 rounded-lg border border-indigo-400/30 text-indigo-300/70 text-xs hover:text-indigo-300 hover:border-indigo-400/50 mt-1"
                >
                  ✦ Seed {unresolvedCount} unresolved plan{unresolvedCount !== 1 ? 's' : ''}
                </button>
              ) : null;
            })()}
            {aspirationOwner !== 'coach' && (
              <button
                onClick={onAddSmarter}
                className="w-full py-2 rounded-lg border border-white/10 text-white/40 text-xs hover:text-white/60 mt-1"
              >
                + Add SMARTER
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SmarterDetailView({
  smarter,
  onEditAct,
  onZoomToAct,
  onLeaveActTab,
}: {
  smarter: Smarter;
  onEditAct: () => void;
  onZoomToAct: () => void;
  onLeaveActTab: () => void;
}) {
  const [activeTab, setActiveTab] = useState(1);

  const TABS = ['Act', 'S', 'M', 'A', 'R', 'T', 'E', 'R'];

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-col border-r border-white/5 py-2">
        {TABS.map((letter, i) => (
          <button
            key={i}
            onClick={() => {
              if (activeTab === 0 && i !== 0) onLeaveActTab();
              setActiveTab(i);
              if (i === 0) onZoomToAct();
            }}
            className={`w-9 h-9 flex items-center justify-center text-xs font-medium transition-colors
              ${activeTab === i
                ? i === 0
                  ? 'text-amber-400 bg-white/8 border-r-2 border-amber-400 -mr-px'
                  : 'text-white bg-white/8 border-r-2 border-indigo-400 -mr-px'
                : 'text-white/25 hover:text-white/50'
              }`}
          >
            {letter}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {activeTab === 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-white/50 text-xs uppercase tracking-wider">Act</p>
              <button
                onClick={onEditAct}
                className="text-white/30 text-xs hover:text-white/60"
              >
                Edit Act
              </button>
            </div>
            <div>
              <p className="text-white/20 text-xs uppercase tracking-wider mb-1">Accountability</p>
              <p className="text-white/25 text-xs">Coming soon</p>
            </div>
            <div>
              <p className="text-white/20 text-xs uppercase tracking-wider mb-1">Commitment</p>
              {smarter.nestedAct.commitment.trackedTaskRefs.length > 0
                ? smarter.nestedAct.commitment.trackedTaskRefs.map((ref, i) => (
                    <p key={i} className="text-white/60 text-xs">{ref}</p>
                  ))
                : <p className="text-white/25 text-xs">No task refs set</p>
              }
            </div>
            <div>
              <p className="text-white/20 text-xs uppercase tracking-wider mb-1">Tether</p>
              <p className="text-white/25 text-xs">Coming soon</p>
            </div>
          </div>
        )}

        {activeTab === 1 && (
          <div className="flex flex-col gap-3">
            <p className="text-white/50 text-xs uppercase tracking-wider">Specific</p>
            {smarter.specific.goalType && (
              <div className="rounded-lg border border-white/10 px-3 py-2 bg-white/3">
                <p className="text-white/60 text-xs capitalize">{smarter.specific.goalType}</p>
              </div>
            )}
            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-white/20 text-xs uppercase tracking-wider mb-1">
                  {smarter.specific.goalType === 'reduction' ? 'Target Max' : 'Target'}
                </p>
                <p className="text-white/60 text-sm">
                  {smarter.specific.targetValue}{smarter.specific.unit ? ` ${smarter.specific.unit}` : ''}
                </p>
              </div>
              {smarter.specific.startValue != null && (
                <div className="flex-1">
                  <p className="text-white/20 text-xs uppercase tracking-wider mb-1">Starting From</p>
                  <p className="text-white/60 text-sm">
                    {smarter.specific.startValue}{smarter.specific.unit ? ` ${smarter.specific.unit}` : ''}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 2 && (
          <div className="flex flex-col gap-2">
            <p className="text-white/50 text-xs uppercase tracking-wider">Measurable</p>
            {(smarter.measurable.taskTemplateRefs ?? []).length > 0
              ? smarter.measurable.taskTemplateRefs!.map((ref, i) => (
                  <div key={i} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                    <p className="text-white/60 text-xs flex-1 truncate">{ref}</p>
                  </div>
                ))
              : <p className="text-white/25 text-xs">No tasks linked</p>
            }
          </div>
        )}

        {activeTab === 3 && (
          <div className="flex flex-col gap-3">
            <p className="text-white/50 text-xs uppercase tracking-wider">Attainable</p>
            <div className="flex items-center justify-between">
              <p className="text-white/30 text-xs">91-Day Feasibility</p>
              <p className="text-white/60 text-sm font-medium">
                {(smarter.attainable as Record<string, number>).feasibilityPct ?? 100}%
              </p>
            </div>
            {(smarter.attainable as Record<string, boolean>).takesLonger && (
              <p className="text-amber-400/70 text-xs">Takes longer than 91 days — tether planned</p>
            )}
            {((smarter.attainable as Record<string, string[]>).neededItems ?? []).length > 0 && (
              <div>
                <p className="text-white/20 text-xs uppercase tracking-wider mb-1">Prerequisites</p>
                {(smarter.attainable as Record<string, string[]>).neededItems.map((item, i) => (
                  <p key={i} className="text-white/50 text-xs">{item}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 4 && (
          <div className="flex flex-col gap-3">
            <p className="text-white/50 text-xs uppercase tracking-wider">Relevant</p>
            {(smarter.relevant as Record<string, string>).statGroup && (
              <div>
                <p className="text-white/20 text-xs uppercase tracking-wider mb-1">Stat Group</p>
                <p className="text-white/60 text-sm capitalize">
                  {(smarter.relevant as Record<string, string>).statGroup}
                </p>
              </div>
            )}
            {(smarter.relevant as Record<string, string>).resolvesType && (
              <div>
                <p className="text-white/20 text-xs uppercase tracking-wider mb-1">Resolves</p>
                <p className="text-white/60 text-sm capitalize">
                  {(smarter.relevant as Record<string, string>).resolvesType}{' '}
                  {Number((smarter.relevant as Record<string, number>).resolvesIdx) + 1}
                </p>
              </div>
            )}
            {!(smarter.relevant as Record<string, string>).statGroup &&
             !(smarter.relevant as Record<string, string>).resolvesType && (
              <p className="text-white/25 text-xs">Not configured</p>
            )}
          </div>
        )}

        {activeTab === 5 && (
          <div className="flex flex-col gap-3">
            <p className="text-white/50 text-xs uppercase tracking-wider">Timely</p>
            {(smarter.timely as unknown as Record<string, string>).startDate && smarter.timely.projectedFinish && (() => {
              const start = new Date((smarter.timely as unknown as Record<string, string>).startDate);
              const end = new Date(smarter.timely.projectedFinish!);
              const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
              return (
                <div className="rounded-lg border border-white/10 px-3 py-2 bg-white/3">
                  <p className="text-white/60 text-sm font-medium">{days}-day mission</p>
                  <p className="text-white/30 text-xs mt-0.5">
                    {(smarter.timely as unknown as Record<string, string>).startDate} → {smarter.timely.projectedFinish}
                  </p>
                </div>
              );
            })()}
            {smarter.timely.interval && (
              <div>
                <p className="text-white/20 text-xs uppercase tracking-wider mb-1">Check-in Schedule</p>
                <p className="text-white/60 text-sm capitalize">{smarter.timely.interval.frequency}
                  {smarter.timely.interval.days?.length > 0 ? ` — ${smarter.timely.interval.days[0]}` : ''}
                  {smarter.timely.interval.monthlyDay ? ` — day ${smarter.timely.interval.monthlyDay}` : ''}
                </p>
              </div>
            )}
            {!smarter.timely.projectedFinish && (
              <p className="text-white/25 text-xs">No timeline set</p>
            )}
          </div>
        )}

        {activeTab === 6 && (
          <div className="flex flex-col gap-2">
            <p className="text-white/50 text-xs uppercase tracking-wider">Exit Strategy</p>
            <p className="text-white/60 text-sm capitalize">{smarter.exitStrategy.onMissedFinish}</p>
            <p className="text-white/25 text-xs">
              {smarter.exitStrategy.onMissedFinish === 'sleep' && 'Pauses at end date until resumed'}
              {smarter.exitStrategy.onMissedFinish === 'restart' && 'Resets progress and begins fresh'}
              {smarter.exitStrategy.onMissedFinish === 'extend' && 'Adds one more check-in period'}
              {smarter.exitStrategy.onMissedFinish === 'reschedule' && 'Pick a new end date, progress kept'}
            </p>
          </div>
        )}

        {activeTab === 7 && (
          <div className="flex flex-col gap-3">
            <p className="text-white/50 text-xs uppercase tracking-wider">Result</p>
            {(smarter.result as Record<string, string>).description && (
              <p className="text-white/60 text-sm">
                {(smarter.result as Record<string, string>).description}
              </p>
            )}
            {(smarter.result as Record<string, string>).itemRef && (
              <div>
                <p className="text-white/20 text-xs uppercase tracking-wider mb-1">Item Placement</p>
                <p className="text-white/50 text-xs">{(smarter.result as Record<string, string>).itemRef}</p>
              </div>
            )}
            {(smarter.result as Record<string, boolean>).executesTether && (
              <p className="text-amber-400/70 text-xs">Completion will execute a tether</p>
            )}
            {!(smarter.result as Record<string, string>).description &&
             !(smarter.result as Record<string, string>).itemRef &&
             !(smarter.result as Record<string, boolean>).executesTether && (
              <p className="text-white/25 text-xs">No result defined</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
