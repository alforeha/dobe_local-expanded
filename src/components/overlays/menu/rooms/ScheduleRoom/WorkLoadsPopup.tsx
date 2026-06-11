import { useMemo, useState } from 'react';
import {
  getUnlockedIdeaTypes,
  makeDefaultIdeaTypeData,
  STORM_TYPE_META,
} from '../../../../../types/brainstorm';
import type {
  BrainstormIdea,
  IdeaType,
  IdeaTypeData,
  Storm,
  StormWoop,
} from '../../../../../types/brainstorm';
import { useBrainstormStore } from '../../../../../stores/useBrainstormStore';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { IconPicker } from '../../../../shared/IconPicker';
import { PopupShell } from '../../../../shared/popups/PopupShell';
import { ProjectTreeCanvas, type ProjectTreeView } from './ProjectTreeCanvas';

/**
 * WorkLoadsPopup — Track C (Sprint 6). Handles both add and edit for Work
 * Loads storms, and is the full interface for the storm tree:
 * Statement → Principles → Stages (WOOP) for Project, ungated node tree for
 * Work. Gating is enforced from the getUnlockedIdeaTypes config established
 * in Sprint 5 — no hardcoded type checks. Type is set by the creation path
 * (Project or Work); there is no type dropdown and no type change after
 * creation (lock already in place from Sprint 5).
 */

export type WorkLoadsCreateType = 'project' | 'work';

interface WorkLoadsPopupProps {
  mode: 'add' | 'edit';
  /** Creation path — decides the storm type on add. Ignored on edit. */
  createType?: WorkLoadsCreateType;
  /** Storm to edit. Ignored on add (until the storm is created). */
  stormId?: string | null;
  onClose: () => void;
}

type PopupView =
  | { kind: 'tree' }
  | { kind: 'mandala' }
  | { kind: 'profile' }
  | { kind: 'stage'; stageId: string };

const INPUT_CLASS = 'w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';
const SMALL_BUTTON_CLASS = 'rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700';
const ACCENT_BUTTON_CLASS = 'rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50';
const SECTION_TITLE_CLASS = 'text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';

function ideaTypeLabel(type: IdeaType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function LockedHint({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-400 dark:border-gray-600 dark:text-gray-500">
      🔒 {text}
    </p>
  );
}

/** Inline add row: text input + add button. */
function AddRow({
  placeholder,
  onAdd,
  disabled = false,
}: {
  placeholder: string;
  onAdd: (title: string) => void;
  disabled?: boolean;
}) {
  const [title, setTitle] = useState('');

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle('');
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={title}
        disabled={disabled}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
      <button
        type="button"
        disabled={disabled || !title.trim()}
        onClick={submit}
        className={ACCENT_BUTTON_CLASS}
      >
        +
      </button>
    </div>
  );
}

/** Editor for a WOOP string array (outcome / obstacle lists). */
function WoopListEditor({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      {items.map((item, index) => (
        <div key={`${label}-${index}`} className="flex items-center gap-2">
          <span className="flex-1 truncate text-xs text-gray-700 dark:text-gray-200">{item}</span>
          <button
            type="button"
            aria-label={`Remove ${label} item`}
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>
      ))}
      <AddRow placeholder={`Add ${label.toLowerCase()}...`} onAdd={(value) => onChange([...items, value])} />
    </div>
  );
}

/** One Stage card: WOOP editor, status, children, pie drill-down. */
function StageCard({
  storm,
  stage,
  unlockedChildTypes,
  onViewPie,
}: {
  storm: Storm;
  stage: BrainstormIdea;
  unlockedChildTypes: IdeaType[];
  onViewPie: () => void;
}) {
  const updateIdea = useBrainstormStore((s) => s.updateIdea);
  const addChildIdea = useBrainstormStore((s) => s.addChildIdea);
  const deleteIdea = useBrainstormStore((s) => s.deleteIdea);
  const [open, setOpen] = useState(false);
  const [childType, setChildType] = useState<IdeaType | null>(null);

  const stageData = stage.typeData?.kind === 'stage' ? stage.typeData : null;
  const woop: StormWoop = stageData?.woop ?? { wish: '', outcome: [], obstacle: [], plan: {} };
  const children = stage.ideas
    .map((childId) => storm.ideas[childId])
    .filter((idea): idea is BrainstormIdea => Boolean(idea));

  function patchStage(patch: Partial<Extract<IdeaTypeData, { kind: 'stage' }>>) {
    updateIdea(storm.id, stage.id, {
      typeData: {
        kind: 'stage',
        order: stageData?.order ?? 1,
        status: stageData?.status ?? 'pending',
        woop,
        ...patch,
      },
    });
  }

  const effectiveChildType = childType && unlockedChildTypes.includes(childType)
    ? childType
    : unlockedChildTypes[0] ?? null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
      <div className="flex items-center gap-2">
        <IconDisplay iconKey="idea-stage" size={16} className="leading-none" />
        <input
          type="text"
          value={stage.title}
          onChange={(e) => updateIdea(storm.id, stage.id, { title: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-gray-900 focus:outline-none dark:text-gray-100"
          aria-label="Stage name"
        />
        <select
          value={stageData?.status ?? 'pending'}
          onChange={(e) => patchStage({ status: e.target.value as 'pending' | 'active' | 'complete' })}
          className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          aria-label="Stage status"
        >
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="complete">Complete</option>
        </select>
        <button type="button" onClick={onViewPie} className={SMALL_BUTTON_CLASS}>
          ◔ Pie
        </button>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className={SMALL_BUTTON_CLASS}
        >
          {open ? '▲' : '▼'}
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-3 border-t border-gray-100 pt-2 dark:border-gray-700">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Wish</span>
            <input
              type="text"
              value={woop.wish}
              onChange={(e) => patchStage({ woop: { ...woop, wish: e.target.value } })}
              placeholder="Exaggerated intention..."
              className={INPUT_CLASS}
            />
          </div>

          <WoopListEditor
            label="Outcomes"
            items={woop.outcome}
            onChange={(outcome) => patchStage({ woop: { ...woop, outcome } })}
          />
          <WoopListEditor
            label="Obstacles"
            items={woop.obstacle}
            onChange={(obstacle) => patchStage({ woop: { ...woop, obstacle } })}
          />

          <div className="flex flex-col gap-1">
            <span className={SECTION_TITLE_CLASS}>Stage Ideas</span>
            {children.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500">No ideas under this stage yet.</p>
            )}
            {children.map((child) => (
              <div key={child.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-gray-700/50">
                <IconDisplay iconKey={`idea-${child.type}`} size={14} className="leading-none" />
                <span className="flex-1 truncate text-xs text-gray-700 dark:text-gray-200">{child.title}</span>
                <span className="rounded-full bg-accent-bg px-2 py-0.5 text-[10px] text-accent">
                  {ideaTypeLabel(child.type)}
                </span>
                <button
                  type="button"
                  aria-label={`Delete ${child.title}`}
                  onClick={() => deleteIdea(storm.id, child.id)}
                  className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  ✕
                </button>
              </div>
            ))}

            {effectiveChildType ? (
              <div className="flex items-center gap-2">
                <select
                  value={effectiveChildType}
                  onChange={(e) => setChildType(e.target.value as IdeaType)}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                  aria-label="New idea type"
                >
                  {unlockedChildTypes.map((type) => (
                    <option key={type} value={type}>{ideaTypeLabel(type)}</option>
                  ))}
                </select>
                <div className="flex-1">
                  <AddRow
                    placeholder={`Add ${ideaTypeLabel(effectiveChildType).toLowerCase()}...`}
                    onAdd={(title) => addChildIdea(
                      storm.id,
                      stage.id,
                      title,
                      'open',
                      effectiveChildType,
                      undefined,
                      makeDefaultIdeaTypeData(effectiveChildType),
                    )}
                  />
                </div>
              </div>
            ) : (
              <LockedHint text="Stage ideas unlock once a stage exists." />
            )}
          </div>

          <button
            type="button"
            onClick={() => deleteIdea(storm.id, stage.id)}
            className="self-start text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            Delete stage
          </button>
        </div>
      )}
    </div>
  );
}

/** Recursive ungated node tree for Work storms. */
function WorkNodeTree({
  storm,
  ideaIds,
  depth,
}: {
  storm: Storm;
  ideaIds: string[];
  depth: number;
}) {
  const addChildIdea = useBrainstormStore((s) => s.addChildIdea);
  const updateIdea = useBrainstormStore((s) => s.updateIdea);
  const deleteIdea = useBrainstormStore((s) => s.deleteIdea);
  const [addingUnder, setAddingUnder] = useState<string | null>(null);

  const nodes = ideaIds
    .map((id) => storm.ideas[id])
    .filter((idea): idea is BrainstormIdea => Boolean(idea));

  if (nodes.length === 0) return null;

  return (
    <div className={`flex flex-col gap-1 ${depth > 0 ? 'border-l border-gray-200 pl-3 dark:border-gray-700' : ''}`}>
      {nodes.map((node) => (
        <div key={node.id} className="flex flex-col gap-1">
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-gray-700/50">
            <IconDisplay iconKey="idea-node" size={12} className="leading-none" />
            <input
              type="text"
              value={node.title}
              onChange={(e) => updateIdea(storm.id, node.id, { title: e.target.value })}
              className="min-w-0 flex-1 bg-transparent text-xs text-gray-700 focus:outline-none dark:text-gray-200"
              aria-label="Node name"
            />
            <button
              type="button"
              aria-label={`Add node under ${node.title}`}
              onClick={() => setAddingUnder(addingUnder === node.id ? null : node.id)}
              className="text-xs text-accent"
            >
              +
            </button>
            <button
              type="button"
              aria-label={`Delete ${node.title}`}
              onClick={() => deleteIdea(storm.id, node.id)}
              className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>
          {addingUnder === node.id && (
            <AddRow
              placeholder="New node..."
              onAdd={(title) => {
                addChildIdea(storm.id, node.id, title, 'open', 'node');
                setAddingUnder(null);
              }}
            />
          )}
          <WorkNodeTree storm={storm} ideaIds={node.ideas} depth={depth + 1} />
        </div>
      ))}
    </div>
  );
}

export function WorkLoadsPopup({ mode, createType = 'project', stormId = null, onClose }: WorkLoadsPopupProps) {
  const storms = useBrainstormStore((s) => s.storms);
  const addStorm = useBrainstormStore((s) => s.addStorm);
  const renameStorm = useBrainstormStore((s) => s.renameStorm);
  const setStormIcon = useBrainstormStore((s) => s.setStormIcon);
  const addMainIdea = useBrainstormStore((s) => s.addMainIdea);
  const addIdea = useBrainstormStore((s) => s.addIdea);
  const updateMainIdea = useBrainstormStore((s) => s.updateMainIdea);
  const deleteIdea = useBrainstormStore((s) => s.deleteIdea);

  const [activeStormId, setActiveStormId] = useState<string | null>(mode === 'edit' ? stormId : null);
  const [draftName, setDraftName] = useState('');
  const [draftIcon, setDraftIcon] = useState(`storm-${createType}`);
  const [view, setView] = useState<PopupView>({ kind: 'tree' });

  const storm = activeStormId ? storms[activeStormId] ?? null : null;
  const isProject = storm?.type === 'project';

  // Gating from Sprint 5 config — drives every add affordance below.
  const unlockedTypes = useMemo<IdeaType[]>(
    () => (storm ? getUnlockedIdeaTypes(storm) ?? [] : []),
    [storm],
  );

  const statement = useMemo(
    () => (storm ? Object.values(storm.mainIdeas).find((mainIdea) => mainIdea.type === 'statement') ?? null : null),
    [storm],
  );
  const principles = useMemo(
    () => (storm ? Object.values(storm.ideas).filter((idea) => idea.type === 'principle') : []),
    [storm],
  );
  const stages = useMemo(
    () => (storm
      ? Object.values(storm.ideas)
        .filter((idea) => idea.type === 'stage')
        .sort((a, b) => {
          const orderA = a.typeData?.kind === 'stage' ? a.typeData.order : Number.MAX_SAFE_INTEGER;
          const orderB = b.typeData?.kind === 'stage' ? b.typeData.order : Number.MAX_SAFE_INTEGER;
          return orderA - orderB;
        })
      : []),
    [storm],
  );
  const loads = useMemo(
    () => (storm ? Object.values(storm.mainIdeas) : []),
    [storm],
  );

  const stageChildTypes = useMemo(
    () => unlockedTypes.filter((type) => (
      type === 'outcome' || type === 'obstacle' || type === 'step' || type === 'kpi' || type === 'milestone'
    )),
    [unlockedTypes],
  );

  function handleCreate() {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    const id = addStorm(trimmed, createType, 'active', undefined, draftIcon);
    setActiveStormId(id);
  }

  // ── add mode (storm not yet created) ────────────────────────────────────────
  if (!storm) {
    const meta = STORM_TYPE_META[createType];
    return (
      <PopupShell title={`New ${createType === 'project' ? 'Project' : 'Work Zone'}`} onClose={onClose}>
        <div className="flex flex-col gap-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {createType === 'project'
              ? 'Projects build up from a Statement, through Principles, into Stages.'
              : `Work Zones are free-form trees of ${meta.mainIdeaTerm.toLowerCase()}s — no gating.`}
          </p>
          <div className="flex items-end gap-3">
            <IconPicker value={draftIcon} onChange={setDraftIcon} label="Icon" />
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400" htmlFor="workloads-new-name">
                Name
              </label>
              <input
                id="workloads-new-name"
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                }}
                placeholder={createType === 'project' ? 'Project name...' : 'Work zone name...'}
                className={INPUT_CLASS}
              />
            </div>
          </div>
          <button
            type="button"
            disabled={!draftName.trim()}
            onClick={handleCreate}
            className={ACCENT_BUTTON_CLASS}
          >
            Create
          </button>
        </div>
      </PopupShell>
    );
  }

  // ── edit mode / tree interface ──────────────────────────────────────────────
  const title = (
    <div className="flex min-w-0 items-center gap-2">
      <IconPicker value={storm.icon ?? `storm-${storm.type}`} onChange={(key) => setStormIcon(storm.id, key)} />
      <input
        type="text"
        value={storm.name}
        onChange={(e) => renameStorm(storm.id, e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-base font-semibold text-gray-800 focus:outline-none dark:text-gray-100"
        aria-label="Storm name"
      />
      <span className="shrink-0 rounded-full bg-accent-bg px-2 py-0.5 text-[10px] text-accent">
        {isProject ? 'Project' : 'Work'}
      </span>
    </div>
  );

  const headerRight = isProject ? (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setView({ kind: 'tree' })}
        className={view.kind === 'tree' ? `${SMALL_BUTTON_CLASS} bg-accent-bg text-accent` : SMALL_BUTTON_CLASS}
      >
        Tree
      </button>
      <button
        type="button"
        onClick={() => setView({ kind: 'mandala' })}
        className={view.kind === 'mandala' ? `${SMALL_BUTTON_CLASS} bg-accent-bg text-accent` : SMALL_BUTTON_CLASS}
      >
        Mandala
      </button>
      <button
        type="button"
        onClick={() => setView({ kind: 'profile' })}
        className={view.kind === 'profile' ? `${SMALL_BUTTON_CLASS} bg-accent-bg text-accent` : SMALL_BUTTON_CLASS}
      >
        Profile
      </button>
    </div>
  ) : undefined;

  if (view.kind !== 'tree' && isProject) {
    const canvasView: ProjectTreeView = view.kind === 'stage' ? 'stage' : view.kind;
    return (
      <PopupShell title={title} onClose={onClose} size="large" headerRight={headerRight}>
        <div className="flex h-full min-h-0 flex-col gap-2">
          {view.kind === 'stage' && (
            <button
              type="button"
              onClick={() => setView({ kind: 'tree' })}
              className={`${SMALL_BUTTON_CLASS} self-start`}
            >
              ← Back to tree
            </button>
          )}
          <div className="min-h-0 flex-1">
            <ProjectTreeCanvas
              storm={storm}
              view={canvasView}
              stageId={view.kind === 'stage' ? view.stageId : null}
            />
          </div>
        </div>
      </PopupShell>
    );
  }

  return (
    <PopupShell title={title} onClose={onClose} size="large" headerRight={headerRight}>
      <div className="flex flex-col gap-5">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Brain width: {storm.brainWidthPoints - storm.brainWidthStaked} / {storm.brainWidthCap} available
        </p>

        {isProject ? (
          <>
            {/* Statement */}
            <section className="flex flex-col gap-2">
              <span className={SECTION_TITLE_CLASS}>Statement</span>
              {statement ? (
                <div className="flex items-center gap-2 rounded-xl border border-accent-border bg-accent-bg px-3 py-2">
                  <IconDisplay iconKey="idea-statement" size={16} className="leading-none" />
                  <input
                    type="text"
                    value={statement.title}
                    onChange={(e) => updateMainIdea(storm.id, statement.id, { title: e.target.value })}
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-gray-900 focus:outline-none dark:text-gray-100"
                    aria-label="Statement"
                  />
                </div>
              ) : unlockedTypes.includes('statement') ? (
                <AddRow
                  placeholder="What does done look like, and why does it matter?"
                  onAdd={(value) => addMainIdea(
                    storm.id,
                    value,
                    'open',
                    'statement',
                    undefined,
                    makeDefaultIdeaTypeData('statement'),
                  )}
                />
              ) : (
                <LockedHint text="Statement is locked." />
              )}
            </section>

            {/* Principles */}
            <section className="flex flex-col gap-2">
              <span className={SECTION_TITLE_CLASS}>Principles ({principles.length})</span>
              {principles.map((principle) => (
                <div key={principle.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-gray-700/50">
                  <IconDisplay iconKey="idea-principle" size={14} className="leading-none" />
                  <span className="flex-1 truncate text-xs text-gray-700 dark:text-gray-200">{principle.title}</span>
                  <button
                    type="button"
                    aria-label={`Delete ${principle.title}`}
                    onClick={() => deleteIdea(storm.id, principle.id)}
                    className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {unlockedTypes.includes('principle') && statement ? (
                <AddRow
                  placeholder="Add a guiding principle..."
                  onAdd={(value) => addIdea(
                    storm.id,
                    statement.id,
                    value,
                    'open',
                    'principle',
                    undefined,
                    makeDefaultIdeaTypeData('principle'),
                  )}
                />
              ) : (
                <LockedHint text="Set the Statement to unlock Principles." />
              )}
            </section>

            {/* Stages */}
            <section className="flex flex-col gap-2">
              <span className={SECTION_TITLE_CLASS}>Stages ({stages.length})</span>
              {stages.map((stage) => (
                <StageCard
                  key={stage.id}
                  storm={storm}
                  stage={stage}
                  unlockedChildTypes={stageChildTypes}
                  onViewPie={() => setView({ kind: 'stage', stageId: stage.id })}
                />
              ))}
              {unlockedTypes.includes('stage') && statement ? (
                <AddRow
                  placeholder="Add a stage..."
                  onAdd={(value) => addIdea(
                    storm.id,
                    statement.id,
                    value,
                    'open',
                    'stage',
                    undefined,
                    makeDefaultIdeaTypeData('stage', { stageOrder: stages.length + 1 }),
                  )}
                />
              ) : (
                <LockedHint text="Stages unlock after 3 Principles." />
              )}
            </section>
          </>
        ) : (
          /* Work — ungated single tree of plain nodes. */
          <section className="flex flex-col gap-2">
            <span className={SECTION_TITLE_CLASS}>
              {STORM_TYPE_META.work.mainIdeaTerm}s ({loads.length})
            </span>
            {loads.map((load) => (
              <div key={load.id} className="flex flex-col gap-1 rounded-xl border border-gray-200 p-2 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <IconDisplay iconKey="idea-node" size={14} className="leading-none" />
                  <input
                    type="text"
                    value={load.title}
                    onChange={(e) => updateMainIdea(storm.id, load.id, { title: e.target.value })}
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-gray-900 focus:outline-none dark:text-gray-100"
                    aria-label="Load name"
                  />
                </div>
                <WorkNodeTree storm={storm} ideaIds={load.ideas} depth={0} />
                <AddRow
                  placeholder="Add node..."
                  onAdd={(value) => addIdea(storm.id, load.id, value, 'open', 'node')}
                />
              </div>
            ))}
            <AddRow
              placeholder={`${STORM_TYPE_META.work.addLabel}...`}
              onAdd={(value) => addMainIdea(storm.id, value, 'open', 'node')}
            />
          </section>
        )}
      </div>
    </PopupShell>
  );
}
