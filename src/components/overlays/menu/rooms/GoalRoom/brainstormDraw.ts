import { ICON_MAP, isImageIcon } from '../../../../../constants/iconMap';
import type { BrainstormEntry, BrainstormIdea, MainIdea } from '../../../../../types/brainstorm';
import { flattenIdeaTree, type IdeaLayoutNode, type MainIdeaLayout, type PointerLine } from './brainstormLayout';
import { cr } from './brainstormPhysics';

const MAIN_IDEA_STATE_COLORS = {
  open: '#4ade80',
  'in-progress': '#60a5fa',
  resolved: '#2dd4bf',
  parked: '#9ca3af',
  others: '#ffffff',
} as const;

const ideaIconImageCache = new Map<string, HTMLImageElement>();

function hexagonPoints(cx: number, cy: number, radius: number, rotationOffset: number = 0) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 6 - Math.PI / 2 + rotationOffset;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });
}

const STORM_STATE_COLORS = {
  active: 'rgba(16, 185, 129, 0.85)',
  incubating: 'rgba(245, 158, 11, 0.85)',
  archived: 'rgba(100, 116, 139, 0.85)',
  resolved: 'rgba(99, 102, 241, 0.85)',
  folding: 'rgba(34, 211, 238, 0.85)',
} as const;

function drawCircle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, fillStyle: string) {
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function getMainIdeaById(mainIdeas: Record<string, MainIdea> | MainIdea[], id: string): MainIdea | null {
  if (Array.isArray(mainIdeas)) {
    return mainIdeas.find((mainIdea) => mainIdea.id === id) ?? null;
  }

  return mainIdeas[id] ?? null;
}

function drawMainIdeaIcon(
  ctx: CanvasRenderingContext2D,
  iconValue: string | undefined,
  x: number,
  y: number,
  radius: number,
) {
  if (!iconValue) {
    return;
  }

  if (isImageIcon(iconValue)) {
    let image = ideaIconImageCache.get(iconValue);

    if (!image) {
      image = new Image();
      image.src = iconValue;
      ideaIconImageCache.set(iconValue, image);
    }

    if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
      return;
    }

    const maxSize = radius * 1.4;
    const scale = Math.min(maxSize / image.naturalWidth, maxSize / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.drawImage(image, x - width / 2, y - height / 2, width, height);
    return;
  }

  ctx.fillStyle = '#0f172a';
  ctx.font = `${Math.max(16, Math.round(radius * 1.1))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(iconValue, x, y + 1);
}

export function withAlpha(color: string, alpha: number) {
  const normalized = color.trim();
  const hexMatch = normalized.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex.split('').map((char) => char + char).join('');
    }

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const [r = '255', g = '255', b = '255'] = rgbMatch[1].split(',').map((part) => part.trim());
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return normalized;
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
  orbColor: string,
) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius <= 0) {
    return;
  }

  const floatY = Math.sin(timestamp / 1200 + index * 0.9) * 3;
  const orbX = x;
  const orbY = y + floatY;
  const glowRadius = radius * 1.8;
  const coreColor = orbColor || STORM_STATE_COLORS.active;

  ctx.save();
  ctx.globalAlpha = alpha;

  const gradient = ctx.createRadialGradient(orbX, orbY, 0, orbX, orbY, glowRadius);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
  gradient.addColorStop(0.15, coreColor);
  gradient.addColorStop(0.45, withAlpha(coreColor, 0.3));
  gradient.addColorStop(1, withAlpha(coreColor, 0));

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(orbX, orbY, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.beginPath();
  ctx.arc(orbX, orbY, radius * 0.4, 0, Math.PI * 2);
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
  orbX: number,
  orbY: number,
  orbAngle: number,
  color: string,
  alpha: number,
  canvasWidth: number,
  canvasHeight: number,
  profile: 'alley' | 'selected' = 'alley',
) {
  const outerRadius = Math.hypot(canvasWidth, canvasHeight);
  const wideSpan = Math.PI / 1.2;
  const wideStartAngle = orbAngle - wideSpan / 2;
  const wideEndAngle = orbAngle + wideSpan / 2;
  const wideGradient = ctx.createRadialGradient(
    orbX,
    orbY,
    0,
    orbX,
    orbY,
    outerRadius,
  );
  if (profile === 'selected') {
    wideGradient.addColorStop(0, withAlpha(color, alpha * 0.3));
    wideGradient.addColorStop(0.4, withAlpha(color, alpha * 0.15));
  } else {
    wideGradient.addColorStop(0, withAlpha(color, alpha * 0.15));
    wideGradient.addColorStop(0.4, withAlpha(color, alpha * 0.08));
  }
  wideGradient.addColorStop(1, withAlpha(color, 0));

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(orbX, orbY);
  ctx.arc(orbX, orbY, outerRadius, wideStartAngle, wideEndAngle);
  ctx.closePath();
  ctx.fillStyle = wideGradient;
  ctx.fill();
  ctx.restore();


  const gradient = ctx.createRadialGradient(
    orbX,
    orbY,
    0,
    orbX,
    orbY,
    outerRadius,
  );
  if (profile === 'selected') {
    gradient.addColorStop(0, withAlpha(color, alpha * 0.7));
    gradient.addColorStop(0.1, withAlpha(color, alpha * 0.8));
  } else {
    gradient.addColorStop(0, withAlpha(color, alpha * 0.6));
  }
  gradient.addColorStop(0.5, withAlpha(color, alpha * 0.4));
  gradient.addColorStop(1, withAlpha(color, 0));

const span = Math.PI / 3;
const startAngle = orbAngle - span ;
const endAngle = orbAngle + span ;
const innerRadius = 33;  // cuts off the pointy tip — increase to widen the start

ctx.save();
ctx.globalAlpha = 1;
ctx.beginPath();
// outer arc
ctx.arc(orbX, orbY, outerRadius, startAngle, endAngle);
// inner arc drawn backwards to close the annular slice
ctx.arc(orbX, orbY, innerRadius, endAngle, startAngle, true);
ctx.closePath();
ctx.fillStyle = gradient;
ctx.fill();
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
  mainIdeas: Record<string, MainIdea> | MainIdea[],
  customColors?: { stateColor?: string; typeColor?: string },
) {
  mainIdeaLayouts.forEach((layout, index) => {
    const floatY = Math.sin(timestamp / 1200 + index * 1.1) * 3;
    const x = layout.x;
    const y = layout.y + floatY;
    const mainIdea = getMainIdeaById(mainIdeas, layout.id);
    const isSelected = selectedMainIdeaId === layout.id;
    void hoveredMainIdeaId;
    const isDimmed = selectedMainIdeaId !== null && !isSelected;
    const shouldDim = selectedIdeaId !== null && highlightedIds.size > 0;
    const alpha = shouldDim ? 0.25 : isDimmed ? 0.35 : 1;
    const customStateColor =
      mainIdea?.state === 'others'
        ? (customColors?.stateColor ?? mainIdea?.customProperties?.stateColor)
        : undefined;
    const baseColor = customStateColor
      ?? MAIN_IDEA_STATE_COLORS[mainIdea?.state ?? 'others'];
    const glowAlpha = isSelected ? 0.6 : 0.35;
    const glowRadius = layout.radius * 2;
    const iconValue = mainIdea?.type
      ? ICON_MAP[`idea-${mainIdea.type}`] ?? ICON_MAP[mainIdea.type]
      : undefined;
    const nodeRadius = layout.radius;

    ctx.save();
    ctx.globalAlpha = alpha;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
    gradient.addColorStop(0, withAlpha(baseColor, glowAlpha));
    gradient.addColorStop(1, withAlpha(baseColor, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    drawCircle(ctx, x, y, nodeRadius, baseColor);

    if (isSelected) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, layout.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (mainIdea?.type === 'others') {
      ctx.fillStyle = customColors?.typeColor ?? mainIdea?.customProperties?.typeColor ?? '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, nodeRadius * 0.35, 0, Math.PI * 2);
      ctx.fill();
    } else {
      drawMainIdeaIcon(ctx, iconValue, x, y, nodeRadius);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    drawEntryOrbs(
      ctx,
      x,
      y,
      layout.radius,
      mainIdea?.entries ?? [],
      alpha,
      0,
    );
  });
}

function drawEntryOrbs(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  nodeRadius: number,
  entries: BrainstormEntry[],
  alpha: number,
  entryRotationAngle: number,
): void {
  const entryOrbRadius = 8;
  const subEntryRadius = 8;
  const slotCount = 6;
  const totalEntries = entries.length;

  if (totalEntries === 0) {
    return;
  }

const drawOrb = (entry: BrainstormEntry, orbX: number, orbY: number, entryAlpha: number) => {
  const entryStateColor = getEntryOrbColor(entry);
  const entryIconValue = ICON_MAP[`entry-${entry.type}`];

  ctx.save();
  ctx.globalAlpha = alpha * entryAlpha;

  // Main orb
  ctx.fillStyle = withAlpha(entryStateColor, 0.85);
  ctx.beginPath();
  ctx.arc(orbX, orbY, entryOrbRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(orbX, orbY, entryOrbRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Main orb icon
  if (entry.type === 'others') {
    ctx.fillStyle = entry.customProperties?.typeColor ?? '#ffffff';
    ctx.beginPath();
    ctx.arc(orbX, orbY, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (entryIconValue && !isImageIcon(entryIconValue)) {
    ctx.fillStyle = '#0f172a';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(entryIconValue, orbX, orbY + 0.5);
  }

  // Sub-entry orbs
  entry.entries.slice(0, 3).forEach((subEntry, subEntryIndex, subEntries) => {
    const subAngle = (subEntryIndex / Math.max(1, subEntries.length)) * Math.PI * 2 - Math.PI / 2;
    const subOrbX = orbX + Math.cos(subAngle) * (entryOrbRadius + subEntryRadius);
    const subOrbY = orbY + Math.sin(subAngle) * (entryOrbRadius + subEntryRadius);

    // Sub-entry orb fill
    ctx.fillStyle = withAlpha(getEntryOrbColor(subEntry), 0.85);
    ctx.beginPath();
    ctx.arc(subOrbX, subOrbY, subEntryRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(subOrbX, subOrbY, subEntryRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Sub-entry icon
    if (subEntry.type === 'others') {
      ctx.fillStyle = subEntry.customProperties?.typeColor ?? '#ffffff';
      ctx.beginPath();
      ctx.arc(subOrbX, subOrbY, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const subIcon = ICON_MAP[`entry-${subEntry.type}`];
      if (subIcon && !isImageIcon(subIcon)) {
        ctx.fillStyle = '#0f172a';
        ctx.font = '7px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(subIcon, subOrbX, subOrbY + 0.5);
      }
    }

    // Sub-sub-entry orbs
    if (subEntry.entries.length > 0) {
      subEntry.entries.slice(0, 3).forEach((subSubEntry, subSubIndex, subSubEntries) => {
        const subSubAngle = (subSubIndex / Math.max(1, subSubEntries.length)) * Math.PI * 2 - Math.PI / 2;
        const subSubOrbX = subOrbX + Math.cos(subSubAngle) * subEntryRadius * 2;
        const subSubOrbY = subOrbY + Math.sin(subSubAngle) * subEntryRadius * 2;

        // Sub-sub orb fill
        ctx.fillStyle = withAlpha(getEntryOrbColor(subSubEntry), 0.85);
        ctx.beginPath();
        ctx.arc(subSubOrbX, subSubOrbY, subEntryRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(subSubOrbX, subSubOrbY, subEntryRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Sub-sub icon
        if (subSubEntry.type === 'others') {
          ctx.fillStyle = subSubEntry.customProperties?.typeColor ?? '#ffffff';
          ctx.beginPath();
          ctx.arc(subSubOrbX, subSubOrbY, 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const subSubIcon = ICON_MAP[`entry-${subSubEntry.type}`];
          if (subSubIcon && !isImageIcon(subSubIcon)) {
            ctx.fillStyle = '#0f172a';
            ctx.font = '6px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(subSubIcon, subSubOrbX, subSubOrbY + 0.5);
          }
        }
      });
    }
  });

  ctx.restore();
};

  if (totalEntries <= 6) {
    entries.forEach((entry, entryIndex) => {
      const angle = (entryIndex / Math.max(1, totalEntries)) * Math.PI * 2;
      const orbX = centerX + Math.cos(angle) * nodeRadius;
      const orbY = centerY + Math.sin(angle) * nodeRadius;

      drawOrb(entry, orbX, orbY, 0.85);
    });
    return;
  }

  const scrollFloat = (entryRotationAngle / (Math.PI * 2)) * totalEntries;
  const normalizedScrollFloat = ((scrollFloat % totalEntries) + totalEntries) % totalEntries;
  const scrollOffset = Math.floor(normalizedScrollFloat);
  const fraction = normalizedScrollFloat % 1;

  for (let slotIndex = 0; slotIndex <= slotCount; slotIndex += 1) {
    const entryIndex = (scrollOffset + slotIndex) % totalEntries;
    const entry = entries[entryIndex];
    if (!entry) {
      continue;
    }

    const angle = (slotIndex / slotCount) * Math.PI * 2;
    let entryAlpha = 0.85;
    if (slotIndex === 0) entryAlpha = 0.85 * (1 - fraction);
    if (slotIndex === slotCount) entryAlpha = 0.85 * fraction;
    const orbX = centerX + Math.cos(angle) * nodeRadius;
    const orbY = centerY + Math.sin(angle) * nodeRadius;

    drawOrb(entry, orbX, orbY, entryAlpha);
  }
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
  entryRotationAngle: number = 0,
) {
  const flatIdeaLayouts = flattenIdeaTree(ideaLayouts);
  const layoutById = new Map(flatIdeaLayouts.map((layout) => [layout.id, layout]));
  const hasHighlights = highlightedIds.size > 0;

  ctx.save();
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2.7;

  flatIdeaLayouts.forEach((layout) => {
    const parentLayout = layout.parentId ? layoutById.get(layout.parentId) : null;
    ctx.globalAlpha = hasHighlights
      ? (highlightedIds.has(layout.id) ? 1 : 0.15)
      : 0.6;
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
    const nodeRadius = 28;
    const opacity = hasHighlights && !isHighlighted ? 0.25 : depthFade;
    const customStateColor =
      idea?.state === 'others'
        ? idea.customProperties?.stateColor
        : undefined;
    const baseColor = customStateColor
      ?? MAIN_IDEA_STATE_COLORS[idea?.state ?? 'others'];
    const glowAlpha = isSelected ? 0.6 : 0.35;
    const glowRadius = nodeRadius * 2;
    const iconValue = idea?.type
      ? ICON_MAP[`idea-${idea.type}`] ?? ICON_MAP[idea.type]
      : undefined;

    ctx.save();
    ctx.globalAlpha = opacity;

    if (!(hasHighlights && !isHighlighted)) {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
      gradient.addColorStop(0, withAlpha(baseColor, glowAlpha));
      gradient.addColorStop(1, withAlpha(baseColor, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    void isHovered;
    void isHighlighted;
    drawCircle(ctx, x, y, nodeRadius, withAlpha(baseColor, 0.85));

    if (isSelected) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, nodeRadius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (idea?.type === 'others') {
      ctx.fillStyle = idea.customProperties?.typeColor ?? '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, nodeRadius * 0.35, 0, Math.PI * 2);
      ctx.fill();
    } else {
      drawMainIdeaIcon(ctx, iconValue, x, y, nodeRadius);
    }
    ctx.restore();

    drawEntryOrbs(
      ctx,
      x,
      y,
      nodeRadius,
      idea?.entries ?? [],
      opacity,
      entryRotationAngle,
    );
  });
}

function getEntryOrbColor(entry: BrainstormEntry): string {
  switch (entry.state) {
    case 'outcome':
      return '#4ade80';
    case 'obstacle':
      return '#f87171';
    case 'question':
      return '#60a5fa';
    case 'solved':
      return '#2dd4bf';
    case 'others':
    default:
      return entry.customProperties?.stateColor ?? '#ffffff';
  }
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

export function drawOriginSpokes(
  ctx: CanvasRenderingContext2D,
  mainIdeaNodes: { x: number; y: number; radius: number }[],
): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1;
  for (const node of mainIdeaNodes) {
    const dist = Math.sqrt(node.x * node.x + node.y * node.y);
    if (dist < 0.001) {
      continue;
    }
    const endX = node.x - (node.x / dist) * node.radius;
    const endY = node.y - (node.y / dist) * node.radius;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawPhysicsDebugRing(
  ctx: CanvasRenderingContext2D,
  node: { x: number; y: number; entryCount: number },
  scale: number,
): void {
  const safeRadius = cr(node);
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 1 / scale;
  ctx.setLineDash([6 / scale, 4 / scale]);
  ctx.beginPath();
  ctx.arc(node.x, node.y, safeRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
