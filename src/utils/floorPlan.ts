import type { FloorPlanSegment } from '../types/resource';

export interface FloorPlanPoint {
	x: number;
	y: number;
}

export function segmentsToPoints(
  origin: { x: number; y: number },
  segments: FloorPlanSegment[],
): FloorPlanPoint[] {
  const points = [{ x: origin.x, y: origin.y }];
  let currentX = origin.x;
  let currentY = origin.y;

  for (const segment of segments) {
    const distance = Number.isFinite(segment.distance) ? segment.distance : 0;
    switch (segment.direction) {
      case 'up':
        currentY -= distance;
        break;
      case 'down':
        currentY += distance;
        break;
      case 'left':
        currentX -= distance;
        break;
      case 'right':
        currentX += distance;
        break;
    }
    points.push({ x: currentX, y: currentY });
  }

  return points;
}

export function getSegmentEndpoint(
  origin: { x: number; y: number },
  segments: FloorPlanSegment[],
): FloorPlanPoint {
  const points = segmentsToPoints(origin, segments);
  return points[points.length - 1] ?? { x: origin.x, y: origin.y };
}

export function isClosedFloorPlan(
  origin: { x: number; y: number },
  segments: FloorPlanSegment[],
): boolean {
  const end = getSegmentEndpoint(origin, segments);
  return end.x === origin.x && end.y === origin.y;
}

export function closeFloorPlanSegments(
  origin: { x: number; y: number },
  segments: FloorPlanSegment[],
): FloorPlanSegment[] {
  const end = getSegmentEndpoint(origin, segments);
  const closed = [...segments];

  if (end.x !== origin.x) {
    closed.push({
      direction: end.x > origin.x ? 'left' : 'right',
      distance: Math.abs(origin.x - end.x),
    });
  }

  if (end.y !== origin.y) {
    closed.push({
      direction: end.y > origin.y ? 'up' : 'down',
      distance: Math.abs(origin.y - end.y),
    });
  }

  return closed;
}

export function getPointsBounds(points: FloorPlanPoint[]) {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
