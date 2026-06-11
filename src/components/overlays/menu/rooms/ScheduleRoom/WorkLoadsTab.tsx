import { useMemo, useState } from 'react';
import { useBrainstormStore } from '../../../../../stores/useBrainstormStore';
import type { Storm } from '../../../../../types/brainstorm';
import { HabitatRow } from '../../../../shared/habitat/HabitatRow';
import { HabitatShell } from '../../../../shared/habitat/HabitatShell';
import { HabitatSidePanel } from '../../../../shared/habitat/HabitatSidePanel';
import { HabitatTopBar } from '../../../../shared/habitat/HabitatTopBar';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { WorkLoadsPopup, type WorkLoadsCreateType } from './WorkLoadsPopup';

/**
 * Work Loads — Track C (Sprint 6). Surfaces Project and Work storm types
 * inside Focus Yard as a simple habitat-style list: one row per Project or
 * Work Zone. The add button next to the search bar opens WorkLoadsPopup
 * (add + edit). Row expand shows summary state; the full tree lives in the
 * popup. No type changes after creation (lock in place from Sprint 5).
 */

type PopupState =
  | { mode: 'add'; createType: WorkLoadsCreateType }
  | { mode: 'edit'; stormId: string }
  | null;

interface WorkLoadsTabProps {
  onNavExpandedChange?: (isExpanded: boolean) => void;
}

function stormCounts(storm: Storm) {
  const ideas = Object.values(storm.ideas);
  return {
    principles: ideas.filter((idea) => idea.type === 'principle').length,
    stages: ideas.filter((idea) => idea.type === 'stage').length,
    nodes: Object.keys(storm.mainIdeas).length + ideas.length,
  };
}

function stormSummary(storm: Storm): string {
  const counts = stormCounts(storm);
  if (storm.type === 'project') {
    const statement = Object.values(storm.mainIdeas).some((mainIdea) => mainIdea.type === 'statement');
    return `${statement ? 'Statement set' : 'No statement'} · ${counts.principles} principles · ${counts.stages} stages`;
  }
  return `${counts.nodes} nodes`;
}

function stageStatusDotClass(status: 'pending' | 'active' | 'complete'): string {
  // State indicators (polish pass item): active colored, completed muted,
  // pending greyscale.
  if (status === 'active') return 'bg-accent';
  if (status === 'complete') return 'bg-gray-400 dark:bg-gray-500';
  return 'bg-gray-200 dark:bg-gray-600';
}

export function WorkLoadsTab({ onNavExpandedChange }: WorkLoadsTabProps) {
  const storms = useBrainstormStore((s) => s.storms);
  const deleteStorm = useBrainstormStore((s) => s.deleteStorm);
  const [search, setSearch] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addChooserOpen, setAddChooserOpen] = useState(false);
  const [popup, setPopup] = useState<PopupState>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const workLoadStorms = useMemo(
    () => Object.values(storms)
      .filter((storm) => storm.type === 'project' || storm.type === 'work')
      .sort((a, b) => a.name.localeCompare(b.name)),
    [storms],
  );

  const filteredStorms = search
    ? workLoadStorms.filter((storm) => storm.name.toLowerCase().includes(search.toLowerCase()))
    : workLoadStorms;
  const visibleStorms = expandedId
    ? filteredStorms.filter((storm) => storm.id === expandedId)
    : filteredStorms;

  const projects = workLoadStorms.filter((storm) => storm.type === 'project');
  const workZones = workLoadStorms.filter((storm) => storm.type === 'work');

  function handleToggleExpand(stormId: string) {
    const next = expandedId === stormId ? null : stormId;
    setExpandedId(next);
    setConfirmDeleteId(null);
    onNavExpandedChange?.(next !== null);
  }

  function openAdd(createType: WorkLoadsCreateType) {
    setAddChooserOpen(false);
    setPopup({ mode: 'add', createType });
  }

  return (
    <HabitatShell
      sidePanel={
        <HabitatSidePanel
          sections={[
            {
              key: 'projects',
              label: 'Projects',
              shortLabel: 'PRJ',
              value: projects.length,
              rows: projects.map((storm) => (
                <span key={storm.id} className="truncate text-xs text-gray-600 dark:text-gray-300">
                  {storm.name}
                </span>
              )),
            },
            {
              key: 'workzones',
              label: 'Work Zones',
              shortLabel: 'WRK',
              value: workZones.length,
              rows: workZones.map((storm) => (
                <span key={storm.id} className="truncate text-xs text-gray-600 dark:text-gray-300">
                  {storm.name}
                </span>
              )),
            },
          ]}
          open={panelOpen}
          onOpenChange={setPanelOpen}
        />
      }
      topBar={!expandedId ? (
        <HabitatTopBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search work loads..."
          onCreateCustom={() => setAddChooserOpen((current) => !current)}
        >
          {addChooserOpen && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => openAdd('project')}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-accent-border px-3 py-2 text-sm font-medium text-accent hover:bg-accent-bg"
              >
                <IconDisplay iconKey="storm-project" size={16} className="leading-none" />
                New Project
              </button>
              <button
                type="button"
                onClick={() => openAdd('work')}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-accent-border px-3 py-2 text-sm font-medium text-accent hover:bg-accent-bg"
              >
                <IconDisplay iconKey="storm-work" size={16} className="leading-none" />
                New Work Zone
              </button>
            </div>
          )}
        </HabitatTopBar>
      ) : undefined}
    >
      {visibleStorms.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">
          {workLoadStorms.length === 0
            ? 'No projects or work zones yet — add one with the + button.'
            : 'No work loads match your search.'}
        </p>
      ) : (
        <div className={expandedId ? 'flex-1 overflow-hidden px-4 py-3' : 'flex-1 space-y-2 overflow-y-auto px-4 py-3'}>
          {visibleStorms.map((storm) => {
            const expanded = expandedId === storm.id;
            const stages = Object.values(storm.ideas)
              .filter((idea) => idea.type === 'stage')
              .sort((a, b) => {
                const orderA = a.typeData?.kind === 'stage' ? a.typeData.order : Number.MAX_SAFE_INTEGER;
                const orderB = b.typeData?.kind === 'stage' ? b.typeData.order : Number.MAX_SAFE_INTEGER;
                return orderA - orderB;
              });

            return (
              <HabitatRow
                key={storm.id}
                expanded={expanded}
                soloExpanded={Boolean(expandedId)}
                onToggleExpand={() => handleToggleExpand(storm.id)}
                icon={<IconDisplay iconKey={storm.icon ?? `storm-${storm.type}`} size={20} className="leading-none" />}
                name={storm.name}
                summary={stormSummary(storm)}
                pill={(
                  <span className="rounded-full bg-accent-bg px-2 py-0.5 text-[10px] text-accent">
                    {storm.type === 'project' ? 'Project' : 'Work'}
                  </span>
                )}
                color={storm.category?.color ?? null}
              >
                {/* Summary state — full tree lives in the popup. */}
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Brain width: {storm.brainWidthPoints - storm.brainWidthStaked} / {storm.brainWidthCap} available
                      {storm.brainWidthStaked > 0 ? ` · ${storm.brainWidthStaked} staked` : ''}
                    </p>

                    {storm.type === 'project' && stages.length > 0 && (
                      <div className="flex flex-col gap-1">
                        {stages.map((stage, index) => {
                          const status = stage.typeData?.kind === 'stage' ? stage.typeData.status : 'pending';
                          return (
                            <div key={stage.id} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                              <span className={`inline-block h-2 w-2 rounded-full ${stageStatusDotClass(status)}`} />
                              <span className="truncate">
                                Stage {index + 1} · {stage.title}
                              </span>
                              <span className="ml-auto text-gray-400 dark:text-gray-500">{status}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-auto shrink-0 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPopup({ mode: 'edit', stormId: storm.id })}
                      className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
                    >
                      ⚙ Open
                    </button>
                    {confirmDeleteId === storm.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          deleteStorm(storm.id);
                          setConfirmDeleteId(null);
                          setExpandedId(null);
                          onNavExpandedChange?.(false);
                        }}
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        Confirm delete
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(storm.id)}
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </HabitatRow>
            );
          })}
        </div>
      )}

      {popup?.mode === 'add' && (
        <WorkLoadsPopup
          mode="add"
          createType={popup.createType}
          onClose={() => setPopup(null)}
        />
      )}
      {popup?.mode === 'edit' && (
        <WorkLoadsPopup
          mode="edit"
          stormId={popup.stormId}
          onClose={() => setPopup(null)}
        />
      )}
    </HabitatShell>
  );
}
