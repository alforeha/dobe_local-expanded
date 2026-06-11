import { useEffect, useMemo, useRef } from 'react';
import type { BrainstormIdea, Storm } from '../../../../../types/brainstorm';

/**
 * ProjectTreeCanvas — Track C (Sprint 6) Canvas 2D visualization for
 * Project-type storms. No new rendering tech: plain 2D context, static
 * redraw on data/size change (no physics, no RAF loop).
 *
 * Views:
 * - 'stage'   — one Stage's subtree as a treemap-weighted pie (sunburst):
 *               angular span per node proportional to its subtree weight.
 * - 'mandala' — compiled view, all Stages composited on one canvas:
 *               Statement bullseye → one thin ring per Principle → Stage
 *               rings building outward (Stage 1 closest to the Principles,
 *               latest Stage outermost). Stripe colors come from the same
 *               treemap block data as the stage pies.
 * - 'profile' — side profile of the mandala: tiered pyramid, Statement at
 *               apex, each tier wider than the last, color striping within
 *               stage tiers from treemap block data.
 *
 * Colors are sourced from CSS tokens (--accent, --text, --border, ...) and
 * from storm/idea data (category color, customProperties typeColor). The
 * literals below are only fallbacks mirroring the token defaults in
 * index.css for non-browser contexts.
 */

export type ProjectTreeView = 'stage' | 'mandala' | 'profile';

interface ProjectTreeCanvasProps {
  storm: Storm;
  view: ProjectTreeView;
  /** Required for the 'stage' view — id of the stage idea to render. */
  stageId?: string | null;
  className?: string;
}

interface WeightedNode {
  id: string;
  title: string;
  weight: number;
  color: string | null;
  children: WeightedNode[];
}

interface StageRingData {
  id: string;
  title: string;
  order: number;
  status: 'pending' | 'active' | 'complete';
  blocks: WeightedNode[];
  totalWeight: number;
}

interface ProjectShape {
  statementTitle: string | null;
  principleCount: number;
  stages: StageRingData[];
}

// ── token helpers ─────────────────────────────────────────────────────────────

function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Apply an alpha to a #rgb/#rrggbb hex or rgb()/rgba() color string. */
function withAlpha(color: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full = hex.length === 3
      ? hex.split('').map((c) => c + c).join('')
      : hex.slice(0, 6);
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return color;
    return `rgba(${r}, ${g}, ${b}, ${clamped})`;
  }
  const rgbMatch = color.match(/^rgba?\(([^)]+)\)$/);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => part.trim());
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${clamped})`;
  }
  return color;
}

interface Palette {
  accent: string;
  category: string;
  text: string;
  border: string;
  heading: string;
}

function readPalette(storm: Storm): Palette {
  return {
    accent: readToken('--accent', '#aa3bff'),
    category: storm.category?.color || readToken('--accent', '#aa3bff'),
    text: readToken('--text', '#6b6375'),
    border: readToken('--border', '#e5e4e7'),
    heading: readToken('--text-h', '#08060d'),
  };
}

/**
 * Stripe color for a treemap block: explicit idea typeColor when set,
 * otherwise alternating category/accent shades by index.
 */
function blockColor(node: WeightedNode, index: number, palette: Palette): string {
  if (node.color) return node.color;
  const base = index % 2 === 0 ? palette.category : palette.accent;
  const alpha = 0.9 - (Math.floor(index / 2) % 3) * 0.25;
  return withAlpha(base, alpha);
}

/**
 * Stage state indicator — noted but not required this sprint (polish pass
 * item): active = colored, completed = muted, pending = greyscale. This is
 * the simple token-driven version; richer treatment is flagged for polish.
 */
function stageStateAlpha(status: StageRingData['status']): number {
  if (status === 'active') return 1;
  if (status === 'complete') return 0.45;
  return 0.22;
}

// ── data shaping ──────────────────────────────────────────────────────────────

function countEntries(entries: { entries: unknown[] }[]): number {
  return entries.reduce(
    (sum, entry) => sum + 1 + countEntries(entry.entries as { entries: unknown[] }[]),
    0,
  );
}

function buildWeightedNode(
  ideaId: string,
  ideas: Record<string, BrainstormIdea>,
  visited: Set<string>,
): WeightedNode | null {
  const idea = ideas[ideaId];
  if (!idea || visited.has(ideaId)) return null;
  visited.add(ideaId);

  const children = idea.ideas
    .map((childId) => buildWeightedNode(childId, ideas, visited))
    .filter((node): node is WeightedNode => node !== null);
  const childWeight = children.reduce((sum, child) => sum + child.weight, 0);

  return {
    id: idea.id,
    title: idea.title,
    weight: 1 + countEntries(idea.entries) + childWeight,
    color: idea.customProperties?.typeColor ?? null,
    children,
  };
}

function buildProjectShape(storm: Storm): ProjectShape {
  const statement = Object.values(storm.mainIdeas).find((mainIdea) => mainIdea.type === 'statement')
    ?? Object.values(storm.mainIdeas)[0]
    ?? null;

  const allIdeas = Object.values(storm.ideas);
  const principles = allIdeas.filter((idea) => idea.type === 'principle');

  const stages = allIdeas
    .filter((idea) => idea.type === 'stage')
    .map((idea) => {
      const typeData = idea.typeData?.kind === 'stage' ? idea.typeData : null;
      const visited = new Set<string>([idea.id]);
      const blocks = idea.ideas
        .map((childId) => buildWeightedNode(childId, storm.ideas, visited))
        .filter((node): node is WeightedNode => node !== null);
      return {
        id: idea.id,
        title: idea.title,
        order: typeData?.order ?? Number.MAX_SAFE_INTEGER,
        status: typeData?.status ?? 'pending',
        blocks,
        totalWeight: Math.max(1, blocks.reduce((sum, block) => sum + block.weight, 0)),
      } satisfies StageRingData;
    })
    .sort((a, b) => a.order - b.order);

  return {
    statementTitle: statement?.title ?? null,
    principleCount: principles.length,
    stages,
  };
}

// ── drawing ───────────────────────────────────────────────────────────────────

function drawEmptyState(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: Palette,
  message: string,
) {
  ctx.fillStyle = palette.text;
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, width / 2, height / 2);
}

function drawSunburstRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  nodes: WeightedNode[],
  startAngle: number,
  endAngle: number,
  depth: number,
  ringWidth: number,
  innerRadius: number,
  maxDepth: number,
  palette: Palette,
) {
  if (depth > maxDepth || nodes.length === 0) return;

  const total = nodes.reduce((sum, node) => sum + node.weight, 0);
  if (total <= 0) return;

  const rInner = innerRadius + depth * ringWidth;
  const rOuter = rInner + ringWidth - 2;
  let angle = startAngle;

  nodes.forEach((node, index) => {
    const span = ((endAngle - startAngle) * node.weight) / total;
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, angle, angle + span);
    ctx.arc(cx, cy, rInner, angle + span, angle, true);
    ctx.closePath();
    ctx.fillStyle = withAlpha(blockColor(node, index, palette), 1 - depth * 0.15);
    ctx.fill();
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    drawSunburstRing(
      ctx, cx, cy, node.children, angle, angle + span,
      depth + 1, ringWidth, innerRadius, maxDepth, palette,
    );
    angle += span;
  });
}

function drawStagePie(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  stage: StageRingData,
  palette: Palette,
) {
  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) * 0.45;
  const maxDepth = 3;
  const coreRadius = maxRadius * 0.28;
  const ringWidth = (maxRadius - coreRadius) / (maxDepth + 1);

  // Stage core disc.
  ctx.beginPath();
  ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(palette.category, stageStateAlpha(stage.status));
  ctx.fill();
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  if (stage.blocks.length === 0) {
    drawEmptyState(ctx, width, height + coreRadius * 2 + 28, palette, 'No ideas under this stage yet');
  } else {
    drawSunburstRing(
      ctx, cx, cy, stage.blocks, -Math.PI / 2, Math.PI * 1.5,
      0, ringWidth, coreRadius + 2, maxDepth, palette,
    );
  }

  // Stage title in the core.
  ctx.fillStyle = palette.heading;
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = stage.title.length > 14 ? `${stage.title.slice(0, 13)}…` : stage.title;
  ctx.fillText(label, cx, cy);
}

function drawMandala(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  shape: ProjectShape,
  palette: Palette,
) {
  const cx = width / 2;
  const cy = height / 2;

  // Ring geometry in abstract units, then fit-scaled to the canvas.
  const bullseye = 1;
  const principleStep = 0.35;
  const stageGap = 0.5; // first Stage ring begins +X radius from last Principle ring
  const stageStep = 0.7; // each subsequent Stage adds +X radius outward
  const lastPrincipleRadius = bullseye + shape.principleCount * principleStep;
  const outermost = shape.stages.length > 0
    ? lastPrincipleRadius + stageGap + shape.stages.length * stageStep
    : lastPrincipleRadius + stageGap;
  const unit = (Math.min(width, height) * 0.46) / outermost;

  // Center bullseye — Statement.
  ctx.beginPath();
  ctx.arc(cx, cy, bullseye * unit, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(palette.accent, 0.9);
  ctx.fill();
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  // One thin ring per Principle entry.
  for (let i = 0; i < shape.principleCount; i++) {
    const radius = (bullseye + (i + 1) * principleStep) * unit;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(palette.accent, 0.5);
    ctx.lineWidth = Math.max(1.5, principleStep * unit * 0.3);
    ctx.stroke();
  }

  // Stage rings — Stage 1 closest to the Principles, latest Stage outermost.
  shape.stages.forEach((stage, stageIndex) => {
    const rInner = (lastPrincipleRadius + stageGap + stageIndex * stageStep) * unit;
    const rOuter = rInner + stageStep * unit - 3;
    const alpha = stageStateAlpha(stage.status);

    if (stage.blocks.length === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
      ctx.arc(cx, cy, rInner, Math.PI * 2, 0, true);
      ctx.closePath();
      ctx.fillStyle = withAlpha(palette.category, alpha * 0.5);
      ctx.fill();
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      // Color striping from the stage's treemap block data.
      let angle = -Math.PI / 2;
      stage.blocks.forEach((block, blockIndex) => {
        const span = (Math.PI * 2 * block.weight) / stage.totalWeight;
        ctx.beginPath();
        ctx.arc(cx, cy, rOuter, angle, angle + span);
        ctx.arc(cx, cy, rInner, angle + span, angle, true);
        ctx.closePath();
        ctx.fillStyle = withAlpha(blockColor(block, blockIndex, palette), alpha);
        ctx.fill();
        ctx.strokeStyle = palette.border;
        ctx.lineWidth = 1;
        ctx.stroke();
        angle += span;
      });
    }

    // Stage order marker at the top of its ring.
    ctx.fillStyle = palette.heading;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(stageIndex + 1), cx, cy - (rInner + rOuter) / 2);
  });

  // Statement marker in the bullseye.
  if (shape.statementTitle) {
    ctx.fillStyle = palette.heading;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = shape.statementTitle.length > 10
      ? `${shape.statementTitle.slice(0, 9)}…`
      : shape.statementTitle;
    ctx.fillText(label, cx, cy);
  }
}

function drawProfile(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  shape: ProjectShape,
  palette: Palette,
) {
  // Side profile of the mandala: tiered pyramid — Statement at apex, each
  // tier wider than the last, stage tiers striped from treemap block data.
  const tierCount = 1 + (shape.principleCount > 0 ? 1 : 0) + shape.stages.length;
  const usableHeight = height * 0.8;
  const topY = height * 0.1;
  const tierHeight = usableHeight / Math.max(2, tierCount);
  const cx = width / 2;
  const maxHalfWidth = width * 0.45;
  const widthStep = maxHalfWidth / Math.max(1, tierCount);

  let y = topY;
  let halfWidth = widthStep * 0.6;

  // Apex — Statement.
  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.lineTo(cx + halfWidth, y + tierHeight);
  ctx.lineTo(cx - halfWidth, y + tierHeight);
  ctx.closePath();
  ctx.fillStyle = withAlpha(palette.accent, 0.9);
  ctx.fill();
  ctx.strokeStyle = palette.border;
  ctx.stroke();
  y += tierHeight;

  // Principle tier (single banded tier, one stripe per principle).
  if (shape.principleCount > 0) {
    const nextHalfWidth = halfWidth + widthStep;
    const stripeWidth = (halfWidth + nextHalfWidth) / shape.principleCount;
    for (let i = 0; i < shape.principleCount; i++) {
      const x0 = cx - (halfWidth + nextHalfWidth) / 2 + i * stripeWidth;
      ctx.beginPath();
      ctx.rect(x0, y, stripeWidth - 1, tierHeight - 2);
      ctx.fillStyle = withAlpha(palette.accent, 0.5 - (i % 2) * 0.15);
      ctx.fill();
    }
    halfWidth = nextHalfWidth;
    y += tierHeight;
  }

  // Stage tiers — widening downward, striped by block weights.
  shape.stages.forEach((stage) => {
    const nextHalfWidth = halfWidth + widthStep;
    const tierWidth = (halfWidth + nextHalfWidth);
    const x0 = cx - tierWidth / 2;
    const alpha = stageStateAlpha(stage.status);

    if (stage.blocks.length === 0) {
      ctx.beginPath();
      ctx.rect(x0, y, tierWidth, tierHeight - 2);
      ctx.fillStyle = withAlpha(palette.category, alpha * 0.5);
      ctx.fill();
      ctx.strokeStyle = palette.border;
      ctx.stroke();
    } else {
      let x = x0;
      stage.blocks.forEach((block, blockIndex) => {
        const stripe = (tierWidth * block.weight) / stage.totalWeight;
        ctx.beginPath();
        ctx.rect(x, y, Math.max(1, stripe - 1), tierHeight - 2);
        ctx.fillStyle = withAlpha(blockColor(block, blockIndex, palette), alpha);
        ctx.fill();
        x += stripe;
      });
      ctx.strokeStyle = palette.border;
      ctx.strokeRect(x0, y, tierWidth, tierHeight - 2);
    }

    halfWidth = nextHalfWidth;
    y += tierHeight;
  });
}

// ── component ─────────────────────────────────────────────────────────────────

export function ProjectTreeCanvas({ storm, view, stageId = null, className }: ProjectTreeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shape = useMemo(() => buildProjectShape(storm), [storm]);
  const stage = useMemo(
    () => (stageId ? shape.stages.find((candidate) => candidate.id === stageId) ?? null : null),
    [shape, stageId],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    function draw() {
      if (!canvas || !parent || !ctx) return;
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const palette = readPalette(storm);

      if (view === 'stage') {
        if (!stage) {
          drawEmptyState(ctx, rect.width, rect.height, palette, 'Select a stage to view its pie');
          return;
        }
        drawStagePie(ctx, rect.width, rect.height, stage, palette);
        return;
      }

      if (shape.stages.length === 0 && shape.principleCount === 0 && !shape.statementTitle) {
        drawEmptyState(ctx, rect.width, rect.height, palette, 'Nothing to composite yet');
        return;
      }

      if (view === 'mandala') {
        drawMandala(ctx, rect.width, rect.height, shape, palette);
      } else {
        drawProfile(ctx, rect.width, rect.height, shape, palette);
      }
    }

    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    draw();
    return () => observer.disconnect();
  }, [storm, shape, stage, view]);

  return (
    <div className={`relative h-full w-full ${className ?? ''}`}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
