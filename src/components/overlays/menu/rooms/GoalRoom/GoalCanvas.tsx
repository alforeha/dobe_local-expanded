import { useEffect, useMemo, useRef, useState } from 'react';
import type { Aspiration } from '../../../../../types';
import { IconDisplay } from '../../../../shared/IconDisplay';

const ORB_RADIUS = 48;
const ORB_PERIOD_MS = 3000;
const PLANET_RADIUS = 22;
const PLANET_ORBIT_RADIUS = 130;
const PLANET_ORBIT_PERIOD_MS = 20000;
const MOON_RADIUS = 14;
const MOON_ORBIT_RADIUS = 80;
const MOON_ORBIT_PERIOD_MS = 15000;

interface GoalCanvasProps {
  userAspirations: Aspiration[];
  adventureAspirations: Aspiration[];
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
  color = 'rgba(139, 92, 246, 0.75)',
) {
  const glowRadius = radius * 2;
  const glowColor = color.replace(/,\s*[\d.]+\)$/, ', 0.34)');
  const transparentColor = color.replace(/,\s*[\d.]+\)$/, ', 0)');
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.45, glowColor);
  gradient.addColorStop(1, transparentColor);

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
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

export function GoalCanvas({ userAspirations, adventureAspirations }: GoalCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const planetPositionsRef = useRef<PlanetPosition[]>([]);
  const adventurePlanetPositionsRef = useRef<PlanetPosition[]>([]);
  const moonPositionsRef = useRef<PlanetPosition[]>([]);
  const [planetPositions, setPlanetPositions] = useState<PlanetPosition[]>([]);
  const [adventurePlanetPositions, setAdventurePlanetPositions] = useState<Array<{ id: string; x: number; y: number; radius: number }>>([]);
  const [selectedAspirationId, setSelectedAspirationId] = useState<string | null>(null);
  const [moonPositions, setMoonPositions] = useState<Array<{ id: string; x: number; y: number; radius: number }>>([]);

  const selectedAspiration = useMemo(() => {
    if (!selectedAspirationId) return null;
    return [...userAspirations, ...adventureAspirations].find((aspiration) => aspiration.id === selectedAspirationId) ?? null;
  }, [selectedAspirationId, userAspirations, adventureAspirations]);

  const selectedWoops = useMemo(() => selectedAspiration?.woops ?? [], [selectedAspiration]);

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
      const sx = width * 0.65;
      const sy = height * 0.55;

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
        sx,
        sy,
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

      if (adventureAspirations.length > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, PLANET_ORBIT_RADIUS, 0, Math.PI * 2);
        ctx.stroke();

        const nextAdventurePlanetPositions = adventureAspirations.map((aspiration, index) => {
          const baseAngle = ((2 * Math.PI) / adventureAspirations.length) * index;
          const angle = baseAngle - (elapsed / PLANET_ORBIT_PERIOD_MS) * Math.PI * 2;
          const x = sx + Math.cos(angle) * PLANET_ORBIT_RADIUS;
          const y = sy + Math.sin(angle) * PLANET_ORBIT_RADIUS;

          drawPlanet(ctx, x, y, PLANET_RADIUS, 'rgba(245, 158, 11, 0.72)');

          return {
            id: aspiration.id,
            x,
            y,
            radius: PLANET_RADIUS,
          };
        });

        if (planetPositionsChanged(adventurePlanetPositionsRef.current, nextAdventurePlanetPositions)) {
          adventurePlanetPositionsRef.current = nextAdventurePlanetPositions;
          setAdventurePlanetPositions(nextAdventurePlanetPositions);
        }
      } else if (adventurePlanetPositionsRef.current.length > 0) {
        adventurePlanetPositionsRef.current = [];
        setAdventurePlanetPositions([]);
      }

      const lockedPlanet = selectedAspirationId
        ? [...planetPositionsRef.current, ...adventurePlanetPositionsRef.current].find((position) => position.id === selectedAspirationId)
        : null;

      if (lockedPlanet) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(lockedPlanet.x, lockedPlanet.y, lockedPlanet.radius + 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (lockedPlanet && selectedWoops.length > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(lockedPlanet.x, lockedPlanet.y, MOON_ORBIT_RADIUS, 0, Math.PI * 2);
        ctx.stroke();

        const nextMoonPositions = selectedWoops.map((_, index) => {
          const baseAngle = ((2 * Math.PI) / selectedWoops.length) * index;
          const angle = baseAngle + (elapsed / MOON_ORBIT_PERIOD_MS) * Math.PI * 2;
          const x = lockedPlanet.x + Math.cos(angle) * MOON_ORBIT_RADIUS;
          const y = lockedPlanet.y + Math.sin(angle) * MOON_ORBIT_RADIUS;

          drawPlanet(ctx, x, y, MOON_RADIUS, 'rgba(167, 139, 250, 0.70)');

          return {
            id: `woop-${index}`,
            x,
            y,
            radius: MOON_RADIUS,
          };
        });

        if (planetPositionsChanged(moonPositionsRef.current, nextMoonPositions)) {
          moonPositionsRef.current = nextMoonPositions;
          setMoonPositions(nextMoonPositions);
        }
      } else if (moonPositionsRef.current.length > 0) {
        moonPositionsRef.current = [];
        setMoonPositions([]);
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
  }, [userAspirations, adventureAspirations, selectedAspirationId, selectedWoops]);

  return (
    <div
      className="absolute inset-0"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        const allPlanets = [...planetPositionsRef.current, ...adventurePlanetPositionsRef.current];
        const hit = allPlanets.find((planet) => {
          const dx = clickX - planet.x;
          const dy = clickY - planet.y;
          return Math.sqrt(dx * dx + dy * dy) <= planet.radius + 8;
        });

        if (hit) {
          setSelectedAspirationId((prev) => prev === hit.id ? null : hit.id);
        } else {
          setSelectedAspirationId(null);
        }
      }}
    >
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
      {adventureAspirations.length > 0 ? (
        <div className="absolute inset-0 pointer-events-none">
          {adventurePlanetPositions.map((position) => {
            const aspiration = adventureAspirations.find((item) => item.id === position.id);
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
      <div className="absolute inset-0 pointer-events-none">
        {moonPositions.map((moon, index) => {
          const woop = selectedWoops[index];
          if (!woop) return null;

          return (
            <div
              key={moon.id}
              className="absolute flex flex-col items-center gap-1"
              style={{
                left: moon.x,
                top: moon.y,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }}
            >
              <IconDisplay iconKey={woop.icon} size={12} className="opacity-70" />
              <span
                className="text-white/50 text-center leading-tight"
                style={{
                  fontSize: 10,
                  maxWidth: 64,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {woop.name || woop.wish || 'WOOP'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
