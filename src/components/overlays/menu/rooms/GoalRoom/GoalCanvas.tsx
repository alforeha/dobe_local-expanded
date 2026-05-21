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
const ORBIT_LEVEL_MOON_RADIUS = 8;
const ORBIT_LEVEL_MOON_ORBIT_RADIUS = 50;

interface GoalCanvasProps {
  userAspirations: Aspiration[];
  adventureAspirations: Aspiration[];
  onFocusedOrbitChange?: (orbit: 'user' | 'system' | null) => void;
  onSelectedAspirationChange?: (aspiration: Aspiration | null) => void;
  onRegisterClearFocus?: (fn: (scope: 'planet' | 'all') => void) => void;
  onRegisterSelectAspiration?: (fn: (id: string) => void) => void;
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

function cameraChanged(
  previous: { x: number; y: number; scale: number },
  next: { x: number; y: number; scale: number },
) {
  return Math.abs(previous.x - next.x) > 0.5
    || Math.abs(previous.y - next.y) > 0.5
    || Math.abs(previous.scale - next.scale) > 0.005;
}

function worldToScreen(
  wx: number,
  wy: number,
  cam: { x: number; y: number; scale: number },
  canvasCenterX: number,
  canvasCenterY: number,
) {
  return {
    x: (wx - cam.x) * cam.scale + canvasCenterX,
    y: (wy - cam.y) * cam.scale + canvasCenterY,
  };
}

export function GoalCanvas({
  userAspirations,
  adventureAspirations,
  onFocusedOrbitChange,
  onSelectedAspirationChange,
  onRegisterClearFocus,
  onRegisterSelectAspiration,
}: GoalCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const planetPositionsRef = useRef<PlanetPosition[]>([]);
  const adventurePlanetPositionsRef = useRef<PlanetPosition[]>([]);
  const moonPositionsRef = useRef<PlanetPosition[]>([]);
  const userOrbRef = useRef<{ x: number; y: number; radius: number } | null>(null);
  const systemOrbRef = useRef<{ x: number; y: number; radius: number } | null>(null);
  const screenPlanetPositionsRef = useRef<PlanetPosition[]>([]);
  const screenAdventurePlanetPositionsRef = useRef<PlanetPosition[]>([]);
  const cameraRef = useRef({ x: 0, y: 0, scale: 1 });
  const cameraTargetRef = useRef({ x: 0, y: 0, scale: 1 });
  const cameraSnapshotRef = useRef({ x: 0, y: 0, scale: 1 });
  const focusedOrbitRef = useRef<'user' | 'system' | null>(null);
  const selectedAspirationIdRef = useRef<string | null>(null);
  const [planetPositions, setPlanetPositions] = useState<PlanetPosition[]>([]);
  const [adventurePlanetPositions, setAdventurePlanetPositions] = useState<Array<{ id: string; x: number; y: number; radius: number }>>([]);
  const [selectedAspirationId, setSelectedAspirationId] = useState<string | null>(null);
  const [focusedOrbit, setFocusedOrbit] = useState<'user' | 'system' | null>(null);
  const [moonPositions, setMoonPositions] = useState<Array<{ id: string; x: number; y: number; radius: number }>>([]);
  const [cameraSnapshot, setCameraSnapshot] = useState({ x: 0, y: 0, scale: 1 });

  const selectedAspiration = useMemo(() => {
    if (!selectedAspirationId) return null;
    return [...userAspirations, ...adventureAspirations].find((aspiration) => aspiration.id === selectedAspirationId) ?? null;
  }, [selectedAspirationId, userAspirations, adventureAspirations]);

  const selectedWoops = useMemo(() => selectedAspiration?.woops ?? [], [selectedAspiration]);

  useEffect(() => {
    onRegisterClearFocus?.((scope: 'planet' | 'all') => {
      if (scope === 'planet') {
        setSelectedAspirationId(null);
      } else {
        setFocusedOrbit(null);
        setSelectedAspirationId(null);
      }
    });
  }, [onRegisterClearFocus]);

  useEffect(() => {
    onRegisterSelectAspiration?.((id: string) => setSelectedAspirationId(id));
  }, [onRegisterSelectAspiration]);

  useEffect(() => {
    focusedOrbitRef.current = focusedOrbit;
  }, [focusedOrbit]);

  useEffect(() => {
    selectedAspirationIdRef.current = selectedAspirationId;
  }, [selectedAspirationId]);

  useEffect(() => {
    onSelectedAspirationChange?.(selectedAspiration ?? null);
  }, [selectedAspiration, onSelectedAspirationChange]);

  useEffect(() => {
    onFocusedOrbitChange?.(focusedOrbit);
  }, [focusedOrbit, onFocusedOrbitChange]);

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
      const canvasCenterX = width * 0.5;
      const canvasCenterY = height * 0.50;
      const ux = width * 0.35;
      const uy = height * 0.53;
      const sx = width * 0.65;
      const sy = height * 0.63;

      const currentFocusedOrbit = focusedOrbitRef.current;
      const currentSelectedAspirationId = selectedAspirationIdRef.current;

      if (currentSelectedAspirationId) {
        const allPlanets = [...planetPositionsRef.current, ...adventurePlanetPositionsRef.current];
        const target = allPlanets.find((position) => position.id === currentSelectedAspirationId);
        if (target) {
          cameraTargetRef.current = { x: target.x, y: target.y, scale: 1.7 };
        }
      } else if (currentFocusedOrbit === 'user') {
        cameraTargetRef.current = { x: ux, y: uy, scale: 1.3 };
      } else if (currentFocusedOrbit === 'system') {
        cameraTargetRef.current = { x: sx, y: sy, scale: 1.3 };
      } else {
        cameraTargetRef.current = { x: canvasCenterX, y: canvasCenterY, scale: 1 };
      }

      const lerpSpeed = 0.07;
      cameraRef.current.x += (cameraTargetRef.current.x - cameraRef.current.x) * lerpSpeed;
      cameraRef.current.y += (cameraTargetRef.current.y - cameraRef.current.y) * lerpSpeed;
      cameraRef.current.scale += (cameraTargetRef.current.scale - cameraRef.current.scale) * lerpSpeed;

      const nextCameraSnapshot = { ...cameraRef.current };
      if (cameraChanged(cameraSnapshotRef.current, nextCameraSnapshot)) {
        cameraSnapshotRef.current = nextCameraSnapshot;
        setCameraSnapshot(nextCameraSnapshot);
      }

      const phase = (elapsed / ORB_PERIOD_MS) * Math.PI * 2;
      const userScale = 1 + Math.sin(phase) * 0.08;
      const systemScale = 1 + Math.sin(phase + Math.PI) * 0.08;

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      const cam = cameraRef.current;
      ctx.translate(canvasCenterX, canvasCenterY);
      ctx.scale(cam.scale, cam.scale);
      ctx.translate(-cam.x, -cam.y);

      userOrbRef.current = {
        ...worldToScreen(ux, uy, nextCameraSnapshot, canvasCenterX, canvasCenterY),
        radius: ORB_RADIUS * nextCameraSnapshot.scale,
      };
      systemOrbRef.current = {
        ...worldToScreen(sx, sy, nextCameraSnapshot, canvasCenterX, canvasCenterY),
        radius: ORB_RADIUS * nextCameraSnapshot.scale,
      };

      if (currentFocusedOrbit === null || currentFocusedOrbit === 'user') {
        drawOrb(
          ctx,
          ux,
          uy,
          ORB_RADIUS * userScale,
          'rgba(99, 102, 241, 0.85)',
          'Your Aspirations',
        );
        if (currentFocusedOrbit === 'user') {
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ux, uy, 58, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      if (currentFocusedOrbit === null || currentFocusedOrbit === 'system') {
        drawOrb(
          ctx,
          sx,
          sy,
          ORB_RADIUS * systemScale,
          'rgba(245, 158, 11, 0.85)',
          'Adventures',
        );
        if (currentFocusedOrbit === 'system') {
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx, sy, 58, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      if ((currentFocusedOrbit === null || currentFocusedOrbit === 'user') && userAspirations.length > 0) {
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

          ctx.globalAlpha = currentSelectedAspirationId && currentSelectedAspirationId !== aspiration.id ? 0.35 : 1;
          drawPlanet(ctx, x, y, PLANET_RADIUS);
          ctx.globalAlpha = 1;

          return {
            id: aspiration.id,
            x,
            y,
            radius: PLANET_RADIUS,
          };
        });

        const nextScreenPlanetPositions = nextPlanetPositions.map((position) => ({
          ...position,
          ...worldToScreen(position.x, position.y, nextCameraSnapshot, canvasCenterX, canvasCenterY),
          radius: position.radius * nextCameraSnapshot.scale,
        }));

        if (planetPositionsChanged(planetPositionsRef.current, nextPlanetPositions)) {
          planetPositionsRef.current = nextPlanetPositions;
        }

        if (planetPositionsChanged(screenPlanetPositionsRef.current, nextScreenPlanetPositions)) {
          screenPlanetPositionsRef.current = nextScreenPlanetPositions;
          setPlanetPositions(nextScreenPlanetPositions);
        }
      } else if (planetPositionsRef.current.length > 0) {
        planetPositionsRef.current = [];
        screenPlanetPositionsRef.current = [];
        setPlanetPositions([]);
      }

      if ((currentFocusedOrbit === null || currentFocusedOrbit === 'system') && adventureAspirations.length > 0) {
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

          ctx.globalAlpha = currentSelectedAspirationId && currentSelectedAspirationId !== aspiration.id ? 0.35 : 1;
          drawPlanet(ctx, x, y, PLANET_RADIUS, 'rgba(245, 158, 11, 0.72)');
          ctx.globalAlpha = 1;

          return {
            id: aspiration.id,
            x,
            y,
            radius: PLANET_RADIUS,
          };
        });

        const nextScreenAdventurePlanetPositions = nextAdventurePlanetPositions.map((position) => ({
          ...position,
          ...worldToScreen(position.x, position.y, nextCameraSnapshot, canvasCenterX, canvasCenterY),
          radius: position.radius * nextCameraSnapshot.scale,
        }));

        if (planetPositionsChanged(adventurePlanetPositionsRef.current, nextAdventurePlanetPositions)) {
          adventurePlanetPositionsRef.current = nextAdventurePlanetPositions;
        }

        if (planetPositionsChanged(screenAdventurePlanetPositionsRef.current, nextScreenAdventurePlanetPositions)) {
          screenAdventurePlanetPositionsRef.current = nextScreenAdventurePlanetPositions;
          setAdventurePlanetPositions(nextScreenAdventurePlanetPositions);
        }
      } else if (adventurePlanetPositionsRef.current.length > 0) {
        adventurePlanetPositionsRef.current = [];
        screenAdventurePlanetPositionsRef.current = [];
        setAdventurePlanetPositions([]);
      }

      const lockedPlanet = currentSelectedAspirationId
        ? [...planetPositionsRef.current, ...adventurePlanetPositionsRef.current].find((position) => position.id === currentSelectedAspirationId)
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

        const nextMoonWorldPositions = selectedWoops.map((_, index) => {
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

        const nextMoonScreenPositions = nextMoonWorldPositions.map((position) => ({
          ...position,
          ...worldToScreen(position.x, position.y, nextCameraSnapshot, canvasCenterX, canvasCenterY),
          radius: position.radius * nextCameraSnapshot.scale,
        }));

        if (planetPositionsChanged(moonPositionsRef.current, nextMoonScreenPositions)) {
          moonPositionsRef.current = nextMoonScreenPositions;
          setMoonPositions(nextMoonScreenPositions);
        }
      } else {
        if (currentFocusedOrbit && !currentSelectedAspirationId) {
          const focusedPlanetPositions = currentFocusedOrbit === 'user'
            ? planetPositionsRef.current
            : adventurePlanetPositionsRef.current;
          const focusedAspirations = currentFocusedOrbit === 'user'
            ? userAspirations
            : adventureAspirations;

          focusedPlanetPositions.forEach((planet) => {
            const aspiration = focusedAspirations.find((item) => item.id === planet.id);
            if (!aspiration || aspiration.woops.length === 0) return;

            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(planet.x, planet.y, ORBIT_LEVEL_MOON_ORBIT_RADIUS, 0, Math.PI * 2);
            ctx.stroke();

            aspiration.woops.forEach((_, index) => {
              const baseAngle = ((2 * Math.PI) / aspiration.woops.length) * index;
              const angle = baseAngle + (elapsed / MOON_ORBIT_PERIOD_MS) * Math.PI * 2;
              const x = planet.x + Math.cos(angle) * ORBIT_LEVEL_MOON_ORBIT_RADIUS;
              const y = planet.y + Math.sin(angle) * ORBIT_LEVEL_MOON_ORBIT_RADIUS;

              drawPlanet(ctx, x, y, ORBIT_LEVEL_MOON_RADIUS, 'rgba(167, 139, 250, 0.50)');
            });
          });
        }

        if (moonPositionsRef.current.length > 0) {
          moonPositionsRef.current = [];
          setMoonPositions([]);
        }
      }

      ctx.restore();
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
  }, [userAspirations, adventureAspirations, selectedAspirationId, selectedWoops, focusedOrbit]);

  return (
    <div
      className="absolute inset-0"
      data-camera-scale={cameraSnapshot.scale.toFixed(3)}
      onClick={(event) => {
        if (selectedAspirationIdRef.current !== null) {
          return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;
        const currentFocusedOrbit = focusedOrbitRef.current;

        const userOrb = userOrbRef.current;
        const systemOrb = systemOrbRef.current;

        if (currentFocusedOrbit === null) {
          if (userOrb) {
            const dx = clickX - userOrb.x;
            const dy = clickY - userOrb.y;
            if (Math.sqrt(dx * dx + dy * dy) <= userOrb.radius + 12) {
              setFocusedOrbit('user');
              setSelectedAspirationId(null);
              return;
            }
          }

          if (systemOrb) {
            const dx = clickX - systemOrb.x;
            const dy = clickY - systemOrb.y;
            if (Math.sqrt(dx * dx + dy * dy) <= systemOrb.radius + 12) {
              setFocusedOrbit('system');
              setSelectedAspirationId(null);
            }
          }

          return;
        }

        const planetsToTest = currentFocusedOrbit === 'user'
          ? screenPlanetPositionsRef.current
          : screenAdventurePlanetPositionsRef.current;

        const hit = planetsToTest.find((planet) => {
          const dx = clickX - planet.x;
          const dy = clickY - planet.y;
          return Math.sqrt(dx * dx + dy * dy) <= planet.radius + 8;
        });

        if (hit) {
          setSelectedAspirationId(hit.id);
        }
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none' }}
      />
      {(focusedOrbit === null || focusedOrbit === 'user') && userAspirations.length > 0 ? (
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
                  opacity: selectedAspirationId && selectedAspirationId !== position.id ? 0.3 : 1,
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
      {(focusedOrbit === null || focusedOrbit === 'system') && adventureAspirations.length > 0 ? (
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
                  opacity: selectedAspirationId && selectedAspirationId !== position.id ? 0.3 : 1,
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
