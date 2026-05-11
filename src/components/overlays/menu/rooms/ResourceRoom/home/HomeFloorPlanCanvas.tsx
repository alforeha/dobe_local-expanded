/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
import type React from 'react';

interface HomeFloorPlanCanvasProps {
	[key: string]: any;
}

export function HomeFloorPlanCanvas(props: HomeFloorPlanCanvasProps) {
	const {
		VIEWBOX_WIDTH,
		VIEWBOX_HEIGHT,
		QUICK_ACTIONS_BADGE_RADIUS,
		QUICK_ACTIONS_BADGE_OFFSET_X,
		QUICK_ACTIONS_BADGE_OFFSET_Y,
		VERTEX_VISIBLE_RADIUS,
		VERTEX_HIT_RADIUS,
		STORY_SCOPE_ID,
		activeEditablePlacementId,
		beginOriginDrag,
		canvasRooms,
		currentPoint,
		editingContainersRoomId,
		editingPlacedContainerId,
		editingRoom,
		editingStoryOutline,
		findInventoryContainerRecord,
		findInventoryItemRecord,
		findRoomContainerRecord,
		flushSync,
		formatDistance,
		getPointDistance,
		getPointsBounds,
		getRotatedRectPoints,
		getSegmentLines,
		getWorldPoint,
		handlePointerMove,
		handlePointerUp,
		isEditingStoryName,
		isEditingStoryOutline,
		isEditingStoryStartPoint,
		isImageIcon,
		isPlacementCleanInQuickActions,
		isPlacingStartPoint,
		midpoint,
		onSelectRoom,
		outlineEditMode,
		pan,
		placedItemHasQuickActionsTask,
		pointsMatch,
		previewPoint,
		resolveIcon,
		resolvePlacedItemEntry,
		selectedOutlineSegmentIndex,
		selectedPlacementId,
		selectedRoom,
		selectedSegmentIndex,
		selectStartPointAnchor,
		segmentsToPoints,
		setExpandedPlacedContainerId,
		setInteraction,
		setSelectedOutlineSegmentIndex,
		setSelectedPlacementId,
		setSelectedSegmentIndex,
		showPointPreview,
		startPointAnchor,
		startPointAnchorIndex,
		startPointAnchors,
		startPointPreview,
		story,
		storyOutline,
		storyOutlinePoints,
		svgRef,
		updatePlacedItem,
		zoom,
	} = props;
	const canSelectRooms = !isEditingStoryName && !isEditingStoryOutline;
	const canSelectPlacedItems = !isEditingStoryName && !isEditingStoryOutline;

	return (
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
						placedItemHasQuickActionsTask(entry.id, entry.recurringTasks ?? itemRecord.item?.recurringTasks ?? [])
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
								if (!canSelectPlacedItems) return;
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
									if (!editingRoom && canSelectRooms) onSelectRoom(room.id);
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
								if (canSelectRooms) onSelectRoom(room.id);
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
												if (!canSelectPlacedItems) return;
												flushSync(() => {
													setExpandedPlacedContainerId(entry.id);
													setSelectedPlacementId(entry.id);
												});
												if (canSelectRooms) onSelectRoom(room.id);
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
				{editingStoryOutline && isEditingStoryStartPoint ? (
					<g>
						<circle cx={editingStoryOutline.origin.x} cy={editingStoryOutline.origin.y} r={VERTEX_VISIBLE_RADIUS} fill="#ffffff" stroke="#2563eb" strokeWidth="2" style={{ pointerEvents: 'none' }} />
						<circle cx={editingStoryOutline.origin.x} cy={editingStoryOutline.origin.y} r="2.5" fill="#2563eb" style={{ pointerEvents: 'none' }} />
						<circle
							cx={editingStoryOutline.origin.x}
							cy={editingStoryOutline.origin.y}
							r={VERTEX_HIT_RADIUS}
							fill="transparent"
							pointerEvents="all"
							style={{ cursor: 'grab' }}
							onPointerDown={beginOriginDrag}
							onTouchStart={beginOriginDrag}
						/>
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
	);
}
