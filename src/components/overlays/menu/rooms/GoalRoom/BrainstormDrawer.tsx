import { useEffect, useState, type Dispatch, type RefObject, type SetStateAction, type UIEvent } from 'react';
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
import { useBrainstormStore } from '../../../../../stores/useBrainstormStore';
import {
  ENTRY_TYPE_META,
  STORM_STATE_META,
  STORM_TYPE_META,
  getUnlockedIdeaTypes,
  makeDefaultIdeaTypeData,
} from '../../../../../types/brainstorm';
import { resolveIcon } from '../../../../../constants/iconMap';
import { ColorPicker } from '../../../../shared/ColorPicker';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { IconPicker } from '../../../../shared/IconPicker';
import { PopupShell } from '../../../../shared/popups/PopupShell';
import { brainstormDraftRef } from './brainstormDraftRef';

export type BrainstormModalMode = 'mainIdea' | 'idea' | 'childIdea' | 'entry' | 'rename' | 'storm';

const ENTRY_STATES: EntryState[] = ['outcome', 'obstacle', 'question', 'solved', 'others'];
const ENTRY_TYPES: EntryType[] = ['general', 'observation', 'question', 'research', 'hypothesis', 'test', 'review', 'result', 'bet', 'others'];
const IDEA_STATES: IdeaState[] = ['open', 'in-progress', 'resolved', 'parked', 'others'];
const IDEA_TYPES: IdeaType[] = [
  'insight',
  'question',
  'hypothesis',
  'blocker',
  'action',
  'node',
  'spark',
  'blip',
  'box',
  'data',
  'peak',
  'prop',
  'others',
];
const MAIN_IDEA_SECTION_TITLE: Record<StormType, string> = {
  general: 'General Ideas',
  exploration: 'Exploration Ideas',
  problem: 'Problem Ideas',
  planning: 'Planning Ideas',
  reflection: 'Reflection Ideas',
  project: 'Project Ideas',
  projection: 'Projection Ideas',
  work: 'Loads',
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
const IDEA_STATE_SWATCH: Record<IdeaState, string> = {
  open: '#4ade80',
  'in-progress': '#60a5fa',
  resolved: '#2dd4bf',
  parked: '#9ca3af',
  others: '#ffffff',
};
const ENTRY_STATE_SWATCH: Record<EntryState, string> = {
  outcome: '#4ade80',
  obstacle: '#f87171',
  question: '#60a5fa',
  solved: '#2dd4bf',
  others: '#ffffff',
};

function formatIdeaStateLabel(state: IdeaState) {
  return state === 'others' ? 'General' : state.replace(/-/g, ' ');
}

function formatIdeaTypeLabel(type: IdeaType) {
  return type === 'others' ? 'General' : type;
}

function formatEntryStateLabel(state: EntryState) {
  return state === 'others' ? 'General' : state.replace(/-/g, ' ');
}

function formatEntryTypeLabel(type: EntryType) {
  return type === 'others' ? 'General' : ENTRY_TYPE_META[type].displayName;
}

function getEntryBadgeStyle(entry: BrainstormEntry) {
  return {
    background: entry.state === 'others'
      ? entry.customProperties?.stateColor ?? ENTRY_STATE_SWATCH.others
      : ENTRY_STATE_SWATCH[entry.state],
    color: 'white',
  };
}

function BrainstormNameModal({
  title,
  placeholder,
  defaultValue,
  onConfirm,
  onClose,
}: {
  title: string;
  placeholder: string;
  defaultValue?: string;
  onConfirm: (name: string, type?: StormType) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultValue ?? '');

  function handleConfirm() {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Storm type is no longer user-selected here — new storms are always
    // General Void (Sprint 5); Project/Work storms surface via Work Loads.
    onConfirm(trimmed);
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

export interface BrainstormDrawerProps {
  selectedStormId: string | null;
  selectedStorm: Storm | null;
  selectedMainIdeaId: string | null;
  selectedMainIdea: MainIdea | null;
  selectedIdeaId: string | null;
  selectedIdea: BrainstormIdea | null;
  stormCanvasOpen: boolean;
  currentEntries: BrainstormEntry[];
  currentChildIdeas: BrainstormIdea[];
  stormList: Storm[];
  selectedStormMainIdeas: MainIdea[];
  showStormOverview: boolean;
  addingStorm: boolean;
  editingStorm: boolean;
  newStormName: string;
  newStormType: StormType;
  newStormState: StormState;
  newStormCategory: StormCategory;
  /** Storm display icon draft — replaces the retired type dropdown (Sprint 5). */
  newStormIcon: string;
  categoryInput: string;
  categoryPickerOpen: boolean;
  typePickerOpen: boolean;
  statePickerOpen: boolean;
  modalMode: BrainstormModalMode | null;
  ideaActiveTab: 'ideas' | 'entries';
  actionMenuOpen: boolean;
  confirmDelete: boolean;
  existingStormCategories: StormCategory[];
  rowHeight: number;
  stormScrollRef: RefObject<HTMLDivElement | null>;
  onBack: () => void;
  onExitStorm: () => void;
  onSelectStorm: (id: string | null) => void;
  onSelectMainIdea: (id: string | null) => void;
  onSelectIdea: (id: string | null) => void;
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
    state?: EntryState;
    type?: EntryType;
    customProperties?: Record<string, string>;
  }) => void;
  onEnterStorm: () => void;
  onHandleAddStormOpen: () => void;
  onHandleAddStormConfirm: () => void;
  onHandleStormScroll: (event: UIEvent<HTMLDivElement>) => void;
  onResetAddStormState: () => void;
  onHandleBrainstormModalConfirm: (name: string, type?: StormType) => void;
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
  setAddingStorm: (adding: boolean) => void;
  setEditingStorm: Dispatch<SetStateAction<boolean>>;
  setNewStormName: Dispatch<SetStateAction<string>>;
  setNewStormState: Dispatch<SetStateAction<StormState>>;
  setNewStormCategory: Dispatch<SetStateAction<StormCategory>>;
  setNewStormIcon: Dispatch<SetStateAction<string>>;
  setCategoryInput: Dispatch<SetStateAction<string>>;
  setCategoryPickerOpen: Dispatch<SetStateAction<boolean>>;
  setTypePickerOpen: Dispatch<SetStateAction<boolean>>;
  setStatePickerOpen: Dispatch<SetStateAction<boolean>>;
  setModalMode: Dispatch<SetStateAction<BrainstormModalMode | null>>;
  setIdeaActiveTab: Dispatch<SetStateAction<'ideas' | 'entries'>>;
  setActionMenuOpen: Dispatch<SetStateAction<boolean>>;
  setConfirmDelete: Dispatch<SetStateAction<boolean>>;
}

export function BrainstormDrawer({
  selectedStormId,
  selectedStorm,
  selectedMainIdeaId,
  selectedMainIdea,
  selectedIdeaId,
  selectedIdea,
  stormCanvasOpen,
  currentEntries,
  currentChildIdeas,
  stormList,
  selectedStormMainIdeas,
  showStormOverview,
  addingStorm,
  editingStorm,
  newStormName,
  newStormType,
  newStormState,
  newStormCategory,
  newStormIcon,
  categoryInput,
  categoryPickerOpen,
  typePickerOpen,
  statePickerOpen,
  modalMode,
  ideaActiveTab,
  actionMenuOpen,
  confirmDelete,
  existingStormCategories,
  rowHeight,
  stormScrollRef,
  onBack,
  onExitStorm,
  onSelectStorm,
  onSelectMainIdea,
  onSelectIdea,
  onAddEntry,
  onAddEntryToMainIdea,
  onDeleteStorm,
  onDeleteMainIdea,
  onDeleteIdea,
  onDeleteEntry,
  onUpdateMainIdea,
  onUpdateIdea,
  onUpdateEntry,
  onEnterStorm,
  onHandleAddStormOpen,
  onHandleAddStormConfirm,
  onHandleStormScroll,
  onResetAddStormState,
  onHandleBrainstormModalConfirm,
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
  setAddingStorm,
  setEditingStorm,
  setNewStormName,
  setNewStormState,
  setNewStormCategory,
  setNewStormIcon,
  setCategoryInput,
  setCategoryPickerOpen,
  setTypePickerOpen,
  setStatePickerOpen,
  setModalMode,
  setIdeaActiveTab,
  setActionMenuOpen,
  setConfirmDelete,
}: BrainstormDrawerProps) {
  const addMainIdea = useBrainstormStore((state) => state.addMainIdea);
  const addIdea = useBrainstormStore((state) => state.addIdea);
  const addChildIdea = useBrainstormStore((state) => state.addChildIdea);
  const addSubEntry = useBrainstormStore((state) => state.addSubEntry);
  const [addingMainIdea, setAddingMainIdea] = useState(false);
  const [newMainIdeaTitle, setNewMainIdeaTitle] = useState('');
  const [newMainIdeaState, setNewMainIdeaState] = useState<IdeaState>('others');
  const [newMainIdeaType, setNewMainIdeaType] = useState<IdeaType>('insight');
  const [ideaStatePickerOpen, setIdeaStatePickerOpen] = useState(false);
  const [ideaTypePickerOpen, setIdeaTypePickerOpen] = useState(false);
  const [draftCustomStateColor, setDraftCustomStateColor] = useState('#ffffff');
  const [draftCustomColor, setDraftCustomColor] = useState('#ffffff');
  const [addingChildIdea, setAddingChildIdea] = useState(false);
  const [editingChildIdea, setEditingChildIdea] = useState(false);
  const [newChildIdeaTitle, setNewChildIdeaTitle] = useState('');
  const [newChildIdeaState, setNewChildIdeaState] = useState<IdeaState>('others');
  const [newChildIdeaType, setNewChildIdeaType] = useState<IdeaType>('others');
  const [newChildIdeaCustomColor, setNewChildIdeaCustomColor] = useState('#ffffff');
  const [newChildIdeaCustomStateColor, setNewChildIdeaCustomStateColor] = useState('#ffffff');
  const [childIdeaTypePickerOpen, setChildIdeaTypePickerOpen] = useState(false);
  const [childIdeaStatePickerOpen, setChildIdeaStatePickerOpen] = useState(false);
  const [addingEntry, setAddingEntry] = useState(false);
  const [addingSubEntry, setAddingSubEntry] = useState(false);
  const [subEntryParentId, setSubEntryParentId] = useState<string | null>(null);
  const [newEntryContent, setNewEntryContent] = useState('');
  const [newEntryType, setNewEntryType] = useState<EntryType>('others');
  const [newEntryCustomColor, setNewEntryCustomColor] = useState('#ffffff');
  const [newEntryState, setNewEntryState] = useState<EntryState>('others');
  const [newEntryCustomStateColor, setNewEntryCustomStateColor] = useState('#ffffff');
  const [editingEntry, setEditingEntry] = useState<BrainstormEntry | null>(null);
  const [editEntryContent, setEditEntryContent] = useState('');
  const [editEntryState, setEditEntryState] = useState<EntryState>('others');
  const [editEntryType, setEditEntryType] = useState<EntryType>('others');
  const [editEntryCustomColor, setEditEntryCustomColor] = useState('#ffffff');
  const [editEntryCustomStateColor, setEditEntryCustomStateColor] = useState('#ffffff');
  const [entryActionMenuOpenId, setEntryActionMenuOpenId] = useState<string | null>(null);
  const [confirmDeleteEntryId, setConfirmDeleteEntryId] = useState<string | null>(null);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [entryTypePickerOpen, setEntryTypePickerOpen] = useState(false);
  const [entryStatePickerOpen, setEntryStatePickerOpen] = useState(false);

  // ── Type-gated creation (Track C, Sprint 5) ─────────────────────────────────
  // Gating is config-driven: STORM_TYPE_META.allowedIdeaTypes / .gating decide
  // which idea types are creatable. Unconfigured storm types (general, etc.)
  // return null and keep the legacy full type list — existing behavior untouched.
  const unlockedIdeaTypes = selectedStorm ? getUnlockedIdeaTypes(selectedStorm) : null;
  const creatableIdeaTypes: IdeaType[] = unlockedIdeaTypes ?? IDEA_TYPES;
  const effectiveMainIdeaType: IdeaType = creatableIdeaTypes.includes(newMainIdeaType)
    ? newMainIdeaType
    : creatableIdeaTypes[0] ?? newMainIdeaType;
  const effectiveChildIdeaType: IdeaType = editingChildIdea || creatableIdeaTypes.includes(newChildIdeaType)
    ? newChildIdeaType
    : creatableIdeaTypes[0] ?? newChildIdeaType;
  const stageCount = selectedStorm
    ? Object.values(selectedStorm.ideas).filter((idea) => idea.type === 'stage').length
      + Object.values(selectedStorm.mainIdeas).filter((mainIdea) => mainIdea.type === 'stage').length
    : 0;

  function resetMainIdeaForm() {
    setAddingMainIdea(false);
    setNewMainIdeaTitle('');
    setNewMainIdeaState('others');
    setNewMainIdeaType('insight');
    setIdeaStatePickerOpen(false);
    setIdeaTypePickerOpen(false);
    setDraftCustomStateColor('#ffffff');
    setDraftCustomColor('#ffffff');
    onDraftMainIdeaStateChange('others');
    onDraftMainIdeaTypeChange('insight');
  }

  function handleSaveMainIdea() {
    const trimmedTitle = newMainIdeaTitle.trim();
    if (!selectedStormId || !trimmedTitle) return;
    if (creatableIdeaTypes.length === 0) return;
    const customProps: Record<string, string> = {};
    if (newMainIdeaState === 'others') {
      customProps.stateColor = draftCustomStateColor;
    }
    if (effectiveMainIdeaType === 'others') {
      customProps.typeColor = draftCustomColor;
    }
    addMainIdea(
      selectedStormId,
      trimmedTitle,
      newMainIdeaState,
      effectiveMainIdeaType,
      Object.keys(customProps).length > 0 ? customProps : undefined,
      makeDefaultIdeaTypeData(effectiveMainIdeaType, { stageOrder: stageCount + 1 }),
    );
    resetMainIdeaForm();
  }

  function resetChildIdeaForm() {
    setAddingChildIdea(false);
    setEditingChildIdea(false);
    setNewChildIdeaTitle('');
    setNewChildIdeaState('others');
    setNewChildIdeaType('others');
    setNewChildIdeaCustomColor('#ffffff');
    setNewChildIdeaCustomStateColor('#ffffff');
    setChildIdeaTypePickerOpen(false);
    setChildIdeaStatePickerOpen(false);
    onAddingChildIdeaChange(false);
    onEditingChildIdeaChange?.(false);
    onDraftChildIdeaStateChange('others');
    onDraftChildIdeaTypeChange('others');
    onDraftChildIdeaCustomColorChange?.('#ffffff');
    onDraftChildIdeaCustomStateColorChange?.('#ffffff');
  }

  function openIdeaEditForm() {
    const ideaToEdit = selectedIdea ?? selectedMainIdea;
    if (!ideaToEdit) return;

    resetEntryForm();
    setAddingChildIdea(false);
    setEditingChildIdea(true);
    setNewChildIdeaTitle(ideaToEdit.title ?? '');
    setNewChildIdeaState(ideaToEdit.state ?? 'others');
    setNewChildIdeaType(ideaToEdit.type ?? 'others');
    setNewChildIdeaCustomColor(ideaToEdit.customProperties?.typeColor ?? '#ffffff');
    setNewChildIdeaCustomStateColor(ideaToEdit.customProperties?.stateColor ?? '#ffffff');
    setChildIdeaTypePickerOpen(false);
    setChildIdeaStatePickerOpen(false);
    onAddingChildIdeaChange(true);
    onEditingChildIdeaChange?.(true);
    onDraftChildIdeaStateChange(ideaToEdit.state ?? 'others');
    onDraftChildIdeaTypeChange(ideaToEdit.type ?? 'others');
    onDraftChildIdeaCustomColorChange?.(ideaToEdit.customProperties?.typeColor ?? '#ffffff');
    onDraftChildIdeaCustomStateColorChange?.(ideaToEdit.customProperties?.stateColor ?? '#ffffff');
  }

  function resetEntryForm() {
    setAddingEntry(false);
    setNewEntryContent('');
    setNewEntryType('others');
    setNewEntryCustomColor('#ffffff');
    setNewEntryState('others');
    setNewEntryCustomStateColor('#ffffff');
    setEntryTypePickerOpen(false);
    setEntryStatePickerOpen(false);
    onEntryScrollAngleChange(0);
    onAddingEntryChange(false);
    onDraftEntryStateChange('others');
    onDraftEntryTypeChange('others');
    onDraftEntryCustomColorChange?.('#ffffff');
    onDraftEntryCustomStateColorChange?.('#ffffff');
  }

  function resetSubEntryForm() {
    setAddingSubEntry(false);
    setSubEntryParentId(null);
    setNewEntryContent('');
    setNewEntryType('others');
    setNewEntryCustomColor('#ffffff');
    setNewEntryState('others');
    setNewEntryCustomStateColor('#ffffff');
    setEntryTypePickerOpen(false);
    setEntryStatePickerOpen(false);
    onEntryScrollAngleChange(0);
    onAddingEntryChange(false);
    onDraftEntryStateChange('others');
    onDraftEntryTypeChange('others');
    onDraftEntryCustomColorChange?.('#ffffff');
    onDraftEntryCustomStateColorChange?.('#ffffff');
  }

  function handleSaveSubEntry() {
    const trimmedContent = newEntryContent.trim();
    if (!subEntryParentId || !selectedStormId || !trimmedContent) return;
    const customProps: Record<string, string> = {};
    if (newEntryType === 'others') {
      customProps.typeColor = newEntryCustomColor;
    }
    if (newEntryState === 'others') {
      customProps.stateColor = newEntryCustomStateColor;
    }
    const nextCustomProps = Object.keys(customProps).length > 0 ? customProps : undefined;
    addSubEntry(selectedStormId, subEntryParentId, {
      content: trimmedContent,
      state: newEntryState,
      type: newEntryType,
      customProperties: nextCustomProps,
      pointsTo: [],
    });
    resetSubEntryForm();
  }

  function resetEditingEntryForm() {
    setEditingEntry(null);
    setEditEntryContent('');
    setEditEntryState('others');
    setEditEntryType('others');
    setEditEntryCustomColor('#ffffff');
    setEditEntryCustomStateColor('#ffffff');
    setEntryTypePickerOpen(false);
    setEntryStatePickerOpen(false);
    setEntryActionMenuOpenId(null);
    setConfirmDeleteEntryId(null);
    onEntryScrollAngleChange(0);
    onAddingEntryChange(false);
    onDraftEntryStateChange('others');
    onDraftEntryTypeChange('others');
    onDraftEntryCustomColorChange?.('#ffffff');
    onDraftEntryCustomStateColorChange?.('#ffffff');
  }

  function openEntryEditForm(entry: BrainstormEntry) {
    resetChildIdeaForm();
    resetEntryForm();
    setEditingEntry(entry);
    setEditEntryContent(entry.content ?? '');
    setEditEntryState(entry.state ?? 'others');
    setEditEntryType(entry.type ?? 'others');
    setEditEntryCustomColor(entry.customProperties?.typeColor ?? '#ffffff');
    setEditEntryCustomStateColor(entry.customProperties?.stateColor ?? '#ffffff');
    setEntryActionMenuOpenId(null);
    setConfirmDeleteEntryId(null);
    onAddingEntryChange(true);
    onDraftEntryStateChange(entry.state ?? 'others');
    onDraftEntryTypeChange(entry.type ?? 'others');
    onDraftEntryCustomColorChange?.(entry.customProperties?.typeColor ?? '#ffffff');
    onDraftEntryCustomStateColorChange?.(entry.customProperties?.stateColor ?? '#ffffff');
  }

  function handleSaveChildIdea() {
    const trimmedTitle = newChildIdeaTitle.trim();
    if (!selectedStormId || !trimmedTitle) return;

    const customProps: Record<string, string> = {};
    if (newChildIdeaState === 'others') {
      customProps.stateColor = newChildIdeaCustomStateColor;
    }
    if (effectiveChildIdeaType === 'others') {
      customProps.typeColor = newChildIdeaCustomColor;
    }

    const nextCustomProps = Object.keys(customProps).length > 0 ? customProps : undefined;

    if (editingChildIdea) {
      const updates = {
        title: trimmedTitle,
        state: newChildIdeaState,
        type: newChildIdeaType,
        customProperties: nextCustomProps ?? {},
      };

      if (selectedIdeaId) {
        onUpdateIdea(selectedIdeaId, updates);
      } else if (selectedMainIdeaId) {
        onUpdateMainIdea(selectedMainIdeaId, updates);
      } else {
        return;
      }

      resetChildIdeaForm();
      return;
    }

    if (!selectedMainIdeaId) return;
    if (creatableIdeaTypes.length === 0) return;

    const seedTypeData = makeDefaultIdeaTypeData(effectiveChildIdeaType, { stageOrder: stageCount + 1 });

    if (selectedIdeaId) {
      addChildIdea(
        selectedStormId,
        selectedIdeaId,
        trimmedTitle,
        newChildIdeaState,
        effectiveChildIdeaType,
        nextCustomProps,
        seedTypeData,
      );
    } else {
      addIdea(
        selectedStormId,
        selectedMainIdeaId,
        trimmedTitle,
        newChildIdeaState,
        effectiveChildIdeaType,
        nextCustomProps,
        seedTypeData,
      );
    }

    resetChildIdeaForm();
  }

  function handleSaveEntry() {
    const trimmedContent = newEntryContent.trim();
    if (!selectedMainIdeaId || !trimmedContent) return;
    const customProps: Record<string, string> = {};
    if (newEntryType === 'others') {
      customProps.typeColor = newEntryCustomColor;
    }
    if (newEntryState === 'others') {
      customProps.stateColor = newEntryCustomStateColor;
    }
    const nextCustomProps = Object.keys(customProps).length > 0 ? customProps : undefined;
    const nextEntry = {
      content: trimmedContent,
      state: newEntryState,
      type: newEntryType,
      customProperties: nextCustomProps,
      pointsTo: [],
    };

    if (selectedIdeaId) {
      onAddEntry(selectedIdeaId, nextEntry, newEntryType, nextCustomProps);
    } else {
      onAddEntryToMainIdea(selectedMainIdeaId, nextEntry, newEntryType, nextCustomProps);
    }

    resetEntryForm();
  }

  function handleUpdateEntry() {
    const trimmedContent = editEntryContent.trim();
    if (!editingEntry || !trimmedContent) return;

    const customProps: Record<string, string> = {};
    if (editEntryType === 'others') {
      customProps.typeColor = editEntryCustomColor;
    }
    if (editEntryState === 'others') {
      customProps.stateColor = editEntryCustomStateColor;
    }

    onUpdateEntry(editingEntry.id, {
      content: trimmedContent,
      state: editEntryState,
      type: editEntryType,
      customProperties: Object.keys(customProps).length > 0 ? customProps : {},
    });
    resetEditingEntryForm();
  }

  useEffect(() => {
    onAddingMainIdeaChange?.(addingMainIdea);
  }, [addingMainIdea, onAddingMainIdeaChange]);

  useEffect(() => {
    onDraftMainIdeaTitleChange?.(newMainIdeaTitle);
  }, [newMainIdeaTitle, onDraftMainIdeaTitleChange]);

  useEffect(() => {
    onDraftMainIdeaStateChange(newMainIdeaState);
  }, [newMainIdeaState, onDraftMainIdeaStateChange]);

  useEffect(() => {
    onDraftMainIdeaTypeChange(newMainIdeaType);
  }, [newMainIdeaType, onDraftMainIdeaTypeChange]);



  useEffect(() => {
    onAddingSubEntryChange?.(addingSubEntry);
  }, [addingSubEntry, onAddingSubEntryChange]);

  useEffect(() => {
    onSubEntryParentIdChange?.(subEntryParentId);
  }, [subEntryParentId, onSubEntryParentIdChange]);

  const anyMainIdeaPickerOpen = ideaStatePickerOpen || ideaTypePickerOpen;
  const anyChildIdeaPickerOpen = childIdeaStatePickerOpen || childIdeaTypePickerOpen;
  const anyEntryPickerOpen = entryTypePickerOpen || entryStatePickerOpen;
  const isInlineIdeaFormOpen = addingChildIdea || editingChildIdea || addingEntry || editingEntry !== null || addingSubEntry;

  return (
    <>
      {selectedIdea || selectedMainIdea ? (
        <div className="px-4 py-4">
          {selectedStorm ? (
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
                onClick={() => {
                  if (addingChildIdea || editingChildIdea) {
                    resetChildIdeaForm();
                    return;
                  }
                  if (addingSubEntry) {
                    resetSubEntryForm();
                    return;
                  }
                  if (addingEntry) {
                    resetEntryForm();
                    return;
                  }
                  if (expandedEntryId !== null) {
                    setExpandedEntryId(null);
                    return;
                  }
                  onBack();
                }}
                className="text-white/40 hover:text-white/80 text-xs px-2 py-1"
              >
                BACK
              </button>

            </div>
          ) : null}
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
                  onResetAddStormState();
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
              onClick={() => {
                if (addingMainIdea) {
                  resetMainIdeaForm();
                  return;
                }
                if (stormCanvasOpen) {
                  onExitStorm();
                  return;
                }
                onSelectStorm(null);
              }}
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
        </div>
      )}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 16px' }} />
      {addingStorm || editingStorm ? (
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
              // Sprint 5: the storm type dropdown is retired — the brainstorm
              // add flow always creates General Void storms. An icon picker
              // takes its place for storm personalization.
              <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <span className="flex items-center gap-3 text-sm text-white">
                  <IconDisplay iconKey={newStormIcon || `storm-${newStormType}`} size={18} className="shrink-0 opacity-90" />
                  <span>{STORM_TYPE_META[newStormType].displayName}</span>
                </span>
                <IconPicker
                  value={newStormIcon || `storm-${newStormType}`}
                  onChange={setNewStormIcon}
                  label="Icon"
                  align="right"
                />
              </div>
            ) : null}
            {!categoryPickerOpen && !typePickerOpen ? (
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
            ) : null}
            {!categoryPickerOpen && !typePickerOpen && !statePickerOpen ? (
              <button
                type="button"
                disabled={newStormName.trim() === ''}
                onClick={onHandleAddStormConfirm}
                className="w-full rounded-lg border border-white/10 px-3 py-2 text-sm text-white transition enabled:hover:border-white/20 enabled:hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:text-white/30"
              >
                {editingStorm ? 'Save Storm' : 'Add Storm'}
              </button>
            ) : null}
          </div>
        </div>
      ) : showStormOverview ? (
        <>
          <div
            ref={stormScrollRef}
            className="flex-1 overflow-y-auto flex flex-col"
            onScroll={onHandleStormScroll}
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
                        <IconDisplay iconKey={storm.icon ?? `storm-${storm.type}`} size={20} className="opacity-80 shrink-0" />
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
                onClick={onHandleAddStormOpen}
                className="w-full py-2 rounded-lg border border-white/10 text-white/50 text-xs hover:border-white/20 hover:text-white/70"
              >
                + New Storm
              </button>
            </div>
          </div>
        </>
      ) : selectedMainIdea === null  ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          {!stormCanvasOpen ? (
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
          ) : null}
          <div className="flex-1 overflow-y-auto">
            {addingMainIdea ? (
              <div className="space-y-4 px-4 py-4">
                {!anyMainIdeaPickerOpen ? (
                  <input
                    type="text"
                    value={newMainIdeaTitle}
                    onChange={(event) => setNewMainIdeaTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleSaveMainIdea();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        resetMainIdeaForm();
                      }
                    }}
                    placeholder="Main Idea title..."
                    autoFocus
                    className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
                  />
                ) : null}
                {!ideaStatePickerOpen ? (
                  <div className="relative space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIdeaTypePickerOpen((open) => !open);
                        setIdeaStatePickerOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="shrink-0 text-base leading-none">{resolveIcon(`idea-${effectiveMainIdeaType}`)}</span>
                        <span className="truncate">{formatIdeaTypeLabel(effectiveMainIdeaType)}</span>
                      </span>
                      <span className="text-white/40 text-xs">Type</span>
                    </button>
                    {ideaTypePickerOpen ? (
                      <div className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-lg border border-white/10 bg-[#161624] shadow-xl">
                        {effectiveMainIdeaType === 'others' ? (
                          <div className="border-b border-white/10 p-3">
                            <div className="flex justify-start">
                              <ColorPicker
                                value={draftCustomColor}
                                onChange={(color) => {
                                  setDraftCustomColor(color);
                                  onDraftCustomColorChange?.(color);
                                }}
                                align="left"
                              />
                            </div>
                          </div>
                        ) : null}
                        {creatableIdeaTypes.map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => {
                              setNewMainIdeaType(type);
                              setIdeaTypePickerOpen(false);
                            }}
                            className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                          >
                            <span className="shrink-0 text-base leading-none">{resolveIcon(`idea-${type}`)}</span>
                            <span>{formatIdeaTypeLabel(type)}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {!ideaTypePickerOpen ? (
                  <div className="relative space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIdeaStatePickerOpen((open) => !open);
                        setIdeaTypePickerOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          className="inline-block h-3 w-3 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              newMainIdeaState === 'others'
                                ? draftCustomStateColor
                                : IDEA_STATE_SWATCH[newMainIdeaState],
                          }}
                        />
                        <span className="truncate">{formatIdeaStateLabel(newMainIdeaState)}</span>
                      </span>
                      <span className="text-white/40 text-xs">State</span>
                    </button>
                    {ideaStatePickerOpen ? (
                      <div className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-lg border border-white/10 bg-[#161624] shadow-xl">
                        {newMainIdeaState === 'others' ? (
                          <div className="border-b border-white/10 p-3">
                            <div className="flex justify-start">
                              <ColorPicker
                                value={draftCustomStateColor}
                                onChange={(color) => {
                                  setDraftCustomStateColor(color);
                                  onDraftCustomStateColorChange?.(color);
                                }}
                                align="left"
                              />
                            </div>
                          </div>
                        ) : null}
                        {IDEA_STATES.map((state) => (
                          <button
                            key={state}
                            type="button"
                            onClick={() => {
                              setNewMainIdeaState(state);
                              setIdeaStatePickerOpen(false);
                            }}
                            className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                          >
                            <span
                              className="inline-block h-3 w-3 rounded-full shrink-0"
                              style={{
                                backgroundColor:
                                  state === 'others'
                                    ? draftCustomStateColor
                                    : IDEA_STATE_SWATCH[state],
                              }}
                            />
                            <span>{formatIdeaStateLabel(state)}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
          <div className="border-t border-white/10 px-4 pb-4 pt-3">
            {addingMainIdea ? (
              !anyMainIdeaPickerOpen ? (
                <button
                  type="button"
                  onClick={handleSaveMainIdea}
                  disabled={!newMainIdeaTitle.trim()}
                  className={`w-full rounded-lg py-2 text-xs ${
                    newMainIdeaTitle.trim()
                      ? 'border border-white/10 text-white/70 hover:border-white/20 hover:text-white'
                      : 'cursor-not-allowed border border-white/5 text-white/25'
                  }`}
                >
                  Save
                </button>
              ) : null
            ) : stormCanvasOpen ? (
              <button
                type="button"
                onClick={() => {
                  setNewMainIdeaType(selectedStorm?.type === 'general' ? 'others' : 'insight');
                  setAddingMainIdea(true);
                }}
                className="w-full rounded-lg border border-white/10 py-2 text-xs text-white/50 hover:border-white/20 hover:text-white/70"
              >
                Add New Main Idea
              </button>
            ) : (
              <button
                type="button"
                onClick={onEnterStorm}
                className="w-full rounded-lg border border-white/10 py-2 text-xs text-white/50 hover:border-white/20 hover:text-white/70"
              >
                Enter Storm
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col min-h-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-2">
            {!isInlineIdeaFormOpen ? (
              <>
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
                              console.log('Enter Idea');
                              setActionMenuOpen(false);
                            }}
                            className="w-full px-4 py-2.5 text-left text-sm text-white/70 hover:bg-white/5"
                          >
                            Enter Idea
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              openIdeaEditForm();
                              setActionMenuOpen(false);
                            }}
                            className="w-full px-4 py-2.5 text-left text-sm text-white/70 hover:bg-white/5"
                          >
                            Edit
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
                <div className="min-h-0 flex-1 overflow-y-scroll">
                  {ideaActiveTab === 'entries' ? (
                    <div
                      className="pb-3 pt-2"
                      onScroll={(event) => {
                        const el = event.currentTarget;
                        const scrollRatio = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
                        const angle = scrollRatio * Math.PI * 2;
                        setEntryActionMenuOpenId(null);
                        setConfirmDeleteEntryId(null);
                        onEntryScrollAngleChange(angle);
                      }}
                    >
                      {editingEntry ? null : (() => {
                        const renderRow = (entry: BrainstormEntry, indented: boolean, isTopLevel: boolean) => (
                          <div key={entry.id} className={indented ? 'pl-4' : ''}>
                            <div
                              className="flex cursor-pointer items-center gap-2 py-1.5"
                              onClick={() => {
                                if (isTopLevel) {
                                  setExpandedEntryId((id) => (id === entry.id ? null : entry.id));
                                }
                              }}
                            >
                              {isTopLevel && entry.entries.length > 0 ? (
                                <span className="shrink-0 text-[10px] text-white/30">
                                  {expandedEntryId === entry.id ? 'v' : '>'}
                                </span>
                              ) : null}
                              <span className="min-w-0 flex-1 truncate text-xs text-white/50">
                                {entry.content.length > 60 ? `${entry.content.slice(0, 60)}...` : entry.content}
                              </span>
                              <span
                                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase"
                                style={getEntryBadgeStyle(entry)}
                              >
                                {entry.state}
                              </span>
                              <div
                                className="relative shrink-0"
                                tabIndex={0}
                                onClick={(e) => e.stopPropagation()}
                                onBlur={(event) => {
                                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                                    setEntryActionMenuOpenId((currentId) => (currentId === entry.id ? null : currentId));
                                    setConfirmDeleteEntryId((currentId) => (currentId === entry.id ? null : currentId));
                                  }
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEntryActionMenuOpenId((currentId) => (currentId === entry.id ? null : entry.id));
                                    setConfirmDeleteEntryId(null);
                                  }}
                                  className="px-2 py-1 text-xs text-white/40 hover:text-white/80"
                                >
                                  ...
                                </button>
                                {entryActionMenuOpenId === entry.id ? (
                                  <div className="absolute right-0 top-8 z-50 min-w-[140px] overflow-hidden rounded-lg border border-white/10 bg-gray-900">
                                    {confirmDeleteEntryId === entry.id ? (
                                      <div className="px-4 py-3">
                                        <p className="pb-2 text-xs text-white/50">Confirm delete?</p>
                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              onDeleteEntry(entry.id);
                                              setEntryActionMenuOpenId(null);
                                              setConfirmDeleteEntryId(null);
                                            }}
                                            className="flex-1 rounded border border-red-500/20 px-2 py-1.5 text-xs text-red-300 hover:bg-white/5"
                                          >
                                            Yes
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setConfirmDeleteEntryId(null)}
                                            className="flex-1 rounded border border-white/10 px-2 py-1.5 text-xs text-white/60 hover:bg-white/5"
                                          >
                                            No
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            resetChildIdeaForm();
                                            resetEntryForm();
                                            setAddingSubEntry(true);
                                            setSubEntryParentId(entry.id);
                                            setEntryActionMenuOpenId(null);
                                            onAddingEntryChange(true);
                                            onDraftEntryStateChange('others');
                                            onDraftEntryTypeChange('others');
                                            onDraftEntryCustomColorChange?.('#ffffff');
                                            onDraftEntryCustomStateColorChange?.('#ffffff');
                                          }}
                                          className="w-full px-4 py-2.5 text-left text-sm text-white/70 hover:bg-white/5"
                                        >
                                          Add Entry
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            openEntryEditForm(entry);
                                          }}
                                          className="w-full px-4 py-2.5 text-left text-sm text-white/70 hover:bg-white/5"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteEntryId(entry.id)}
                                          className="w-full px-4 py-2.5 text-left text-sm text-red-400/80 hover:bg-white/5"
                                        >
                                          Delete
                                        </button>
                                      </>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                        if (currentEntries.length === 0) {
                          return <div className="py-2 text-xs text-white/35">No entries yet</div>;
                        }
                        if (expandedEntryId !== null) {
                          const parentEntry = currentEntries.find((e) => e.id === expandedEntryId) ?? null;
                          if (parentEntry) {
                            return (
                              <div>
                                {renderRow(parentEntry, false, true)}
                                {parentEntry.entries.map((sub) => renderRow(sub, true, false))}
                              </div>
                            );
                          }
                        }
                        return <div>{currentEntries.map((entry) => renderRow(entry, false, true))}</div>;
                      })()}
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
              </>
            ) : null}
            {addingChildIdea || editingChildIdea ? (
              <div className="space-y-4 pb-3 pt-2">
              {!anyChildIdeaPickerOpen ? (
                <input
                  type="text"
                  value={newChildIdeaTitle}
                  onChange={(event) => setNewChildIdeaTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleSaveChildIdea();
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      resetChildIdeaForm();
                    }
                  }}
                  placeholder="Idea title..."
                  autoFocus
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
                />
              ) : null}
              {!childIdeaStatePickerOpen ? (
                <div className="relative space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setChildIdeaTypePickerOpen((open) => !open);
                      setChildIdeaStatePickerOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="shrink-0 text-base leading-none">{resolveIcon(`idea-${effectiveChildIdeaType}`)}</span>
                      <span className="truncate">{formatIdeaTypeLabel(effectiveChildIdeaType)}</span>
                    </span>
                    <span className="text-xs text-white/40">Type</span>
                  </button>
                  {childIdeaTypePickerOpen ? (
                    <div className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-lg border border-white/10 bg-[#161624] shadow-xl">
                      {effectiveChildIdeaType === 'others' ? (
                        <div className="border-b border-white/10 p-3">
                          <div className="flex justify-start">
                            <ColorPicker
                              value={newChildIdeaCustomColor}
                              onChange={(color) => {
                                setNewChildIdeaCustomColor(color);
                                onDraftChildIdeaCustomColorChange?.(color);
                              }}
                              align="left"
                            />
                          </div>
                        </div>
                      ) : null}
                      {creatableIdeaTypes.map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setNewChildIdeaType(type);
                            onDraftChildIdeaTypeChange(type);
                            setChildIdeaTypePickerOpen(false);
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                        >
                          <span className="shrink-0 text-base leading-none">{resolveIcon(`idea-${type}`)}</span>
                          <span>{formatIdeaTypeLabel(type)}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {!childIdeaTypePickerOpen ? (
                <div className="relative space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setChildIdeaStatePickerOpen((open) => !open);
                      setChildIdeaTypePickerOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className="inline-block h-3 w-3 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            newChildIdeaState === 'others'
                              ? newChildIdeaCustomStateColor
                              : IDEA_STATE_SWATCH[newChildIdeaState],
                        }}
                      />
                      <span className="truncate">{formatIdeaStateLabel(newChildIdeaState)}</span>
                    </span>
                    <span className="text-xs text-white/40">State</span>
                  </button>
                  {childIdeaStatePickerOpen ? (
                    <div className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-lg border border-white/10 bg-[#161624] shadow-xl">
                      {newChildIdeaState === 'others' ? (
                        <div className="border-b border-white/10 p-3">
                          <div className="flex justify-start">
                            <ColorPicker
                              value={newChildIdeaCustomStateColor}
                              onChange={(color) => {
                                setNewChildIdeaCustomStateColor(color);
                                onDraftChildIdeaCustomStateColorChange?.(color);
                              }}
                              align="left"
                            />
                          </div>
                        </div>
                      ) : null}
                      {IDEA_STATES.map((state) => (
                        <button
                          key={state}
                          type="button"
                          onClick={() => {
                            setNewChildIdeaState(state);
                            onDraftChildIdeaStateChange(state);
                            setChildIdeaStatePickerOpen(false);
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                        >
                          <span
                            className="inline-block h-3 w-3 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                state === 'others'
                                  ? newChildIdeaCustomStateColor
                                  : IDEA_STATE_SWATCH[state],
                            }}
                          />
                          <span>{formatIdeaStateLabel(state)}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              </div>
            ) : null}
            {editingEntry ? (
              <div className="space-y-4 pb-3 pt-2">
                <div className="relative space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEntryTypePickerOpen((open) => !open);
                      setEntryStatePickerOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="shrink-0 text-base leading-none">{resolveIcon(`entry-${editEntryType}`)}</span>
                      <span className="truncate">{formatEntryTypeLabel(editEntryType)}</span>
                    </span>
                    <span className="text-xs text-white/40">Type</span>
                  </button>
                  {entryTypePickerOpen ? (
                    <div className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-lg border border-white/10 bg-[#161624] shadow-xl">
                      {editEntryType === 'others' ? (
                        <div className="border-b border-white/10 p-3">
                          <div className="flex justify-start">
                            <ColorPicker
                              value={editEntryCustomColor}
                              onChange={(color) => {
                                setEditEntryCustomColor(color);
                                onDraftEntryCustomColorChange?.(color);
                              }}
                              align="left"
                            />
                          </div>
                        </div>
                      ) : null}
                      {ENTRY_TYPES.map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setEditEntryType(type);
                            onDraftEntryTypeChange(type);
                            setEntryTypePickerOpen(false);
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                        >
                          <span className="shrink-0 text-base leading-none">{resolveIcon(`entry-${type}`)}</span>
                          <span>{formatEntryTypeLabel(type)}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="relative space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEntryStatePickerOpen((open) => !open);
                      setEntryTypePickerOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className="inline-block h-3 w-3 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            editEntryState === 'others'
                              ? editEntryCustomStateColor
                              : ENTRY_STATE_SWATCH[editEntryState],
                        }}
                      />
                      <span className="truncate">{formatEntryStateLabel(editEntryState)}</span>
                    </span>
                    <span className="text-xs text-white/40">State</span>
                  </button>
                  {entryStatePickerOpen ? (
                    <div className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-lg border border-white/10 bg-[#161624] shadow-xl">
                      {editEntryState === 'others' ? (
                        <div className="border-b border-white/10 p-3">
                          <div className="flex justify-start">
                            <ColorPicker
                              value={editEntryCustomStateColor}
                              onChange={(color) => {
                                setEditEntryCustomStateColor(color);
                                onDraftEntryCustomStateColorChange?.(color);
                              }}
                              align="left"
                            />
                          </div>
                        </div>
                      ) : null}
                      {ENTRY_STATES.map((state) => (
                        <button
                          key={state}
                          type="button"
                          onClick={() => {
                            setEditEntryState(state);
                            onDraftEntryStateChange(state);
                            setEntryStatePickerOpen(false);
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                        >
                          <span
                            className="inline-block h-3 w-3 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                state === 'others'
                                  ? editEntryCustomStateColor
                                  : ENTRY_STATE_SWATCH[state],
                            }}
                          />
                          <span>{formatEntryStateLabel(state)}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {!anyEntryPickerOpen ? (
                  <textarea
                    value={editEntryContent}
                    onChange={(event) => setEditEntryContent(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                        event.preventDefault();
                        handleUpdateEntry();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        resetEditingEntryForm();
                      }
                    }}
                    placeholder="Entry content..."
                    autoFocus
                    rows={4}
                    className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
                  />
                ) : null}
              </div>
            ) : addingEntry || addingSubEntry ? (
              <div className="space-y-4 pb-3 pt-2">
              <div className="relative space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setEntryTypePickerOpen((open) => !open);
                    setEntryStatePickerOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="shrink-0 text-base leading-none">{resolveIcon(`entry-${newEntryType}`)}</span>
                    <span className="truncate">{formatEntryTypeLabel(newEntryType)}</span>
                  </span>
                  <span className="text-xs text-white/40">Type</span>
                </button>
                {entryTypePickerOpen ? (
                  <div className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-lg border border-white/10 bg-[#161624] shadow-xl">
                    {newEntryType === 'others' ? (
                      <div className="border-b border-white/10 p-3">
                        <div className="flex justify-start">
                          <ColorPicker
                            value={newEntryCustomColor}
                            onChange={(color) => {
                              setNewEntryCustomColor(color);
                              onDraftEntryCustomColorChange?.(color);
                            }}
                            align="left"
                          />
                        </div>
                      </div>
                    ) : null}
                    {ENTRY_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setNewEntryType(type);
                          onDraftEntryTypeChange(type);
                          setEntryTypePickerOpen(false);
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                      >
                        <span className="shrink-0 text-base leading-none">{resolveIcon(`entry-${type}`)}</span>
                        <span>{formatEntryTypeLabel(type)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="relative space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setEntryStatePickerOpen((open) => !open);
                    setEntryTypePickerOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          newEntryState === 'others'
                            ? newEntryCustomStateColor
                            : ENTRY_STATE_SWATCH[newEntryState],
                      }}
                    />
                    <span className="truncate">{formatEntryStateLabel(newEntryState)}</span>
                  </span>
                  <span className="text-xs text-white/40">State</span>
                </button>
                {entryStatePickerOpen ? (
                  <div className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-lg border border-white/10 bg-[#161624] shadow-xl">
                    {newEntryState === 'others' ? (
                      <div className="border-b border-white/10 p-3">
                        <div className="flex justify-start">
                          <ColorPicker
                            value={newEntryCustomStateColor}
                            onChange={(color) => {
                              setNewEntryCustomStateColor(color);
                              onDraftEntryCustomStateColorChange?.(color);
                            }}
                            align="left"
                          />
                        </div>
                      </div>
                    ) : null}
                    {ENTRY_STATES.map((state) => (
                      <button
                        key={state}
                        type="button"
                        onClick={() => {
                          setNewEntryState(state);
                          onDraftEntryStateChange(state);
                          setEntryStatePickerOpen(false);
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-white hover:bg-white/[0.05]"
                      >
                        <span
                          className="inline-block h-3 w-3 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              state === 'others'
                                ? newEntryCustomStateColor
                                : ENTRY_STATE_SWATCH[state],
                          }}
                        />
                        <span>{formatEntryStateLabel(state)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {!anyEntryPickerOpen ? (
                <textarea
                  value={newEntryContent}
                  onChange={(event) => setNewEntryContent(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                      event.preventDefault();
                      if (addingSubEntry) {
                        handleSaveSubEntry();
                      } else {
                        handleSaveEntry();
                      }
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      if (addingSubEntry) {
                        resetSubEntryForm();
                      } else {
                        resetEntryForm();
                      }
                    }
                  }}
                  placeholder="Entry content..."
                  autoFocus
                  rows={4}
                  className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
                />
              ) : null}
              </div>
            ) : null}
          </div>
          <div className="border-t border-white/10 px-4 pb-4 pt-3">
            {editingEntry && !anyEntryPickerOpen ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetEditingEntryForm}
                  className="flex-1 rounded-lg border border-white/10 py-2 text-xs text-white/60 hover:border-white/20 hover:bg-white/[0.03] hover:text-white"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleUpdateEntry}
                  disabled={!editEntryContent.trim()}
                  className={`flex-1 rounded-lg py-2 text-xs ${
                    editEntryContent.trim()
                      ? 'border border-white/10 text-white/70 hover:border-white/20 hover:text-white'
                      : 'cursor-not-allowed border border-white/5 text-white/25'
                  }`}
                >
                  Save
                </button>
              </div>
            ) : isInlineIdeaFormOpen && !anyEntryPickerOpen ? (
              <div>
                <button
                  type="button"
                  onClick={addingChildIdea || editingChildIdea ? handleSaveChildIdea : addingSubEntry ? handleSaveSubEntry : handleSaveEntry}
                  disabled={addingChildIdea || editingChildIdea ? !newChildIdeaTitle.trim() : !newEntryContent.trim()}
                  className={`w-full rounded-lg py-2 text-xs ${
                    ((addingChildIdea || editingChildIdea) ? newChildIdeaTitle.trim() : newEntryContent.trim())
                      ? 'border border-white/10 text-white/70 hover:border-white/20 hover:text-white'
                      : 'cursor-not-allowed border border-white/5 text-white/25'
                  }`}
                >
                  Save
                </button>
              </div>
            ) : ideaActiveTab === 'ideas' ? (
              <button
                type="button"
                onClick={() => {
                  resetEntryForm();
                  resetChildIdeaForm();
                  setAddingChildIdea(true);
                  onAddingChildIdeaChange(true);
                  onEditingChildIdeaChange?.(false);
                  onDraftChildIdeaStateChange('others');
                  onDraftChildIdeaTypeChange('others');
                  onDraftChildIdeaCustomColorChange?.('#ffffff');
                  onDraftChildIdeaCustomStateColorChange?.('#ffffff');
                }}
                className="w-full rounded-lg border border-white/10 py-2 text-xs text-white/50 hover:border-white/20 hover:text-white/70"
              >
                Add Idea
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  resetChildIdeaForm();
                  resetEntryForm();
                  setAddingEntry(true);
                  onAddingEntryChange(true);
                  onDraftEntryStateChange('others');
                  onDraftEntryTypeChange('others');
                  onDraftEntryCustomColorChange?.('#ffffff');
                  onDraftEntryCustomStateColorChange?.('#ffffff');
                }}
                className="w-full rounded-lg border border-white/10 py-2 text-xs text-white/50 hover:border-white/20 hover:text-white/70"
              >
                Add Entry
              </button>
            )}
          </div>
        </div>
      )}
      {modalMode === 'storm' || modalMode === 'mainIdea' ? (
        <BrainstormNameModal
          title={modalMode === 'storm' ? 'New Storm' : 'New Idea'}
          placeholder={modalMode === 'storm' ? 'Storm name...' : 'Enter a title...'}
          defaultValue=""
          onConfirm={onHandleBrainstormModalConfirm}
          onClose={() => setModalMode(null)}
        />
      ) : null}
    </>
  );
}
