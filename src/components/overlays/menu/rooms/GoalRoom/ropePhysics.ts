import type { PhysicsIdeaNode } from './brainstormPhysics';
import { cr } from './brainstormPhysics';

export type RopeParticle = {
  id: string;
  edgeKey: string;
  rootId: string;
  parentNodeId: string;
  childNodeId: string;
  index: number;
  count: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export type RopeBody = {
  edgeKey: string;
  rootId: string;
  color: string;
  parentNodeId: string;
  childNodeId: string;
  particleCount: number;
};

const ROPE_DAMPING = 0.82;
const ROPE_SPRING_STIFFNESS = 0.12;
const ROPE_REPULSION_RADIUS_MULTIPLIER = 1.8;
const ROPE_REPULSION_STRENGTH = 180;
const ROPE_MAX_PARTICLES = 8;
const ROPE_MIN_PARTICLES = 3;
const ROPE_SEGMENT_LENGTH = 120;

export function ropeParticleCount(distance: number): number {
  return Math.max(ROPE_MIN_PARTICLES, Math.min(ROPE_MAX_PARTICLES, Math.round(distance / ROPE_SEGMENT_LENGTH)));
}

export function initRopeParticles(
  body: RopeBody,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): RopeParticle[] {
  const count = body.particleCount;
  const particles: RopeParticle[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 1) / (count + 1);
    particles.push({
      id: `${body.edgeKey}:${i}`,
      edgeKey: body.edgeKey,
      rootId: body.rootId,
      parentNodeId: body.parentNodeId,
      childNodeId: body.childNodeId,
      index: i,
      count,
      x: fromX + (toX - fromX) * t + (Math.random() - 0.5) * 4,
      y: fromY + (toY - fromY) * t + (Math.random() - 0.5) * 4,
      vx: 0,
      vy: 0,
    });
  }
  return particles;
}

export function stepRopePhysics(
  particles: RopeParticle[],
  bodies: Map<string, RopeBody>,
  allNodes: PhysicsIdeaNode[],
  getNodePosition: (id: string) => { x: number; y: number; radius: number } | null,
): RopeParticle[] {
  if (particles.length === 0) return particles;

  const byEdge = new Map<string, RopeParticle[]>();
  particles.forEach((p) => {
    const group = byEdge.get(p.edgeKey) ?? [];
    group.push(p);
    byEdge.set(p.edgeKey, group);
  });

  const next: RopeParticle[] = [];

  byEdge.forEach((group, edgeKey) => {
    const body = bodies.get(edgeKey);
    if (body === undefined) return;

    const parentPos = getNodePosition(body.parentNodeId);
    const childPos = getNodePosition(body.childNodeId);
    if (parentPos === null || childPos === null) return;

    const sorted = [...group].sort((a, b) => a.index - b.index);
    const anchors = [
      { x: parentPos.x, y: parentPos.y },
      ...sorted.map((p) => ({ x: p.x, y: p.y })),
      { x: childPos.x, y: childPos.y },
    ];

    const totalDist = Math.sqrt(
      (childPos.x - parentPos.x) ** 2 + (childPos.y - parentPos.y) ** 2,
    );
    const restLength = totalDist / (sorted.length + 1);

    sorted.forEach((p, i) => {
      const prev = anchors[i];
      const curr = { x: p.x, y: p.y };
      const nextAnchor = anchors[i + 2];

      let fx = 0;
      let fy = 0;

      const toPrevX = prev.x - curr.x;
      const toPrevY = prev.y - curr.y;
      const distPrev = Math.sqrt(toPrevX * toPrevX + toPrevY * toPrevY) || 1;
      const springPrev = (distPrev - restLength) * ROPE_SPRING_STIFFNESS;
      fx += (toPrevX / distPrev) * springPrev;
      fy += (toPrevY / distPrev) * springPrev;

      const toNextX = nextAnchor.x - curr.x;
      const toNextY = nextAnchor.y - curr.y;
      const distNext = Math.sqrt(toNextX * toNextX + toNextY * toNextY) || 1;
      const springNext = (distNext - restLength) * ROPE_SPRING_STIFFNESS;
      fx += (toNextX / distNext) * springNext;
      fy += (toNextY / distNext) * springNext;

      allNodes.forEach((node) => {
        if (
          node.id === body.parentNodeId ||
          node.id === body.childNodeId ||
          node.id.startsWith('__draft')
        ) return;
        const repRadius = cr(node) * ROPE_REPULSION_RADIUS_MULTIPLIER;
        const odx = curr.x - node.x;
        const ody = curr.y - node.y;
        const dist = Math.sqrt(odx * odx + ody * ody) || 1;
        if (dist < repRadius) {
          const strength = ROPE_REPULSION_STRENGTH * (1 - dist / repRadius);
          fx += (odx / dist) * strength;
          fy += (ody / dist) * strength;
        }
      });

      const newVx = (p.vx + fx) * ROPE_DAMPING;
      const newVy = (p.vy + fy) * ROPE_DAMPING;

      next.push({
        ...p,
        x: curr.x + newVx,
        y: curr.y + newVy,
        vx: newVx,
        vy: newVy,
      });
    });
  });

  return next;
}
