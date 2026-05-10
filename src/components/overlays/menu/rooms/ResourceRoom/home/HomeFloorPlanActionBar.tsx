import { useState } from 'react';

interface HomeFloorPlanActionBarProps {
	isEditingStoryName: boolean;
	isEditingStoryOutline: boolean;
	isEditingRoom: boolean;
	selectedRoomId: string | null;
	selectedPlacedId: string | null;
	activeStoryHasOutline: boolean;
	canSaveStoryChanges: boolean;
	canSaveEditingRoom: boolean;
	roomEditMode: 'add-point' | 'select-segment' | null;
	selectedRoomCanClean: boolean;
	selectedRoomPhotoBusy: boolean;
	selectedItemWidth: number;
	selectedItemDepth: number;
	selectedItemCanClean: boolean;
	selectedItemCanMoveUp: boolean;
	selectedItemCanMoveDown: boolean;
	selectedItemPhotoBusy: boolean;
	onExitRoom: () => void;
	onEditRoom: () => void;
	onDeleteRoom: () => void;
	onAddItem: () => void;
	onAddContainer: () => void;
	onCleanRoom: () => void;
	onTakePhoto: () => void;
	onOutlineRoom: () => void;
	onAddStory: () => void;
	onSave: () => void;
	onCancel: () => void;
	onEditStartPoint: () => void;
	onEditPoints: () => void;
	onEditLines: () => void;
	onDeleteItem: () => void;
	onCleanItem: () => void;
	onLayerUp: () => void;
	onLayerDown: () => void;
	onDimensionChange: (width: number, depth: number) => void;
}

const iconButtonClassName = 'inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-white px-3 text-base text-gray-700 shadow-sm ring-1 ring-black/5 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800';
const activeIconButtonClassName = 'inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-blue-500 px-3 text-base text-white shadow-sm ring-1 ring-blue-500 hover:bg-blue-600';
const destructiveIconButtonClassName = 'inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-red-50 px-3 text-base text-red-600 shadow-sm ring-1 ring-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:ring-red-900/30 dark:hover:bg-red-900/30';

export function HomeFloorPlanActionBar({
	isEditingStoryName,
	isEditingStoryOutline,
	isEditingRoom,
	selectedRoomId,
	selectedPlacedId,
	activeStoryHasOutline,
	canSaveStoryChanges,
	canSaveEditingRoom,
	roomEditMode,
	selectedRoomCanClean,
	selectedRoomPhotoBusy,
	selectedItemWidth,
	selectedItemDepth,
	selectedItemCanClean,
	selectedItemCanMoveUp,
	selectedItemCanMoveDown,
	selectedItemPhotoBusy,
	onExitRoom,
	onEditRoom,
	onDeleteRoom,
	onAddItem,
	onAddContainer,
	onCleanRoom,
	onTakePhoto,
	onOutlineRoom,
	onAddStory,
	onSave,
	onCancel,
	onEditStartPoint,
	onEditPoints,
	onEditLines,
	onDeleteItem,
	onCleanItem,
	onLayerUp,
	onLayerDown,
	onDimensionChange,
}: HomeFloorPlanActionBarProps) {
	const [confirmDeleteRoomActionId, setConfirmDeleteRoomActionId] = useState<string | null>(null);
	const [confirmDeleteItemActionId, setConfirmDeleteItemActionId] = useState<string | null>(null);
	const [editingSelectedItemDimensionsId, setEditingSelectedItemDimensionsId] = useState<string | null>(null);
	const [selectedItemDimensionDraft, setSelectedItemDimensionDraft] = useState<{ width: string; depth: string }>({ width: '', depth: '' });
	const activeConfirmDeleteRoomActionId = confirmDeleteRoomActionId === selectedRoomId ? confirmDeleteRoomActionId : null;
	const activeConfirmDeleteItemActionId = confirmDeleteItemActionId === selectedPlacedId ? confirmDeleteItemActionId : null;
	const isEditingSelectedItemDimensions = editingSelectedItemDimensionsId === selectedPlacedId;
	const currentDimensionDraft = isEditingSelectedItemDimensions
		? selectedItemDimensionDraft
		: {
			width: String(selectedItemWidth),
			depth: String(selectedItemDepth),
		};

	const actionContent = (() => {
		if (isEditingStoryName || isEditingStoryOutline) {
			return (
				<div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
					<button
						type="button"
						onClick={onSave}
						disabled={!canSaveStoryChanges}
						className={canSaveStoryChanges ? activeIconButtonClassName : `${iconButtonClassName} text-gray-400`}
						title="Save story changes"
						aria-label="Save story changes"
					>
						✓
					</button>
					<button type="button" onClick={onCancel} className={iconButtonClassName} title="Cancel story changes" aria-label="Cancel story changes">✗</button>
					{isEditingStoryOutline ? (
						<button
							type="button"
							onClick={onEditStartPoint}
							className={iconButtonClassName}
							title="Edit story start point"
							aria-label="Edit story start point"
						>
							📍
						</button>
					) : null}
				</div>
			);
		}

		if (isEditingRoom && roomEditMode) {
			return (
				<div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
					<button
						type="button"
						onClick={onSave}
						disabled={!canSaveEditingRoom}
						className={canSaveEditingRoom ? activeIconButtonClassName : `${iconButtonClassName} text-gray-400`}
						title="Save room changes"
						aria-label="Save room changes"
					>
						✓
					</button>
					<button type="button" onClick={onCancel} className={iconButtonClassName} title="Cancel room editing" aria-label="Cancel room editing">✗</button>
					<button
						type="button"
						onClick={onEditPoints}
						className={roomEditMode === 'add-point' ? activeIconButtonClassName : iconButtonClassName}
						title="Edit room points"
						aria-label="Edit room points"
					>
						⬡
					</button>
					<button
						type="button"
						onClick={onEditLines}
						className={roomEditMode === 'select-segment' ? activeIconButtonClassName : iconButtonClassName}
						title="Edit room lines"
						aria-label="Edit room lines"
					>
						／
					</button>
				</div>
			);
		}

		if (selectedPlacedId) {
			return (
				<div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
					<button
						type="button"
						onClick={() => {
							if (activeConfirmDeleteItemActionId === selectedPlacedId) {
								onDeleteItem();
								setConfirmDeleteItemActionId(null);
								return;
							}
							setConfirmDeleteItemActionId(selectedPlacedId);
						}}
						className={activeConfirmDeleteItemActionId === selectedPlacedId ? activeIconButtonClassName : destructiveIconButtonClassName}
						title={activeConfirmDeleteItemActionId === selectedPlacedId ? 'Confirm delete item' : 'Delete item'}
						aria-label={activeConfirmDeleteItemActionId === selectedPlacedId ? 'Confirm delete item' : 'Delete item'}
					>
						🗑️
					</button>
					<button type="button" onClick={onTakePhoto} disabled={selectedItemPhotoBusy} className={iconButtonClassName} title="Take item photo" aria-label="Take item photo">📷</button>
					<button type="button" onClick={onCleanItem} disabled={!selectedItemCanClean} className={iconButtonClassName} title="Clean item" aria-label="Clean item">🧹</button>
					{isEditingSelectedItemDimensions ? (
						<div
							className="flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-black/5 dark:bg-gray-900"
							onKeyDown={(event) => {
								if (event.key === 'Escape') {
									setEditingSelectedItemDimensionsId(null);
									setSelectedItemDimensionDraft({
										width: String(selectedItemWidth),
										depth: String(selectedItemDepth),
									});
								}
								if (event.key === 'Enter') {
									const nextWidth = Math.max(1, Number(currentDimensionDraft.width) || 1);
									const nextDepth = Math.max(1, Number(currentDimensionDraft.depth) || 1);
									onDimensionChange(nextWidth, nextDepth);
									setEditingSelectedItemDimensionsId(null);
								}
							}}
						>
							<input
								type="number"
								min={1}
								value={currentDimensionDraft.width}
								onChange={(event) => setSelectedItemDimensionDraft((current) => ({ ...current, width: event.target.value }))}
								className="w-16 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
								aria-label="Selected item width"
							/>
							<span className="text-xs text-gray-500 dark:text-gray-400">×</span>
							<input
								type="number"
								min={1}
								value={currentDimensionDraft.depth}
								onChange={(event) => setSelectedItemDimensionDraft((current) => ({ ...current, depth: event.target.value }))}
								className="w-16 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
								aria-label="Selected item depth"
							/>
							<button
								type="button"
								onClick={() => {
									const nextWidth = Math.max(1, Number(currentDimensionDraft.width) || 1);
									const nextDepth = Math.max(1, Number(currentDimensionDraft.depth) || 1);
									onDimensionChange(nextWidth, nextDepth);
									setEditingSelectedItemDimensionsId(null);
								}}
								className="rounded-full bg-emerald-500 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-600"
								title="Save item dimensions"
								aria-label="Save item dimensions"
							>
								✓
							</button>
							<button
								type="button"
								onClick={() => {
									setEditingSelectedItemDimensionsId(null);
									setSelectedItemDimensionDraft({
										width: String(selectedItemWidth),
										depth: String(selectedItemDepth),
									});
								}}
								className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
								title="Cancel item dimension editing"
								aria-label="Cancel item dimension editing"
							>
								✗
							</button>
						</div>
					) : (
						<button
							type="button"
							onClick={() => {
								setSelectedItemDimensionDraft({
									width: String(selectedItemWidth),
									depth: String(selectedItemDepth),
								});
								setEditingSelectedItemDimensionsId(selectedPlacedId);
							}}
							className="inline-flex h-9 items-center justify-center rounded-full bg-slate-100 px-3 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-700"
							title="Edit item dimensions"
							aria-label="Edit item dimensions"
						>
							{`${selectedItemWidth}×${selectedItemDepth}`}
						</button>
					)}
					<button type="button" onClick={onLayerUp} disabled={!selectedItemCanMoveUp} className={iconButtonClassName} title="Move item forward" aria-label="Move item forward">▲</button>
					<button type="button" onClick={onLayerDown} disabled={!selectedItemCanMoveDown} className={iconButtonClassName} title="Move item backward" aria-label="Move item backward">▼</button>
				</div>
			);
		}

		if (selectedRoomId) {
			return (
				<div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
					<button type="button" onClick={onExitRoom} className={iconButtonClassName} title="Exit room" aria-label="Exit room">←</button>
					<button type="button" onClick={onEditRoom} className={iconButtonClassName} title="Edit room" aria-label="Edit room">✏️</button>
					<button
						type="button"
						onClick={() => {
							if (activeConfirmDeleteRoomActionId === selectedRoomId) {
								onDeleteRoom();
								setConfirmDeleteRoomActionId(null);
								return;
							}
							setConfirmDeleteRoomActionId(selectedRoomId);
						}}
						className={activeConfirmDeleteRoomActionId === selectedRoomId ? activeIconButtonClassName : destructiveIconButtonClassName}
						title={activeConfirmDeleteRoomActionId === selectedRoomId ? 'Confirm delete room' : 'Delete room'}
						aria-label={activeConfirmDeleteRoomActionId === selectedRoomId ? 'Confirm delete room' : 'Delete room'}
					>
						🗑️
					</button>
					<button type="button" onClick={onTakePhoto} disabled={selectedRoomPhotoBusy} className={iconButtonClassName} title="Take room photo" aria-label="Take room photo">📷</button>
					<button type="button" onClick={onAddContainer} className={iconButtonClassName} title="Add container" aria-label="Add container">📦</button>
					<button type="button" onClick={onAddItem} className={iconButtonClassName} title="Add item" aria-label="Add item">➕</button>
					<button type="button" onClick={onCleanRoom} disabled={!selectedRoomCanClean} className={iconButtonClassName} title="Clean room" aria-label="Clean room">🧹</button>
				</div>
			);
		}

		return (
			<div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
				<button type="button" onClick={onOutlineRoom} disabled={!activeStoryHasOutline} className={iconButtonClassName} title="Outline room" aria-label="Outline room">🏠</button>
				<button type="button" onClick={onAddStory} className={iconButtonClassName} title="Add story" aria-label="Add story">➕</button>
			</div>
		);
	})();

	return (
		<div className="border-t border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-950/40">
			{actionContent}
		</div>
	);
}
