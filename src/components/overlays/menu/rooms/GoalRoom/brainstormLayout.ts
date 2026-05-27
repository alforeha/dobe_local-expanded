import type { BrainstormIdea, MainIdea } from '../../../../../types/brainstorm';

// PM: adjust this value to tune brainstorm overview zoom level
export const BRAINSTORM_FIT_PADDING = 0.55;

export interface MainIdeaLayout {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface IdeaLayout {
  id: string;
  x: number;
  y: number;
  radius: number;
  mainIdeaId: string;
}

export interface IdeaLayoutNode extends IdeaLayout {
  depth: number;
  parentId: string | null;
  children: IdeaLayoutNode[];
}

export interface PointerLine {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  pointerType: 'solution' | 'choice' | 'others';
}

export function getMainIdeaLayouts(
  mainIdeas: Record<string, MainIdea>,
  cx: number,
  cy: number,
  orbitRadius: number = 160,
): MainIdeaLayout[] {
  const mainIdeaList = Object.values(mainIdeas);

  return mainIdeaList.map((mainIdea, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, mainIdeaList.length) - Math.PI / 2;

    return {
      id: mainIdea.id,
      x: cx + Math.cos(angle) * orbitRadius,
      y: cy + Math.sin(angle) * orbitRadius,
      radius: 28,
    };
  });
}

function getOutwardChildAngle(
  count: number,
  index: number,
  parentAngleFromCenter: number,
): number {
  if (count <= 1) return parentAngleFromCenter;

  if (count === 2) {
    return [parentAngleFromCenter - Math.PI / 4, parentAngleFromCenter + Math.PI / 4][index] ?? parentAngleFromCenter;
  }

  const MAX_ARC = Math.PI / 3;
  const MIN_STEP = Math.PI / 12;
  const naturalStep = MAX_ARC / Math.max(1, count - 1);
  const step = Math.max(MIN_STEP, naturalStep);
  const totalArc = step * Math.max(1, count - 1);
  const startAngle = parentAngleFromCenter - totalArc / 2;

  return startAngle + step * index;
}

export function getIdeaLayoutTree(
  mainIdea: MainIdea,
  ideas: Record<string, BrainstormIdea>,
  parentX: number,
  parentY: number,
  baseRadius: number = 160,
  brainstormCenterX?: number,
  brainstormCenterY?: number,
  mainIdeaCount: number = 1,
): IdeaLayoutNode[] {
  const centerX = parentX;
  const centerY = parentY;
  const MIN_STEP = Math.PI / 12;
  const effectiveMaxArc = Math.min(
    (2 * Math.PI) / Math.max(1, mainIdeaCount),
    Math.PI * 0.75,
  );
  const arcBasedCapacity = Math.max(1, Math.floor(effectiveMaxArc / MIN_STEP));
  const outwardAngle = (brainstormCenterX !== undefined && brainstormCenterY !== undefined)
    ? Math.atan2(parentY - brainstormCenterY, parentX - brainstormCenterX)
    : -Math.PI / 2;

  const getFirstLevelAngle = (count: number, index: number): number => {
    if (count <= 1) return outwardAngle;

    if (count === 2) {
      return [outwardAngle - Math.PI / 4, outwardAngle + Math.PI / 4][index] ?? outwardAngle;
    }

    const naturalStep = effectiveMaxArc / Math.max(1, count - 1);
    const step = Math.max(MIN_STEP, naturalStep);
    const totalArc = step * Math.max(1, count - 1);
    const startAngle = outwardAngle - totalArc / 2;

    return startAngle + step * index;
  };

  const buildChildren = (
    parentIdea: BrainstormIdea,
    anchorX: number,
    anchorY: number,
    depth: number,
  ): IdeaLayoutNode[] => {
    if (depth >= 4) return [];

    const childIdeas = parentIdea.ideas
      .map((ideaId) => ideas[ideaId])
      .filter((idea): idea is BrainstormIdea => Boolean(idea));
    const childRadius = 120;
    const siblingCount = childIdeas.length;
    const CHILD_RING_CAPACITY = 6;

    return childIdeas.map((childIdea, index) => {
      const ringIndex = Math.floor(index / CHILD_RING_CAPACITY);
      const ringStart = ringIndex * CHILD_RING_CAPACITY;
      const ringCount = Math.min(CHILD_RING_CAPACITY, siblingCount - ringStart);
      const tether = childRadius * (ringIndex + 1);
      const angle = getOutwardChildAngle(
        ringCount,
        index - ringStart,
        Math.atan2(anchorY - centerY, anchorX - centerX),
      );
      const x = anchorX + Math.cos(angle) * tether;
      const y = anchorY + Math.sin(angle) * tether;
      const node: IdeaLayoutNode = {
        id: childIdea.id,
        x,
        y,
        radius: Math.max(8, 22 - (depth + 1) * 3),
        mainIdeaId: mainIdea.id,
        depth,
        parentId: parentIdea.id,
        children: [],
      };

      node.children = buildChildren(childIdea, x, y, depth + 1);
      return node;
    });
  };

  const firstLevelIdeas = mainIdea.ideas
    .map((ideaId) => ideas[ideaId])
    .filter((idea): idea is BrainstormIdea => Boolean(idea));

  return firstLevelIdeas.map((idea, index) => {
    const ringIndex = Math.floor(index / arcBasedCapacity);
    const ringStart = ringIndex * arcBasedCapacity;
    const ringCount = Math.min(arcBasedCapacity, firstLevelIdeas.length - ringStart);
    const angle = getFirstLevelAngle(ringCount, index - ringStart);
    const tether = baseRadius * (ringIndex + 1);
    const x = parentX + Math.cos(angle) * tether;
    const y = parentY + Math.sin(angle) * tether;
    const node: IdeaLayoutNode = {
      id: idea.id,
      x,
      y,
      radius: 18,
      mainIdeaId: mainIdea.id,
      depth: 0,
      parentId: null,
      children: [],
    };

    node.children = buildChildren(idea, x, y, 1);
    return node;
  });
}

export function flattenIdeaTree(nodes: IdeaLayoutNode[]): IdeaLayoutNode[] {
  return nodes.flatMap((node) => [node, ...flattenIdeaTree(node.children)]);
}

export function getTreeBoundingRadius(
  nodes: IdeaLayoutNode[],
  cx: number,
  cy: number,
): number {
  const allNodes = flattenIdeaTree(nodes);

  return allNodes.reduce((maxRadius, node) => {
    const dx = node.x - cx;
    const dy = node.y - cy;
    return Math.max(maxRadius, Math.sqrt(dx * dx + dy * dy));
  }, 0);
}

export function getPointerLines(
  ideaLayouts: IdeaLayout[],
  ideas: Record<string, BrainstormIdea>,
): PointerLine[] {
  const layoutById = new Map(ideaLayouts.map((layout) => [layout.id, layout]));

  return ideaLayouts.flatMap((sourceLayout) => {
    const idea = ideas[sourceLayout.id];
    if (!idea) return [];

    return idea.pointsTo.flatMap((pointer) => {
      const targetLayout = layoutById.get(pointer.targetId);
      if (!targetLayout) return [];

      return {
        fromX: sourceLayout.x,
        fromY: sourceLayout.y,
        toX: targetLayout.x,
        toY: targetLayout.y,
        pointerType: pointer.pointerType,
      };
    });
  });
}

export function fitScaleForBranches(
  branchRadius: number,
  canvasWidth: number,
  canvasHeight: number,
): number {
  const viewSize = Math.min(canvasWidth, canvasHeight);
  const scale = (viewSize * BRAINSTORM_FIT_PADDING) / (Math.max(1, branchRadius) * 2);

  return Math.min(2.5, Math.max(0.4, scale));
}
