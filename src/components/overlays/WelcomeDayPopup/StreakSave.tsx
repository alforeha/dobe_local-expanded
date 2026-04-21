import { useState } from 'react';
import { useUserStore } from '../../../stores/useUserStore';

const STREAK_SAVE_BASE_GOLD_COST = 10; // D149

export function StreakSave() {
  const user = useUserStore((s) => s.user);
  const spendGoldForStreakSave = useUserStore((s) => s.spendGoldForStreakSave);
  const [confirming, setConfirming] = useState(false);

  const milestones = user?.progression.stats.milestones;
  const currentStreak = milestones?.streakCurrent ?? 0;
  const missedDays = milestones?.streakSaveMissedDays ?? 0;
  const restoreValue = milestones?.streakSavePreviousValue ?? 0;
  const gold = user?.progression.gold ?? 0;
  const isBroken = currentStreak === 0 && missedDays > 0 && restoreValue > 0;
  const cost = missedDays * STREAK_SAVE_BASE_GOLD_COST;
  const canAfford = gold >= cost;

  const handleConfirm = () => {
    if (!canAfford || cost <= 0) return;
    if (spendGoldForStreakSave(cost)) {
      setConfirming(false);
    }
  };

  if (!isBroken) return null;

  return (
    <div className="welcome-streak" aria-label="Streak status">
      <div className="welcome-streak__restore">
        <div>
          <strong>Restore streak boost</strong>
          <p>{missedDays} missed days. Save the boost at {restoreValue} days.</p>
        </div>

        {!confirming ? (
          <>
            <button
              type="button"
              className="welcome-streak__save"
              disabled={!canAfford}
              onClick={() => setConfirming(true)}
            >
              Save Streak ({cost} gold)
            </button>
            {!canAfford && (
              <span className="welcome-streak__disabled">Not enough gold. Shop coming soon</span>
            )}
          </>
        ) : (
          <div className="welcome-streak__confirm">
            <p>Are you sure? Spend {cost} gold to save your streak boost?</p>
            <div>
              <button type="button" onClick={handleConfirm}>Confirm</button>
              <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
