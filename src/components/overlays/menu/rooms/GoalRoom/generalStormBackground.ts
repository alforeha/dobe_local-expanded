import { withAlpha } from './brainstormDraw';

function hexagonPoints(cx: number, cy: number, radius: number, rotationOffset: number = 0) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 6 - Math.PI / 2 + rotationOffset;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });
}

export function drawGeneralStormBackground(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
  alpha: number,
  time: number,
): void {
const voidRadius = Math.hypot(cx, cy) * 0.8;
  const voidGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, voidRadius);
  voidGradient.addColorStop(0, 'rgba(0,0,0,1)');
  voidGradient.addColorStop(0.7, 'rgba(0,0,0,0.95)');
  voidGradient.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(cx, cy, voidRadius, 0, Math.PI * 2);
  ctx.fillStyle = voidGradient;
  ctx.fill();
  ctx.restore();

  const glowRadius = 60;
  const glowGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
  glowGradient.addColorStop(0, withAlpha(color, alpha * 0.8));
  glowGradient.addColorStop(0.5, withAlpha(color, alpha * 0.3));
  glowGradient.addColorStop(1, withAlpha(color, 0));
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
  ctx.fillStyle = glowGradient;
  ctx.fill();
  ctx.restore();

  const ringRadius = voidRadius + Math.sin(time * 1.8) * 3;
  const ringAlpha = alpha * (0.4 + Math.sin(time * 2.3) * 0.25);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
  ctx.strokeStyle = withAlpha(color, ringAlpha);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

export function drawGeneralVoidBackground(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  alpha: number,
): void {
  const dpr = ctx.canvas.width / canvasWidth;
  const cameraScale = ctx.getTransform().a / dpr;
  const viewportWorldHalfWidth = canvasWidth / 2 / cameraScale;
  const viewportWorldHalfHeight = canvasHeight / 2 / cameraScale;
  const maxWorldReach = Math.sqrt(
    viewportWorldHalfWidth * viewportWorldHalfWidth +
    viewportWorldHalfHeight * viewportWorldHalfHeight,
  );
  const rotationOffset = Math.PI / 6;

  ctx.save();
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.08})`;
  ctx.lineWidth = 0.5 / cameraScale;

  let worldR = 80;
  while (worldR <= maxWorldReach + 80) {
    const hexPoints = hexagonPoints(0, 0, worldR, rotationOffset);

    ctx.beginPath();
    hexPoints.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.closePath();
    ctx.stroke();

    worldR += 80;
  }

  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.06})`;
  ctx.lineWidth = 0.5 / cameraScale;

  for (let spokeIndex = 0; spokeIndex < 6; spokeIndex += 1) {
    const angle = (Math.PI / 3) * spokeIndex;
    const endX = Math.cos(angle) * (maxWorldReach + 80);
    const endY = Math.sin(angle) * (maxWorldReach + 80);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  ctx.restore();
}
