import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { AlbumEntry, FloorPlanRoom, FloorPlanSegment, HomeStory, InventoryResource, PlacedInstance } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { closeFloorPlanSegments, getPointsBounds, segmentsToPoints } from '../../../../../../utils/floorPlan';
import { getUserInventoryItemTemplates, mergeInventoryItemTemplates, resolveInventoryItemTemplate } from '../../../../../../utils/inventoryItems';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { PopupShell } from '../../../../../shared/popups/PopupShell';
import { HomeFloorPlan } from './HomeFloorPlan';

interface HomeLayoutProps {
	stories: HomeStory[];
	onChange?: (stories: HomeStory[]) => void;
	editable?: boolean;
	homeId?: string;
	homeAlbum?: AlbumEntry[];
	hideRoomList?: boolean;
	showSelectedItemPanel?: boolean;
	onRoomSelectedChange?: (hasRoomSelected: boolean) => void;
	onPlacementExpandedChange?: (isExpanded: boolean) => void;
	onFloorEditChange?: (isEditing: boolean) => void;
	onOpenAlbumEditor?: (location: string, sourceRef?: string) => void;
}

type StoryDialogState =
	| { mode: 'add' }
	| null;

type DeleteDialogState =
	| { kind: 'room'; roomId: string }
	| null;

interface StoryOutlineDraft {
	origin: { x: number; y: number };
	segments: FloorPlanSegment[];
}

interface SelectedPlacedItemSummary {
	id: string;
	icon: string;
	name: string;
	detail: string | null;
}

function cloneRoom(room: FloorPlanRoom): FloorPlanRoom {
	return {
		...room,
		origin: { ...room.origin },
		segments: room.segments.map((segment) => ({ ...segment })),
		placedItems: room.placedItems.map((item) => ({
			...item,
			recurringTasks: item.recurringTasks?.map((task) => ({
				...task,
				recurrence: { ...task.recurrence },
			})),
		})),
		dedicatedItems: room.dedicatedItems?.map((item) => ({ ...item })),
		dedicatedContainers: room.dedicatedContainers?.map((container) => ({
			...container,
			items: container.items.map((item) => ({ ...item })),
			dimensions: container.dimensions ? { ...container.dimensions } : undefined,
			layoutGrid: container.layoutGrid
				? {
					...container.layoutGrid,
					widthDepth: container.layoutGrid.widthDepth ? { ...container.layoutGrid.widthDepth } : undefined,
					widthHeight: container.layoutGrid.widthHeight ? { ...container.layoutGrid.widthHeight } : undefined,
					depthHeight: container.layoutGrid.depthHeight ? { ...container.layoutGrid.depthHeight } : undefined,
				}
				: undefined,
			notes: container.notes?.map((note) => ({ ...note })),
			attachments: container.attachments ? [...container.attachments] : undefined,
			links: container.links?.map((link) => ({ ...link })),
		})),
		photos: room.photos ? [...room.photos] : undefined,
	};
}

function cloneStory(story: HomeStory): HomeStory {
	return {
		...story,
		placedItems: (story.placedItems ?? []).map((item) => ({
			...item,
			recurringTasks: item.recurringTasks?.map((task) => ({
				...task,
				recurrence: { ...task.recurrence },
			})),
		})),
		photos: story.photos ? [...story.photos] : undefined,
		rooms: story.rooms.map(cloneRoom),
	};
}

function translatePlacedItems(placedItems: FloorPlanRoom['placedItems'], deltaX: number, deltaY: number): FloorPlanRoom['placedItems'] {
	if (deltaX === 0 && deltaY === 0) return placedItems.map((item) => ({ ...item }));

	return placedItems.map((item) => ({
		...item,
		x: item.x + deltaX,
		y: item.y + deltaY,
	}));
}


function makeDraftRoom(story: HomeStory): FloorPlanRoom {
	const outlinePoints = story.outlineOrigin && story.outlineSegments
		? segmentsToPoints(story.outlineOrigin, story.outlineSegments)
		: [];
	const outlineBounds = outlinePoints.length > 0 ? getPointsBounds(outlinePoints) : null;
	const origin = outlineBounds
		? {
			x: outlineBounds.minX + 24,
			y: outlineBounds.minY + 24,
		}
		: { x: 220, y: 180 };

	return {
		id: uuidv4(),
		name: '',
		icon: 'home',
		color: '#84cc16',
		origin,
		segments: [],
		placedItems: [],
		dedicatedItems: [],
		dedicatedContainers: [],
		photos: [],
	};
}

function cloneStoryOutline(story: HomeStory): StoryOutlineDraft {
	return {
		origin: story.outlineOrigin ? { ...story.outlineOrigin } : { x: 120, y: 110 },
		segments: (story.outlineSegments ?? []).map((segment) => ({ ...segment })),
	};
}

function makeDraftStoryOutline(): StoryOutlineDraft {
	return {
		origin: { x: 120, y: 110 },
		segments: [],
	};
}

const ADD_STORY_OPTION_VALUE = '__add_story__';

export function HomeLayout({
	stories,
	onChange,
	editable = false,
	homeId,
	homeAlbum,
	hideRoomList = false,
	showSelectedItemPanel = false,
	onRoomSelectedChange,
	onPlacementExpandedChange,
	onFloorEditChange,
	onOpenAlbumEditor,
}: HomeLayoutProps) {
	const [activeStoryId, setActiveStoryId] = useState<string | null>(stories[0]?.id ?? null);
	const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
	const [selectedPlacedId, setSelectedPlacedId] = useState<string | null>(null);
	const [storyDialog, setStoryDialog] = useState<StoryDialogState>(null);
	const [editingStoryId, setEditingStoryId] = useState<string | null>(null);
	const [storyName, setStoryName] = useState('');
	const [storyError, setStoryError] = useState('');
	const [editingRoom, setEditingRoom] = useState<FloorPlanRoom | null>(null);
	const [editingMode, setEditingMode] = useState<'create' | 'update' | null>(null);
	const [editingStoryOutline, setEditingStoryOutline] = useState<StoryOutlineDraft | null>(null);
	const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>(null);
	const resources = useResourceStore((state) => state.resources);
	const setResource = useResourceStore((state) => state.setResource);
	const user = useUserStore((state) => state.user);

	const activeStory = stories.find((story) => story.id === activeStoryId) ?? stories[0] ?? null;
	const effectiveSelectedRoomId = selectedRoomId !== null && activeStory?.rooms.some((room) => room.id === selectedRoomId)
		? selectedRoomId
		: null;
	const inventoryResources = Object.values(resources).filter((entry): entry is InventoryResource => entry.type === 'inventory');
	const userItemTemplates = getUserInventoryItemTemplates(user);

	function formatQuantity(quantity: number | undefined, unit?: string) {
		const normalizedQuantity = quantity ?? 1;
		const normalizedUnit = unit?.trim();
		return normalizedUnit ? `Quantity ${normalizedQuantity} ${normalizedUnit}` : `Quantity ${normalizedQuantity}`;
	}

	function buildFacilityDetail(placement: PlacedInstance, resolvedTemplate: ReturnType<typeof resolveInventoryItemTemplate>) {
		return placement.recurringTasks?.find((task) => task.taskTemplateRef?.trim())?.taskTemplateRef?.trim()
			?? resolvedTemplate?.builtInTasks?.find((task) => task.taskTemplateRef?.trim())?.taskTemplateRef?.trim()
			?? null;
	}

	function buildPlacedItemSummary(
		placement: PlacedInstance,
		resolvedTemplate: ReturnType<typeof resolveInventoryItemTemplate>,
		quantity?: number,
		unit?: string,
	): SelectedPlacedItemSummary {
		return {
			id: placement.id,
			icon: resolvedTemplate?.icon ?? 'inventory',
			name: resolvedTemplate?.name ?? placement.refId,
			detail: resolvedTemplate?.kind === 'facility'
				? buildFacilityDetail(placement, resolvedTemplate)
				: formatQuantity(quantity ?? placement.quantity, unit),
		};
	}

	function resolvePlacedItemSummary(room: FloorPlanRoom, placement: PlacedInstance): SelectedPlacedItemSummary {
		for (const inventory of inventoryResources) {
			const item = inventory.items.find((candidate) => candidate.id === placement.refId);
			if (!item) continue;
			const resolvedItem = resolveInventoryItemTemplate(item.itemTemplateRef, mergeInventoryItemTemplates(userItemTemplates, inventory.itemTemplates));
			return buildPlacedItemSummary(placement, resolvedItem, item.quantity, item.unit);
		}

		const roomTemplates = mergeInventoryItemTemplates(userItemTemplates, room.dedicatedItems);
		const resolvedTemplate = resolveInventoryItemTemplate(placement.refId, roomTemplates);
		return buildPlacedItemSummary(placement, resolvedTemplate);
	}

	const selectedPlacedItemSummary = (() => {
		if (!activeStory || !selectedPlacedId) return null;

		for (const room of activeStory.rooms) {
			const placement = room.placedItems.find((entry) => entry.id === selectedPlacedId && entry.kind === 'item');
			if (placement) return resolvePlacedItemSummary(room, placement);
		}

		const storyPlacement = activeStory.placedItems.find((entry) => entry.id === selectedPlacedId && entry.kind === 'item');
		if (!storyPlacement) return null;

		for (const inventory of inventoryResources) {
			const item = inventory.items.find((candidate) => candidate.id === storyPlacement.refId);
			if (!item) continue;
			const resolvedItem = resolveInventoryItemTemplate(item.itemTemplateRef, mergeInventoryItemTemplates(userItemTemplates, inventory.itemTemplates));
			return buildPlacedItemSummary(storyPlacement, resolvedItem, item.quantity, item.unit);
		}

		const resolvedTemplate = resolveInventoryItemTemplate(storyPlacement.refId, userItemTemplates);
		return buildPlacedItemSummary(storyPlacement, resolvedTemplate);
	})();

	function commit(nextStories: HomeStory[]) {
		onChange?.(nextStories);
	}

	function handleAddStory() {
		setEditingStoryId(null);
		setEditingStoryOutline(null);
		setStoryDialog({ mode: 'add' });
		setStoryName(`Story ${stories.length + 1}`);
		setStoryError('');
	}

	function confirmDeleteStory(storyId: string) {
		const remainingStories = stories.filter((entry) => entry.id !== storyId);
		commit(remainingStories);
		if (activeStoryId === storyId) {
			setActiveStoryId(remainingStories[0]?.id ?? null);
			setSelectedRoomId(null);
			setSelectedPlacedId(null);
			setEditingRoom(null);
			setEditingMode(null);
			handleCancelStoryEdit();
		}
		setDeleteDialog(null);
	}

	function deleteRoom(roomId: string) {
		if (!activeStory) return;
		setDeleteDialog({ kind: 'room', roomId });
	}

	function confirmDeleteRoom(roomId: string) {
		if (!activeStory) return;
		commit(stories.map((story) => (
			story.id !== activeStory.id
				? story
				: {
					...story,
					rooms: story.rooms.filter((room) => room.id !== roomId),
				}
		)));
		const now = new Date().toISOString();
		for (const inventory of Object.values(resources).filter((entry): entry is InventoryResource => entry.type === 'inventory')) {
			let changed = false;
			const nextContainers = inventory.containers?.map((container) => {
				let containerChanged = false;
				const nextLinks = container.links?.map((link) => {
					if (link.targetRoomId !== roomId) return link;
					if (homeId && link.targetResourceId !== homeId) return link;
					containerChanged = true;
					return {
						...link,
						targetResourceId: undefined,
						targetRoomId: undefined,
					};
				});
				if (!containerChanged) return container;
				changed = true;
				return {
					...container,
					links: nextLinks,
				};
			});
			if (changed) {
				setResource({
					...inventory,
					updatedAt: now,
					containers: nextContainers,
				});
			}
		}
		setSelectedRoomId((current) => (current === roomId ? null : current));
		if (editingRoom?.id === roomId) {
			setEditingRoom(null);
			setEditingMode(null);
		}
		setDeleteDialog(null);
	}

	function handleSaveStoryName() {
		if (storyDialog?.mode !== 'add') return;
		const trimmed = storyName.trim();
		if (!trimmed) {
			setStoryError('Story name is required.');
			return;
		}

		if (storyDialog.mode === 'add') {
			const nextStory: HomeStory = { id: uuidv4(), name: trimmed, placedItems: [], photos: [], rooms: [] };
			commit([...stories, nextStory]);
			setActiveStoryId(nextStory.id);
			setSelectedRoomId(null);
			setEditingMode(null);
			setEditingRoom(null);
			setEditingStoryOutline(makeDraftStoryOutline());
		} else {
			return;
		}

		setStoryDialog(null);
		setStoryError('');
	}

	function handleStartCreateRoom() {
		if (!activeStory) return;
		if (!activeStory.outlineOrigin || (activeStory.outlineSegments?.length ?? 0) === 0) return;
		setEditingStoryOutline(null);
		setEditingMode('create');
		setEditingRoom(makeDraftRoom(activeStory));
		setSelectedRoomId(null);
	}

	function handleStartEditStoryOutline() {
		if (!activeStory) return;
		setEditingMode(null);
		setEditingRoom(null);
		setSelectedRoomId(null);
		setEditingStoryId(activeStory.id);
		setStoryName(activeStory.name);
		setStoryError('');
		setEditingStoryOutline(cloneStoryOutline(activeStory));
	}

	function handleStartEditStoryName() {
		if (!activeStory) return;
		setEditingMode(null);
		setEditingRoom(null);
		setSelectedRoomId(null);
		setEditingStoryId(activeStory.id);
		setStoryName(activeStory.name);
		setStoryError('');
		setEditingStoryOutline(null);
	}

	function handleStoryEditButtonClick() {
		handleStartEditStoryName();
	}

	function handleStartEditRoom(room: FloorPlanRoom) {
		setEditingStoryOutline(null);
		setEditingMode('update');
		setEditingRoom(cloneRoom(room));
		setSelectedRoomId(room.id);
	}

	function handleSelectStory(storyId: string) {
		setActiveStoryId(storyId);
		setSelectedRoomId(null);
		setEditingRoom(null);
		setEditingMode(null);
		setEditingStoryId(null);
		setStoryName('');
		setStoryError('');
		setEditingStoryOutline(null);
	}

	function handleCancelStoryEdit() {
		setEditingStoryId(null);
		setStoryName('');
		setStoryError('');
		setEditingStoryOutline(null);
	}

	function handleCancelStoryOutlineEdit() {
		if (!activeStory) return;
		setEditingStoryId(activeStory.id);
		setStoryName(activeStory.name);
		setStoryError('');
		setEditingStoryOutline(null);
	}

	function handleSaveStoryOutline() {
		if (!activeStory || editingStoryId !== activeStory.id || !editingStoryOutline) return;
		const trimmed = storyName.trim();
		if (!trimmed) {
			setStoryError('Story name is required.');
			return;
		}
		commit(stories.map((story) => (
			story.id !== activeStory.id
				? story
				: {
					...story,
					name: trimmed,
					outlineOrigin: { ...editingStoryOutline.origin },
					outlineSegments: closeFloorPlanSegments(editingStoryOutline.origin, editingStoryOutline.segments).map((segment) => ({ ...segment })),
				}
		)));
		setEditingStoryId(activeStory.id);
		setStoryName(trimmed);
		setStoryError('');
		setEditingStoryOutline(null);
	}

	function handleSaveStoryEdits() {
		if (!activeStory || editingStoryId !== activeStory.id) return;
		const trimmed = storyName.trim();
		if (!trimmed) {
			setStoryError('Story name is required.');
			return;
		}
		commit(stories.map((story) => (
			story.id !== activeStory.id
				? story
				: editingStoryOutline
					? {
						...story,
						name: trimmed,
						outlineOrigin: { ...editingStoryOutline.origin },
						outlineSegments: closeFloorPlanSegments(editingStoryOutline.origin, editingStoryOutline.segments).map((segment) => ({ ...segment })),
					}
					: {
						...story,
						name: trimmed,
					}
		)));
		handleCancelStoryEdit();
	}

	function handleSaveEditingRoom() {
		if (!activeStory) return;
		if (!editingRoom) return;
		const existingRoom = activeStory.rooms.find((entry) => entry.id === editingRoom.id) ?? null;
		const deltaX = existingRoom ? editingRoom.origin.x - existingRoom.origin.x : 0;
		const deltaY = existingRoom ? editingRoom.origin.y - existingRoom.origin.y : 0;
		const closedRoom = {
			...editingRoom,
			segments: closeFloorPlanSegments(editingRoom.origin, editingRoom.segments).map((segment) => ({ ...segment })),
			placedItems: translatePlacedItems(editingRoom.placedItems, deltaX, deltaY),
		};
		const roomExists = activeStory.rooms.some((entry) => entry.id === editingRoom.id);
		commit(stories.map((story) => {
			if (story.id !== activeStory.id) return story;
			return {
				...story,
				rooms: roomExists
					? story.rooms.map((entry) => (entry.id === editingRoom.id ? cloneRoom(closedRoom) : entry))
					: [...story.rooms, cloneRoom(closedRoom)],
			};
		}));
		setSelectedRoomId(closedRoom.id);
		setEditingRoom(null);
		setEditingMode(null);
		setEditingStoryOutline(null);
	}

	function handleUpdateRoomPlacedItems(roomId: string, placedItems: FloorPlanRoom['placedItems']) {
		if (!activeStory) return;
		commit(stories.map((story) => {
			if (story.id !== activeStory.id) return story;
			return {
				...story,
				rooms: story.rooms.map((room) => (
					room.id === roomId
						? {
							...room,
							placedItems: placedItems.map((item) => ({ ...item })),
						}
						: room
				)),
			};
		}));
	}

	function handleUpdateStoryPlacedItems(placedItems: HomeStory['placedItems']) {
		if (!activeStory) return;
		commit(stories.map((story) => (
			story.id !== activeStory.id
				? story
				: {
					...story,
					placedItems: placedItems.map((item) => ({ ...item })),
				}
		)));
	}

	function handleUpdateRoomPhotos(roomId: string, photos: AlbumEntry[]) {
		if (!activeStory) return;
		commit(stories.map((story) => {
			if (story.id !== activeStory.id) return story;
			return {
				...story,
				rooms: story.rooms.map((room) => (
					room.id === roomId
						? {
							...room,
							photos: photos.length > 0 ? [...photos] : undefined,
						}
						: room
				)),
			};
		}));
	}

	function handleUpdateRoom(roomId: string, updater: (room: FloorPlanRoom) => FloorPlanRoom) {
		if (!activeStory) return;
		commit(stories.map((story) => {
			if (story.id !== activeStory.id) return story;
			return {
				...story,
				rooms: story.rooms.map((room) => (
					room.id === roomId ? cloneRoom(updater(room)) : room
				)),
			};
		}));
	}

	function handleUpdateStoryPhotos(photos: AlbumEntry[]) {
		if (!activeStory) return;
		commit(stories.map((story) => (
			story.id !== activeStory.id
				? story
				: {
					...story,
					photos: photos.length > 0 ? [...photos] : undefined,
				}
		)));
	}

	const activeStoryHasOutline = Boolean(activeStory?.outlineOrigin && (activeStory?.outlineSegments?.length ?? 0) > 0);
	const isEditingStoryName = Boolean(activeStory && editingStoryId === activeStory.id);
	const isEditingStoryOutline = Boolean(activeStory && editingStoryId === activeStory.id && editingStoryOutline);
	const showHeaderStoryActions = editable && !isEditingStoryOutline;
	const showStoryControls = !effectiveSelectedRoomId;

	useEffect(() => {
		onRoomSelectedChange?.(Boolean(effectiveSelectedRoomId));
	}, [effectiveSelectedRoomId, onRoomSelectedChange]);

	useEffect(() => {
		onFloorEditChange?.(isEditingStoryOutline);
	}, [isEditingStoryOutline, onFloorEditChange]);

	return (
		<div className="flex h-full flex-col rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-800/40">
			{showStoryControls ? (
				<>
					<div className="flex items-center gap-2">
						<div className="min-w-0 flex-1">
							{isEditingStoryName ? (
								<div className="flex items-center gap-2">
									<input
										type="text"
										value={storyName}
										onChange={(event) => {
											setStoryName(event.target.value);
											setStoryError('');
										}}
										className="min-w-0 flex-1 rounded-md border border-blue-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none ring-2 ring-blue-200 dark:border-blue-500 dark:bg-gray-900 dark:text-gray-100 dark:ring-blue-900/60"
										placeholder="Story name"
										aria-label="Story name"
									/>
								</div>
							) : (
								<select
									value={activeStory?.id ?? ''}
									onChange={(event) => {
										if (event.target.value === ADD_STORY_OPTION_VALUE) {
											handleAddStory();
											return;
										}
										handleSelectStory(event.target.value);
									}}
									className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-blue-500 dark:focus:ring-blue-900/60"
									aria-label="Select story"
								>
									{stories.map((story) => (
										<option key={story.id} value={story.id}>
											{story.name}
										</option>
									))}
									<option value={ADD_STORY_OPTION_VALUE}>+ Add Story</option>
								</select>
							)}
						</div>
						{showHeaderStoryActions ? (
							<div className="flex shrink-0 items-center gap-2">
								<button
									type="button"
									onClick={handleStoryEditButtonClick}
									disabled={!activeStory}
									className={isEditingStoryName || isEditingStoryOutline
										? 'inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-gray-700'
										: 'inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 dark:disabled:bg-gray-700'}
									aria-label="Edit story"
									title="Edit story"
								>
									<IconDisplay iconKey="edit" size={16} className="h-4 w-4 object-contain" alt="" />
								</button>
							</div>
						) : null}
					</div>
					{storyError && isEditingStoryName ? <div className="text-xs text-red-500">{storyError}</div> : null}
				</>
			) : null}

			{activeStory ? (
				<div className="flex flex-col min-h-0 flex-1">
					<HomeFloorPlan
					story={cloneStory(activeStory)}
					selectedRoomId={effectiveSelectedRoomId}
					selectedPlacedId={selectedPlacedId}
					homeAlbum={homeAlbum}
					onPlacedItemSelect={(id) => setSelectedPlacedId(id)}
					onSelectRoom={(id) => {
						if (id !== selectedRoomId) {
							setSelectedPlacedId(null);
						}
						setSelectedRoomId(id);
						onRoomSelectedChange?.(Boolean(id));
					}}
					homeId={homeId}
					hideRoomList={hideRoomList}
					onPlacementExpandedChange={onPlacementExpandedChange}
					editable={editable}
					editingStoryOutline={editingStoryOutline}
					editingRoom={editingRoom}
					editingMode={editingMode}
					isEditingStoryName={isEditingStoryName}
					activeStoryHasOutline={activeStoryHasOutline}
					canSaveStoryChanges={storyName.trim().length > 0}
					onEditingStoryOutlineChange={editable ? setEditingStoryOutline : undefined}
					onSaveStoryChanges={editable ? handleSaveStoryEdits : undefined}
					onCancelStoryChanges={editable ? (isEditingStoryOutline ? handleCancelStoryOutlineEdit : handleCancelStoryEdit) : undefined}
					onDeleteStory={editable && activeStory ? () => confirmDeleteStory(activeStory.id) : undefined}
					onEditStoryOutline={editable ? handleStartEditStoryOutline : undefined}
					onAddStory={editable ? handleAddStory : undefined}
					onOutlineRoom={editable ? handleStartCreateRoom : undefined}
					onSaveStoryOutline={editable ? handleSaveStoryOutline : undefined}
					onEditingRoomChange={editable ? setEditingRoom : undefined}
					onSaveEditingRoom={editable ? handleSaveEditingRoom : undefined}
					onCancelEditingRoom={editable ? () => { setEditingRoom(null); setEditingMode(null); handleCancelStoryEdit(); } : undefined}
					onStartEditRoom={editable ? handleStartEditRoom : undefined}
					onDeleteRoom={editable ? deleteRoom : undefined}
					onUpdateRoomPlacedItems={editable ? handleUpdateRoomPlacedItems : undefined}
					onUpdateRoom={editable ? handleUpdateRoom : undefined}
					onUpdateStoryPlacedItems={editable ? handleUpdateStoryPlacedItems : undefined}
					onUpdateRoomPhotos={editable ? handleUpdateRoomPhotos : undefined}
					onUpdateStoryPhotos={editable ? handleUpdateStoryPhotos : undefined}
					onOpenAlbumEditor={onOpenAlbumEditor}
					/>
				</div>
			) : (
				<div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400">
					{editable ? 'Add a story to start building the floor plan.' : 'No floor-plan stories saved.'}
				</div>
			)}

			{showSelectedItemPanel && selectedPlacedItemSummary ? (
				<div className="rounded-xl border border-gray-200 bg-white/80 p-3 dark:border-gray-700 dark:bg-gray-900/50">
					<div className="flex items-start justify-between gap-3">
						<div className="flex min-w-0 items-center gap-3">
							<IconDisplay iconKey={selectedPlacedItemSummary.icon || 'inventory'} size={20} className="h-5 w-5 shrink-0 object-contain" alt="" />
							<div className="min-w-0">
								<div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{selectedPlacedItemSummary.name}</div>
								{selectedPlacedItemSummary.detail ? (
									<div className="truncate text-xs text-gray-500 dark:text-gray-400">{selectedPlacedItemSummary.detail}</div>
								) : null}
							</div>
						</div>
						<button
							type="button"
							onClick={() => setSelectedPlacedId(null)}
							className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
							aria-label="Deselect selected item"
						>
							×
						</button>
					</div>
				</div>
			) : null}

			{storyDialog ? (
				<PopupShell
					title="New Story"
					onClose={() => {
						setStoryDialog(null);
						setStoryError('');
					}}
				>
					<div className="space-y-3">
						<div>
							<label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
								Story name <span className="text-red-500">*</span>
							</label>
							<input
								type="text"
								value={storyName}
								onChange={(event) => {
									setStoryName(event.target.value);
									setStoryError('');
								}}
								autoFocus
								className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
							/>
							{storyError ? <p className="mt-1 text-xs text-red-500">{storyError}</p> : null}
						</div>
						<div className="flex gap-2 pt-1">
							<button
								type="button"
								onClick={() => {
									setStoryDialog(null);
									setStoryError('');
								}}
								className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleSaveStoryName}
								className="flex-1 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
							>
								Create Story
							</button>
						</div>
					</div>
				</PopupShell>
			) : null}

			{deleteDialog ? (
				<PopupShell
					title="Delete Room"
					onClose={() => setDeleteDialog(null)}
				>
					<div className="space-y-3">
						<p className="text-sm text-gray-600 dark:text-gray-300">
							{(() => {
								const room = activeStory?.rooms.find((entry) => entry.id === deleteDialog.roomId) ?? editingRoom;
								return room?.name?.trim() ? `Delete ${room.name}?` : 'Delete this room?';
							})()}
						</p>
						<div className="flex gap-2 pt-1">
							<button
								type="button"
								onClick={() => setDeleteDialog(null)}
								className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => {
									confirmDeleteRoom(deleteDialog.roomId);
								}}
								className="flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
							>
								Delete
							</button>
						</div>
					</div>
				</PopupShell>
			) : null}
		</div>
	);
}


