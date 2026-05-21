import { useEffect, useMemo, useRef, useState } from 'react';
import type { Aspiration, Woop } from '../../../../../types';
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
  aspirationDraft: Aspiration | null;
  woopDraft: { aspirationId: string; woopIdx: number | null; woop: Woop } | null;
  onFocusedOrbitChange?: (orbit: 'user' | 'system' | null) => void;
  onSelectedAspirationChange?: (aspiration: Aspiration | null) => void;
  onRegisterClearFocus?: (fn: (scope: 'planet' | 'all') => void) => void;
  onRegisterSelectAspiration?: (fn: (id: string) => void) => void;
  onMoonClick?: (woopIdx: number) => void;
  onSmarterClick?: (smarterIdx: number) => void;
  onRegisterSetSelectedWoop?: (fn: (idx: number | null) => void) => void;
  onRegisterSetSelectedSmarter?: (fn: (idx: number | null) => void) => void;
}

interface PlanetPosition {
  id: string;
  x: number;
  y: number;
  radius: number;
}

interface DraftMoonPosition extends PlanetPosition {
  label: string;
  icon: string;
}

interface DraftPlanetPosition extends PlanetPosition {
  label: string;
  icon: string;
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
  aspirationDraft,
  woopDraft,
  onFocusedOrbitChange,
  onSelectedAspirationChange,
  onRegisterClearFocus,
  onRegisterSelectAspiration,
  onMoonClick,
  onSmarterClick,
  onRegisterSetSelectedWoop,
  onRegisterSetSelectedSmarter,
}: GoalCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const planetPositionsRef = useRef<PlanetPosition[]>([]);
  const adventurePlanetPositionsRef = useRef<PlanetPosition[]>([]);
  const moonPositionsRef = useRef<PlanetPosition[]>([]);
  const moonWorldPositionsRef = useRef<PlanetPosition[]>([]);
  const smarterPositionsRef = useRef<Array<{ id: string; x: number; y: number; radius: number }>>([]);
  const smarterWorldPositionsRef = useRef<Array<{ id: string; x: number; y: number; radius: number }>>([]);
  const userOrbRef = useRef<{ x: number; y: number; radius: number } | null>(null);
  const systemOrbRef = useRef<{ x: number; y: number; radius: number } | null>(null);
  const screenPlanetPositionsRef = useRef<PlanetPosition[]>([]);
  const screenAdventurePlanetPositionsRef = useRef<PlanetPosition[]>([]);
  const cameraRef = useRef({ x: 0, y: 0, scale: 1 });
  const cameraTargetRef = useRef({ x: 0, y: 0, scale: 1 });
  const cameraSnapshotRef = useRef({ x: 0, y: 0, scale: 1 });
  const focusedOrbitRef = useRef<'user' | 'system' | null>(null);
  const selectedAspirationIdRef = useRef<string | null>(null);
  const selectedWoopIdxRef = useRef<number | null>(null);
  const selectedSmarterIdxRef = useRef<number | null>(null);
  const aspirationDraftRef = useRef<Aspiration | null>(null);
  const draftPlanetPositionRef = useRef<DraftPlanetPosition | null>(null);
  const aspirationDraftPosRef = useRef<{ x: number; y: number } | null>(null);
  const woopDraftRef = useRef(woopDraft);
  const draftMoonPositionRef = useRef<DraftMoonPosition | null>(null);
  const woopDraftPosRef = useRef<{ x: number; y: number } | null>(null);
  const [planetPositions, setPlanetPositions] = useState<PlanetPosition[]>([]);
  const [adventurePlanetPositions, setAdventurePlanetPositions] = useState<Array<{ id: string; x: number; y: number; radius: number }>>([]);
  const [selectedAspirationId, setSelectedAspirationId] = useState<string | null>(null);
  const [focusedOrbit, setFocusedOrbit] = useState<'user' | 'system' | null>(null);
  const [moonPositions, setMoonPositions] = useState<Array<{ id: string; x: number; y: number; radius: number }>>([]);
  const [smarterPositions, setSmarterPositions] = useState<Array<{ id: string; x: number; y: number; radius: number }>>([]);
  const [selectedWoopIdx, setSelectedWoopIdx] = useState<number | null>(null);
  const [cameraSnapshot, setCameraSnapshot] = useState({ x: 0, y: 0, scale: 1 });
  const [draftPlanetPosition, setDraftPlanetPosition] = useState<DraftPlanetPosition | null>(null);
  const [draftMoonPosition, setDraftMoonPosition] = useState<DraftMoonPosition | null>(null);

  const selectedAspiration = useMemo(() => {
    if (!selectedAspirationId) return null;
    return [...userAspirations, ...adventureAspirations].find((aspiration) => aspiration.id === selectedAspirationId) ?? null;
  }, [selectedAspirationId, userAspirations, adventureAspirations]);

  const selectedWoops = useMemo(() => selectedAspiration?.woops ?? [], [selectedAspiration]);

  useEffect(() => {
    aspirationDraftRef.current = aspirationDraft;
  }, [aspirationDraft]);

  useEffect(() => {
    woopDraftRef.current = woopDraft;
  }, [woopDraft]);

  useEffect(() => {
    onRegisterClearFocus?.((scope: 'planet' | 'all') => {
      selectedWoopIdxRef.current = null;
      selectedSmarterIdxRef.current = null;
      setSelectedWoopIdx(null);
      if (scope === 'planet') {
        setSelectedAspirationId(null);
      } else {
        setFocusedOrbit(null);
        setSelectedAspirationId(null);
      }
    });
  }, [onRegisterClearFocus]);

  useEffect(() => {
    onRegisterSelectAspiration?.((id: string) => {
      selectedWoopIdxRef.current = null;
      selectedSmarterIdxRef.current = null;
      setSelectedWoopIdx(null);
      setSelectedAspirationId(id);
    });
  }, [onRegisterSelectAspiration]);

  useEffect(() => {
    onRegisterSetSelectedWoop?.((idx: number | null) => {
      selectedWoopIdxRef.current = idx;
      selectedSmarterIdxRef.current = null;
      setSelectedWoopIdx(idx);
    });
  }, [onRegisterSetSelectedWoop]);

  useEffect(() => {
    onRegisterSetSelectedSmarter?.((idx: number | null) => {
      selectedSmarterIdxRef.current = idx;
    });
  }, [onRegisterSetSelectedSmarter]);

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
      const currentSelectedWoopIdx = selectedWoopIdxRef.current;
      const currentSelectedSmarterIdx = selectedSmarterIdxRef.current;
      const currentAspirationDraft = aspirationDraftRef.current;
      const currentDraft = woopDraftRef.current;
      const lockedPlanet = currentSelectedAspirationId
        ? [...planetPositionsRef.current, ...adventurePlanetPositionsRef.current].find((position) => position.id === currentSelectedAspirationId)
        : null;

      if (currentSelectedSmarterIdx !== null) {
        const smarterPos = smarterWorldPositionsRef.current[currentSelectedSmarterIdx];
        if (smarterPos) {
          cameraTargetRef.current = { x: smarterPos.x, y: smarterPos.y, scale: 3.2 };
        }
      } else if (currentDraft?.woopIdx === null) {
        const draftTarget = woopDraftPosRef.current ?? (
          lockedPlanet ? { x: lockedPlanet.x, y: lockedPlanet.y } : null
        );
        if (draftTarget) {
          cameraTargetRef.current = { x: draftTarget.x, y: draftTarget.y, scale: 2.2 };
        }
      } else if (currentSelectedWoopIdx !== null) {
        const moonPos = moonWorldPositionsRef.current[currentSelectedWoopIdx];
        if (moonPos) {
          cameraTargetRef.current = { x: moonPos.x, y: moonPos.y, scale: 2.2 };
        }
      } else if (currentAspirationDraft && aspirationDraftPosRef.current) {
        cameraTargetRef.current = { x: aspirationDraftPosRef.current.x, y: aspirationDraftPosRef.current.y, scale: 1.7 };
      } else if (currentSelectedAspirationId) {
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
        const totalForSpacing = currentAspirationDraft && !userAspirations.some((aspiration) => aspiration.id === currentAspirationDraft.id)
          ? userAspirations.length + 1
          : userAspirations.length;

        const nextPlanetPositions = userAspirations.map((aspiration, index) => {
          const baseAngle = ((2 * Math.PI) / totalForSpacing) * index;
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

      if (
        currentFocusedOrbit === 'user'
        && currentAspirationDraft
        && !userAspirations.some((aspiration) => aspiration.id === currentAspirationDraft.id)
      ) {
        const idx = userAspirations.length;
        const total = userAspirations.length + 1;
        const baseAngle = ((2 * Math.PI) / total) * idx;
        const angle = baseAngle + (elapsed / PLANET_ORBIT_PERIOD_MS) * Math.PI * 2;
        const px = ux + Math.cos(angle) * PLANET_ORBIT_RADIUS;
        const py = uy + Math.sin(angle) * PLANET_ORBIT_RADIUS;
        aspirationDraftPosRef.current = { x: px, y: py };

        ctx.save();
        ctx.globalAlpha = 0.5;
        drawPlanet(ctx, px, py, PLANET_RADIUS, 'rgba(139, 92, 246, 0.75)');
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, PLANET_RADIUS + 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        const nextDraftPlanetPosition = {
          id: currentAspirationDraft.id,
          x: worldToScreen(px, py, nextCameraSnapshot, canvasCenterX, canvasCenterY).x,
          y: worldToScreen(px, py, nextCameraSnapshot, canvasCenterX, canvasCenterY).y,
          radius: PLANET_RADIUS * nextCameraSnapshot.scale,
          label: currentAspirationDraft.name || 'New Aspiration',
          icon: currentAspirationDraft.icon,
        };
        const previousDraftPlanetPosition = draftPlanetPositionRef.current;
        const draftPlanetChanged = previousDraftPlanetPosition?.id !== nextDraftPlanetPosition.id
          || previousDraftPlanetPosition?.label !== nextDraftPlanetPosition.label
          || previousDraftPlanetPosition?.icon !== nextDraftPlanetPosition.icon
          || Math.abs((previousDraftPlanetPosition?.x ?? 0) - nextDraftPlanetPosition.x) > 1
          || Math.abs((previousDraftPlanetPosition?.y ?? 0) - nextDraftPlanetPosition.y) > 1
          || Math.abs((previousDraftPlanetPosition?.radius ?? 0) - nextDraftPlanetPosition.radius) > 1;

        if (draftPlanetChanged) {
          draftPlanetPositionRef.current = nextDraftPlanetPosition;
          setDraftPlanetPosition(nextDraftPlanetPosition);
        }
      } else if (draftPlanetPositionRef.current) {
        aspirationDraftPosRef.current = null;
        draftPlanetPositionRef.current = null;
        setDraftPlanetPosition(null);
      } else if (!currentAspirationDraft) {
        aspirationDraftPosRef.current = null;
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

        const draftExistsForThisPlanet = woopDraftRef.current?.aspirationId === currentSelectedAspirationId
          && woopDraftRef.current?.woopIdx === null;
        const totalMoonsForSpacing = draftExistsForThisPlanet
          ? selectedWoops.length + 1
          : selectedWoops.length;

        const nextMoonWorldPositions = selectedWoops.map((_, index) => {
          const baseAngle = ((2 * Math.PI) / totalMoonsForSpacing) * index;
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

        if (planetPositionsChanged(moonWorldPositionsRef.current, nextMoonWorldPositions)) {
          moonWorldPositionsRef.current = nextMoonWorldPositions;
        }

        if (planetPositionsChanged(moonPositionsRef.current, nextMoonScreenPositions)) {
          moonPositionsRef.current = nextMoonScreenPositions;
          setMoonPositions(nextMoonScreenPositions);
        }

        const nextSmarterWorldPositions: PlanetPosition[] = [];
        const smarterOrbitRadius = currentSelectedWoopIdx !== null ? 55 : 32;
        const smarterRadius = currentSelectedWoopIdx !== null ? 9 : 5;
        const smarterColor = currentSelectedWoopIdx !== null
          ? 'rgba(196, 181, 253, 0.70)'
          : 'rgba(196, 181, 253, 0.45)';

        nextMoonWorldPositions.forEach((moon, woopIdx) => {
          if (currentSelectedWoopIdx !== null && currentSelectedWoopIdx !== woopIdx) return;

          const woop = selectedWoops[woopIdx];
          if (!woop || woop.smarters.length === 0) return;

          if (currentSelectedWoopIdx !== null) {
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(moon.x, moon.y, smarterOrbitRadius, 0, Math.PI * 2);
            ctx.stroke();
          }

          woop.smarters.forEach((_, smarterIdx) => {
            const baseAngle = ((2 * Math.PI) / woop.smarters.length) * smarterIdx;
            const angle = baseAngle + (elapsed / 10000) * Math.PI * 2;
            const x = moon.x + Math.cos(angle) * smarterOrbitRadius;
            const y = moon.y + Math.sin(angle) * smarterOrbitRadius;

            drawPlanet(ctx, x, y, smarterRadius, smarterColor);

            if (currentSelectedWoopIdx !== null) {
              nextSmarterWorldPositions.push({
                id: `smarter-${woopIdx}-${smarterIdx}`,
                x,
                y,
                radius: smarterRadius,
              });
            }
          });
        });

        if (currentSelectedWoopIdx !== null) {
          const nextSmarterScreenPositions = nextSmarterWorldPositions.map((position) => ({
            ...position,
            ...worldToScreen(position.x, position.y, nextCameraSnapshot, canvasCenterX, canvasCenterY),
            radius: position.radius * nextCameraSnapshot.scale,
          }));

          if (planetPositionsChanged(smarterPositionsRef.current, nextSmarterScreenPositions)) {
            smarterPositionsRef.current = nextSmarterScreenPositions;
            setSmarterPositions(nextSmarterScreenPositions);
          }

          if (planetPositionsChanged(smarterWorldPositionsRef.current, nextSmarterWorldPositions)) {
            smarterWorldPositionsRef.current = nextSmarterWorldPositions;
          }
        } else if (smarterPositionsRef.current.length > 0) {
          smarterPositionsRef.current = [];
          smarterWorldPositionsRef.current = [];
          setSmarterPositions([]);
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
          moonWorldPositionsRef.current = [];
          setMoonPositions([]);
        }

        if (smarterPositionsRef.current.length > 0) {
          smarterPositionsRef.current = [];
          smarterWorldPositionsRef.current = [];
          setSmarterPositions([]);
        }
      }

      // Seed draft planet position if not yet in planet position refs.
      let draftPlanetSeed: PlanetPosition | null = null;
      if (
        currentDraft
        && !planetPositionsRef.current.find((position) => position.id === currentDraft.aspirationId)
        && !adventurePlanetPositionsRef.current.find((position) => position.id === currentDraft.aspirationId)
      ) {
        const draftAspId = currentDraft.aspirationId;
        const isUserAspiration = userAspirations.some((aspiration) => aspiration.id === draftAspId);
        const aspirations = isUserAspiration ? userAspirations : adventureAspirations;
        const orbitCenter = isUserAspiration ? { x: ux, y: uy } : { x: sx, y: sy };
        const draftAspIndex = aspirations.findIndex((aspiration) => aspiration.id === draftAspId);

        if (draftAspIndex !== -1 && aspirations.length > 0) {
          const baseAngle = ((2 * Math.PI) / aspirations.length) * draftAspIndex;
          const angle = baseAngle + (elapsed / PLANET_ORBIT_PERIOD_MS) * Math.PI * 2;
          draftPlanetSeed = {
            id: draftAspId,
            x: orbitCenter.x + Math.cos(angle) * PLANET_ORBIT_RADIUS,
            y: orbitCenter.y + Math.sin(angle) * PLANET_ORBIT_RADIUS,
            radius: PLANET_RADIUS,
          };
        }
      }

      const draftPlanetPos = currentDraft
        ? [
            ...planetPositionsRef.current,
            ...adventurePlanetPositionsRef.current,
            ...(draftPlanetSeed ? [draftPlanetSeed] : []),
          ].find((position) => position.id === currentDraft.aspirationId)
        : null;
      const draftOrbitCenter = draftPlanetPos ?? (
        currentDraft && cameraTargetRef.current
          ? { x: cameraTargetRef.current.x, y: cameraTargetRef.current.y, radius: PLANET_RADIUS }
          : null
      );

      if (currentDraft && currentDraft.woopIdx === null && draftOrbitCenter) {
        const draftAspiration = [...userAspirations, ...adventureAspirations].find((aspiration) => aspiration.id === currentDraft.aspirationId);
        const label = currentDraft.woop.name || currentDraft.woop.wish || 'New WOOP';
        let draftWorldPosition: PlanetPosition | null = null;

        if (draftAspiration && currentDraft.woopIdx === null) {
          const idx = draftAspiration.woops.length;
          const total = draftAspiration.woops.length + 1;
          const angle = ((2 * Math.PI) / total) * idx + (elapsed / MOON_ORBIT_PERIOD_MS) * Math.PI * 2;
          const x = draftOrbitCenter.x + Math.cos(angle) * MOON_ORBIT_RADIUS;
          const y = draftOrbitCenter.y + Math.sin(angle) * MOON_ORBIT_RADIUS;
          woopDraftPosRef.current = { x, y };

          ctx.save();
          ctx.globalAlpha = 0.5;
          drawPlanet(ctx, x, y, MOON_RADIUS, 'rgba(167, 139, 250, 0.70)');
          ctx.globalAlpha = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, MOON_RADIUS + 5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          draftWorldPosition = {
            id: 'woop-draft',
            x,
            y,
            radius: MOON_RADIUS,
          };
        } else if (currentDraft.woopIdx !== null) {
          const existingMoon = moonWorldPositionsRef.current[currentDraft.woopIdx];
          if (existingMoon) {
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(255,255,255,0.45)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(existingMoon.x, existingMoon.y, existingMoon.radius + 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            draftWorldPosition = existingMoon;
          }
        }

        const nextDraftMoonPosition = draftWorldPosition
          ? {
              ...draftWorldPosition,
              ...worldToScreen(draftWorldPosition.x, draftWorldPosition.y, nextCameraSnapshot, canvasCenterX, canvasCenterY),
              radius: draftWorldPosition.radius * nextCameraSnapshot.scale,
              label,
              icon: currentDraft.woop.icon,
            }
          : null;

        const previousDraftMoonPosition = draftMoonPositionRef.current;
        const draftChanged = previousDraftMoonPosition?.id !== nextDraftMoonPosition?.id
          || previousDraftMoonPosition?.label !== nextDraftMoonPosition?.label
          || previousDraftMoonPosition?.icon !== nextDraftMoonPosition?.icon
          || Math.abs((previousDraftMoonPosition?.x ?? 0) - (nextDraftMoonPosition?.x ?? 0)) > 1
          || Math.abs((previousDraftMoonPosition?.y ?? 0) - (nextDraftMoonPosition?.y ?? 0)) > 1
          || Math.abs((previousDraftMoonPosition?.radius ?? 0) - (nextDraftMoonPosition?.radius ?? 0)) > 1;

        if (draftChanged) {
          draftMoonPositionRef.current = nextDraftMoonPosition;
          setDraftMoonPosition(nextDraftMoonPosition);
        }
      } else if (draftMoonPositionRef.current) {
        woopDraftPosRef.current = null;
        draftMoonPositionRef.current = null;
        setDraftMoonPosition(null);
      } else if (!currentDraft) {
        woopDraftPosRef.current = null;
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
        const rect = event.currentTarget.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        if (selectedAspirationIdRef.current !== null) {
          if (selectedWoopIdxRef.current !== null) {
            const hit = smarterPositionsRef.current.find((smarter) => {
              const dx = clickX - smarter.x;
              const dy = clickY - smarter.y;
              return Math.sqrt(dx * dx + dy * dy) <= smarter.radius + 8;
            });

            if (hit) {
              const parts = hit.id.split('-');
              const smarterIdx = parseInt(parts[2], 10);
              if (!Number.isNaN(smarterIdx)) {
                onSmarterClick?.(smarterIdx);
              }
            }

            return;
          }

          const hit = moonPositionsRef.current.find((moon) => {
            const dx = clickX - moon.x;
            const dy = clickY - moon.y;
            return Math.sqrt(dx * dx + dy * dy) <= moon.radius + 10;
          });

          if (hit) {
            const woopIdx = parseInt(hit.id.replace('woop-', ''), 10);
            if (!Number.isNaN(woopIdx)) {
              onMoonClick?.(woopIdx);
            }
          }

          return;
        }

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
      {(focusedOrbit === null || focusedOrbit === 'user') && (userAspirations.length > 0 || draftPlanetPosition) ? (
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
          {draftPlanetPosition ? (
            <div
              className="absolute flex flex-col items-center gap-1"
              style={{
                left: draftPlanetPosition.x,
                top: draftPlanetPosition.y,
                transform: 'translate(-50%, -50%)',
                opacity: 0.5,
                fontStyle: 'italic',
              }}
            >
              <IconDisplay iconKey={draftPlanetPosition.icon} size={16} className="opacity-80" />
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
                {draftPlanetPosition.label}
              </span>
            </div>
          ) : null}
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
          const draftForMoon = woopDraft?.aspirationId === selectedAspirationId && woopDraft.woopIdx === index
            ? woopDraft.woop
            : null;
          const woop = draftForMoon ?? selectedWoops[index];
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
        {woopDraft?.woopIdx === null && draftMoonPosition ? (
          <div
            className="absolute flex flex-col items-center gap-1"
            style={{
              left: draftMoonPosition.x,
              top: draftMoonPosition.y,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              opacity: 0.5,
              fontStyle: 'italic',
            }}
          >
            <IconDisplay iconKey={draftMoonPosition.icon} size={12} className="opacity-70" />
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
              {draftMoonPosition.label}
            </span>
          </div>
        ) : null}
        {selectedWoopIdx !== null && smarterPositions.map((smarterPosition) => {
          const woop = selectedWoops[selectedWoopIdx];
          const smarterIdx = parseInt(smarterPosition.id.split('-')[2], 10);
          const smarter = woop?.smarters[smarterIdx];
          if (!smarter) return null;

          return (
            <div
              key={smarterPosition.id}
              className="absolute flex flex-col items-center gap-0.5 pointer-events-none"
              style={{
                left: smarterPosition.x,
                top: smarterPosition.y,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <IconDisplay iconKey={smarter.icon} size={10} className="opacity-60" />
              <span
                className="text-white/40 text-center"
                style={{
                  fontSize: 9,
                  maxWidth: 56,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {smarter.name || 'SMARTER'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
