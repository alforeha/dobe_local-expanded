import { useMemo, useState } from 'react';
import { useProgressionStore } from '../../../stores/useProgressionStore';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { taskTemplateLibrary } from '../../../coach';
import { starterTaskTemplates } from '../../../coach/StarterQuestLibrary';
import { IconDisplay } from '../../shared/IconDisplay';
import type { Chain, Quest } from '../../../types';

interface ActiveQuestRow {
  id: string;
  chain: Chain;
  quest: Quest;
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

function measurableProgress(quest: Quest): { current: number | null; target: number | null } {
  const target = quest.specific.targetValue > 0 ? quest.specific.targetValue : null;
  if (target === null) return { current: null, target: null };
  if ((quest.measurable.taskTemplateRefs?.length ?? 0) > 0 || quest.specific.unit === 'tasks') {
    return { current: Math.min(target, Math.round((quest.progressPercent / 100) * target)), target };
  }
  return { current: quest.milestones.length, target };
}

export function TodayQuestRow() {
  const acts = useProgressionStore((s) => s.acts);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo<ActiveQuestRow[]>(() => {
    return Object.values(acts).flatMap((act) => {
      const activeChainIndex =
        act.toggle?.activeChainIndex ??
        act.chains.findIndex((chain) => chain.completionState === 'active');
      const chain = act.chains[activeChainIndex];
      if (!chain || chain.completionState !== 'active') return [];

      return chain.quests
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
  }, [acts, taskTemplates]);

  return (
    <section className="welcome-today" aria-label="Today's quests">
      <h2>Active quests</h2>
      <div className="welcome-row-list">
        {rows.length === 0 ? (
          <div className="welcome-empty-row">No active quests</div>
        ) : (
          rows.map((row) => {
            const expanded = expandedId === row.id;
            return (
              <article key={row.id} className="welcome-row">
                <button
                  type="button"
                  className="welcome-row__summary"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : row.id)}
                >
                  <span>
                    <strong>{row.quest.name}</strong>
                    <small>{row.chain.name}</small>
                  </span>
                  <span className="welcome-row__meta">
                    {row.current !== null && row.target !== null && (
                      <span>{row.current}/{row.target}</span>
                    )}
                    <IconDisplay iconKey={expanded ? 'collapse' : 'expand'} />
                  </span>
                </button>

                {expanded && (
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
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
