import { useEffect, useRef, useState } from 'react';
import type { Aspiration } from '../../../../../types';
import { IconDisplay } from '../../../../shared/IconDisplay';

const ORB_RADIUS = 48;
const ORB_PERIOD_MS = 3000;
const PLANET_RADIUS = 22;
const PLANET_ORBIT_RADIUS = 130;
const PLANET_ORBIT_PERIOD_MS = 20000;

interface GoalCanvasProps {
  userAspirations: Aspiration[];
}

interface PlanetPosition {
  id: string;
  x: number;
  y: number;
  radius: number;
}

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

function drawPlanet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
) {
  const glowRadius = radius * 2;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
  gradient.addColorStop(0, 'rgba(139, 92, 246, 0.75)');
  gradient.addColorStop(0.45, 'rgba(139, 92, 246, 0.34)');
  gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(139, 92, 246, 0.75)';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function planetPositionsChanged(previous: PlanetPosition[], next: PlanetPosition[]) {
  if (previous.length !== next.length) return true;

  return next.some((position, index) => {
    const prev = previous[index];
    return !prev
      || prev.id !== position.id
      || Math.abs(prev.x - position.x) > 1
      || Math.abs(prev.y - position.y) > 1
      || Math.abs(prev.radius - position.radius) > 1;
  });
}

export function GoalCanvas({ userAspirations }: GoalCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const planetPositionsRef = useRef<PlanetPosition[]>([]);
  const [planetPositions, setPlanetPositions] = useState<PlanetPosition[]>([]);

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
      const ux = width * 0.35;
      const uy = height * 0.45;

      drawOrb(
        ctx,
        ux,
        uy,
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

      if (userAspirations.length > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ux, uy, PLANET_ORBIT_RADIUS, 0, Math.PI * 2);
        ctx.stroke();

        const nextPlanetPositions = userAspirations.map((aspiration, index) => {
          const baseAngle = ((2 * Math.PI) / userAspirations.length) * index;
          const angle = baseAngle + (elapsed / PLANET_ORBIT_PERIOD_MS) * Math.PI * 2;
          const x = ux + Math.cos(angle) * PLANET_ORBIT_RADIUS;
          const y = uy + Math.sin(angle) * PLANET_ORBIT_RADIUS;

          drawPlanet(ctx, x, y, PLANET_RADIUS);

          return {
            id: aspiration.id,
            x,
            y,
            radius: PLANET_RADIUS,
          };
        });

        if (planetPositionsChanged(planetPositionsRef.current, nextPlanetPositions)) {
          planetPositionsRef.current = nextPlanetPositions;
          setPlanetPositions(nextPlanetPositions);
        }
      } else if (planetPositionsRef.current.length > 0) {
        planetPositionsRef.current = [];
        setPlanetPositions([]);
      }

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
  }, [userAspirations]);

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none' }}
      />
      {userAspirations.length > 0 ? (
        <div className="absolute inset-0 pointer-events-none">
          {planetPositions.map((position) => {
            const aspiration = userAspirations.find((item) => item.id === position.id);
            if (!aspiration) return null;

            return (
              <div
                key={position.id}
                className="absolute flex flex-col items-center gap-1"
                style={{
                  left: position.x,
                  top: position.y,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <IconDisplay iconKey={aspiration.icon} size={16} className="opacity-80" />
                <span
                  className="text-white/60 text-center leading-tight"
                  style={{
                    fontSize: 11,
                    maxWidth: 72,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {aspiration.name || 'Unnamed'}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
