import { useEffect, useRef } from 'react';

const ORB_RADIUS = 48;
const ORB_PERIOD_MS = 3000;

function drawOrb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  coreColor: string,
  label: string,
) {
  const glowRadius = radius * 2;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
  gradient.addColorStop(0, coreColor);
  gradient.addColorStop(0.45, coreColor.replace('0.85', '0.38'));
  gradient.addColorStop(1, coreColor.replace('0.85', '0'));

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 72);
}

export function GoalCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    if (!canvas) return;

    const parent = canvas.parentElement!;
    if (!parent) return;

    const ctx = canvas.getContext('2d')!;
    if (!ctx) return;

    function resizeCanvas() {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawFrame(timestamp: number) {
      if (startedAtRef.current === null) startedAtRef.current = timestamp;
      const elapsed = timestamp - startedAtRef.current;
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      const phase = (elapsed / ORB_PERIOD_MS) * Math.PI * 2;
      const userScale = 1 + Math.sin(phase) * 0.08;
      const systemScale = 1 + Math.sin(phase + Math.PI) * 0.08;

      ctx.clearRect(0, 0, width, height);
      drawOrb(
        ctx,
        width * 0.35,
        height * 0.45,
        ORB_RADIUS * userScale,
        'rgba(99, 102, 241, 0.85)',
        'Your Aspirations',
      );
      drawOrb(
        ctx,
        width * 0.65,
        height * 0.55,
        ORB_RADIUS * systemScale,
        'rgba(245, 158, 11, 0.85)',
        'Adventures',
      );

      frameRef.current = requestAnimationFrame(drawFrame);
    }

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(parent);
    resizeCanvas();
    frameRef.current = requestAnimationFrame(drawFrame);

    return () => {
      observer.disconnect();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: 'none' }}
    />
  );
}
