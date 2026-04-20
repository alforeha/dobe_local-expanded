import { useState } from 'react';
import { useUserStore } from '../../../../../stores/useUserStore';
import {
  STAT_GROUP_KEYS,
  createDefaultTalentTrees,
  type StatGroupKey,
  type TalentNode,
  type TalentTrees,
} from '../../../../../types/user';
import { TalentTreeStatNav } from './TalentTreeStatNav';
import { TalentTreeScroll } from './TalentTreeScroll';

interface TalentTreeRoomProps {
  onBack: () => void;
}

function recalculateTreeNodes(nodes: TalentNode[]): TalentNode[] {
  const tierOneMaxed = (nodes[0]?.currentPoints ?? 0) >= (nodes[0]?.maxPoints ?? 0);
  const tierTwoMaxed =
    (nodes[1]?.currentPoints ?? 0) >= (nodes[1]?.maxPoints ?? 0) &&
    (nodes[2]?.currentPoints ?? 0) >= (nodes[2]?.maxPoints ?? 0);

  return nodes.map((node, index) => {
    if (index === 0) return { ...node, unlocked: true };
    if (index === 1 || index === 2) return { ...node, unlocked: tierOneMaxed };
    return { ...node, unlocked: tierTwoMaxed };
  });
}

function normalizeTalentTrees(talentTrees: TalentTrees | null | undefined): TalentTrees {
  const baseTrees = talentTrees ?? createDefaultTalentTrees();

  return STAT_GROUP_KEYS.reduce<TalentTrees>((nextTrees, stat) => {
    const fallbackTree = createDefaultTalentTrees()[stat];
    const sourceTree = baseTrees[stat] ?? fallbackTree;
    const normalizedNodes = recalculateTreeNodes(sourceTree.nodes.map((node, index) => ({
      ...fallbackTree.nodes[index],
      ...node,
    })));

    nextTrees[stat] = {
      nodes: normalizedNodes,
      totalSpent: normalizedNodes.reduce((sum, node) => sum + node.currentPoints, 0),
    };

    return nextTrees;
  }, createDefaultTalentTrees());
}

export function TalentTreeRoom({ onBack }: TalentTreeRoomProps) {
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);
  const stats = user?.progression.stats;
  const talentPoints = user?.progression.talentPoints ?? 0;
  const talentTrees = normalizeTalentTrees(user?.progression.talentTrees);
  const talents = stats?.talents;

  const defaultStat = talents
    ? STAT_GROUP_KEYS.reduce<StatGroupKey>(
        (best, key) =>
          (talents[key]?.statPoints ?? 0) > (talents[best]?.statPoints ?? 0) ? key : best,
        'health',
      )
    : 'health';

  const [activeStat, setActiveStat] = useState<StatGroupKey>(defaultStat);
  const [confirmNodeId, setConfirmNodeId] = useState<string | null>(null);

  if (!user || !stats) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400 dark:text-gray-500">
        No talent tree data available.
      </div>
    );
  }

  const activeTree = talentTrees[activeStat];
  const updateTalentTrees = (nextTrees: TalentTrees, nextTalentPoints: number) => {
    setUser({
      ...user,
      progression: {
        ...user.progression,
        talentPoints: nextTalentPoints,
        talentTrees: nextTrees,
      },
    });
  };

  const handleSpendPoint = (nodeId: string) => {
    const targetNode = activeTree.nodes.find((node) => node.id === nodeId);
    if (!targetNode || !targetNode.unlocked || targetNode.currentPoints >= targetNode.maxPoints || talentPoints <= 0) {
      setConfirmNodeId(null);
      return;
    }

    if (confirmNodeId !== nodeId) {
      setConfirmNodeId(nodeId);
      return;
    }

    const nextTrees = normalizeTalentTrees({
      ...talentTrees,
      [activeStat]: {
        ...activeTree,
        nodes: activeTree.nodes.map((node) =>
          node.id === nodeId ? { ...node, currentPoints: node.currentPoints + 1 } : node,
        ),
        totalSpent: activeTree.totalSpent + 1,
      },
    });

    updateTalentTrees(nextTrees, talentPoints - 1);
    setConfirmNodeId(null);
  };

  const handleReclaimAll = () => {
    const reclaimedPoints = STAT_GROUP_KEYS.reduce(
      (sum, stat) => sum + (talentTrees[stat]?.totalSpent ?? 0),
      0,
    );
    const resetTrees = normalizeTalentTrees(createDefaultTalentTrees());
    updateTalentTrees(resetTrees, talentPoints + reclaimedPoints);
    setConfirmNodeId(null);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-gray-900">
      <div className="shrink-0 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Talent Tree</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {talentPoints} point{talentPoints !== 1 ? 's' : ''} available
            </p>
          </div>
          <button
            type="button"
            className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 transition hover:border-gray-300 hover:text-gray-900 dark:border-gray-600 dark:text-gray-200 dark:hover:border-gray-500"
            onClick={handleReclaimAll}
          >
            Reclaim All
          </button>
        </div>
      </div>

      <TalentTreeStatNav
        activeStat={activeStat}
        onSelect={(stat) => {
          setActiveStat(stat);
          setConfirmNodeId(null);
        }}
      />

      <TalentTreeScroll
        stat={activeStat}
        tree={activeTree}
        confirmNodeId={confirmNodeId}
        onSpendPoint={handleSpendPoint}
      />

      <div className="shrink-0 border-t border-gray-100 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Spent in {activeStat}: <span className="font-semibold">{activeTree.totalSpent}</span>
          </p>
          <button
            type="button"
            className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
            onClick={onBack}
          >
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
}
