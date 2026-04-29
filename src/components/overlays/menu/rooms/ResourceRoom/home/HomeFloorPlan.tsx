import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { CUSTOM_ITEM_TEMPLATE_PREFIX, getItemTaskTemplateMeta } from '../../../../../../coach/ItemLibrary';
import { taskTemplateLibrary } from '../../../../../../coach';
import { addManualGTDItem, completeManualGTDItem } from '../../../../../../engine/listsEngine';
import { ColorPicker } from '../../../../../shared/ColorPicker';
import { IconPicker } from '../../../../../shared/IconPicker';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { isImageIcon, resolveIcon } from '../../../../../../constants/iconMap';
import { ATTACHMENT_MAX_BYTES } from '../../../../../../storage/storageBudget';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import type { FloorPlanRoom, FloorPlanSegment, FloorPlanSegmentKind, HomeStory, InventoryContainer, InventoryItemTemplate, InventoryResource, ItemInstance, ItemRecurringTask, PlacedInstance, RecurrenceDayOfWeek, ResourceRecurrenceRule, SegmentDirection } from '../../../../../../types/resource';
import { makeDefaultRecurrenceRule, normalizeRecurrenceMode } from '../../../../../../types/resource';
import type { Task } from '../../../../../../types/task';
import { getUserInventoryItemTemplates, mergeInventoryItemTemplates, resolveInventoryItemTemplate } from '../../../../../../utils/inventoryItems';
import { getPointDistance, getPointsBounds, pointsMatch, segmentsToPoints } from '../../../../../../utils/floorPlan';
import { AddItemPanel } from '../inventory/AddItemPanel';
import { ContainerLayoutCanvas } from '../inventory/ContainerLayoutCanvas';
import { RoomAddContainerPanel } from './RoomAddContainerPanel';
import { RoomAddItemPanel } from './RoomAddItemPanel';
import { PopupShell } from '../../../../../shared/popups/PopupShell';

interface StoryOutlineDraft {
	origin: { x: number; y: number };
	segments: FloorPlanSegment[];
}

interface HomeFloorPlanProps {
	story: HomeStory;
	selectedRoomId: string | null;
	onSelectRoom: (roomId: string | null) => void;
	homeId?: string;
	editable?: boolean;
	editingStoryOutline?: StoryOutlineDraft | null;
	editingRoom?: FloorPlanRoom | null;
	editingMode?: 'create' | 'update' | null;
	onEditingStoryOutlineChange?: (outline: StoryOutlineDraft | null) => void;
	onSaveStoryOutline?: () => void;
	onEditingRoomChange?: (room: FloorPlanRoom | null) => void;
	onSaveEditingRoom?: () => void;
	onCancelEditingRoom?: () => void;
	onStartCreateRoom?: () => void;
	onStartEditRoom?: (room: FloorPlanRoom) => void;
	onDeleteRoom?: (roomId: string) => void;
	onUpdateRoomPlacedItems?: (roomId: string, placedItems: PlacedInstance[]) => void;
	onUpdateRoom?: (roomId: string, updater: (room: FloorPlanRoom) => FloorPlanRoom) => void;
	onUpdateStoryPlacedItems?: (placedItems: PlacedInstance[]) => void;
	onUpdateRoomPhotos?: (roomId: string, photos: string[]) => void;
	onUpdateStoryPhotos?: (photos: string[]) => void;
}


const VIEWBOX_WIDTH = 800;
const VIEWBOX_HEIGHT = 600;
const QUICK_ACTIONS_BADGE_RADIUS = 4;
const QUICK_ACTIONS_BADGE_OFFSET_X = 10;
const QUICK_ACTIONS_BADGE_OFFSET_Y = -10;
	const VERTEX_VISIBLE_RADIUS = 9;
	const VERTEX_HIT_RADIUS = 20;
	const INPUT_CLS = 'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';
	const STORY_SCOPE_ID = '__story__';
	const TASK_TYPE_OPTIONS = ['CHECK', 'COUNTER', 'DURATION', 'TIMER', 'RATING', 'TEXT'] as const;
	const DOW_LABELS: Array<{ key: RecurrenceDayOfWeek; label: string }> = [
		{ key: 'sun', label: 'Su' },
		{ key: 'mon', label: 'Mo' },
		{ key: 'tue', label: 'Tu' },
		{ key: 'wed', label: 'We' },
		{ key: 'thu', label: 'Th' },
		{ key: 'fri', label: 'Fr' },
		{ key: 'sat', label: 'Sa' },
	];

	function getPlacedInstanceQuantity(placement: Pick<PlacedInstance, 'quantity'>) {
		return placement.quantity ?? 1;
	}

	function getDayOfMonth(isoDate: string) {
		const parsed = Number(isoDate.split('-')[2] ?? 1);
		return Math.min(31, Math.max(1, parsed || 1));
	}

	function formatDayOfMonth(day: number) {
		const mod10 = day % 10;
		const mod100 = day % 100;
		if (mod10 === 1 && mod100 !== 11) return `${day}st`;
		if (mod10 === 2 && mod100 !== 12) return `${day}nd`;
		if (mod10 === 3 && mod100 !== 13) return `${day}rd`;
		return `${day}th`;
	}

	function describeTaskRecurrence(rule: ResourceRecurrenceRule) {
		const interval = Math.max(1, rule.interval || 1);
		switch (rule.frequency) {
			case 'daily':
				return interval === 1 ? 'Daily' : `Every ${interval} days`;
			case 'weekly': {
				const days = rule.days.length > 0
					? rule.days.map((day) => DOW_LABELS.find((entry) => entry.key === day)?.label ?? day).join(', ')
					: 'Seed day';
				return interval === 1 ? `Weekly · ${days}` : `Every ${interval} weeks · ${days}`;
			}
			case 'monthly': {
				const day = rule.monthlyDay ?? getDayOfMonth(rule.seedDate);
				return interval === 1 ? `Monthly · ${formatDayOfMonth(day)}` : `Every ${interval} months · ${formatDayOfMonth(day)}`;
			}
			case 'yearly':
				return interval === 1 ? 'Yearly' : `Every ${interval} years`;
			default:
				return 'Recurring';
		}
	}

	function describeReminder(leadDays: number) {
		if (leadDays < 0) return 'No reminder';
		if (leadDays === 0) return 'Day of';
		if (leadDays === 1) return '1 day before';
		return `${leadDays} days before`;
	}

	function buildPlacedTaskQuickActionsKey(placementId: string, recurringTaskId: string, resourceRef: string | null | undefined) {
		return `resource-task:${resourceRef ?? ''}:home-placement:${placementId}:${recurringTaskId}`;
	}

	function buildPlacementCleanQuickActionsKey(placementId: string, resourceRef: string | null | undefined) {
		return `resource-task:${resourceRef ?? ''}:home-placement:${placementId}:clean`;
	}

	function buildPlacedRecurringTaskId(placementId: string, taskTemplateRef: string) {
		return `placed-task:${placementId}:${taskTemplateRef.trim().toLowerCase()}`;
	}

	function humanizeTaskRef(taskTemplateRef: string) {
		return taskTemplateRef
			.replace(/^resource-task:/, '')
			.replace(/^item-tmpl-/, '')
			.replace(/[-_]+/g, ' ')
			.replace(/\b\w/g, (char) => char.toUpperCase());
	}

	function buildPlacedItemRecurringTasks(placementId: string, itemTemplateRef: string, availableTemplates: InventoryItemTemplate[]): ItemRecurringTask[] {
		const customTemplate = availableTemplates.find((option) => option.id === itemTemplateRef);
		if (itemTemplateRef.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX)) {
			return (customTemplate?.customTaskTemplates ?? [])
				.filter((taskTemplate) => taskTemplate.name.trim().length > 0)
				.map((taskTemplate) => ({
					id: buildPlacedRecurringTaskId(placementId, taskTemplate.name.trim()),
					taskTemplateRef: taskTemplate.name.trim(),
					recurrenceMode: 'never',
					recurrence: makeDefaultRecurrenceRule(),
					reminderLeadDays: 7,
				}));
		}

		const template = resolveInventoryItemTemplate(itemTemplateRef, availableTemplates);
		const taskRefs = new Set<string>();
		for (const task of template?.builtInTasks ?? []) {
			if (task.taskTemplateRef) taskRefs.add(task.taskTemplateRef);
		}

		return [...taskRefs].map((taskTemplateRef) => ({
			id: buildPlacedRecurringTaskId(placementId, taskTemplateRef),
			taskTemplateRef,
			recurrenceMode: 'never',
			recurrence: makeDefaultRecurrenceRule(),
			reminderLeadDays: 7,
		}));
	}

	function resolvePlacedTaskDisplay(taskTemplateRef: string, itemTemplateRef: string, availableTemplates: InventoryItemTemplate[]) {
		if (itemTemplateRef.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX)) {
			const customTemplate = availableTemplates.find((option) => option.id === itemTemplateRef);
			const customTask = customTemplate?.customTaskTemplates?.find((taskTemplate) => taskTemplate.name.trim() === taskTemplateRef);
			if (customTask) {
				return {
					name: customTask.name,
					icon: customTask.icon || 'task',
				};
			}
		}

		const coachTaskTemplate = taskTemplateLibrary.find((template) => template.id === taskTemplateRef);
		if (coachTaskTemplate) {
			return {
				name: coachTaskTemplate.name,
				icon: coachTaskTemplate.icon || 'task',
			};
		}

		const itemTaskTemplate = getItemTaskTemplateMeta(taskTemplateRef);
		if (itemTaskTemplate) {
			return {
				name: itemTaskTemplate.name,
				icon: itemTaskTemplate.icon || 'task',
			};
		}

		return {
			name: humanizeTaskRef(taskTemplateRef),
			icon: 'task',
		};
	}

	type OutlineEditMode = 'add-point' | 'select-segment';
	type RoomEditMode = 'add-point' | 'select-segment';

	type InteractionState =
		| { type: 'idle' }
		| { type: 'drag-origin' }
		| { type: 'drag-container'; roomId: string | null; placementId: string; offsetX: number; offsetY: number };

	type ContainerFace = 'width-depth' | 'width-height' | 'depth-height';
	type FaceGridDraft = { columns: number; rows: number };
	type FaceGridInputDraft = { columns: string; rows: string };

	const CONTAINER_FACE_OPTIONS: Array<{ value: ContainerFace; label: string }> = [
		{ value: 'width-depth', label: 'Top View' },
		{ value: 'width-height', label: 'Front View' },
		{ value: 'depth-height', label: 'Side View' },
	];

	function containerFaceLabel(face: ContainerFace) {
		switch (face) {
			case 'width-height':
				return 'Front View';
			case 'depth-height':
				return 'Side View';
			case 'width-depth':
			default:
				return 'Top View';
		}
	}

	function clampGridCount(value: number) {
		return Math.min(10, Math.max(1, value));
	}

	function resolveContainerFaceGrid(layoutGrid: InventoryContainer['layoutGrid'] | undefined, face: ContainerFace): FaceGridDraft {
		const fallback = {
			columns: clampGridCount(layoutGrid?.columns ?? 1),
			rows: clampGridCount(layoutGrid?.rows ?? 1),
		};

		switch (face) {
			case 'width-height':
				return layoutGrid?.widthHeight ?? fallback;
			case 'depth-height':
				return layoutGrid?.depthHeight ?? fallback;
			case 'width-depth':
			default:
				return layoutGrid?.widthDepth ?? fallback;
		}
	}

	function normaliseFaceGridInput(draft: FaceGridInputDraft): FaceGridDraft {
		return {
			columns: clampGridCount(Number(draft.columns) || 1),
			rows: clampGridCount(Number(draft.rows) || 1),
		};
	}

	function clampZoom(zoom: number) {
		return Math.min(2.5, Math.max(0.45, zoom));
	}

	function combineBounds(boundsList: Array<{ minX: number; minY: number; maxX: number; maxY: number }>) {
		if (boundsList.length === 0) return null;

		let minX = boundsList[0].minX;
		let minY = boundsList[0].minY;
		let maxX = boundsList[0].maxX;
		let maxY = boundsList[0].maxY;

		for (const bounds of boundsList.slice(1)) {
			minX = Math.min(minX, bounds.minX);
			minY = Math.min(minY, bounds.minY);
			maxX = Math.max(maxX, bounds.maxX);
			maxY = Math.max(maxY, bounds.maxY);
		}

		return {
			minX,
			minY,
			maxX,
			maxY,
			width: maxX - minX,
			height: maxY - minY,
		};
	}

	function midpoint(left: { x: number; y: number }, right: { x: number; y: number }) {
		return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
	}

	function formatDistance(distance: number) {
		return `${Math.round(distance)}`;
	}

	function projectPoint(origin: { x: number; y: number }, direction: SegmentDirection, distance: number) {
		switch (direction) {
			case 'up':
				return { x: origin.x, y: origin.y - distance };
			case 'down':
				return { x: origin.x, y: origin.y + distance };
			case 'left':
				return { x: origin.x - distance, y: origin.y };
			case 'right':
			default:
				return { x: origin.x + distance, y: origin.y };
		}
	}

	function getRotatedRectPoints(center: { x: number; y: number }, width: number, depth: number, rotation: number) {
		const halfWidth = width / 2;
		const halfDepth = depth / 2;
	const radians = rotation * (Math.PI / 180);
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	const corners = [
		{ x: -halfWidth, y: -halfDepth },
		{ x: halfWidth, y: -halfDepth },
		{ x: halfWidth, y: halfDepth },
		{ x: -halfWidth, y: halfDepth },
	];

	return corners.map((corner) => ({
		x: center.x + corner.x * cos - corner.y * sin,
		y: center.y + corner.x * sin + corner.y * cos,
	}));
}

function getDirectionAndDistance(from: { x: number; y: number }, to: { x: number; y: number }) {
	const dx = to.x - from.x;
	const dy = to.y - from.y;

	if (Math.abs(dx) >= Math.abs(dy)) {
		return {
			direction: dx >= 0 ? 'right' : 'left' as SegmentDirection,
			distance: Math.abs(dx),
		};
	}

	return {
		direction: dy >= 0 ? 'down' : 'up' as SegmentDirection,
		distance: Math.abs(dy),
	};
}

function getSegmentLines(origin: { x: number; y: number }, segments: FloorPlanSegment[]) {
	const points = segmentsToPoints(origin, segments);
	return segments.map((segment, index) => ({
		segment,
		index,
		start: points[index] ?? origin,
		end: points[index + 1] ?? points[index] ?? origin,
	}));
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
		reader.onerror = () => reject(reader.error ?? new Error('Unable to read file.'));
		reader.readAsDataURL(file);
	});
}

function estimateDataUrlSizeBytes(dataUrl: string): number {
	const base64 = dataUrl.split(',')[1] ?? '';
	const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
	return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function HomeFloorPlan({
	story,
	selectedRoomId,
	onSelectRoom,
	homeId,
	editable = false,
	editingStoryOutline = null,
	editingRoom = null,
	editingMode = null,
	onEditingStoryOutlineChange,
	onSaveStoryOutline,
	onEditingRoomChange,
	onSaveEditingRoom,
	onCancelEditingRoom,
	onStartCreateRoom,
	onStartEditRoom,
	onDeleteRoom,
	onUpdateRoomPlacedItems,
	onUpdateRoom,
	onUpdateStoryPlacedItems,
	onUpdateRoomPhotos,
	onUpdateStoryPhotos,
}: HomeFloorPlanProps) {
	const svgRef = useRef<SVGSVGElement | null>(null);
	const [zoom, setZoom] = useState(1);
	const [pan, setPan] = useState({ x: 0, y: 0 });
	const [interaction, setInteraction] = useState<InteractionState>({ type: 'idle' });
	const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);
	const [isOutsideRoomsExpanded, setIsOutsideRoomsExpanded] = useState(false);
	const [editingContainersRoomId, setEditingContainersRoomId] = useState<string | null>(null);
	const [isPlacingStartPoint, setIsPlacingStartPoint] = useState(false);
	const [startPointAnchorIndex, setStartPointAnchorIndex] = useState<number | null>(null);
	const [startPointDirection, setStartPointDirection] = useState<SegmentDirection>('right');
	const [startPointDistance, setStartPointDistance] = useState('24');
	const [pendingDirection, setPendingDirection] = useState<SegmentDirection>('right');
	const [pendingDistance, setPendingDistance] = useState('80');
	const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);
	const [roomEditMode, setRoomEditMode] = useState<RoomEditMode>('add-point');
	// For story outline editing: mode and selected segment
	const [outlineEditMode, setOutlineEditMode] = useState<OutlineEditMode>('add-point');
	const [selectedOutlineSegmentIndex, setSelectedOutlineSegmentIndex] = useState<number | null>(null);
	const [draftContainerByRoom, setDraftContainerByRoom] = useState<Record<string, { name: string; icon: string }>>({});
	const [addingLooseItemRoomId, setAddingLooseItemRoomId] = useState<string | null>(null);
	const [newLooseItemTemplateRefByRoom, setNewLooseItemTemplateRefByRoom] = useState<Record<string, string>>({});
	const [newLooseItemQuantityByRoom, setNewLooseItemQuantityByRoom] = useState<Record<string, string>>({});
	const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
	const [expandedPlacedContainerId, setExpandedPlacedContainerId] = useState<string | null>(null);
	const [expandedPlacedTaskId, setExpandedPlacedTaskId] = useState<string | null>(null);
	const [executePlacedTaskPrompt, setExecutePlacedTaskPrompt] = useState<{ name: string; taskType: string | null | undefined } | null>(null);
	const [editingPlacedContainerId, setEditingPlacedContainerId] = useState<string | null>(null);
	const [addingItemContainerId, setAddingItemContainerId] = useState<string | null>(null);
	const [newItemTemplateRefByContainer, setNewItemTemplateRefByContainer] = useState<Record<string, string>>({});
	const [newItemQuantityByContainer, setNewItemQuantityByContainer] = useState<Record<string, string>>({});
	const [photoStatusByScope, setPhotoStatusByScope] = useState<Record<string, string>>({});
	const [photoUploadBusyByScope, setPhotoUploadBusyByScope] = useState<Record<string, boolean>>({});
	const [roomAddItemRoomId, setRoomAddItemRoomId] = useState<string | null>(null);
	const [roomAddContainerRoomId, setRoomAddContainerRoomId] = useState<string | null>(null);
	const [viewingContainerPlacementId, setViewingContainerPlacementId] = useState<string | null>(null);
	const [viewingContainerFace, setViewingContainerFace] = useState<ContainerFace>('width-depth');
	const [showViewedContainerAddItemPanel, setShowViewedContainerAddItemPanel] = useState(false);
	const [showViewedContainerLayoutPanel, setShowViewedContainerLayoutPanel] = useState(false);
	const [pendingViewedContainerItemId, setPendingViewedContainerItemId] = useState<string | null>(null);
	const [viewedLayoutWidth, setViewedLayoutWidth] = useState<number | ''>('');
	const [viewedLayoutDepth, setViewedLayoutDepth] = useState<number | ''>('');
	const [viewedLayoutHeight, setViewedLayoutHeight] = useState<number | ''>('');
	const [viewedLayoutActiveFace, setViewedLayoutActiveFace] = useState<ContainerFace>('width-depth');
	const [viewedLayoutWidthDepthGrid, setViewedLayoutWidthDepthGrid] = useState<FaceGridInputDraft>({ columns: '1', rows: '1' });
	const [viewedLayoutWidthHeightGrid, setViewedLayoutWidthHeightGrid] = useState<FaceGridInputDraft>({ columns: '1', rows: '1' });
	const [viewedLayoutDepthHeightGrid, setViewedLayoutDepthHeightGrid] = useState<FaceGridInputDraft>({ columns: '1', rows: '1' });
	const [viewedLayoutError, setViewedLayoutError] = useState('');
	const resources = useResourceStore((s) => s.resources);
	const setResource = useResourceStore((s) => s.setResource);
	const setTask = useScheduleStore((s) => s.setTask);
	const tasks = useScheduleStore((s) => s.tasks);
	const user = useUserStore((s) => s.user);
	const setUser = useUserStore((s) => s.setUser);

	const selectedRoom = selectedRoomId ? story.rooms.find((room) => room.id === selectedRoomId) ?? null : null;
	const isEditingStoryOutline = Boolean(editingStoryOutline);
	const canvasRooms = useMemo(() => {
		const nextRooms = story.rooms.map((room) => (
			editingMode === 'update' && editingRoom && room.id === editingRoom.id ? editingRoom : room
		));
		if (editingMode === 'create' && editingRoom) {
			return [...nextRooms, editingRoom];
		}
		return nextRooms;
	}, [editingMode, editingRoom, story.rooms]);
	const storyOutline = useMemo(() => (
		editingStoryOutline
			? { origin: editingStoryOutline.origin, segments: editingStoryOutline.segments }
			: story.outlineOrigin && story.outlineSegments
				? { origin: story.outlineOrigin, segments: story.outlineSegments }
				: null
	), [editingStoryOutline, story.outlineOrigin, story.outlineSegments]);
	const storyOutlinePoints = useMemo(
		() => (storyOutline ? segmentsToPoints(storyOutline.origin, storyOutline.segments) : []),
		[storyOutline],
	);
	const storyAnchorPoints = useMemo(() => {
		if (storyOutlinePoints.length <= 1) return storyOutlinePoints;
		const lastPoint = storyOutlinePoints[storyOutlinePoints.length - 1];
		return pointsMatch(storyOutlinePoints[0], lastPoint) ? storyOutlinePoints.slice(0, -1) : storyOutlinePoints;
	}, [storyOutlinePoints]);
	const startPointAnchors = useMemo(() => {
		const anchors: Array<{ point: { x: number; y: number }; key: string }> = [];
		const pushUnique = (point: { x: number; y: number }, key: string) => {
			if (anchors.some((entry) => pointsMatch(entry.point, point))) return;
			anchors.push({ point, key });
		};

		storyAnchorPoints.forEach((point, index) => {
			pushUnique(point, `story-${index}`);
		});

		for (const room of story.rooms) {
			if (editingRoom && room.id === editingRoom.id) continue;
			const roomPoints = segmentsToPoints(room.origin, room.segments);
			if (roomPoints.length <= 1) continue;
			const lastPoint = roomPoints[roomPoints.length - 1];
			const anchorPoints = pointsMatch(roomPoints[0], lastPoint) ? roomPoints.slice(0, -1) : roomPoints;
			anchorPoints.forEach((point, index) => {
				pushUnique(point, `room-${room.id}-${index}`);
			});
		}

		return anchors;
	}, [editingRoom, story.rooms, storyAnchorPoints]);
	const editingPoints = useMemo(() => {
		if (!editingRoom || isPlacingStartPoint) return [];
		return segmentsToPoints(editingRoom.origin, editingRoom.segments);
	}, [editingRoom, isPlacingStartPoint]);
	const editingSegmentLines = useMemo(() => {
		if (!editingRoom || isPlacingStartPoint) return [];
		return getSegmentLines(editingRoom.origin, editingRoom.segments);
	}, [editingRoom, isPlacingStartPoint]);
	const activeOrigin = isEditingStoryOutline ? editingStoryOutline?.origin ?? null : editingRoom && !isPlacingStartPoint ? editingRoom.origin : null;
	const activePoints = isEditingStoryOutline ? storyOutlinePoints : editingPoints;
	const currentPoint = activePoints[activePoints.length - 1] ?? activeOrigin;
	const startPointDistanceValue = Math.max(1, Number(startPointDistance) || 0);
	const startPointAnchor = startPointAnchorIndex !== null ? startPointAnchors[startPointAnchorIndex]?.point ?? null : null;
	const startPointPreview = useMemo(
		() => (startPointAnchor ? projectPoint(startPointAnchor, startPointDirection, startPointDistanceValue) : null),
		[startPointAnchor, startPointDirection, startPointDistanceValue],
	);
	const pendingDistanceValue = Math.max(1, Number(pendingDistance) || 0);
	const previewPoint = useMemo(
		() => (currentPoint ? projectPoint(currentPoint, pendingDirection, pendingDistanceValue) : null),
		[currentPoint, pendingDirection, pendingDistanceValue],
	);
	const showPointPreview = isEditingStoryOutline
		? outlineEditMode === 'add-point'
		: Boolean(editingRoom && !isPlacingStartPoint && roomEditMode === 'add-point');
	const canSaveEditingRoom = Boolean(editingRoom && editingRoom.name.trim() && editingPoints.length >= 3);
	const canSaveStoryOutline = Boolean(editingStoryOutline && storyOutlinePoints.length >= 3);
	const inventoryResources = useMemo(
		() => Object.values(resources).filter((entry): entry is InventoryResource => entry.type === 'inventory'),
		[resources],
	);
	const userItemTemplates = useMemo(() => getUserInventoryItemTemplates(user), [user]);
	const mergedItemTemplates = useMemo(
		() => mergeInventoryItemTemplates(userItemTemplates, ...inventoryResources.map((entry) => entry.itemTemplates)),
		[inventoryResources, userItemTemplates],
	);
	const pendingQuickActionsTaskKeys = useMemo(() => {
		const next = new Set<string>();
		if (!user) return next;

		for (const taskId of user.lists.gtdList) {
			const task = tasks[taskId];
			if (!task || task.completionState !== 'pending') continue;
			if (typeof task.attachmentRef !== 'string' || !task.attachmentRef.trim()) continue;
			next.add(task.attachmentRef);
		}

		return next;
	}, [tasks, user]);

	function isPlacedTaskInQuickActions(placementId: string, recurringTaskId: string, resourceRef: string | null | undefined = homeId ?? null) {
		return pendingQuickActionsTaskKeys.has(buildPlacedTaskQuickActionsKey(placementId, recurringTaskId, resourceRef));
	}

	function isPlacementCleanInQuickActions(placementId: string, resourceRef: string | null | undefined = homeId ?? null) {
		return pendingQuickActionsTaskKeys.has(buildPlacementCleanQuickActionsKey(placementId, resourceRef));
	}

	function placedItemHasQuickActionsTask(placementId: string, recurringTasks: ItemRecurringTask[] | undefined) {
		return (recurringTasks ?? []).some((task) => {
			return isPlacedTaskInQuickActions(placementId, task.id);
		});
	}

	function findRoomContainerRecord(room: FloorPlanRoom, containerId: string) {
		const dedicatedContainer = room.dedicatedContainers?.find((candidate) => candidate.id === containerId);
		if (dedicatedContainer) {
			return {
				source: 'room' as const,
				container: dedicatedContainer,
				inventoryName: `${room.name} room`,
				itemTemplates: mergeInventoryItemTemplates(userItemTemplates, room.dedicatedItems),
			};
		}

		for (const inventory of inventoryResources) {
			const container = inventory.containers?.find((candidate) => candidate.id === containerId);
			if (!container) continue;
			return {
				source: 'inventory' as const,
				inventory,
				container,
				inventoryName: inventory.name,
				itemTemplates: mergeInventoryItemTemplates(userItemTemplates, inventory.itemTemplates),
			};
		}

		return null;
	}

	function resolvePlacedContainerEntry(room: FloorPlanRoom, placement: PlacedInstance) {
		const record = findRoomContainerRecord(room, placement.refId);
		if (!record) {
			return {
				placement,
				container: null,
				containerName: 'Unknown container',
				containerIcon: 'inventory',
				inventoryName: 'Unlinked inventory',
				items: [],
				source: 'missing' as const,
			};
		}

		return {
			placement,
			container: record.container,
			containerName: record.container.name,
			containerIcon: record.container.icon,
			inventoryName: record.inventoryName,
			items: record.container.items.map((item) => ({
				id: item.id,
				name: resolveInventoryItemTemplate(item.itemTemplateRef, record.itemTemplates)?.name ?? item.itemTemplateRef,
				quantity: item.quantity,
				unit: item.unit,
			})),
			source: record.source,
		};
	}

	function resolvePlacedItemEntry(room: FloorPlanRoom, placement: PlacedInstance) {
		for (const inventory of inventoryResources) {
			const item = inventory.items.find((candidate) => candidate.id === placement.refId);
			if (!item) continue;
			const resolvedItem = resolveInventoryItemTemplate(item.itemTemplateRef, mergeInventoryItemTemplates(userItemTemplates, inventory.itemTemplates));
			return {
				placement,
				itemName: resolvedItem?.name ?? item.itemTemplateRef,
				itemIcon: resolvedItem?.icon ?? 'inventory',
				itemKind: resolvedItem?.kind,
				itemTasks: resolvedItem?.builtInTasks ?? [],
				recurringTasks: placement.recurringTasks ?? item.recurringTasks ?? [],
				templateDimensions: resolvedItem?.dimensions,
				itemTemplateRef: item.itemTemplateRef,
				quantity: item.quantity,
				unit: item.unit,
				threshold: item.threshold,
				inventoryName: inventory.name,
				source: 'inventory' as const,
			};
		}

		const roomTemplates = mergeInventoryItemTemplates(userItemTemplates, room.dedicatedItems);
		const resolvedTemplate = resolveInventoryItemTemplate(placement.refId, roomTemplates);
		if (resolvedTemplate) {
			return {
				placement,
				itemName: resolvedTemplate.name,
				itemIcon: resolvedTemplate.icon,
				itemKind: resolvedTemplate.kind,
				itemTasks: resolvedTemplate.builtInTasks ?? [],
				recurringTasks: placement.recurringTasks ?? buildPlacedItemRecurringTasks(placement.id, placement.refId, roomTemplates),
				templateDimensions: resolvedTemplate.dimensions,
				itemTemplateRef: placement.refId,
				quantity: placement.quantity,
				unit: undefined,
				threshold: undefined,
				inventoryName: room.dedicatedItems?.some((item) => item.id === placement.refId)
					? `${room.name} room`
					: resolvedTemplate.source === 'library'
						? 'Library item'
						: 'My item',
				source: room.dedicatedItems?.some((item) => item.id === placement.refId) ? 'room' as const : resolvedTemplate.source,
			};
		}

		return {
			placement,
			itemName: 'Unknown item',
			itemIcon: 'inventory',
			itemKind: undefined,
			itemTasks: [],
			recurringTasks: placement.recurringTasks ?? [],
			templateDimensions: undefined,
			itemTemplateRef: placement.refId,
			quantity: placement.quantity,
			unit: undefined,
			threshold: undefined,
			inventoryName: 'Unlinked inventory',
			source: 'missing' as const,
		};
	}
	const roomSummaries = useMemo(() => {
		return story.rooms.map((room) => {
			const bounds = getPointsBounds(segmentsToPoints(room.origin, room.segments));
			const placedContainerEntries = room.placedItems
				.filter((entry) => entry.kind === 'container')
				.map((entry) => resolvePlacedContainerEntry(room, entry));
				const placedLooseItemEntries = room.placedItems
					.filter((entry) => entry.kind === 'item')
					.map((entry) => resolvePlacedItemEntry(room, entry));

			return {
				room,
				bounds,
				placedContainerEntries,
				placedLooseItemEntries,
				placedEntries: [...placedContainerEntries, ...placedLooseItemEntries],
				placedLooseItemCount: placedLooseItemEntries.reduce((sum, entry) => sum + getPlacedInstanceQuantity(entry.placement), 0),
			};
		});
	}, [inventoryResources, story.rooms, userItemTemplates]);
	const outsidePlacedContainerEntries = useMemo(() => story.placedItems
		.filter((entry) => entry.kind === 'container')
		.map((entry) => {
			for (const inventory of inventoryResources) {
				const container = inventory.containers?.find((candidate) => candidate.id === entry.refId);
				if (!container) continue;
				const itemTemplates = mergeInventoryItemTemplates(userItemTemplates, inventory.itemTemplates);
				return {
					placement: entry,
					containerName: container.name,
					containerIcon: container.icon,
					inventoryName: inventory.name,
					items: container.items.map((item) => ({
						id: item.id,
						name: resolveInventoryItemTemplate(item.itemTemplateRef, itemTemplates)?.name ?? item.itemTemplateRef,
						quantity: item.quantity,
						unit: item.unit,
					})),
				};
			}

			return {
				placement: entry,
				containerName: 'Unknown container',
				containerIcon: 'inventory',
				inventoryName: 'Unlinked inventory',
				items: [],
			};
		}), [inventoryResources, story.placedItems, userItemTemplates]);
	const outsidePlacedLooseItemEntries = useMemo(() => story.placedItems
		.filter((entry) => entry.kind === 'item')
		.map((entry) => {
			for (const inventory of inventoryResources) {
				const item = inventory.items.find((candidate) => candidate.id === entry.refId);
				if (!item) continue;
				const resolvedItem = resolveInventoryItemTemplate(item.itemTemplateRef, mergeInventoryItemTemplates(userItemTemplates, inventory.itemTemplates));
				return {
					placement: entry,
					itemName: resolvedItem?.name ?? item.itemTemplateRef,
					itemIcon: resolvedItem?.icon ?? 'inventory',
					quantity: item.quantity,
					unit: item.unit,
					threshold: item.threshold,
					inventoryName: inventory.name,
				};
			}

			return {
				placement: entry,
				itemName: 'Unknown item',
				itemIcon: 'inventory',
				quantity: undefined,
				unit: undefined,
				threshold: undefined,
				inventoryName: 'Unlinked inventory',
			};
		}), [inventoryResources, story.placedItems, userItemTemplates]);
	const outsidePlacedEntries = useMemo(
		() => [...outsidePlacedContainerEntries, ...outsidePlacedLooseItemEntries],
		[outsidePlacedContainerEntries, outsidePlacedLooseItemEntries],
	);
	const outsidePlacedLooseItemCount = useMemo(
		() => outsidePlacedLooseItemEntries.reduce((sum, entry) => sum + getPlacedInstanceQuantity(entry.placement), 0),
		[outsidePlacedLooseItemEntries],
	);
	const visibleRoomSummaries = useMemo(() => {
		if (!selectedRoomId) return roomSummaries;
		return roomSummaries.filter((entry) => entry.room.id === selectedRoomId);
	}, [roomSummaries, selectedRoomId]);
	const containerFocusSummary = roomSummaries.find((entry) => entry.room.id === editingContainersRoomId) ?? null;
	const selectedRoomSummary = roomSummaries.find((entry) => entry.room.id === selectedRoom?.id) ?? null;
	const selectedEditingSegment = selectedSegmentIndex != null ? editingSegmentLines[selectedSegmentIndex] ?? null : null;
	const effectiveExpandedRoomId = !editingRoom && !editingStoryOutline ? (selectedRoomId ?? null) : expandedRoomId;
	const activeEditablePlacementId = selectedPlacementId;
	const editingRoomId = editingRoom?.id ?? null;
	const roomAddItemSummary = roomAddItemRoomId ? roomSummaries.find((entry) => entry.room.id === roomAddItemRoomId) ?? null : null;
	const roomAddContainerSummary = roomAddContainerRoomId ? roomSummaries.find((entry) => entry.room.id === roomAddContainerRoomId) ?? null : null;
	const viewedContainerEntry = useMemo(() => {
		if (!selectedRoomSummary || !viewingContainerPlacementId) return null;
		return selectedRoomSummary.placedContainerEntries.find((entry) => entry.placement.id === viewingContainerPlacementId) ?? null;
	}, [selectedRoomSummary, viewingContainerPlacementId]);
	const viewedContainerRecord = useMemo(() => {
		if (!selectedRoomSummary || !viewedContainerEntry?.container) return null;
		return findRoomContainerRecord(selectedRoomSummary.room, viewedContainerEntry.container.id);
	}, [selectedRoomSummary, viewedContainerEntry]);

	useEffect(() => {
		if (!viewingContainerPlacementId || viewedContainerEntry) return;
		const resetId = window.setTimeout(() => setViewingContainerPlacementId(null), 0);
		return () => window.clearTimeout(resetId);
	}, [viewedContainerEntry, viewingContainerPlacementId]);

	useEffect(() => {
		if (viewedContainerEntry) return;
		setShowViewedContainerLayoutPanel(false);
	}, [viewedContainerEntry]);

	useEffect(() => {
		const resetId = window.setTimeout(() => {
			setSelectedSegmentIndex(null);
			setSelectedOutlineSegmentIndex(null);
			setRoomEditMode('add-point');
			setOutlineEditMode('add-point');
		}, 0);
		return () => window.clearTimeout(resetId);
	}, [editingMode, editingRoom?.id, editingStoryOutline, isPlacingStartPoint]);
	const roomEditorPanel = editable && editingRoom ? (
		<div className="relative z-20 border-b border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-950/40">
			<div className="mx-auto w-full max-w-4xl rounded-2xl bg-white/95 p-3 shadow-sm ring-1 ring-black/5 backdrop-blur dark:bg-gray-900/95">
				<div className="flex flex-wrap items-end gap-3">
					<IconPicker value={editingRoom.icon || 'home'} onChange={(value) => onEditingRoomChange?.({ ...editingRoom, icon: value })} align="left" />
					<ColorPicker value={editingRoom.color ?? '#84cc16'} onChange={(value) => onEditingRoomChange?.({ ...editingRoom, color: value })} align="left" />
					<label className="min-w-[10rem] flex-1 space-y-1">
						<span className="text-xs font-medium text-gray-500 dark:text-gray-400">Room name</span>
						<input value={editingRoom.name} onChange={(event) => onEditingRoomChange?.({ ...editingRoom, name: event.target.value })} className={INPUT_CLS} placeholder="e.g. Kitchen" />
					</label>
					<div className="ml-auto flex items-center gap-2">
						<button type="button" onClick={onCancelEditingRoom} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">Cancel</button>
						<button type="button" onClick={onSaveEditingRoom} disabled={!canSaveEditingRoom} className={canSaveEditingRoom ? 'rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600' : 'rounded-full bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-400 dark:bg-gray-700'}>{editingMode === 'create' ? 'Save room' : 'Save changes'}</button>
					</div>
				</div>
			</div>
		</div>
	) : null;
	const viewportBounds = useMemo(() => {
		if (containerFocusSummary) {
			return containerFocusSummary.bounds;
		}

		if (editingRoom && !isPlacingStartPoint) {
			const editingRoomPoints = segmentsToPoints(editingRoom.origin, editingRoom.segments);
			if (editingRoomPoints.length > 0) {
				return getPointsBounds(editingRoomPoints);
			}
		}

		if (!editingRoom && !editingStoryOutline && selectedRoomSummary) {
			return selectedRoomSummary.bounds;
		}

		const boundsList: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = [];

		if (storyOutlinePoints.length > 0) {
			boundsList.push(getPointsBounds(storyOutlinePoints));
		}

		for (const room of canvasRooms) {
			const points = segmentsToPoints(room.origin, room.segments);
			if (points.length > 0) {
				boundsList.push(getPointsBounds(points));
			}
		}

		if (isPlacingStartPoint && startPointAnchor && startPointPreview) {
			boundsList.push(getPointsBounds([startPointAnchor, startPointPreview]));
		}

		if (currentPoint && previewPoint && showPointPreview) {
			boundsList.push(getPointsBounds([currentPoint, previewPoint]));
		}

		return combineBounds(boundsList);
	}, [canvasRooms, containerFocusSummary, currentPoint, editingRoom, editingStoryOutline, isPlacingStartPoint, previewPoint, selectedRoomSummary, showPointPreview, startPointAnchor, startPointPreview, storyOutlinePoints]);

	useEffect(() => {
		if (!editingContainersRoomId) return;
		if (editingContainersRoomId === STORY_SCOPE_ID) return;
		if (editingContainersRoomId !== selectedRoomId) {
			const resetId = window.setTimeout(() => setEditingContainersRoomId(null), 0);
			return () => window.clearTimeout(resetId);
		}
	}, [editingContainersRoomId, selectedRoomId]);

	useEffect(() => {
		if (!expandedPlacedContainerId) {
			const resetId = window.setTimeout(() => setSelectedPlacementId(null), 0);
			return () => window.clearTimeout(resetId);
			return;
		}

		const hasExpandedPlacement = Boolean(
			selectedRoomSummary?.placedEntries.some((entry) => entry.placement.id === expandedPlacedContainerId)
			|| outsidePlacedEntries.some((entry) => entry.placement.id === expandedPlacedContainerId),
		);

		if (!hasExpandedPlacement) {
			const resetId = window.setTimeout(() => {
				setExpandedPlacedContainerId(null);
				setSelectedPlacementId(null);
			}, 0);
			return () => window.clearTimeout(resetId);
			return;
		}

		if (selectedPlacementId !== expandedPlacedContainerId) {
			const syncId = window.setTimeout(() => setSelectedPlacementId(expandedPlacedContainerId), 0);
			return () => window.clearTimeout(syncId);
		}
	}, [expandedPlacedContainerId, outsidePlacedEntries, selectedPlacementId, selectedRoomSummary]);

	useEffect(() => {
		if (!editingRoomId) {
			const resetId = window.setTimeout(() => {
				setIsPlacingStartPoint(false);
				setStartPointAnchorIndex(null);
			}, 0);
			return () => window.clearTimeout(resetId);
		}

		if (editingMode === 'create') {
			const resetId = window.setTimeout(() => {
				setIsPlacingStartPoint(true);
				setStartPointAnchorIndex(null);
				setStartPointDirection('right');
				setStartPointDistance('24');
			}, 0);
			return () => window.clearTimeout(resetId);
		}

		const resetId = window.setTimeout(() => {
			setIsPlacingStartPoint(false);
			setStartPointAnchorIndex(null);
		}, 0);
		return () => window.clearTimeout(resetId);
	}, [editingMode, editingRoomId]);

	useEffect(() => {
		let frameId = 0;

		if (!viewportBounds) {
			frameId = window.requestAnimationFrame(() => {
				setZoom((current) => (current === 1 ? current : 1));
				setPan((current) => (current.x === 0 && current.y === 0 ? current : { x: 0, y: 0 }));
			});
			return () => window.cancelAnimationFrame(frameId);
		}

		const horizontalMargin = 72;
		const verticalMargin = 72;
		const safeWidth = Math.max(120, VIEWBOX_WIDTH - horizontalMargin * 2);
		const safeHeight = Math.max(120, VIEWBOX_HEIGHT - verticalMargin * 2);
		const contentWidth = Math.max(120, viewportBounds.width || 120);
		const contentHeight = Math.max(120, viewportBounds.height || 120);
		const nextZoom = clampZoom(Math.min(safeWidth / contentWidth, safeHeight / contentHeight));
		const centerX = viewportBounds.minX + viewportBounds.width / 2;
		const centerY = viewportBounds.minY + viewportBounds.height / 2;
		const nextPan = {
			x: VIEWBOX_WIDTH / 2 - centerX * nextZoom,
			y: VIEWBOX_HEIGHT / 2 - centerY * nextZoom,
		};

		frameId = window.requestAnimationFrame(() => {
			setZoom((current) => (Math.abs(current - nextZoom) < 0.0001 ? current : nextZoom));
			setPan((current) => (
				Math.abs(current.x - nextPan.x) < 0.0001 && Math.abs(current.y - nextPan.y) < 0.0001
					? current
					: nextPan
			));
		});
		return () => window.cancelAnimationFrame(frameId);
	}, [viewportBounds]);

	function appendSegment() {
		if (!editable) return;
		const distance = Math.max(1, Number(pendingDistance) || 0);
		if (!distance) return;
		if (editingStoryOutline && onEditingStoryOutlineChange) {
			onEditingStoryOutlineChange({
				...editingStoryOutline,
				segments: [...editingStoryOutline.segments, { direction: pendingDirection, distance, kind: 'wall' }],
			});
			return;
		}
		if (!editingRoom || !onEditingRoomChange) return;
		onEditingRoomChange({
			...editingRoom,
			segments: [...editingRoom.segments, { direction: pendingDirection, distance, kind: 'wall' }],
		});
		setSelectedSegmentIndex(editingRoom.segments.length);
	}

	function updateSelectedSegmentKind(nextKind: FloorPlanSegmentKind) {
		if (!editingRoom || selectedSegmentIndex == null || !onEditingRoomChange) return;
		onEditingRoomChange({
			...editingRoom,
			segments: editingRoom.segments.map((segment, index) => (
				index === selectedSegmentIndex
					? { ...segment, kind: nextKind }
					: segment
			)),
		});
	}

	function updateSelectedOutlineSegmentKind(nextKind: FloorPlanSegmentKind) {
		if (!editingStoryOutline || selectedOutlineSegmentIndex == null || !onEditingStoryOutlineChange) return;
		onEditingStoryOutlineChange({
			...editingStoryOutline,
			segments: editingStoryOutline.segments.map((segment, index) => (
				index === selectedOutlineSegmentIndex
					? { ...segment, kind: nextKind }
					: segment
			)),
		});
	}

	function applyStartPoint() {
		if (!editingRoom || !startPointPreview || !onEditingRoomChange) return;
		onEditingRoomChange({
			...editingRoom,
			origin: { ...startPointPreview },
		});
		setIsPlacingStartPoint(false);
	}

	function selectStartPointAnchor(index: number, event: { stopPropagation: () => void }) {
		event.stopPropagation();
		setStartPointAnchorIndex(index);
	}

	function beginOriginDrag(event: { stopPropagation: () => void }) {
		if (!editable || (!editingRoom && !editingStoryOutline)) return;
		if (editingRoom && !isPlacingStartPoint) {
			event.stopPropagation();
			setInteraction({ type: 'drag-origin' });
		}
	}

	function reopenStartPointEditor() {
		if (!editingRoom) return;

		if (startPointAnchors.length > 0) {
			const alignedMatches = startPointAnchors
				.map((anchor, index) => ({ point: anchor.point, index }))
				.filter(({ point }) => point.x === editingRoom.origin.x || point.y === editingRoom.origin.y);

			const candidatePool = alignedMatches.length > 0
				? alignedMatches
				: startPointAnchors.map((anchor, index) => ({ point: anchor.point, index }));

			let bestMatch = candidatePool[0];
			let bestDistance = getPointDistance(candidatePool[0].point, editingRoom.origin);

			for (const candidate of candidatePool.slice(1)) {
				const candidateDistance = getPointDistance(candidate.point, editingRoom.origin);
				if (candidateDistance < bestDistance) {
					bestMatch = candidate;
					bestDistance = candidateDistance;
				}
			}

			const nextPlacement = getDirectionAndDistance(bestMatch.point, editingRoom.origin);
			setStartPointAnchorIndex(bestMatch.index);
			setStartPointDirection(nextPlacement.direction);
			setStartPointDistance(String(Math.max(1, Math.round(nextPlacement.distance || 24))));
		}

		setIsPlacingStartPoint(true);
	}

	function updateDraftContainer(roomId: string, patch: Partial<{ name: string; icon: string }>) {
		setDraftContainerByRoom((current) => ({
			...current,
			[roomId]: {
				name: current[roomId]?.name ?? '',
				icon: current[roomId]?.icon ?? 'inventory',
				...patch,
			},
		}));
	}

	function updatePlacedItem(roomId: string | null, placementId: string, patch: Partial<PlacedInstance>) {
		if (roomId === null) {
			if (!onUpdateStoryPlacedItems) return;
			onUpdateStoryPlacedItems(
				story.placedItems.map((entry) => (
					entry.id === placementId
						? {
							...entry,
							...patch,
						}
						: entry
				)),
			);
			return;
		}

		const room = story.rooms.find((entry) => entry.id === roomId);
		if (!room || !onUpdateRoomPlacedItems) return;
		onUpdateRoomPlacedItems(
			roomId,
			room.placedItems.map((entry) => (
				entry.id === placementId
					? {
						...entry,
						...patch,
					}
					: entry
			)),
		);
	}

	function updatePlacedRecurringTask(roomId: string | null, placementId: string, taskId: string, field: keyof ItemRecurringTask, value: ItemRecurringTask[keyof ItemRecurringTask]) {
		const placementList = roomId === null
			? story.placedItems
			: (story.rooms.find((entry) => entry.id === roomId)?.placedItems ?? []);
		const placement = placementList.find((entry) => entry.id === placementId);
		if (!placement) return;
		updatePlacedItem(roomId, placementId, {
			recurringTasks: (placement.recurringTasks ?? []).map((task) => (
				task.id === taskId ? { ...task, [field]: value } : task
			)),
		});
	}

	function updatePlacedRecurringTaskRecurrence(roomId: string | null, placementId: string, taskId: string, patch: Partial<ResourceRecurrenceRule>) {
		const placementList = roomId === null
			? story.placedItems
			: (story.rooms.find((entry) => entry.id === roomId)?.placedItems ?? []);
		const placement = placementList.find((entry) => entry.id === placementId);
		const task = placement?.recurringTasks?.find((entry) => entry.id === taskId);
		if (!placement || !task) return;
		updatePlacedRecurringTask(roomId, placementId, taskId, 'recurrence', { ...task.recurrence, ...patch });
	}

	function addPlacedRecurringTask(roomId: string | null, placementId: string) {
		const placementList = roomId === null
			? story.placedItems
			: (story.rooms.find((entry) => entry.id === roomId)?.placedItems ?? []);
		const placement = placementList.find((entry) => entry.id === placementId);
		if (!placement) return;
		const nextTaskId = uuidv4();
		updatePlacedItem(roomId, placementId, {
			recurringTasks: [
				...(placement.recurringTasks ?? []),
				{
					id: nextTaskId,
					taskTemplateRef: 'New Task',
					taskType: 'CHECK',
					recurrenceMode: 'never',
					recurrence: makeDefaultRecurrenceRule(),
					reminderLeadDays: 7,
				},
			],
		});
		setExpandedPlacedTaskId(`${placementId}:${nextTaskId}`);
	}

	function removePlacedRecurringTask(roomId: string | null, placementId: string, taskId: string) {
		const placementList = roomId === null
			? story.placedItems
			: (story.rooms.find((entry) => entry.id === roomId)?.placedItems ?? []);
		const placement = placementList.find((entry) => entry.id === placementId);
		if (!placement) return;
		updatePlacedItem(roomId, placementId, {
			recurringTasks: (placement.recurringTasks ?? []).filter((task) => task.id !== taskId),
		});
		setExpandedPlacedTaskId((current) => current === `${placementId}:${taskId}` ? null : current);
	}

	function executePlacedRecurringTask(taskName: string, taskType: string | null | undefined) {
		setExecutePlacedTaskPrompt({ name: taskName, taskType });
	}

	function confirmExecutePlacedRecurringTask() {
		if (!user) return;
		if (!executePlacedTaskPrompt) return;
		const item = addManualGTDItem({
			title: executePlacedTaskPrompt.name,
			note: 'Executed from a room facility task.',
			templateRef: null,
			taskType: executePlacedTaskPrompt.taskType ?? 'CHECK',
			parameters: { label: executePlacedTaskPrompt.name },
			resourceRef: homeId ?? null,
			dueDate: null,
		}, user);
		completeManualGTDItem(item.id, user, { label: executePlacedTaskPrompt.name });
		setExecutePlacedTaskPrompt(null);
	}

	function pushPlacedRecurringTaskReminder(placementId: string, recurringTaskId: string, taskName: string, taskType: string | null | undefined) {
		if (!user) return;
		if (isPlacedTaskInQuickActions(placementId, recurringTaskId)) return;
		const quickActionsKey = buildPlacedTaskQuickActionsKey(placementId, recurringTaskId, homeId ?? null);
		const nextTask: Task = {
			id: uuidv4(),
			templateRef: null,
			isUnique: true,
			title: taskName,
			taskType: taskType ?? 'CHECK',
			completionState: 'pending',
			completedAt: null,
			resultFields: { label: taskName },
			attachmentRef: quickActionsKey,
			resourceRef: homeId ?? null,
			location: null,
			sharedWith: null,
			questRef: null,
			actRef: null,
			secondaryTag: null,
		};

		setTask(nextTask);
		setUser({
			...user,
			lists: {
				...user.lists,
				gtdList: [...new Set([...user.lists.gtdList, nextTask.id])],
			},
		});
	}

	function pushRoomCleanTasks(summary: typeof roomSummaries[number]) {
		if (!user) return;
		const roomContainerTasks = summary.placedContainerEntries.map((entry) => ({
			placementId: entry.placement.id,
			title: `Clean ${entry.containerName}`,
		}));
		const roomFacilityTasks = summary.placedLooseItemEntries
			.filter((entry) => entry.itemKind === 'facility')
			.map((entry) => ({
				placementId: entry.placement.id,
				title: `Clean ${entry.itemName}`,
			}));

		const nextTasks = [...roomContainerTasks, ...roomFacilityTasks]
			.filter((entry) => !isPlacementCleanInQuickActions(entry.placementId))
			.map((entry) => ({
				id: uuidv4(),
				templateRef: null,
				isUnique: true,
				title: entry.title,
				taskType: 'CHECK',
				completionState: 'pending' as const,
				completedAt: null,
				resultFields: { label: entry.title },
				attachmentRef: buildPlacementCleanQuickActionsKey(entry.placementId, homeId ?? null),
				resourceRef: homeId ?? null,
				location: null,
				sharedWith: null,
				questRef: null,
				actRef: null,
				secondaryTag: null,
			} satisfies Task));

		if (nextTasks.length === 0) return;
		for (const nextTask of nextTasks) {
			setTask(nextTask);
		}
		setUser({
			...user,
			lists: {
				...user.lists,
				gtdList: [...new Set([...user.lists.gtdList, ...nextTasks.map((task) => task.id)])],
			},
		});
	}

	function togglePlacedRecurringTaskDay(roomId: string | null, placementId: string, taskId: string, day: RecurrenceDayOfWeek) {
		const placementList = roomId === null
			? story.placedItems
			: (story.rooms.find((entry) => entry.id === roomId)?.placedItems ?? []);
		const placement = placementList.find((entry) => entry.id === placementId);
		const task = placement?.recurringTasks?.find((entry) => entry.id === taskId);
		if (!placement || !task) return;
		const days = task.recurrence.days.includes(day)
			? task.recurrence.days.filter((entry) => entry !== day)
			: [...task.recurrence.days, day];
		updatePlacedRecurringTaskRecurrence(roomId, placementId, taskId, { days });
	}

	function updateRoom(roomId: string, updater: (room: FloorPlanRoom) => FloorPlanRoom) {
		onUpdateRoom?.(roomId, updater);
	}

	function updateRoomContainer(roomId: string, containerId: string, updater: (container: InventoryContainer) => InventoryContainer) {
		updateRoom(roomId, (room) => ({
			...room,
			dedicatedContainers: (room.dedicatedContainers ?? []).map((container) => (
				container.id === containerId ? updater(container) : container
			)),
		}));
	}

	function appendPlacedItemToRoom(room: FloorPlanRoom, bounds: { minX: number; minY: number; width: number; height: number }, placement: Omit<PlacedInstance, 'id' | 'x' | 'y' | 'rotation'>, placementId = uuidv4()) {
		if (!onUpdateRoomPlacedItems) return;
		onUpdateRoomPlacedItems(room.id, [
			...room.placedItems,
			{
				...placement,
				id: placementId,
				x: Math.round(bounds.minX + bounds.width / 2),
				y: Math.round(bounds.minY + bounds.height / 2),
				rotation: 0,
			},
		]);
		setSelectedPlacementId(placementId);
		setExpandedPlacedContainerId(placementId);
		setViewingContainerPlacementId(placement.kind === 'container' ? placementId : null);
	}

	function addTemplateItemToRoom(room: FloorPlanRoom, bounds: { minX: number; minY: number; width: number; height: number }, itemTemplateRef: string) {
		const resolvedItem = resolveInventoryItemTemplate(itemTemplateRef, mergeInventoryItemTemplates(userItemTemplates, room.dedicatedItems));
		const defaultSize = resolvedItem?.kind === 'facility' ? 18 : 14;
		const availableTemplates = mergeInventoryItemTemplates(userItemTemplates, room.dedicatedItems, ...inventoryResources.map((entry) => entry.itemTemplates));
		const nextPlacementId = uuidv4();
		appendPlacedItemToRoom(room, bounds, {
			kind: 'item',
			refId: itemTemplateRef,
			quantity: resolvedItem?.kind === 'facility' ? 1 : undefined,
			recurringTasks: resolvedItem?.kind === 'facility' ? buildPlacedItemRecurringTasks(nextPlacementId, itemTemplateRef, availableTemplates) : undefined,
			width: resolvedItem?.dimensions?.width ?? defaultSize,
			depth: resolvedItem?.dimensions?.depth ?? defaultSize,
		}, nextPlacementId);
		setRoomAddItemRoomId(null);
	}

	function createRoomItem(room: FloorPlanRoom, bounds: { minX: number; minY: number; width: number; height: number }, itemTemplate: InventoryItemTemplate) {
		const nextPlacementId = uuidv4();
		const width = itemTemplate.dimensions?.width ?? 14;
		const depth = itemTemplate.dimensions?.depth ?? 14;
		const availableTemplates = mergeInventoryItemTemplates(userItemTemplates, room.dedicatedItems, [itemTemplate], ...inventoryResources.map((entry) => entry.itemTemplates));
		updateRoom(room.id, (current) => ({
			...current,
			dedicatedItems: [...(current.dedicatedItems ?? []), itemTemplate],
			placedItems: [
				...current.placedItems,
				{
					id: nextPlacementId,
					kind: 'item',
					refId: itemTemplate.id,
					quantity: itemTemplate.kind === 'facility' ? 1 : undefined,
					recurringTasks: itemTemplate.kind === 'facility' ? buildPlacedItemRecurringTasks(nextPlacementId, itemTemplate.id, availableTemplates) : undefined,
					width,
					depth,
					x: Math.round(bounds.minX + bounds.width / 2),
					y: Math.round(bounds.minY + bounds.height / 2),
					rotation: 0,
				},
			],
		}));
		setSelectedPlacementId(nextPlacementId);
		setExpandedPlacedContainerId(nextPlacementId);
		setViewingContainerPlacementId(null);
		setRoomAddItemRoomId(null);
	}

	function addExistingContainerToRoom(room: FloorPlanRoom, bounds: { minX: number; minY: number; width: number; height: number }, containerId: string) {
		const record = findInventoryContainerRecord(containerId);
		appendPlacedItemToRoom(room, bounds, {
			kind: 'container',
			refId: containerId,
			width: record?.container.dimensions?.width ?? 24,
			depth: record?.container.dimensions?.depth ?? 24,
		});
		setRoomAddContainerRoomId(null);
	}

	function createRoomContainer(room: FloorPlanRoom, bounds: { minX: number; minY: number; width: number; height: number }, container: InventoryContainer) {
		const nextPlacementId = uuidv4();
		const width = container.dimensions?.width ?? 24;
		const depth = container.dimensions?.depth ?? 24;
		updateRoom(room.id, (current) => ({
			...current,
			dedicatedContainers: [...(current.dedicatedContainers ?? []), container],
			placedItems: [
				...current.placedItems,
				{
					id: nextPlacementId,
					kind: 'container',
					refId: container.id,
					width,
					depth,
					x: Math.round(bounds.minX + bounds.width / 2),
					y: Math.round(bounds.minY + bounds.height / 2),
					rotation: 0,
				},
			],
		}));
		setSelectedPlacementId(nextPlacementId);
		setExpandedPlacedContainerId(nextPlacementId);
		setViewingContainerPlacementId(nextPlacementId);
		setRoomAddContainerRoomId(null);
	}

	function updateContainerCanvasItemPlacement(itemId: string, face: ContainerFace, x: number, y: number, rotation: number) {
		if (!selectedRoomSummary || !viewedContainerEntry?.container) return;
		const apply = (container: InventoryContainer): InventoryContainer => ({
			...container,
			items: container.items.map((item) => (
				item.id === itemId
					? {
						...item,
						placedInContainer: {
							[face]: { x, y, rotation },
						},
					}
					: item
			)),
		});

		if (viewedContainerEntry.source === 'inventory') {
			updateInventoryContainer(viewedContainerEntry.container.id, apply);
			return;
		}

		updateRoomContainer(selectedRoomSummary.room.id, viewedContainerEntry.container.id, apply);
	}

	function removeContainerCanvasItemPlacement(itemId: string, face: ContainerFace) {
		if (!selectedRoomSummary || !viewedContainerEntry?.container) return;
		const apply = (container: InventoryContainer): InventoryContainer => ({
			...container,
			items: container.items.map((item) => {
				if (item.id !== itemId || !item.placedInContainer?.[face]) return item;
				return {
					...item,
					placedInContainer: undefined,
				};
			}),
		});

		if (viewedContainerEntry.source === 'inventory') {
			updateInventoryContainer(viewedContainerEntry.container.id, apply);
			return;
		}

		updateRoomContainer(selectedRoomSummary.room.id, viewedContainerEntry.container.id, apply);
	}

	function updateViewedContainerItemQuantity(itemId: string, quantity: number) {
		if (!selectedRoomSummary || !viewedContainerEntry?.container) return;
		const apply = (container: InventoryContainer): InventoryContainer => ({
			...container,
			items: container.items.map((item) => (
				item.id === itemId
					? {
						...item,
						quantity: Math.max(0, quantity),
					}
					: item
			)),
		});

		if (viewedContainerEntry.source === 'inventory') {
			updateInventoryContainer(viewedContainerEntry.container.id, apply);
			return;
		}

		updateRoomContainer(selectedRoomSummary.room.id, viewedContainerEntry.container.id, apply);
	}

	function openViewedContainerLayoutPanel() {
		if (!viewedContainerEntry?.container) return;
		const layoutGrid = viewedContainerEntry.container.layoutGrid;
		setViewedLayoutWidth(viewedContainerEntry.container.dimensions?.width ?? '');
		setViewedLayoutDepth(viewedContainerEntry.container.dimensions?.depth ?? '');
		setViewedLayoutHeight(viewedContainerEntry.container.dimensions?.height ?? '');
		setViewedLayoutActiveFace(layoutGrid?.xAxis ?? 'width-depth');
		const widthDepthGrid = resolveContainerFaceGrid(layoutGrid, 'width-depth');
		const widthHeightGrid = resolveContainerFaceGrid(layoutGrid, 'width-height');
		const depthHeightGrid = resolveContainerFaceGrid(layoutGrid, 'depth-height');
		setViewedLayoutWidthDepthGrid({ columns: String(widthDepthGrid.columns), rows: String(widthDepthGrid.rows) });
		setViewedLayoutWidthHeightGrid({ columns: String(widthHeightGrid.columns), rows: String(widthHeightGrid.rows) });
		setViewedLayoutDepthHeightGrid({ columns: String(depthHeightGrid.columns), rows: String(depthHeightGrid.rows) });
		setViewedLayoutError('');
		setShowViewedContainerLayoutPanel(true);
	}

	function updateViewedLayoutGrid(face: ContainerFace, patch: Partial<FaceGridInputDraft>) {
		const apply = (current: FaceGridInputDraft): FaceGridInputDraft => ({
			columns: patch.columns ?? current.columns,
			rows: patch.rows ?? current.rows,
		});

		if (face === 'width-depth') {
			setViewedLayoutWidthDepthGrid((current) => apply(current));
			return;
		}
		if (face === 'width-height') {
			setViewedLayoutWidthHeightGrid((current) => apply(current));
			return;
		}
		setViewedLayoutDepthHeightGrid((current) => apply(current));
	}

	function commitViewedLayoutGrid(face: ContainerFace) {
		if (face === 'width-depth') {
			setViewedLayoutWidthDepthGrid((current) => {
				const next = normaliseFaceGridInput(current);
				return { columns: String(next.columns), rows: String(next.rows) };
			});
			return;
		}
		if (face === 'width-height') {
			setViewedLayoutWidthHeightGrid((current) => {
				const next = normaliseFaceGridInput(current);
				return { columns: String(next.columns), rows: String(next.rows) };
			});
			return;
		}
		setViewedLayoutDepthHeightGrid((current) => {
			const next = normaliseFaceGridInput(current);
			return { columns: String(next.columns), rows: String(next.rows) };
		});
	}

	function applyViewedContainerLayout() {
		if (!selectedRoomSummary || !viewedContainerEntry?.container) return;

		const hasAnyDimensions = [viewedLayoutWidth, viewedLayoutDepth, viewedLayoutHeight].some((value) => value !== '');
		const hasFullDimensions = viewedLayoutWidth !== '' && viewedLayoutDepth !== '' && viewedLayoutHeight !== ''
			&& viewedLayoutWidth > 0 && viewedLayoutDepth > 0 && viewedLayoutHeight > 0;

		if (hasAnyDimensions && !hasFullDimensions) {
			setViewedLayoutError('Width, depth, and height must all be set together.');
			return;
		}

		const nextWidthDepthGrid = normaliseFaceGridInput(viewedLayoutWidthDepthGrid);
		const nextWidthHeightGrid = normaliseFaceGridInput(viewedLayoutWidthHeightGrid);
		const nextDepthHeightGrid = normaliseFaceGridInput(viewedLayoutDepthHeightGrid);

		setViewedLayoutWidthDepthGrid({ columns: String(nextWidthDepthGrid.columns), rows: String(nextWidthDepthGrid.rows) });
		setViewedLayoutWidthHeightGrid({ columns: String(nextWidthHeightGrid.columns), rows: String(nextWidthHeightGrid.rows) });
		setViewedLayoutDepthHeightGrid({ columns: String(nextDepthHeightGrid.columns), rows: String(nextDepthHeightGrid.rows) });

		const apply = (container: InventoryContainer): InventoryContainer => ({
			...container,
			dimensions: hasFullDimensions
				? {
					width: viewedLayoutWidth,
					depth: viewedLayoutDepth,
					height: viewedLayoutHeight,
				}
				: undefined,
			layoutGrid: hasFullDimensions
				? {
					xAxis: viewedLayoutActiveFace,
					columns: nextWidthDepthGrid.columns,
					rows: nextWidthDepthGrid.rows,
					widthDepth: nextWidthDepthGrid,
					widthHeight: nextWidthHeightGrid,
					depthHeight: nextDepthHeightGrid,
				}
				: undefined,
		});

		if (viewedContainerEntry.source === 'inventory') {
			updateInventoryContainer(viewedContainerEntry.container.id, apply);
		} else {
			updateRoomContainer(selectedRoomSummary.room.id, viewedContainerEntry.container.id, apply);
		}

		setViewingContainerFace(viewedLayoutActiveFace);
		setViewedLayoutError('');
		setShowViewedContainerLayoutPanel(false);
	}

	function addItemInstanceToViewedContainer(item: ItemInstance) {
		if (!selectedRoomSummary || !viewedContainerEntry?.container) return;
		const append = (container: InventoryContainer): InventoryContainer => ({
			...container,
			items: [...container.items, item],
		});

		if (viewedContainerEntry.source === 'inventory') {
			updateInventoryContainer(viewedContainerEntry.container.id, append);
		} else {
			updateRoomContainer(selectedRoomSummary.room.id, viewedContainerEntry.container.id, append);
		}

		setPendingViewedContainerItemId(item.id);
		setShowViewedContainerAddItemPanel(false);
	}

	function addTemplateItemToViewedRoomContainer(itemTemplateRef: string) {
		if (!selectedRoomSummary || !viewedContainerEntry?.container) return;
		const resolved = resolveInventoryItemTemplate(itemTemplateRef, mergeInventoryItemTemplates(userItemTemplates, selectedRoomSummary.room.dedicatedItems));
		addItemInstanceToViewedContainer({
			id: uuidv4(),
			itemTemplateRef,
			quantity: resolved?.kind === 'consumable' ? 1 : undefined,
			dimensions: resolved?.dimensions,
		});
	}

	function createRoomItemForViewedContainer(itemTemplate: InventoryItemTemplate) {
		if (!selectedRoomSummary || !viewedContainerEntry?.container) return;
		const nextItem: ItemInstance = {
			id: uuidv4(),
			itemTemplateRef: itemTemplate.id,
			quantity: itemTemplate.kind === 'consumable' ? 1 : undefined,
			dimensions: itemTemplate.dimensions,
		};

		updateRoom(selectedRoomSummary.room.id, (current) => ({
			...current,
			dedicatedItems: [...(current.dedicatedItems ?? []), itemTemplate],
			dedicatedContainers: (current.dedicatedContainers ?? []).map((container) => (
				container.id === viewedContainerEntry.container?.id
					? { ...container, items: [...container.items, nextItem] }
					: container
			)),
		}));

		setPendingViewedContainerItemId(nextItem.id);
		setShowViewedContainerAddItemPanel(false);
	}

	function removePlacedItem(roomId: string | null, placementId: string) {
		if (roomId === null) {
			if (!onUpdateStoryPlacedItems) return;
			onUpdateStoryPlacedItems(story.placedItems.filter((entry) => entry.id !== placementId));
		} else {
			const room = story.rooms.find((entry) => entry.id === roomId);
			if (!room) return;
			const removedPlacement = room.placedItems.find((entry) => entry.id === placementId) ?? null;
			const nextPlacedItems = room.placedItems.filter((entry) => entry.id !== placementId);
			const shouldPruneRoomTemplate = Boolean(
				removedPlacement
				&& removedPlacement.kind === 'item'
				&& removedPlacement.refId.startsWith('room-item-')
				&& !nextPlacedItems.some((entry) => entry.kind === 'item' && entry.refId === removedPlacement.refId),
			);

			if (shouldPruneRoomTemplate) {
				updateRoom(roomId, (current) => ({
					...current,
					placedItems: current.placedItems.filter((entry) => entry.id !== placementId),
					dedicatedItems: (current.dedicatedItems ?? []).filter((item) => item.id !== removedPlacement?.refId),
				}));
			} else {
				if (!onUpdateRoomPlacedItems) return;
				onUpdateRoomPlacedItems(roomId, nextPlacedItems);
			}
		}

		setExpandedPlacedContainerId((current) => current === placementId ? null : current);
		setEditingPlacedContainerId((current) => current === placementId ? null : current);
		setAddingItemContainerId((current) => current === placementId ? null : current);
		setSelectedPlacementId((current) => current === placementId ? null : current);
	}

	function getPreferredInventory(now: string) {
		const preferredInventory =
			inventoryResources.find((entry) => homeId && entry.linkedHomeId === homeId) ??
			[...inventoryResources].sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0] ??
			null;
		const baseInventory: InventoryResource = preferredInventory ?? {
			id: uuidv4(),
			type: 'inventory',
			name: 'Inventory',
			icon: 'inventory',
			description: '',
			attachments: [],
			log: [],
			createdAt: now,
			updatedAt: now,
			itemTemplates: undefined,
			containers: [],
			items: [],
			notes: [],
			links: undefined,
			sharedWith: null,
			linkedHomeId: homeId,
		};

		return { preferredInventory, baseInventory };
	}

	function ensureInventoryRegistered(inventoryId: string, preferredInventory: InventoryResource | null) {
		if (preferredInventory || !user) return;
		setUser({
			...user,
			resources: {
				...user.resources,
				inventory: user.resources.inventory.includes(inventoryId)
					? user.resources.inventory
					: [...user.resources.inventory.filter((id) => resources[id]?.type === 'inventory'), inventoryId],
			},
		});
	}

	function findInventoryContainerRecord(containerId: string) {
		for (const inventory of inventoryResources) {
			const container = inventory.containers?.find((candidate) => candidate.id === containerId);
			if (!container) continue;
			return {
				inventory,
				container,
				itemTemplates: mergeInventoryItemTemplates(userItemTemplates, inventory.itemTemplates),
			};
		}

		return null;
	}

	function findInventoryItemRecord(itemId: string) {
		for (const inventory of inventoryResources) {
			const item = inventory.items.find((candidate) => candidate.id === itemId);
			if (!item) continue;
			return {
				inventory,
				item,
				resolvedItem: resolveInventoryItemTemplate(item.itemTemplateRef, mergeInventoryItemTemplates(userItemTemplates, inventory.itemTemplates)),
			};
		}

		return null;
	}

	function updateInventoryContainer(containerId: string, updater: (container: NonNullable<InventoryResource['containers']>[number]) => NonNullable<InventoryResource['containers']>[number]) {
		const record = findInventoryContainerRecord(containerId);
		if (!record) return;
		const nextContainers = (record.inventory.containers ?? []).map((container) => (
			container.id === containerId ? updater(container) : container
		));
		setResource({
			...record.inventory,
			updatedAt: new Date().toISOString(),
			containers: nextContainers,
			items: record.inventory.items,
		});
	}

	function updateInventoryItem(itemId: string, updater: (item: ItemInstance) => ItemInstance) {
		const record = findInventoryItemRecord(itemId);
		if (!record) return;
		setResource({
			...record.inventory,
			updatedAt: new Date().toISOString(),
			containers: record.inventory.containers,
			items: record.inventory.items.map((item) => (
				item.id === itemId ? updater(item) : item
			)),
		});
	}

	function addItemToContainer(containerId: string, selectionKey: string) {
		const templateRef = newItemTemplateRefByContainer[selectionKey];
		if (!templateRef) return;
		const quantity = Math.max(0, Number(newItemQuantityByContainer[selectionKey] ?? '1') || 0);
		updateInventoryContainer(containerId, (container) => ({
			...container,
			items: [...container.items, { id: uuidv4(), itemTemplateRef: templateRef, quantity }],
		}));
		setNewItemQuantityByContainer((current) => ({
			...current,
			[selectionKey]: '1',
		}));
		setAddingItemContainerId(null);
	}

	function formatInventoryQuantity(item: Pick<ItemInstance, 'quantity' | 'unit'>) {
		return item.quantity != null
			? `${item.quantity}${item.unit?.trim() ? ` ${item.unit.trim()}` : ''} on hand`
			: 'Quantity not set';
	}

	function renderContainerItems(
		containerId: string,
		items: Array<{ id: string; name: string; quantity?: number; unit?: string }>,
		isEditing: boolean,
	) {
		if (items.length === 0) {
			return <div className="italic text-gray-400">No items in container.</div>;
		}

		return (
			<div className="space-y-1.5">
				{items.map((item) => (
					<div key={item.id} className="rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-gray-800/70">
						<div className="flex items-center justify-between gap-3">
							<div>
								<div className="font-medium text-gray-700 dark:text-gray-200">{item.name}</div>
								<div className="text-[11px] text-gray-500 dark:text-gray-400">{formatInventoryQuantity(item)}</div>
							</div>
							{isEditing ? (
								<label className="space-y-1 text-right">
									<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Quantity</span>
									<input
										type="number"
										min={0}
										value={item.quantity ?? 0}
										onChange={(event) => updateInventoryContainer(containerId, (container) => ({
											...container,
											items: container.items.map((containerItem) => (
												containerItem.id === item.id
													? { ...containerItem, quantity: Math.max(0, Number(event.target.value) || 0) }
													: containerItem
											)),
										}))}
										className={`${INPUT_CLS} w-20 text-right`}
									/>
								</label>
							) : null}
						</div>
					</div>
				))}
			</div>
		);
	}

	function createContainerForStory(bounds: { minX: number; minY: number; width: number; height: number }) {
		const draft = draftContainerByRoom[STORY_SCOPE_ID] ?? { name: '', icon: 'inventory' };
		if (!draft.name.trim() || !onUpdateStoryPlacedItems) return;
		const latestStoryPlacedItems = story.placedItems ?? [];

		const now = new Date().toISOString();
		const nextContainerId = uuidv4();
		const { preferredInventory, baseInventory } = getPreferredInventory(now);

		setResource({
			...baseInventory,
			updatedAt: now,
			linkedHomeId: baseInventory.linkedHomeId ?? homeId,
			containers: [
				...(baseInventory.containers ?? []),
				{
					id: nextContainerId,
					name: draft.name.trim(),
					icon: draft.icon || 'inventory',
					items: [],
					notes: [],
					attachments: [],
					links: homeId
						? [{
							id: uuidv4(),
							relationship: 'location',
							targetKind: 'home-room',
							targetResourceId: homeId,
							createdAt: now,
						}]
						: undefined,
				},
			],
			items: baseInventory.items ?? [],
		});

		ensureInventoryRegistered(baseInventory.id, preferredInventory);

		const nextPlacementId = uuidv4();
		onUpdateStoryPlacedItems([
			...latestStoryPlacedItems,
			{
				id: nextPlacementId,
				kind: 'container',
				refId: nextContainerId,
				width: 24,
				depth: 24,
				x: Math.round(bounds.minX + bounds.width / 2),
				y: Math.round(bounds.minY + bounds.height / 2),
				rotation: 0,
			},
		]);
		setSelectedPlacementId(nextPlacementId);
		setExpandedPlacedContainerId(nextPlacementId);
		setEditingPlacedContainerId(nextPlacementId);
		setDraftContainerByRoom((current) => ({
			...current,
			[STORY_SCOPE_ID]: {
				name: '',
				icon: draft.icon || 'inventory',
			},
		}));
	}

	function addLooseItemToStory(bounds: { minX: number; minY: number; width: number; height: number }) {
		if (!onUpdateStoryPlacedItems) return;
		const templateRef = newLooseItemTemplateRefByRoom[STORY_SCOPE_ID] ?? mergedItemTemplates[0]?.id ?? '';
		if (!templateRef) return;
		const quantity = Math.max(0, Number(newLooseItemQuantityByRoom[STORY_SCOPE_ID] ?? '1') || 0);

		const now = new Date().toISOString();
		const nextItemId = uuidv4();
		const nextPlacementId = uuidv4();
		const template = mergedItemTemplates.find((entry) => entry.id === templateRef) ?? null;
		const defaultSize = template?.kind === 'facility' ? 18 : 14;
		const { preferredInventory, baseInventory } = getPreferredInventory(now);

		setResource({
			...baseInventory,
			updatedAt: now,
			linkedHomeId: baseInventory.linkedHomeId ?? homeId,
			containers: baseInventory.containers ?? [],
			items: [...(baseInventory.items ?? []), { id: nextItemId, itemTemplateRef: templateRef, quantity }],
		});

		ensureInventoryRegistered(baseInventory.id, preferredInventory);

		onUpdateStoryPlacedItems([
			...story.placedItems,
			{
				id: nextPlacementId,
				kind: 'item',
				refId: nextItemId,
				quantity,
				width: defaultSize,
				depth: defaultSize,
				x: Math.round(bounds.minX + bounds.width / 2),
				y: Math.round(bounds.minY + bounds.height / 2),
				rotation: 0,
			},
		]);
		setSelectedPlacementId(nextPlacementId);
		setExpandedPlacedContainerId(nextPlacementId);
		setEditingPlacedContainerId(nextPlacementId);
		setNewLooseItemQuantityByRoom((current) => ({
			...current,
			[STORY_SCOPE_ID]: '1',
		}));
		setAddingLooseItemRoomId(null);
	}

	async function handlePhotoSelection(scopeId: string, roomId: string | null, files: FileList | null) {
		if (!files || files.length === 0) return;
		if ((roomId && !onUpdateRoomPhotos) || (!roomId && !onUpdateStoryPhotos)) return;

		setPhotoUploadBusyByScope((current) => ({ ...current, [scopeId]: true }));
		setPhotoStatusByScope((current) => ({ ...current, [scopeId]: '' }));

		const existingPhotos = roomId
			? (story.rooms.find((entry) => entry.id === roomId)?.photos ?? [])
			: (story.photos ?? []);
		const nextPhotos = [...existingPhotos];
		let addedCount = 0;
		let oversizedCount = 0;
		let failedCount = 0;

		for (const file of Array.from(files)) {
			if (file.size > ATTACHMENT_MAX_BYTES) {
				oversizedCount += 1;
				continue;
			}

			try {
				const dataUrl = await readFileAsDataUrl(file);
				if (!dataUrl || estimateDataUrlSizeBytes(dataUrl) > ATTACHMENT_MAX_BYTES) {
					oversizedCount += 1;
					continue;
				}
				nextPhotos.push(dataUrl);
				addedCount += 1;
			} catch {
				failedCount += 1;
			}
		}

		if (addedCount > 0) {
			if (roomId) {
				onUpdateRoomPhotos?.(roomId, nextPhotos);
			} else {
				onUpdateStoryPhotos?.(nextPhotos);
			}
		}

		const messages: string[] = [];
		if (addedCount > 0) messages.push(`${addedCount} photo${addedCount === 1 ? '' : 's'} added.`);
		if (oversizedCount > 0) messages.push(`${oversizedCount} too large.`);
		if (failedCount > 0) messages.push(`${failedCount} failed to load.`);
		if (messages.length === 0) messages.push('No photos added.');

		setPhotoStatusByScope((current) => ({ ...current, [scopeId]: messages.join(' ') }));
		setPhotoUploadBusyByScope((current) => ({ ...current, [scopeId]: false }));
	}

	function removePhoto(scopeId: string, roomId: string | null, photoIndex: number) {
		const existingPhotos = roomId
			? (story.rooms.find((entry) => entry.id === roomId)?.photos ?? [])
			: (story.photos ?? []);
		const nextPhotos = existingPhotos.filter((_, index) => index !== photoIndex);

		if (roomId) {
			onUpdateRoomPhotos?.(roomId, nextPhotos);
		} else {
			onUpdateStoryPhotos?.(nextPhotos);
		}

		setPhotoStatusByScope((current) => ({ ...current, [scopeId]: 'Photo removed.' }));
	}

	function renderPhotoSection(scopeId: string, photos: string[], roomId: string | null, title: string, emptyLabel: string) {
		if (!editable && photos.length === 0) return null;

		const isBusy = photoUploadBusyByScope[scopeId] === true;
		const status = photoStatusByScope[scopeId] ?? '';

		return (
			<div className="space-y-2 rounded-xl bg-gray-50 px-3 py-3 text-sm dark:bg-gray-800/60">
				<div className="flex items-center justify-between gap-2">
					<div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</div>
					{photos.length > 0 ? (
						<div className="text-[11px] text-gray-500 dark:text-gray-400">{photos.length} photo{photos.length === 1 ? '' : 's'}</div>
					) : null}
				</div>
				{photos.length === 0 ? (
					<div className="text-xs italic text-gray-400">{emptyLabel}</div>
				) : (
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
						{photos.map((photo, index) => (
							<div key={`${scopeId}-photo-${index}`} className="overflow-hidden rounded-xl bg-white ring-1 ring-black/5 dark:bg-gray-900/70">
								<img src={photo} alt={`${title} ${index + 1}`} className="h-24 w-full object-cover" />
								{editable ? (
									<button
										type="button"
										onClick={() => removePhoto(scopeId, roomId, index)}
										className="w-full border-t border-gray-200 px-2 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:border-gray-700 dark:text-red-300 dark:hover:bg-red-900/20"
									>
										Remove
									</button>
								) : null}
							</div>
						))}
					</div>
				)}
				{editable ? (
					<div className="space-y-2">
						<label className="inline-flex cursor-pointer items-center rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/50">
							<span>{isBusy ? 'Adding photo...' : 'Add photo'}</span>
							<input
								type="file"
								accept="image/*"
								capture="environment"
								multiple
								className="hidden"
								onChange={(event) => {
									const selectedFiles = event.target.files;
									event.target.value = '';
									void handlePhotoSelection(scopeId, roomId, selectedFiles);
								}}
							/>
						</label>
						<div className="text-[11px] text-gray-500 dark:text-gray-400">Photos are stored with this home layout. Max {Math.round(ATTACHMENT_MAX_BYTES / 1024)} KB each.</div>
						{status ? <div className="text-[11px] text-gray-500 dark:text-gray-400">{status}</div> : null}
					</div>
				) : null}
			</div>
		);
	}

	function renderRoomExpandedContent(summary: typeof roomSummaries[number]) {
		const { room, placedContainerEntries, placedLooseItemEntries } = summary;
		const selectedContainerEntry = placedContainerEntries.find((entry) => entry.placement.id === expandedPlacedContainerId) ?? null;
		const selectedLooseItemEntry = placedLooseItemEntries.find((entry) => entry.placement.id === expandedPlacedContainerId) ?? null;
		const hasFocusedPlacement = Boolean(selectedContainerEntry || selectedLooseItemEntry);
		const visibleContainerEntries = selectedContainerEntry ? [selectedContainerEntry] : selectedLooseItemEntry ? [] : placedContainerEntries;
		const visibleLooseItemEntries = selectedLooseItemEntry ? [selectedLooseItemEntry] : selectedContainerEntry ? [] : placedLooseItemEntries;
		const cleanablePlacementCount = placedContainerEntries.length + placedLooseItemEntries.filter((entry) => entry.itemKind === 'facility').length;

		return (
			<div className="space-y-3 border-t border-gray-200 px-4 py-4 dark:border-gray-700">
				{!hasFocusedPlacement ? (
					<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={() => {
							onSelectRoom(room.id);
							setRoomAddContainerRoomId(room.id);
						}}
						className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
					>
						Add container
					</button>
					<button
						type="button"
						onClick={() => {
							onSelectRoom(room.id);
							setRoomAddItemRoomId(room.id);
						}}
						className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
					>
						Add item
					</button>
					<button
						type="button"
						onClick={() => {
							onSelectRoom(room.id);
							pushRoomCleanTasks(summary);
						}}
						disabled={cleanablePlacementCount === 0}
						className={cleanablePlacementCount > 0 ? 'rounded-full bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white' : 'rounded-full bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-400 dark:bg-gray-700 dark:text-gray-500'}
					>
						Clean room
					</button>
					</div>
				) : null}

				{visibleContainerEntries.length > 0 ? (
				<div className="space-y-2 rounded-xl bg-gray-50 px-3 py-3 text-sm dark:bg-gray-800/60">
					<div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Container placement</div>
					{visibleContainerEntries.length === 0 ? (
						<div className="mt-2 text-xs italic text-gray-400">No placed containers.</div>
					) : (
						<div className="space-y-2">
							{visibleContainerEntries.map((entry) => {
								const isSelectedPlacement = expandedPlacedContainerId === entry.placement.id;
								const isViewing = viewingContainerPlacementId === entry.placement.id;
								const hasCleanTaskInQuickActions = isPlacementCleanInQuickActions(entry.placement.id);
								return (
									<div key={entry.placement.id} className={isSelectedPlacement ? 'rounded-xl bg-white ring-2 ring-blue-200 dark:bg-gray-900/70 dark:ring-blue-900/60' : 'rounded-xl bg-white ring-1 ring-black/5 dark:bg-gray-900/70'}>
										<button
											type="button"
											onClick={() => {
												if (isSelectedPlacement) {
													setExpandedPlacedContainerId(null);
													setSelectedPlacementId((current) => current === entry.placement.id ? null : current);
													setEditingPlacedContainerId((current) => current === entry.placement.id ? null : current);
													setAddingItemContainerId((current) => current === entry.placement.id ? null : current);
													if (viewingContainerPlacementId === entry.placement.id) {
														setViewingContainerPlacementId(null);
													}
													return;
												}

												onSelectRoom(room.id);
												setExpandedPlacedContainerId(entry.placement.id);
												setSelectedPlacementId(entry.placement.id);
												setViewingContainerPlacementId(null);
											}}
											className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
										>
											<div className="flex min-w-0 items-center gap-3">
												<IconDisplay iconKey={entry.containerIcon || 'inventory'} size={16} className="h-4 w-4 shrink-0 object-contain" alt="" />
												<div className="min-w-0">
													<div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{entry.containerName}</div>
													<div className="text-[11px] text-gray-500 dark:text-gray-400">{entry.items.length} item{entry.items.length === 1 ? '' : 's'} · {entry.inventoryName}{hasCleanTaskInQuickActions ? ' · In Quick Actions' : ''}</div>
												</div>
											</div>
											<span className="text-sm font-semibold text-blue-600 dark:text-blue-300">{isSelectedPlacement ? '↑' : '↓'}</span>
										</button>
										{isSelectedPlacement ? (
											<div className="border-t border-gray-200 px-3 py-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
												<div className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">{entry.inventoryName}</div>
												{renderContainerItems(entry.placement.refId, entry.items, false)}
												<div className="mt-3 flex flex-wrap items-center gap-2">
													<button
														type="button"
														onClick={() => {
															onSelectRoom(room.id);
															setExpandedPlacedContainerId(entry.placement.id);
															setSelectedPlacementId(entry.placement.id);
															setViewingContainerPlacementId(entry.placement.id);
															setViewingContainerFace(entry.container?.layoutGrid?.xAxis ?? 'width-depth');
														}}
														className={isViewing ? 'rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}
													>
														View
													</button>
													<button type="button" onClick={() => removePlacedItem(room.id, entry.placement.id)} className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300">Remove</button>
												</div>
											</div>
										) : null}
									</div>
								);
							})}
						</div>
					)}
				</div>
				) : null}

				{visibleLooseItemEntries.length > 0 ? (
				<div className="space-y-2 rounded-xl bg-gray-50 px-3 py-3 text-sm dark:bg-gray-800/60">
					<div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Room items</div>
					{visibleLooseItemEntries.length === 0 ? (
						<div className="mt-2 text-xs italic text-gray-400">No placed room items.</div>
					) : (
						<div className="space-y-2">
							{visibleLooseItemEntries.map((entry) => {
								const isSelectedPlacement = expandedPlacedContainerId === entry.placement.id;
								const quantityValue = entry.placement.quantity ?? entry.quantity;
								const quantityLabel = quantityValue != null ? `${quantityValue}${entry.unit?.trim() ? ` ${entry.unit.trim()}` : ''}` : 'No quantity';
								const isFacilityItem = entry.itemKind === 'facility';
								const facilityTasks = entry.itemKind === 'facility' ? entry.recurringTasks ?? [] : [];
								const isConsumableItem = entry.itemKind === 'consumable';
								const hasCleanTaskInQuickActions = isFacilityItem && isPlacementCleanInQuickActions(entry.placement.id);
								return (
									<div key={entry.placement.id} className={isSelectedPlacement ? 'rounded-xl bg-white ring-2 ring-blue-200 dark:bg-gray-900/70 dark:ring-blue-900/60' : 'rounded-xl bg-white ring-1 ring-black/5 dark:bg-gray-900/70'}>
										<button
											type="button"
											onClick={() => {
												if (isSelectedPlacement) {
													setExpandedPlacedContainerId(null);
													setSelectedPlacementId((current) => current === entry.placement.id ? null : current);
													setEditingPlacedContainerId((current) => current === entry.placement.id ? null : current);
													if (viewingContainerPlacementId === entry.placement.id) {
														setViewingContainerPlacementId(null);
													}
													return;
												}

												onSelectRoom(room.id);
												setExpandedPlacedContainerId(entry.placement.id);
												setSelectedPlacementId(entry.placement.id);
												setViewingContainerPlacementId(null);
											}}
											className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
										>
											<div className="flex min-w-0 items-center gap-3">
												<IconDisplay iconKey={entry.itemIcon || 'inventory'} size={16} className="h-4 w-4 shrink-0 object-contain" alt="" />
												<div className="min-w-0">
													<div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{entry.itemName}</div>
													<div className="text-[11px] text-gray-500 dark:text-gray-400">{quantityLabel}{entry.threshold != null ? ` · Threshold ${entry.threshold}` : ''} · {entry.inventoryName}{hasCleanTaskInQuickActions ? ' · In Quick Actions' : ''}</div>
												</div>
											</div>
											<span className="text-sm font-semibold text-blue-600 dark:text-blue-300">{isSelectedPlacement ? '↑' : '↓'}</span>
										</button>
										{isSelectedPlacement ? (
											<div className="border-t border-gray-200 px-3 py-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
												<div className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">{entry.inventoryName}</div>
												<div className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">{quantityLabel}{entry.threshold != null ? ` · Threshold ${entry.threshold}` : ''}</div>
												{isFacilityItem ? (
													<div className="mb-2 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/70">
														<div className="mb-2 flex items-center justify-between gap-2">
															<div className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Tasks</div>
															<button type="button" onClick={() => addPlacedRecurringTask(room.id, entry.placement.id)} className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-200 dark:hover:bg-blue-900/40">Add task</button>
														</div>
														<div className="space-y-2">
															{facilityTasks.length === 0 ? <div className="text-[11px] italic text-gray-400 dark:text-gray-500">No tasks added yet.</div> : null}
															{facilityTasks.map((task) => {
																const taskDisplay = resolvePlacedTaskDisplay(task.taskTemplateRef, entry.itemTemplateRef, mergedItemTemplates);
																const isBuiltInTask = (entry.itemTasks ?? []).some((templateTask) => templateTask.taskTemplateRef === task.taskTemplateRef);
																const isTaskInQuickActions = isPlacedTaskInQuickActions(entry.placement.id, task.id);
																const taskExpandKey = `${entry.placement.id}:${task.id}`;
																const isTaskExpanded = expandedPlacedTaskId === taskExpandKey;
																return (
																	<div key={task.id} className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/70">
																		<button
																			type="button"
																			onClick={() => setExpandedPlacedTaskId((current) => current === taskExpandKey ? null : taskExpandKey)}
																			className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
																		>
																			<div className="min-w-0 flex items-center gap-2">
																				<IconDisplay iconKey={taskDisplay.icon} size={14} className="h-4 w-4 shrink-0 object-contain" alt="" />
																				<div className="min-w-0">
																					<div className="truncate text-xs font-medium text-gray-800 dark:text-gray-100">{taskDisplay.name}</div>
																					<div className="text-[11px] text-gray-500 dark:text-gray-400">
																						{normalizeRecurrenceMode(task.recurrenceMode) === 'recurring'
																							? `${describeTaskRecurrence(task.recurrence)} · ${describeReminder(task.reminderLeadDays ?? 7)}`
																							: 'Intermittent'}
																					</div>
																				</div>
																			</div>
																			<span className="text-[11px] font-medium text-blue-500">{isTaskExpanded ? 'Close' : 'Edit'}</span>
																		</button>
																		{isTaskExpanded ? (
																			<div className="space-y-3 border-t border-gray-200 px-3 py-3 dark:border-gray-700">
																				<div className={`grid gap-2 ${isBuiltInTask ? '' : 'sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end'}`}>
																					{isBuiltInTask ? (
																						<div className="space-y-1">
																							<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Task</span>
																							<div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-100">{taskDisplay.name}</div>
																						</div>
																					) : (
																						<>
																							<label className="space-y-1">
																								<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Task name</span>
																								<input value={task.taskTemplateRef} onChange={(event) => updatePlacedRecurringTask(room.id, entry.placement.id, task.id, 'taskTemplateRef', event.target.value)} className={`${INPUT_CLS} w-full`} />
																							</label>
																							<button type="button" onClick={() => removePlacedRecurringTask(room.id, entry.placement.id, task.id)} className="rounded-full bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 sm:self-end">Remove task</button>
																						</>
																					)}
																				</div>
																				<div className={`grid gap-2 ${isBuiltInTask ? 'sm:grid-cols-[12rem]' : 'sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end'}`}>
																					{isBuiltInTask ? null : (
																						<label className="space-y-1">
																							<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Task type</span>
																							<select value={task.taskType ?? 'CHECK'} onChange={(event) => updatePlacedRecurringTask(room.id, entry.placement.id, task.id, 'taskType', event.target.value)} className={`${INPUT_CLS} w-full`}>
																								{TASK_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
																							</select>
																						</label>
																					)}
																					<div className="flex rounded-full bg-gray-100 p-1 dark:bg-gray-900/60">
																						{(['recurring', 'never'] as const).map((mode) => (
																							<button
																								key={mode}
																								type="button"
																								onClick={() => updatePlacedRecurringTask(room.id, entry.placement.id, task.id, 'recurrenceMode', mode)}
																								className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
																									normalizeRecurrenceMode(task.recurrenceMode) === mode
																										? 'bg-blue-500 text-white'
																										: 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
																								}`}
																							>
																								{mode === 'recurring' ? 'Recurring' : 'Intermittent'}
																							</button>
																						))}
																					</div>
																				</div>
																				{normalizeRecurrenceMode(task.recurrenceMode) === 'recurring' ? (
																					<div className="space-y-2 rounded-md border border-gray-200 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-800/70">
																						<div className="flex items-center gap-2">
																							<span className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">Frequency</span>
																							<select value={task.recurrence.frequency} onChange={(event) => updatePlacedRecurringTaskRecurrence(room.id, entry.placement.id, task.id, {
																								frequency: event.target.value as ResourceRecurrenceRule['frequency'],
																								days: event.target.value === 'weekly' ? task.recurrence.days : [],
																								monthlyDay: event.target.value === 'monthly' ? (task.recurrence.monthlyDay ?? getDayOfMonth(task.recurrence.seedDate)) : null,
																							})} className={`ml-auto w-36 ${INPUT_CLS}`}>
																								<option value="daily">Daily</option>
																								<option value="weekly">Weekly</option>
																								<option value="monthly">Monthly</option>
																								<option value="yearly">Yearly</option>
																							</select>
																						</div>
																						{task.recurrence.frequency === 'monthly' ? (
																							<div className="grid grid-cols-2 gap-2">
																								<label className="space-y-1"><span className="text-xs font-medium text-gray-500 dark:text-gray-400">Every</span><input type="number" min={1} max={99} value={task.recurrence.interval} onChange={(event) => updatePlacedRecurringTaskRecurrence(room.id, entry.placement.id, task.id, { interval: Math.max(1, Number(event.target.value) || 1) })} className={INPUT_CLS} /></label>
																								<label className="space-y-1"><span className="text-xs font-medium text-gray-500 dark:text-gray-400">Day of month</span><input type="number" min={1} max={31} value={task.recurrence.monthlyDay ?? getDayOfMonth(task.recurrence.seedDate)} onChange={(event) => updatePlacedRecurringTaskRecurrence(room.id, entry.placement.id, task.id, { monthlyDay: Math.min(31, Math.max(1, Number(event.target.value) || 1)) })} className={INPUT_CLS} /></label>
																							</div>
																						) : (
																							<label className="space-y-1"><span className="text-xs font-medium text-gray-500 dark:text-gray-400">Interval</span><input type="number" min={1} max={99} value={task.recurrence.interval} onChange={(event) => updatePlacedRecurringTaskRecurrence(room.id, entry.placement.id, task.id, { interval: Math.max(1, Number(event.target.value) || 1) })} className={INPUT_CLS} /></label>
																						)}
																						{task.recurrence.frequency === 'weekly' ? (
																							<div className="space-y-1"><label className="text-xs font-medium text-gray-500 dark:text-gray-400">Days</label><div className="flex gap-1">{DOW_LABELS.map(({ key, label }) => <button key={key} type="button" onClick={() => togglePlacedRecurringTaskDay(room.id, entry.placement.id, task.id, key)} className={`h-7 w-7 rounded text-xs font-medium transition-colors ${task.recurrence.days.includes(key) ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}>{label}</button>)}</div></div>
																						) : null}
																						<label className="space-y-1"><span className="text-xs font-medium text-gray-500 dark:text-gray-400">Start date</span><input type="date" value={task.recurrence.seedDate} onChange={(event) => updatePlacedRecurringTaskRecurrence(room.id, entry.placement.id, task.id, { seedDate: event.target.value, monthlyDay: task.recurrence.frequency === 'monthly' ? (task.recurrence.monthlyDay ?? getDayOfMonth(event.target.value)) : task.recurrence.monthlyDay })} className={INPUT_CLS} /></label>
																						<label className="space-y-1"><span className="text-xs font-medium text-gray-500 dark:text-gray-400">Ends on</span><input type="date" value={task.recurrence.endsOn ?? ''} onChange={(event) => updatePlacedRecurringTaskRecurrence(room.id, entry.placement.id, task.id, { endsOn: event.target.value || null })} className={INPUT_CLS} /></label>
																						<div className="flex items-center gap-2"><span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">Reminder:</span><select value={task.reminderLeadDays ?? 7} onChange={(event) => updatePlacedRecurringTask(room.id, entry.placement.id, task.id, 'reminderLeadDays', Number(event.target.value))} className={`ml-auto w-40 ${INPUT_CLS}`}><option value={-1}>No reminder</option><option value={0}>Day of</option><option value={1}>1 day before</option><option value={3}>3 days before</option><option value={7}>7 days before</option><option value={14}>14 days before</option><option value={30}>30 days before</option></select></div>
																					</div>
																				) : (
																					<div className="flex flex-wrap items-center gap-2">
																						<button type="button" onClick={() => executePlacedRecurringTask(taskDisplay.name, task.taskType)} className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-200 dark:hover:bg-emerald-900/40">Execute</button>
																						<button type="button" disabled={isTaskInQuickActions} onClick={() => { if (!isTaskInQuickActions) pushPlacedRecurringTaskReminder(entry.placement.id, task.id, taskDisplay.name, task.taskType); }} className={isTaskInQuickActions ? 'rounded-full bg-sky-100 px-3 py-2 text-xs font-semibold text-sky-700 dark:bg-sky-900/30 dark:text-sky-200' : 'rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-200 dark:hover:bg-amber-900/40'}>{isTaskInQuickActions ? 'In Quick Actions' : 'Push Reminder'}</button>
																					</div>
																				)}
																			</div>
																		) : null}
																	</div>
																);
															})}
														</div>
													</div>
												) : null}
												{isConsumableItem ? (
													<div className="rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-800/70">
														<label className="block max-w-[10rem] space-y-1">
															<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Quantity</span>
															<input type="number" min={0} value={quantityValue ?? 0} onChange={(event) => updatePlacedItem(room.id, entry.placement.id, { quantity: Math.max(0, Number(event.target.value) || 0) })} className={`${INPUT_CLS} w-full`} />
														</label>
													</div>
												) : (
													<div className="flex flex-wrap items-end gap-2 rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-800/70 sm:flex-nowrap">
														<label className="min-w-0 flex-1 space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">W</span><input type="number" min={0} value={entry.placement.width} onChange={(event) => updatePlacedItem(room.id, entry.placement.id, { width: Math.max(0, Number(event.target.value) || 0) })} className={`${INPUT_CLS} w-full`} /></label>
														<label className="min-w-0 flex-1 space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">D</span><input type="number" min={0} value={entry.placement.depth} onChange={(event) => updatePlacedItem(room.id, entry.placement.id, { depth: Math.max(0, Number(event.target.value) || 0) })} className={`${INPUT_CLS} w-full`} /></label>
														<button type="button" onClick={() => updatePlacedItem(room.id, entry.placement.id, { rotation: ((entry.placement.rotation ?? 0) + 30) % 360 })} className="rounded-full bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-200 dark:hover:bg-blue-900/40 sm:self-end">Rotate +30°</button>
													</div>
												)}
												<div className="mt-3 flex flex-wrap items-center gap-2">
													<div className="text-[11px] text-gray-500 dark:text-gray-400">Drag the selected footprint on the canvas to move it.</div>
													<button type="button" onClick={() => removePlacedItem(room.id, entry.placement.id)} className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300">Remove</button>
												</div>
											</div>
										) : null}
									</div>
								);
							})}
						</div>
					)}
				</div>
				) : null}

				{!hasFocusedPlacement ? renderPhotoSection(room.id, room.photos ?? [], room.id, 'Room photos', 'No room photos attached.') : null}

				{!hasFocusedPlacement ? (
				<div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
					<button type="button" onClick={() => { onSelectRoom(room.id); onStartEditRoom?.(room); }} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">Edit room</button>
					<button type="button" onClick={() => onDeleteRoom?.(room.id)} className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300">Delete room</button>
				</div>
				) : null}
			</div>
		);
	}

	function removeLastSegment() {
		if (!editable) return;
		if (editingStoryOutline && onEditingStoryOutlineChange) {
			if (editingStoryOutline.segments.length === 0) return;
			setSelectedSegmentIndex((current) => (
				current == null ? null : Math.min(current, editingStoryOutline.segments.length - 2)
			));
			onEditingStoryOutlineChange({
				...editingStoryOutline,
				segments: editingStoryOutline.segments.slice(0, -1),
			});
			return;
		}
		if (!editingRoom || !onEditingRoomChange || editingRoom.segments.length === 0) return;
		setSelectedSegmentIndex((current) => (
			current == null ? null : Math.min(current, editingRoom.segments.length - 2)
		));
		onEditingRoomChange({
			...editingRoom,
			segments: editingRoom.segments.slice(0, -1),
		});
	}

	function getWorldPoint(event: React.PointerEvent<Element>) {
		const svgElement = svgRef.current ?? (event.currentTarget instanceof SVGElement ? event.currentTarget.ownerSVGElement : null);
		if (!svgElement) return { x: 0, y: 0 };
		const rect = svgElement.getBoundingClientRect();
		const svgX = ((event.clientX - rect.left) / rect.width) * VIEWBOX_WIDTH;
		const svgY = ((event.clientY - rect.top) / rect.height) * VIEWBOX_HEIGHT;
		return {
			x: Math.round((svgX - pan.x) / zoom),
			y: Math.round((svgY - pan.y) / zoom),
		};
	}

	function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
		if (interaction.type === 'drag-container') {
			const nextPoint = getWorldPoint(event);
			updatePlacedItem(interaction.roomId, interaction.placementId, {
				x: Math.round(nextPoint.x - interaction.offsetX),
				y: Math.round(nextPoint.y - interaction.offsetY),
			});
			return;
		}

		if (interaction.type === 'drag-origin' && editingStoryOutline && onEditingStoryOutlineChange) {
			const nextPoint = getWorldPoint(event);
			onEditingStoryOutlineChange({ ...editingStoryOutline, origin: nextPoint });
			return;
		}

		if (interaction.type === 'drag-origin' && editingRoom && onEditingRoomChange) {
			const nextPoint = getWorldPoint(event);
			onEditingRoomChange({ ...editingRoom, origin: nextPoint });
		}
	}

	function handlePointerUp() {
		setInteraction({ type: 'idle' });
	}

	const outsideRoomsPanel = !editingRoom && !editingStoryOutline ? (
		<div className="border-t border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-950/40">
			<div className="mx-auto w-full max-w-4xl space-y-2">
				<div className="rounded-2xl bg-white/95 shadow-sm ring-1 ring-black/5 backdrop-blur dark:bg-gray-900/95">
					<button
						type="button"
						onClick={() => setIsOutsideRoomsExpanded((current) => !current)}
						className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
					>
						<div>
							<div className="text-sm font-semibold text-gray-800 dark:text-gray-100">Outside rooms</div>
							<div className="text-xs text-gray-500 dark:text-gray-400">
								{outsidePlacedContainerEntries.length} container{outsidePlacedContainerEntries.length === 1 ? '' : 's'} and {outsidePlacedLooseItemCount} item{outsidePlacedLooseItemCount === 1 ? '' : 's'} on the story canvas{(story.photos?.length ?? 0) > 0 ? ` · ${story.photos?.length ?? 0} photo${(story.photos?.length ?? 0) === 1 ? '' : 's'}` : ''}.
							</div>
						</div>
						<span className="text-base font-semibold text-blue-600 dark:text-blue-300">{isOutsideRoomsExpanded ? '↑' : '↓'}</span>
					</button>
					{isOutsideRoomsExpanded ? (
						<div className="space-y-3 border-t border-gray-200 px-4 py-4 dark:border-gray-700">
							<div className="space-y-2 rounded-xl bg-gray-50 px-3 py-3 text-sm dark:bg-gray-800/60">
								<div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Outside containers</div>
								{outsidePlacedContainerEntries.length === 0 ? <div className="mt-2 text-xs italic text-gray-400">No containers outside rooms.</div> : <div className="space-y-2">{outsidePlacedContainerEntries.map((entry) => { const isExpanded = expandedPlacedContainerId === entry.placement.id; const isEditing = editingPlacedContainerId === entry.placement.id; const isAddingItem = addingItemContainerId === entry.placement.id; const containerRecord = findInventoryContainerRecord(entry.placement.refId); const itemOptions = containerRecord?.itemTemplates ?? []; const selectedTemplateRef = newItemTemplateRefByContainer[entry.placement.id] ?? itemOptions[0]?.id ?? ''; return <div key={`outside-container-${entry.placement.id}`} className="rounded-xl bg-white ring-1 ring-black/5 dark:bg-gray-900/70"><button type="button" onClick={() => { if (isExpanded) { setExpandedPlacedContainerId(null); setEditingPlacedContainerId((current) => current === entry.placement.id ? null : current); if (editingPlacedContainerId === entry.placement.id) setEditingContainersRoomId((current) => current === STORY_SCOPE_ID ? null : current); setAddingItemContainerId((current) => current === entry.placement.id ? null : current); setSelectedPlacementId((current) => current === entry.placement.id ? null : current); return; } setExpandedPlacedContainerId(entry.placement.id); setSelectedPlacementId(entry.placement.id); }} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"><div className="flex items-center gap-2"><IconDisplay iconKey={entry.containerIcon || 'inventory'} size={16} className="h-4 w-4 object-contain" alt="" /><div className="font-semibold text-gray-800 dark:text-gray-100">{entry.containerName}</div></div><span className="text-sm font-semibold text-gray-500 dark:text-gray-300">{isExpanded ? '↑' : '↓'}</span></button>{isExpanded ? <div className="border-t border-gray-200 px-3 py-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300"><div className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">{entry.inventoryName}</div>{renderContainerItems(entry.placement.refId, entry.items, isEditing)}<div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={() => { const nextEditingId = editingPlacedContainerId === entry.placement.id ? null : entry.placement.id; setEditingPlacedContainerId(nextEditingId); setSelectedPlacementId(entry.placement.id); setEditingContainersRoomId(nextEditingId ? STORY_SCOPE_ID : null); }} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">{isEditing ? 'Done editing container' : 'Edit container'}</button><button type="button" onClick={() => { setAddingItemContainerId((current) => current === entry.placement.id ? null : entry.placement.id); if (!newItemTemplateRefByContainer[entry.placement.id] && itemOptions[0]?.id) setNewItemTemplateRefByContainer((current) => ({ ...current, [entry.placement.id]: itemOptions[0].id })); if (!newItemQuantityByContainer[entry.placement.id]) setNewItemQuantityByContainer((current) => ({ ...current, [entry.placement.id]: '1' })); }} className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/50">Add item</button></div>{isEditing ? <div className="mt-3 grid gap-2 rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-800/70 md:grid-cols-3"><div className="md:col-span-3"><IconPicker value={entry.containerIcon || 'inventory'} onChange={(value) => updateInventoryContainer(entry.placement.refId, (container) => ({ ...container, icon: value }))} align="left" /></div><label className="space-y-1 md:col-span-3"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Container name</span><input value={entry.containerName} onChange={(event) => updateInventoryContainer(entry.placement.refId, (container) => ({ ...container, name: event.target.value }))} className={`${INPUT_CLS} w-full`} /></label><label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">X</span><input type="number" value={entry.placement.x} onChange={(event) => updatePlacedItem(null, entry.placement.id, { x: Number(event.target.value) || 0 })} className={`${INPUT_CLS} w-full`} /></label><label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Y</span><input type="number" value={entry.placement.y} onChange={(event) => updatePlacedItem(null, entry.placement.id, { y: Number(event.target.value) || 0 })} className={`${INPUT_CLS} w-full`} /></label><label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Rotation</span><input type="number" step={5} value={entry.placement.rotation} onChange={(event) => updatePlacedItem(null, entry.placement.id, { rotation: Number(event.target.value) || 0 })} className={`${INPUT_CLS} w-full`} /></label><label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Width</span><input type="number" min={1} value={entry.placement.width} onChange={(event) => updatePlacedItem(null, entry.placement.id, { width: Math.max(1, Number(event.target.value) || 1) })} className={`${INPUT_CLS} w-full`} /></label><label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Depth</span><input type="number" min={1} value={entry.placement.depth} onChange={(event) => updatePlacedItem(null, entry.placement.id, { depth: Math.max(1, Number(event.target.value) || 1) })} className={`${INPUT_CLS} w-full`} /></label></div> : null}{isAddingItem ? <div className="mt-3 flex flex-col gap-2 rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-800/70 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Item</span><select value={selectedTemplateRef} onChange={(event) => setNewItemTemplateRefByContainer((current) => ({ ...current, [entry.placement.id]: event.target.value }))} className={`${INPUT_CLS} w-full`}>{itemOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Quantity</span><input type="number" min={0} value={newItemQuantityByContainer[entry.placement.id] ?? '1'} onChange={(event) => setNewItemQuantityByContainer((current) => ({ ...current, [entry.placement.id]: event.target.value }))} className={`${INPUT_CLS} w-full`} /></label><button type="button" disabled={!selectedTemplateRef || itemOptions.length === 0} onClick={() => addItemToContainer(entry.placement.refId, entry.placement.id)} className="w-full rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 sm:w-auto">Add</button></div> : null}</div> : null}</div>; })}</div>}
							</div>
							<div className="space-y-2 rounded-xl bg-gray-50 px-3 py-3 text-sm dark:bg-gray-800/60">
								<div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Outside items</div>
								{outsidePlacedLooseItemEntries.length === 0 ? <div className="mt-2 text-xs italic text-gray-400">No items outside rooms.</div> : <div className="space-y-2">{outsidePlacedLooseItemEntries.map((entry) => { const isExpanded = expandedPlacedContainerId === entry.placement.id; const isEditing = editingPlacedContainerId === entry.placement.id; const quantityLabel = entry.quantity != null ? `${entry.quantity}${entry.unit?.trim() ? ` ${entry.unit.trim()}` : ''} on hand` : 'Quantity not set'; return <div key={`outside-loose-${entry.placement.id}`} className="rounded-xl bg-white ring-1 ring-black/5 dark:bg-gray-900/70"><button type="button" onClick={() => { if (isExpanded) { setExpandedPlacedContainerId(null); setEditingPlacedContainerId((current) => current === entry.placement.id ? null : current); if (editingPlacedContainerId === entry.placement.id) setEditingContainersRoomId((current) => current === STORY_SCOPE_ID ? null : current); setSelectedPlacementId((current) => current === entry.placement.id ? null : current); return; } setExpandedPlacedContainerId(entry.placement.id); setSelectedPlacementId(entry.placement.id); }} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"><div className="flex items-center gap-2"><IconDisplay iconKey={entry.itemIcon || 'inventory'} size={16} className="h-4 w-4 object-contain" alt="" /><div><div className="font-semibold text-gray-800 dark:text-gray-100">{entry.itemName}</div><div className="text-[11px] text-gray-500 dark:text-gray-400">{quantityLabel}</div></div></div><span className="text-sm font-semibold text-gray-500 dark:text-gray-300">{isExpanded ? '↑' : '↓'}</span></button>{isExpanded ? <div className="border-t border-gray-200 px-3 py-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300"><div className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">{entry.inventoryName}</div><div className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">{quantityLabel}{entry.threshold != null ? ` · Threshold ${entry.threshold}` : ''}</div><div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={() => { const nextEditingId = editingPlacedContainerId === entry.placement.id ? null : entry.placement.id; setEditingPlacedContainerId(nextEditingId); setSelectedPlacementId(entry.placement.id); setEditingContainersRoomId(nextEditingId ? STORY_SCOPE_ID : null); }} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">{isEditing ? 'Done editing item' : 'Edit item'}</button></div>{isEditing ? <div className="mt-3 grid gap-2 rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-800/70 md:grid-cols-3"><label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">X</span><input type="number" value={entry.placement.x} onChange={(event) => updatePlacedItem(null, entry.placement.id, { x: Number(event.target.value) || 0 })} className={`${INPUT_CLS} w-full`} /></label><label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Y</span><input type="number" value={entry.placement.y} onChange={(event) => updatePlacedItem(null, entry.placement.id, { y: Number(event.target.value) || 0 })} className={`${INPUT_CLS} w-full`} /></label><label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Rotation</span><input type="number" step={5} value={entry.placement.rotation} onChange={(event) => updatePlacedItem(null, entry.placement.id, { rotation: Number(event.target.value) || 0 })} className={`${INPUT_CLS} w-full`} /></label><label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Width</span><input type="number" min={1} value={entry.placement.width} onChange={(event) => updatePlacedItem(null, entry.placement.id, { width: Math.max(1, Number(event.target.value) || 1) })} className={`${INPUT_CLS} w-full`} /></label><label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Depth</span><input type="number" min={1} value={entry.placement.depth} onChange={(event) => updatePlacedItem(null, entry.placement.id, { depth: Math.max(1, Number(event.target.value) || 1) })} className={`${INPUT_CLS} w-full`} /></label><label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Quantity</span><input type="number" min={0} value={entry.quantity ?? 0} onChange={(event) => updateInventoryItem(entry.placement.refId, (item) => ({ ...item, quantity: Math.max(0, Number(event.target.value) || 0) }))} className={`${INPUT_CLS} w-full`} /></label><label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Threshold</span><input type="number" min={0} value={entry.threshold ?? ''} onChange={(event) => updateInventoryItem(entry.placement.refId, (item) => ({ ...item, threshold: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value) || 0) }))} className={`${INPUT_CLS} w-full`} /></label><label className="space-y-1 md:col-span-3"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Unit</span><input value={entry.unit ?? ''} onChange={(event) => updateInventoryItem(entry.placement.refId, (item) => ({ ...item, unit: event.target.value }))} className={`${INPUT_CLS} w-full`} /></label></div> : null}</div> : null}</div>; })}</div>}
							</div>
							{renderPhotoSection(STORY_SCOPE_ID, story.photos ?? [], null, 'Outside photos', 'No outside photos attached.')}
							<div className="flex justify-start">
								<div className="flex flex-wrap items-center gap-2">
									<button type="button" onClick={() => { onSelectRoom(null); setIsOutsideRoomsExpanded(true); setAddingLooseItemRoomId(null); setEditingContainersRoomId(STORY_SCOPE_ID); }} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Add container</button>
									<button type="button" onClick={() => { onSelectRoom(null); setIsOutsideRoomsExpanded(true); setEditingContainersRoomId(null); setAddingLooseItemRoomId((current) => current === STORY_SCOPE_ID ? null : STORY_SCOPE_ID); if (!newLooseItemTemplateRefByRoom[STORY_SCOPE_ID] && mergedItemTemplates[0]?.id) setNewLooseItemTemplateRefByRoom((current) => ({ ...current, [STORY_SCOPE_ID]: mergedItemTemplates[0].id })); if (!newLooseItemQuantityByRoom[STORY_SCOPE_ID]) setNewLooseItemQuantityByRoom((current) => ({ ...current, [STORY_SCOPE_ID]: '1' })); }} className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600">Add item</button>
								</div>
							</div>
							{editingContainersRoomId === STORY_SCOPE_ID ? <div className="rounded-xl bg-gray-50 px-3 py-3 text-sm dark:bg-gray-800/60"><div className="flex flex-wrap items-end gap-3"><IconPicker value={(draftContainerByRoom[STORY_SCOPE_ID] ?? { icon: 'inventory' }).icon} onChange={(value) => updateDraftContainer(STORY_SCOPE_ID, { icon: value })} align="left" /><label className="min-w-[14rem] flex-1 space-y-1"><span className="text-xs font-medium text-gray-600 dark:text-gray-300">Container name</span><input value={(draftContainerByRoom[STORY_SCOPE_ID] ?? { name: '', icon: 'inventory' }).name} onChange={(event) => updateDraftContainer(STORY_SCOPE_ID, { name: event.target.value })} className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" placeholder="e.g. Entry basket" /></label><button type="button" disabled={!(draftContainerByRoom[STORY_SCOPE_ID] ?? { name: '' }).name.trim()} onClick={() => createContainerForStory(storyOutlinePoints.length > 0 ? getPointsBounds(storyOutlinePoints) : { minX: 120, minY: 110, width: 160, height: 120 })} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">Create container</button><button type="button" onClick={() => setEditingContainersRoomId(null)} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">Done</button></div><div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">Creates a new container outside the rooms on this story. Drag the new footprint on the canvas to place it.</div></div> : null}
							{addingLooseItemRoomId === STORY_SCOPE_ID ? <div className="rounded-xl bg-gray-50 px-3 py-3 text-sm dark:bg-gray-800/60"><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto_auto] sm:items-end"><label className="min-w-0 space-y-1"><span className="text-xs font-medium text-gray-600 dark:text-gray-300">Item</span><select value={newLooseItemTemplateRefByRoom[STORY_SCOPE_ID] ?? mergedItemTemplates[0]?.id ?? ''} onChange={(event) => setNewLooseItemTemplateRefByRoom((current) => ({ ...current, [STORY_SCOPE_ID]: event.target.value }))} className={`${INPUT_CLS} w-full`}>{mergedItemTemplates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="space-y-1"><span className="text-xs font-medium text-gray-600 dark:text-gray-300">Quantity</span><input type="number" min={0} value={newLooseItemQuantityByRoom[STORY_SCOPE_ID] ?? '1'} onChange={(event) => setNewLooseItemQuantityByRoom((current) => ({ ...current, [STORY_SCOPE_ID]: event.target.value }))} className={`${INPUT_CLS} w-full`} /></label><button type="button" disabled={mergedItemTemplates.length === 0} onClick={() => addLooseItemToStory(storyOutlinePoints.length > 0 ? getPointsBounds(storyOutlinePoints) : { minX: 120, minY: 110, width: 160, height: 120 })} className="w-full rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-40 sm:w-auto">Create item</button><button type="button" onClick={() => setAddingLooseItemRoomId(null)} className="w-full rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 sm:w-auto">Done</button></div><div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">Creates a loose item outside the rooms on this story. Drag the new footprint on the canvas to place it.</div></div> : null}
						</div>
					) : null}
				</div>
			</div>
		</div>
	) : null;

	return (
		<div className="space-y-3">
			<div className="overflow-visible rounded-xl border border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900/60">
				<div className="flex items-center justify-between gap-3 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
					<div>
						<div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{story.name}</div>
						<div className="text-xs text-gray-500 dark:text-gray-400">
							{story.rooms.length} room{story.rooms.length === 1 ? '' : 's'} in this story{story.outlineOrigin && (story.outlineSegments?.length ?? 0) > 0 ? ' · outline set' : ' · no outline'}
						</div>
					</div>
					{editable && !editingRoom && !editingStoryOutline ? (
						<button type="button" onClick={onStartCreateRoom} className="rounded-md bg-blue-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-600">Outline room</button>
					) : null}
				</div>
				{roomEditorPanel}

				<div className="relative">
					{viewedContainerEntry?.container ? (
						<div className="space-y-3 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-sm ring-1 ring-black/5 backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{viewedContainerEntry.containerName}</div>
									<div className="text-xs text-gray-500 dark:text-gray-400">{viewedContainerEntry.inventoryName}</div>
								</div>
							</div>
							<ContainerLayoutCanvas
								container={viewedContainerEntry.container}
								activeFace={viewingContainerFace}
								items={viewedContainerEntry.container.items}
								isEditMode
								viewportHeightClassName="h-[26rem] md:h-[30rem]"
								pendingSelectedItemId={pendingViewedContainerItemId}
								onPendingSelectedItemHandled={() => setPendingViewedContainerItemId(null)}
								onPlaceItem={updateContainerCanvasItemPlacement}
								onUpdateItemQuantity={updateViewedContainerItemQuantity}
								onRemoveItem={removeContainerCanvasItemPlacement}
							/>
							<div className="space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
								<div className="flex flex-wrap items-center gap-2">
									{(['width-depth', 'width-height', 'depth-height'] as ContainerFace[]).map((face) => (
										<button
											key={face}
											type="button"
											onClick={() => setViewingContainerFace(face)}
											className={viewingContainerFace === face ? 'rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}
										>
											{containerFaceLabel(face)}
										</button>
									))}
								</div>
								<div className="flex items-center justify-end gap-2">
									<button
										type="button"
										onClick={openViewedContainerLayoutPanel}
										className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
									>
										Edit Layout
									</button>
									<button
										type="button"
										onClick={() => setShowViewedContainerAddItemPanel(true)}
										className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
									>
										Add Item
									</button>
									<button type="button" onClick={() => setViewingContainerPlacementId(null)} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">Back</button>
								</div>
							</div>
						</div>
					) : (
					<svg
						ref={svgRef}
						viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
						className="aspect-[4/3] h-auto w-full touch-none bg-slate-50 dark:bg-slate-950"
						onPointerDown={(event) => {
							if (event.target === event.currentTarget) {
								if (editingContainersRoomId === STORY_SCOPE_ID && activeEditablePlacementId) {
									const nextPoint = getWorldPoint(event);
									updatePlacedItem(null, activeEditablePlacementId, { x: nextPoint.x, y: nextPoint.y });
									return;
								}
								if (!editingRoom) onSelectRoom(null);
							}
						}}
						onPointerMove={handlePointerMove}
						onPointerUp={handlePointerUp}
						onPointerLeave={handlePointerUp}
					>
						<defs>
							<pattern id={`floor-grid-${story.id}`} width="40" height="40" patternUnits="userSpaceOnUse">
								<path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
							</pattern>
						</defs>
						<rect
							width={VIEWBOX_WIDTH}
							height={VIEWBOX_HEIGHT}
							fill={`url(#floor-grid-${story.id})`}
							onPointerDown={(event) => {
								event.stopPropagation();
								if (editingContainersRoomId === STORY_SCOPE_ID && activeEditablePlacementId) {
									const nextPoint = getWorldPoint(event);
									updatePlacedItem(null, activeEditablePlacementId, { x: nextPoint.x, y: nextPoint.y });
									return;
								}
								if (!editingRoom) onSelectRoom(null);
							}}
						/>
						<g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
							{isPlacingStartPoint && startPointAnchor && startPointPreview ? (
								<g>
									<line
										x1={startPointAnchor.x}
										y1={startPointAnchor.y}
										x2={startPointPreview.x}
										y2={startPointPreview.y}
										stroke="#0f766e"
										strokeWidth="2"
										strokeDasharray="6 6"
										opacity="0.75"
									/>
									<circle cx={startPointPreview.x} cy={startPointPreview.y} r="6" fill="#ffffff" stroke="#0f766e" strokeWidth="2" />
									<circle cx={startPointPreview.x} cy={startPointPreview.y} r="2.5" fill="#0f766e" />
								</g>
							) : null}
							{currentPoint && previewPoint && showPointPreview ? (
								<g>
									<line
										x1={currentPoint.x}
										y1={currentPoint.y}
										x2={previewPoint.x}
										y2={previewPoint.y}
										stroke="#64748b"
										strokeWidth="2"
										strokeDasharray="6 6"
										opacity="0.65"
									/>
									<circle cx={previewPoint.x} cy={previewPoint.y} r="5" fill="#ffffff" stroke="#64748b" strokeWidth="2" opacity="0.8" />
									<circle cx={previewPoint.x} cy={previewPoint.y} r="2" fill="#64748b" opacity="0.75" />
								</g>
							) : null}
							{storyOutline ? (() => {
								const outlinePoints = storyOutlinePoints;
								const outlinePolyline = outlinePoints.map((point) => `${point.x},${point.y}`).join(' ');
								const finalPoint = outlinePoints[outlinePoints.length - 1] ?? storyOutline.origin;
								const isClosedOutline = outlinePoints.length >= 3 && pointsMatch(finalPoint, outlinePoints[0]);
								const showCloseGuide = isEditingStoryOutline && outlinePoints.length >= 3 && !pointsMatch(finalPoint, outlinePoints[0]);
								// For segment selection
								const outlineSegmentLines = getSegmentLines(storyOutline.origin, storyOutline.segments);
								return (
									<g>
										{outlinePoints.length >= 3 ? <polygon points={outlinePolyline} fill="#cbd5e1" fillOpacity={isEditingStoryOutline ? 0.16 : 0.1} stroke="none" /> : null}
										{isClosedOutline ? (
											<polygon points={outlinePolyline} fill="none" stroke={isEditingStoryOutline ? '#475569' : '#94a3b8'} strokeWidth={isEditingStoryOutline ? 3 : 2} />
										) : (
											<polyline points={outlinePolyline} fill="none" stroke={isEditingStoryOutline ? '#475569' : '#94a3b8'} strokeWidth={isEditingStoryOutline ? 3 : 2} strokeDasharray={outlinePoints.length >= 3 ? undefined : '8 6'} />
										)}
										{showCloseGuide ? <line x1={finalPoint.x} y1={finalPoint.y} x2={outlinePoints[0].x} y2={outlinePoints[0].y} stroke="#64748b" strokeWidth="2" strokeDasharray="6 5" /> : null}
										{/* Outline segment selection and type UI */}
										{isEditingStoryOutline && outlineEditMode === 'select-segment' && outlineSegmentLines.map(({ segment, index, start, end }) => {
											const isDoor = segment.kind === 'door';
											const isEditingSegment = selectedOutlineSegmentIndex === index;
											const strokeColor = isDoor ? '#f59e0b' : '#0f172a';
											const strokeWidth = isDoor ? (isEditingSegment ? 6 : 4) : (isEditingSegment ? 5 : 3);
											return (
												<g key={`outline-segment-${index}`}>
													{isEditingSegment ? <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#2563eb" strokeWidth={strokeWidth + 6} strokeLinecap="round" opacity="0.22" /> : null}
													<line
														x1={start.x}
														y1={start.y}
														x2={end.x}
														y2={end.y}
														stroke={strokeColor}
														strokeWidth={strokeWidth}
														strokeDasharray={isDoor ? '12 8' : (!isClosedOutline && index === outlineSegmentLines.length - 1 ? '8 6' : undefined)}
														strokeLinecap="round"
														style={{ cursor: 'pointer' }}
														onPointerDown={(event) => {
															event.stopPropagation();
															setSelectedOutlineSegmentIndex(index);
														}}
													/>
													<line
														x1={start.x}
														y1={start.y}
														x2={end.x}
														y2={end.y}
														stroke="transparent"
														strokeWidth={18}
														strokeLinecap="round"
														style={{ cursor: 'pointer' }}
														onPointerDown={(event) => {
															event.stopPropagation();
															setSelectedOutlineSegmentIndex(index);
														}}
													/>
												</g>
											);
										})}
									</g>
								);
							})() : null}
							{[...story.placedItems].sort((left, right) => {
								const leftRank = left.id === selectedPlacementId ? 1 : 0;
								const rightRank = right.id === selectedPlacementId ? 1 : 0;
								return leftRank - rightRank;
							}).map((entry) => {
								const footprint = getRotatedRectPoints({ x: entry.x, y: entry.y }, entry.width, entry.depth, entry.rotation).map((point) => `${point.x},${point.y}`).join(' ');
								const isPlacementSelected = selectedPlacementId === entry.id;
								const isPlacementEditable = editingPlacedContainerId === entry.id;
								const visualRecord = entry.kind === 'container'
									? { icon: findInventoryContainerRecord(entry.refId)?.container.icon ?? 'inventory', fill: 'rgba(15,23,42,0.08)' }
									: { icon: findInventoryItemRecord(entry.refId)?.resolvedItem?.icon ?? 'inventory', fill: 'rgba(59,130,246,0.08)' };
								const resolvedIcon = resolveIcon(visualRecord.icon);
								const iconSize = Math.max(10, Math.min(entry.width, entry.depth) * 0.62);
								const itemRecord = entry.kind === 'item' ? findInventoryItemRecord(entry.refId) : null;
								const hasQuickActionsIndicator = Boolean(
									(entry.kind === 'container' && isPlacementCleanInQuickActions(entry.id))
									|| (itemRecord?.resolvedItem?.kind === 'facility' && (
										placedItemHasQuickActionsTask(entry.id, entry.recurringTasks ?? itemRecord.item.recurringTasks ?? [])
										|| isPlacementCleanInQuickActions(entry.id)
									))
								);

								return (
									<g key={`story-placement-${entry.id}`}>
										<polygon
											points={footprint}
											fill={isPlacementEditable ? 'rgba(16,185,129,0.24)' : visualRecord.fill}
											stroke={isPlacementSelected ? '#059669' : isPlacementEditable ? '#10b981' : '#64748b'}
											strokeWidth={isPlacementSelected ? 3 : 2}
											style={isPlacementEditable ? { cursor: 'grab' } : undefined}
											onPointerDown={(event) => {
												event.stopPropagation();
												onSelectRoom(null);
												setExpandedPlacedContainerId(entry.id);
												setSelectedPlacementId(entry.id);
												if (!isPlacementEditable) return;
												const point = getWorldPoint(event);
												setInteraction({ type: 'drag-container', roomId: null, placementId: entry.id, offsetX: point.x - entry.x, offsetY: point.y - entry.y });
											}}
										/>
										<g transform={`translate(${entry.x} ${entry.y})`} style={{ pointerEvents: 'none' }}>
											<g transform={`rotate(${entry.rotation})`}>
												{isImageIcon(resolvedIcon) ? (
													<image href={resolvedIcon} x={-iconSize / 2} y={-iconSize / 2} width={iconSize} height={iconSize} preserveAspectRatio="xMidYMid meet" opacity={isPlacementSelected ? 1 : 0.82} />
												) : (
													<text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize={iconSize} opacity={isPlacementSelected ? 1 : 0.9}>{resolvedIcon}</text>
												)}
											</g>
											{hasQuickActionsIndicator ? (
												<g transform={`translate(${QUICK_ACTIONS_BADGE_OFFSET_X} ${QUICK_ACTIONS_BADGE_OFFSET_Y})`}>
													<circle cx={0} cy={0} r={QUICK_ACTIONS_BADGE_RADIUS} fill="#ef4444" />
												</g>
											) : null}
										</g>
									</g>
								);
							})}
							{canvasRooms.map((room) => {
								const points = segmentsToPoints(room.origin, room.segments);
								const roomSegmentLines = getSegmentLines(room.origin, room.segments);
								const bounds = getPointsBounds(points);
								const polygonPoints = points.map((point) => `${point.x},${point.y}`).join(' ');
								const isSelected = room.id === selectedRoom?.id;
								const isEditingThisRoom = Boolean(editingRoom && room.id === editingRoom.id);
								if (isEditingThisRoom && isPlacingStartPoint) return null;
								const canFill = points.length >= 3;
								const finalPoint = points[points.length - 1] ?? room.origin;
								const isClosedRoom = canFill && pointsMatch(finalPoint, points[0]);

								return (
									<g key={room.id}>
										{canFill ? (
											<polygon
												points={polygonPoints}
												fill={room.color ?? '#84cc16'}
												fillOpacity={isSelected || isEditingThisRoom ? 0.34 : 0.2}
												stroke="none"
												onPointerDown={(event) => {
													event.stopPropagation();
														if (editingContainersRoomId === room.id && activeEditablePlacementId) {
														const nextPoint = getWorldPoint(event);
															updatePlacedItem(room.id, activeEditablePlacementId, { x: nextPoint.x, y: nextPoint.y });
														return;
													}
													if (!editingRoom) onSelectRoom(room.id);
												}}
											/>
										) : null}
										{roomSegmentLines.map(({ segment, index, start, end }) => {
											const isDoor = segment.kind === 'door';
											const isEditingSegment = isEditingThisRoom && selectedSegmentIndex === index;
											const strokeColor = isDoor ? '#f59e0b' : (isSelected || isEditingThisRoom ? '#0f172a' : room.color ?? '#84cc16');
											const strokeWidth = isDoor ? (isSelected || isEditingThisRoom ? 5 : 4) : (isSelected || isEditingThisRoom ? 3.5 : 2.5);
											const handleSegmentPointerDown = (event: React.PointerEvent<SVGLineElement>) => {
												event.stopPropagation();
												if (editingContainersRoomId === room.id && activeEditablePlacementId) {
													const nextPoint = getWorldPoint(event);
													updatePlacedItem(room.id, activeEditablePlacementId, { x: nextPoint.x, y: nextPoint.y });
													return;
												}
												onSelectRoom(room.id);
												if (isEditingThisRoom) setSelectedSegmentIndex(index);
											};
											return (
												<g key={`${room.id}-segment-${index}`}>
													{isEditingSegment ? <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#2563eb" strokeWidth={strokeWidth + 6} strokeLinecap="round" opacity="0.22" /> : null}
													<line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={strokeColor} strokeWidth={strokeWidth} strokeDasharray={isDoor ? '12 8' : (!isClosedRoom && index === roomSegmentLines.length - 1 ? '8 6' : undefined)} strokeLinecap="round" onPointerDown={handleSegmentPointerDown} />
													<line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth={16} strokeLinecap="round" onPointerDown={handleSegmentPointerDown} />
												</g>
											);
										})}
										{isEditingThisRoom && points.length >= 3 && !pointsMatch(finalPoint, points[0]) ? (
											<>
												<line x1={finalPoint.x} y1={finalPoint.y} x2={points[0].x} y2={points[0].y} stroke={room.color ?? '#84cc16'} strokeWidth="2" strokeDasharray="6 5" />
												<text x={midpoint(finalPoint, points[0]).x} y={midpoint(finalPoint, points[0]).y - 8} textAnchor="middle" pointerEvents="none" className="select-none fill-slate-700 text-[11px] font-semibold">
													{formatDistance(getPointDistance(finalPoint, points[0]))}
												</text>
											</>
										) : null}
											<text x={bounds.minX + bounds.width / 2} y={bounds.minY + bounds.height / 2} textAnchor="middle" dominantBaseline="middle" pointerEvents="none" className="select-none fill-slate-900 text-[14px] font-semibold">
											{room.name || 'New room'}
										</text>
										{isEditingThisRoom ? points.slice(1).map((point, index) => {
											const start = points[index];
											const labelPoint = midpoint(start, point);
											return (
													<text key={`${room.id}-dim-${index}`} x={labelPoint.x} y={labelPoint.y - 8} textAnchor="middle" pointerEvents="none" className="select-none fill-slate-700 text-[11px] font-semibold">
													{formatDistance(getPointDistance(start, point))}
												</text>
											);
										}) : null}
											{[...room.placedItems].sort((left, right) => {
												const leftRank = left.id === selectedPlacementId ? 1 : 0;
												const rightRank = right.id === selectedPlacementId ? 1 : 0;
												return leftRank - rightRank;
											}).map((entry) => {
												const footprint = getRotatedRectPoints({ x: entry.x, y: entry.y }, entry.width, entry.depth, entry.rotation).map((point) => `${point.x},${point.y}`).join(' ');
												const isPlacementSelected = selectedPlacementId === entry.id;
												const isPlacementEditable = selectedPlacementId === entry.id;
												const resolvedContainer = entry.kind === 'container' ? findRoomContainerRecord(room, entry.refId) : null;
												const resolvedItem = entry.kind === 'item' ? resolvePlacedItemEntry(room, entry) : null;
												const visualRecord = entry.kind === 'container'
													? { icon: resolvedContainer?.container.icon ?? 'inventory', fill: 'rgba(15,23,42,0.12)' }
													: { icon: resolvedItem?.itemIcon ?? 'inventory', fill: 'rgba(59,130,246,0.10)' };
												const resolvedIcon = resolveIcon(visualRecord.icon);
												const iconSize = Math.max(10, Math.min(entry.width, entry.depth) * 0.62);
												const hasQuickActionsIndicator = Boolean(
													(entry.kind === 'container' && isPlacementCleanInQuickActions(entry.id))
													|| (resolvedItem?.itemKind === 'facility' && (
														placedItemHasQuickActionsTask(entry.id, resolvedItem.recurringTasks)
														|| isPlacementCleanInQuickActions(entry.id)
													))
												);

												return (
													<g key={entry.id}>
														<polygon
															points={footprint}
															fill={isPlacementEditable ? 'rgba(16,185,129,0.24)' : visualRecord.fill}
															stroke={isPlacementSelected ? '#059669' : isPlacementEditable ? '#10b981' : '#475569'}
															strokeWidth={isPlacementSelected ? 3 : 2}
															style={isPlacementEditable ? { cursor: 'grab' } : undefined}
															onPointerDown={(event) => {
																event.stopPropagation();
																onSelectRoom(room.id);
																setExpandedPlacedContainerId(entry.id);
																setSelectedPlacementId(entry.id);
																if (!isPlacementEditable) return;
																const point = getWorldPoint(event);
																setInteraction({ type: 'drag-container', roomId: room.id, placementId: entry.id, offsetX: point.x - entry.x, offsetY: point.y - entry.y });
															}}
														/>
														<g transform={`translate(${entry.x} ${entry.y})`} style={{ pointerEvents: 'none' }}>
															<g transform={`rotate(${entry.rotation})`}>
																{isImageIcon(resolvedIcon) ? (
																	<image
																		href={resolvedIcon}
																		x={-iconSize / 2}
																		y={-iconSize / 2}
																		width={iconSize}
																		height={iconSize}
																		preserveAspectRatio="xMidYMid meet"
																		opacity={isPlacementSelected ? 1 : 0.82}
																	/>
																) : (
																	<text
																		x={0}
																		y={0}
																		textAnchor="middle"
																		dominantBaseline="central"
																		fontSize={iconSize}
																		opacity={isPlacementSelected ? 1 : 0.9}
																	>
																		{resolvedIcon}
																	</text>
																)}
															</g>
															{hasQuickActionsIndicator ? (
																<g transform={`translate(${QUICK_ACTIONS_BADGE_OFFSET_X} ${QUICK_ACTIONS_BADGE_OFFSET_Y})`}>
																	<circle cx={0} cy={0} r={QUICK_ACTIONS_BADGE_RADIUS} fill="#ef4444" />
																</g>
															) : null}
														</g>
													</g>
												);
											})}
									</g>
								);
							})}
								{isEditingStoryOutline ? (
									<g>
										{storyOutlinePoints.map((point, index) => (
											<g key={`story-outline-${index}-${point.x}-${point.y}`}>
												<circle
													cx={point.x}
													cy={point.y}
													r={index === 0 ? 7 : 4.5}
													fill="#ffffff"
													stroke="#64748b"
													strokeWidth="2"
													style={{ pointerEvents: 'none' }}
												/>
												<circle
													cx={point.x}
													cy={point.y}
													r={VERTEX_HIT_RADIUS}
													fill="transparent"
													pointerEvents="all"
												/>
											</g>
										))}
									</g>
								) : null}
								{editingRoom && isPlacingStartPoint ? (
									<g>
										{startPointAnchors.map((anchor, index) => {
											const isSelectedAnchor = startPointAnchorIndex === index;
											return (
												<g key={anchor.key}>
													<circle
														cx={anchor.point.x}
														cy={anchor.point.y}
														r={VERTEX_VISIBLE_RADIUS}
														fill={isSelectedAnchor ? '#ccfbf1' : '#ffffff'}
														stroke={isSelectedAnchor ? '#0f766e' : '#64748b'}
														strokeWidth="2"
														style={{ pointerEvents: 'none' }}
													/>
													<circle
														cx={anchor.point.x}
														cy={anchor.point.y}
														r={VERTEX_HIT_RADIUS}
														fill="transparent"
														pointerEvents="all"
														style={{ cursor: 'pointer' }}
														onPointerDown={(event) => selectStartPointAnchor(index, event)}
														onTouchStart={(event) => selectStartPointAnchor(index, event)}
													/>
												</g>
											);
										})}
									</g>
								) : null}
								{editingRoom && !isPlacingStartPoint ? (
									<g>
										<circle cx={editingRoom.origin.x} cy={editingRoom.origin.y} r={VERTEX_VISIBLE_RADIUS} fill="#ffffff" stroke="#2563eb" strokeWidth="2" style={{ pointerEvents: 'none' }} />
										<circle cx={editingRoom.origin.x} cy={editingRoom.origin.y} r="2.5" fill="#2563eb" style={{ pointerEvents: 'none' }} />
										<circle
											cx={editingRoom.origin.x}
											cy={editingRoom.origin.y}
											r={VERTEX_HIT_RADIUS}
											fill="transparent"
											pointerEvents="all"
											style={{ cursor: 'grab' }}
											onPointerDown={beginOriginDrag}
											onTouchStart={beginOriginDrag}
										/>
									</g>
								) : null}
						</g>
					</svg>
					)}

					{!viewedContainerEntry?.container && !selectedRoom && !editingRoom && !editingStoryOutline && story.rooms.length === 0 && !storyOutline ? (
						<div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
							<div className="rounded-2xl bg-white/90 px-4 py-3 text-center text-xs text-gray-600 shadow-lg backdrop-blur dark:bg-gray-900/90 dark:text-gray-300">
								Start by outlining the story boundary. After that, you can add rooms and leave open space for halls or circulation.
							</div>
						</div>
					) : null}
				</div>

				{editable && editingRoom && isPlacingStartPoint ? (
					<div className="border-t border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-950/40">
						<div className="mx-auto w-full max-w-md rounded-2xl bg-white/96 p-3 shadow-sm ring-1 ring-black/5 backdrop-blur dark:bg-gray-900/96">
							<div className="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-200">Start point</div>
							<div className="mb-3 text-[11px] text-gray-500 dark:text-gray-400">
								{isPlacingStartPoint
									? 'Click a story-outline or room vertex, then choose a direction and distance from that anchor.'
									: 'Start point placed on the story canvas.'}
							</div>
							<div className="mb-3 flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
								<span>{startPointAnchor ? `Anchor ${startPointAnchorIndex !== null ? startPointAnchorIndex + 1 : ''}` : 'No anchor selected'}</span>
								{startPointAnchor ? <span>•</span> : null}
								{startPointAnchor ? <span>{Math.round(startPointAnchor.x)}, {Math.round(startPointAnchor.y)}</span> : null}
							</div>
							<div className="grid grid-cols-3 gap-2">
								<div />
								<button type="button" onClick={() => setStartPointDirection('up')} className={startPointDirection === 'up' ? 'rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white' : 'rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200'}>↑</button>
								<div />
								<button type="button" onClick={() => setStartPointDirection('left')} className={startPointDirection === 'left' ? 'rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white' : 'rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200'}>←</button>
								<input
									type="number"
									min={1}
									value={startPointDistance}
									onChange={(event) => setStartPointDistance(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === 'Enter') {
											event.preventDefault();
											applyStartPoint();
										}
									}}
									className={`${INPUT_CLS} w-20 text-center`}
								/>
								<button type="button" onClick={() => setStartPointDirection('right')} className={startPointDirection === 'right' ? 'rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white' : 'rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200'}>→</button>
								<div />
								<button type="button" onClick={() => setStartPointDirection('down')} className={startPointDirection === 'down' ? 'rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white' : 'rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200'}>↓</button>
								<div />
							</div>
							<div className="mt-3 flex items-center gap-2">
								<button type="button" onClick={applyStartPoint} disabled={!startPointPreview} className={startPointPreview ? 'flex-1 rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700' : 'flex-1 rounded-xl bg-gray-200 px-3 py-2 text-xs font-semibold text-gray-400 dark:bg-gray-700'}>Set start point</button>
							</div>
						</div>
					</div>
				) : null}

				{editable && (editingStoryOutline || (editingRoom && !isPlacingStartPoint)) && currentPoint ? (
					<div className="border-t border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-950/40">
						<div className="mx-auto w-full max-w-xs rounded-2xl bg-white/96 p-3 shadow-sm ring-1 ring-black/5 backdrop-blur dark:bg-gray-900/96">
							<div className="mb-2 flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
								<span>{isEditingStoryOutline ? 'Story boundary' : 'Polyline'}</span>
								<span>•</span>
								<span>{activePoints.length} pt</span>
								{activePoints.length >= 2 ? <span>• {Math.round(getPointsBounds(activePoints).width)} x {Math.round(getPointsBounds(activePoints).height)}</span> : null}
							</div>
							{isEditingStoryOutline || editingRoom ? (
								<div className="mb-3 flex items-center justify-center">
									<div className="inline-flex rounded-full bg-gray-200 p-1 dark:bg-gray-700">
										<button
											type="button"
											className={`rounded-full px-4 py-1 text-xs font-semibold transition-colors duration-150 ${(isEditingStoryOutline ? outlineEditMode : roomEditMode) === 'add-point' ? 'bg-blue-500 text-white shadow' : 'bg-transparent text-gray-700 dark:text-gray-200'}`}
											onClick={() => {
												if (isEditingStoryOutline) {
													setOutlineEditMode('add-point');
													setSelectedOutlineSegmentIndex(null);
												} else {
													setRoomEditMode('add-point');
													setSelectedSegmentIndex(null);
												}
											}}
										>
											Edit Point
										</button>
										<button
											type="button"
											className={`rounded-full px-4 py-1 text-xs font-semibold transition-colors duration-150 ${(isEditingStoryOutline ? outlineEditMode : roomEditMode) === 'select-segment' ? 'bg-blue-500 text-white shadow' : 'bg-transparent text-gray-700 dark:text-gray-200'}`}
											onClick={() => {
												if (isEditingStoryOutline) {
													setOutlineEditMode('select-segment');
												} else {
													setRoomEditMode('select-segment');
												}
											}}
										>
											Edit Line
										</button>
									</div>
								</div>
							) : null}
							{(isEditingStoryOutline ? outlineEditMode : roomEditMode) === 'add-point' ? (
								<>
									<div className="grid grid-cols-3 gap-2">
										<div />
										<button type="button" onClick={() => setPendingDirection('up')} className={pendingDirection === 'up' ? 'rounded-xl bg-blue-500 px-3 py-2 text-xs font-semibold text-white' : 'rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200'}>↑</button>
										<div />
										<button type="button" onClick={() => setPendingDirection('left')} className={pendingDirection === 'left' ? 'rounded-xl bg-blue-500 px-3 py-2 text-xs font-semibold text-white' : 'rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200'}>←</button>
										<input
											type="number"
											min={1}
											value={pendingDistance}
											onChange={(event) => setPendingDistance(event.target.value)}
											onKeyDown={(event) => {
												if (event.key === 'Enter') {
													event.preventDefault();
													appendSegment();
												}
											}}
											className={`${INPUT_CLS} w-20 text-center`}
										/>
										<button type="button" onClick={() => setPendingDirection('right')} className={pendingDirection === 'right' ? 'rounded-xl bg-blue-500 px-3 py-2 text-xs font-semibold text-white' : 'rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200'}>→</button>
										<div />
										<button type="button" onClick={() => setPendingDirection('down')} className={pendingDirection === 'down' ? 'rounded-xl bg-blue-500 px-3 py-2 text-xs font-semibold text-white' : 'rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200'}>↓</button>
										<div />
									</div>
									<div className="mt-2 flex items-center gap-2">
										<button type="button" onClick={appendSegment} className="flex-1 rounded-xl bg-blue-500 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600">Set point</button>
										<button type="button" onClick={removeLastSegment} className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">Undo</button>
									</div>
								</>
							) : (
								<div className="rounded-xl bg-gray-50 px-3 py-3 text-xs text-gray-600 dark:bg-gray-800/70 dark:text-gray-300">
									<div className="flex items-center justify-between gap-2">
										<span className="font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Selected line</span>
										{selectedOutlineSegmentIndex != null && editingStoryOutline?.segments[selectedOutlineSegmentIndex]
											? <span>{editingStoryOutline.segments[selectedOutlineSegmentIndex].distance} units · {editingStoryOutline.segments[selectedOutlineSegmentIndex].direction}</span>
											: null}
									</div>
									{selectedOutlineSegmentIndex != null && editingStoryOutline?.segments[selectedOutlineSegmentIndex] ? (
										<div className="mt-2 flex items-center gap-2">
											<button
												type="button"
												onClick={() => updateSelectedOutlineSegmentKind('wall')}
												className={editingStoryOutline.segments[selectedOutlineSegmentIndex].kind === 'door' ? 'rounded-xl bg-gray-100 px-3 py-2 font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700' : 'rounded-xl bg-slate-700 px-3 py-2 font-semibold text-white'}
											>
												Wall
											</button>
											<button
												type="button"
												onClick={() => updateSelectedOutlineSegmentKind('door')}
												className={editingStoryOutline.segments[selectedOutlineSegmentIndex].kind === 'door' ? 'rounded-xl bg-amber-500 px-3 py-2 font-semibold text-white' : 'rounded-xl bg-gray-100 px-3 py-2 font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700'}
											>
												Door
											</button>
										</div>
									) : (
										<div className="mt-2 text-gray-500 dark:text-gray-400">Click a story outline line on the canvas to change it from wall to door.</div>
									)}
								</div>
							)}
							{editingRoom && roomEditMode === 'select-segment' ? (
								<div className="mt-3 rounded-xl bg-gray-50 px-3 py-3 text-xs text-gray-600 dark:bg-gray-800/70 dark:text-gray-300">
									<div className="flex items-center justify-between gap-2">
										<span className="font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Selected line</span>
										{selectedEditingSegment ? <span>{selectedEditingSegment.segment.distance} units · {selectedEditingSegment.segment.direction}</span> : null}
									</div>
									{selectedEditingSegment ? (
										<div className="mt-2 flex items-center gap-2">
											<button
												type="button"
												onClick={() => updateSelectedSegmentKind('wall')}
												className={selectedEditingSegment.segment.kind === 'door' ? 'rounded-xl bg-gray-100 px-3 py-2 font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700' : 'rounded-xl bg-slate-700 px-3 py-2 font-semibold text-white'}
											>
												Wall
											</button>
											<button
												type="button"
												onClick={() => updateSelectedSegmentKind('door')}
												className={selectedEditingSegment.segment.kind === 'door' ? 'rounded-xl bg-amber-500 px-3 py-2 font-semibold text-white' : 'rounded-xl bg-gray-100 px-3 py-2 font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700'}
											>
												Door
											</button>
										</div>
									) : (
										<div className="mt-2 text-gray-500 dark:text-gray-400">Click a room line on the canvas to change it from wall to door.</div>
									)}
								</div>
							) : null}
							{editingRoom && roomEditMode === 'add-point' ? (
								<div className="mt-2 flex justify-end">
									<button type="button" onClick={reopenStartPointEditor} className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">Edit start point</button>
								</div>
							) : null}
						</div>
					</div>
				) : null}

				{editable && isEditingStoryOutline && !editingRoom ? (
					<div className="border-t border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-950/40">
						<div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/95 p-3 shadow-sm ring-1 ring-black/5 backdrop-blur dark:bg-gray-900/95">
							<div>
								<div className="text-sm font-semibold text-gray-800 dark:text-gray-100">Story outline</div>
								<div className="text-xs text-gray-500 dark:text-gray-400">Draw the outer boundary first. Rooms can be added afterwards.</div>
							</div>
							<div className="flex items-center gap-2">
								<button type="button" onClick={onCancelEditingRoom} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">Cancel</button>
								<button type="button" onClick={onSaveStoryOutline} disabled={!canSaveStoryOutline} className={canSaveStoryOutline ? 'rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600' : 'rounded-full bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-400 dark:bg-gray-700'}>Save outline</button>
							</div>
						</div>
					</div>
				) : null}

				{!editingRoom && !editingStoryOutline && roomSummaries.length > 0 ? (
					<div className="border-t border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-950/40">
						<div className="mx-auto w-full max-w-4xl space-y-2">
							<div className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Rooms</div>
							<div className="space-y-2">
								{visibleRoomSummaries.map(({ room, bounds, placedContainerEntries, placedLooseItemEntries, placedLooseItemCount }) => {
									const isExpanded = effectiveExpandedRoomId === room.id;
									const isSelected = selectedRoom?.id === room.id;
									const summary = { room, bounds, placedContainerEntries, placedLooseItemEntries, placedLooseItemCount, placedEntries: [...placedContainerEntries, ...placedLooseItemEntries] };
									return (
										<div key={`modern-${room.id}`} className="rounded-2xl bg-white/95 shadow-sm ring-1 ring-black/5 backdrop-blur dark:bg-gray-900/95">
											<button
												type="button"
												onClick={() => {
													if (isExpanded) {
														onSelectRoom(null);
														setExpandedRoomId(null);
														setRoomAddItemRoomId((current) => current === room.id ? null : current);
														setRoomAddContainerRoomId((current) => current === room.id ? null : current);
														setViewingContainerPlacementId(null);
														return;
													}

													onSelectRoom(room.id);
													setExpandedRoomId(room.id);
												}}
												className={isSelected ? 'flex w-full items-center justify-between gap-3 px-4 py-3 text-left ring-2 ring-inset ring-blue-200 dark:ring-blue-800' : 'flex w-full items-center justify-between gap-3 px-4 py-3 text-left'}
											>
												<div className="flex items-center gap-2">
													<IconDisplay iconKey={room.icon || 'home'} size={16} className="h-4 w-4 object-contain" alt="" />
													<div>
														<div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{room.name}</div>
														<div className="text-[11px] text-gray-500 dark:text-gray-400">{placedContainerEntries.length} container{placedContainerEntries.length === 1 ? '' : 's'} · {placedLooseItemCount} item{placedLooseItemCount === 1 ? '' : 's'}{(room.photos?.length ?? 0) > 0 ? ` · ${room.photos?.length ?? 0} photo${(room.photos?.length ?? 0) === 1 ? '' : 's'}` : ''}</div>
													</div>
												</div>
												<span className="text-base font-semibold text-blue-600 dark:text-blue-300">{isExpanded ? '↑' : '↓'}</span>
											</button>
											{isExpanded ? renderRoomExpandedContent(summary) : null}
										</div>
									);
								})}
							</div>
						</div>
					</div>
				) : null}

				{/* legacy room block removed
					<div className="border-t border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-950/40">
						<div className="mx-auto w-full max-w-4xl space-y-2">
							<div className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Rooms</div>
							<div className="space-y-2">
								{visibleRoomSummaries.map(({ room, bounds, placedContainerEntries, placedLooseItemEntries, placedLooseItemCount }) => {
									const isExpanded = effectiveExpandedRoomId === room.id;
									const isSelected = selectedRoom?.id === room.id;
									const summary = { room, bounds, placedContainerEntries, placedLooseItemEntries, placedLooseItemCount, placedEntries: [...placedContainerEntries, ...placedLooseItemEntries] };
									return (
										<div key={room.id} className="rounded-2xl bg-white/95 shadow-sm ring-1 ring-black/5 backdrop-blur dark:bg-gray-900/95">
											<button
												type="button"
												onClick={() => {
													if (isExpanded) {
														onSelectRoom(null);
														setExpandedRoomId(null);
														setRoomAddItemRoomId((current) => current === room.id ? null : current);
														setRoomAddContainerRoomId((current) => current === room.id ? null : current);
														setViewingContainerPlacementId(null);
														return;
													}

													onSelectRoom(room.id);
													setExpandedRoomId(room.id);
												}}
												className={isSelected ? 'flex w-full items-center justify-between gap-3 px-4 py-3 text-left ring-2 ring-inset ring-blue-200 dark:ring-blue-800' : 'flex w-full items-center justify-between gap-3 px-4 py-3 text-left'}
											>
												<div className="flex items-center gap-2">
													<IconDisplay iconKey={room.icon || 'home'} size={16} className="h-4 w-4 object-contain" alt="" />
													<div>
														<div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{room.name}</div>
														<div className="text-[11px] text-gray-500 dark:text-gray-400">{placedContainerEntries.length} container{placedContainerEntries.length === 1 ? '' : 's'} · {placedLooseItemCount} item{placedLooseItemCount === 1 ? '' : 's'}{(room.photos?.length ?? 0) > 0 ? ` · ${room.photos?.length ?? 0} photo${(room.photos?.length ?? 0) === 1 ? '' : 's'}` : ''}</div>
													</div>
												</div>
												<span className="text-base font-semibold text-blue-600 dark:text-blue-300">{isExpanded ? '↑' : '↓'}</span>
											</button>

											{isExpanded ? (
												<div className="space-y-3 border-t border-gray-200 px-4 py-4 dark:border-gray-700">
													<div className="space-y-2 rounded-xl bg-gray-50 px-3 py-3 text-sm dark:bg-gray-800/60">
														<div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Container placement</div>
														{placedContainerEntries.length === 0 ? (
															<div className="mt-2 text-xs italic text-gray-400">No placed containers.</div>
														) : (
															<div className="space-y-2">
																{placedContainerEntries.map((entry) => {
																	const isContainerExpanded = expandedPlacedContainerId === entry.placement.id;
																		const isEditingContainer = editingPlacedContainerId === entry.placement.id;
																		const isAddingItem = addingItemContainerId === entry.placement.id;
																		const containerRecord = findInventoryContainerRecord(entry.placement.refId);
																		const itemOptions = containerRecord?.itemTemplates ?? [];
																		const selectedTemplateRef = newItemTemplateRefByContainer[entry.placement.id] ?? itemOptions[0]?.id ?? '';
																	return (
																		<div key={entry.placement.id} className="rounded-xl bg-white ring-1 ring-black/5 dark:bg-gray-900/70">
																			<button
																				type="button"
																				onClick={() => {
																					if (isContainerExpanded) {
																						setExpandedPlacedContainerId(null);
																						setEditingPlacedContainerId((current) => current === entry.placement.id ? null : current);
																						if (editingPlacedContainerId === entry.placement.id) {
																							setEditingContainersRoomId((current) => current === room.id ? null : current);
																						}
																						setAddingItemContainerId((current) => current === entry.placement.id ? null : current);
																						setSelectedPlacementId((current) => current === entry.placement.id ? null : current);
																						return;
																					}

																					setExpandedPlacedContainerId(entry.placement.id);
																					setSelectedPlacementId(entry.placement.id);
																				}}
																				className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
																			>
																				<div className="flex items-center gap-2">
																					<IconDisplay iconKey={entry.containerIcon || 'inventory'} size={16} className="h-4 w-4 object-contain" alt="" />
																					<div className="font-semibold text-gray-800 dark:text-gray-100">{entry.containerName}</div>
																				</div>
																				<span className="text-sm font-semibold text-gray-500 dark:text-gray-300">{isContainerExpanded ? '↑' : '↓'}</span>
																			</button>
																			{isContainerExpanded ? (
																				<div className="border-t border-gray-200 px-3 py-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
																					<div className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">{entry.inventoryName}</div>
																					{renderContainerItems(entry.placement.refId, entry.items, isEditingContainer)}
																					<div className="mt-3 flex flex-wrap items-center gap-2">
																						<button
																							type="button"
																							onClick={() => {
																							const nextEditingId = editingPlacedContainerId === entry.placement.id ? null : entry.placement.id;
																							setEditingPlacedContainerId(nextEditingId);
																							setSelectedPlacementId(entry.placement.id);
																							setEditingContainersRoomId(nextEditingId ? room.id : null);
																						}}
																							className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
																						>
																							{isEditingContainer ? 'Done editing container' : 'Edit container'}
																						</button>
																						<button
																							type="button"
																							onClick={() => {
																							setAddingItemContainerId((current) => current === entry.placement.id ? null : entry.placement.id);
																							if (!newItemTemplateRefByContainer[entry.placement.id] && itemOptions[0]?.id) {
																								setNewItemTemplateRefByContainer((current) => ({ ...current, [entry.placement.id]: itemOptions[0].id }));
																							}
																								if (!newItemQuantityByContainer[entry.placement.id]) {
																									setNewItemQuantityByContainer((current) => ({ ...current, [entry.placement.id]: '1' }));
																								}
																						}}
																							className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
																						>
																							Add item
																						</button>
																					</div>
																					{isEditingContainer ? (
																						<div className="mt-3 grid gap-2 rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-800/70 md:grid-cols-3">
																							<div className="md:col-span-3">
																								<IconPicker value={entry.containerIcon || 'inventory'} onChange={(value) => updateInventoryContainer(entry.placement.refId, (container) => ({ ...container, icon: value }))} align="left" />
																							</div>
																							<label className="space-y-1 md:col-span-3">
																								<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Container name</span>
																								<input value={entry.containerName} onChange={(event) => updateInventoryContainer(entry.placement.refId, (container) => ({ ...container, name: event.target.value }))} className={`${INPUT_CLS} w-full`} />
																							</label>
																							<label className="space-y-1">
																								<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">X</span>
																								<input type="number" value={entry.placement.x} onChange={(event) => updatePlacedItem(room.id, entry.placement.id, { x: Number(event.target.value) || 0 })} className={`${INPUT_CLS} w-full`} />
																							</label>
																							<label className="space-y-1">
																								<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Y</span>
																								<input type="number" value={entry.placement.y} onChange={(event) => updatePlacedItem(room.id, entry.placement.id, { y: Number(event.target.value) || 0 })} className={`${INPUT_CLS} w-full`} />
																							</label>
																							<label className="space-y-1">
																								<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Rotation</span>
																								<input type="number" step={5} value={entry.placement.rotation} onChange={(event) => updatePlacedItem(room.id, entry.placement.id, { rotation: Number(event.target.value) || 0 })} className={`${INPUT_CLS} w-full`} />
																							</label>
																							<label className="space-y-1">
																								<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Width</span>
																								<input type="number" min={1} value={entry.placement.width} onChange={(event) => updatePlacedItem(room.id, entry.placement.id, { width: Math.max(1, Number(event.target.value) || 1) })} className={`${INPUT_CLS} w-full`} />
																							</label>
																							<label className="space-y-1">
																								<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Depth</span>
																								<input type="number" min={1} value={entry.placement.depth} onChange={(event) => updatePlacedItem(room.id, entry.placement.id, { depth: Math.max(1, Number(event.target.value) || 1) })} className={`${INPUT_CLS} w-full`} />
																							</label>
																						</div>
																					) : null}
																					{isAddingItem ? (
																						<div className="mt-3 grid gap-2 rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-800/70 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end">
																							<label className="min-w-0 space-y-1">
																								<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Item</span>
																								<select value={selectedTemplateRef} onChange={(event) => setNewItemTemplateRefByContainer((current) => ({ ...current, [entry.placement.id]: event.target.value }))} className={`${INPUT_CLS} w-full`}>
																									{itemOptions.map((item) => (
																										<option key={item.id} value={item.id}>{item.name}</option>
																									))}
																								</select>
																							</label>
																							<label className="space-y-1">
																								<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Quantity</span>
																								<input type="number" min={0} value={newItemQuantityByContainer[entry.placement.id] ?? '1'} onChange={(event) => setNewItemQuantityByContainer((current) => ({ ...current, [entry.placement.id]: event.target.value }))} className={`${INPUT_CLS} w-full`} />
																							</label>
																							<button type="button" disabled={!selectedTemplateRef || itemOptions.length === 0} onClick={() => addItemToContainer(entry.placement.refId, entry.placement.id)} className="w-full rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 sm:w-auto">Add</button>
																						</div>
																					) : null}
																				</div>
																			) : null}
																		</div>
																	);
																})}
															</div>
														)}
													</div>
													<div className="space-y-2 rounded-xl bg-gray-50 px-3 py-3 text-sm dark:bg-gray-800/60">
														<div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Room items</div>
														{placedLooseItemEntries.length === 0 ? (
															<div className="mt-2 text-xs italic text-gray-400">No placed room items.</div>
														) : (
															<div className="space-y-2">
																{placedLooseItemEntries.map((entry) => {
																	const isItemExpanded = expandedPlacedContainerId === entry.placement.id;
																	const isEditingItem = editingPlacedContainerId === entry.placement.id;
																	return (
																		<div key={entry.placement.id} className="rounded-xl bg-white ring-1 ring-black/5 dark:bg-gray-900/70">
																			<button
																				type="button"
																				onClick={() => {
																					if (isItemExpanded) {
																						setExpandedPlacedContainerId(null);
																						setEditingPlacedContainerId((current) => current === entry.placement.id ? null : current);
																						if (editingPlacedContainerId === entry.placement.id) {
																							setEditingContainersRoomId((current) => current === room.id ? null : current);
																						}
																						setSelectedPlacementId((current) => current === entry.placement.id ? null : current);
																						return;
																					}

																					setExpandedPlacedContainerId(entry.placement.id);
																					setSelectedPlacementId(entry.placement.id);
																				}}
																				className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
																			>
																				<div className="flex items-center gap-2">
																					<IconDisplay iconKey={entry.itemIcon || 'inventory'} size={16} className="h-4 w-4 object-contain" alt="" />
																					<div className="font-semibold text-gray-800 dark:text-gray-100">{entry.itemName}</div>
																				</div>
																				<span className="text-sm font-semibold text-gray-500 dark:text-gray-300">{isItemExpanded ? '↑' : '↓'}</span>
																			</button>
																			{isItemExpanded ? (
																				<div className="border-t border-gray-200 px-3 py-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
																					<div className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">{entry.inventoryName}</div>
																					<div className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">{entry.quantity != null ? `${entry.quantity}${entry.unit?.trim() ? ` ${entry.unit.trim()}` : ''} on hand` : 'Quantity not set'}{entry.threshold != null ? ` · Threshold ${entry.threshold}` : ''}</div>
																					<div className="mt-3 flex flex-wrap items-center gap-2">
																						<button type="button" onClick={() => {
																							const nextEditingId = editingPlacedContainerId === entry.placement.id ? null : entry.placement.id;
																							setEditingPlacedContainerId(nextEditingId);
																							setSelectedPlacementId(entry.placement.id);
																							setEditingContainersRoomId(nextEditingId ? room.id : null);
																						}} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">{isEditingItem ? 'Done editing item' : 'Edit item'}</button>
																					</div>
																					{isEditingItem ? (
																						<div className="mt-3 grid gap-2 rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-800/70 md:grid-cols-3">
																							<label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">X</span><input type="number" value={entry.placement.x} onChange={(event) => updatePlacedItem(room.id, entry.placement.id, { x: Number(event.target.value) || 0 })} className={`${INPUT_CLS} w-full`} /></label>
																							<label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Y</span><input type="number" value={entry.placement.y} onChange={(event) => updatePlacedItem(room.id, entry.placement.id, { y: Number(event.target.value) || 0 })} className={`${INPUT_CLS} w-full`} /></label>
																							<label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Rotation</span><input type="number" step={5} value={entry.placement.rotation} onChange={(event) => updatePlacedItem(room.id, entry.placement.id, { rotation: Number(event.target.value) || 0 })} className={`${INPUT_CLS} w-full`} /></label>
																							<label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Width</span><input type="number" min={1} value={entry.placement.width} onChange={(event) => updatePlacedItem(room.id, entry.placement.id, { width: Math.max(1, Number(event.target.value) || 1) })} className={`${INPUT_CLS} w-full`} /></label>
																							<label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Depth</span><input type="number" min={1} value={entry.placement.depth} onChange={(event) => updatePlacedItem(room.id, entry.placement.id, { depth: Math.max(1, Number(event.target.value) || 1) })} className={`${INPUT_CLS} w-full`} /></label>
																							<label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Quantity</span><input type="number" min={0} value={entry.quantity ?? 0} onChange={(event) => updateInventoryItem(entry.placement.refId, (item) => ({ ...item, quantity: Math.max(0, Number(event.target.value) || 0) }))} className={`${INPUT_CLS} w-full`} /></label>
																							<label className="space-y-1"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Threshold</span><input type="number" min={0} value={entry.threshold ?? ''} onChange={(event) => updateInventoryItem(entry.placement.refId, (item) => ({ ...item, threshold: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value) || 0) }))} className={`${INPUT_CLS} w-full`} /></label>
																							<label className="space-y-1 md:col-span-3"><span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Unit</span><input value={entry.unit ?? ''} onChange={(event) => updateInventoryItem(entry.placement.refId, (item) => ({ ...item, unit: event.target.value }))} className={`${INPUT_CLS} w-full`} /></label>
																						</div>
																					) : null}
																				</div>
																			) : null}
																		</div>
																	);
																})}
															</div>
														)}
													</div>
													<div className="flex justify-start">
														<div className="flex flex-wrap items-center gap-2">
															<button type="button" onClick={() => { onSelectRoom(room.id); setEditingContainersRoomId(room.id); }} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Add container</button>
															<button
																type="button"
																onClick={() => {
																	onSelectRoom(room.id);
																	setEditingContainersRoomId(null);
																	setAddingLooseItemRoomId((current) => current === room.id ? null : room.id);
																	if (!newLooseItemTemplateRefByRoom[room.id] && mergedItemTemplates[0]?.id) {
																		setNewLooseItemTemplateRefByRoom((current) => ({ ...current, [room.id]: mergedItemTemplates[0].id }));
																	}
																	if (!newLooseItemQuantityByRoom[room.id]) {
																		setNewLooseItemQuantityByRoom((current) => ({ ...current, [room.id]: '1' }));
																	}
																}}
																className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
															>
																Add item
															</button>
														</div>
													</div>
													{addingLooseItemRoomId === room.id ? (
														<div className="rounded-xl bg-gray-50 px-3 py-3 text-sm dark:bg-gray-800/60">
															<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto_auto] sm:items-end">
																<label className="min-w-0 space-y-1">
																	<span className="text-xs font-medium text-gray-600 dark:text-gray-300">Item</span>
																	<select value={selectedLooseItemTemplateRef} onChange={(event) => setNewLooseItemTemplateRefByRoom((current) => ({ ...current, [room.id]: event.target.value }))} className={`${INPUT_CLS} w-full`}>
																		{mergedItemTemplates.map((item) => (
																			<option key={item.id} value={item.id}>{item.name}</option>
																		))}
																	</select>
																</label>
																<label className="space-y-1">
																	<span className="text-xs font-medium text-gray-600 dark:text-gray-300">Quantity</span>
																	<input type="number" min={0} value={newLooseItemQuantityByRoom[room.id] ?? '1'} onChange={(event) => setNewLooseItemQuantityByRoom((current) => ({ ...current, [room.id]: event.target.value }))} className={`${INPUT_CLS} w-full`} />
																</label>
																<button type="button" disabled={!selectedLooseItemTemplateRef || mergedItemTemplates.length === 0} onClick={() => addLooseItemToRoom(room, bounds)} className="w-full rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-40 sm:w-auto">Create item</button>
																<button type="button" onClick={() => setAddingLooseItemRoomId(null)} className="w-full rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 sm:w-auto">Done</button>
															</div>
															<div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">Creates a loose item in {targetInventoryName}. After creating it, drag the new footprint on the canvas to place it.</div>
														</div>
													) : null}
													{renderPhotoSection(room.id, room.photos ?? [], room.id, 'Room photos', 'No room photos attached.')}
													{isContainerFocus ? (
														<div className="rounded-xl bg-gray-50 px-3 py-3 text-sm dark:bg-gray-800/60">
															<div className="flex flex-wrap items-end gap-3">
																<IconPicker value={draftContainer.icon} onChange={(value) => updateDraftContainer(room.id, { icon: value })} align="left" />
																<label className="min-w-[14rem] flex-1 space-y-1">
																	<span className="text-xs font-medium text-gray-600 dark:text-gray-300">Container name</span>
																	<input
																		value={draftContainer.name}
																		onChange={(event) => updateDraftContainer(room.id, { name: event.target.value })}
																		className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
																		placeholder="e.g. Pantry bin"
																	/>
																</label>
																<button
																	type="button"
																	disabled={!draftContainer.name.trim()}
																	onClick={() => createContainerForRoom(room, bounds)}
																	className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
																>
																	Create container
																</button>
																<button type="button" onClick={() => setEditingContainersRoomId(null)} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">Done</button>
															</div>
															<div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">Creates a new container in {targetInventoryName}. After creating it, drag the new row's footprint on the canvas to place it.</div>
														</div>
													) : null}
													<div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
														<button type="button" onClick={() => { onSelectRoom(room.id); onStartEditRoom?.(room); }} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">Edit room</button>
														<button type="button" onClick={() => { onSelectRoom(room.id); onStartEditRoom?.(room); }} className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600">Edit outline</button>
														<button type="button" onClick={() => onDeleteRoom?.(room.id)} className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300">Delete room</button>
													</div>
												</div>
											) : null}
										</div>
									);
								})}
							</div>
						</div>
					</div>
				*/}

				{roomAddItemSummary ? (
					<RoomAddItemPanel
						room={roomAddItemSummary.room}
						onClose={() => setRoomAddItemRoomId(null)}
						onAddTemplateItem={(itemTemplateRef) => addTemplateItemToRoom(roomAddItemSummary.room, roomAddItemSummary.bounds, itemTemplateRef)}
						onCreateRoomItem={(itemTemplate) => createRoomItem(roomAddItemSummary.room, roomAddItemSummary.bounds, itemTemplate)}
					/>
				) : null}

				{roomAddContainerSummary ? (
					<RoomAddContainerPanel
						room={roomAddContainerSummary.room}
						onClose={() => setRoomAddContainerRoomId(null)}
						onAddExistingContainer={(containerId) => addExistingContainerToRoom(roomAddContainerSummary.room, roomAddContainerSummary.bounds, containerId)}
						onCreateRoomContainer={(container) => createRoomContainer(roomAddContainerSummary.room, roomAddContainerSummary.bounds, container)}
					/>
				) : null}

				{showViewedContainerAddItemPanel && viewedContainerEntry?.container ? (
					viewedContainerEntry.source === 'inventory' && viewedContainerRecord?.source === 'inventory' && viewedContainerRecord.inventory ? (
						<AddItemPanel
							resource={viewedContainerRecord.inventory}
							containerId={viewedContainerEntry.container.id}
							onClose={() => setShowViewedContainerAddItemPanel(false)}
							onItemInstanceAdded={(item) => addItemInstanceToViewedContainer(item)}
						/>
					) : selectedRoomSummary ? (
						<RoomAddItemPanel
							room={selectedRoomSummary.room}
							onClose={() => setShowViewedContainerAddItemPanel(false)}
							onAddTemplateItem={(itemTemplateRef) => addTemplateItemToViewedRoomContainer(itemTemplateRef)}
							onCreateRoomItem={(itemTemplate) => createRoomItemForViewedContainer(itemTemplate)}
						/>
					) : null
				) : null}

				{showViewedContainerLayoutPanel && viewedContainerEntry?.container ? (
					<PopupShell title="Edit Layout" onClose={() => setShowViewedContainerLayoutPanel(false)} size="large">
						<div className="space-y-4">
							<div className="grid gap-3 md:grid-cols-3">
								<label className="space-y-1">
									<span className="text-xs font-medium text-gray-600 dark:text-gray-300">Width</span>
									<input type="number" min={1} value={viewedLayoutWidth} onChange={(event) => { const value = event.target.value; setViewedLayoutWidth(value === '' ? '' : Math.max(1, Number(value) || 1)); setViewedLayoutError(''); }} className={`${INPUT_CLS} w-full`} />
								</label>
								<label className="space-y-1">
									<span className="text-xs font-medium text-gray-600 dark:text-gray-300">Depth</span>
									<input type="number" min={1} value={viewedLayoutDepth} onChange={(event) => { const value = event.target.value; setViewedLayoutDepth(value === '' ? '' : Math.max(1, Number(value) || 1)); setViewedLayoutError(''); }} className={`${INPUT_CLS} w-full`} />
								</label>
								<label className="space-y-1">
									<span className="text-xs font-medium text-gray-600 dark:text-gray-300">Height</span>
									<input type="number" min={1} value={viewedLayoutHeight} onChange={(event) => { const value = event.target.value; setViewedLayoutHeight(value === '' ? '' : Math.max(1, Number(value) || 1)); setViewedLayoutError(''); }} className={`${INPUT_CLS} w-full`} />
								</label>
							</div>

							<div className="flex flex-wrap gap-2">
								{CONTAINER_FACE_OPTIONS.map((option) => (
									<button
										key={option.value}
										type="button"
										onClick={() => setViewedLayoutActiveFace(option.value)}
										className={viewedLayoutActiveFace === option.value ? 'rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}
									>
										{option.label}
									</button>
								))}
							</div>

							<div className="grid gap-3 md:grid-cols-2">
								<label className="space-y-1">
									<span className="text-xs font-medium text-gray-600 dark:text-gray-300">Columns</span>
									<input type="number" min={1} max={10} value={(viewedLayoutActiveFace === 'width-depth' ? viewedLayoutWidthDepthGrid : viewedLayoutActiveFace === 'width-height' ? viewedLayoutWidthHeightGrid : viewedLayoutDepthHeightGrid).columns} onChange={(event) => updateViewedLayoutGrid(viewedLayoutActiveFace, { columns: event.target.value })} onBlur={() => commitViewedLayoutGrid(viewedLayoutActiveFace)} className={`${INPUT_CLS} w-full`} />
								</label>
								<label className="space-y-1">
									<span className="text-xs font-medium text-gray-600 dark:text-gray-300">Rows</span>
									<input type="number" min={1} max={10} value={(viewedLayoutActiveFace === 'width-depth' ? viewedLayoutWidthDepthGrid : viewedLayoutActiveFace === 'width-height' ? viewedLayoutWidthHeightGrid : viewedLayoutDepthHeightGrid).rows} onChange={(event) => updateViewedLayoutGrid(viewedLayoutActiveFace, { rows: event.target.value })} onBlur={() => commitViewedLayoutGrid(viewedLayoutActiveFace)} className={`${INPUT_CLS} w-full`} />
								</label>
							</div>

							{viewedLayoutError ? <div className="text-sm text-red-600 dark:text-red-300">{viewedLayoutError}</div> : null}

							<div className="flex justify-end gap-2">
								<button type="button" onClick={() => setShowViewedContainerLayoutPanel(false)} className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">Cancel</button>
								<button type="button" onClick={applyViewedContainerLayout} className="rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600">Save Layout</button>
							</div>
						</div>
					</PopupShell>
				) : null}

				{executePlacedTaskPrompt ? (
					<PopupShell title="Execute Task" onClose={() => setExecutePlacedTaskPrompt(null)}>
						<div className="space-y-4">
							<p className="text-sm text-gray-600 dark:text-gray-300">
								Mark <span className="font-semibold text-gray-900 dark:text-gray-100">{executePlacedTaskPrompt.name}</span> complete and add it to today&apos;s Quick Actions?
							</p>
							<div className="flex justify-end gap-2">
								<button type="button" onClick={() => setExecutePlacedTaskPrompt(null)} className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">Cancel</button>
								<button type="button" onClick={confirmExecutePlacedRecurringTask} className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600">Mark Complete</button>
							</div>
						</div>
					</PopupShell>
				) : null}

				{outsideRoomsPanel}
			</div>
		</div>
	);
}
