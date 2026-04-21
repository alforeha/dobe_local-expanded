import { useEffect, useMemo, useRef, useState } from 'react';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import type { Event } from '../../../types';
import { addDays, localISODate } from '../../../utils/dateUtils';
import { completeTask } from '../../../engine/eventExecution';
import { resolveTaskDisplayName } from '../../../utils/resolveTaskDisplayName';
import { starterTaskTemplates } from '../../../coach/StarterQuestLibrary';
import { IconDisplay } from '../../shared/IconDisplay';

function previousAppDate(appDate: string): string {
  return localISODate(addDays(new Date(`${appDate}T00:00:00`), -1));
}

function isRolloverEvent(event: Event, date: string): boolean {
  return event.startDate <= date && event.endDate >= date;
}

interface RolloverIncompleteEventsProps {
  appDate: string;
}

export function RolloverIncompleteEvents({ appDate }: RolloverIncompleteEventsProps) {
  const historyEvents = useScheduleStore((s) => s.historyEvents);
  const tasks = useScheduleStore((s) => s.tasks);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);
  const previousDate = previousAppDate(appDate);
  const [exiting, setExiting] = useState(false);
  const [lastVisibleEvents, setLastVisibleEvents] = useState<Event[]>([]);
  const exitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  const events = useMemo(
    () =>
      Object.values(historyEvents)
        .filter((event): event is Event => event.eventType !== 'quickActions')
        .filter((event) => isRolloverEvent(event, previousDate))
        .filter((event) => event.tasks.some((taskId) => tasks[taskId]?.completionState !== 'complete'))
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [historyEvents, previousDate, tasks],
  );

  const visibleEvents = events.length > 0 ? events : exiting ? lastVisibleEvents : [];
  if (visibleEvents.length === 0) return null;

  const handleCompleteTask = (event: Event, taskId: string) => {
    const task = useScheduleStore.getState().tasks[taskId];
    if (!task || task.completionState === 'complete') return;

    completeTask(taskId, event.id, { resultFields: task.resultFields ?? {} });

    const freshStore = useScheduleStore.getState();
    const freshEvent = freshStore.historyEvents[event.id];
    if (!freshEvent || freshEvent.eventType === 'quickActions') return;

    const allTasksComplete = freshEvent.tasks.every(
      (id) => freshStore.tasks[id]?.completionState === 'complete',
    );
    if (!allTasksComplete) return;

    useScheduleStore.setState((state) => ({
      historyEvents: {
        ...state.historyEvents,
        [event.id]: {
          ...freshEvent,
          completionState: 'complete',
        },
      },
    }));

    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
    }
    setLastVisibleEvents(events);
    setExiting(true);
    exitTimerRef.current = window.setTimeout(() => {
      setExiting(false);
      exitTimerRef.current = null;
    }, 220);
  };

  return (
    <section
      className={`welcome-rollover ${events.length === 0 ? 'welcome-rollover--exiting' : ''}`}
      aria-label="Yesterday incomplete events"
    >
      <h2>Yesterday - Finish these to complete your daily quest</h2>
      <div className="welcome-rollover__events">
        {visibleEvents.map((event) => {
          const isComplete = event.tasks.every((taskId) => tasks[taskId]?.completionState === 'complete');
          return (
            <article
              key={event.id}
              className={`welcome-rollover__event ${isComplete ? 'welcome-rollover__event--complete' : ''}`}
            >
              <header>
                <div>
                  <strong>{event.name}</strong>
                  <span>{event.startTime} - {event.endTime}</span>
                </div>
                {isComplete && (
                  <span className="welcome-rollover__done">
                    <IconDisplay iconKey="check" />
                    Complete
                  </span>
                )}
              </header>

              {!isComplete && (
                <div className="welcome-rollover__tasks">
                  {event.tasks.map((taskId) => {
                    const task = tasks[taskId];
                    if (!task) return null;
                    const complete = task.completionState === 'complete';
                    return (
                      <button
                        type="button"
                        key={taskId}
                        className={`welcome-rollover__task ${complete ? 'welcome-rollover__task--complete' : ''}`}
                        onClick={() => handleCompleteTask(event, taskId)}
                        disabled={complete}
                      >
                        <span className="welcome-rollover__toggle" aria-hidden="true">
                          {complete ? <IconDisplay iconKey="check" /> : ''}
                        </span>
                        <span>{resolveTaskDisplayName(task, taskTemplates, starterTaskTemplates)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
