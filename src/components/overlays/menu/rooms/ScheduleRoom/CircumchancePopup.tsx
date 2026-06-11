import { useMemo, useState } from 'react';
import { useBrainstormStore } from '../../../../../stores/useBrainstormStore';
import { useProgressionStore } from '../../../../../stores/useProgressionStore';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { IconPicker } from '../../../../shared/IconPicker';
import { NumberInput } from '../../../../shared/inputs/NumberInput';
import { PopupShell } from '../../../../shared/popups/PopupShell';
import {
  buildGoalTrackOptions,
  collectBets,
  resolveGoalProgress,
  type BetRecord,
  type GoalTrackOption,
} from './circumchanceData';

/**
 * CircumchancePopup — Track C (Sprint 6). Full sportsbook interface for one
 * 'projection' storm: place bets on active goal tracks (the primary
 * interface for stakeBrainWidth/unstakeBrainWidth), settle outcomes, review
 * history. UI over existing primitives — bets are 'bet' entries under
 * 'prop' main ideas; no new store mutations.
 */

interface CircumchancePopupProps {
  mode: 'add' | 'edit';
  stormId?: string | null;
  onClose: () => void;
}

const INPUT_CLASS = 'w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';
const ACCENT_BUTTON_CLASS = 'rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50';
const SECTION_TITLE_CLASS = 'text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';

function formatProgress(progress: number | null): string {
  return progress === null ? '—' : `${Math.round(progress)}%`;
}

function BetRow({
  bet,
  liveProgress,
  onSettle,
}: {
  bet: BetRecord;
  liveProgress: number | null;
  onSettle?: (won: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-gray-700/50">
      <span className="text-xs leading-none">
        {bet.status === 'active' ? '🎲' : bet.status === 'won' ? '🏆' : '💀'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-200">
          {bet.goalLabel ?? bet.content}
        </p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500">
          {bet.stake} BW staked
          {bet.status === 'active' ? ` · track at ${formatProgress(liveProgress)}` : ` · ${bet.status}`}
        </p>
      </div>
      {onSettle && bet.status === 'active' && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onSettle(true)}
            className="rounded-lg border border-accent-border px-2 py-1 text-xs font-medium text-accent hover:bg-accent-bg"
          >
            Won
          </button>
          <button
            type="button"
            onClick={() => onSettle(false)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Lost
          </button>
        </div>
      )}
    </div>
  );
}

export function CircumchancePopup({ mode, stormId = null, onClose }: CircumchancePopupProps) {
  const storms = useBrainstormStore((s) => s.storms);
  const addStorm = useBrainstormStore((s) => s.addStorm);
  const renameStorm = useBrainstormStore((s) => s.renameStorm);
  const setStormIcon = useBrainstormStore((s) => s.setStormIcon);
  const stakeBrainWidth = useBrainstormStore((s) => s.stakeBrainWidth);
  const unstakeBrainWidth = useBrainstormStore((s) => s.unstakeBrainWidth);
  const updateEntry = useBrainstormStore((s) => s.updateEntry);
  const aspirations = useProgressionStore((s) => s.aspirations);

  const [activeStormId, setActiveStormId] = useState<string | null>(mode === 'edit' ? stormId : null);
  const [draftName, setDraftName] = useState('');
  const [draftIcon, setDraftIcon] = useState('storm-projection');
  const [selectedGoalRef, setSelectedGoalRef] = useState<string>('');
  const [stakeAmount, setStakeAmount] = useState<number | ''>('');

  const storm = activeStormId ? storms[activeStormId] ?? null : null;

  // The hub surfaces active projection storms against goal data.
  const goalOptions = useMemo(
    () => buildGoalTrackOptions(Object.values(aspirations)),
    [aspirations],
  );
  const bets = useMemo(() => (storm ? collectBets(storm) : []), [storm]);
  const activeBets = bets.filter((bet) => bet.status === 'active');
  const settledBets = bets.filter((bet) => bet.status !== 'active');
  const won = settledBets.filter((bet) => bet.status === 'won').length;
  const lost = settledBets.length - won;

  const selectedGoal: GoalTrackOption | null = goalOptions.find((option) => option.ref === selectedGoalRef)
    ?? goalOptions[0]
    ?? null;
  const available = storm ? storm.brainWidthPoints - storm.brainWidthStaked : 0;
  const stake = typeof stakeAmount === 'number' ? stakeAmount : 0;
  const canPlace = Boolean(storm && selectedGoal && stake > 0 && stake <= available);

  function handleCreate() {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    const id = addStorm(trimmed, 'projection', 'active', undefined, draftIcon);
    setActiveStormId(id);
  }

  function handlePlaceBet() {
    if (!storm || !selectedGoal || stake <= 0) return;
    if (!stakeBrainWidth(storm.id, stake)) return;

    const state = useBrainstormStore.getState();
    const liveStorm = state.storms[storm.id];
    if (!liveStorm) return;

    // Find or lazily create the 'prop' main idea for this goal track.
    let prop = Object.values(liveStorm.mainIdeas).find(
      (mainIdea) => mainIdea.customProperties?.goalRef === selectedGoal.ref,
    );
    if (!prop) {
      state.addMainIdea(storm.id, selectedGoal.label, 'open', 'prop', { goalRef: selectedGoal.ref });
      prop = Object.values(useBrainstormStore.getState().storms[storm.id]?.mainIdeas ?? {}).find(
        (mainIdea) => mainIdea.customProperties?.goalRef === selectedGoal.ref,
      );
    }
    if (!prop) return;

    state.addEntryToMainIdea(
      storm.id,
      prop.id,
      { content: `Bet ${stake} BW on ${selectedGoal.label}`, state: 'question', pointsTo: [] },
      'bet',
      {
        stake: String(stake),
        status: 'active',
        goalRef: selectedGoal.ref,
        goalLabel: selectedGoal.label,
        placedAt: new Date().toISOString(),
      },
    );
    setStakeAmount('');
  }

  function handleSettle(bet: BetRecord, betWon: boolean) {
    if (!storm) return;
    unstakeBrainWidth(storm.id, bet.stake, betWon);
    updateEntry(storm.id, bet.entryId, {
      state: betWon ? 'outcome' : 'obstacle',
      customProperties: {
        stake: String(bet.stake),
        status: betWon ? 'won' : 'lost',
        ...(bet.goalRef ? { goalRef: bet.goalRef } : {}),
        ...(bet.goalLabel ? { goalLabel: bet.goalLabel } : {}),
        ...(bet.placedAt ? { placedAt: bet.placedAt } : {}),
        resolvedAt: new Date().toISOString(),
      },
    });
  }

  // ── add mode ────────────────────────────────────────────────────────────────
  if (!storm) {
    return (
      <PopupShell title="New Sportsbook" onClose={onClose}>
        <div className="flex flex-col gap-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            A sportsbook is a projection storm — stake brain-width on your active goal tracks.
          </p>
          <div className="flex items-end gap-3">
            <IconPicker value={draftIcon} onChange={setDraftIcon} label="Icon" />
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400" htmlFor="circumchance-new-name">
                Name
              </label>
              <input
                id="circumchance-new-name"
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                }}
                placeholder="Sportsbook name..."
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

  // ── full sportsbook interface ───────────────────────────────────────────────
  const title = (
    <div className="flex min-w-0 items-center gap-2">
      <IconPicker value={storm.icon ?? 'storm-projection'} onChange={(key) => setStormIcon(storm.id, key)} />
      <input
        type="text"
        value={storm.name}
        onChange={(e) => renameStorm(storm.id, e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-base font-semibold text-gray-800 focus:outline-none dark:text-gray-100"
        aria-label="Sportsbook name"
      />
    </div>
  );

  return (
    <PopupShell title={title} onClose={onClose} size="large">
      <div className="flex flex-col gap-5">
        {/* Book stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-gray-200 px-3 py-2 text-center dark:border-gray-700">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{available}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">BW available</p>
          </div>
          <div className="rounded-xl border border-gray-200 px-3 py-2 text-center dark:border-gray-700">
            <p className="text-sm font-semibold text-accent">{storm.brainWidthStaked}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">BW staked</p>
          </div>
          <div className="rounded-xl border border-gray-200 px-3 py-2 text-center dark:border-gray-700">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{won}W · {lost}L</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">Record</p>
          </div>
        </div>

        {/* Place a bet — primary stakeBrainWidth interface */}
        <section className="flex flex-col gap-2">
          <span className={SECTION_TITLE_CLASS}>Place a Bet</span>
          {goalOptions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-400 dark:border-gray-600 dark:text-gray-500">
              No active goal tracks to bet on — activate an aspiration first.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <select
                value={selectedGoal?.ref ?? ''}
                onChange={(e) => setSelectedGoalRef(e.target.value)}
                className={INPUT_CLASS}
                aria-label="Goal track"
              >
                {goalOptions.map((option) => (
                  <option key={option.ref} value={option.ref}>
                    {option.label}
                    {option.progressPercent !== null ? ` (${Math.round(option.progressPercent)}%)` : ''}
                  </option>
                ))}
              </select>
              <div className="flex items-end gap-2">
                <NumberInput
                  value={stakeAmount}
                  onChange={setStakeAmount}
                  label={`Stake (max ${available} BW)`}
                  placeholder="0"
                  min={1}
                  max={available}
                  className="flex-1"
                />
                <button
                  type="button"
                  disabled={!canPlace}
                  onClick={handlePlaceBet}
                  className={ACCENT_BUTTON_CLASS}
                >
                  Stake it
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Active bets */}
        <section className="flex flex-col gap-2">
          <span className={SECTION_TITLE_CLASS}>Active Bets ({activeBets.length})</span>
          {activeBets.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">No active bets.</p>
          ) : (
            activeBets.map((bet) => (
              <BetRow
                key={bet.entryId}
                bet={bet}
                liveProgress={resolveGoalProgress(bet.goalRef, aspirations)}
                onSettle={(betWon) => handleSettle(bet, betWon)}
              />
            ))
          )}
        </section>

        {/* History */}
        {settledBets.length > 0 && (
          <section className="flex flex-col gap-2">
            <span className={SECTION_TITLE_CLASS}>History ({settledBets.length})</span>
            {settledBets.map((bet) => (
              <BetRow key={bet.entryId} bet={bet} liveProgress={null} />
            ))}
          </section>
        )}

        <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500">
          <IconDisplay iconKey="storm-projection" size={12} className="leading-none" />
          <span>Winning a bet returns the stake and raises this book's brain-width cap by the same amount.</span>
        </div>
      </div>
    </PopupShell>
  );
}
