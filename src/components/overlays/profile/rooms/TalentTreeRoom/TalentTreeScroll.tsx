import type { StatGroupKey, StatTalentTree } from '../../../../../types/user';
import { TalentTierSlot } from './TalentTierSlot';

const NODE_COPY: Record<StatGroupKey, Array<{ title: string; description: string; icon: string }>> = {
  health: [
    { title: 'Vital Practice', description: '+1 base XP on health tasks', icon: 'health' },
    { title: 'Medic Kit', description: '+1 XP when health gear is equipped', icon: 'equipment' },
    { title: 'Recovery Loop', description: '+1% XP on health tasks inside events', icon: 'event' },
    { title: 'Daily Pulse', description: 'Stub: login XP bonus wiring', icon: 'star' },
  ],
  strength: [
    { title: 'Power Lift', description: '+1 base XP on strength tasks', icon: 'strength' },
    { title: 'Loaded Gear', description: '+1 XP when strength gear is equipped', icon: 'equipment' },
    { title: 'Arena Tempo', description: '+1% XP on strength tasks inside events', icon: 'event' },
    { title: 'Fitness Surge', description: 'Stub: fitness-tag tasks double XP', icon: 'fitness' },
  ],
  agility: [
    { title: 'Swift Step', description: '+1 base XP on agility tasks', icon: 'agility' },
    { title: 'Light Kit', description: '+1 XP when agility gear is equipped', icon: 'equipment' },
    { title: 'Momentum Run', description: '+1% XP on agility tasks inside events', icon: 'event' },
    { title: 'Clean Finish', description: 'Stub: QA completion +5 XP', icon: 'check' },
  ],
  defense: [
    { title: 'Shield Drill', description: '+1 base XP on defense tasks', icon: 'defense' },
    { title: 'Fortified Gear', description: '+1 XP when defense gear is equipped', icon: 'equipment' },
    { title: 'Guard Shift', description: '+1% XP on defense tasks inside events', icon: 'event' },
    { title: 'Resource Wall', description: 'Stub: resource tasks double XP', icon: 'lock' },
  ],
  charisma: [
    { title: 'Presence', description: '+1 base XP on charisma tasks', icon: 'charisma' },
    { title: 'Social Fit', description: '+1 XP when charisma gear is equipped', icon: 'equipment' },
    { title: 'Spotlight', description: '+1% XP on charisma tasks inside events', icon: 'event' },
    { title: 'Shared Spark', description: 'Stub: shared tasks double XP', icon: 'social' },
  ],
  wisdom: [
    { title: 'Study Habit', description: '+1 base XP on wisdom tasks', icon: 'wisdom' },
    { title: 'Scholar Gear', description: '+1 XP when wisdom gear is equipped', icon: 'equipment' },
    { title: 'Deep Session', description: '+1% XP on wisdom tasks inside events', icon: 'event' },
    { title: 'Insight Bloom', description: 'Stub: wisdom tasks double XP', icon: 'glow' },
  ],
};

interface TalentTreeScrollProps {
  stat: StatGroupKey;
  tree: StatTalentTree;
  confirmNodeId: string | null;
  onSpendPoint: (nodeId: string) => void;
}

export function TalentTreeScroll({
  stat,
  tree,
  confirmNodeId,
  onSpendPoint,
}: TalentTreeScrollProps) {
  const [tierOne, tierTwoLeft, tierTwoRight, tierThree] = tree.nodes;
  const copy = NODE_COPY[stat];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto flex min-h-full w-full max-w-md items-center justify-center">
        <div className="relative w-full py-8">
          <div className="pointer-events-none absolute left-1/2 top-[7.25rem] h-20 w-px -translate-x-1/2 bg-gray-200 dark:bg-gray-700" />
          <div className="pointer-events-none absolute left-1/2 top-[12.25rem] h-16 w-px -translate-x-1/2 bg-gray-200 dark:bg-gray-700" />
          <div className="pointer-events-none absolute left-[32%] top-[9.25rem] h-px w-[18%] -rotate-[26deg] bg-gray-200 dark:bg-gray-700" />
          <div className="pointer-events-none absolute right-[32%] top-[9.25rem] h-px w-[18%] rotate-[26deg] bg-gray-200 dark:bg-gray-700" />
          <div className="pointer-events-none absolute left-[32%] top-[14.5rem] h-px w-[18%] rotate-[24deg] bg-gray-200 dark:bg-gray-700" />
          <div className="pointer-events-none absolute right-[32%] top-[14.5rem] h-px w-[18%] -rotate-[24deg] bg-gray-200 dark:bg-gray-700" />

          <div className="flex flex-col items-center gap-7">
            <TalentTierSlot
              stat={stat}
              node={tierOne}
              title={copy[0].title}
              description={copy[0].description}
              icon={copy[0].icon}
              confirmPending={confirmNodeId === tierOne.id}
              onClick={() => onSpendPoint(tierOne.id)}
            />

            <div className="grid w-full grid-cols-2 gap-5">
              <TalentTierSlot
                stat={stat}
                node={tierTwoLeft}
                title={copy[1].title}
                description={copy[1].description}
                icon={copy[1].icon}
                confirmPending={confirmNodeId === tierTwoLeft.id}
                onClick={() => onSpendPoint(tierTwoLeft.id)}
              />
              <TalentTierSlot
                stat={stat}
                node={tierTwoRight}
                title={copy[2].title}
                description={copy[2].description}
                icon={copy[2].icon}
                confirmPending={confirmNodeId === tierTwoRight.id}
                onClick={() => onSpendPoint(tierTwoRight.id)}
              />
            </div>

            <TalentTierSlot
              stat={stat}
              node={tierThree}
              title={copy[3].title}
              description={copy[3].description}
              icon={copy[3].icon}
              confirmPending={confirmNodeId === tierThree.id}
              onClick={() => onSpendPoint(tierThree.id)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
