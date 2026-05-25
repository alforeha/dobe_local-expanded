import { withAlpha } from './brainstormDraw';

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
