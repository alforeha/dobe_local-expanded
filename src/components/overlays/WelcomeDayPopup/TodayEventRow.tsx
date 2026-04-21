import { useMemo, useState } from 'react';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { useResourceStore } from '../../../stores/useResourceStore';
import type { Event } from '../../../types';
import { getAppDate } from '../../../utils/dateUtils';
import { resolveTaskDisplayName } from '../../../utils/resolveTaskDisplayName';
import { starterTaskTemplates } from '../../../coach/StarterQuestLibrary';
import { IconDisplay } from '../../shared/IconDisplay';

function isEventToday(event: Event, today: string): boolean {
  return event.startDate <= today && event.endDate >= today;
}

function locationLabel(event: Event): string | null {
  return event.location?.placeName ?? (event.location ? 'Location set' : null);
}

export function TodayEventRow() {
  const activeEvents = useScheduleStore((s) => s.activeEvents);
  const tasks = useScheduleStore((s) => s.tasks);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);
  const resources = useResourceStore((s) => s.resources);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const today = getAppDate();

  const events = useMemo(
    () =>
      Object.values(activeEvents)
        .filter((event): event is Event => event.eventType !== 'quickActions')
        .filter((event) => isEventToday(event, today))
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [activeEvents, today],
  );

  return (
    <section className="welcome-today" aria-label="Today's events">
      <h2>Today's events</h2>
      <div className="welcome-row-list">
        {events.length === 0 ? (
          <div className="welcome-empty-row">No scheduled events today</div>
        ) : (
          events.map((event) => {
            const expanded = expandedId === event.id;
            const loc = locationLabel(event);
            const contacts = event.sharedWith
              .map((id) => resources[id]?.name)
              .filter((name): name is string => Boolean(name));

            return (
              <article key={event.id} className="welcome-row">
                <button
                  type="button"
                  className="welcome-row__summary"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : event.id)}
                >
                  <span>
                    <strong>{event.name}</strong>
                    <small>{event.startTime}</small>
                  </span>
                  <span className="welcome-row__meta">
                    {loc && <IconDisplay iconKey="location_point" />}
                    <IconDisplay iconKey={expanded ? 'collapse' : 'expand'} />
                  </span>
                </button>

                {expanded && (
                  <div className="welcome-row__detail">
                    <p>{event.startTime} - {event.endTime}</p>
                    {loc && <p>{loc}</p>}
                    {contacts.length > 0 && <p>With {contacts.join(', ')}</p>}
                    <ul>
                      {event.tasks.map((taskId) => {
                        const task = tasks[taskId];
                        return (
                          <li key={taskId}>
                            {task ? resolveTaskDisplayName(task, taskTemplates, starterTaskTemplates) : taskId}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
