import { useMemo } from 'react';
import { useUserStore } from '../../../stores/useUserStore';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { useSystemStore } from '../../../stores/useSystemStore';
import { commentLibrary } from '../../../coach';
import type { CoachTone } from '../../../types/coach';
import {
  EARLY_BIRD_MULTIPLIER,
  LATE_NIGHT_MULTIPLIER,
  getXPBoostSnapshot,
} from '../../../engine/xpBoosts';
import { getAppTime } from '../../../utils/dateUtils';
import { IconDisplay } from '../../shared/IconDisplay';
import logoSrc from '../../../assets/icons/logo_canClosed.svg';
import { StreakSave } from './StreakSave';

type BoostRow = {
  id: string;
  name: string;
  value: string;
  icon: string;
};

function formatMultiplier(value: number): string {
  const rounded = value.toFixed(1);
  return `${rounded.endsWith('.0') ? rounded.slice(0, -2) : rounded}x`;
}

function pickWelcomeComment(tone: CoachTone, hour: number, streakCount: number): string {
  const contextKey =
    hour < 12
      ? 'ambient.morning'
      : hour < 18
        ? 'ambient.general.fallback'
        : 'ambient.evening';
  const entry = commentLibrary.comments.find((comment) => comment.contextKey === contextKey);
  const pool = entry?.variants[tone] ?? entry?.variants.friendly ?? [];
  const raw = pool[Math.floor(Math.random() * pool.length)] ?? '';
  return raw.replace(/\{\{streakCount\}\}/g, String(streakCount));
}

export function CoachSection() {
  const user = useUserStore((s) => s.user);
  useScheduleStore((s) => s.activeEvents);
  useScheduleStore((s) => s.historyEvents);
  useScheduleStore((s) => s.tasks);
  useSystemStore((s) => s.appTime);
  useSystemStore((s) => s.timeOffset);
  const tone = useSystemStore((s) => s.settings?.coachPreferences.tone ?? 'friendly') as CoachTone;

  const comment = useMemo(() => {
    const [hour] = getAppTime().split(':').map(Number);
    return pickWelcomeComment(
      tone,
      Number.isFinite(hour) ? hour : 12,
      user?.progression.stats.milestones.streakCurrent ?? 0,
    );
  }, [tone, user]);

  const boosts = useMemo<BoostRow[]>(() => {
    const standardBoosts = getXPBoostSnapshot(user);
    const wisdomBoosts = getXPBoostSnapshot(user, { isWisdomTask: true });
    const rows: BoostRow[] = [];

    if (standardBoosts.earlyBirdActive) {
      rows.push({
        id: 'early-bird',
        name: 'Early bird',
        value: formatMultiplier(EARLY_BIRD_MULTIPLIER),
        icon: 'boost-early-bird',
      });
    }

    if (wisdomBoosts.lateNightActive) {
      rows.push({
        id: 'late-night',
        name: 'Late night wisdom',
        value: formatMultiplier(LATE_NIGHT_MULTIPLIER),
        icon: 'boost-late-night',
      });
    }

    if (standardBoosts.streak > 0) {
      rows.push({
        id: 'streak',
        name: 'Streak',
        value: formatMultiplier(standardBoosts.streakMultiplier),
        icon: 'boost-streak',
      });
    }

    if (standardBoosts.roll) {
      rows.push({
        id: 'roll',
        name: 'Daily roll',
        value: standardBoosts.roll.display,
        icon: 'boost-roll',
      });
    }

    return rows;
  }, [user]);

  return (
    <section className="welcome-coach" aria-label="Coach briefing">
      <div className="welcome-coach__model" aria-hidden="true">
        <img src={logoSrc} alt="" />
      </div>

      <div className="welcome-coach__panel">
        <div className="welcome-coach__comment">
          <p>{comment || 'Ready when you are.'}</p>
        </div>

        <div className="welcome-coach__boosts" aria-label="Current boosts">
          <h2>Current boosts</h2>
          <div className="welcome-coach__boost-list">
            {boosts.length > 0 ? (
              boosts.map((boost) => (
                <div className="welcome-coach__boost-row" key={boost.id}>
                  <span className="welcome-coach__boost-name">
                    <IconDisplay iconKey={boost.icon} />
                    {boost.name}
                  </span>
                  <span className="welcome-coach__boost-value">{boost.value}</span>
                </div>
              ))
            ) : (
              <div className="welcome-coach__boost-row welcome-coach__boost-row--empty">
                <span>No active boosts</span>
              </div>
            )}
          </div>
        </div>

        <StreakSave />
      </div>
    </section>
  );
}
