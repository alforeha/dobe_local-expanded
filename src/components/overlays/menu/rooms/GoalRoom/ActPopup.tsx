// ─────────────────────────────────────────
// ActPopup — ADD / EDIT Act
// W17 — GOAL room.
// Renders inside the Menu overlay via PopupShell.
// Fields: name, description, habitat, commitment (trackedTaskRefs + routineRefs),
//         accountability stub.
// toggle is not exposed in UI — initialised with the default ActToggle shape.
// ─────────────────────────────────────────

import { useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PopupShell } from '../../../../shared/popups/PopupShell';
import { useProgressionStore } from '../../../../../stores/useProgressionStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { taskTemplateLibrary } from '../../../../../coach';
import { storageDelete, storageKey } from '../../../../../storage';
import { makeDefaultActToggle, type Act, type ActHabitat } from '../../../../../types';

// ── TYPES ─────────────────────────────────────────────────────────────────────

interface ActPopupProps {
  /** null = add mode; Act object = edit mode. */
  editAct: Act | null;
  /** Pre-selects habitat based on current GOAL room tab. */
  defaultHabitat: ActHabitat;
  onClose: () => void;
}

// ── FORM FIELD WRAPPER ────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 italic">{hint}</p>}
    </div>
  );
}

// ── COMPONENT ─────────────────────────────────────────────────────────────────

export function ActPopup({ editAct, defaultHabitat, onClose }: ActPopupProps) {
  const setAct = useProgressionStore((s) => s.setAct);
  const removeAct = useProgressionStore((s) => s.removeAct);
  const user = useUserStore((s) => s.user);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);
  const plannedEvents = useScheduleStore((s) => s.plannedEvents);

  const isEditMode = editAct !== null;

  // ── Merged task template list: prebuilt + user custom ────────────────────
  const allTemplates = useMemo(() => {
    const prebuilt = taskTemplateLibrary.map((t) => ({
      id: t.id ?? t.name,
      name: t.name,
    }));
    const custom = Object.entries(taskTemplates).map(([k, t]) => ({
      id: k,
      name: t.name,
    }));
    // Custom shadows prebuilt if same id
    const map = new Map<string, string>();
    for (const t of prebuilt) map.set(t.id, t.name);
    for (const t of custom) map.set(t.id, t.name);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [taskTemplates]);

  // ── Routine options — all PlannedEvents from schedule store ──────────────
  const routineOptions = useMemo(() => {
    return Object.values(plannedEvents).map((pe) => ({ id: pe.id, name: pe.name }));
  }, [plannedEvents]);

  // ── Form state ────────────────────────────────────────────────────────────
  const [name, setName] = useState(isEditMode ? editAct.name : '');
  const [description, setDescription] = useState(isEditMode ? editAct.description : '');
  const [habitat, setHabitat] = useState<ActHabitat>(
    isEditMode ? (editAct.habitat ?? defaultHabitat) : defaultHabitat,
  );
  const [trackedTaskRefs, setTrackedTaskRefs] = useState<string[]>(
    isEditMode ? editAct.commitment.trackedTaskRefs : [],
  );
  const [routineRefs, setRoutineRefs] = useState<string[]>(
    isEditMode ? editAct.commitment.routineRefs : [],
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  // ── Toggle helpers ────────────────────────────────────────────────────────
  function toggleTrackedTask(id: string) {
    setTrackedTaskRefs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleRoutine(id: string) {
    setRoutineRefs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  function handleSave() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    if (isEditMode && editAct) {
      const updated: Act = {
        ...editAct,
        name: name.trim(),
        description: description.trim(),
        habitat,
        commitment: { trackedTaskRefs, routineRefs },
      };
      setAct(updated);
    } else {
      const id = uuidv4();
      const newAct: Act = {
        id,
        name: name.trim(),
        description: description.trim(),
        icon: '🎯',
        owner: user?.system.id ?? 'user',
        habitat,
        chains: [],
        accountability: null,
        commitment: { trackedTaskRefs, routineRefs },
        toggle: makeDefaultActToggle(),
        completionState: 'active',
        sharedContacts: null,
      };
      setAct(newAct);
    }

    onClose();
  }

  // ── Delete (two-tap confirm) ───────────────────────────────────────────────
  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (editAct) {
      removeAct(editAct.id);
      storageDelete(storageKey.act(editAct.id));
    }
    onClose();
  }

  // ── Shared input class ────────────────────────────────────────────────────
  const inputCls =
    'w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-800 dark:text-gray-200 dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  const title = isEditMode ? 'Edit Act' : 'Add Act';

  return (
    <PopupShell title={title} onClose={onClose}>
      <div className="flex flex-col gap-4 max-h-[75vh] overflow-y-auto pb-2">

        {/* Name */}
        <Field label="Name *">
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            placeholder="e.g. Get fit by summer"
            className={inputCls}
          />
        </Field>

        {/* Description */}
        <Field label="Description (optional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this Act mean to you?"
            rows={3}
            className={`${inputCls} resize-none`}
          />
        </Field>

        {/* Habitat */}
        <Field label="Habitat" hint="Determines which tab this Act appears under in Goals.">
          <select
            value={habitat}
            onChange={(e) => setHabitat(e.target.value as ActHabitat)}
            className={inputCls}
          >
            <option value="habitats">Habitats</option>
            <option value="adventures">Adventures</option>
          </select>
        </Field>

        {/* Tracked Task Refs */}
        <Field
          label="Tracked tasks"
          hint="Task templates from the library this Act is committed to."
        >
          <div className="max-h-36 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-md divide-y divide-gray-100 dark:divide-gray-700">
            {allTemplates.length === 0 && (
              <p className="text-xs text-gray-400 italic p-3">No task templates available yet.</p>
            )}
            {allTemplates.map(({ id, name: tName }) => (
              <label
                key={id}
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <input
                  type="checkbox"
                  checked={trackedTaskRefs.includes(id)}
                  onChange={() => toggleTrackedTask(id)}
                  className="accent-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{tName}</span>
              </label>
            ))}
          </div>
        </Field>

        {/* Routine Refs */}
        <Field
          label="Routines"
          hint="Schedule routines that support this Act."
        >
          <div className="max-h-28 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-md divide-y divide-gray-100 dark:divide-gray-700">
            {routineOptions.length === 0 && (
              <p className="text-xs text-gray-400 italic p-3">No routines in schedule yet.</p>
            )}
            {routineOptions.map(({ id, name: rName }) => (
              <label
                key={id}
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <input
                  type="checkbox"
                  checked={routineRefs.includes(id)}
                  onChange={() => toggleRoutine(id)}
                  className="accent-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{rName}</span>
              </label>
            ))}
          </div>
        </Field>

        {/* Accountability — stub */}
        <Field label="Accountability">
          <p className="text-xs text-gray-400 italic bg-gray-50 dark:bg-gray-700 rounded-md px-3 py-2">
            Coming in a future update
          </p>
        </Field>

        {/* Error */}
        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {isEditMode && (
            <button
              type="button"
              onClick={handleDelete}
              className={`text-sm px-3 py-2 rounded-lg font-medium transition-colors ${
                confirmDelete
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'text-red-500 border border-red-300 hover:bg-red-50 dark:hover:bg-red-950'
              }`}
            >
              {confirmDelete ? 'Confirm delete' : 'Delete'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 text-sm px-3 py-2 rounded-lg font-medium border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 text-sm px-3 py-2 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </PopupShell>
  );
}
