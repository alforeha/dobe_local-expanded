import { useEffect, useMemo, useState } from 'react';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { useUserStore } from '../../../stores/useUserStore';
import type { Event } from '../../../types';
import { getAppDate, getOffsetNow, formatHHMM } from '../../../utils/dateUtils';

const SIZE = 180;
const CENTER = SIZE / 2;
const OUTER_RADIUS = 78;
const INNER_RADIUS = 52;
const DAY_MINUTES = 24 * 60;

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return Math.min(DAY_MINUTES, Math.max(0, hours * 60 + minutes));
}

function pointForMinute(minute: number, radius: number): { x: number; y: number } {
  const angle = (minute / DAY_MINUTES) * Math.PI * 2 - Math.PI / 2;
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius,
  };
}

function slicePath(startMinute: number, endMinute: number): string {
  const start = Math.min(startMinute, endMinute);
  const end = Math.max(start + 1, endMinute);
  const largeArc = end - start > DAY_MINUTES / 2 ? 1 : 0;

  const outerStart = pointForMinute(start, OUTER_RADIUS);
  const outerEnd = pointForMinute(end, OUTER_RADIUS);
  const innerEnd = pointForMinute(end, INNER_RADIUS);
  const innerStart = pointForMinute(start, INNER_RADIUS);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function isEventToday(event: Event, today: string): boolean {
  return event.startDate <= today && event.endDate >= today;
}

function eventMinutesForDay(event: Event, today: string): { start: number; end: number } {
  const start = event.startDate < today ? 0 : timeToMinutes(event.startTime);
  const end = event.endDate > today ? DAY_MINUTES : timeToMinutes(event.endTime);
  return { start, end: Math.max(start + 1, end) };
}

export function DayPieChart() {
  const activeEvents = useScheduleStore((s) => s.activeEvents);
  const streak = useUserStore((s) => {
    const milestones = s.user?.progression.stats.milestones;
    return Math.max(milestones?.streakCurrent ?? 0, milestones?.streakBoostSavedValue ?? 0);
  });
  const [now, setNow] = useState(() => getOffsetNow());
  const today = getAppDate();

  useEffect(() => {
    const id = window.setInterval(() => setNow(getOffsetNow()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const currentMinute = timeToMinutes(formatHHMM(now));
  const timeLineEnd = pointForMinute(currentMinute, OUTER_RADIUS);

  const events = useMemo(
    () =>
      Object.values(activeEvents)
        .filter((event): event is Event => event.eventType !== 'quickActions')
        .filter((event) => isEventToday(event, today))
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [activeEvents, today],
  );

  return (
    <div className="welcome-pie" aria-label="Today clock chart">
      <svg className="welcome-pie__svg" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img">
        <circle className="welcome-pie__track" cx={CENTER} cy={CENTER} r={(OUTER_RADIUS + INNER_RADIUS) / 2} />
        {events.map((event, index) => {
          const { start, end } = eventMinutesForDay(event, today);
          const isCurrent = currentMinute >= start && currentMinute < end;
          const isPast = end <= currentMinute;
          const className = isCurrent
            ? 'welcome-pie__slice welcome-pie__slice--current'
            : isPast
              ? 'welcome-pie__slice welcome-pie__slice--past'
              : 'welcome-pie__slice welcome-pie__slice--future';

          return (
            <path
              key={event.id}
              className={className}
              d={slicePath(start, end)}
              style={{ opacity: Math.max(0.45, 0.82 - index * 0.04) }}
            />
          );
        })}
        <line
          className="welcome-pie__time-line"
          x1={CENTER}
          y1={CENTER}
          x2={timeLineEnd.x}
          y2={timeLineEnd.y}
        />
        <circle className="welcome-pie__pin" cx={CENTER} cy={CENTER} r="3" />
      </svg>
      <div className="welcome-pie__center" aria-label={`Streak ${streak} days`}>
        <strong>{streak}</strong>
        <span>streak</span>
      </div>
    </div>
  );
}
