import { useEffect, useMemo, useState } from 'react';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import type { Event } from '../../../types';
import { getAppDate, getOffsetNow, formatHHMM } from '../../../utils/dateUtils';

const SIZE = 180;
const CENTER = SIZE / 2;
const RADIUS = 78;
const DAY_MINUTES = 24 * 60;
const FALLBACK_EVENT_COLOR = '#60a5fa';

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

  const outerStart = pointForMinute(start, RADIUS);
  const outerEnd = pointForMinute(end, RADIUS);

  return [
    `M ${CENTER} ${CENTER}`,
    `L ${outerStart.x} ${outerStart.y}`,
    `A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
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
  const [now, setNow] = useState(() => getOffsetNow());
  const today = getAppDate();

  useEffect(() => {
    const id = window.setInterval(() => setNow(getOffsetNow()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const currentMinute = timeToMinutes(formatHHMM(now));
  const timeLineEnd = pointForMinute(currentMinute, RADIUS);
  const labelPoint = pointForMinute(currentMinute, RADIUS + 7);
  const currentTimeLabel = formatHHMM(now);

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
        <circle className="welcome-pie__track" cx={CENTER} cy={CENTER} r={RADIUS} />
        <line className="welcome-pie__midnight-mark" x1={CENTER} y1={CENTER - RADIUS} x2={CENTER} y2={CENTER - RADIUS + 8} />
        <text className="welcome-pie__midnight-label" x={CENTER} y="12" textAnchor="middle">00:00</text>
        {events.map((event, index) => {
          const { start, end } = eventMinutesForDay(event, today);
          const isCurrent = currentMinute >= start && currentMinute < end;
          const isPast = end <= currentMinute;
          const opacity = isCurrent ? 0.96 : isPast ? 0.78 : 0.45;

          return (
            <path
              key={event.id}
              className="welcome-pie__slice"
              d={slicePath(start, end)}
              style={{
                fill: event.color ?? FALLBACK_EVENT_COLOR,
                opacity: Math.max(0.3, opacity - index * 0.03),
              }}
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
        <text
          className="welcome-pie__time-label"
          x={Math.max(18, Math.min(SIZE - 18, labelPoint.x))}
          y={Math.max(18, Math.min(SIZE - 18, labelPoint.y))}
          textAnchor={labelPoint.x < CENTER - 6 ? 'end' : labelPoint.x > CENTER + 6 ? 'start' : 'middle'}
          dominantBaseline="middle"
        >
          {currentTimeLabel}
        </text>
      </svg>
    </div>
  );
}
