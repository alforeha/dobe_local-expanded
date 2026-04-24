import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { FloorPlanRoom, HomeStory } from '../../../../../../types/resource';
import { HomeFloorPlan } from './HomeFloorPlan';
import { HomeRoomDrawer } from './HomeRoomDrawer';

interface HomeLayoutProps {
	stories: HomeStory[];
	onChange?: (stories: HomeStory[]) => void;
	editable?: boolean;
}

export function HomeLayout({ stories, onChange, editable = false }: HomeLayoutProps) {
	const [activeStoryId, setActiveStoryId] = useState<string | null>(stories[0]?.id ?? null);
	const [selectedRoomId, setSelectedRoomId] = useState<string | null>(stories[0]?.rooms[0]?.id ?? null);
	const [drawerRoom, setDrawerRoom] = useState<FloorPlanRoom | null | undefined>(undefined);

	useEffect(() => {
		if (!stories.some((story) => story.id === activeStoryId)) {
			setActiveStoryId(stories[0]?.id ?? null);
		}
	}, [activeStoryId, stories]);

	useEffect(() => {
		const activeStory = stories.find((story) => story.id === activeStoryId) ?? stories[0] ?? null;
		if (!activeStory) {
			setSelectedRoomId(null);
			return;
		}
		if (!activeStory.rooms.some((room) => room.id === selectedRoomId)) {
			setSelectedRoomId(activeStory.rooms[0]?.id ?? null);
		}
	}, [activeStoryId, selectedRoomId, stories]);

	const activeStory = stories.find((story) => story.id === activeStoryId) ?? stories[0] ?? null;

	function commit(nextStories: HomeStory[]) {
		onChange?.(nextStories);
	}

	function handleAddStory() {
		const name = window.prompt('Story name', `Story ${stories.length + 1}`)?.trim();
		if (!name) return;
		const nextStory: HomeStory = { id: uuidv4(), name, rooms: [] };
		commit([...stories, nextStory]);
		setActiveStoryId(nextStory.id);
		setSelectedRoomId(null);
	}

	function handleRenameStory(storyId: string) {
		const story = stories.find((entry) => entry.id === storyId);
		if (!story) return;
		const name = window.prompt('Rename story', story.name)?.trim();
		if (!name) return;
		commit(stories.map((entry) => (entry.id === storyId ? { ...entry, name } : entry)));
	}

	function handleDeleteStory(storyId: string) {
		const story = stories.find((entry) => entry.id === storyId);
		if (!story) return;
		if (!window.confirm(`Delete ${story.name} and its ${story.rooms.length} room${story.rooms.length === 1 ? '' : 's'}?`)) return;
		commit(stories.filter((entry) => entry.id !== storyId));
	}

	function updateRoom(roomId: string, patch: Partial<FloorPlanRoom>) {
		if (!activeStory) return;
		commit(stories.map((story) => (
			story.id !== activeStory.id
				? story
				: {
					...story,
					rooms: story.rooms.map((room) => (room.id === roomId ? { ...room, ...patch } : room)),
				}
		)));
	}

	function deleteRoom(roomId: string) {
		if (!activeStory) return;
		commit(stories.map((story) => (
			story.id !== activeStory.id
				? story
				: {
					...story,
					rooms: story.rooms.filter((room) => room.id !== roomId),
				}
		)));
		setSelectedRoomId((current) => (current === roomId ? null : current));
	}

	function saveRoom(room: FloorPlanRoom) {
		if (!activeStory) return;
		const roomExists = activeStory.rooms.some((entry) => entry.id === room.id);
		commit(stories.map((story) => {
			if (story.id !== activeStory.id) return story;
			return {
				...story,
				rooms: roomExists
					? story.rooms.map((entry) => (entry.id === room.id ? room : entry))
					: [...story.rooms, room],
			};
		}));
		setDrawerRoom(undefined);
		setSelectedRoomId(room.id);
	}

	return (
		<div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-800/40">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="text-sm font-semibold text-gray-800 dark:text-gray-100">Floor plan</div>
					<div className="text-xs text-gray-500 dark:text-gray-400">Manage stories, draw rooms with orthogonal segments, and position them on a shared canvas.</div>
				</div>
				{editable ? (
					<div className="flex items-center gap-2">
						<button type="button" onClick={handleAddStory} className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">+ Add story</button>
						{activeStory ? <button type="button" onClick={() => setDrawerRoom(null)} className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600">+ Add room</button> : null}
					</div>
				) : null}
			</div>

			<div className="flex flex-wrap gap-2">
				{stories.map((story) => {
					const isActive = story.id === activeStory?.id;
					return (
						<div key={story.id} className={isActive ? 'flex items-center gap-2 rounded-full bg-blue-500 px-3 py-1.5 text-xs text-white' : 'flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300'}>
							<button type="button" onClick={() => setActiveStoryId(story.id)} className="font-semibold">{story.name}</button>
							<span className={isActive ? 'text-blue-100' : 'text-gray-400'}>{story.rooms.length}</span>
							{editable ? <button type="button" onClick={() => handleRenameStory(story.id)} className={isActive ? 'text-blue-100 hover:text-white' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-100'}>Rename</button> : null}
							{editable && stories.length > 1 ? <button type="button" onClick={() => handleDeleteStory(story.id)} className={isActive ? 'text-blue-100 hover:text-white' : 'text-gray-400 hover:text-red-500'}>Delete</button> : null}
						</div>
					);
				})}
			</div>

			{editable && activeStory && drawerRoom !== undefined ? (
				<HomeRoomDrawer existing={drawerRoom} onCancel={() => setDrawerRoom(undefined)} onSave={saveRoom} />
			) : null}

			{activeStory ? (
				<HomeFloorPlan
					story={activeStory}
					selectedRoomId={selectedRoomId}
					onSelectRoom={setSelectedRoomId}
					editable={editable}
					onUpdateRoom={editable ? updateRoom : undefined}
					onDeleteRoom={editable ? deleteRoom : undefined}
					onEditRoom={editable ? (room) => setDrawerRoom(room) : undefined}
				/>
			) : (
				<div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400">
					{editable ? 'Add a story to start building the floor plan.' : 'No floor-plan stories saved.'}
				</div>
			)}
		</div>
	);
}