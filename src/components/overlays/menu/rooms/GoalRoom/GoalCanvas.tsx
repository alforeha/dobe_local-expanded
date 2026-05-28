import { useEffect, useMemo, useRef, useState } from 'react';
import { useBrainstormStore } from '../../../../../stores/useBrainstormStore';
import type { Aspiration, Smarter, Woop } from '../../../../../types';
import type { Storm } from '../../../../../types/brainstorm';
import { ICON_MAP } from '../../../../../constants/iconMap';
import { IconDisplay } from '../../../../shared/IconDisplay';
import {
  drawStormOrb,
  drawStormBeam,
  drawBrainstormConstellation,
  drawBrainstormCenterGlow,
  drawBrainstormIdeaSpokes,
  drawBrainstormNode,
  drawBrainstormPointerLines,
  drawBrainstormPreview,
  drawBrainstormWebBackground,
  getBrainstormHitRadius,
} from './brainstormDraw';
import { drawGeneralStormBackground } from './generalStormBackground';
import {
  flattenIdeaTree,
  fitScaleForBranches,
  getIdeaLayoutTree,
  getMainIdeaLayouts,
  getPointerLines,
} from './brainstormLayout';
import type { IdeaLayout, IdeaLayoutNode, MainIdeaLayout } from './brainstormLayout';
import { hitTestIdea, hitTestMainIdea } from './brainstormInteraction';
import { brainstormDraftRef } from './brainstormDraftRef';

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
const STORM_PAGE_SIZE = 6;

interface GoalCanvasProps {
  selectedStormId: string | null;
  addingStorm: boolean;
  userAspirations: Aspiration[];
  adventureAspirations: Aspiration[];
  aspirationDraft: Aspiration | null;
  woopDraft: { aspirationId: string; woopIdx: number | null; woop: Woop } | null;
  smarterDraft: { aspirationId: string; woopIdx: number; smarterIdx: number | null; smarter: Smarter } | null;
  isActView?: boolean;
  isActEdit?: boolean;
  onFocusedOrbitChange?: (orbit: 'user' | 'system' | null) => void;
  onRegisterFocusOrbit?: (fn: (orbit: 'user' | 'system' | null) => void) => void;
  onSelectedAspirationChange?: (aspiration: Aspiration | null) => void;
  onRegisterClearFocus?: (fn: (scope: 'planet' | 'all') => void) => void;
  onRegisterSelectAspiration?: (fn: (id: string) => void) => void;
  onMoonClick?: (woopIdx: number) => void;
  onSmarterClick?: (smarterIdx: number) => void;
  onBrainstormSelect: () => void;
  onSelectStorm: (id: string) => void;
  brainstormFocused: boolean;
  selectedMainIdeaId: string | null;
  selectedIdeaId: string | null;
  onSelectMainIdea: (id: string | null) => void;
  onSelectIdea: (id: string | null) => void;
  onRegisterSetSelectedWoop?: (fn: (idx: number | null) => void) => void;
  onRegisterSetSelectedSmarter?: (fn: (idx: number | null) => void) => void;
  onRegisterStormScroll?: (fn: (ratio: number) => void) => void;
  onStormWheelScroll?: (delta: number) => void;
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

interface DraftSmarterPosition extends PlanetPosition {
  label: string;
  icon: string;
}

interface StormLayout {
  id: string;
  x: number;
  y: number;
  alpha: number;
  radius: number;
  order: number;
  slot: number;
  storm: Storm;
}

// function getStormIconEmoji(storm: Storm): string {
//   return ICON_MAP[`storm-${storm.type}`] ?? '';
// }

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
  selectedStormId,
  addingStorm,
  userAspirations,
  adventureAspirations,
  aspirationDraft,
  woopDraft,
  smarterDraft,
  isActView,
  isActEdit,
  onFocusedOrbitChange,
  onRegisterFocusOrbit,
  onSelectedAspirationChange,
  onRegisterClearFocus,
  onRegisterSelectAspiration,
  onMoonClick,
  onSmarterClick,
  onBrainstormSelect,
  onSelectStorm,
  brainstormFocused,
  selectedMainIdeaId,
  selectedIdeaId,
  onSelectMainIdea,
  onSelectIdea,
  onRegisterSetSelectedWoop,
  onRegisterSetSelectedSmarter,
  onRegisterStormScroll,
  onStormWheelScroll,
}: GoalCanvasProps) {
  const storms = useBrainstormStore((s) => s.storms);
  void addingStorm;
  const activeStormId = selectedStormId;
  const currentStorm = activeStormId ? storms[activeStormId] ?? null : null;
  const mainIdeas = useMemo(
    () => (activeStormId ? storms[activeStormId]?.mainIdeas ?? {} : {}),
    [storms, activeStormId],
  );
  const ideas = useMemo(
    () => (activeStormId ? storms[activeStormId]?.ideas ?? {} : {}),
    [storms, activeStormId],
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const brainstormAlphaRef = useRef(0.12);
  const stormTransitionAlphaRef = useRef<number>(1);
  const selectedStormWorldPosRef = useRef<{ x: number; y: number } | null>(null);
  const goalNodesAlphaRef = useRef(1);
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
  const brainstormFocusedRef = useRef(brainstormFocused);
  const selectedMainIdeaIdRef = useRef(selectedMainIdeaId);
  const selectedIdeaIdRef = useRef(selectedIdeaId);
  const highlightedIdeaIdsRef = useRef<Set<string>>(new Set());
  const stormLayoutsRef = useRef<StormLayout[]>([]);
  const stormLayoutWorldEntriesRef = useRef<StormLayout[]>([]);
  const stormScrollProgress = useRef(0);
  const mainIdeaLayoutsRef = useRef<MainIdeaLayout[]>([]);
  const ideaLayoutsRef = useRef<IdeaLayoutNode[]>([]);
  const allFlatIdeaLayoutsRef = useRef<IdeaLayoutNode[]>([]);
  const flatIdeaLayoutsRef = useRef<IdeaLayout[]>([]);
  const selectedAspirationIdRef = useRef<string | null>(null);
  const selectedWoopIdxRef = useRef<number | null>(null);
  const selectedSmarterIdxRef = useRef<number | null>(null);
  const actOrbitorPosRef = useRef<{ x: number; y: number } | null>(null);
  const isActViewRef = useRef(false);
  const isActEditRef = useRef(false);
  const aspirationDraftRef = useRef<Aspiration | null>(null);
  const draftPlanetPositionRef = useRef<DraftPlanetPosition | null>(null);
  const aspirationDraftPosRef = useRef<{ x: number; y: number } | null>(null);
  const woopDraftRef = useRef(woopDraft);
  const draftMoonPositionRef = useRef<DraftMoonPosition | null>(null);
  const woopDraftPosRef = useRef<{ x: number; y: number } | null>(null);
  const smarterDraftRef = useRef(smarterDraft);
  const draftSmarterPositionRef = useRef<DraftSmarterPosition | null>(null);
  const smarterDraftPosRef = useRef<{ x: number; y: number } | null>(null);
  const [planetPositions, setPlanetPositions] = useState<PlanetPosition[]>([]);
  const [adventurePlanetPositions, setAdventurePlanetPositions] = useState<Array<{ id: string; x: number; y: number; radius: number }>>([]);
  const [selectedAspirationId, setSelectedAspirationId] = useState<string | null>(null);
  const [focusedOrbit, setFocusedOrbit] = useState<'user' | 'system' | null>(null);
  const [moonPositions, setMoonPositions] = useState<Array<{ id: string; x: number; y: number; radius: number }>>([]);
  const [smarterPositions, setSmarterPositions] = useState<Array<{ id: string; x: number; y: number; radius: number }>>([]);
  const [selectedWoopIdx, setSelectedWoopIdx] = useState<number | null>(null);
  const [cameraSnapshot, setCameraSnapshot] = useState({ x: 0, y: 0, scale: 1 });
  const [goalNodesAlpha, setGoalNodesAlpha] = useState(1);
  const [draftPlanetPosition, setDraftPlanetPosition] = useState<DraftPlanetPosition | null>(null);
  const [draftMoonPosition, setDraftMoonPosition] = useState<DraftMoonPosition | null>(null);
  const [draftSmarterPosition, setDraftSmarterPosition] = useState<DraftSmarterPosition | null>(null);
  const [brainstormHovered, setBrainstormHovered] = useState(false);
  const [hoveredMainIdeaId, setHoveredMainIdeaId] = useState<string | null>(null);
  const [hoveredIdeaId, setHoveredIdeaId] = useState<string | null>(null);

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
    smarterDraftRef.current = smarterDraft;
  }, [smarterDraft]);

  useEffect(() => {
    isActViewRef.current = isActView ?? false;
  }, [isActView]);

  useEffect(() => {
    isActEditRef.current = isActEdit ?? false;
  }, [isActEdit]);

  useEffect(() => {
    onRegisterFocusOrbit?.((orbit: 'user' | 'system' | null) => {
      setFocusedOrbit(orbit);
      setSelectedAspirationId(null);
    });
  }, [onRegisterFocusOrbit]);

  useEffect(() => {
    onRegisterClearFocus?.((scope: 'planet' | 'all') => {
      selectedWoopIdxRef.current = null;
      selectedSmarterIdxRef.current = null;
      setSelectedWoopIdx(null);
      if (scope === 'planet') {
        setSelectedAspirationId(null);
      } else {
        selectedAspirationIdRef.current = null;
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
    onRegisterStormScroll?.((ratio: number) => {
      stormScrollProgress.current = ratio;
    });
  }, [onRegisterStormScroll]);

  useEffect(() => {
    focusedOrbitRef.current = focusedOrbit;
  }, [focusedOrbit]);

  useEffect(() => {
    brainstormFocusedRef.current = brainstormFocused;
  }, [brainstormFocused]);

  useEffect(() => {
    if (selectedStormId === null) {
      selectedStormWorldPosRef.current = null;
    } else {
      const layout = stormLayoutWorldEntriesRef.current
        .find((l) => l.id === selectedStormId);
      if (layout) {
        selectedStormWorldPosRef.current = { x: layout.x, y: layout.y };
      }
    }
  }, [selectedStormId]);

  useEffect(() => {
    selectedMainIdeaIdRef.current = selectedMainIdeaId;
  }, [selectedMainIdeaId]);

  useEffect(() => {
    selectedIdeaIdRef.current = selectedIdeaId;
  }, [selectedIdeaId]);

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
      const bx = canvasCenterX + 20;
      const by = canvasCenterY - 60;
      const stormList = Object.values(storms);
      const totalStorms = stormList.length;
      const PAGE = STORM_PAGE_SIZE;
      const r = 180;
      const slotStep = (2 * Math.PI) / PAGE;
      const transitionAngle = -Math.PI / 2;
      const hasMore = totalStorms > PAGE;
      const maxHead = Math.max(0, totalStorms - PAGE);
      const scrollOffset = stormScrollProgress.current * maxHead;
      const head = Math.min(Math.floor(scrollOffset), maxHead);
      const scrollPhase = scrollOffset - head;
      const ringRotation = -scrollOffset * slotStep;
      const smoothstep = (edge0: number, edge1: number, x: number) => {
        const v = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return v * v * (3 - 2 * v);
      };
      const lerp = (a: number, b: number, factor: number) => a + (b - a) * factor;
      const getStormAt = (offset: number) => {
        if (totalStorms === 0) return null;
        return stormList[((head + offset) % totalStorms + totalStorms) % totalStorms] ?? null;
      };
      const getRingAngle = (slot: number) => (
        transitionAngle + (slot - (PAGE - 1) - scrollPhase) * slotStep
      );
      const incomingT = smoothstep(0, 1, scrollPhase);
      const currentFocusedOrbit = focusedOrbitRef.current;
      const currentBrainstormFocused = brainstormFocusedRef.current;
      const stormLayouts: StormLayout[] = [];
      const stormDraws: Array<{
        storm: Storm;
        alpha: number;
        idx: number;
        x: number;
        y: number;
      }> = [];
      const stormLayoutWorldEntries: StormLayout[] = [];
      let carryOutgoingDraw: {
        storm: Storm;
        alpha: number;
        x: number;
        y: number;
      } | null = null;
      let incomingDraw: {
        storm: Storm;
        alpha: number;
        x: number;
        y: number;
      } | null = null;
      stormLayoutsRef.current = [];
      stormLayoutWorldEntriesRef.current = [];

      if (totalStorms > 0) {
        if (hasMore && head > 0) {
          const prevStorm = stormList[(head - 1 + totalStorms) % totalStorms];
          if (prevStorm) {
            const carryT = smoothstep(0, 1, scrollPhase);
            const carryAlpha = lerp(0.25, 0, carryT);
            const carryR = lerp(r - 80, r - 140, carryT);
            const carryAngle = getRingAngle(-1);
            const cox = bx + Math.cos(carryAngle) * carryR;
            const coy = by + Math.sin(carryAngle) * carryR;

            if (carryAlpha > 0.02) {
              carryOutgoingDraw = {
                storm: prevStorm,
                alpha: carryAlpha,
                x: cox,
                y: coy,
              };
            }
          }
        }

        for (let slot = 0; slot < Math.min(PAGE, totalStorms); slot += 1) {
          const stormIndex = (head + slot) % totalStorms;
          const storm = getStormAt(slot);
          if (!storm) continue;

          const angle = getRingAngle(slot);
          let slotRadius = r;
          let alpha = 1;

          if (hasMore && slot === 0) {
            const outT = smoothstep(0, 1, scrollPhase);
            alpha = lerp(1, 0.25, outT);
            slotRadius = lerp(r, r - 80, outT);
          }

          const sxStorm = bx + Math.cos(angle) * slotRadius;
          const syStorm = by + Math.sin(angle) * slotRadius;

          stormDraws.push({
            storm,
            alpha,
            idx: slot,
            x: sxStorm,
            y: syStorm,
          });
          stormLayouts.push({
            id: storm.id,
            x: sxStorm,
            y: syStorm,
            alpha,
            radius: 22,
            order: stormIndex,
            slot,
            storm,
          });
          stormLayoutWorldEntries.push({
            id: storm.id,
            x: sxStorm,
            y: syStorm,
            alpha,
            radius: 22,
            order: stormIndex,
            slot,
            storm,
          });
        }

        if (hasMore && head + PAGE < totalStorms) {
          const incomingIndex = (head + PAGE) % totalStorms;
          const incomingStorm = getStormAt(PAGE);
          if (incomingStorm) {
            const inAngle = getRingAngle(0);
            const incomingR = lerp(r + 140, r, incomingT);
            const ix = bx + Math.cos(inAngle) * incomingR;
            const iy = by + Math.sin(inAngle) * incomingR;
            const inAlpha = lerp(0.2, 0.8, incomingT);

            incomingDraw = {
              storm: incomingStorm,
              alpha: inAlpha,
              x: ix,
              y: iy,
            };
            stormLayoutWorldEntries.push({
              id: incomingStorm.id,
              x: ix,
              y: iy,
              alpha: inAlpha,
              radius: 22,
              order: incomingIndex,
              slot: PAGE,
              storm: incomingStorm,
            });
          }
        }
      }
      const currentSelectedMainIdeaId = selectedMainIdeaIdRef.current;
      const currentSelectedIdeaId = selectedIdeaIdRef.current;
      const currentSelectedAspirationId = selectedAspirationIdRef.current;
      const currentSelectedWoopIdx = selectedWoopIdxRef.current;
      const currentSelectedSmarterIdx = selectedSmarterIdxRef.current;
      const currentAspirationDraft = aspirationDraftRef.current;
      const currentDraft = woopDraftRef.current;
      const currentSmarterDraft = smarterDraftRef.current;
      const lockedPlanet = currentSelectedAspirationId
        ? [...planetPositionsRef.current, ...adventurePlanetPositionsRef.current].find((position) => position.id === currentSelectedAspirationId)
        : null;
      const freshMainLayouts = currentBrainstormFocused && currentStorm
        ? getMainIdeaLayouts(mainIdeas, bx, by)
        : mainIdeaLayoutsRef.current;
      const highlightedIds = new Set<string>();

      if (currentSelectedIdeaId) {
        highlightedIds.add(currentSelectedIdeaId);

        const selectedIdeaData = ideas[currentSelectedIdeaId];
        if (selectedIdeaData) {
          selectedIdeaData.pointsTo.forEach((pointer) => {
            highlightedIds.add(pointer.targetId);
          });
        }

        const findAndAddDescendants = (nodes: IdeaLayoutNode[]) => {
          nodes.forEach((node) => {
            highlightedIds.add(node.id);
            if (node.children.length > 0) {
              findAndAddDescendants(node.children);
            }
          });
        };

        const findNode = (nodes: IdeaLayoutNode[], id: string): IdeaLayoutNode | null => {
          for (const node of nodes) {
            if (node.id === id) return node;
            const found = findNode(node.children, id);
            if (found) return found;
          }
          return null;
        };

        const selectedNode = findNode(ideaLayoutsRef.current, currentSelectedIdeaId);
        if (selectedNode) {
          findAndAddDescendants(selectedNode.children);
        }
      } else if (currentSelectedMainIdeaId) {
        allFlatIdeaLayoutsRef.current
          .filter((node) => node.mainIdeaId === currentSelectedMainIdeaId)
          .forEach((node) => highlightedIds.add(node.id));
      }

      highlightedIdeaIdsRef.current = highlightedIds;

      if ((isActEditRef.current || isActViewRef.current) && actOrbitorPosRef.current) {
        cameraTargetRef.current = { x: actOrbitorPosRef.current.x, y: actOrbitorPosRef.current.y, scale: 3.8 };
      } else if (currentSmarterDraft?.smarterIdx === null) {
        const draftTarget = smarterDraftPosRef.current ?? (
          currentSelectedWoopIdx !== null ? moonWorldPositionsRef.current[currentSelectedWoopIdx] : null
        );
        if (draftTarget) {
          cameraTargetRef.current = { x: draftTarget.x, y: draftTarget.y, scale: 3.2 };
        }
      } else if (currentSelectedSmarterIdx !== null) {
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
      } else if (currentBrainstormFocused && activeStormId !== null && (highlightedIds.size > 0 || currentSelectedMainIdeaId)) {
        const highlightedPositions = allFlatIdeaLayoutsRef.current.filter((node) => highlightedIds.has(node.id));
        const mainLayout = currentSelectedMainIdeaId
          ? freshMainLayouts.find((layout) => layout.id === currentSelectedMainIdeaId)
          : null;
        const allX = highlightedPositions.map((node) => node.x);
        const allY = highlightedPositions.map((node) => node.y);

        if (highlightedIds.size === 0 && mainLayout) {
          cameraTargetRef.current = { x: mainLayout.x, y: mainLayout.y, scale: 1.6 };
        } else if (mainLayout && !currentSelectedIdeaId) {
          allX.push(mainLayout.x);
          allY.push(mainLayout.y);
        }

        if (highlightedIds.size > 0 && allX.length > 0) {
          const minX = Math.min(...allX);
          const maxX = Math.max(...allX);
          const minY = Math.min(...allY);
          const maxY = Math.max(...allY);
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          const spanX = maxX - minX + 80;
          const spanY = maxY - minY + 80;
          const scaleX = (width * 0.7) / spanX;
          const scaleY = (height * 0.7) / spanY;
          const scale = Math.min(2.5, Math.max(0.4, Math.min(scaleX, scaleY)));

          cameraTargetRef.current = { x: centerX, y: centerY, scale };
        }
      } else if (currentBrainstormFocused && activeStormId !== null) {
        const stormLayout = stormLayoutWorldEntries.find((layout) => layout.id === activeStormId);
        if (stormLayout) {
          cameraTargetRef.current = { x: stormLayout.x, y: stormLayout.y, scale: 1.4 };
        } else {
          cameraTargetRef.current = { x: bx, y: by, scale: 1.3 };
        }
      } else if (currentBrainstormFocused) {
        if (stormLayouts.length === 1) {
          cameraTargetRef.current = { x: stormLayouts[0].x, y: stormLayouts[0].y, scale: 1.3 };
        } else if (stormLayouts.length > 1) {
          cameraTargetRef.current = {
            x: bx,
            y: by,
            scale: fitScaleForBranches(180 + 60, width, height),
          };
        } else {
          cameraTargetRef.current = { x: bx, y: by, scale: 1 };
        }
      } else if (currentFocusedOrbit === 'user') {
        cameraTargetRef.current = { x: ux, y: uy, scale: 1.3 };
      } else if (currentFocusedOrbit === 'system') {
        cameraTargetRef.current = { x: sx, y: sy, scale: 1.3 };
      } else {
        cameraTargetRef.current = { x: canvasCenterX, y: canvasCenterY, scale: 1 };
      }

      const draft = brainstormDraftRef.current;
      const transitionTarget = activeStormId !== null || draft !== null ? 0 : 1;
      stormTransitionAlphaRef.current += (
        transitionTarget - stormTransitionAlphaRef.current
      ) * 0.035;
      const ta = stormTransitionAlphaRef.current;
      const stormBeamAlpha = Math.max(1 - ta, 0.15);

      const lerpSpeed = activeStormId !== null ? 0.04 : 0.07;
      cameraRef.current.x += (cameraTargetRef.current.x - cameraRef.current.x) * lerpSpeed;
      cameraRef.current.y += (cameraTargetRef.current.y - cameraRef.current.y) * lerpSpeed;
      cameraRef.current.scale += (cameraTargetRef.current.scale - cameraRef.current.scale) * lerpSpeed;

      const nextCameraSnapshot = { ...cameraRef.current };
      if (cameraChanged(cameraSnapshotRef.current, nextCameraSnapshot)) {
        cameraSnapshotRef.current = nextCameraSnapshot;
        setCameraSnapshot(nextCameraSnapshot);
      }
      stormLayoutsRef.current = stormLayoutWorldEntries.map((layout) => {
        const screenPos = worldToScreen(
          layout.x,
          layout.y,
          nextCameraSnapshot,
          canvasCenterX,
          canvasCenterY,
        );
        return {
          ...layout,
          x: screenPos.x,
          y: screenPos.y,
        };
      });
      stormLayoutWorldEntriesRef.current = stormLayoutWorldEntries;

      const phase = (elapsed / ORB_PERIOD_MS) * Math.PI * 2;
      const userScale = 1 + Math.sin(phase) * 0.08;
      const systemScale = 1 + Math.sin(phase + Math.PI) * 0.08;
      const brainstormScale = 1 + Math.sin(phase) * 0.08;
      brainstormAlphaRef.current = currentBrainstormFocused
        ? Math.min(0.85, brainstormAlphaRef.current + 0.02)
        : Math.max(0.12, brainstormAlphaRef.current - 0.02);
      goalNodesAlphaRef.current = currentBrainstormFocused
        ? Math.max(0, goalNodesAlphaRef.current - 0.04)
        : Math.min(1, goalNodesAlphaRef.current + 0.04);
      setGoalNodesAlpha((previous) => (
        Math.abs(previous - goalNodesAlphaRef.current) > 0.001
          ? goalNodesAlphaRef.current
          : previous
      ));

      ctx.clearRect(0, 0, width, height);
      if (currentBrainstormFocused || brainstormAlphaRef.current > 0) {
        const dpr = window.devicePixelRatio || 1;
        const screenBx = (bx - cameraRef.current.x) * cameraRef.current.scale + width / 2;
        const screenBy = (by - cameraRef.current.y) * cameraRef.current.scale + height / 2;
        drawBrainstormCenterGlow(
          ctx,
          screenBx,
          screenBy,
          width,
          height,
          brainstormAlphaRef.current,
        );

        if (currentBrainstormFocused && currentFocusedOrbit === null) {
          const beamLayouts = [
            ...stormLayouts,
            ...stormLayoutWorldEntries.filter((layout) => layout.slot === PAGE),
          ];
          beamLayouts.forEach((layout) => {
            const screenSx = (layout.x - cameraRef.current.x) * cameraRef.current.scale + width / 2;
            const screenSy = (layout.y - cameraRef.current.y) * cameraRef.current.scale + height / 2;
            const orbAngle = Math.atan2(screenSy - screenBy, screenSx - screenBx);
            const beamColor = layout.storm.category.color;

            drawStormBeam(
              ctx,
              screenSx,
              screenSy,
              orbAngle,
              beamColor,
              layout.alpha * ta,
              canvas.width / dpr,
              canvas.height / dpr,
            );
          });

if (draft !== null) {
  const baseAngle = -Math.PI / 2;
  const beamAngles = [
    baseAngle,
    baseAngle + (Math.PI * 2) / 3,
    baseAngle + (Math.PI * 4) / 3,
  ];
  const dpr = window.devicePixelRatio || 1;
  const canvasWidth = canvas.width / dpr;
  const canvasHeight = canvas.height / dpr;
  beamAngles.forEach((angle) => {
    drawStormBeam(
      ctx,
      canvasCenterX,
      canvasCenterY,
      angle,
      draft.category.color,
      1,
      canvasWidth,
      canvasHeight,
      'selected',
    );
  });
  drawGeneralStormBackground(
    ctx,
    canvasCenterX,
    canvasCenterY,
    draft.category.color,
    1,
    timestamp,
  );
  // TODO: storm type background — pending type canvas build for non-general draft previews.
} else if (activeStormId !== null && currentStorm) {
            const selectedStormWorldPos = selectedStormWorldPosRef.current;
            if (selectedStormWorldPos) {
              const selectedScreen = worldToScreen(
                selectedStormWorldPos.x,
                selectedStormWorldPos.y,
                nextCameraSnapshot,
                canvasCenterX,
                canvasCenterY,
              );
              const baseAngle = Math.atan2(
                selectedStormWorldPos.y - by,
                selectedStormWorldPos.x - bx,
              );
              const beamAngles = [
                baseAngle,
                baseAngle + (Math.PI * 2) / 3,
                baseAngle + (Math.PI * 4) / 3,
              ];

              beamAngles.forEach((angle) => {
                drawStormBeam(
                  ctx,
                  selectedScreen.x,
                  selectedScreen.y,
                  angle,
                  currentStorm.category.color,
                  stormBeamAlpha,
                  canvas.width / dpr,
                  canvas.height / dpr,
                  'selected',
                );
              });

              if (currentStorm.type === 'general') {
                drawGeneralStormBackground(
                  ctx,
                  canvasCenterX,
                  canvasCenterY,
                  currentStorm.category.color,
                  stormBeamAlpha,
                  timestamp,
                );
              } else {
                // TODO: storm type background — pending type canvas build
              }
            }
          }
        }
      }
      ctx.save();
      const cam = cameraRef.current;
      ctx.translate(canvasCenterX, canvasCenterY);
      ctx.scale(cam.scale, cam.scale);
      ctx.translate(-cam.x, -cam.y);
      const currentGoalNodesAlpha = goalNodesAlphaRef.current;
      const goalNodesVisible = currentGoalNodesAlpha > 0.001;
      const applyGoalNodesAlpha = (alpha = 1) => {
        ctx.globalAlpha = currentGoalNodesAlpha * alpha;
      };

      const webAlpha = (currentBrainstormFocused ? 0.6 : 0.25) * ta;
      if (currentFocusedOrbit === null) {
        drawBrainstormWebBackground(ctx, bx, by, timestamp, webAlpha, ringRotation);
      }
      if (currentFocusedOrbit === null && !currentBrainstormFocused) {
        drawBrainstormPreview(ctx, bx, by, mainIdeas, ideas, brainstormAlphaRef.current, timestamp);
      }
      if (currentBrainstormFocused) {
        if (activeStormId === null) {
          mainIdeaLayoutsRef.current = [];
          ideaLayoutsRef.current = [];
          flatIdeaLayoutsRef.current = [];
          allFlatIdeaLayoutsRef.current = [];

          if (carryOutgoingDraw) {
            const iconEmoji = ICON_MAP[`storm-${carryOutgoingDraw.storm.type}`] ?? '💭';
            drawStormOrb(
              ctx,
              carryOutgoingDraw.x,
              carryOutgoingDraw.y,
              16,
              iconEmoji,
              '',
              carryOutgoingDraw.alpha * ta,
              timestamp,
              -1,
              carryOutgoingDraw.storm.category.color,
            );
          }

          stormDraws.forEach((entry) => {
            const iconEmoji = ICON_MAP[`storm-${entry.storm.type}`] ?? '💭';
            drawStormOrb(
              ctx,
              entry.x,
              entry.y,
              133,
              iconEmoji,
              '',
              entry.alpha * ta,
              timestamp,
              entry.idx,
              entry.storm.category.color,
            );
          });

          if (incomingDraw) {
            const iconEmoji = ICON_MAP[`storm-${incomingDraw.storm.type}`] ?? '💭';
            drawStormOrb(
              ctx,
              incomingDraw.x,
              incomingDraw.y,
              133,
              iconEmoji,
              '',
              incomingDraw.alpha * ta,
              timestamp,
              PAGE,
              incomingDraw.storm.category.color,
            );
          }
        } else {
          if (carryOutgoingDraw && carryOutgoingDraw.storm.id !== activeStormId) {
            const iconEmoji = ICON_MAP[`storm-${carryOutgoingDraw.storm.type}`] ?? '💭';
            drawStormOrb(
              ctx,
              carryOutgoingDraw.x,
              carryOutgoingDraw.y,
              16,
              iconEmoji,
              '',
              carryOutgoingDraw.alpha * ta,
              timestamp,
              -1,
              carryOutgoingDraw.storm.category.color,
            );
          }

          stormDraws.forEach((entry) => {
            if (entry.storm.id === activeStormId) return;
            const iconEmoji = ICON_MAP[`storm-${entry.storm.type}`] ?? '💭';
            drawStormOrb(
              ctx,
              entry.x,
              entry.y,
              22,
              iconEmoji,
              '',
              entry.alpha * ta,
              timestamp,
              entry.idx,
              entry.storm.category.color,
            );
          });

          if (incomingDraw && incomingDraw.storm.id !== activeStormId) {
            const iconEmoji = ICON_MAP[`storm-${incomingDraw.storm.type}`] ?? '💭';
            drawStormOrb(
              ctx,
              incomingDraw.x,
              incomingDraw.y,
              22,
              iconEmoji,
              '',
              incomingDraw.alpha * ta,
              timestamp,
              PAGE,
              incomingDraw.storm.category.color,
            );
          }

          const mainLayouts = getMainIdeaLayouts(mainIdeas, bx, by);
          mainIdeaLayoutsRef.current = mainLayouts;
          const constellationLayouts = mainLayouts.map((layout) => ({
            ...layout,
            ...mainIdeas[layout.id],
          }));

          drawBrainstormConstellation(
            ctx,
            constellationLayouts,
            currentSelectedMainIdeaId,
            hoveredMainIdeaId,
            highlightedIdeaIdsRef.current,
            currentSelectedIdeaId,
            timestamp,
            mainIdeas,
          );

          const allFlatIdeas: IdeaLayoutNode[] = [];
          Object.values(mainIdeas).forEach((mainIdea) => {
            const mainLayout = mainIdeaLayoutsRef.current.find(
              (layout) => layout.id === mainIdea.id,
            );
            if (!mainLayout) return;

            const cx = mainLayout.x;
            const cy = mainLayout.y;

            const ideaTree = getIdeaLayoutTree(mainIdea, ideas, cx, cy, undefined, bx, by);
            const flatIdeas = flattenIdeaTree(ideaTree);
            allFlatIdeas.push(...flatIdeas);

            if (mainIdea.id === currentSelectedMainIdeaId) {
              ideaLayoutsRef.current = ideaTree;
              flatIdeaLayoutsRef.current = flatIdeas;
            }

            const pointerLines = getPointerLines(flatIdeas, ideas);
            drawBrainstormPointerLines(ctx, pointerLines);
            drawBrainstormIdeaSpokes(
              ctx,
              ideaTree,
              ideas,
              highlightedIdeaIdsRef.current,
              currentSelectedIdeaId,
              mainIdea.id === currentSelectedMainIdeaId ? hoveredIdeaId : null,
              cx,
              cy,
              timestamp,
            );
          });
          allFlatIdeaLayoutsRef.current = allFlatIdeas;

          if (!currentSelectedMainIdeaId) {
            ideaLayoutsRef.current = [];
            flatIdeaLayoutsRef.current = [];
          }
        }
      }

      userOrbRef.current = {
        ...worldToScreen(ux, uy, nextCameraSnapshot, canvasCenterX, canvasCenterY),
        radius: ORB_RADIUS * nextCameraSnapshot.scale,
      };
      systemOrbRef.current = {
        ...worldToScreen(sx, sy, nextCameraSnapshot, canvasCenterX, canvasCenterY),
        radius: ORB_RADIUS * nextCameraSnapshot.scale,
      };

      if (goalNodesVisible && (currentFocusedOrbit === null || currentFocusedOrbit === 'user')) {
        applyGoalNodesAlpha();
        drawOrb(
          ctx,
          ux,
          uy,
          ORB_RADIUS * userScale,
          'rgba(99, 102, 241, 0.85)',
          '',
        );
        if (currentFocusedOrbit === 'user') {
          applyGoalNodesAlpha();
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ux, uy, 58, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      if (goalNodesVisible && (currentFocusedOrbit === null || currentFocusedOrbit === 'system')) {
        applyGoalNodesAlpha();
        drawOrb(
          ctx,
          sx,
          sy,
          ORB_RADIUS * systemScale,
          'rgba(245, 158, 11, 0.85)',
          '',
        );
        if (currentFocusedOrbit === 'system') {
          applyGoalNodesAlpha();
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx, sy, 58, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      if (goalNodesVisible && (currentFocusedOrbit === null || currentFocusedOrbit === 'user') && userAspirations.length > 0) {
        applyGoalNodesAlpha();
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

          applyGoalNodesAlpha(currentSelectedAspirationId && currentSelectedAspirationId !== aspiration.id ? 0.35 : 1);
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
        goalNodesVisible
        && currentFocusedOrbit === 'user'
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
        applyGoalNodesAlpha(0.5);
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

      if (goalNodesVisible && (currentFocusedOrbit === null || currentFocusedOrbit === 'system') && adventureAspirations.length > 0) {
        applyGoalNodesAlpha();
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

          applyGoalNodesAlpha(currentSelectedAspirationId && currentSelectedAspirationId !== aspiration.id ? 0.35 : 1);
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

      if (goalNodesVisible && lockedPlanet) {
        applyGoalNodesAlpha();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(lockedPlanet.x, lockedPlanet.y, lockedPlanet.radius + 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (goalNodesVisible && lockedPlanet && selectedWoops.length > 0) {
        applyGoalNodesAlpha();
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

          applyGoalNodesAlpha();
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
          if (!woop) return;

          const draftExistsForThisWoop = currentSmarterDraft?.aspirationId === currentSelectedAspirationId
            && currentSmarterDraft.woopIdx === woopIdx
            && currentSmarterDraft.smarterIdx === null;
          const totalSmartersForSpacing = draftExistsForThisWoop
            ? woop.smarters.length + 1
            : woop.smarters.length;
          if (totalSmartersForSpacing === 0) return;

          if (currentSelectedWoopIdx !== null) {
            applyGoalNodesAlpha();
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(moon.x, moon.y, smarterOrbitRadius, 0, Math.PI * 2);
            ctx.stroke();
          }

          woop.smarters.forEach((_, smarterIdx) => {
            const baseAngle = ((2 * Math.PI) / totalSmartersForSpacing) * smarterIdx;
            const angle = baseAngle + (elapsed / 10000) * Math.PI * 2;
            const x = moon.x + Math.cos(angle) * smarterOrbitRadius;
            const y = moon.y + Math.sin(angle) * smarterOrbitRadius;

            applyGoalNodesAlpha();
            drawPlanet(ctx, x, y, smarterRadius, smarterColor);

            const smarter = woop.smarters[smarterIdx];
            const hasAct = !!(smarter?.name && smarter.nestedAct);

            if (hasAct && currentSelectedWoopIdx !== null) {
              const actOrbitRadius = 18;
              const actRadius = 3.5;
              const actAngle = (elapsed / 6000) * Math.PI * 2;
              const ax = x + Math.cos(actAngle) * actOrbitRadius;
              const ay = y + Math.sin(actAngle) * actOrbitRadius;
              if (smarterIdx === currentSelectedSmarterIdx) {
                actOrbitorPosRef.current = { x: ax, y: ay };
              }
              applyGoalNodesAlpha(0.8);
              drawPlanet(ctx, ax, ay, actRadius, 'rgba(245, 158, 11, 0.85)');
              ctx.globalAlpha = 1;
            }

            if (currentSelectedWoopIdx !== null) {
              nextSmarterWorldPositions.push({
                id: `smarter-${woopIdx}-${smarterIdx}`,
                x,
                y,
                radius: smarterRadius,
              });
            }
          });

          if (draftExistsForThisWoop) {
            const draftIdx = woop.smarters.length;
            const baseAngle = ((2 * Math.PI) / totalSmartersForSpacing) * draftIdx;
            const angle = baseAngle + (elapsed / 10000) * Math.PI * 2;
            const x = moon.x + Math.cos(angle) * smarterOrbitRadius;
            const y = moon.y + Math.sin(angle) * smarterOrbitRadius;
            smarterDraftPosRef.current = { x, y };

            ctx.save();
            applyGoalNodesAlpha(0.5);
            drawPlanet(ctx, x, y, smarterRadius, 'rgba(196, 181, 253, 0.70)');
            ctx.globalAlpha = 1;
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = 'rgba(255,255,255,0.45)';
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.arc(x, y, smarterRadius + 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            const draftWorldPosition = {
              id: 'smarter-draft',
              x,
              y,
              radius: smarterRadius,
            };
            const nextDraftSmarterPosition = {
              ...draftWorldPosition,
              ...worldToScreen(x, y, nextCameraSnapshot, canvasCenterX, canvasCenterY),
              radius: smarterRadius * nextCameraSnapshot.scale,
              label: currentSmarterDraft.smarter.name || 'New SMARTER',
              icon: currentSmarterDraft.smarter.icon,
            };
            const previousDraftSmarterPosition = draftSmarterPositionRef.current;
            const draftChanged = previousDraftSmarterPosition?.id !== nextDraftSmarterPosition.id
              || previousDraftSmarterPosition?.label !== nextDraftSmarterPosition.label
              || previousDraftSmarterPosition?.icon !== nextDraftSmarterPosition.icon
              || Math.abs((previousDraftSmarterPosition?.x ?? 0) - nextDraftSmarterPosition.x) > 1
              || Math.abs((previousDraftSmarterPosition?.y ?? 0) - nextDraftSmarterPosition.y) > 1
              || Math.abs((previousDraftSmarterPosition?.radius ?? 0) - nextDraftSmarterPosition.radius) > 1;

            if (draftChanged) {
              draftSmarterPositionRef.current = nextDraftSmarterPosition;
              setDraftSmarterPosition(nextDraftSmarterPosition);
            }
          } else if (
            currentSmarterDraft?.aspirationId === currentSelectedAspirationId
            && currentSmarterDraft.woopIdx === woopIdx
            && currentSmarterDraft.smarterIdx !== null
          ) {
            const existingSmarter = nextSmarterWorldPositions.find((position) => position.id === `smarter-${woopIdx}-${currentSmarterDraft.smarterIdx}`);
            if (existingSmarter) {
              ctx.save();
              ctx.setLineDash([3, 3]);
              ctx.strokeStyle = 'rgba(255,255,255,0.45)';
              ctx.lineWidth = 1.25;
              ctx.beginPath();
              ctx.arc(existingSmarter.x, existingSmarter.y, existingSmarter.radius + 4, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();
            }
          }
        });

        if (currentSelectedSmarterIdx === null) {
          actOrbitorPosRef.current = null;
        }

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

        if (currentSmarterDraft?.smarterIdx !== null && draftSmarterPositionRef.current) {
          smarterDraftPosRef.current = null;
          draftSmarterPositionRef.current = null;
          setDraftSmarterPosition(null);
        } else if (!currentSmarterDraft) {
          smarterDraftPosRef.current = null;
          if (draftSmarterPositionRef.current) {
            draftSmarterPositionRef.current = null;
            setDraftSmarterPosition(null);
          }
        }
      } else {
        if (draftSmarterPositionRef.current) {
          smarterDraftPosRef.current = null;
          draftSmarterPositionRef.current = null;
          setDraftSmarterPosition(null);
        }

        if (goalNodesVisible && currentFocusedOrbit && !currentSelectedAspirationId) {
          const focusedPlanetPositions = currentFocusedOrbit === 'user'
            ? planetPositionsRef.current
            : adventurePlanetPositionsRef.current;
          const focusedAspirations = currentFocusedOrbit === 'user'
            ? userAspirations
            : adventureAspirations;

          focusedPlanetPositions.forEach((planet) => {
            const aspiration = focusedAspirations.find((item) => item.id === planet.id);
            if (!aspiration || aspiration.woops.length === 0) return;

            applyGoalNodesAlpha();
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

              applyGoalNodesAlpha();
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
        goalNodesVisible
        && currentDraft
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

      if (goalNodesVisible && currentDraft && currentDraft.woopIdx === null && draftOrbitCenter) {
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
          applyGoalNodesAlpha(0.5);
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

      if (currentFocusedOrbit === null || currentBrainstormFocused) {
        drawBrainstormNode(
          ctx,
          bx,
          by,
          28,
          '',
          brainstormScale,
          brainstormHovered,
          currentBrainstormFocused,
          (currentBrainstormFocused ? 0 : 1) * ta,
        );
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
  }, [
    userAspirations,
    adventureAspirations,
    selectedAspirationId,
    selectedWoops,
    focusedOrbit,
    mainIdeas,
    ideas,
    hoveredMainIdeaId,
    hoveredIdeaId,
    activeStormId,
    brainstormHovered,
    currentStorm,
    storms,
  ]);

  return (
    <div
      className="absolute inset-0"
      data-camera-scale={cameraSnapshot.scale.toFixed(3)}
      onWheel={(event) => {
        if (!brainstormFocusedRef.current || selectedStormId) return;
        onStormWheelScroll?.(event.deltaY);
      }}
      onClick={(event) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;
        const canvasEl = canvasRef.current;

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
        const currentBrainstormFocused = brainstormFocusedRef.current;

        const userOrb = userOrbRef.current;
        const systemOrb = systemOrbRef.current;

        if (currentBrainstormFocused) {
          if (!canvasEl) return;

          const dpr = window.devicePixelRatio || 1;
          const canvasCenterX = (canvasEl.width / dpr) * 0.5;
          const canvasCenterY = (canvasEl.height / dpr) * 0.50;
          const toScreen = (wx: number, wy: number) => worldToScreen(
            wx,
            wy,
            cameraRef.current,
            canvasCenterX,
            canvasCenterY,
          );
          if (selectedStormId === null) {
            const hitStorm = stormLayoutsRef.current.find((layout) => {
              const dx = clickX - layout.x;
              const dy = clickY - layout.y;
              return Math.sqrt(dx * dx + dy * dy) <= layout.radius + 12;
            });

            if (hitStorm) {
              const hitLayout = stormLayoutWorldEntriesRef.current.find((layout) => layout.id === hitStorm.id);
              if (hitLayout) {
                selectedStormWorldPosRef.current = { x: hitLayout.x, y: hitLayout.y };
              }
              onSelectStorm(hitStorm.id);
              // TODO: Wire stormIndex back to the drawer scroll position from GoalRoom.
            }
            return;
          }

          const hitMainId = hitTestMainIdea(
            clickX,
            clickY,
            mainIdeaLayoutsRef.current,
            toScreen,
          );
          if (hitMainId) {
            onSelectMainIdea(hitMainId);
            return;
          }

          const hitIdeaId = hitTestIdea(
            clickX,
            clickY,
            allFlatIdeaLayoutsRef.current,
            toScreen,
          );
          if (hitIdeaId) {
            const ownerMainId = allFlatIdeaLayoutsRef.current.find((layout) => layout.id === hitIdeaId)?.mainIdeaId;
            if (ownerMainId) {
              onSelectMainIdea(ownerMainId);
            }
            onSelectIdea(hitIdeaId);
            return;
          }

          if (selectedMainIdeaIdRef.current) {
            onSelectMainIdea(null);
            onSelectIdea(null);
          }
          return;
        }

        if (currentFocusedOrbit === null) {
          if (userOrb) {
            const dx = clickX - userOrb.x;
            const dy = clickY - userOrb.y;
            if (!brainstormFocused && Math.sqrt(dx * dx + dy * dy) <= userOrb.radius + 12) {
              setFocusedOrbit('user');
              setSelectedAspirationId(null);
              return;
            }
          }

          if (systemOrb) {
            const dx = clickX - systemOrb.x;
            const dy = clickY - systemOrb.y;
            if (!brainstormFocused && Math.sqrt(dx * dx + dy * dy) <= systemOrb.radius + 12) {
              setFocusedOrbit('system');
              setSelectedAspirationId(null);
              return;
            }
          }

          if (canvasEl && !brainstormFocused) {
            const dpr = window.devicePixelRatio || 1;
            const canvasCenterX = (canvasEl.width / dpr) * 0.5;
            const canvasCenterY = (canvasEl.height / dpr) * 0.50;
            const bx = canvasCenterX;
            const by = canvasCenterY - 80;
            const { x: bsx, y: bsy } = worldToScreen(
              bx,
              by,
              cameraRef.current,
              canvasCenterX,
              canvasCenterY,
            );
            const bdx = clickX - bsx;
            const bdy = clickY - bsy;
            const brainstormHit = Math.sqrt(bdx * bdx + bdy * bdy) <= getBrainstormHitRadius();
            if (brainstormHit) {
              onBrainstormSelect();
              brainstormFocusedRef.current = true;
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
      onMouseMove={(event) => {
        const canvasEl = canvasRef.current;
        if (!canvasEl) return;

        const rect = event.currentTarget.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;
        const dpr = window.devicePixelRatio || 1;
        const canvasCenterX = (canvasEl.width / dpr) * 0.5;
        const canvasCenterY = (canvasEl.height / dpr) * 0.50;
        const bx = canvasCenterX;
        const by = canvasCenterY - 80;
        const { x: bsx, y: bsy } = worldToScreen(
          bx,
          by,
          cameraRef.current,
          canvasCenterX,
          canvasCenterY,
        );
        const bdx = clickX - bsx;
        const bdy = clickY - bsy;
        const currentFocusedOrbit = focusedOrbitRef.current;
        const currentBrainstormFocused = brainstormFocusedRef.current;
        const toScreen = (wx: number, wy: number) => worldToScreen(
          wx,
          wy,
          cameraRef.current,
          canvasCenterX,
          canvasCenterY,
        );

        if (currentBrainstormFocused) {
          if (selectedStormId === null) {
            setHoveredMainIdeaId(null);
            setHoveredIdeaId(null);
          } else {
            const hitMainId = hitTestMainIdea(
              clickX,
              clickY,
              mainIdeaLayoutsRef.current,
              toScreen,
            );
            const hitIdeaId = hitTestIdea(
              clickX,
              clickY,
              allFlatIdeaLayoutsRef.current,
              toScreen,
            );

            setHoveredMainIdeaId(hitMainId);
            setHoveredIdeaId(hitIdeaId);
          }
        } else {
          setHoveredMainIdeaId(null);
          setHoveredIdeaId(null);
        }

        setBrainstormHovered(
          Math.sqrt(bdx * bdx + bdy * bdy) <= getBrainstormHitRadius() + 8
            && currentFocusedOrbit === null
            && !currentBrainstormFocused,
        );
      }}
      onMouseLeave={() => {
        setBrainstormHovered(false);
        setHoveredMainIdeaId(null);
        setHoveredIdeaId(null);
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none' }}
      />
      {goalNodesAlpha > 0.001 && (focusedOrbit === null || focusedOrbit === 'user') && (userAspirations.length > 0 || draftPlanetPosition) ? (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ opacity: goalNodesAlpha, pointerEvents: goalNodesAlpha <= 0.001 ? 'none' : undefined }}
        >
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
      {goalNodesAlpha > 0.001 && (focusedOrbit === null || focusedOrbit === 'system') && adventureAspirations.length > 0 ? (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ opacity: goalNodesAlpha, pointerEvents: goalNodesAlpha <= 0.001 ? 'none' : undefined }}
        >
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
      {goalNodesAlpha > 0.001 ? <div
        className="absolute inset-0 pointer-events-none"
        style={{ opacity: goalNodesAlpha, pointerEvents: goalNodesAlpha <= 0.001 ? 'none' : undefined }}
      >
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
          const draftForSmarter = smarterDraft?.aspirationId === selectedAspirationId
            && smarterDraft.woopIdx === selectedWoopIdx
            && smarterDraft.smarterIdx === smarterIdx
            ? smarterDraft.smarter
            : null;
          const smarter = draftForSmarter ?? woop?.smarters[smarterIdx];
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
        {smarterDraft?.smarterIdx === null && draftSmarterPosition ? (
          <div
            className="absolute flex flex-col items-center gap-0.5 pointer-events-none"
            style={{
              left: draftSmarterPosition.x,
              top: draftSmarterPosition.y,
              transform: 'translate(-50%, -50%)',
              opacity: 0.5,
              fontStyle: 'italic',
            }}
          >
            <IconDisplay iconKey={draftSmarterPosition.icon} size={10} className="opacity-60" />
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
              {draftSmarterPosition.label}
            </span>
          </div>
        ) : null}
      </div> : null}
    </div>
  );
}
