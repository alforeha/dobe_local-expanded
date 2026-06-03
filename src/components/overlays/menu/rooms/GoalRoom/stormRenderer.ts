import type { BrainstormIdea, MainIdea } from '../../../../../types/brainstorm';
import {
  drawBrainstormCenterGlow,
  drawBrainstormConstellation,
  drawBrainstormIdeaSpokes,
  drawBrainstormNode,
  drawPhysicsDebugRing,
  drawStormBeam,
} from './brainstormDraw';
import { drawGeneralStormBackground, drawGeneralVoidBackground } from './generalStormBackground';
import type { IdeaLayoutNode, MainIdeaLayout } from './brainstormLayout';
import type { PhysicsIdeaNode } from './brainstormPhysics';
import type { RopeBody, RopeParticle } from './ropePhysics';
import { drawRopes } from './ropeRenderer';

function patchTreeWithPhysics(
  nodes: IdeaLayoutNode[],
  physicsMap: Map<string, { x: number; y: number }>,
): (IdeaLayoutNode | null)[] {
  return nodes.map((node) => {
    const pos = physicsMap.get(node.id);
    if (pos === undefined) {
      return null;
    }
    const patched: IdeaLayoutNode = { ...node, x: pos.x, y: pos.y };
    patched.children = patchTreeWithPhysics(node.children, physicsMap).filter(
      (child): child is IdeaLayoutNode => child !== null,
    );
    return patched;
  });
}

function drawDashedOverlayRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  cameraScale: number,
) {
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.5 / cameraScale;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function renderStormWorld(
  ctx: CanvasRenderingContext2D,
  params: {
    camera: { x: number; y: number; scale: number };
    width: number;
    height: number;
    dpr: number;
    storm: {
      category: { color: string };
      type: string;
      mainIdeas: Record<string, MainIdea>;
      ideas: Record<string, BrainstormIdea>;
    };
    mainIdeaNodes: PhysicsIdeaNode[];
    childNodes: PhysicsIdeaNode[];
    mainIdeaLayouts: MainIdeaLayout[];
    ideaTrees: Record<string, IdeaLayoutNode[]>;
    selectedIdeaId: string | null;
    selectedMainIdeaId: string | null;
    isAddingChildIdea: boolean;
    isEditingChildIdea: boolean;
    draftMainIdeaLayout: MainIdeaLayout | null;
    draftChildIdeaLayout: IdeaLayoutNode | null;
    highlightedIds: Set<string>;
    ropeParticles: RopeParticle[];
    ropeBodies: Map<string, RopeBody>;
    entryScrollAngle: number;
    timestamp: number;
  },
): void {
  const {
    camera,
    width,
    height,
    dpr,
    storm,
    mainIdeaNodes,
    childNodes,
    mainIdeaLayouts,
    ideaTrees,
    selectedIdeaId,
    selectedMainIdeaId,
    isAddingChildIdea,
    isEditingChildIdea,
    draftMainIdeaLayout,
    draftChildIdeaLayout,
    highlightedIds,
    ropeParticles,
    ropeBodies,
    entryScrollAngle,
    timestamp,
  } = params;

  const canvasWidth = width;
  const canvasHeight = height;
  const canvasCenterX = width * 0.5;
  const canvasCenterY = height * 0.5;
  const physicsChildPosMap = new Map<string, { x: number; y: number }>(
    childNodes.map((n) => [n.id, { x: n.x, y: n.y }]),
  );
  const effectiveSelectedMainIdeaId = selectedIdeaId
    ? childNodes.find((node) => node.id === selectedIdeaId)?.mainIdeaId
      ?? selectedMainIdeaId
    : selectedMainIdeaId;
  const constellationLayouts = [
    ...mainIdeaNodes,
    ...(draftMainIdeaLayout ? [draftMainIdeaLayout] : []),
  ].map((layout) => ({
    ...layout,
    ...storm.mainIdeas[layout.id],
  }));
  const getNodePosition = (id: string) => {
    if (id === '__origin__') return { x: 0, y: 0, radius: 0 };
    const rootNode = mainIdeaNodes.find((n) => n.id === id);
    if (rootNode) return { x: rootNode.x, y: rootNode.y, radius: rootNode.radius };
    const childNode = childNodes.find((n) => n.id === id);
    if (childNode) return { x: childNode.x, y: childNode.y, radius: childNode.radius };
    return null;
  };

  ctx.clearRect(0, 0, width, height);

  drawBrainstormCenterGlow(
    ctx,
    canvasCenterX,
    canvasCenterY,
    canvasWidth,
    canvasHeight,
    1,
  );

  [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].forEach((angle) => {
    drawStormBeam(
      ctx,
      canvasCenterX,
      canvasCenterY,
      angle,
      storm.category.color,
      1,
      canvasWidth,
      canvasHeight,
      'selected',
    );
  });

  if (storm.type === 'general') {
    drawGeneralStormBackground(
      ctx,
      canvasCenterX,
      canvasCenterY,
      storm.category.color,
      1,
      timestamp,
    );
  }

  ctx.save();
  ctx.translate(canvasCenterX, canvasCenterY);
  ctx.scale(camera.scale, camera.scale);
  ctx.translate(-camera.x, -camera.y);

  drawGeneralVoidBackground(
    ctx,
    ctx.canvas.width / dpr,
    ctx.canvas.height / dpr,
    0.4,
  );
  drawBrainstormNode(ctx, 0, 0, 28, '', 1, false, true, 1);

  const patchedTreesByMainIdeaId = new Map<string, IdeaLayoutNode[]>();
  mainIdeaNodes.forEach((physNode) => {
    if (physNode.id.startsWith('__draft')) {
      patchedTreesByMainIdeaId.set(physNode.id, []);
      return;
    }

    const tree = ideaTrees[physNode.id] ?? [];
    const patchedTree = patchTreeWithPhysics(tree, physicsChildPosMap).filter(
      (node): node is IdeaLayoutNode => node !== null && !node.id.startsWith('__draft'),
    );
    patchedTreesByMainIdeaId.set(physNode.id, patchedTree);
  });

  drawRopes(
    ctx,
    ropeParticles,
    ropeBodies,
    getNodePosition,
    camera.scale,
    effectiveSelectedMainIdeaId,
    highlightedIds,
  );

  drawBrainstormConstellation(
    ctx,
    constellationLayouts,
    effectiveSelectedMainIdeaId,
    null,
    highlightedIds,
    selectedIdeaId,
    timestamp,
    storm.mainIdeas,
  );

  if (draftMainIdeaLayout) {
    drawDashedOverlayRing(
      ctx,
      draftMainIdeaLayout.x,
      draftMainIdeaLayout.y,
      draftMainIdeaLayout.radius,
      camera.scale,
    );
  }

  mainIdeaNodes.forEach((physNode) => {
    const patchedTree = patchedTreesByMainIdeaId.get(physNode.id) ?? [];
    drawBrainstormIdeaSpokes(
      ctx,
      patchedTree,
      storm.ideas,
      highlightedIds,
      selectedIdeaId,
      null,
      physNode.x,
      physNode.y,
      timestamp,
      entryScrollAngle,
    );
  });

  mainIdeaNodes.forEach((node) => {
    drawPhysicsDebugRing(ctx, node, camera.scale);
  });
  childNodes.forEach((node) => {
    drawPhysicsDebugRing(ctx, node, camera.scale);
  });

  if (isAddingChildIdea && draftChildIdeaLayout) {
    drawDashedOverlayRing(
      ctx,
      draftChildIdeaLayout.x,
      draftChildIdeaLayout.y,
      draftChildIdeaLayout.radius,
      camera.scale,
    );
  }

  if (isEditingChildIdea) {
    const targetIdeaLayout = selectedIdeaId
      ? childNodes.find((node) => node.id === selectedIdeaId) ?? null
      : null;
    const targetMainIdeaLayout = selectedIdeaId
      ? null
      : selectedMainIdeaId
        ? mainIdeaLayouts.find((layout) => layout.id === selectedMainIdeaId) ?? null
        : null;
    const editingLayout = targetIdeaLayout ?? targetMainIdeaLayout;

    if (editingLayout) {
      drawDashedOverlayRing(
        ctx,
        editingLayout.x,
        editingLayout.y,
        editingLayout.radius,
        camera.scale,
      );
    }
  }

  ctx.restore();
}
