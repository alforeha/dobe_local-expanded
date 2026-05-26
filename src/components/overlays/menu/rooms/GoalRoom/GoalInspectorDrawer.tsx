import { useEffect, useRef, useState, type UIEvent } from 'react';
import type { Aspiration, NestedAct, Smarter, Woop } from '../../../../../types';
import type {
  BrainstormEntry,
  BrainstormIdea,
  EntryState,
  IdeaState,
  MainIdea,
  Storm,
  StormCategory,
  StormState,
  StormType,
} from '../../../../../types/brainstorm';
import { STORM_STATE_META, STORM_TYPE_META } from '../../../../../types/brainstorm';
import { ColorPicker } from '../../../../shared/ColorPicker';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { PopupShell } from '../../../../shared/popups/PopupShell';
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
  onAddEntry: (ideaId: string, content: string, state: EntryState) => void;
  onAddEntryToMainIdea: (mainIdeaId: string, entry: Omit<BrainstormEntry, 'id' | 'entries'>) => void;
  onDeleteStorm: () => void;
  onDeleteMainIdea: () => void;
  onDeleteIdea: () => void;
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
}

const ENTRY_STATES: EntryState[] = ['outcome', 'obstacle', 'question', 'solved', 'others'];
const STORM_TYPES: StormType[] = ['general', 'exploration', 'problem', 'planning', 'reflection', 'project', 'projection', 'others'];
const MAIN_IDEA_SECTION_TITLE: Record<StormType, string> = {
  general: 'General Ideas',
  exploration: 'Exploration Ideas',
  problem: 'Problem Ideas',
  planning: 'Planning Ideas',
  reflection: 'Reflection Ideas',
  project: 'Project Ideas',
  projection: 'Projection Ideas',
  others: 'Ideas',
};
const STORM_STATES: StormState[] = ['active', 'incubating', 'archived', 'resolved', 'folding'];
const STORM_STATE_ROW_BG: Record<StormState, string> = {
  active: 'bg-blue-900/30',
  incubating: 'bg-yellow-900/20',
  archived: 'bg-neutral-800/30',
  resolved: 'bg-green-900/20',
  folding: 'bg-neutral-700/10',
};
const IDEA_STATE_ROW_BG: Record<IdeaState, string> = {
  open: 'bg-sky-900/20',
  'in-progress': 'bg-amber-900/20',
  resolved: 'bg-emerald-900/20',
  parked: 'bg-slate-800/30',
  others: 'bg-neutral-800/25',
};

type BrainstormModalMode = 'mainIdea' | 'idea' | 'childIdea' | 'entry' | 'rename' | 'storm';

function getEntryBadgeStyle(state: EntryState) {
  const backgroundByState: Record<EntryState, string> = {
    outcome: '#10b981',
    obstacle: '#ef4444',
    question: '#f59e0b',
    solved: '#6366f1',
    others: '#64748b',
  };

  return {
    background: backgroundByState[state],
    color: 'white',
  };
}

function BrainstormNameModal({
  title,
  placeholder,
  defaultValue,
  defaultType,
  includeTypeSelector,
  onConfirm,
  onClose,
}: {
  title: string;
  placeholder: string;
  defaultValue?: string;
  defaultType?: StormType;
  includeTypeSelector?: boolean;
  onConfirm: (name: string, type?: StormType) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultValue ?? '');
  const [stormType, setStormType] = useState<StormType>(defaultType ?? 'exploration');

  function handleConfirm() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed, includeTypeSelector ? stormType : undefined);
  }

  return (
    <PopupShell title={title} onClose={onClose}>
      <div className="space-y-3">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleConfirm();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
          placeholder={placeholder}
          autoFocus
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
        {includeTypeSelector ? (
          <select
            value={stormType}
            onChange={(event) => setStormType(event.target.value as StormType)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          >
            {STORM_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        ) : null}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            Create
          </button>
        </div>
      </div>
    </PopupShell>
  );
}

function BrainstormEntryModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (content: string, state: EntryState) => void;
  onClose: () => void;
}) {
  const [entryContent, setEntryContent] = useState('');
  const [entryState, setEntryState] = useState<EntryState>('outcome');

  function handleConfirm() {
    const content = entryContent.trim();
    if (!content) return;
    onConfirm(content, entryState);
  }

  return (
    <PopupShell title="Add Entry" onClose={onClose}>
      <div className="space-y-3">
        <input
          type="text"
          value={entryContent}
          onChange={(event) => setEntryContent(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleConfirm();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
          placeholder="Entry content..."
          autoFocus
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
        <div className="flex flex-wrap gap-2">
          {ENTRY_STATES.map((state) => {
            const isActive = entryState === state;
            return (
              <button
                key={state}
                type="button"
                onClick={() => setEntryState(state)}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors"
                style={isActive ? getEntryBadgeStyle(state) : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)' }}
              >
                {state}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            Add
          </button>
        </div>
      </div>
    </PopupShell>
  );
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
  onDeleteStorm,
  onDeleteMainIdea,
  onDeleteIdea,
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
        selectedIdea || selectedMainIdea ? (
          <div className="flex items-center justify-between px-4 py-4">
            <span className="text-white/80 text-sm font-medium">
              {selectedIdea?.title ?? selectedMainIdea?.title ?? 'Brainstorm'}
            </span>
            <button
              type="button"
              onClick={() => onBack()}
              className="text-white/40 hover:text-white/80 text-xs px-2 py-1"
            >
              BACK
            </button>
          </div>
        ) : addingStorm || editingStorm ? (
          <div className="px-4 py-4">
            <div className="flex items-center justify-between">
              <span className="text-white/80 text-sm font-medium">
                {editingStorm ? 'EDIT STORM' : 'ADD STORM'}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (editingStorm) {
                    setEditingStorm(false);
                    setAddingStorm(false);
                    brainstormDraftRef.current = null;
                  } else {
                    resetAddStormState();
                  }
                }}
                className="text-white/40 hover:text-white/80 text-xs px-2 py-1"
              >
                BACK
              </button>
            </div>
          </div>
        ) : selectedStorm ? (
          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center">
                <IconDisplay iconKey={`storm-brain-${selectedStorm.state}`} size={18} className="-mr-1 shrink-0 opacity-90" />
                <div className="relative flex-1">
                  <div className="flex h-4 w-full overflow-hidden rounded-full bg-white/5">
                    {selectedStorm.brainWidthCap > 0 ? (
                      <>
                        <div
                          className="h-full bg-white/20"
                          style={{ width: `${Math.max(0, Math.min(100, (selectedStorm.brainWidthStaked / selectedStorm.brainWidthCap) * 100))}%` }}
                        />
                        <div
                          className="h-full bg-blue-400/70"
                          style={{ width: `${Math.max(0, Math.min(100, ((selectedStorm.brainWidthPoints - selectedStorm.brainWidthStaked) / selectedStorm.brainWidthCap) * 100))}%` }}
                        />
                        <div
                          className="h-full bg-white/5"
                          style={{ width: `${Math.max(0, Math.min(100, ((selectedStorm.brainWidthCap - selectedStorm.brainWidthPoints) / selectedStorm.brainWidthCap) * 100))}%` }}
                        />
                      </>
                    ) : (
                      <div className="h-full w-full bg-white/5" />
                    )}
                  </div>
                  <div className="absolute inset-y-0 right-1 flex items-center text-[10px] text-white/70">
                    {selectedStorm.brainWidthPoints} / {selectedStorm.brainWidthCap}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectStorm(null)}
                className="text-white/40 hover:text-white/80 text-xs px-2 py-1"
              >
                BACK
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-white/80 text-sm font-medium">
                <IconDisplay iconKey="goal-brainstorm" size={16} className="shrink-0 opacity-90" />
                <span>Brainstorm Alley</span>
              </span>
              <button
                type="button"
                onClick={() => onBack()}
                className="text-white/40 hover:text-white/80 text-xs px-2 py-1"
              >
                BACK
              </button>
            </div>
            {!showStormOverview ? (
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode('mainIdea')}
                  className="text-xs text-white/55 hover:text-white/75"
                >
                  + New Main Idea
                </button>
              </div>
            ) : null}
          </div>
        )
      ) : view.level === 'root' ? (
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
      {view.level === 'brainstorm' ? (
        addingStorm || editingStorm ? (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-4">
              {!categoryPickerOpen && !typePickerOpen && !statePickerOpen ? (
                <input
                  type="text"
                  value={newStormName}
                  onChange={(event) => setNewStormName(event.target.value)}
                  placeholder="Storm name..."
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
                />
              ) : null}
              {!typePickerOpen && !statePickerOpen ? (
                <div className="space-y-2">
                  <label className="block text-xs font-medium uppercase tracking-[0.12em] text-white/40">
                    Category
                  </label>
                  {categoryPickerOpen ? (
                    <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <input
                        type="text"
                        value={categoryInput}
                        onChange={(event) => setCategoryInput(event.target.value)}
                        placeholder="Category name..."
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
                      />
                      <div className="flex justify-start">
                        <ColorPicker
                          value={newStormCategory.color}
                          onChange={(hex) => {
                            const category = { ...newStormCategory, color: hex };
                            setNewStormCategory(category);
                            brainstormDraftRef.current = { type: newStormType, category };
                          }}
                          align="left"
                        />
                      </div>
                      <div className="space-y-2">
                        {existingStormCategories.map((category) => (
                          <button
                            key={`${category.name}-${category.color}`}
                            type="button"
                            onClick={() => {
                              setNewStormCategory(category);
                              brainstormDraftRef.current = { type: newStormType, category };
                              setCategoryInput(category.name);
                              setCategoryPickerOpen(false);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left text-sm text-white/70 transition hover:bg-white/[0.05] hover:text-white"
                          >
                            <span
                              className="inline-block h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: category.color }}
                            />
                            <span className="truncate">{category.name}</span>
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const newCategory = {
                            name: categoryInput.trim() || 'Thought Train',
                            color: newStormCategory.color,
                          };
                          setNewStormCategory(newCategory);
                          brainstormDraftRef.current = { type: newStormType, category: newCategory };
                          setCategoryPickerOpen(false);
                        }}
                        className="w-full rounded-lg border border-white/10 px-3 py-2 text-sm text-white transition hover:border-white/20 hover:bg-white/[0.05]"
                      >
                        Set Category
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryInput(newStormCategory.name);
                        setCategoryPickerOpen(true);
                        setTypePickerOpen(false);
                        setStatePickerOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: newStormCategory.color }}
                        />
                        <span className="truncate">{newStormCategory.name}</span>
                      </span>
                      <span className="text-white/40 text-xs">&gt;</span>
                    </button>
                  )}
                </div>
              ) : null}
              {!categoryPickerOpen && !statePickerOpen ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setTypePickerOpen((open) => !open);
                      setStatePickerOpen(false);
                      setCategoryPickerOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                  >
                    <span className="flex items-center gap-3">
                      <IconDisplay iconKey={`storm-${newStormType}`} size={18} className="shrink-0 opacity-90" />
                      <span>{STORM_TYPE_META[newStormType].displayName}</span>
                    </span>
                    <span className="text-white/40 text-xs">Type</span>
                  </button>
                  {typePickerOpen ? (
                    <div className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-lg border border-white/10 bg-[#161624] shadow-xl">
                      {STORM_TYPES.map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setNewStormType(type);
                            brainstormDraftRef.current = { type, category: newStormCategory };
                            setTypePickerOpen(false);
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                        >
                          <IconDisplay iconKey={`storm-${type}`} size={18} className="shrink-0 opacity-90" />
                          <span>{STORM_TYPE_META[type].displayName}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {!categoryPickerOpen && !typePickerOpen ? (
                <>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setStatePickerOpen((open) => !open);
                        setTypePickerOpen(false);
                        setCategoryPickerOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                    >
                      <span className="flex items-center gap-3">
                        <IconDisplay iconKey={STORM_STATE_META[newStormState].iconKey} size={18} className="shrink-0 opacity-90" />
                        <span>{STORM_STATE_META[newStormState].displayName}</span>
                      </span>
                      <span className="text-white/40 text-xs">State</span>
                    </button>
                    {statePickerOpen ? (
                      <div className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-lg border border-white/10 bg-[#161624] shadow-xl">
                        {STORM_STATES.map((state) => (
                          <button
                            key={state}
                            type="button"
                            onClick={() => {
                              setNewStormState(state);
                              setStatePickerOpen(false);
                            }}
                            className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                          >
                            <IconDisplay iconKey={STORM_STATE_META[state].iconKey} size={18} className="shrink-0 opacity-90" />
                            <span>{STORM_STATE_META[state].displayName}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
              {!categoryPickerOpen && !typePickerOpen && !statePickerOpen ? (
                <button
                  type="button"
                  disabled={newStormName.trim() === ''}
                  onClick={handleAddStormConfirm}
                  className="w-full rounded-lg border border-white/10 px-3 py-2 text-sm text-white transition enabled:hover:border-white/20 enabled:hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:text-white/30"
                >
                  {editingStorm ? 'Save Storm' : 'Add Storm'}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
        showStormOverview ? (
          <>
            <div
              ref={stormScrollRef}
              className="flex-1 overflow-y-auto flex flex-col"
              onScroll={handleStormScroll}
            >
              {stormList.length > 0 ? (
                <>
                  {stormList.map((storm) => (
                    <button
                      key={storm.id}
                      type="button"
                      onClick={() => onSelectStorm(storm.id)}
                      className={`flex shrink-0 flex-row items-stretch gap-3 px-4 border-b border-white/5 text-left w-full ${STORM_STATE_ROW_BG[storm.state]}`}
                      style={{ height: rowHeight }}
                    >
                      <div className="flex items-center justify-center w-4 shrink-0">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: storm.category.color }}
                        />
                      </div>
                      <div className="flex flex-col justify-center flex-1 gap-1 py-2 min-w-0">
                        <div className="flex items-center gap-2">
                          <IconDisplay iconKey={`storm-${storm.type}`} size={20} className="opacity-80 shrink-0" />
                          <span className="block text-white/80 text-sm truncate">{storm.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <IconDisplay iconKey={`storm-brain-${storm.state}`} size={18} className="opacity-80 shrink-0" />
                          <div className="relative flex-1">
                            <div className="flex h-5 w-full overflow-hidden rounded-full bg-white/5">
                              {storm.brainWidthCap > 0 ? (
                                <>
                                  <div
                                    className="h-full bg-white/20"
                                    style={{ width: `${Math.max(0, Math.min(100, (storm.brainWidthStaked / storm.brainWidthCap) * 100))}%` }}
                                  />
                                  <div
                                    className="h-full bg-blue-400/70"
                                    style={{ width: `${Math.max(0, Math.min(100, ((storm.brainWidthPoints - storm.brainWidthStaked) / storm.brainWidthCap) * 100))}%` }}
                                  />
                                  <div
                                    className="h-full bg-white/5"
                                    style={{ width: `${Math.max(0, Math.min(100, ((storm.brainWidthCap - storm.brainWidthPoints) / storm.brainWidthCap) * 100))}%` }}
                                  />
                                </>
                              ) : (
                                <div className="h-full w-full bg-white/5" />
                              )}
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70">
                              {storm.brainWidthPoints.toString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                  <div style={{ height: rowHeight * 3 }} aria-hidden="true" />
                </>
              ) : (
                <div className="flex shrink-0 items-center gap-3 px-4 border-b border-white/5 text-left w-full" style={{ height: rowHeight }}>
                  <span className="flex-1 text-white/40 text-sm truncate">No storms yet</span>
                </div>
              )}
            </div>
            <div className="px-4 pb-4 pt-2">
              <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={handleAddStormOpen}
                className="w-full py-2 rounded-lg border border-white/10 text-white/50 text-xs hover:border-white/20 hover:text-white/70"
              >
                + New Storm
              </button>
              </div>
            </div>
          </>
        ) : selectedMainIdea === null ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex items-start justify-between border-b border-white/10 px-4 py-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <IconDisplay iconKey={`storm-${selectedStorm?.type ?? 'general'}`} size={24} className="shrink-0 opacity-90" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: selectedStorm?.category.color ?? '#7c3aed' }}
                      />
                      <span className="text-xs text-white/50">{selectedStorm?.category.name}</span>
                    </div>
                    <div className="truncate text-base font-medium text-white">
                      {selectedStorm?.name}
                    </div>
                  </div>
                </div>
                <div
                  className="relative"
                  tabIndex={0}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setActionMenuOpen(false);
                      setConfirmDelete(false);
                    }
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActionMenuOpen((open) => !open);
                      setConfirmDelete(false);
                    }}
                    className="px-2 py-1 text-xs text-white/40 hover:text-white/80"
                  >
                    ...
                  </button>
                  {actionMenuOpen ? (
                    <div className="absolute right-0 top-8 z-50 min-w-[140px] overflow-hidden rounded-lg border border-white/10 bg-gray-900">
                      {!confirmDelete ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              if (!selectedStorm) return;
                              brainstormDraftRef.current = {
                                type: selectedStorm.type,
                                category: selectedStorm.category,
                              };
                              setEditingStorm(true);
                              setAddingStorm(true);
                              setActionMenuOpen(false);
                            }}
                            className="w-full px-4 py-2.5 text-left text-sm text-white/70 hover:bg-white/5"
                          >
                            Edit Storm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(true)}
                            className="w-full px-4 py-2.5 text-left text-sm text-red-400/80 hover:bg-white/5"
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <div className="px-4 py-3">
                          <p className="pb-2 text-xs text-white/50">Confirm delete?</p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteStorm();
                                setActionMenuOpen(false);
                                setConfirmDelete(false);
                              }}
                              className="flex-1 rounded-md bg-red-500/80 px-3 py-1.5 text-xs text-white hover:bg-red-500"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(false)}
                              className="flex-1 rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/5"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="px-4 pt-3 pb-1 text-xs text-white/40 uppercase tracking-wider">
                  {MAIN_IDEA_SECTION_TITLE[selectedStorm?.type ?? 'others'] ?? 'Ideas'}
                </div>
                {selectedStormMainIdeas.length > 0 ? (
                  selectedStormMainIdeas.map((mainIdea) => {
                    const totalEntryCount = mainIdea.entries.length + mainIdea.ideas.reduce((count, ideaId) => {
                      const idea = selectedStorm?.ideas[ideaId];
                      return count + (idea?.entries.length ?? 0);
                    }, 0);

                    return (
                      <button
                        key={mainIdea.id}
                        type="button"
                        onClick={() => onSelectMainIdea(mainIdea.id)}
                        className={`flex w-full items-center justify-between gap-3 border-b border-white/5 px-4 py-2 text-left ${IDEA_STATE_ROW_BG[mainIdea.state]}`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <IconDisplay iconKey={`idea-${mainIdea.type || 'others'}`} size={22} className="shrink-0 opacity-90" />
                          <div className="min-w-0">
                            <div className="truncate text-sm text-white/80">{mainIdea.title}</div>
                            <div className="text-[11px] uppercase tracking-[0.08em] text-white/35">
                              {mainIdea.state}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                            {mainIdea.ideas.length} ideas
                          </span>
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                            {totalEntryCount} entries
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm text-white/30">
                    No ideas yet
                  </div>
                )}
              </div>
              <div className="border-t border-white/10 px-4 pb-4 pt-3">
                <button
                  type="button"
                  onClick={() => { console.log('enter storm'); }}
                  className="mb-3 w-full rounded-lg border border-white/10 py-2 text-xs text-white/50 hover:border-white/20 hover:text-white/70"
                >
                  Enter Storm
                </button>
                <button
                  type="button"
                  onClick={() => setModalMode('mainIdea')}
                  className="w-full rounded-lg border border-white/10 py-2 text-xs text-white/50 hover:border-white/20 hover:text-white/70"
                >
                  + New Main Idea
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-2">
              <div className="flex items-center justify-between border-b border-white/5 pb-1 pt-2">
                <div className="flex gap-4">
                  {(['entries', 'ideas'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setIdeaActiveTab(tab)}
                      className={`border-b-2 pb-0.5 text-xs font-medium transition-colors ${
                        ideaActiveTab === tab
                          ? 'border-emerald-400 text-emerald-300'
                          : 'border-transparent text-white/35 hover:text-white/60'
                      }`}
                    >
                      {tab === 'entries' ? 'Entries' : 'Ideas'}
                    </button>
                  ))}
                </div>
                <div
                  className="relative"
                  tabIndex={0}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setActionMenuOpen(false);
                      setConfirmDelete(false);
                    }
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActionMenuOpen((open) => !open);
                      setConfirmDelete(false);
                    }}
                    className="text-white/40 hover:text-white/80 px-2 py-1 text-xs"
                  >
                    ...
                  </button>
                  {actionMenuOpen ? (
                    <div className="absolute right-0 top-8 z-50 min-w-[140px] overflow-hidden rounded-lg border border-white/10 bg-gray-900">
                      {!confirmDelete ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setModalMode(selectedIdea ? 'childIdea' : 'idea');
                              setActionMenuOpen(false);
                            }}
                            className="w-full px-4 py-2.5 text-left text-white/70 text-sm hover:bg-white/5"
                          >
                            Add Idea
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setModalMode('entry');
                              setActionMenuOpen(false);
                            }}
                            className="w-full px-4 py-2.5 text-left text-white/70 text-sm hover:bg-white/5"
                          >
                            Add Entry
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setModalMode('rename');
                              setActionMenuOpen(false);
                            }}
                            className="w-full px-4 py-2.5 text-left text-white/70 text-sm hover:bg-white/5"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(true)}
                            className="w-full px-4 py-2.5 text-left text-red-400/80 text-sm hover:bg-white/5"
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <div className="px-4 py-3">
                          <p className="pb-2 text-xs text-white/50">Confirm delete?</p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (selectedIdeaId !== null) {
                                  onDeleteIdea();
                                } else if (selectedMainIdeaId !== null) {
                                  onDeleteMainIdea();
                                } else if (selectedStormId !== null) {
                                  onDeleteStorm();
                                }
                                setConfirmDelete(false);
                                setActionMenuOpen(false);
                              }}
                              className="flex-1 rounded border border-red-500/20 px-2 py-1.5 text-xs text-red-300 hover:bg-white/5"
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDelete(false);
                                setActionMenuOpen(false);
                              }}
                              className="flex-1 rounded border border-white/10 px-2 py-1.5 text-xs text-white/60 hover:bg-white/5"
                            >
                              No
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
              {ideaActiveTab === 'entries' ? (
                <div className="pb-3 pt-2">
                  {currentEntries.length > 0 ? (
                    currentEntries.map((entry) => (
                      <div key={entry.id} className="flex items-center gap-2 py-1.5">
                        <span className="min-w-0 flex-1 truncate text-xs text-white/50">
                          {entry.content.length > 60 ? `${entry.content.slice(0, 60)}...` : entry.content}
                        </span>
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase"
                          style={getEntryBadgeStyle(entry.state)}
                        >
                          {entry.state}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="py-2 text-xs text-white/35">No entries yet</div>
                  )}
                </div>
              ) : (
                <div className="pb-3 pt-2">
                  {currentChildIdeas.length > 0 ? (
                    currentChildIdeas.map((idea) => (
                      <button
                        key={idea.id}
                        type="button"
                        onClick={() => onSelectIdea(idea.id)}
                        className="flex w-full items-center gap-3 py-2 text-left"
                      >
                        <span className="flex-1 text-sm text-white/75">{idea.title}</span>
                        <span className="text-xs text-white/35">
                          {idea.entries.length} entr{idea.entries.length === 1 ? 'y' : 'ies'}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="py-2 text-xs text-white/35">No ideas yet</div>
                  )}
                </div>
              )}
            </div>
        ))
      ) : null}
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
      {modalMode === 'entry' ? (
        <BrainstormEntryModal
          onConfirm={(content, state) => {
            if (selectedIdea) {
              onAddEntry(selectedIdea.id, content, state);
            } else if (selectedMainIdea) {
              onAddEntryToMainIdea(selectedMainIdea.id, { content, state, pointsTo: [] });
            }
            setModalMode(null);
          }}
          onClose={() => setModalMode(null)}
        />
      ) : null}
      {modalMode !== null && modalMode !== 'entry' ? (
        <BrainstormNameModal
          title={modalMode === 'storm' ? 'New Storm' : modalMode === 'mainIdea' ? 'New Main Idea' : modalMode === 'idea' ? 'New Idea' : modalMode === 'childIdea' ? 'New Sub-Idea' : 'Rename'}
          placeholder={modalMode === 'rename' ? (selectedIdea?.title ?? selectedMainIdea?.title ?? 'Enter a title...') : modalMode === 'storm' ? 'Storm name...' : 'Enter a title...'}
          defaultValue={modalMode === 'rename' ? (selectedIdea?.title ?? selectedMainIdea?.title ?? '') : ''}
          defaultType="exploration"
          includeTypeSelector={modalMode === 'storm'}
          onConfirm={handleBrainstormModalConfirm}
          onClose={() => setModalMode(null)}
        />
      ) : null}
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
