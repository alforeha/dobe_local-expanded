import { useEffect, useMemo, useRef, useState } from 'react';
import { isImageIcon, resolveIcon } from '../../../../../constants/iconMap';
import { useBrainstormStore } from '../../../../../stores/useBrainstormStore';
import type { BrainstormIdea, IdeaState, IdeaType, MainIdea } from '../../../../../types/brainstorm';
import {
  drawBrainstormCenterGlow,
  drawBrainstormConstellation,
  drawBrainstormIdeaSpokes,
  drawBrainstormNode,
  drawStormBeam,
} from './brainstormDraw';
import { drawGeneralStormBackground, drawGeneralVoidBackground } from './generalStormBackground';
import {
  BRAINSTORM_FIT_PADDING,
  flattenIdeaTree,
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
  entryScrollAngle?: number;
  onSelectMainIdea: (id: string | null) => void;
  onSelectIdea: (id: string | null) => void;
  addingMainIdea?: boolean;
  draftMainIdeaTitle?: string;
  draftMainIdeaState?: IdeaState;
  draftMainIdeaType?: IdeaType;
  draftCustomStateColor?: string;
  draftCustomColor?: string;
  addingChildIdea?: boolean;
  editingChildIdea?: boolean;
  draftChildIdeaState?: IdeaState;
  draftChildIdeaType?: IdeaType;
  draftChildIdeaCustomColor?: string;
  draftChildIdeaCustomStateColor?: string;
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
const IDEA_STATE_COLORS = {
  open: '#4ade80',
  'in-progress': '#60a5fa',
  resolved: '#2dd4bf',
  parked: '#9ca3af',
  others: '#ffffff',
} as const;

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

function collectSubtreeIds(flatIdeas: IdeaLayoutNode[], rootId: string) {
  const ids = new Set<string>([rootId]);
  let added = true;

  while (added) {
    added = false;
    flatIdeas.forEach((node) => {
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id);
        added = true;
      }
    });
  }

  return ids;
}

function buildHighlightIds(
  flatIdeas: IdeaLayoutNode[],
  selectedMainIdeaId: string | null,
  selectedIdeaId: string | null,
) {
  if (selectedIdeaId) {
    const nodeById = new Map(flatIdeas.map((node) => [node.id, node]));
    const selectedNode = nodeById.get(selectedIdeaId);
    if (!selectedNode) {
      return new Set<string>();
    }

    const ids = collectSubtreeIds(flatIdeas, selectedNode.id);

    let currentParentId = selectedNode.parentId;
    while (currentParentId) {
      ids.add(currentParentId);
      currentParentId = nodeById.get(currentParentId)?.parentId ?? null;
    }

    return ids;
  }

  if (!selectedMainIdeaId) {
    return new Set<string>();
  }

  return new Set(
    flatIdeas
      .filter((node) => node.mainIdeaId === selectedMainIdeaId)
      .map((node) => node.id),
  );
}

export function GeneralStormCanvas({
  selectedStormId,
  selectedMainIdeaId,
  selectedIdeaId,
  entryScrollAngle = 0,
  onSelectMainIdea,
  onSelectIdea,
  addingMainIdea = false,
  draftMainIdeaTitle = '',
  draftMainIdeaState = 'open',
  draftMainIdeaType = 'insight',
  draftCustomStateColor = '#ffffff',
  draftCustomColor = '#ffffff',
  addingChildIdea = false,
  editingChildIdea = false,
  draftChildIdeaState = 'open',
  draftChildIdeaType = 'insight',
  draftChildIdeaCustomColor = '#ffffff',
  draftChildIdeaCustomStateColor = '#ffffff',
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
  const draftChildIdeaLayoutRef = useRef<IdeaLayoutNode | null>(null);
  const ideaTreesRef = useRef<Record<string, IdeaLayoutNode[]>>({});
  const allFlatIdeaLayoutsRef = useRef<IdeaLayoutNode[]>([]);
  const selectedMainIdeaIdRef = useRef<string | null>(selectedMainIdeaId);
  const selectedIdeaIdRef = useRef<string | null>(selectedIdeaId);
  const entryScrollAngleRef = useRef(entryScrollAngle);
  const addingMainIdeaRef = useRef(addingMainIdea);
  const addingChildIdeaRef = useRef(addingChildIdea);
  const editingChildIdeaRef = useRef(editingChildIdea);
  const draftMainIdeaTitleRef = useRef(draftMainIdeaTitle);
  const draftMainIdeaStateRef = useRef(draftMainIdeaState);
  const draftMainIdeaTypeRef = useRef(draftMainIdeaType);
  const draftCustomStateColorRef = useRef(draftCustomStateColor);
  const draftCustomColorRef = useRef(draftCustomColor);
  const draftChildIdeaStateRef = useRef(draftChildIdeaState);
  const draftChildIdeaTypeRef = useRef(draftChildIdeaType);
  const draftChildIdeaCustomColorRef = useRef(draftChildIdeaCustomColor);
  const draftChildIdeaCustomStateColorRef = useRef(draftChildIdeaCustomStateColor);
  const [visible, setVisible] = useState(false);
  const [pillBlurbOpen, setPillBlurbOpen] = useState(false);
  const [ideaPillBlurbOpen, setIdeaPillBlurbOpen] = useState(false);

  const mainIdeas = useMemo(() => storm?.mainIdeas ?? {}, [storm]);
  const ideas = useMemo(() => storm?.ideas ?? {}, [storm]);
  const stormTypeIcon = useMemo(() => resolveIcon(`storm-${storm?.type ?? 'others'}`), [storm?.type]);
  const selectedPillIdea = useMemo(
    () => (selectedIdeaId ? ideas[selectedIdeaId] ?? null : selectedMainIdeaId ? mainIdeas[selectedMainIdeaId] ?? null : null),
    [ideas, mainIdeas, selectedIdeaId, selectedMainIdeaId],
  );
  const selectedPillIcon = useMemo(
    () => (selectedPillIdea ? resolveIcon(`idea-${selectedPillIdea.type}`) : ''),
    [selectedPillIdea],
  );
  const selectedPillBorderColor = useMemo(
    () => selectedPillIdea?.customProperties?.stateColor ?? IDEA_STATE_COLORS[selectedPillIdea?.state ?? 'others'] ?? 'rgba(255,255,255,0.1)',
    [selectedPillIdea],
  );
  const selectedPillMainIdea = useMemo(() => {
    if (selectedIdeaId) {
      return Object.values(mainIdeas).find((mainIdea) => mainIdea.ideas.includes(selectedIdeaId)) ?? null;
    }
    if (selectedMainIdeaId) {
      return mainIdeas[selectedMainIdeaId] ?? null;
    }
    return null;
  }, [mainIdeas, selectedIdeaId, selectedMainIdeaId]);
  const selectedPillMainIdeaIcon = useMemo(
    () => (selectedPillMainIdea ? resolveIcon(`idea-${selectedPillMainIdea.type}`) : ''),
    [selectedPillMainIdea],
  );

  useEffect(() => {
    selectedMainIdeaIdRef.current = selectedMainIdeaId;
  }, [selectedMainIdeaId]);

  useEffect(() => {
    selectedIdeaIdRef.current = selectedIdeaId;
  }, [selectedIdeaId]);

  useEffect(() => {
    entryScrollAngleRef.current = entryScrollAngle;
  }, [entryScrollAngle]);

  useEffect(() => {
    addingMainIdeaRef.current = addingMainIdea;
  }, [addingMainIdea]);

  useEffect(() => {
    addingChildIdeaRef.current = addingChildIdea;
  }, [addingChildIdea]);

  useEffect(() => {
    editingChildIdeaRef.current = editingChildIdea;
  }, [editingChildIdea]);

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
    draftChildIdeaStateRef.current = draftChildIdeaState;
  }, [draftChildIdeaState]);

  useEffect(() => {
    draftChildIdeaTypeRef.current = draftChildIdeaType;
  }, [draftChildIdeaType]);

  useEffect(() => {
    draftChildIdeaCustomColorRef.current = draftChildIdeaCustomColor;
  }, [draftChildIdeaCustomColor]);

  useEffect(() => {
    draftChildIdeaCustomStateColorRef.current = draftChildIdeaCustomStateColor;
  }, [draftChildIdeaCustomStateColor]);

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

    function updateCameraTarget(
      width: number,
      height: number,
      renderMainIdeas: Record<string, MainIdea>,
      renderIdeas: Record<string, BrainstormIdea>,
    ) {
      const mainLayouts = getMainIdeaLayouts(renderMainIdeas, 0, 0);
      const ideaTreesByMainId: Record<string, IdeaLayoutNode[]> = {};
      const allFlatIdeas: IdeaLayoutNode[] = [];

      mainLayouts.forEach((layout) => {
        const mainIdea = renderMainIdeas[layout.id];
        if (!mainIdea) {
          ideaTreesByMainId[layout.id] = [];
          return;
        }

        const tree = getIdeaLayoutTree(mainIdea, renderIdeas, layout.x, layout.y, undefined, 0, 0, mainLayouts.length);
        ideaTreesByMainId[layout.id] = tree;
        allFlatIdeas.push(...flattenIdeaTree(tree));
      });

      draftMainIdeaLayoutRef.current = mainLayouts.find((layout) => layout.id === draftMainIdeaId) ?? null;
      draftChildIdeaLayoutRef.current = allFlatIdeas.find((layout) => layout.id === '__draft_child__') ?? null;
      mainIdeaLayoutsRef.current = mainLayouts.filter((layout) => layout.id !== draftMainIdeaId);
      ideaTreesRef.current = ideaTreesByMainId;
      allFlatIdeaLayoutsRef.current = allFlatIdeas;

      const currentSelectedIdeaId = selectedIdeaIdRef.current;
      const currentSelectedMainIdeaId = selectedMainIdeaIdRef.current;
      const flatNodeById = new Map(allFlatIdeas.map((node) => [node.id, node]));
      const selectedNode = currentSelectedIdeaId ? flatNodeById.get(currentSelectedIdeaId) ?? null : null;
      const isEditingChildIdea = editingChildIdeaRef.current;
      const isAddingChildIdea = addingChildIdeaRef.current;
      const draftChildNode = allFlatIdeas.find((node) => node.id === '__draft_child__') ?? null;

      let focusNodes: BoundsNode[] = [];

      if (isAddingChildIdea && selectedNode) {
        focusNodes = [
          selectedNode,
          ...(draftChildNode ? [draftChildNode] : []),
        ];
      } else if (isAddingChildIdea && currentSelectedMainIdeaId) {
        const selectedMainLayout = mainLayouts.find((layout) => layout.id === currentSelectedMainIdeaId) ?? null;
        focusNodes = [
          ...(selectedMainLayout ? [selectedMainLayout] : []),
          ...(draftChildNode ? [draftChildNode] : []),
        ];
      } else if (isEditingChildIdea && selectedNode) {
        focusNodes = [
          selectedNode,
          ...allFlatIdeas.filter((node) => node.parentId === selectedNode.id),
        ];
      } else if (isEditingChildIdea && currentSelectedMainIdeaId) {
        const selectedMainLayout = mainLayouts.find((layout) => layout.id === currentSelectedMainIdeaId) ?? null;
        const immediateChildren = allFlatIdeas.filter(
          (node) => node.mainIdeaId === currentSelectedMainIdeaId && node.parentId === null,
        );
        focusNodes = [
          ...(selectedMainLayout ? [selectedMainLayout] : []),
          ...immediateChildren,
        ];
      } else if (selectedNode) {
        const subtreeIds = collectSubtreeIds(allFlatIdeas, selectedNode.id);
        focusNodes = allFlatIdeas.filter((node) => subtreeIds.has(node.id));
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
      const padding = BRAINSTORM_FIT_PADDING ?? 0.8;
      let targetScale = 1;

      if (focusNodes.length === 1) {
        const fitScale = Math.min(
          (width * padding) / 240,
          (height * padding) / 240,
          2.5,
        );
        targetScale = Math.max(0.15, fitScale);
      } else {
        const boundsWidth = bounds.maxX - bounds.minX;
        const boundsHeight = bounds.maxY - bounds.minY;
        const scaleX = (width * padding) / Math.max(1, boundsWidth);
        const scaleY = (height * padding) / Math.max(1, boundsHeight);
        const fitScale = Math.min(scaleX, scaleY, 2.5);
        targetScale = Math.max(0.15, fitScale);
      }

      cameraTargetRef.current = {
        x: bounds.centroidX,
        y: bounds.centroidY,
        scale: targetScale,
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
      const currentSelectedIdeaId = selectedIdeaIdRef.current;
      const currentSelectedMainIdeaId = selectedMainIdeaIdRef.current;
      const isEditingChildIdea = editingChildIdeaRef.current;

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
      const draftChildIdeaId = '__draft_child__';
      let renderIdeas: Record<string, BrainstormIdea> = ideas;
      let nextRenderMainIdeas = renderMainIdeas;

      if (isEditingChildIdea) {
        if (currentSelectedIdeaId && ideas[currentSelectedIdeaId]) {
          renderIdeas = {
            ...renderIdeas,
            [currentSelectedIdeaId]: {
              ...renderIdeas[currentSelectedIdeaId],
              type: draftChildIdeaTypeRef.current,
              state: draftChildIdeaStateRef.current,
              customProperties: {
                ...renderIdeas[currentSelectedIdeaId].customProperties,
                typeColor: draftChildIdeaCustomColorRef.current,
                stateColor: draftChildIdeaCustomStateColorRef.current,
              },
            },
          };
        } else if (currentSelectedMainIdeaId && nextRenderMainIdeas[currentSelectedMainIdeaId]) {
          nextRenderMainIdeas = {
            ...nextRenderMainIdeas,
            [currentSelectedMainIdeaId]: {
              ...nextRenderMainIdeas[currentSelectedMainIdeaId],
              type: draftChildIdeaTypeRef.current,
              state: draftChildIdeaStateRef.current,
              customProperties: {
                ...nextRenderMainIdeas[currentSelectedMainIdeaId].customProperties,
                typeColor: draftChildIdeaCustomColorRef.current,
                stateColor: draftChildIdeaCustomStateColorRef.current,
              },
            },
          };
        }
      }

      if (addingChildIdeaRef.current && !isEditingChildIdea && (currentSelectedMainIdeaId || currentSelectedIdeaId)) {
        const selectedIdea = currentSelectedIdeaId ? ideas[currentSelectedIdeaId] ?? null : null;
        const ownerMainIdeaId = selectedIdea?.mainIdeaId ?? currentSelectedMainIdeaId ?? '';
        const phantomChildIdea: BrainstormIdea = {
          id: draftChildIdeaId,
          title: '',
          state: draftChildIdeaStateRef.current,
          type: draftChildIdeaTypeRef.current,
          customProperties: {
            typeColor: draftChildIdeaCustomColorRef.current,
            stateColor: draftChildIdeaCustomStateColorRef.current,
          },
          entries: [],
          ideas: [],
          pointsTo: [],
          parentIdeaId: currentSelectedIdeaId ?? null,
          mainIdeaId: ownerMainIdeaId,
        };

        renderIdeas = {
          ...ideas,
          [draftChildIdeaId]: phantomChildIdea,
        };

        if (currentSelectedIdeaId && selectedIdea) {
          renderIdeas[currentSelectedIdeaId] = {
            ...selectedIdea,
            ideas: [...selectedIdea.ideas, draftChildIdeaId],
          };
        } else if (currentSelectedMainIdeaId && nextRenderMainIdeas[currentSelectedMainIdeaId]) {
          nextRenderMainIdeas = {
            ...nextRenderMainIdeas,
            [currentSelectedMainIdeaId]: {
              ...nextRenderMainIdeas[currentSelectedMainIdeaId],
              ideas: [...nextRenderMainIdeas[currentSelectedMainIdeaId].ideas, draftChildIdeaId],
            },
          };
        }
      }

      updateCameraTarget(width, height, nextRenderMainIdeas, renderIdeas);

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

      if (!canvas) {
        return;
      }

      drawGeneralVoidBackground(
        context,
        canvas.width / dpr,
        canvas.height / dpr,
        0.4,
      );
      drawBrainstormNode(context, 0, 0, 28, '', 1, false, true, 1);

      const effectiveSelectedMainIdeaId = currentSelectedIdeaId
        ? allFlatIdeaLayoutsRef.current.find((node) => node.id === currentSelectedIdeaId)?.mainIdeaId
          ?? currentSelectedMainIdeaId
        : currentSelectedMainIdeaId;
      const highlightedIds = buildHighlightIds(
        allFlatIdeaLayoutsRef.current,
        effectiveSelectedMainIdeaId,
        currentSelectedIdeaId,
      );
      const constellationLayouts = [
        ...mainIdeaLayoutsRef.current,
        ...(addingMainIdeaRef.current && draftMainIdeaLayoutRef.current
          ? [draftMainIdeaLayoutRef.current]
          : []),
      ].map((layout) => ({
        ...layout,
        ...nextRenderMainIdeas[layout.id],
      }));

      drawBrainstormConstellation(
        context,
        constellationLayouts,
        effectiveSelectedMainIdeaId,
        null,
        highlightedIds,
        currentSelectedIdeaId,
        timestamp,
        nextRenderMainIdeas,
      );

      if (addingMainIdeaRef.current && draftMainIdeaLayoutRef.current) {
        const phantomLayout = draftMainIdeaLayoutRef.current;

        context.save();
        context.setLineDash([4, 4]);
        context.strokeStyle = '#ffffff';
        context.globalAlpha = 0.6;
        context.lineWidth = 1.5 / cameraRef.current.scale;
        context.beginPath();
        context.arc(
          phantomLayout.x,
          phantomLayout.y,
          phantomLayout.radius,
          0,
          Math.PI * 2,
        );
        context.stroke();
        context.restore();
      }

      mainIdeaLayoutsRef.current.forEach((layout) => {
        const tree = ideaTreesRef.current[layout.id] ?? [];
        drawBrainstormIdeaSpokes(
          context,
          tree,
          renderIdeas,
          highlightedIds,
          currentSelectedIdeaId,
          null,
          layout.x,
          layout.y,
          timestamp,
          entryScrollAngleRef.current,
        );
      });

      if (addingChildIdeaRef.current && draftChildIdeaLayoutRef.current) {
        const phantomLayout = draftChildIdeaLayoutRef.current;

        context.save();
        context.setLineDash([4, 4]);
        context.strokeStyle = '#ffffff';
        context.globalAlpha = 0.6;
        context.lineWidth = 1.5 / cameraRef.current.scale;
        context.beginPath();
        context.arc(
          phantomLayout.x,
          phantomLayout.y,
          phantomLayout.radius,
          0,
          Math.PI * 2,
        );
        context.stroke();
        context.restore();
      }

      if (isEditingChildIdea) {
        const targetIdeaLayout = currentSelectedIdeaId
          ? allFlatIdeaLayoutsRef.current.find((node) => node.id === currentSelectedIdeaId) ?? null
          : null;
        const targetMainIdeaLayout = currentSelectedIdeaId
          ? null
          : currentSelectedMainIdeaId
            ? mainIdeaLayoutsRef.current.find((layout) => layout.id === currentSelectedMainIdeaId) ?? null
            : null;
        const editingLayout = targetIdeaLayout ?? targetMainIdeaLayout;

        if (editingLayout) {
          context.save();
          context.setLineDash([4, 4]);
          context.strokeStyle = '#ffffff';
          context.globalAlpha = 0.6;
          context.lineWidth = 1.5 / cameraRef.current.scale;
          context.beginPath();
          context.arc(
            editingLayout.x,
            editingLayout.y,
            editingLayout.radius,
            0,
            Math.PI * 2,
          );
          context.stroke();
          context.restore();
        }
      }

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
      onClick={() => {
        setPillBlurbOpen(false);
        setIdeaPillBlurbOpen(false);
      }}
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
          setIdeaPillBlurbOpen(false);
          onSelectMainIdea(hitMainIdeaId);
          onSelectIdea(null);
          return;
        }

        const hitIdeaId = hitTestIdea(
          screenX,
          screenY,
          allFlatIdeaLayoutsRef.current.filter((layout) => layout.id !== '__draft_child__'),
          toScreen,
        );
        if (hitIdeaId) {
          const ownerMainIdeaId = allFlatIdeaLayoutsRef.current.find((layout) => layout.id === hitIdeaId)?.mainIdeaId ?? null;
          setIdeaPillBlurbOpen(false);
          onSelectMainIdea(ownerMainIdeaId);
          onSelectIdea(hitIdeaId);
          return;
        }

        setIdeaPillBlurbOpen(false);
        onSelectIdea(null);
        onSelectMainIdea(null);
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
      />
      <div className="absolute left-4 right-4 top-4 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto">
          {selectedIdeaId || selectedMainIdeaId ? (
            selectedPillIdea ? (
              <>
                <button
                  type="button"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setIdeaPillBlurbOpen((open) => !open);
                  }}
                  className="flex items-center gap-2 rounded-full bg-black/35 px-3 py-1 text-xs text-white/55 backdrop-blur-sm"
                  style={{ border: `1.5px solid ${selectedPillBorderColor}` }}
                >
                  {isImageIcon(selectedPillIcon) ? (
                    <img
                      src={selectedPillIcon}
                      alt=""
                      className="h-3.5 w-3.5 shrink-0 object-contain"
                    />
                  ) : (
                    <span className="text-xs leading-none">{selectedPillIcon}</span>
                  )}
                  <span>{selectedPillIdea.title}</span>
                </button>
                {ideaPillBlurbOpen ? (
                  <div
                    className="mt-2 flex flex-col gap-2 rounded-lg px-3 py-2 text-xs text-white/70 backdrop-blur-sm"
                    style={{
                      backgroundColor: `${storm.category.color}26`,
                      border: `1px solid ${storm.category.color}`,
                      maxHeight: '40vh',
                      overflowY: 'auto',
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    {selectedIdeaId && selectedPillMainIdea ? (
                      <div className="flex items-center gap-2">
                        {isImageIcon(selectedPillMainIdeaIcon) ? (
                          <img
                            src={selectedPillMainIdeaIcon}
                            alt=""
                            className="h-3.5 w-3.5 shrink-0 object-contain"
                          />
                        ) : (
                          <span className="text-xs leading-none">{selectedPillMainIdeaIcon}</span>
                        )}
                        <span>{selectedPillMainIdea.title}</span>
                      </div>
                    ) : null}
                    <div className="flex items-center gap-2">
                      {isImageIcon(stormTypeIcon) ? (
                        <img
                          src={stormTypeIcon}
                          alt=""
                          className="h-3.5 w-3.5 shrink-0 object-contain"
                        />
                      ) : (
                        <span className="text-xs leading-none">{stormTypeIcon}</span>
                      )}
                      <span>{storm.name || 'General Storm'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: storm.category.color }}
                      />
                      <span>{storm.category.name}</span>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null
          ) : (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setPillBlurbOpen((open) => !open);
                }}
                className="flex items-center gap-2 rounded-full bg-black/35 px-3 py-1 text-xs text-white/55 backdrop-blur-sm"
                style={{ border: `1.5px solid ${storm.category.color}` }}
              >
                {isImageIcon(stormTypeIcon) ? (
                  <img
                    src={stormTypeIcon}
                    alt=""
                    className="h-3.5 w-3.5 shrink-0 object-contain"
                  />
                ) : (
                  <span className="text-xs leading-none">{stormTypeIcon}</span>
                )}
                <span>{storm.name || 'General Storm'}</span>
              </button>
              {pillBlurbOpen ? (
                <div
                  className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/70 backdrop-blur-sm"
                  style={{
                    backgroundColor: `${storm.category.color}26`,
                    border: `1px solid ${storm.category.color}`,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: storm.category.color }}
                  />
                  <span>{storm.category.name}</span>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
