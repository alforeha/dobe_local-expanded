import { useEffect, useMemo, useRef, useState } from 'react';
import { useBrainstormStore } from '../../../../../stores/useBrainstormStore';
import type { IdeaState, IdeaType, MainIdea } from '../../../../../types/brainstorm';
import {
  drawBrainstormCenterGlow,
  drawBrainstormConstellation,
  drawBrainstormIdeaSpokes,
  drawBrainstormNode,
  drawBrainstormWebBackground,
  drawStormBeam,
} from './brainstormDraw';
import { drawGeneralStormBackground } from './generalStormBackground';
import {
  flattenIdeaTree,
  fitScaleForBranches,
  getIdeaLayoutTree,
  getMainIdeaLayouts,
  type IdeaLayoutNode,
  type MainIdeaLayout,
} from './brainstormLayout';
import { hitTestIdea, hitTestMainIdea } from './brainstormInteraction';

interface GeneralStormCanvasProps {
  selectedStormId: string;
  selectedMainIdeaId: string | null;
  selectedIdeaId: string | null;
  onSelectMainIdea: (id: string | null) => void;
  onSelectIdea: (id: string | null) => void;
  addingMainIdea?: boolean;
  draftMainIdeaTitle?: string;
  draftMainIdeaState?: IdeaState;
  draftMainIdeaType?: IdeaType;
  draftCustomStateColor?: string;
  draftCustomColor?: string;
}

type Camera = {
  x: number;
  y: number;
  scale: number;
};

type BoundsNode = {
  x: number;
  y: number;
  radius: number;
};

const CAMERA_LERP = 0.2;

function worldToScreen(
  wx: number,
  wy: number,
  camera: Camera,
  canvasCenterX: number,
  canvasCenterY: number,
) {
  return {
    x: (wx - camera.x) * camera.scale + canvasCenterX,
    y: (wy - camera.y) * camera.scale + canvasCenterY,
  };
}

function collectBounds(nodes: BoundsNode[]) {
  if (nodes.length === 0) {
    return {
      minX: -180,
      maxX: 180,
      minY: -180,
      maxY: 180,
      centroidX: 0,
      centroidY: 0,
    };
  }

  const minX = Math.min(...nodes.map((node) => node.x - node.radius));
  const maxX = Math.max(...nodes.map((node) => node.x + node.radius));
  const minY = Math.min(...nodes.map((node) => node.y - node.radius));
  const maxY = Math.max(...nodes.map((node) => node.y + node.radius));
  const centroidX = nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length;
  const centroidY = nodes.reduce((sum, node) => sum + node.y, 0) / nodes.length;

  return {
    minX,
    maxX,
    minY,
    maxY,
    centroidX,
    centroidY,
  };
}

function buildHighlightIds(flatIdeas: IdeaLayoutNode[], selectedIdeaId: string | null) {
  if (!selectedIdeaId) {
    return new Set<string>();
  }

  const nodeById = new Map(flatIdeas.map((node) => [node.id, node]));
  const selectedNode = nodeById.get(selectedIdeaId);
  if (!selectedNode) {
    return new Set<string>();
  }

  const ids = new Set<string>([selectedNode.id]);
  selectedNode.children.forEach((child) => {
    ids.add(child.id);
  });

  let currentParentId = selectedNode.parentId;
  while (currentParentId) {
    ids.add(currentParentId);
    currentParentId = nodeById.get(currentParentId)?.parentId ?? null;
  }

  return ids;
}

export function GeneralStormCanvas({
  selectedStormId,
  selectedMainIdeaId,
  selectedIdeaId,
  onSelectMainIdea,
  onSelectIdea,
  addingMainIdea = false,
  draftMainIdeaTitle = '',
  draftMainIdeaState = 'open',
  draftMainIdeaType = 'insight',
  draftCustomStateColor = '#ffffff',
  draftCustomColor = '#ffffff',
}: GeneralStormCanvasProps) {
  const storms = useBrainstormStore((state) => state.storms);
  const storm = storms[selectedStormId] ?? null;
  const draftMainIdeaId = '__draft__';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, scale: 1 });
  const cameraTargetRef = useRef<Camera>({ x: 0, y: 0, scale: 1 });
  const mainIdeaLayoutsRef = useRef<MainIdeaLayout[]>([]);
  const draftMainIdeaLayoutRef = useRef<MainIdeaLayout | null>(null);
  const ideaTreesRef = useRef<Record<string, IdeaLayoutNode[]>>({});
  const allFlatIdeaLayoutsRef = useRef<IdeaLayoutNode[]>([]);
  const selectedMainIdeaIdRef = useRef<string | null>(selectedMainIdeaId);
  const selectedIdeaIdRef = useRef<string | null>(selectedIdeaId);
  const addingMainIdeaRef = useRef(addingMainIdea);
  const draftMainIdeaTitleRef = useRef(draftMainIdeaTitle);
  const draftMainIdeaStateRef = useRef(draftMainIdeaState);
  const draftMainIdeaTypeRef = useRef(draftMainIdeaType);
  const draftCustomStateColorRef = useRef(draftCustomStateColor);
  const draftCustomColorRef = useRef(draftCustomColor);
  const [visible, setVisible] = useState(false);

  const mainIdeas = useMemo(() => storm?.mainIdeas ?? {}, [storm]);
  const ideas = useMemo(() => storm?.ideas ?? {}, [storm]);

  useEffect(() => {
    selectedMainIdeaIdRef.current = selectedMainIdeaId;
  }, [selectedMainIdeaId]);

  useEffect(() => {
    selectedIdeaIdRef.current = selectedIdeaId;
  }, [selectedIdeaId]);

  useEffect(() => {
    addingMainIdeaRef.current = addingMainIdea;
  }, [addingMainIdea]);

  useEffect(() => {
    draftMainIdeaTitleRef.current = draftMainIdeaTitle;
  }, [draftMainIdeaTitle]);

  useEffect(() => {
    draftMainIdeaStateRef.current = draftMainIdeaState;
  }, [draftMainIdeaState]);

  useEffect(() => {
    draftMainIdeaTypeRef.current = draftMainIdeaType;
  }, [draftMainIdeaType]);

  useEffect(() => {
    draftCustomStateColorRef.current = draftCustomStateColor;
  }, [draftCustomStateColor]);

  useEffect(() => {
    draftCustomColorRef.current = draftCustomColor;
  }, [draftCustomColor]);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !storm) {
      return;
    }

    const parent = canvas.parentElement;
    if (!parent) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const canvasEl = canvas as HTMLCanvasElement;
    const parentEl = parent as HTMLElement;
    const context = ctx as CanvasRenderingContext2D;

    function resizeCanvas() {
      const rect = parentEl.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvasEl.width = Math.max(1, Math.floor(rect.width * dpr));
      canvasEl.height = Math.max(1, Math.floor(rect.height * dpr));
      canvasEl.style.width = `${rect.width}px`;
      canvasEl.style.height = `${rect.height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function updateCameraTarget(width: number, height: number, renderMainIdeas: Record<string, MainIdea>) {
      const mainLayouts = getMainIdeaLayouts(renderMainIdeas, 0, 0);
      const ideaTreesByMainId: Record<string, IdeaLayoutNode[]> = {};
      const allFlatIdeas: IdeaLayoutNode[] = [];

      mainLayouts.forEach((layout) => {
        const mainIdea = renderMainIdeas[layout.id];
        if (!mainIdea) {
          ideaTreesByMainId[layout.id] = [];
          return;
        }

        const tree = getIdeaLayoutTree(mainIdea, ideas, layout.x, layout.y, undefined, 0, 0);
        ideaTreesByMainId[layout.id] = tree;
        allFlatIdeas.push(...flattenIdeaTree(tree));
      });

      draftMainIdeaLayoutRef.current = mainLayouts.find((layout) => layout.id === draftMainIdeaId) ?? null;
      mainIdeaLayoutsRef.current = mainLayouts.filter((layout) => layout.id !== draftMainIdeaId);
      ideaTreesRef.current = ideaTreesByMainId;
      allFlatIdeaLayoutsRef.current = allFlatIdeas;

      const currentSelectedIdeaId = selectedIdeaIdRef.current;
      const currentSelectedMainIdeaId = selectedMainIdeaIdRef.current;
      const flatNodeById = new Map(allFlatIdeas.map((node) => [node.id, node]));
      const selectedNode = currentSelectedIdeaId ? flatNodeById.get(currentSelectedIdeaId) ?? null : null;

      let focusNodes: BoundsNode[] = [];

      if (selectedNode) {
        focusNodes = [selectedNode, ...selectedNode.children];
      } else if (currentSelectedMainIdeaId) {
        const selectedMainLayout = mainLayouts.find((layout) => layout.id === currentSelectedMainIdeaId) ?? null;
        const selectedTree = ideaTreesByMainId[currentSelectedMainIdeaId] ?? [];
        focusNodes = [
          ...(selectedMainLayout ? [selectedMainLayout] : []),
          ...flattenIdeaTree(selectedTree),
        ];
      } else {
        focusNodes = [...mainLayouts, ...allFlatIdeas];
      }

      const bounds = collectBounds(focusNodes);
      const branchRadius = Math.max(
        (bounds.maxX - bounds.minX) * 0.5,
        (bounds.maxY - bounds.minY) * 0.5,
        180,
      );

      cameraTargetRef.current = {
        x: bounds.centroidX,
        y: bounds.centroidY,
        scale: fitScaleForBranches(branchRadius, width, height),
      };

      if (startedAtRef.current === null) {
        cameraRef.current = { ...cameraTargetRef.current };
      }
    }

    function drawFrame(timestamp: number) {
      if (startedAtRef.current === null) {
        startedAtRef.current = timestamp;
      }

      const width = canvasEl.width / (window.devicePixelRatio || 1);
      const height = canvasEl.height / (window.devicePixelRatio || 1);
      const dpr = window.devicePixelRatio || 1;
      const canvasWidth = canvasEl.width / dpr;
      const canvasHeight = canvasEl.height / dpr;
      const canvasCenterX = width * 0.5;
      const canvasCenterY = height * 0.5;
      const elapsed = timestamp - startedAtRef.current;
      void elapsed;

      const phantom = addingMainIdeaRef.current ? {
        id: draftMainIdeaId,
        title: draftMainIdeaTitleRef.current ?? '',
        state: draftMainIdeaStateRef.current,
        type: draftMainIdeaTypeRef.current,
        customProperties: {
          stateColor: draftCustomStateColorRef.current,
          typeColor: draftCustomColorRef.current,
        },
        entries: [],
        ideas: [],
      } : null;
      const renderMainIdeas: Record<string, MainIdea> = phantom
        ? {
            ...mainIdeas,
            [draftMainIdeaId]: phantom,
          }
        : mainIdeas;

      updateCameraTarget(width, height, renderMainIdeas);

      cameraRef.current = {
        x: cameraRef.current.x + (cameraTargetRef.current.x - cameraRef.current.x) * CAMERA_LERP,
        y: cameraRef.current.y + (cameraTargetRef.current.y - cameraRef.current.y) * CAMERA_LERP,
        scale: cameraRef.current.scale + (cameraTargetRef.current.scale - cameraRef.current.scale) * CAMERA_LERP,
      };

      context.clearRect(0, 0, width, height);

      drawBrainstormCenterGlow(
        context,
        canvasCenterX,
        canvasCenterY,
        canvasWidth,
        canvasHeight,
        1,
      );
      [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].forEach((angle) => {
        drawStormBeam(
          context,
          canvasCenterX,
          canvasCenterY,
          angle,
          storm.category.color,
          1,
          canvasWidth,
          canvasHeight,
          'selected',
        );
      });
      if (storm.type === 'general') {
        drawGeneralStormBackground(
          context,
          canvasCenterX,
          canvasCenterY,
          storm.category.color,
          1,
          timestamp,
        );
      }

      context.save();
      context.translate(canvasCenterX, canvasCenterY);
      context.scale(cameraRef.current.scale, cameraRef.current.scale);
      context.translate(-cameraRef.current.x, -cameraRef.current.y);

      drawBrainstormWebBackground(context, 0, 0, timestamp, 0.4);
      drawBrainstormNode(context, 0, 0, 28, '', 1, false, true, 1);

      const currentSelectedIdeaId = selectedIdeaIdRef.current;
      const currentSelectedMainIdeaId = selectedMainIdeaIdRef.current;
      const effectiveSelectedMainIdeaId = currentSelectedIdeaId
        ? allFlatIdeaLayoutsRef.current.find((node) => node.id === currentSelectedIdeaId)?.mainIdeaId
          ?? currentSelectedMainIdeaId
        : currentSelectedMainIdeaId;
      const highlightedIds = buildHighlightIds(allFlatIdeaLayoutsRef.current, currentSelectedIdeaId);
      const constellationLayouts = [
        ...mainIdeaLayoutsRef.current,
        ...(addingMainIdeaRef.current && draftMainIdeaLayoutRef.current
          ? [draftMainIdeaLayoutRef.current]
          : []),
      ].map((layout) => ({
        ...layout,
        ...renderMainIdeas[layout.id],
      }));

      drawBrainstormConstellation(
        context,
        constellationLayouts,
        effectiveSelectedMainIdeaId,
        null,
        highlightedIds,
        currentSelectedIdeaId,
        timestamp,
        renderMainIdeas,
      );

      if (addingMainIdeaRef.current && draftMainIdeaLayoutRef.current) {
        const phantomLayout = draftMainIdeaLayoutRef.current;
        const phantomScreen = phantomLayout
          ? worldToScreen(
              phantomLayout.x,
              phantomLayout.y,
              cameraRef.current,
              canvasCenterX,
              canvasCenterY,
            )
          : null;

        if (addingMainIdeaRef.current && phantomLayout && phantomScreen) {
          context.save();
          context.setLineDash([4, 4]);
          context.strokeStyle = '#ffffff';
          context.globalAlpha = 0.6;
          context.lineWidth = 1.5;
          context.beginPath();
          context.arc(
            phantomScreen.x,
            phantomScreen.y,
            phantomLayout.radius * cameraRef.current.scale,
            0,
            Math.PI * 2,
          );
          context.stroke();
          context.restore();
        }
      }

      mainIdeaLayoutsRef.current.forEach((layout) => {
        const tree = ideaTreesRef.current[layout.id] ?? [];
        drawBrainstormIdeaSpokes(
          context,
          tree,
          ideas,
          highlightedIds,
          currentSelectedIdeaId,
          null,
          layout.x,
          layout.y,
          timestamp,
        );
      });

      context.restore();

      frameRef.current = requestAnimationFrame(drawFrame);
    }

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(parentEl);
    resizeCanvas();
    frameRef.current = requestAnimationFrame(drawFrame);

    return () => {
      observer.disconnect();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [storm, mainIdeas, ideas]);

  if (!storm) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-20 transition-opacity duration-300 ease-out"
      style={{ opacity: visible ? 1 : 0 }}
      onPointerDown={(event) => {
        const canvas = canvasRef.current;
        if (!canvas) {
          return;
        }

        const rect = canvas.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const canvasCenterX = rect.width * 0.5;
        const canvasCenterY = rect.height * 0.5;
        const toScreen = (wx: number, wy: number) => worldToScreen(
          wx,
          wy,
          cameraRef.current,
          canvasCenterX,
          canvasCenterY,
        );

        const hitMainIdeaId = hitTestMainIdea(
          screenX,
          screenY,
          mainIdeaLayoutsRef.current,
          toScreen,
        );
        if (hitMainIdeaId) {
          onSelectMainIdea(hitMainIdeaId);
          onSelectIdea(null);
          return;
        }

        const hitIdeaId = hitTestIdea(
          screenX,
          screenY,
          allFlatIdeaLayoutsRef.current,
          toScreen,
        );
        if (hitIdeaId) {
          const ownerMainIdeaId = allFlatIdeaLayoutsRef.current.find((layout) => layout.id === hitIdeaId)?.mainIdeaId ?? null;
          onSelectMainIdea(ownerMainIdeaId);
          onSelectIdea(hitIdeaId);
          return;
        }

        onSelectIdea(null);
        onSelectMainIdea(null);
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
      />
      <div className="absolute left-4 right-4 top-4 flex items-center justify-between pointer-events-none">
        <div className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-xs text-white/55 backdrop-blur-sm">
          {storm.name || 'General Storm'}
        </div>
      </div>
    </div>
  );
}
