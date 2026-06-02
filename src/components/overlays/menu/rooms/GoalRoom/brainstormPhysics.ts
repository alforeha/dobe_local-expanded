import type { IdeaLayoutNode } from './brainstormLayout';

export interface PhysicsIdeaNode {
  id: string;
  parentId: string | null;
  rootIdentityId: string;
  frozen: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  freezeCountdown: number;
  entryCount: number;
  descendantCount: number;
  radius: number;
  depth: number;
  mainIdeaId: string;
  children: IdeaLayoutNode[];
}

export const PHYSICS_CONSTANTS = {
  BASE_TETHER: 160,
  RADIUS_BASELINE: 18,
  PADDING_PER_ENTRY: 2.0,
  BOWL_STIFFNESS: 0.05,
  DAMPING: 0.85,
  SPAWN_JITTER: 0.3,
  JITTER_STRENGTH: 0.05,
  BRANCH_AXIS_BIAS: .1,
  BRANCH_GAP_MULTIPLIER: 4,
  ANCESTOR_GAP_MULTIPLIER: 3.5,
  SIBLING_BRANCH_MULTIPLIER: 1.8,
  TETHER_BARRIER_RADIUS: 0.5,
  PARENT_GAP: 400,
  DESCENDANT_DISTANCE_FACTOR: 100,
} as const;

export function cr(node: Pick<PhysicsIdeaNode, 'entryCount'>): number {
  return PHYSICS_CONSTANTS.BASE_TETHER
    + node.entryCount * PHYSICS_CONSTANTS.PADDING_PER_ENTRY;
}

export function getPhysicsRadius(entryCount: number): number {
  return PHYSICS_CONSTANTS.RADIUS_BASELINE
    + entryCount * PHYSICS_CONSTANTS.PADDING_PER_ENTRY;
}

export function parentRestDistance(
  node: Pick<PhysicsIdeaNode, 'entryCount' | 'descendantCount'>,
  parent: Pick<PhysicsIdeaNode, 'entryCount'>,
): number {
  return cr(node) + cr(parent) + PHYSICS_CONSTANTS.PARENT_GAP
    + node.descendantCount * PHYSICS_CONSTANTS.DESCENDANT_DISTANCE_FACTOR;
}

function bowlStiffnessFor(node: PhysicsIdeaNode): number {
  return Math.max(
    PHYSICS_CONSTANTS.BOWL_STIFFNESS * 0.2,
    PHYSICS_CONSTANTS.BOWL_STIFFNESS
      / (1 + Math.sqrt(node.descendantCount ?? 0) * 0.3),
  );
}

function isAncestorOf(
  ancestor: PhysicsIdeaNode,
  descendant: PhysicsIdeaNode,
  nodeMap: Map<string, PhysicsIdeaNode>,
): boolean {
  let currentParentId = descendant.parentId;
  const visited = new Set<string>();

  while (currentParentId !== null) {
    if (currentParentId === ancestor.id) {
      return true;
    }
    if (visited.has(currentParentId)) {
      return false;
    }
    visited.add(currentParentId);
    currentParentId = nodeMap.get(currentParentId)?.parentId ?? null;
  }

  return false;
}

function deterministicDirection(idA: string, idB: string) {
  let hash = 0;
  const key = `${idA}:${idB}`;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  const angle = (Math.abs(hash) % 6283) / 1000;
  return {
    x: Math.cos(angle),
    y: Math.sin(angle),
  };
}

function zeroInwardVelocity(
  pos: { vx: number; vy: number },
  unitX: number,
  unitY: number,
  side: 'a' | 'b',
) {
  const dot = pos.vx * unitX + pos.vy * unitY;
  if ((side === 'a' && dot < 0) || (side === 'b' && dot > 0)) {
    pos.vx -= unitX * dot;
    pos.vy -= unitY * dot;
  }
}

function getBranchAxisUnit(
  node: PhysicsIdeaNode,
  work: Map<string, { x: number; y: number; vx: number; vy: number }>,
  nodeMap: Map<string, PhysicsIdeaNode>,
) {
  const parentPos = node.parentId ? work.get(node.parentId) : undefined;
  if (parentPos === undefined) {
    return undefined;
  }

  const grandparent = node.parentId ? nodeMap.get(node.parentId) : undefined;
  const grandparentPos = grandparent?.parentId ? work.get(grandparent.parentId) : undefined;
  const axisSourceX = grandparentPos?.x ?? 0;
  const axisSourceY = grandparentPos?.y ?? 0;
  const axisDx = parentPos.x - axisSourceX;
  const axisDy = parentPos.y - axisSourceY;
  const axisDist = Math.sqrt(axisDx * axisDx + axisDy * axisDy);
  if (axisDist < 0.0001) {
    return undefined;
  }

  return {
    x: axisDx / axisDist,
    y: axisDy / axisDist,
  };
}

export function stepPhysics(nodes: PhysicsIdeaNode[]): PhysicsIdeaNode[] {
  type WorkPos = { x: number; y: number; vx: number; vy: number };
  const work = new Map<string, WorkPos>(
    nodes.map((node): [string, WorkPos] => [
      node.id,
      { x: node.x, y: node.y, vx: node.vx, vy: node.vy },
    ]),
  );
  const nodeMap = new Map<string, PhysicsIdeaNode>(
    nodes.map((node): [string, PhysicsIdeaNode] => [node.id, node]),
  );

  for (const node of nodes) {
    if (node.parentId === null) {
      continue;
    }
    if (node.frozen) {
      continue;
    }

    const pos = work.get(node.id);
    if (pos === undefined) {
      continue;
    }

    if (node.parentId === '__origin__') {
      const dx = pos.x;
      const dy = pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const origin = nodeMap.get('__origin__') ?? { entryCount: 0 };
      const originTargetDist = parentRestDistance(node, origin);
      if (dist < 0.001) {
        const direction = deterministicDirection('__origin__', node.id);
        pos.vx += direction.x * originTargetDist * PHYSICS_CONSTANTS.BOWL_STIFFNESS;
        pos.vy += direction.y * originTargetDist * PHYSICS_CONSTANTS.BOWL_STIFFNESS;
      } else {
        const unitX = dx / dist;
        const unitY = dy / dist;
        const displacement = dist - originTargetDist;
        pos.vx -= unitX * displacement * PHYSICS_CONSTANTS.BOWL_STIFFNESS;
        pos.vy -= unitY * displacement * PHYSICS_CONSTANTS.BOWL_STIFFNESS;
      }
      continue;
    }

    const parent = nodeMap.get(node.parentId);
    const parentPos = work.get(node.parentId);
    if (parent === undefined || parentPos === undefined) {
      continue;
    }

    const dx = parentPos.x - pos.x;
    const dy = parentPos.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const targetDist = parentRestDistance(node, parent);
    const displacement = dist - targetDist;
    const unitX = dist > 0.001 ? dx / dist : 0;
    const unitY = dist > 0.001 ? dy / dist : 0;
    const bowlStiffness = bowlStiffnessFor(node);
    pos.vx += unitX * displacement * bowlStiffness;
    pos.vy += unitY * displacement * bowlStiffness;
  }

  for (const node of nodes) {
    if (node.parentId === null || node.parentId === '__origin__') {
      continue;
    }
    if (node.frozen) {
      continue;
    }

    const pos = work.get(node.id);
    if (pos === undefined) {
      continue;
    }

    const parent = nodeMap.get(node.parentId);
    const parentPos = work.get(node.parentId);
    if (parent === undefined || parentPos === undefined) {
      continue;
    }

    const grandparent = parent.parentId ? nodeMap.get(parent.parentId) : undefined;
    const grandparentPos = parent.parentId ? work.get(parent.parentId) : undefined;
    const originFallback = grandparent === undefined || grandparentPos === undefined;
    const axisSourceX = originFallback ? 0 : grandparentPos.x;
    const axisSourceY = originFallback ? 0 : grandparentPos.y;
    const axisDx = parentPos.x - axisSourceX;
    const axisDy = parentPos.y - axisSourceY;
    const axisDist = Math.sqrt(axisDx * axisDx + axisDy * axisDy);
    if (axisDist < 0.0001) {
      continue;
    }

    const axisX = axisDx / axisDist;
    const axisY = axisDy / axisDist;
    const offsetX = pos.x - parentPos.x;
    const offsetY = pos.y - parentPos.y;
    const dot = offsetX * axisX + offsetY * axisY;

    if (dot < 0) {
      pos.vx += axisX * PHYSICS_CONSTANTS.BRANCH_AXIS_BIAS * 3;
      pos.vy += axisY * PHYSICS_CONSTANTS.BRANCH_AXIS_BIAS * 3;
    } else if (dot < cr(node)) {
      pos.vx += axisX * PHYSICS_CONSTANTS.BRANCH_AXIS_BIAS;
      pos.vy += axisY * PHYSICS_CONSTANTS.BRANCH_AXIS_BIAS;
    }
  }

  for (const node of nodes) {
    if (node.parentId === null) {
      continue;
    }
    if (node.frozen) {
      continue;
    }

    const pos = work.get(node.id);
    if (pos === undefined) {
      continue;
    }

    pos.vx *= PHYSICS_CONSTANTS.DAMPING;
    pos.vy *= PHYSICS_CONSTANTS.DAMPING;
  }

  for (const node of nodes) {
    if (node.parentId === null) {
      continue;
    }
    if (node.frozen) {
      continue;
    }

    const pos = work.get(node.id);
    if (pos === undefined) {
      continue;
    }

    pos.x += pos.vx;
    pos.y += pos.vy;
  }

  for (let iter = 0; iter < 5; iter++) {
    for (const node of nodes) {
      if (node.parentId === null) {
        continue;
      }
      if (node.frozen) {
        continue;
      }
      if (node.parentId !== '__origin__') {
        continue;
      }

      const pos = work.get(node.id);
      if (pos === undefined) {
        continue;
      }

      let dx = pos.x;
      let dy = pos.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      const origin = nodeMap.get('__origin__') ?? { entryCount: 0 };
      const minDist = parentRestDistance(node, origin);

      if (dist >= minDist) {
        continue;
      }

      if (dist < 0.0001) {
        const direction = deterministicDirection('__origin__', node.id);
        dx = direction.x;
        dy = direction.y;
        dist = 1;
      }

      const unitX = dx / dist;
      const unitY = dy / dist;
      pos.x = unitX * minDist;
      pos.y = unitY * minDist;

      const inwardVelocity = pos.vx * unitX + pos.vy * unitY;
      if (inwardVelocity < 0) {
        pos.vx -= unitX * inwardVelocity;
        pos.vy -= unitY * inwardVelocity;
      }
    }

    for (const node of nodes) {
      if (node.id === '__origin__') {
        continue;
      }
      if (node.frozen) {
        continue;
      }
      if (node.parentId === null) {
        continue;
      }

      const parent = nodeMap.get(node.parentId);
      const pos = work.get(node.id);
      if (parent === undefined || pos === undefined) {
        continue;
      }

let ancestorId = parent.parentId;
      const visited = new Set<string>();
      while (ancestorId !== null) {
        if (visited.has(ancestorId)) {
          break;
        }
        visited.add(ancestorId);

        const ancestor = nodeMap.get(ancestorId);
        const ancestorPos = work.get(ancestorId);
        if (ancestor === undefined || ancestorPos === undefined) {
          break;
        }

        if (ancestor.parentId === null) {
          ancestorId = ancestor.parentId;
          continue;
        }

        let dx = pos.x - ancestorPos.x;
        let dy = pos.y - ancestorPos.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = (cr(node) + cr(ancestor))
          * PHYSICS_CONSTANTS.ANCESTOR_GAP_MULTIPLIER;

        if (dist < minDist) {
          if (dist < 0.0001) {
            const direction = deterministicDirection(ancestor.id, node.id);
            dx = direction.x;
            dy = direction.y;
            dist = 1;
          }

          const unitX = dx / dist;
          const unitY = dy / dist;
          pos.x = ancestorPos.x + unitX * minDist;
          pos.y = ancestorPos.y + unitY * minDist;

          const inwardVelocity = pos.vx * unitX + pos.vy * unitY;
          if (inwardVelocity < 0) {
            pos.vx -= unitX * inwardVelocity;
            pos.vy -= unitY * inwardVelocity;
          }
        }

        ancestorId = ancestor.parentId;
      }
    }

    const tetherSegments: Array<{
      ax: number;
      ay: number;
      bx: number;
      by: number;
      ownerNode: PhysicsIdeaNode;
      ownerParent: string;
      ownerRootId: string;
    }> = [];

    for (const node of nodes) {
      if (node.parentId === null || node.parentId === '__origin__') {
        continue;
      }

      const parentPos = work.get(node.parentId);
      const nodePos = work.get(node.id);
      if (parentPos === undefined || nodePos === undefined) {
        continue;
      }

      tetherSegments.push({
        ax: parentPos.x,
        ay: parentPos.y,
        bx: nodePos.x,
        by: nodePos.y,
        ownerNode: node,
        ownerParent: node.parentId,
        ownerRootId: node.rootIdentityId,
      });
    }

    for (const node of nodes) {
      if (node.parentId === null) {
        continue;
      }
      if (node.frozen) {
        continue;
      }

      const pos = work.get(node.id);
      if (pos === undefined) {
        continue;
      }

      for (const segment of tetherSegments) {
        if (segment.ownerNode.id === node.id) {
          continue;
        }
        if (segment.ownerParent === node.id) {
          continue;
        }
        if (segment.ownerRootId === node.rootIdentityId) {
          continue;
        }
        if (isAncestorOf(node, segment.ownerNode, nodeMap)) {
          continue;
        }
        if (isAncestorOf(segment.ownerNode, node, nodeMap)) {
          continue;
        }

        const abx = segment.bx - segment.ax;
        const aby = segment.by - segment.ay;
        const abLenSq = abx * abx + aby * aby;
        if (abLenSq < 0.001) {
          continue;
        }

        const acx = pos.x - segment.ax;
        const acy = pos.y - segment.ay;
        const t = Math.max(0, Math.min(1, (acx * abx + acy * aby) / abLenSq));
        const closestX = segment.ax + abx * t;
        const closestY = segment.ay + aby * t;

        const dx = pos.x - closestX;
        const dy = pos.y - closestY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const exclusionDist = cr(node) * PHYSICS_CONSTANTS.TETHER_BARRIER_RADIUS;

        if (dist >= exclusionDist || dist <= 0.001) {
          continue;
        }

        const overlap = exclusionDist - dist;
        const unitX = dx / dist;
        const unitY = dy / dist;
        pos.x += unitX * overlap;
        pos.y += unitY * overlap;

        const inward = pos.vx * -unitX + pos.vy * -unitY;
        if (inward > 0) {
          pos.vx += unitX * inward;
          pos.vy += unitY * inward;
        }
      }
    }

    for (let i = 0; i < nodes.length; i++) {
      const nodeA = nodes[i];
      if (nodeA.parentId === null) {
        continue;
      }
      const posA = work.get(nodeA.id);
      if (posA === undefined) {
        continue;
      }

      for (let j = i + 1; j < nodes.length; j++) {
        const nodeB = nodes[j];
        if (nodeB.parentId === null) {
          continue;
        }
        const posB = work.get(nodeB.id);
        if (posB === undefined) {
          continue;
        }

        const baseMinDist = cr(nodeA) + cr(nodeB);
        let dx = posA.x - posB.x;
        let dy = posA.y - posB.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        const aIsAncestor = isAncestorOf(nodeA, nodeB, nodeMap);
        const bIsAncestor = isAncestorOf(nodeB, nodeA, nodeMap);
        const isSiblingPair = nodeA.parentId === nodeB.parentId
          && !aIsAncestor
          && !bIsAncestor;
        const isCrossBranch = nodeA.rootIdentityId !== nodeB.rootIdentityId;
        const isSameRootDifferentSubtree = nodeA.rootIdentityId === nodeB.rootIdentityId
          && nodeA.parentId !== nodeB.parentId
          && !aIsAncestor
          && !bIsAncestor;
        const branchWeight = Math.log1p(
          Math.max(nodeA.descendantCount ?? 0, nodeB.descendantCount ?? 0),
        );
        const weightedMultiplier = Math.min(
          PHYSICS_CONSTANTS.BRANCH_GAP_MULTIPLIER,
          PHYSICS_CONSTANTS.SIBLING_BRANCH_MULTIPLIER
            * (1 + branchWeight * 0.2),
        );
        let effectiveMinDist = baseMinDist;

        if (isSiblingPair) {
          effectiveMinDist *= weightedMultiplier;
        } else if (isCrossBranch) {
          effectiveMinDist *= PHYSICS_CONSTANTS.BRANCH_GAP_MULTIPLIER;
        } else if (isSameRootDifferentSubtree) {
          effectiveMinDist *= weightedMultiplier;
        }

        if (dist >= effectiveMinDist) {
          continue;
        }

        const overlap = effectiveMinDist - dist;

        if (dist < 0.0001) {
          const direction = deterministicDirection(nodeA.id, nodeB.id);
          dx = direction.x;
          dy = direction.y;
          dist = 1;
        }

        const unitX = dx / dist;
        const unitY = dy / dist;

        if (nodeA.frozen && nodeB.frozen) {
          continue;
        } else if (nodeA.frozen) {
          const branchAxis = getBranchAxisUnit(nodeB, work, nodeMap);
          let pushX = -unitX;
          let pushY = -unitY;
          if (branchAxis !== undefined) {
            const blendedX = pushX * 0.5 + branchAxis.x * 0.5;
            const blendedY = pushY * 0.5 + branchAxis.y * 0.5;
            const blendedDist = Math.sqrt(blendedX * blendedX + blendedY * blendedY);
            if (blendedDist >= 0.0001) {
              pushX = blendedX / blendedDist;
              pushY = blendedY / blendedDist;
            }
          }
          posB.x += pushX * overlap;
          posB.y += pushY * overlap;
          zeroInwardVelocity(posB, -pushX, -pushY, 'b');
        } else if (nodeB.frozen) {
          const branchAxis = getBranchAxisUnit(nodeA, work, nodeMap);
          let pushX = unitX;
          let pushY = unitY;
          if (branchAxis !== undefined) {
            const blendedX = pushX * 0.5 + branchAxis.x * 0.5;
            const blendedY = pushY * 0.5 + branchAxis.y * 0.5;
            const blendedDist = Math.sqrt(blendedX * blendedX + blendedY * blendedY);
            if (blendedDist >= 0.0001) {
              pushX = blendedX / blendedDist;
              pushY = blendedY / blendedDist;
            }
          }
          posA.x += pushX * overlap;
          posA.y += pushY * overlap;
          zeroInwardVelocity(posA, pushX, pushY, 'a');
        } else if (aIsAncestor) {
          posB.x -= unitX * overlap;
          posB.y -= unitY * overlap;
          zeroInwardVelocity(posB, unitX, unitY, 'b');
        } else if (bIsAncestor) {
          posA.x += unitX * overlap;
          posA.y += unitY * overlap;
          zeroInwardVelocity(posA, unitX, unitY, 'a');
        } else {
          const halfOverlap = overlap / 2;
          posA.x += unitX * halfOverlap;
          posA.y += unitY * halfOverlap;
          posB.x -= unitX * halfOverlap;
          posB.y -= unitY * halfOverlap;
          zeroInwardVelocity(posA, unitX, unitY, 'a');
          zeroInwardVelocity(posB, unitX, unitY, 'b');
        }
      }
    }
  }

  for (const node of nodes) {
    if (node.id === '__origin__') {
      continue;
    }
    if (node.frozen) {
      continue;
    }
    if (node.parentId === null) {
      continue;
    }

    const parent = nodeMap.get(node.parentId);
    const parentPos = work.get(node.parentId);
    const pos = work.get(node.id);
    if (parent === undefined || parentPos === undefined || pos === undefined) {
      continue;
    }

    let dx = pos.x - parentPos.x;
    let dy = pos.y - parentPos.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = parentRestDistance(node, parent);

    if (dist >= minDist) {
      continue;
    }

    if (dist < 0.0001) {
      const direction = deterministicDirection(node.parentId, node.id);
      dx = direction.x;
      dy = direction.y;
      dist = 1;
    }
    const radialUnitX = dx / dist;
    const radialUnitY = dy / dist;
    pos.x = parentPos.x + radialUnitX * minDist;
    pos.y = parentPos.y + radialUnitY * minDist;

    const inwardVel = pos.vx * -radialUnitX + pos.vy * -radialUnitY;
    if (inwardVel > 0) {
      pos.vx += radialUnitX * inwardVel;
      pos.vy += radialUnitY * inwardVel;
    }
  }

  const freezeCountdowns = new Map<string, number>();
  for (const node of nodes) {
    if (node.id === '__origin__') {
      continue;
    }

    const freezeCountdown = Math.max(0, node.freezeCountdown - (node.freezeCountdown > 0 ? 1 : 0));
    freezeCountdowns.set(node.id, freezeCountdown);
  }

  for (const node of nodes) {
    if (node.parentId === null || node.parentId === '__origin__') {
      continue;
    }
    if (node.frozen) {
      continue;
    }

    const pos = work.get(node.id);
    if (pos === undefined) {
      continue;
    }

    pos.vx += (Math.random() - 0.5) * PHYSICS_CONSTANTS.JITTER_STRENGTH;
    pos.vy += (Math.random() - 0.5) * PHYSICS_CONSTANTS.JITTER_STRENGTH;
  }

  return nodes.map((node) => {
    if (node.parentId === null) {
      return { ...node, x: 0, y: 0, vx: 0, vy: 0, freezeCountdown: 0 };
    }

    const pos = work.get(node.id);
    if (pos === undefined) {
      return node;
    }

    const freezeCountdown = freezeCountdowns.get(node.id) ?? node.freezeCountdown;
    return {
      ...node,
      x: pos.x,
      y: pos.y,
      vx: pos.vx,
      vy: pos.vy,
      freezeCountdown,
    };
  });
}

export function initPhysicsNode(
  node: IdeaLayoutNode & { freezeCountdown?: number; descendantCount?: number },
  entryCount: number,
  rootIdentityId: string,
): PhysicsIdeaNode {
  return {
    ...node,
    vx: (Math.random() - 0.5) * PHYSICS_CONSTANTS.SPAWN_JITTER,
    vy: (Math.random() - 0.5) * PHYSICS_CONSTANTS.SPAWN_JITTER,
    frozen: false,
    freezeCountdown: node.freezeCountdown ?? 0,
    entryCount,
    descendantCount: node.descendantCount ?? 0,
    rootIdentityId,
  };
}
