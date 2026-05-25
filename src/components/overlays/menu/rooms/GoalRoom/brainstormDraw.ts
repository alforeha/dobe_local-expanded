import type { BrainstormIdea, MainIdea, StormState } from '../../../../../types/brainstorm';
import { flattenIdeaTree, type IdeaLayoutNode, type MainIdeaLayout, type PointerLine } from './brainstormLayout';

function hexagonPoints(cx: number, cy: number, radius: number, rotationOffset: number = 0) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 6 - Math.PI / 2 + rotationOffset;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });
}

export const STORM_STATE_COLORS: Record<StormState, string> = {
  active: 'rgba(16, 185, 129, 0.85)',
  incubating: 'rgba(245, 158, 11, 0.85)',
  archived: 'rgba(100, 116, 139, 0.85)',
  resolved: 'rgba(99, 102, 241, 0.85)',
};

function drawCircle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, fillStyle: string) {
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawGlowOrb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  glowScale: number,
  coreColor: string,
) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius <= 0) {
    return;
  }

  const glowRadius = radius * glowScale;
  if (!Number.isFinite(glowRadius) || glowRadius <= 0) {
    return;
  }

  const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
  gradient.addColorStop(0, coreColor);
  gradient.addColorStop(0.45, coreColor.replace('0.85', '0.38'));
  gradient.addColorStop(1, coreColor.replace('0.85', '0'));

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = coreColor;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

export function drawBrainstormNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  label: string,
  scale: number,
  hovered: boolean,
  focused: boolean,
  alpha = 1,
) {
  void hovered;

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius <= 0) {
    return;
  }

  if (focused) {
    const pulse = Math.max(0.9, scale);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = 40 * pulse;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const glowRadius = radius * scale * 2;
  if (!Number.isFinite(glowRadius) || glowRadius <= 0) {
    return;
  }

  const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
  gradient.addColorStop(0, 'rgba(16, 185, 129, 0.85)');
  gradient.addColorStop(0.45, 'rgba(16, 185, 129, 0.38)');
  gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  if (label) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 72);
  }
  ctx.restore();
}

export function drawBrainstormCenterGlow(
  ctx: CanvasRenderingContext2D,
  screenCx: number,
  screenCy: number,
  canvasWidth: number,
  canvasHeight: number,
  alpha: number,
) {
  const glowRadius = Math.max(canvasWidth, canvasHeight) * 0.7;
  const gradient = ctx.createRadialGradient(
    screenCx,
    screenCy,
    0,
    screenCx,
    screenCy,
    glowRadius,
  );
  gradient.addColorStop(0, `rgba(16, 185, 129, ${alpha * 0.9})`);
  gradient.addColorStop(0.35, `rgba(16, 185, 129, ${alpha * 0.07})`);
  gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
}

export function drawStormOrb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  iconEmoji: string,
  label: string,
  alpha: number,
  timestamp: number,
  index: number,
  stormState: StormState,
) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius <= 0) {
    return;
  }

  const floatY = Math.sin(timestamp / 1200 + index * 0.9) * 3;
  const orbX = x;
  const orbY = y + floatY;
  const glowRadius = radius * 2;
  const coreColor = STORM_STATE_COLORS[stormState] ?? STORM_STATE_COLORS.active;

  ctx.save();
  ctx.globalAlpha = alpha;

  const gradient = ctx.createRadialGradient(orbX, orbY, 0, orbX, orbY, glowRadius);
  gradient.addColorStop(0, coreColor);
  gradient.addColorStop(0.45, coreColor.replace('0.85', '0.38'));
  gradient.addColorStop(1, coreColor.replace('0.85', '0'));

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(orbX, orbY, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  if (iconEmoji) {
    ctx.globalAlpha = alpha * 0.9;
    ctx.font = '57px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(iconEmoji, orbX, orbY - 1);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, orbX, orbY + radius + 18);
  ctx.restore();
}

export function drawStormBeam(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  alpha: number,
) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len < 1) {
    return;
  }

  const nx = dx / len;
  const ny = dy / len;
  const perpX = -ny;
  const perpY = nx;

  ctx.save();

  const sprayWidth = 125;
  const halfWidth = sprayWidth+100;
  ctx.globalAlpha = alpha * 0.18;
  const sprayGrad = ctx.createLinearGradient(fromX, fromY, toX, toY);
  sprayGrad.addColorStop(0, color);
  sprayGrad.addColorStop(1, color);
  sprayGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sprayGrad;
  ctx.beginPath();
  ctx.moveTo(fromX + perpX * halfWidth, fromY + perpY * halfWidth);
  ctx.lineTo(toX + perpX * halfWidth, toY + perpY * halfWidth);
  ctx.lineTo(toX - perpX * halfWidth, toY - perpY * halfWidth);
  ctx.lineTo(fromX - perpX * halfWidth, fromY - perpY * halfWidth);
  ctx.closePath();
  ctx.fill();

  const lineWidth = 33;
  ctx.globalAlpha = alpha * 0.7;
  const lineGrad = ctx.createLinearGradient(fromX, fromY, toX, toY);
  lineGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
  lineGrad.addColorStop(0.3, color);
  lineGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  ctx.restore();
  ctx.globalAlpha = 1;
}

export function drawGateMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  timestamp: number,
) {
  const pulseAlpha = Math.sin(timestamp / 800) * 0.1 + 0.3;

  ctx.save();
  ctx.globalAlpha = pulseAlpha;
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(124, 58, 237, 1)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawMoreStormsIndicator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  timestamp: number,
) {
  const pulse = 1 + Math.sin(timestamp / 700) * 0.08;
  const radius = 10 * pulse;

  ctx.save();
  ctx.strokeStyle = 'rgba(124, 58, 237, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  [-4, 0, 4].forEach((offsetY) => {
    ctx.beginPath();
    ctx.arc(x, y + offsetY, 1.6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

export function drawStormPageIndicator(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  pageCount: number,
  activePage: number,
) {
  if (pageCount <= 1) {
    return;
  }

  const clampedActivePage = Math.max(0, Math.min(activePage, pageCount - 1));
  const radius = 214;
  const startX = cx - ((pageCount - 1) * 8) / 2;
  const y = cy + radius;

  ctx.save();
  for (let index = 0; index < pageCount; index += 1) {
    ctx.beginPath();
    ctx.fillStyle = index === clampedActivePage
      ? 'rgba(255,255,255,0.72)'
      : 'rgba(255,255,255,0.22)';
    ctx.arc(startX + index * 8, y, index === clampedActivePage ? 2.6 : 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawBrainstormPreview(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  mainIdeas: Record<string, MainIdea>,
  ideas: Record<string, BrainstormIdea>,
  alpha: number,
  timestamp: number,
) {
  const mainIdeaList = Object.values(mainIdeas);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 0.4;

  [60, 110, 160].forEach((radius) => {
    const points = hexagonPoints(cx, cy, radius);
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.closePath();
    ctx.stroke();
  });

  hexagonPoints(cx, cy, 160).forEach((point) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  });

  if (mainIdeaList.length === 0) {
    Array.from({ length: 3 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 3 - Math.PI / 2;
      return {
        x: cx + Math.cos(angle) * 90,
        y: cy + Math.sin(angle) * 90,
      };
    }).forEach((point) => drawCircle(ctx, point.x, point.y, 6, '#374151'));

    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }

  mainIdeaList.forEach((mainIdea, index) => {
    const angle = (Math.PI * 2 * index) / mainIdeaList.length - Math.PI / 2;
    const x = cx + Math.cos(angle) * 90;
    const y = cy + Math.sin(angle) * 90;
    const pulsedRadius = 6 + Math.sin(timestamp / 1000 + index) * 2;

    drawCircle(ctx, x, y, pulsedRadius, '#7c3aed');

    mainIdea.ideas
      .map((ideaId) => ideas[ideaId])
      .filter((idea): idea is BrainstormIdea => Boolean(idea))
      .forEach((_idea, ideaIndex, childIdeas) => {
        const satelliteAngle = (Math.PI * 2 * ideaIndex) / Math.max(1, childIdeas.length) - Math.PI / 2;
        const satelliteX = x + Math.cos(satelliteAngle) * 20;
        const satelliteY = y + Math.sin(satelliteAngle) * 20;

        ctx.globalAlpha = alpha * 0.7;
        drawCircle(ctx, satelliteX, satelliteY, 3, '#a78bfa');
        ctx.globalAlpha = alpha;
      });
  });

  ctx.restore();
  ctx.globalAlpha = 1;
}

export function drawBrainstormConstellation(
  ctx: CanvasRenderingContext2D,
  mainIdeaLayouts: MainIdeaLayout[],
  selectedMainIdeaId: string | null,
  hoveredMainIdeaId: string | null,
  highlightedIds: Set<string>,
  selectedIdeaId: string | null,
  timestamp: number,
) {
  mainIdeaLayouts.forEach((layout, index) => {
    const enriched = layout as MainIdeaLayout & Partial<MainIdea>;
    const floatY = Math.sin(timestamp / 1200 + index * 1.1) * 3;
    const x = layout.x;
    const y = layout.y + floatY;
    const isSelected = selectedMainIdeaId === layout.id;
    const isHovered = hoveredMainIdeaId === layout.id;
    const isDimmed = selectedMainIdeaId !== null && !isSelected;
    const shouldDim = selectedIdeaId !== null && highlightedIds.size > 0;
    const alpha = shouldDim ? 0.25 : isDimmed ? 0.35 : 1;
    const glowScale = isSelected ? 2.8 : isHovered ? 2.4 : 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    drawGlowOrb(ctx, x, y, layout.radius, glowScale, 'rgba(16, 185, 129, 0.85)');

    if (isSelected) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, layout.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    const ideaCount = enriched.ideas?.length ?? 0;
    Array.from({ length: Math.min(4, ideaCount) }).forEach((_, satelliteIndex, satellites) => {
      const satelliteAngle = (Math.PI * 2 * satelliteIndex) / Math.max(1, satellites.length) - Math.PI / 2;
      const satelliteX = x + Math.cos(satelliteAngle) * 38;
      const satelliteY = y + Math.sin(satelliteAngle) * 38;

      ctx.globalAlpha = alpha * 0.5;
      drawCircle(ctx, satelliteX, satelliteY, 4, '#a78bfa');
      ctx.globalAlpha = alpha;
    });

    ctx.fillStyle = 'white';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(enriched.title ?? layout.id, x, y + layout.radius + 18);
    ctx.globalAlpha = 1;
    ctx.restore();
  });
}

export function drawBrainstormIdeaSpokes(
  ctx: CanvasRenderingContext2D,
  ideaLayouts: IdeaLayoutNode[],
  ideas: Record<string, BrainstormIdea>,
  highlightedIds: Set<string>,
  selectedIdeaId: string | null,
  hoveredIdeaId: string | null,
  centerX: number,
  centerY: number,
  timestamp: number,
) {
  const flatIdeaLayouts = flattenIdeaTree(ideaLayouts);
  const layoutById = new Map(flatIdeaLayouts.map((layout) => [layout.id, layout]));
  const hasHighlights = highlightedIds.size > 0;

  ctx.save();
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 0.8;

  flatIdeaLayouts.forEach((layout) => {
    const parentLayout = layout.parentId ? layoutById.get(layout.parentId) : null;
    ctx.globalAlpha = hasHighlights && !highlightedIds.has(layout.id) ? 0.08 : 0.25;
    ctx.beginPath();
    ctx.moveTo(parentLayout?.x ?? centerX, parentLayout?.y ?? centerY);
    ctx.lineTo(layout.x, layout.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
  ctx.restore();

  flatIdeaLayouts.forEach((layout, index) => {
    const idea = ideas[layout.id];
    const floatY = Math.sin(timestamp / 1200 + (index + 5) * 1.1) * 3;
    const x = layout.x;
    const y = layout.y + floatY;
    const isHighlighted = highlightedIds.has(layout.id);
    const isSelected = selectedIdeaId === layout.id;
    const isHovered = hoveredIdeaId === layout.id;
    const safeDepth = layout.depth ?? 0;
    void safeDepth;
    const depthFade = 1;
    const nodeRadius = 16;
    const opacity = hasHighlights && !isHighlighted ? 0.25 : depthFade;

    ctx.save();
    ctx.globalAlpha = opacity;

    if (hasHighlights && !isHighlighted) {
      drawCircle(ctx, x, y, nodeRadius, 'rgba(16, 185, 129, 0.85)');
    } else {
      const glowScale = isSelected ? 3 : isHighlighted ? 2.5 : isHovered ? 2.2 : 2;
      drawGlowOrb(ctx, x, y, nodeRadius, glowScale, 'rgba(16, 185, 129, 0.85)');
    }

    if (isSelected) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, nodeRadius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = 'white';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(idea?.title ?? layout.id, x, y + 34);
    ctx.restore();
  });
}

export function drawBrainstormPointerLines(
  ctx: CanvasRenderingContext2D,
  pointerLines: PointerLine[],
) {
  pointerLines.forEach((line) => {
    ctx.save();

    if (line.pointerType === 'solution') {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.7;
      ctx.setLineDash([]);
    } else if (line.pointerType === 'choice') {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.7;
      ctx.setLineDash([4, 2]);
    } else {
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([2, 2]);
    }

    ctx.beginPath();
    ctx.moveTo(line.fromX, line.fromY);
    ctx.lineTo(line.toX, line.toY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  });
}

export function drawBrainstormWebBackground(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  timestamp: number,
  baseAlpha: number,
  rotationOffset: number = 0,
) {
  const alpha = baseAlpha + Math.sin(timestamp / 2000) * 0.04;
  const rings = [80, 150, 220, 300, 390, 490, 600];

  ctx.save();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 0.4;

  rings.forEach((radius, index) => {
    const outerAlpha = Math.max(0.02, alpha * (1 - index * 0.1));
    ctx.globalAlpha = outerAlpha;
    const points = hexagonPoints(cx, cy, radius, rotationOffset);
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.closePath();
    ctx.stroke();
  });

  ctx.globalAlpha = alpha;
  hexagonPoints(cx, cy, 600, rotationOffset).forEach((point) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  });

  ctx.restore();
  ctx.globalAlpha = 1;
}

export function getBrainstormHitRadius(): number {
  return 36;
}
