import { useMemo, useState } from 'react';
import { useBrainstormStore } from '../../../../../stores/useBrainstormStore';
import { useProgressionStore } from '../../../../../stores/useProgressionStore';
import { HabitatRow } from '../../../../shared/habitat/HabitatRow';
import { HabitatShell } from '../../../../shared/habitat/HabitatShell';
import { HabitatSidePanel } from '../../../../shared/habitat/HabitatSidePanel';
import { HabitatTopBar } from '../../../../shared/habitat/HabitatTopBar';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { CircumchancePopup } from './CircumchancePopup';
import {
  buildGoalTrackOptions,
  collectBets,
  computeCircumchanceStats,
  isProjectionStorm,
  resolveGoalProgress,
} from './circumchanceData';

/**
 * Circumchance — Track C (Sprint 6). Focus Yard sub-tab (established
 * Sprint 1), dashboard layout in two sections: top stats dashboard
 * (brain-width staked, active bets, outcomes — from stakeBrainWidth /
 * unstakeBrainWidth and 'bet' entry data already in the brainstorm store),
 * bottom rows for each sportsbook ('projection' storm) the user creates.
 * Expand in row; popup for the full sportsbook interface. System hub for
 * placing bets on active goal tracks.
 */

type PopupState =
  | { mode: 'add' }
  | { mode: 'edit'; stormId: string }
  | null;

interface CircumchanceTabProps {
  onNavExpandedChange?: (isExpanded: boolean) => void;
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-center dark:border-gray-700 dark:bg-gray-800">
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</p>
      <p className="text-[10px] text-gray-400 dark:text-gray-500">{label}</p>
    </div>
  );
}

export function CircumchanceTab({ onNavExpandedChange }: CircumchanceTabProps) {
  const storms = useBrainstormStore((s) => s.storms);
  const deleteStorm = useBrainstormStore((s) => s.deleteStorm);
  const aspirations = useProgressionStore((s) => s.aspirations);
  const [search, setSearch] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [popup, setPopup] = useState<PopupState>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const books = useMemo(
    () => Object.values(storms)
      .filter(isProjectionStorm)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [storms],
  );
  const stats = useMemo(() => computeCircumchanceStats(books), [books]);
  const goalTrackCount = useMemo(
    () => buildGoalTrackOptions(Object.values(aspirations)).length,
    [aspirations],
  );

  const filteredBooks = search
    ? books.filter((book) => book.name.toLowerCase().includes(search.toLowerCase()))
    : books;
  const visibleBooks = expandedId
    ? filteredBooks.filter((book) => book.id === expandedId)
    : filteredBooks;

  function handleToggleExpand(stormId: string) {
    const next = expandedId === stormId ? null : stormId;
    setExpandedId(next);
    setConfirmDeleteId(null);
    onNavExpandedChange?.(next !== null);
  }

  return (
    <HabitatShell
      sidePanel={
        <HabitatSidePanel
          sections={[
            { key: 'books', label: 'Sportsbooks', shortLabel: 'BKS', value: books.length },
            { key: 'staked', label: 'BW Staked', shortLabel: 'STK', value: stats.totalStaked },
            { key: 'tracks', label: 'Goal Tracks', shortLabel: 'TRK', value: goalTrackCount },
          ]}
          open={panelOpen}
          onOpenChange={setPanelOpen}
        />
      }
      topBar={!expandedId ? (
        <HabitatTopBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search sportsbooks..."
          onCreateCustom={() => setPopup({ mode: 'add' })}
        />
      ) : undefined}
    >
      {/* Top section — stats dashboard */}
      {!expandedId && (
        <div className="grid grid-cols-4 gap-2 px-4 pb-3">
          <StatCard value={String(stats.totalStaked)} label="BW staked" />
          <StatCard value={String(stats.activeBets)} label="Active bets" />
          <StatCard value={String(stats.won)} label="Won" />
          <StatCard value={String(stats.lost)} label="Lost" />
        </div>
      )}

      {/* Bottom section — one row per sportsbook */}
      {visibleBooks.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">
          {books.length === 0
            ? 'No sportsbooks yet — add one with the + button to start staking brain-width.'
            : 'No sportsbooks match your search.'}
        </p>
      ) : (
        <div className={expandedId ? 'flex-1 overflow-hidden px-4 py-3' : 'flex-1 space-y-2 overflow-y-auto px-4 py-3'}>
          {visibleBooks.map((book) => {
            const expanded = expandedId === book.id;
            const bets = collectBets(book);
            const active = bets.filter((bet) => bet.status === 'active');
            const won = bets.filter((bet) => bet.status === 'won').length;
            const lost = bets.filter((bet) => bet.status === 'lost').length;

            return (
              <HabitatRow
                key={book.id}
                expanded={expanded}
                soloExpanded={Boolean(expandedId)}
                onToggleExpand={() => handleToggleExpand(book.id)}
                icon={<IconDisplay iconKey={book.icon ?? 'storm-projection'} size={20} className="leading-none" />}
                name={book.name}
                summary={`${book.brainWidthStaked} BW staked · ${active.length} active · ${won}W/${lost}L`}
                pill={(
                  <span className="rounded-full bg-accent-bg px-2 py-0.5 text-[10px] text-accent">
                    Book
                  </span>
                )}
                color={book.category?.color ?? null}
              >
                {/* In-row summary — full sportsbook interface lives in the popup. */}
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Brain width: {book.brainWidthPoints - book.brainWidthStaked} / {book.brainWidthCap} available
                      · {book.brainWidthStaked} staked
                    </p>

                    {active.length === 0 ? (
                      <p className="text-xs text-gray-400 dark:text-gray-500">No active bets.</p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {active.map((bet) => {
                          const progress = resolveGoalProgress(bet.goalRef, aspirations);
                          return (
                            <div key={bet.entryId} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                              <span aria-hidden="true">🎲</span>
                              <span className="truncate">{bet.goalLabel ?? bet.content}</span>
                              <span className="ml-auto shrink-0 text-gray-400 dark:text-gray-500">
                                {bet.stake} BW{progress !== null ? ` · ${Math.round(progress)}%` : ''}
                              </span>
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
                      onClick={() => setPopup({ mode: 'edit', stormId: book.id })}
                      className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
                    >
                      🎰 Open Book
                    </button>
                    {confirmDeleteId === book.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          deleteStorm(book.id);
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
                        onClick={() => setConfirmDeleteId(book.id)}
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
        <CircumchancePopup mode="add" onClose={() => setPopup(null)} />
      )}
      {popup?.mode === 'edit' && (
        <CircumchancePopup mode="edit" stormId={popup.stormId} onClose={() => setPopup(null)} />
      )}
    </HabitatShell>
  );
}
