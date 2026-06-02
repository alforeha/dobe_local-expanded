import { BRAINSTORM_FIT_PADDING } from './brainstormLayout';
import type { PhysicsIdeaNode } from './brainstormPhysics';

type BoundsNode = {
  x: number;
  y: number;
  radius: number;
};

function collectBounds(nodes: BoundsNode[]) {
  if (nodes.length === 0) {
    return {
      minX: -180,
      maxX: 180,
      minY: -180,
      maxY: 180,
      centroidX: 0,
      centroidY: 0,
    };
  }

  const minX = Math.min(...nodes.map((node) => node.x - node.radius));
  const maxX = Math.max(...nodes.map((node) => node.x + node.radius));
  const minY = Math.min(...nodes.map((node) => node.y - node.radius));
  const maxY = Math.max(...nodes.map((node) => node.y + node.radius));
  const centroidX = nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length;
  const centroidY = nodes.reduce((sum, node) => sum + node.y, 0) / nodes.length;

  return {
    minX,
    maxX,
    minY,
    maxY,
    centroidX,
    centroidY,
  };
}

function collectSubtreeIds(flatIdeas: PhysicsIdeaNode[], rootId: string) {
  const ids = new Set<string>([rootId]);
  let added = true;

  while (added) {
    added = false;
    flatIdeas.forEach((node) => {
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id);
        added = true;
      }
    });
  }

  return ids;
}

export function computeCameraTarget(params: {
  width: number;
  height: number;
  mainIdeaNodes: PhysicsIdeaNode[];
  childNodes: PhysicsIdeaNode[];
  selectedIdeaId: string | null;
  selectedMainIdeaId: string | null;
  isAddingChildIdea: boolean;
  isEditingChildIdea: boolean;
  ideaPillBlurbOpen: boolean;
  draftChildNode: PhysicsIdeaNode | null;
}): { x: number; y: number; scale: number } {
  const {
    width,
    height,
    mainIdeaNodes,
    childNodes,
    selectedIdeaId,
    selectedMainIdeaId,
    isAddingChildIdea,
    isEditingChildIdea,
    ideaPillBlurbOpen,
    draftChildNode,
  } = params;

  if (mainIdeaNodes.length === 0) {
    return { x: 0, y: 0, scale: 1 };
  }

  const childNodeById = new Map(childNodes.map((node) => [node.id, node]));
  const selectedNode = selectedIdeaId ? childNodeById.get(selectedIdeaId) ?? null : null;
  let focusNodes: BoundsNode[] = [];

  if (ideaPillBlurbOpen && selectedNode) {
    const originNode: BoundsNode = { x: 0, y: 0, radius: 28 };
    const selectedMainLayout = mainIdeaNodes.find((layout) => layout.id === selectedNode.mainIdeaId) ?? null;
    const ancestorPathNodes: PhysicsIdeaNode[] = [];
    let currentParentId = selectedNode.parentId;
    while (currentParentId) {
      const ancestorNode = childNodeById.get(currentParentId);
      if (ancestorNode) {
        ancestorPathNodes.push(ancestorNode);
      }
      currentParentId = childNodeById.get(currentParentId)?.parentId ?? null;
    }
    focusNodes = [
      originNode,
      ...(selectedMainLayout ? [selectedMainLayout] : []),
      ...ancestorPathNodes,
      selectedNode,
    ];
  } else if (isAddingChildIdea && selectedNode) {
    focusNodes = [
      selectedNode,
      ...(draftChildNode ? [draftChildNode] : []),
    ];
  } else if (isAddingChildIdea && selectedMainIdeaId) {
    const selectedMainLayout = mainIdeaNodes.find((layout) => layout.id === selectedMainIdeaId) ?? null;
    focusNodes = [
      ...(selectedMainLayout ? [selectedMainLayout] : []),
      ...(draftChildNode ? [draftChildNode] : []),
    ];
  } else if (isEditingChildIdea && selectedNode) {
    focusNodes = [
      selectedNode,
      ...childNodes.filter((node) => node.parentId === selectedNode.id),
    ];
  } else if (isEditingChildIdea && selectedMainIdeaId) {
    const selectedMainLayout = mainIdeaNodes.find((layout) => layout.id === selectedMainIdeaId) ?? null;
    const immediateChildren = childNodes.filter(
      (node) => node.mainIdeaId === selectedMainIdeaId && node.parentId === null,
    );
    focusNodes = [
      ...(selectedMainLayout ? [selectedMainLayout] : []),
      ...immediateChildren,
    ];
  } else if (selectedNode) {
    const subtreeIds = collectSubtreeIds(childNodes, selectedNode.id);
    focusNodes = childNodes.filter((node) => subtreeIds.has(node.id));
  } else if (selectedMainIdeaId) {
    const selectedMainLayout = mainIdeaNodes.find((layout) => layout.id === selectedMainIdeaId) ?? null;
    const selectedChildren = childNodes.filter(
      (node) => node.mainIdeaId === selectedMainIdeaId,
    );
    focusNodes = [
      ...(selectedMainLayout ? [selectedMainLayout] : []),
      ...selectedChildren,
    ];
  } else {
    focusNodes = [...mainIdeaNodes, ...childNodes];
  }

  const bounds = collectBounds(focusNodes);
  const padding = BRAINSTORM_FIT_PADDING ?? 0.8;
  let targetScale = 1;

  if (focusNodes.length === 1) {
    const fitScale = Math.min(
      (width * padding) / 240,
      (height * padding) / 240,
      2.5,
    );
    targetScale = Math.max(0.05, fitScale);
  } else {
    const boundsWidth = bounds.maxX - bounds.minX;
    const boundsHeight = bounds.maxY - bounds.minY;
    const scaleX = (width * padding) / Math.max(1, boundsWidth);
    const scaleY = (height * padding) / Math.max(1, boundsHeight);
    const fitScale = Math.min(scaleX, scaleY, 2.5);
    targetScale = Math.max(0.01, fitScale);
  }

  return {
    x: bounds.centroidX,
    y: bounds.centroidY,
    scale: targetScale,
  };
}
