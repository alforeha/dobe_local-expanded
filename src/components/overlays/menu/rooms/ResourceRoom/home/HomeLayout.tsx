import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { AlbumEntry, FloorPlanRoom, FloorPlanSegment, HomeStory, InventoryResource } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { closeFloorPlanSegments, getPointsBounds, segmentsToPoints } from '../../../../../../utils/floorPlan';
import { PopupShell } from '../../../../../shared/popups/PopupShell';
import { HomeFloorPlan } from './HomeFloorPlan';

interface HomeLayoutProps {
	stories: HomeStory[];
	onChange?: (stories: HomeStory[]) => void;
	editable?: boolean;
	homeId?: string;
}

type StoryDialogState =
	| { mode: 'add' }
	| { mode: 'rename'; storyId: string }
	| null;

type DeleteDialogState =
	| { kind: 'story'; storyId: string }
	| { kind: 'room'; roomId: string }
	| null;

interface StoryOutlineDraft {
	origin: { x: number; y: number };
	segments: FloorPlanSegment[];
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

export function HomeLayout({ stories, onChange, editable = false, homeId }: HomeLayoutProps) {
	const [activeStoryId, setActiveStoryId] = useState<string | null>(stories[0]?.id ?? null);
	const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
	const [storyDialog, setStoryDialog] = useState<StoryDialogState>(null);
	const [storyName, setStoryName] = useState('');
	const [storyError, setStoryError] = useState('');
	const [editingRoom, setEditingRoom] = useState<FloorPlanRoom | null>(null);
	const [editingMode, setEditingMode] = useState<'create' | 'update' | null>(null);
	const [editingStoryOutline, setEditingStoryOutline] = useState<StoryOutlineDraft | null>(null);
	const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>(null);
	const resources = useResourceStore((state) => state.resources);
	const setResource = useResourceStore((state) => state.setResource);

	const activeStory = stories.find((story) => story.id === activeStoryId) ?? stories[0] ?? null;
	const effectiveSelectedRoomId = selectedRoomId !== null && activeStory?.rooms.some((room) => room.id === selectedRoomId)
		? selectedRoomId
		: null;

	function commit(nextStories: HomeStory[]) {
		onChange?.(nextStories);
	}

	function handleAddStory() {
		setStoryDialog({ mode: 'add' });
		setStoryName(`Story ${stories.length + 1}`);
		setStoryError('');
	}

	function handleRenameStory(storyId: string) {
		const story = stories.find((entry) => entry.id === storyId);
		if (!story) return;
		setStoryDialog({ mode: 'rename', storyId });
		setStoryName(story.name);
		setStoryError('');
	}

	function handleDeleteStory(storyId: string) {
		setDeleteDialog({ kind: 'story', storyId });
	}

	function confirmDeleteStory(storyId: string) {
		commit(stories.filter((entry) => entry.id !== storyId));
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
		if (!storyDialog) return;
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
			commit(stories.map((entry) => (entry.id === storyDialog.storyId ? { ...entry, name: trimmed } : entry)));
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
		setEditingStoryOutline(cloneStoryOutline(activeStory));
	}

	function handleStartEditRoom(room: FloorPlanRoom) {
		setEditingStoryOutline(null);
		setEditingMode('update');
		setEditingRoom(cloneRoom(room));
		setSelectedRoomId(room.id);
	}

	function handleSelectStory(storyId: string) {
		setActiveStoryId(storyId);
		setEditingRoom(null);
		setEditingMode(null);
		setEditingStoryOutline(null);
	}

	function handleSaveStoryOutline() {
		if (!activeStory || !editingStoryOutline) return;
		const closedSegments = closeFloorPlanSegments(editingStoryOutline.origin, editingStoryOutline.segments);
		commit(stories.map((story) => (
			story.id !== activeStory.id
				? story
				: {
					...story,
					outlineOrigin: { ...editingStoryOutline.origin },
					outlineSegments: closedSegments.map((segment) => ({ ...segment })),
				}
		)));
		setEditingStoryOutline(null);
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

	return (
		<div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-800/40">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="text-sm font-semibold text-gray-800 dark:text-gray-100">Floor plan</div>
					<div className="text-xs text-gray-500 dark:text-gray-400">Manage stories, draw rooms with orthogonal segments, and position them on a shared canvas.</div>
				</div>
				{editable ? (
					<div className="flex flex-wrap items-center gap-2">
						<button type="button" onClick={handleAddStory} className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">+ Add story</button>
						{activeStory ? (
							<>
								<button type="button" onClick={handleStartEditStoryOutline} className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
									{activeStoryHasOutline ? 'Edit story outline' : 'Outline story'}
								</button>
							</>
						) : null}
					</div>
				) : null}
			</div>

			<div className="flex flex-wrap gap-2">
				{stories.map((story) => {
					const isActive = story.id === activeStory?.id;
					return (
						<div key={story.id} className={isActive ? 'flex items-center gap-2 rounded-full bg-blue-500 px-3 py-1.5 text-xs text-white' : 'flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300'}>
							<button type="button" onClick={() => handleSelectStory(story.id)} className="font-semibold">{story.name}</button>
							<span className={isActive ? 'text-blue-100' : 'text-gray-400'}>{story.rooms.length}</span>
							{editable ? <button type="button" onClick={() => handleRenameStory(story.id)} className={isActive ? 'text-blue-100 hover:text-white' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-100'}>Rename</button> : null}
							{editable && stories.length > 1 ? <button type="button" onClick={() => handleDeleteStory(story.id)} className={isActive ? 'text-blue-100 hover:text-white' : 'text-gray-400 hover:text-red-500'}>Delete</button> : null}
						</div>
					);
				})}
			</div>

			{activeStory ? (
				<HomeFloorPlan
					story={cloneStory(activeStory)}
					selectedRoomId={effectiveSelectedRoomId}
					onSelectRoom={setSelectedRoomId}
					homeId={homeId}
					editable={editable}
					editingStoryOutline={editingStoryOutline}
					editingRoom={editingRoom}
					editingMode={editingMode}
					onEditingStoryOutlineChange={editable ? setEditingStoryOutline : undefined}
					onSaveStoryOutline={editable ? handleSaveStoryOutline : undefined}
					onEditingRoomChange={editable ? setEditingRoom : undefined}
					onSaveEditingRoom={editable ? handleSaveEditingRoom : undefined}
					onCancelEditingRoom={editable ? () => { setEditingRoom(null); setEditingMode(null); setEditingStoryOutline(null); } : undefined}
					onStartCreateRoom={editable ? handleStartCreateRoom : undefined}
					onStartEditRoom={editable ? handleStartEditRoom : undefined}
					onDeleteRoom={editable ? deleteRoom : undefined}
					onUpdateRoomPlacedItems={editable ? handleUpdateRoomPlacedItems : undefined}
					onUpdateRoom={editable ? handleUpdateRoom : undefined}
					onUpdateStoryPlacedItems={editable ? handleUpdateStoryPlacedItems : undefined}
					onUpdateRoomPhotos={editable ? handleUpdateRoomPhotos : undefined}
					onUpdateStoryPhotos={editable ? handleUpdateStoryPhotos : undefined}
				/>
			) : (
				<div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400">
					{editable ? 'Add a story to start building the floor plan.' : 'No floor-plan stories saved.'}
				</div>
			)}

			{storyDialog ? (
				<PopupShell
					title={storyDialog.mode === 'add' ? 'New Story' : 'Rename Story'}
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
								{storyDialog.mode === 'add' ? 'Create Story' : 'Save'}
							</button>
						</div>
					</div>
				</PopupShell>
			) : null}

			{deleteDialog ? (
				<PopupShell
					title={deleteDialog.kind === 'story' ? 'Delete Story' : 'Delete Room'}
					onClose={() => setDeleteDialog(null)}
				>
					<div className="space-y-3">
						<p className="text-sm text-gray-600 dark:text-gray-300">
							{deleteDialog.kind === 'story'
								? (() => {
									const story = stories.find((entry) => entry.id === deleteDialog.storyId);
									return story
										? `Delete ${story.name} and its ${story.rooms.length} room${story.rooms.length === 1 ? '' : 's'}?`
										: 'Delete this story?';
								})()
								: (() => {
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
									if (deleteDialog.kind === 'story') {
										confirmDeleteStory(deleteDialog.storyId);
										return;
									}
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
