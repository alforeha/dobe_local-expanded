import { useMemo } from 'react';
import { useProgressionStore } from '../../../stores/useProgressionStore';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { taskTemplateLibrary } from '../../../coach';
import { starterTaskTemplates } from '../../../coach/StarterQuestLibrary';
import type { Woop, Smarter } from '../../../types';

interface ActiveQuestRow {
  id: string;
  chain: Woop;
  quest: Smarter;
  current: number | null;
  target: number | null;
  templateNames: string[];
}

function resolveTemplateName(templateRef: string, scheduleTemplates: ReturnType<typeof useScheduleStore.getState>['taskTemplates']): string {
  return (
    scheduleTemplates[templateRef]?.name ??
    starterTaskTemplates.find((template) => template.id === templateRef)?.name ??
    taskTemplateLibrary.find((template) => template.id === templateRef)?.name ??
    templateRef
  );
}

function measurableProgress(quest: Smarter): { current: number | null; target: number | null } {
  const target = quest.specific.targetValue > 0 ? quest.specific.targetValue : null;
  if (target === null) return { current: null, target: null };
  if ((quest.measurable.taskTemplateRefs?.length ?? 0) > 0 || quest.specific.unit === 'tasks') {
    return { current: Math.min(target, Math.round((quest.progressPercent / 100) * target)), target };
  }
  return { current: quest.milestones.length, target };
}

export function TodayQuestRow() {
  const aspirations = useProgressionStore((s) => s.aspirations);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);

  const rows = useMemo<ActiveQuestRow[]>(() => {
    return Object.values(aspirations).flatMap((act) => {
      const activeChainIndex = act.woops.findIndex((chain) => chain.completionState === 'active');
      const chain = act.woops[activeChainIndex];
      if (!chain || chain.completionState !== 'active') return [];

      return chain.smarters
        .map((quest, questIndex) => ({ quest, questIndex }))
        .filter(({ quest }) => quest.completionState === 'active')
        .map(({ quest, questIndex }) => {
          const { current, target } = measurableProgress(quest);
          const templateNames = (quest.measurable.taskTemplateRefs ?? []).map((ref) =>
            resolveTemplateName(ref, taskTemplates),
          );

          return {
            id: `${act.id}:${activeChainIndex}:${questIndex}`,
            chain,
            quest,
            current,
            target,
            templateNames,
          };
        });
    });
  }, [aspirations, taskTemplates]);

  return (
    <section className="welcome-today" aria-label="Today's smarters">
      <h2>Active smarters</h2>
      <div className="welcome-row-list">
        {rows.length === 0 ? (
          <div className="welcome-empty-row">No active smarters</div>
        ) : (
          rows.map((row) => {
            return (
              <article key={row.id} className="welcome-row welcome-row--quest">
                <div className="welcome-row__summary welcome-row__summary--static">
                  <span>
                    <strong>{row.quest.name}</strong>
                    <small>{row.chain.name}</small>
                  </span>
                  <span className="welcome-row__meta">
                    {row.current !== null && row.target !== null && (
                      <span>{row.current}/{row.target}</span>
                    )}
                  </span>
                </div>

                <div className="welcome-row__detail">
                  {row.quest.description && <p>{row.quest.description}</p>}
                  {row.templateNames.length > 0 ? (
                    <ul>
                      {row.templateNames.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>Any non-system task completion can move this quest.</p>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

