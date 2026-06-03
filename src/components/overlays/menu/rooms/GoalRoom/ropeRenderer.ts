import type { RopeParticle, RopeBody } from './ropePhysics';

export function drawRopes(
  ctx: CanvasRenderingContext2D,
  particles: RopeParticle[],
  bodies: Map<string, RopeBody>,
  getNodePosition: (id: string) => { x: number; y: number; radius: number } | null,
  cameraScale: number,
  selectedRootId: string | null,
  highlightedIds: Set<string>,
): void {
  if (particles.length === 0) return;

  const byEdge = new Map<string, RopeParticle[]>();
  particles.forEach((p) => {
    const group = byEdge.get(p.edgeKey) ?? [];
    group.push(p);
    byEdge.set(p.edgeKey, group);
  });

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5 / Math.max(cameraScale, 0.001);

  byEdge.forEach((group, edgeKey) => {
    const body = bodies.get(edgeKey);
    if (body === undefined) return;

    const parentPos = getNodePosition(body.parentNodeId);
    const childPos = getNodePosition(body.childNodeId);
    if (parentPos === null || childPos === null) return;

    const sorted = [...group].sort((a, b) => a.index - b.index);

    const dx = childPos.x - parentPos.x;
    const dy = childPos.y - parentPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;

    const fromRadius = body.parentNodeId === '__origin__' ? 0 : parentPos.radius;
    const startX = parentPos.x + ux * fromRadius;
    const startY = parentPos.y + uy * fromRadius;
    const endX = childPos.x - ux * childPos.radius;
    const endY = childPos.y - uy * childPos.radius;

    const pts = [
      { x: startX, y: startY },
      ...sorted.map((p) => ({ x: p.x, y: p.y })),
      { x: endX, y: endY },
    ];

    const isSelected = body.rootId === selectedRootId;
    const isHighlighted = highlightedIds.has(body.childNodeId) || highlightedIds.has(body.parentNodeId);
    const hasHighlights = highlightedIds.size > 0;

    ctx.strokeStyle = body.color;
    ctx.globalAlpha = isSelected || isHighlighted ? 1 : hasHighlights ? 0.15 : 0.5;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }

    ctx.stroke();
  });

  ctx.restore();
}