import { useEffect, useMemo, useRef, useState } from 'react';
import { isImageIcon, resolveIcon } from '../../../../../constants/iconMap';
import { useBrainstormStore } from '../../../../../stores/useBrainstormStore';
import type { BrainstormEntry, BrainstormIdea, EntryState, EntryType, IdeaState, IdeaType, MainIdea } from '../../../../../types/brainstorm';
import {
  flattenIdeaTree,
  getIdeaLayoutTree,
  getMainIdeaLayouts,
  type IdeaLayoutNode,
  type MainIdeaLayout,
} from './brainstormLayout';
import { hitTestIdea, hitTestMainIdea } from './brainstormInteraction';
import {
  cr,
  getPhysicsRadius,
  initPhysicsNode,
  parentRestDistance,
  stepPhysics,
  type PhysicsIdeaNode,
} from './brainstormPhysics';
import { computeCameraTarget } from './stormCamera';
import { renderStormWorld } from './stormRenderer';

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
  addingEntry?: boolean;
  addingSubEntry?: boolean;
  subEntryParentId?: string | null;
  draftEntryState?: EntryState;
  draftEntryType?: EntryType;
  draftEntryCustomColor?: string;
  draftEntryCustomStateColor?: string;
}

type Camera = {
  x: number;
  y: number;
  scale: number;
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

function injectPhantomIntoEntries(
  entries: BrainstormEntry[],
  targetId: string,
  phantom: BrainstormEntry,
): { entries: BrainstormEntry[]; found: boolean } {
  let found = false;
  const updated = entries.map((e) => {
    if (e.id === targetId) {
      found = true;
      return { ...e, entries: [...e.entries, phantom] };
    }
    const child = injectPhantomIntoEntries(e.entries, targetId, phantom);
    if (child.found) {
      found = true;
      return { ...e, entries: child.entries };
    }
    return e;
  });
  return { entries: updated, found };
}

function countNestedEntries(idea: { entries: BrainstormEntry[] }): number {
  function countEntries(entries: BrainstormEntry[]): number {
    return entries.reduce((sum, entry) => sum + 1 + countEntries(entry.entries), 0);
  }
  return countEntries(idea.entries);
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
  addingEntry = false,
  addingSubEntry = false,
  subEntryParentId = null,
  draftEntryState = 'others',
  draftEntryType = 'others',
  draftEntryCustomColor = '#ffffff',
  draftEntryCustomStateColor = '#ffffff',
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
  const allFlatIdeaLayoutsRef = useRef<PhysicsIdeaNode[]>([]);
  // Stable origin anchor -- initialized once on mount, never re-seeded.
const originNodeRef = useRef<PhysicsIdeaNode>({
  id: '__origin__',
  parentId: null,
  rootIdentityId: '__origin__',
  frozen: false,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  freezeCountdown: 0,
  entryCount: 0,
  descendantCount: 0,
  immediateChildCount: 0,
  radius: 160,
  depth: 0,
  mainIdeaId: '__origin__',
  children: [] as IdeaLayoutNode[],
});
  const mainIdeaPhysicsRef = useRef<PhysicsIdeaNode[]>([]);
  const spawnQueueRef = useRef<string[]>([]);
  const spawnedIdsRef = useRef<Set<string>>(new Set());
  const isSettledRef = useRef<boolean>(true);
  const settleFrameCountRef = useRef<number>(0);
  const spawnFallbackFrameRef = useRef<number>(0);
  const rootsFrozenRef = useRef<boolean>(false);
  const rootFreezeCountdownRef = useRef<number>(0);
  // Topology signature: sorted join of all idea node ids. Used by the
  // main useEffect to distinguish node-count changes (full respawn) from
  // entry-content changes (entryCount refresh only, no position reset).
const topologySignatureRef = useRef<string>('__uninitialized__');
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
  const addingEntryRef = useRef(addingEntry);
  const addingSubEntryRef = useRef(addingSubEntry);
  const subEntryParentIdRef = useRef(subEntryParentId);
  const draftEntryStateRef = useRef(draftEntryState);
  const draftEntryTypeRef = useRef(draftEntryType);
  const draftEntryCustomColorRef = useRef(draftEntryCustomColor);
  const draftEntryCustomStateColorRef = useRef(draftEntryCustomStateColor);
  const [visible, setVisible] = useState(false);
  const [pillBlurbOpen, setPillBlurbOpen] = useState(false);
  const [ideaPillBlurbOpen, setIdeaPillBlurbOpen] = useState(false);
  const ideaPillBlurbOpenRef = useRef(false);

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
  const ancestorIdeas = useMemo<BrainstormIdea[]>(() => {
    if (!selectedIdeaId) return [];
    const result: BrainstormIdea[] = [];
    let parentId = ideas[selectedIdeaId]?.parentIdeaId ?? null;
    while (parentId && ideas[parentId]) {
      result.push(ideas[parentId]);
      parentId = ideas[parentId].parentIdeaId ?? null;
    }
    return result;
  }, [ideas, selectedIdeaId]);

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
    addingEntryRef.current = addingEntry;
  }, [addingEntry]);

  useEffect(() => {
    addingSubEntryRef.current = addingSubEntry;
  }, [addingSubEntry]);

  useEffect(() => {
    subEntryParentIdRef.current = subEntryParentId;
  }, [subEntryParentId]);

  useEffect(() => {
    draftEntryStateRef.current = draftEntryState;
  }, [draftEntryState]);

  useEffect(() => {
    draftEntryTypeRef.current = draftEntryType;
  }, [draftEntryType]);

  useEffect(() => {
    draftEntryCustomColorRef.current = draftEntryCustomColor;
  }, [draftEntryCustomColor]);

  useEffect(() => {
    draftEntryCustomStateColorRef.current = draftEntryCustomStateColor;
  }, [draftEntryCustomStateColor]);

  useEffect(() => {
    ideaPillBlurbOpenRef.current = ideaPillBlurbOpen;
  }, [ideaPillBlurbOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
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

    // Storm not yet loaded: start the animation loop so the canvas is live
    // (background, void, etc.) but skip all physics/topology work. When
    // storm populates the useEffect re-fires, this guard is skipped, and
    // the full tier-reset runs correctly.
    if (!storm) {
      function drawFrameNoStorm(timestamp: number) {
        if (startedAtRef.current === null) {
          startedAtRef.current = timestamp;
        }
        const dpr = window.devicePixelRatio || 1;
        const width = canvasEl.width / dpr;
        const height = canvasEl.height / dpr;
        context.clearRect(0, 0, width, height);
        frameRef.current = requestAnimationFrame(drawFrameNoStorm);
      }
      function resizeCanvasNoStorm() {
        const rect = parentEl.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvasEl.width = Math.max(1, Math.floor(rect.width * dpr));
        canvasEl.height = Math.max(1, Math.floor(rect.height * dpr));
        canvasEl.style.width = `${rect.width}px`;
        canvasEl.style.height = `${rect.height}px`;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      const observerNoStorm = new ResizeObserver(resizeCanvasNoStorm);
      observerNoStorm.observe(parentEl);
      resizeCanvasNoStorm();
      frameRef.current = requestAnimationFrame(drawFrameNoStorm);
      return () => {
        observerNoStorm.disconnect();
        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current);
        }
      };
    }

    function resizeCanvas() {
      const rect = parentEl.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvasEl.width = Math.max(1, Math.floor(rect.width * dpr));
      canvasEl.height = Math.max(1, Math.floor(rect.height * dpr));
      canvasEl.style.width = `${rect.width}px`;
      canvasEl.style.height = `${rect.height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function getLayoutParentId(node: IdeaLayoutNode) {
      const nodeWithParentIdea = node as IdeaLayoutNode & { parentIdeaId?: string | null };
      return nodeWithParentIdea.parentIdeaId ?? node.parentId ?? node.mainIdeaId;
    }

    function getSpawnedNodes() {
      return [
        ...mainIdeaPhysicsRef.current,
        ...allFlatIdeaLayoutsRef.current,
      ];
    }

    function computeDescendantCounts(allFlatIdeas: IdeaLayoutNode[]) {
      const descendantCounts = new Map<string, number>();
      const byDepthDesc = [...allFlatIdeas].sort((a, b) => b.depth - a.depth);

      allFlatIdeas.forEach((node) => {
        descendantCounts.set(node.id, 0);
      });

      byDepthDesc.forEach((node) => {
        const nodeDescendantCount = descendantCounts.get(node.id) ?? 0;
        const parentId = getLayoutParentId(node);
        descendantCounts.set(
          parentId,
          (descendantCounts.get(parentId) ?? 0) + nodeDescendantCount + 1,
        );
      });

      return descendantCounts;
    }

    function computeImmediateChildCounts(allFlatIdeas: IdeaLayoutNode[]) {
      const counts = new Map<string, number>();
      allFlatIdeas.forEach((node) => {
        counts.set(node.id, 0);
      });
      allFlatIdeas.forEach((node) => {
        const parentId = getLayoutParentId(node);
        counts.set(parentId, (counts.get(parentId) ?? 0) + 1);
      });
      return counts;
    }

    function hasSafeDistanceViolations() {
      const spawnedNodes = getSpawnedNodes();
      for (let i = 0; i < spawnedNodes.length; i++) {
        const nodeA = spawnedNodes[i];
        for (let j = i + 1; j < spawnedNodes.length; j++) {
          const nodeB = spawnedNodes[j];
          const dx = nodeA.x - nodeB.x;
          const dy = nodeA.y - nodeB.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < cr(nodeA) + cr(nodeB)) {
            return true;
          }
        }
      }
      return false;
    }

    function allNodesStill() {
      const spawnedNodes = getSpawnedNodes();
      const threshold = 0.5
        * Math.sqrt(spawnedNodes.length);
      return spawnedNodes.every(
        (node) => Math.sqrt(node.vx * node.vx + node.vy * node.vy) < threshold,
      );
    }

    function buildBfsSpawnQueue(mainLayouts: MainIdeaLayout[], allFlatIdeas: IdeaLayoutNode[]) {
      const queue: string[] = [];
      const childIdsByParentId = new Map<string, string[]>();

      allFlatIdeas.forEach((node) => {
        const parentId = getLayoutParentId(node);
        const childIds = childIdsByParentId.get(parentId);
        if (childIds === undefined) {
          childIdsByParentId.set(parentId, [node.id]);
        } else {
          childIds.push(node.id);
        }
      });

      const frontier = mainLayouts
        .filter((layout) => layout.id !== draftMainIdeaId)
        .map((layout) => layout.id);
      queue.push(...frontier);

      let currentLevel = frontier;
      while (currentLevel.length > 0) {
        const nextLevel: string[] = [];
        const childLists = currentLevel.map((parentId) => childIdsByParentId.get(parentId) ?? []);
        let childIndex = 0;
        let addedChild = true;
        while (addedChild) {
          addedChild = false;
          childLists.forEach((childIds) => {
            const childId = childIds[childIndex];
            if (childId !== undefined) {
              nextLevel.push(childId);
              addedChild = true;
            }
          });
          childIndex += 1;
        }
        queue.push(...nextLevel);
        currentLevel = nextLevel;
      }

      return queue;
    }

    function findPhysicsNode(id: string) {
      return (
        mainIdeaPhysicsRef.current.find((node) => node.id === id)
        ?? allFlatIdeaLayoutsRef.current.find((node) => node.id === id)
        ?? (id === '__origin__' ? originNodeRef.current : undefined)
      );
    }

    function refreshPhysicsNodeMetadata(
      renderMainIdeas: Record<string, MainIdea>,
      renderIdeas: Record<string, BrainstormIdea>,
      options?: {
        allMainLayoutIds?: Set<string>;
        allFlatIdeaIds?: Set<string>;
        flatIdeaById?: Map<string, IdeaLayoutNode>;
        descendantCountById?: Map<string, number>;
        immediateChildCountById?: Map<string, number>;
      },
    ) {
      const {
        allMainLayoutIds,
        allFlatIdeaIds,
        flatIdeaById,
        descendantCountById,
        immediateChildCountById,
      } = options ?? {};

      let unfrozeRootForDescendantChange = false;

      mainIdeaPhysicsRef.current = mainIdeaPhysicsRef.current
        .filter((node) => allMainLayoutIds === undefined || allMainLayoutIds.has(node.id))
        .map((node) => {
          const mainIdea = renderMainIdeas[node.id];
          const entryCount = mainIdea !== undefined ? countNestedEntries(mainIdea) : node.entryCount;
          const descendantCount = descendantCountById?.get(node.id) ?? node.descendantCount ?? 0;
          const immediateChildCount = immediateChildCountById?.get(node.id) ?? node.immediateChildCount ?? 0;
          const descendantCountChanged = descendantCount !== node.descendantCount
            || immediateChildCount !== node.immediateChildCount;
          if (descendantCountChanged) {
            unfrozeRootForDescendantChange = true;
          }
          return {
            ...node,
            entryCount,
            descendantCount,
            immediateChildCount,
            frozen: descendantCountChanged ? false : node.frozen,
            freezeCountdown: descendantCountChanged ? 120 : node.freezeCountdown,
            radius: getPhysicsRadius(entryCount),
          };
        });

      if (unfrozeRootForDescendantChange) {
        rootsFrozenRef.current = false;
      }

      allFlatIdeaLayoutsRef.current = allFlatIdeaLayoutsRef.current
        .filter((node) => allFlatIdeaIds === undefined || allFlatIdeaIds.has(node.id))
        .map((node) => {
          const idea = renderIdeas[node.id];
          const layoutNode = flatIdeaById?.get(node.id);
          const entryCount = idea !== undefined ? countNestedEntries(idea) : node.entryCount;
          const descendantCount = descendantCountById?.get(node.id) ?? node.descendantCount ?? 0;
          const immediateChildCount = immediateChildCountById?.get(node.id) ?? node.immediateChildCount ?? 0;
          const descendantCountChanged = descendantCount !== node.descendantCount
            || immediateChildCount !== node.immediateChildCount;
          return {
            ...node,
            parentId: layoutNode !== undefined ? getLayoutParentId(layoutNode) : node.parentId,
            entryCount,
            descendantCount,
            immediateChildCount,
            frozen: descendantCountChanged ? false : node.frozen,
            freezeCountdown: descendantCountChanged ? 120 : node.freezeCountdown,
          };
        });
    }

    function spawnNextQueuedNode(
      mainLayouts: MainIdeaLayout[],
      allFlatIdeas: IdeaLayoutNode[],
      renderMainIdeas: Record<string, MainIdea>,
      renderIdeas: Record<string, BrainstormIdea>,
    ) {
      const mainLayoutById = new Map(mainLayouts.map((layout) => [layout.id, layout]));
      const flatIdeaById = new Map(allFlatIdeas.map((node) => [node.id, node]));
      const descendantCountById = computeDescendantCounts(allFlatIdeas);
      const immediateChildCountById = computeImmediateChildCounts(allFlatIdeas);

      while (spawnQueueRef.current.length > 0) {
        const nextId = spawnQueueRef.current.shift();
        if (nextId === undefined || spawnedIdsRef.current.has(nextId)) {
          continue;
        }

        const mainLayout = mainLayoutById.get(nextId);
        if (mainLayout !== undefined && renderMainIdeas[nextId] !== undefined) {
          const mainIdea = renderMainIdeas[nextId];
          const entryCount = countNestedEntries(mainIdea);
          const descendantCount = descendantCountById.get(mainLayout.id) ?? 0;
          const immediateChildCount = immediateChildCountById.get(mainLayout.id) ?? 0;
          const rootSafeDistance = parentRestDistance(
            { entryCount, descendantCount, immediateChildCount },
            originNodeRef.current,
          );
          let dx = mainLayout.x;
          let dy = mainLayout.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 0.001) {
            dx = 0;
            dy = -1;
          } else {
            dx /= dist;
            dy /= dist;
          }
          const seeded = initPhysicsNode(
            {
              id: mainLayout.id,
              x: dx * rootSafeDistance,
              y: dy * rootSafeDistance,
              radius: getPhysicsRadius(entryCount),
              mainIdeaId: mainLayout.id,
              depth: 0,
              parentId: '__origin__',
              freezeCountdown: 0,
              descendantCount,
              immediateChildCount,
              children: [] as IdeaLayoutNode[],
            },
            entryCount,
            mainLayout.id,
          );
          mainIdeaPhysicsRef.current.push(seeded);
          spawnedIdsRef.current.add(nextId);
          settleFrameCountRef.current = 0;
          spawnFallbackFrameRef.current = 0;
          isSettledRef.current = false;
          const remainingRootIds = spawnQueueRef.current.filter((id) => mainLayoutById.has(id));
          if (remainingRootIds.length === 0) {
            rootFreezeCountdownRef.current = 180;
          }
          return;
        }

        const flatIdea = flatIdeaById.get(nextId);
        const idea = renderIdeas[nextId];
        if (flatIdea === undefined || idea === undefined) {
          continue;
        }

        const parentId = getLayoutParentId(flatIdea);
        const parentNode = findPhysicsNode(parentId);
        if (parentNode === undefined) {
          spawnQueueRef.current.unshift(nextId);
          return;
        }
        if (parentNode.freezeCountdown > 0) {
          spawnQueueRef.current.unshift(nextId);
          return;
        }

        const grandparentNode = parentNode.parentId !== null
          ? findPhysicsNode(parentNode.parentId)
          : originNodeRef.current;
        const directionSource = grandparentNode ?? originNodeRef.current;
        let dx = parentNode.x - directionSource.x;
        let dy = parentNode.y - directionSource.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.001) {
          dx = 0;
          dy = -1;
        } else {
          dx /= dist;
          dy /= dist;
        }

        const entryCount = countNestedEntries(idea);
        const descendantCount = descendantCountById.get(flatIdea.id) ?? 0;
        const immediateChildCount = immediateChildCountById.get(flatIdea.id) ?? 0;
        const safeDistance = parentRestDistance(
          { entryCount, descendantCount, immediateChildCount },
          parentNode,
        );
        const seeded = initPhysicsNode(
          {
            ...flatIdea,
            parentId,
            x: parentNode.x + dx * safeDistance,
            y: parentNode.y + dy * safeDistance,
            radius: getPhysicsRadius(entryCount),
            freezeCountdown: 180,
            descendantCount,
            immediateChildCount,
          },
          entryCount,
          flatIdea.mainIdeaId,
        );
        allFlatIdeaLayoutsRef.current.push(seeded);
        allFlatIdeaLayoutsRef.current = allFlatIdeaLayoutsRef.current.map((node) => (
          node.parentId === seeded.parentId && node.id !== seeded.id
            ? {
                ...node,
                frozen: false,
                freezeCountdown: Math.max(node.freezeCountdown, 60),
              }
            : node
        ));
        spawnedIdsRef.current.add(nextId);
        settleFrameCountRef.current = 0;
        spawnFallbackFrameRef.current = 0;
        isSettledRef.current = false;
        return;
      }
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
      const allMainLayouts = mainLayouts.filter((layout) => layout.id !== draftMainIdeaId);
      const currentIds = new Set([
        ...allMainLayouts.map((layout) => layout.id),
        ...allFlatIdeas.map((node) => node.id),
      ]);
      const allFlatIdeaIds = new Set(allFlatIdeas.map((node) => node.id));
      const allMainLayoutIds = new Set(allMainLayouts.map((layout) => layout.id));
      const flatIdeaById = new Map(allFlatIdeas.map((node) => [node.id, node]));
      const descendantCountById = computeDescendantCounts(allFlatIdeas);
      const immediateChildCountById = computeImmediateChildCounts(allFlatIdeas);

      refreshPhysicsNodeMetadata(renderMainIdeas, renderIdeas, {
        allMainLayoutIds,
        allFlatIdeaIds,
        flatIdeaById,
        descendantCountById,
        immediateChildCountById,
      });
      spawnedIdsRef.current = new Set(getSpawnedNodes().map((node) => node.id));
      const bfsIds = buildBfsSpawnQueue(allMainLayouts, allFlatIdeas);
      spawnQueueRef.current = bfsIds.filter(
        (id) => currentIds.has(id) && !spawnedIdsRef.current.has(id),
      );

      const frameSettled = !hasSafeDistanceViolations()
        && allNodesStill();
      if (frameSettled) {
        settleFrameCountRef.current += 1;
      } else {
        settleFrameCountRef.current = 0;
      }
      const remainingRootIds = spawnQueueRef.current.filter((id) =>
        allMainLayoutIds.has(id),
      );
      isSettledRef.current = settleFrameCountRef.current >= 10;
      if (!rootsFrozenRef.current && remainingRootIds.length === 0 && isSettledRef.current) {
        rootsFrozenRef.current = true;
        mainIdeaPhysicsRef.current = mainIdeaPhysicsRef.current.map((node) => ({
          ...node,
          frozen: true,
          vx: 0,
          vy: 0,
        }));
      }
      const shouldSpawnNext = spawnQueueRef.current.length > 0
        && (
          isSettledRef.current
          || spawnFallbackFrameRef.current >= 180
        );
      if (shouldSpawnNext) {
        spawnNextQueuedNode(allMainLayouts, allFlatIdeas, renderMainIdeas, renderIdeas);
      }

      // Camera framing for the draft child orb must use the physics-stepped
      // position (the same source the visible preview ring draws from) so the
      // camera centroid tracks where the orb actually is, not the static
      // layout coordinate. Fall back to the static layout entry only if the
      // physics ref has not yet seeded a node for the draft id.
      const draftChildIdeaId = '__draft_child__';
      const draftChildPhysicsNode = allFlatIdeaLayoutsRef.current.find((node) => node.id === draftChildIdeaId);
      const draftChildLayoutNode = allFlatIdeas.find((node) => node.id === draftChildIdeaId) ?? null;
      const draftChildNode = draftChildPhysicsNode ?? (
        draftChildLayoutNode
          ? {
              ...draftChildLayoutNode,
              rootIdentityId: draftChildLayoutNode.mainIdeaId,
              frozen: false,
              vx: 0,
              vy: 0,
              freezeCountdown: 0,
              entryCount: 0,
              descendantCount: 0,
              immediateChildCount: 0,
            }
          : null
      );

      cameraTargetRef.current = computeCameraTarget({
        width,
        height,
        mainIdeaNodes: mainIdeaPhysicsRef.current,
        childNodes: allFlatIdeaLayoutsRef.current,
        selectedIdeaId: selectedIdeaIdRef.current,
        selectedMainIdeaId: selectedMainIdeaIdRef.current,
        isAddingChildIdea: addingChildIdeaRef.current,
        isEditingChildIdea: editingChildIdeaRef.current,
        ideaPillBlurbOpen: ideaPillBlurbOpenRef.current,
        draftChildNode,
      });
    }

    function drawFrame(timestamp: number) {
      if (startedAtRef.current === null) {
        startedAtRef.current = timestamp;
      }
      spawnFallbackFrameRef.current += 1;

      const width = canvasEl.width / (window.devicePixelRatio || 1);
      const height = canvasEl.height / (window.devicePixelRatio || 1);
      const dpr = window.devicePixelRatio || 1;
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

      if (addingEntryRef.current && !addingSubEntryRef.current) {
        const phantomEntry: BrainstormEntry = {
          id: '__draft_entry__',
          content: '',
          state: draftEntryStateRef.current,
          type: draftEntryTypeRef.current,
          customProperties: {
            typeColor: draftEntryCustomColorRef.current,
            stateColor: draftEntryCustomStateColorRef.current,
          },
          entries: [],
          pointsTo: [],
        };

        if (currentSelectedIdeaId && renderIdeas[currentSelectedIdeaId]) {
          renderIdeas = {
            ...renderIdeas,
            [currentSelectedIdeaId]: {
              ...renderIdeas[currentSelectedIdeaId],
              entries: [...renderIdeas[currentSelectedIdeaId].entries, phantomEntry],
            },
          };
        } else if (currentSelectedMainIdeaId && nextRenderMainIdeas[currentSelectedMainIdeaId]) {
          nextRenderMainIdeas = {
            ...nextRenderMainIdeas,
            [currentSelectedMainIdeaId]: {
              ...nextRenderMainIdeas[currentSelectedMainIdeaId],
              entries: [...nextRenderMainIdeas[currentSelectedMainIdeaId].entries, phantomEntry],
            },
          };
        }
      }

      if (addingSubEntryRef.current && subEntryParentIdRef.current) {
        const phantomSubEntry: BrainstormEntry = {
          id: '__draft_sub_entry__',
          content: '',
          state: draftEntryStateRef.current,
          type: draftEntryTypeRef.current,
          customProperties: {
            typeColor: draftEntryCustomColorRef.current,
            stateColor: draftEntryCustomStateColorRef.current,
          },
          entries: [],
          pointsTo: [],
        };
        const parentEntryId = subEntryParentIdRef.current;
        let subInjected = false;
        const updatedIdeasForSub: Record<string, BrainstormIdea> = { ...renderIdeas };
        for (const ideaId of Object.keys(updatedIdeasForSub)) {
          const idea = updatedIdeasForSub[ideaId];
          const result = injectPhantomIntoEntries(idea.entries, parentEntryId, phantomSubEntry);
          if (result.found) {
            updatedIdeasForSub[ideaId] = { ...idea, entries: result.entries };
            subInjected = true;
            break;
          }
        }
        if (subInjected) {
          renderIdeas = updatedIdeasForSub;
        } else {
          const updatedMainIdeasForSub: Record<string, MainIdea> = { ...nextRenderMainIdeas };
          for (const mainIdeaId of Object.keys(updatedMainIdeasForSub)) {
            const mainIdea = updatedMainIdeasForSub[mainIdeaId];
            const result = injectPhantomIntoEntries(mainIdea.entries, parentEntryId, phantomSubEntry);
            if (result.found) {
              updatedMainIdeasForSub[mainIdeaId] = { ...mainIdea, entries: result.entries };
              nextRenderMainIdeas = updatedMainIdeasForSub;
              break;
            }
          }
        }
      }

      const shouldStep = getSpawnedNodes().length > 0;

      if (shouldStep) {
        // All three node groups advance together so they repel each other
        // correctly, then results are split back into their own refs.
        // Origin is always pinned to world 0,0 after the step.
        const rootStepNodes = rootsFrozenRef.current
          ? mainIdeaPhysicsRef.current.map((node) => ({
              ...node,
              parentId: '__origin__',
              frozen: true,
              vx: 0,
              vy: 0,
            }))
          : mainIdeaPhysicsRef.current;
        const mainIdeaIds = new Set(mainIdeaPhysicsRef.current.map((n) => n.id));
        const childIds = new Set(allFlatIdeaLayoutsRef.current.map((n) => n.id));
        const stepped = stepPhysics([
          originNodeRef.current,
          ...rootStepNodes,
          ...allFlatIdeaLayoutsRef.current,
        ]);
        const frozenRootPositions = new Map(
          mainIdeaPhysicsRef.current.map((n) => [n.id, { x: n.x, y: n.y }]),
        );
        mainIdeaPhysicsRef.current = stepped
          .filter((n) => mainIdeaIds.has(n.id))
          .map((node) => (
            rootsFrozenRef.current
              ? {
                  ...node,
                  parentId: '__origin__',
                  frozen: true,
                  vx: 0,
                  vy: 0,
                  x: frozenRootPositions.get(node.id)?.x ?? node.x,
                  y: frozenRootPositions.get(node.id)?.y ?? node.y,
                }
              : node
          ));
        allFlatIdeaLayoutsRef.current = stepped
          .filter((n) => childIds.has(n.id))
          .map((node) => (
            node.freezeCountdown === 0 && node.frozen === false
              ? {
                  ...node,
                  frozen: true,
                }
              : node
          ));
        // Sync the draft preview ring to the physics-stepped position
        // of __draft_child__ so the rendered ring matches the body
        // being simulated rather than the static layout coordinates.
        const draftChildPhysics = allFlatIdeaLayoutsRef.current.find(
          (n) => n.id === '__draft_child__',
        );
        if (
          draftChildPhysics !== undefined
          && draftChildIdeaLayoutRef.current !== null
        ) {
          draftChildIdeaLayoutRef.current = {
            ...draftChildIdeaLayoutRef.current,
            x: draftChildPhysics.x,
            y: draftChildPhysics.y,
          };
        }
        const steppedOrigin = stepped.find((n) => n.id === '__origin__');
        if (steppedOrigin !== undefined) {
          originNodeRef.current = { ...steppedOrigin, x: 0, y: 0, vx: 0, vy: 0, frozen: false, freezeCountdown: 0 };
        }
      }

      if (rootFreezeCountdownRef.current > 0 && !rootsFrozenRef.current) {
        rootFreezeCountdownRef.current -= 1;
        if (rootFreezeCountdownRef.current === 0) {
          rootsFrozenRef.current = true;
          mainIdeaPhysicsRef.current = mainIdeaPhysicsRef.current.map((node) => ({
            ...node,
            frozen: true,
            vx: 0,
            vy: 0,
          }));
        }
      }

      updateCameraTarget(width, height, nextRenderMainIdeas, renderIdeas);

      cameraRef.current = {
        x: cameraRef.current.x + (cameraTargetRef.current.x - cameraRef.current.x) * CAMERA_LERP,
        y: cameraRef.current.y + (cameraTargetRef.current.y - cameraRef.current.y) * CAMERA_LERP,
        scale: cameraRef.current.scale + (cameraTargetRef.current.scale - cameraRef.current.scale) * CAMERA_LERP,
      };

      const effectiveSelectedMainIdeaId = currentSelectedIdeaId
        ? allFlatIdeaLayoutsRef.current.find((node) => node.id === currentSelectedIdeaId)?.mainIdeaId
          ?? currentSelectedMainIdeaId
        : currentSelectedMainIdeaId;
      const highlightedIds = buildHighlightIds(
        allFlatIdeaLayoutsRef.current,
        effectiveSelectedMainIdeaId,
        currentSelectedIdeaId,
      );

      renderStormWorld(context, {
        camera: cameraRef.current,
        width,
        height,
        dpr,
        storm: {
          ...storm,
          mainIdeas: nextRenderMainIdeas,
          ideas: renderIdeas,
        },
        mainIdeaNodes: mainIdeaPhysicsRef.current,
        childNodes: allFlatIdeaLayoutsRef.current,
        mainIdeaLayouts: mainIdeaLayoutsRef.current,
        ideaTrees: ideaTreesRef.current,
        selectedIdeaId: currentSelectedIdeaId,
        selectedMainIdeaId: effectiveSelectedMainIdeaId,
        isAddingChildIdea: addingChildIdeaRef.current,
        isEditingChildIdea,
        draftMainIdeaLayout: addingMainIdeaRef.current ? draftMainIdeaLayoutRef.current : null,
        draftChildIdeaLayout: draftChildIdeaLayoutRef.current,
        highlightedIds,
        entryScrollAngle: entryScrollAngleRef.current,
        timestamp,
      });

      frameRef.current = requestAnimationFrame(drawFrame);
    }

    // Topology signature: sorted join of all main-idea and child-idea ids.
    // If only entry content changed (no ids added/removed) we skip the
    // full tier respawn and only refresh entryCount on existing nodes so
    // positions and velocities are preserved.
    const queueMainLayouts = getMainIdeaLayouts(mainIdeas, 0, 0);
    const queueFlatIdeas: IdeaLayoutNode[] = [];
    queueMainLayouts.forEach((layout) => {
      const mainIdea = mainIdeas[layout.id];
      if (mainIdea === undefined) {
        return;
      }
      queueFlatIdeas.push(...flattenIdeaTree(
        getIdeaLayoutTree(mainIdea, ideas, layout.x, layout.y, undefined, 0, 0, queueMainLayouts.length),
      ));
    });

    const newTopologySignature = [
      ...Object.keys(mainIdeas).sort(),
      ...Object.keys(ideas).sort(),
    ].join('|');

    if (newTopologySignature === topologySignatureRef.current) {
      // Non-topology change (e.g. entry save). Refresh entryCount on all
      // existing physics nodes without disturbing positions or velocities.
      refreshPhysicsNodeMetadata(mainIdeas, ideas, {
        descendantCountById: computeDescendantCounts(queueFlatIdeas),
        immediateChildCountById: computeImmediateChildCounts(queueFlatIdeas),
      });
      resizeCanvas();
      frameRef.current = requestAnimationFrame(drawFrame);
      return () => {
        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current);
        }
      };
    }
    const isInitialTopology = topologySignatureRef.current === '__uninitialized__';
    topologySignatureRef.current = newTopologySignature;
    allFlatIdeaLayoutsRef.current = allFlatIdeaLayoutsRef.current.map((node) => ({
      ...node,
      frozen: false,
    }));

    const currentTopologyIds = new Set([
      ...queueMainLayouts
        .filter((layout) => layout.id !== draftMainIdeaId)
        .map((layout) => layout.id),
      ...queueFlatIdeas.map((node) => node.id),
    ]);
    const bfsQueue = buildBfsSpawnQueue(queueMainLayouts, queueFlatIdeas);
    const nextRootIds = new Set(
      queueMainLayouts
        .filter((layout) => layout.id !== draftMainIdeaId)
        .map((layout) => layout.id),
    );
    const currentRootIds = new Set(mainIdeaPhysicsRef.current.map((node) => node.id));
    const rootTopologyChanged = nextRootIds.size !== currentRootIds.size
      || [...nextRootIds].some((id) => !currentRootIds.has(id));

    if (isInitialTopology) {
      spawnQueueRef.current = bfsQueue;
      spawnedIdsRef.current = new Set();
      isSettledRef.current = true;
      settleFrameCountRef.current = 0;
      spawnFallbackFrameRef.current = 0;
      rootsFrozenRef.current = false;
      rootFreezeCountdownRef.current = 0;
      mainIdeaPhysicsRef.current = [];
      allFlatIdeaLayoutsRef.current = [];
    } else {
      if (rootTopologyChanged) {
        rootsFrozenRef.current = false;
        rootFreezeCountdownRef.current = 0;
        mainIdeaPhysicsRef.current = mainIdeaPhysicsRef.current.map((node) => ({
          ...node,
          frozen: false,
        }));
      }
      mainIdeaPhysicsRef.current = mainIdeaPhysicsRef.current.filter((node) => currentTopologyIds.has(node.id));
      allFlatIdeaLayoutsRef.current = allFlatIdeaLayoutsRef.current.filter((node) => currentTopologyIds.has(node.id));
      spawnedIdsRef.current = new Set(getSpawnedNodes().map((node) => node.id));
      spawnQueueRef.current = bfsQueue.filter(
        (id) => currentTopologyIds.has(id) && !spawnedIdsRef.current.has(id),
      );
      
      isSettledRef.current = settleFrameCountRef.current >= 10;
      if (spawnQueueRef.current.length === 0) {
        spawnFallbackFrameRef.current = 0;
      }
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
          mainIdeaPhysicsRef.current,
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
                    {selectedIdeaId && ancestorIdeas.length > 0 ? (
                      ancestorIdeas.map((ancestor) => {
                        const ancestorIcon = resolveIcon(`idea-${ancestor.type}`);
                        return (
                          <div key={ancestor.id} className="flex items-center gap-2">
                            {isImageIcon(ancestorIcon) ? (
                              <img
                                src={ancestorIcon}
                                alt=""
                                className="h-3.5 w-3.5 shrink-0 object-contain"
                              />
                            ) : (
                              <span className="text-xs leading-none">{ancestorIcon}</span>
                            )}
                            <span>{ancestor.title}</span>
                          </div>
                        );
                      })
                    ) : null}
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
