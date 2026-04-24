import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ColorPicker } from '../../../../../shared/ColorPicker';
import { IconPicker } from '../../../../../shared/IconPicker';
import type { FloorPlanRoom, FloorPlanSegment, SegmentDirection } from '../../../../../../types/resource';
import {
	closeFloorPlanSegments,
	getPointsBounds,
	isClosedFloorPlan,
	segmentsToPoints,
} from '../../../../../../utils/floorPlan';

interface HomeRoomDrawerProps {
	existing?: FloorPlanRoom | null;
	onSave: (room: FloorPlanRoom) => void;
	onCancel: () => void;
}

const INPUT_CLS = 'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';
const DEFAULT_COLOR = '#84cc16';

function makeSegment(direction: SegmentDirection = 'right', distance = 80): FloorPlanSegment {
	return { direction, distance };
}

export function HomeRoomDrawer({ existing, onSave, onCancel }: HomeRoomDrawerProps) {
	const [name, setName] = useState(existing?.name ?? '');
	const [icon, setIcon] = useState(existing?.icon ?? 'home');
	const [color, setColor] = useState(existing?.color ?? DEFAULT_COLOR);
	const [origin, setOrigin] = useState(existing?.origin ?? { x: 160, y: 120 });
	const [segments, setSegments] = useState<FloorPlanSegment[]>(existing?.segments ?? [
		makeSegment('right', 140),
		makeSegment('down', 100),
		makeSegment('left', 140),
		makeSegment('up', 100),
	]);
	const [pickOriginMode, setPickOriginMode] = useState(false);

	const points = useMemo(() => segmentsToPoints(origin, segments), [origin, segments]);
	const isClosed = isClosedFloorPlan(origin, segments);
	const bounds = getPointsBounds(points);
	const canSave = name.trim().length > 0 && segments.length >= 3 && isClosed;

	function updateSegment(index: number, patch: Partial<FloorPlanSegment>) {
		setSegments((prev) => prev.map((segment, segmentIndex) => (segmentIndex === index ? { ...segment, ...patch } : segment)));
	}

	function removeSegment(index: number) {
		setSegments((prev) => prev.filter((_, segmentIndex) => segmentIndex !== index));
	}

	function handlePreviewClick(event: React.MouseEvent<SVGSVGElement>) {
		if (!pickOriginMode) return;
		const rect = event.currentTarget.getBoundingClientRect();
		const x = Math.round(((event.clientX - rect.left) / rect.width) * 320);
		const y = Math.round(((event.clientY - rect.top) / rect.height) * 240);
		setOrigin({ x, y });
		setPickOriginMode(false);
	}

	function handleSave() {
		if (!canSave) return;
		onSave({
			id: existing?.id ?? uuidv4(),
			name: name.trim(),
			icon,
			color,
			origin,
			segments,
			placedItems: existing?.placedItems ?? [],
		});
	}

	const polygonPoints = points.map((point) => `${point.x},${point.y}`).join(' ');

	return (
		<div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-900/60">
			<div className="flex items-center justify-between gap-2">
				<div>
					<div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{existing ? 'Edit floor-plan room' : 'New floor-plan room'}</div>
					<div className="text-xs text-gray-500 dark:text-gray-400">Draw with orthogonal segments and close the outline before saving.</div>
				</div>
				<div className="flex items-center gap-2">
					<button type="button" onClick={onCancel} className="text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">Cancel</button>
					<button type="button" onClick={handleSave} disabled={!canSave} className={canSave ? 'rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600' : 'rounded-md bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-400 dark:bg-gray-700'}>
						Save room
					</button>
				</div>
			</div>

			<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_20rem]">
				<div className="space-y-3">
					<div className="grid grid-cols-[auto_auto_1fr] items-end gap-3">
						<IconPicker value={icon} onChange={setIcon} align="left" />
						<ColorPicker value={color} onChange={setColor} align="left" />
						<label className="space-y-1">
							<span className="text-xs font-medium text-gray-500 dark:text-gray-400">Room name</span>
							<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Kitchen" className={INPUT_CLS} />
						</label>
					</div>

					<div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-800/60">
						<div className="mb-2 flex items-center justify-between gap-2">
							<div className="text-xs font-medium text-gray-500 dark:text-gray-400">Preview</div>
							<div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
								<span>Origin {origin.x}, {origin.y}</span>
								<button type="button" onClick={() => setPickOriginMode((current) => !current)} className={pickOriginMode ? 'rounded-full bg-blue-500 px-2 py-1 font-medium text-white' : 'rounded-full bg-white px-2 py-1 font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-200'}>
									{pickOriginMode ? 'Click preview' : 'Pick origin'}
								</button>
							</div>
						</div>
						<svg viewBox="0 0 320 240" className="h-60 w-full rounded-lg bg-white dark:bg-gray-900" onClick={handlePreviewClick}>
							<defs>
								<pattern id="floor-grid-preview" width="20" height="20" patternUnits="userSpaceOnUse">
									<path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="1" />
								</pattern>
							</defs>
							<rect x="0" y="0" width="320" height="240" fill="url(#floor-grid-preview)" />
							{isClosed ? <polygon points={polygonPoints} fill={color} fillOpacity="0.28" stroke={color} strokeWidth="3" /> : null}
							<polyline points={polygonPoints} fill="none" stroke={color} strokeDasharray={isClosed ? undefined : '8 6'} strokeWidth="3" />
							{points.map((point, index) => (
								<circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r={index === 0 ? 6 : 4} fill={index === 0 ? '#2563eb' : '#ffffff'} stroke={color} strokeWidth="2" />
							))}
						</svg>
						<div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500 dark:text-gray-400">
							<span className="rounded-full bg-white px-2 py-1 dark:bg-gray-700">Points {points.length}</span>
							<span className="rounded-full bg-white px-2 py-1 dark:bg-gray-700">Size {Math.round(bounds.width)} x {Math.round(bounds.height)}</span>
							<span className={isClosed ? 'rounded-full bg-emerald-100 px-2 py-1 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'rounded-full bg-amber-100 px-2 py-1 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}>
								{isClosed ? 'Closed shape' : 'Shape must return to origin'}
							</span>
						</div>
					</div>
				</div>

				<div className="space-y-3">
					<div className="grid grid-cols-2 gap-2">
						<label className="space-y-1">
							<span className="text-xs font-medium text-gray-500 dark:text-gray-400">Origin X</span>
							<input type="number" value={origin.x} onChange={(event) => setOrigin((current) => ({ ...current, x: Number(event.target.value) || 0 }))} className={INPUT_CLS} />
						</label>
						<label className="space-y-1">
							<span className="text-xs font-medium text-gray-500 dark:text-gray-400">Origin Y</span>
							<input type="number" value={origin.y} onChange={(event) => setOrigin((current) => ({ ...current, y: Number(event.target.value) || 0 }))} className={INPUT_CLS} />
						</label>
					</div>

					<div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-800/60">
						<div className="mb-2 flex items-center justify-between">
							<span className="text-xs font-medium text-gray-500 dark:text-gray-400">Segments</span>
							<div className="flex items-center gap-2">
								<button type="button" onClick={() => setSegments((prev) => [...prev, makeSegment()])} className="text-xs font-medium text-blue-500 hover:text-blue-600">+ Add</button>
								<button type="button" onClick={() => setSegments((prev) => closeFloorPlanSegments(origin, prev))} className="text-xs font-medium text-emerald-600 hover:text-emerald-700">Close shape</button>
							</div>
						</div>
						<div className="space-y-2">
							{segments.map((segment, index) => (
								<div key={`${segment.direction}-${index}`} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-lg bg-white p-2 dark:bg-gray-900">
									<label className="space-y-1">
										<span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Direction</span>
										<select value={segment.direction} onChange={(event) => updateSegment(index, { direction: event.target.value as SegmentDirection })} className={INPUT_CLS}>
											<option value="up">Up</option>
											<option value="right">Right</option>
											<option value="down">Down</option>
											<option value="left">Left</option>
										</select>
									</label>
									<label className="space-y-1">
										<span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Distance</span>
										<input type="number" min={1} value={segment.distance} onChange={(event) => updateSegment(index, { distance: Math.max(1, Number(event.target.value) || 1) })} className={INPUT_CLS} />
									</label>
									<button type="button" onClick={() => removeSegment(index)} className="pb-2 text-xs font-medium text-gray-400 hover:text-red-500">Remove</button>
								</div>
							))}
							{segments.length === 0 ? <p className="text-xs italic text-gray-400">Add at least three segments to define a room.</p> : null}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}