import { useEffect, useRef, useState } from 'react';
import { ColorPicker } from '../../../../../shared/ColorPicker';
import { IconPicker } from '../../../../../shared/IconPicker';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import type { FloorPlanRoom, FloorPlanSegment, HomeStory, SegmentDirection } from '../../../../../../types/resource';
import { getPointsBounds, segmentsToPoints } from '../../../../../../utils/floorPlan';

interface HomeFloorPlanProps {
	story: HomeStory;
	selectedRoomId: string | null;
	onSelectRoom: (roomId: string | null) => void;
	editable?: boolean;
	onUpdateRoom?: (roomId: string, patch: Partial<FloorPlanRoom>) => void;
	onDeleteRoom?: (roomId: string) => void;
	onEditRoom?: (room: FloorPlanRoom) => void;
}

const VIEWBOX_WIDTH = 800;
const VIEWBOX_HEIGHT = 600;
const INPUT_CLS = 'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

type InteractionState =
	| { type: 'idle' }
	| { type: 'pan'; clientX: number; clientY: number }
	| { type: 'drag-origin'; roomId: string };

function clampZoom(zoom: number) {
	return Math.min(2.5, Math.max(0.45, zoom));
}

export function HomeFloorPlan({
	story,
	selectedRoomId,
	onSelectRoom,
	editable = false,
	onUpdateRoom,
	onDeleteRoom,
	onEditRoom,
}: HomeFloorPlanProps) {
	const svgRef = useRef<SVGSVGElement | null>(null);
	const [zoom, setZoom] = useState(1);
	const [pan, setPan] = useState({ x: 0, y: 0 });
	const [interaction, setInteraction] = useState<InteractionState>({ type: 'idle' });

	const selectedRoom = story.rooms.find((room) => room.id === selectedRoomId) ?? story.rooms[0] ?? null;

	useEffect(() => {
		if (!selectedRoomId && story.rooms[0]) {
			onSelectRoom(story.rooms[0].id);
		}
	}, [onSelectRoom, selectedRoomId, story.rooms]);

	function updateSelectedSegments(index: number, patch: Partial<FloorPlanSegment>) {
		if (!selectedRoom || !onUpdateRoom) return;
		onUpdateRoom(selectedRoom.id, {
			segments: selectedRoom.segments.map((segment, segmentIndex) => (segmentIndex === index ? { ...segment, ...patch } : segment)),
		});
	}

	function removeSelectedSegment(index: number) {
		if (!selectedRoom || !onUpdateRoom) return;
		onUpdateRoom(selectedRoom.id, {
			segments: selectedRoom.segments.filter((_, segmentIndex) => segmentIndex !== index),
		});
	}

	function toCanvasUnits(delta: number, axis: 'x' | 'y') {
		const rect = svgRef.current?.getBoundingClientRect();
		if (!rect) return delta;
		return axis === 'x' ? delta * (VIEWBOX_WIDTH / rect.width) : delta * (VIEWBOX_HEIGHT / rect.height);
	}

	function getWorldPoint(event: React.PointerEvent<SVGSVGElement>) {
		const rect = event.currentTarget.getBoundingClientRect();
		const svgX = ((event.clientX - rect.left) / rect.width) * VIEWBOX_WIDTH;
		const svgY = ((event.clientY - rect.top) / rect.height) * VIEWBOX_HEIGHT;
		return {
			x: Math.round((svgX - pan.x) / zoom),
			y: Math.round((svgY - pan.y) / zoom),
		};
	}

	function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
		if (interaction.type === 'pan') {
			const dx = toCanvasUnits(event.clientX - interaction.clientX, 'x');
			const dy = toCanvasUnits(event.clientY - interaction.clientY, 'y');
			setPan((current) => ({ x: current.x + dx, y: current.y + dy }));
			setInteraction({ type: 'pan', clientX: event.clientX, clientY: event.clientY });
			return;
		}

		if (interaction.type === 'drag-origin' && onUpdateRoom) {
			const nextPoint = getWorldPoint(event);
			onUpdateRoom(interaction.roomId, { origin: nextPoint });
		}
	}

	function handlePointerUp() {
		setInteraction({ type: 'idle' });
	}

	return (
		<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
			<div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900/60">
				<div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
					<div>
						<div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{story.name}</div>
						<div className="text-xs text-gray-500 dark:text-gray-400">{story.rooms.length} room{story.rooms.length === 1 ? '' : 's'} in this story</div>
					</div>
					<div className="flex items-center gap-2 text-xs">
						<button type="button" onClick={() => setZoom((current) => clampZoom(current - 0.15))} className="rounded-md bg-gray-100 px-2 py-1 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300">-</button>
						<span className="w-12 text-center text-gray-500 dark:text-gray-400">{Math.round(zoom * 100)}%</span>
						<button type="button" onClick={() => setZoom((current) => clampZoom(current + 0.15))} className="rounded-md bg-gray-100 px-2 py-1 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300">+</button>
						<button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="rounded-md bg-gray-100 px-2 py-1 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300">Reset</button>
					</div>
				</div>

				<svg
					ref={svgRef}
					viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
					className="h-[26rem] w-full touch-none bg-slate-50 dark:bg-slate-950"
					onWheel={(event) => {
						event.preventDefault();
						setZoom((current) => clampZoom(current + (event.deltaY < 0 ? 0.1 : -0.1)));
					}}
					onPointerDown={(event) => {
						if (event.target === event.currentTarget) {
							setInteraction({ type: 'pan', clientX: event.clientX, clientY: event.clientY });
							onSelectRoom(null);
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
					<rect width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill={`url(#floor-grid-${story.id})`} />
					<g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
						{story.rooms.map((room) => {
							const points = segmentsToPoints(room.origin, room.segments);
							const bounds = getPointsBounds(points);
							const polygonPoints = points.map((point) => `${point.x},${point.y}`).join(' ');
							const isSelected = room.id === selectedRoom?.id;

							return (
								<g key={room.id}>
									<polygon
										points={polygonPoints}
										fill={room.color ?? '#84cc16'}
										fillOpacity={isSelected ? 0.36 : 0.22}
										stroke={isSelected ? '#0f172a' : room.color ?? '#84cc16'}
										strokeWidth={isSelected ? 3 : 2}
										onPointerDown={(event) => {
											event.stopPropagation();
											onSelectRoom(room.id);
										}}
									/>
									<text x={bounds.minX + bounds.width / 2} y={bounds.minY + bounds.height / 2} textAnchor="middle" dominantBaseline="middle" className="select-none fill-slate-900 text-[14px] font-semibold">
										{room.name}
									</text>
									<g
										onPointerDown={(event) => {
											if (!editable) return;
											event.stopPropagation();
											onSelectRoom(room.id);
											setInteraction({ type: 'drag-origin', roomId: room.id });
										}}
									>
										<circle cx={room.origin.x} cy={room.origin.y} r={isSelected ? 8 : 6} fill="#ffffff" stroke="#2563eb" strokeWidth="2" />
										<circle cx={room.origin.x} cy={room.origin.y} r="2.5" fill="#2563eb" />
									</g>
								</g>
							);
						})}
					</g>
				</svg>
			</div>

			<div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-900/40">
				<div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Selected room</div>
				{selectedRoom ? (
					<>
						<div className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 dark:bg-gray-800">
							<IconDisplay iconKey={selectedRoom.icon || 'home'} size={18} className="h-5 w-5 object-contain" alt="" />
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{selectedRoom.name}</div>
								<div className="text-xs text-gray-500 dark:text-gray-400">Origin {selectedRoom.origin.x}, {selectedRoom.origin.y}</div>
							</div>
						</div>

						{editable ? (
							<div className="space-y-3">
								<div className="grid grid-cols-[auto_auto_1fr] items-end gap-2">
									<IconPicker value={selectedRoom.icon || 'home'} onChange={(value) => onUpdateRoom?.(selectedRoom.id, { icon: value })} align="left" />
									<ColorPicker value={selectedRoom.color ?? '#84cc16'} onChange={(value) => onUpdateRoom?.(selectedRoom.id, { color: value })} align="left" />
									<label className="space-y-1">
										<span className="text-xs font-medium text-gray-500 dark:text-gray-400">Name</span>
										<input value={selectedRoom.name} onChange={(event) => onUpdateRoom?.(selectedRoom.id, { name: event.target.value })} className={INPUT_CLS} />
									</label>
								</div>

								<div className="grid grid-cols-2 gap-2">
									<label className="space-y-1">
										<span className="text-xs font-medium text-gray-500 dark:text-gray-400">Origin X</span>
										<input type="number" value={selectedRoom.origin.x} onChange={(event) => onUpdateRoom?.(selectedRoom.id, { origin: { ...selectedRoom.origin, x: Number(event.target.value) || 0 } })} className={INPUT_CLS} />
									</label>
									<label className="space-y-1">
										<span className="text-xs font-medium text-gray-500 dark:text-gray-400">Origin Y</span>
										<input type="number" value={selectedRoom.origin.y} onChange={(event) => onUpdateRoom?.(selectedRoom.id, { origin: { ...selectedRoom.origin, y: Number(event.target.value) || 0 } })} className={INPUT_CLS} />
									</label>
								</div>

								<div className="space-y-2">
									<div className="flex items-center justify-between">
										<span className="text-xs font-medium text-gray-500 dark:text-gray-400">Segments</span>
										<button type="button" onClick={() => onUpdateRoom?.(selectedRoom.id, { segments: [...selectedRoom.segments, { direction: 'right', distance: 40 }] })} className="text-xs font-medium text-blue-500 hover:text-blue-600">+ Add</button>
									</div>
									<div className="space-y-2">
										{selectedRoom.segments.map((segment, index) => (
											<div key={`${segment.direction}-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-lg bg-white p-2 dark:bg-gray-800">
												<select value={segment.direction} onChange={(event) => updateSelectedSegments(index, { direction: event.target.value as SegmentDirection })} className={INPUT_CLS}>
													<option value="up">Up</option>
													<option value="right">Right</option>
													<option value="down">Down</option>
													<option value="left">Left</option>
												</select>
												<input type="number" min={1} value={segment.distance} onChange={(event) => updateSelectedSegments(index, { distance: Math.max(1, Number(event.target.value) || 1) })} className={INPUT_CLS} />
												<button type="button" onClick={() => removeSelectedSegment(index)} className="text-xs font-medium text-gray-400 hover:text-red-500">Remove</button>
											</div>
										))}
									</div>
								</div>

								<div className="flex items-center justify-between gap-2">
									<button type="button" onClick={() => onDeleteRoom?.(selectedRoom.id)} className="text-xs font-medium text-red-500 hover:text-red-600">Delete room</button>
									<button type="button" onClick={() => onEditRoom?.(selectedRoom)} className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600">Open drawer</button>
								</div>
							</div>
						) : (
							<div className="text-xs text-gray-500 dark:text-gray-400">Room color, outline, and origin are read-only in this view.</div>
						)}
					</>
				) : (
					<p className="text-xs italic text-gray-400">Select a room on the canvas to inspect its outline.</p>
				)}
			</div>
		</div>
	);
}