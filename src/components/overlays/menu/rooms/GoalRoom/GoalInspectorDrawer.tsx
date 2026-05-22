import { useEffect, useRef, useState } from 'react';
import type { Aspiration, NestedAct, Smarter, Woop } from '../../../../../types';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { GoalActEditor } from './GoalActEditor';
import { GoalAspirationEditor } from './GoalAspirationEditor';
import { GoalSmarterEditor } from './GoalSmarterEditor';
import { GoalWoopEditor } from './GoalWoopEditor';
import { createBlankSmarter, createBlankWoop } from './goalEditorUtils';
import { analyzeWoopText, BANK_COLORS, type WoopBankMatch } from './woopKeywordEngine';

export type DrawerView =
  | { level: 'none' }
  | { level: 'orbit'; orbit: 'user' | 'system' }
  | { level: 'aspiration'; orbit: 'user' | 'system'; aspiration: Aspiration }
  | { level: 'woop-edit'; orbit: 'user' | 'system'; aspiration: Aspiration; woopIdx: number | null }
  | { level: 'woop'; orbit: 'user' | 'system'; aspiration: Aspiration; woopIdx: number }
  | { level: 'smarter-edit'; orbit: 'user' | 'system'; aspiration: Aspiration; woopIdx: number; smarterIdx: number | null }
  | { level: 'smarter'; orbit: 'user' | 'system'; aspiration: Aspiration; woopIdx: number; smarterIdx: number }
  | { level: 'act-edit'; orbit: 'user' | 'system'; aspiration: Aspiration; woopIdx: number; smarterIdx: number };

interface GoalInspectorDrawerProps {
  open: boolean;
  view: DrawerView;
  onBack: () => void;
  userAspirations: Aspiration[];
  adventureAspirations: Aspiration[];
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
  open,
  view,
  onBack,
  userAspirations,
  adventureAspirations,
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
  useEffect(() => {
    if (prevLevelRef.current === 'aspiration' && view.level !== 'aspiration') {
      onEditModeChange(false);
    }
    prevLevelRef.current = view.level;
  }, [view.level, onEditModeChange]);

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
      : view.level === 'orbit'
        ? view.orbit === 'user' ? 'Your Aspirations' : 'Adventures'
        : '';
  const orbitList = view.level === 'orbit'
    ? view.orbit === 'user' ? userAspirations : adventureAspirations
    : [];

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
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
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
          &larr; back
        </button>
      </div>
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 16px' }} />
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
  onSelectSmarter,
}: {
  woop: Woop;
  aspirationOwner: string;
  woopIdx: number;
  onEditWoop: (idx: number) => void;
  onDeleteWoop: (idx: number) => void;
  onAddSmarter: () => void;
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
            {aspirationOwner !== 'coach' && (
              <button
                onClick={onAddSmarter}
                className="w-full py-2 rounded-lg border border-white/10 text-white/40 text-xs hover:text-white/60 mt-2"
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
          <div className="flex flex-col gap-2">
            <p className="text-white/50 text-xs uppercase tracking-wider">Specific</p>
            <p className="text-white/60 text-sm">
              Target: {smarter.specific.targetValue}{smarter.specific.unit ? ` ${smarter.specific.unit}` : ''}
            </p>
            <p className="text-white/40 text-xs">Source: {smarter.specific.sourceType}</p>
          </div>
        )}

        {activeTab === 2 && (
          <div className="flex flex-col gap-2">
            <p className="text-white/50 text-xs uppercase tracking-wider">Measurable</p>
            {(smarter.measurable.taskTemplateRefs ?? []).length > 0
              ? smarter.measurable.taskTemplateRefs!.map((ref, i) => (
                  <p key={i} className="text-white/60 text-xs">{ref}</p>
                ))
              : <p className="text-white/25 text-xs">No task refs linked</p>
            }
          </div>
        )}

        {activeTab === 3 && (
          <div className="flex flex-col gap-2">
            <p className="text-white/50 text-xs uppercase tracking-wider">Attainable</p>
            <p className="text-white/40 text-xs">{(smarter.attainable as Record<string, string>).note || 'No notes set'}</p>
          </div>
        )}

        {activeTab === 4 && (
          <div className="flex flex-col gap-2">
            <p className="text-white/50 text-xs uppercase tracking-wider">Relevant</p>
            <p className="text-white/40 text-xs">{(smarter.relevant as Record<string, string>).note || 'No notes set'}</p>
          </div>
        )}

        {activeTab === 5 && (
          <div className="flex flex-col gap-2">
            <p className="text-white/50 text-xs uppercase tracking-wider">Timely</p>
            <p className="text-white/60 text-sm">{smarter.timely.projectedFinish ?? 'No finish date set'}</p>
            <p className="text-white/40 text-xs">Condition: {smarter.timely.conditionType}</p>
          </div>
        )}

        {activeTab === 6 && (
          <div className="flex flex-col gap-2">
            <p className="text-white/50 text-xs uppercase tracking-wider">Exit Strategy</p>
            <p className="text-white/60 text-sm">{smarter.exitStrategy.onMissedFinish}</p>
          </div>
        )}

        {activeTab === 7 && (
          <div className="flex flex-col gap-2">
            <p className="text-white/50 text-xs uppercase tracking-wider">Result</p>
            <p className="text-white/40 text-xs">{(smarter.result as Record<string, string>).note || 'No result defined'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
