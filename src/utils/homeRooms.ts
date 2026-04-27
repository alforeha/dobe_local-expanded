import type { HomeResource } from '../types/resource';

export interface HomeRoomReference {
	id: string;
	name: string;
	icon?: string;
	storyId?: string;
	storyName?: string;
}

export function getHomeRoomReferences(home: HomeResource): HomeRoomReference[] {
	if ((home.stories?.length ?? 0) > 0) {
		return home.stories!.flatMap((story) =>
			story.rooms.map((room) => ({
				id: room.id,
				name: room.name,
				icon: room.icon,
				storyId: story.id,
				storyName: story.name,
			})),
		);
	}

	return (home.rooms ?? []).map((room) => ({
		id: room.id,
		name: room.name,
		icon: room.icon,
	}));
}

export function findHomeRoomReference(home: HomeResource, roomId: string | undefined): HomeRoomReference | null {
	if (!roomId) return null;
	return getHomeRoomReferences(home).find((room) => room.id === roomId) ?? null;
}