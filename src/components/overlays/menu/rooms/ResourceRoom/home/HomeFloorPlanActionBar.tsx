import { useEffect, useRef, useState } from 'react';

import { IconDisplay } from '../../../../../shared/IconDisplay';

interface HomeFloorPlanActionBarProps {
	isEditingStoryName: boolean;
	isEditingStoryOutline: boolean;
	isEditingRoom: boolean;
	activeStoryId: string | null;
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
	homeName: string;
	roomName: string | null;
	itemName: string | null;
	onOpenAlbumEditor?: (location: string) => void;
	onExitRoom: () => void;
	onEditRoom: () => void;
	onDeleteRoom: () => void;
	onAddItem: () => void;
	onAddContainer: () => void;
	onCleanRoom: () => void;
	onOutlineRoom: () => void;
	onAddStory: () => void;
	onSave: () => void;
	onCancel: () => void;
	onDeleteStory: () => void;
	onEditStoryOutline: () => void;
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
	activeStoryId,
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
	homeName,
	roomName,
	itemName,
	onOpenAlbumEditor,
	onExitRoom,
	onEditRoom,
	onDeleteRoom,
	onAddItem,
	onAddContainer,
	onCleanRoom,
	onOutlineRoom,
	onAddStory,
	onSave,
	onCancel,
	onDeleteStory,
	onEditStoryOutline,
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
	const [confirmDeleteStoryActionId, setConfirmDeleteStoryActionId] = useState<string | null>(null);
	const [showAddChoice, setShowAddChoice] = useState(false);
	const [editingSelectedItemDimensionsId, setEditingSelectedItemDimensionsId] = useState<string | null>(null);
	const [selectedItemDimensionDraft, setSelectedItemDimensionDraft] = useState<{ width: string; depth: string }>({ width: '', depth: '' });
	const addChoiceRef = useRef<HTMLDivElement | null>(null);

	const activeConfirmDeleteRoomActionId = confirmDeleteRoomActionId === selectedRoomId ? confirmDeleteRoomActionId : null;
	const activeConfirmDeleteItemActionId = confirmDeleteItemActionId === selectedPlacedId ? confirmDeleteItemActionId : null;
	const activeConfirmDeleteStoryActionId = confirmDeleteStoryActionId === activeStoryId ? confirmDeleteStoryActionId : null;
	const isDeleteStoryConfirming = Boolean(activeConfirmDeleteStoryActionId && activeStoryId && activeConfirmDeleteStoryActionId === activeStoryId);
	const isEditingSelectedItemDimensions = editingSelectedItemDimensionsId === selectedPlacedId;
	const isRoomAddChoiceOpen = showAddChoice && Boolean(selectedRoomId) && !isEditingRoom && !selectedPlacedId;
	const currentDimensionDraft = isEditingSelectedItemDimensions
		? selectedItemDimensionDraft
		: {
			width: String(selectedItemWidth),
			depth: String(selectedItemDepth),
		};
	const normalizedHomeName = homeName.trim() || 'Home';
	const normalizedRoomName = roomName?.trim() || 'Room';
	const normalizedItemName = itemName?.trim() || 'Item';
	const openHomeAlbumEditor = () => onOpenAlbumEditor?.(normalizedHomeName);
	const openRoomAlbumEditor = () => onOpenAlbumEditor?.(`${normalizedHomeName} · ${normalizedRoomName}`);
	const openItemAlbumEditor = () => onOpenAlbumEditor?.(`${normalizedHomeName} · ${normalizedRoomName} · ${normalizedItemName}`);

	useEffect(() => {
		if (!showAddChoice) return;

		const handlePointerDown = (event: PointerEvent) => {
			if (!addChoiceRef.current?.contains(event.target as Node)) {
				setShowAddChoice(false);
			}
		};

		document.addEventListener('pointerdown', handlePointerDown);
		return () => document.removeEventListener('pointerdown', handlePointerDown);
	}, [showAddChoice]);

	const actionContent = (() => {
		if (isEditingStoryOutline) {
			return (
				<div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
					<button
						type="button"
						onClick={onSave}
						disabled={!canSaveStoryChanges}
						className={canSaveStoryChanges ? activeIconButtonClassName : `${iconButtonClassName} text-gray-400`}
						title="Save outline"
						aria-label="Save outline"
					>
						<IconDisplay iconKey="fp-save" size={18} alt="Save outline" />
					</button>
					<button type="button" onClick={onCancel} className={iconButtonClassName} title="Cancel edit" aria-label="Cancel edit">
						<IconDisplay iconKey="fp-cancel" size={18} alt="Cancel edit" />
					</button>
				</div>
			);
		}

		if (isEditingStoryName) {
			if (isDeleteStoryConfirming) {
				return (
					<div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
						<span className="text-sm font-medium text-gray-700 dark:text-gray-200">Confirm delete?</span>
						<button
							type="button"
							onClick={onDeleteStory}
							className={destructiveIconButtonClassName}
							title="Confirm delete story"
							aria-label="Confirm delete story"
						>
							<IconDisplay iconKey="fp-delete" size={18} alt="Confirm delete story" />
						</button>
						<button
							type="button"
							onClick={() => setConfirmDeleteStoryActionId(null)}
							className={iconButtonClassName}
							title="Cancel delete story"
							aria-label="Cancel delete story"
						>
							<IconDisplay iconKey="fp-cancel" size={18} alt="Cancel delete story" />
						</button>
					</div>
				);
			}
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
						<IconDisplay iconKey="fp-save" size={18} alt="Save story changes" />
					</button>
					<button type="button" onClick={onCancel} className={iconButtonClassName} title="Cancel story changes" aria-label="Cancel story changes">
						<IconDisplay iconKey="fp-cancel" size={18} alt="Cancel story changes" />
					</button>
					{activeStoryId ? (
						<button
							type="button"
							onClick={() => setConfirmDeleteStoryActionId(activeStoryId)}
							className={destructiveIconButtonClassName}
							title="Delete story"
							aria-label="Delete story"
						>
							<IconDisplay iconKey="fp-delete" size={18} alt="Delete story" />
						</button>
					) : null}
					{isEditingStoryName ? (
						<button
							type="button"
							onClick={onEditStoryOutline}
							className={iconButtonClassName}
							title="Edit story outline"
							aria-label="Edit story outline"
						>
							<IconDisplay iconKey="fp-edit-lines" size={18} alt="Edit story outline" />
						</button>
					) : null}
				</div>
			);
		}

		if (isEditingRoom && roomEditMode) {
			if (activeConfirmDeleteRoomActionId === selectedRoomId && selectedRoomId) {
				return (
					<div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
						<span className="text-sm font-medium text-gray-700 dark:text-gray-200">Confirm delete?</span>
						<button
							type="button"
							onClick={() => {
								onDeleteRoom();
								setConfirmDeleteRoomActionId(null);
							}}
							className={destructiveIconButtonClassName}
							title="Confirm delete room"
							aria-label="Confirm delete room"
						>
							<IconDisplay iconKey="fp-delete" size={18} alt="Confirm delete room" />
						</button>
						<button
							type="button"
							onClick={() => setConfirmDeleteRoomActionId(null)}
							className={iconButtonClassName}
							title="Cancel delete room"
							aria-label="Cancel delete room"
						>
							<IconDisplay iconKey="fp-cancel" size={18} alt="Cancel delete room" />
						</button>
					</div>
				);
			}

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
						<IconDisplay iconKey="fp-save" size={18} alt="Save room changes" />
					</button>
					<button type="button" onClick={onCancel} className={iconButtonClassName} title="Cancel room editing" aria-label="Cancel room editing">
						<IconDisplay iconKey="fp-cancel" size={18} alt="Cancel room editing" />
					</button>
					<button
						type="button"
						onClick={onEditPoints}
						className={roomEditMode === 'add-point' ? activeIconButtonClassName : iconButtonClassName}
						title="Edit room points"
						aria-label="Edit room points"
					>
						<IconDisplay iconKey="fp-edit-points" size={18} alt="Edit room points" />
					</button>
					<button
						type="button"
						onClick={onEditLines}
						className={roomEditMode === 'select-segment' ? activeIconButtonClassName : iconButtonClassName}
						title="Edit room lines"
						aria-label="Edit room lines"
					>
						<IconDisplay iconKey="fp-edit-lines" size={18} alt="Edit room lines" />
					</button>
					<button
						type="button"
						onClick={() => {
							if (!selectedRoomId) return;
							setConfirmDeleteRoomActionId(selectedRoomId);
						}}
						disabled={!selectedRoomId}
						className={destructiveIconButtonClassName}
						title="Delete room"
						aria-label="Delete room"
					>
						<IconDisplay iconKey="fp-delete" size={18} alt="Delete room" />
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
						<IconDisplay
							iconKey="fp-delete"
							size={18}
							alt={activeConfirmDeleteItemActionId === selectedPlacedId ? 'Confirm delete item' : 'Delete item'}
						/>
					</button>
					<button type="button" onClick={openItemAlbumEditor} disabled={selectedItemPhotoBusy} className={iconButtonClassName} title="Take item photo" aria-label="Take item photo">
						<IconDisplay iconKey="fp-camera" size={18} alt="Take item photo" />
					</button>
					<button type="button" onClick={onCleanItem} disabled={!selectedItemCanClean} className={iconButtonClassName} title="Clean item" aria-label="Clean item">
						<IconDisplay iconKey="fp-clean" size={18} alt="Clean item" />
					</button>
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
							<span className="text-xs text-gray-500 dark:text-gray-400">x</span>
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
								<IconDisplay iconKey="fp-save" size={18} alt="Save item dimensions" />
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
								<IconDisplay iconKey="fp-cancel" size={18} alt="Cancel item dimension editing" />
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
							<IconDisplay iconKey="fp-edit" size={18} alt="Edit item dimensions" />
						</button>
					)}
					<button type="button" onClick={onLayerUp} disabled={!selectedItemCanMoveUp} className={iconButtonClassName} title="Move item forward" aria-label="Move item forward">
						<IconDisplay iconKey="fp-layer-up" size={18} alt="Move item forward" />
					</button>
					<button type="button" onClick={onLayerDown} disabled={!selectedItemCanMoveDown} className={iconButtonClassName} title="Move item backward" aria-label="Move item backward">
						<IconDisplay iconKey="fp-layer-down" size={18} alt="Move item backward" />
					</button>
				</div>
			);
		}

		if (selectedRoomId) {
			return (
				<div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
					<button type="button" onClick={onExitRoom} className={iconButtonClassName} title="Exit room" aria-label="Exit room">
						<IconDisplay iconKey="fp-exit" size={18} alt="Exit room" />
					</button>
					<button type="button" onClick={onEditRoom} className={iconButtonClassName} title="Edit room" aria-label="Edit room">
						<IconDisplay iconKey="fp-edit" size={18} alt="Edit room" />
					</button>
					<button type="button" onClick={openRoomAlbumEditor} disabled={selectedRoomPhotoBusy} className={iconButtonClassName} title="Take room photo" aria-label="Take room photo">
						<IconDisplay iconKey="fp-camera" size={18} alt="Take room photo" />
					</button>
					<div ref={addChoiceRef} className="relative">
						<button
							type="button"
							onClick={() => setShowAddChoice((current) => !current)}
							className={isRoomAddChoiceOpen ? activeIconButtonClassName : iconButtonClassName}
							title="Add"
							aria-label="Add"
							aria-expanded={isRoomAddChoiceOpen}
						>
							<IconDisplay iconKey="fp-add-item" size={18} alt="Add" />
						</button>
						{isRoomAddChoiceOpen ? (
							<div className="absolute left-0 top-full z-10 mt-2 flex min-w-max flex-col gap-2 rounded-2xl bg-white/95 p-2 shadow-lg ring-1 ring-black/5 backdrop-blur dark:bg-gray-900/95">
								<button
									type="button"
									onClick={() => {
										onAddItem();
										setShowAddChoice(false);
									}}
									className={iconButtonClassName}
									title="Add item"
									aria-label="Add item"
								>
									<IconDisplay iconKey="fp-add-item" size={18} alt="Add item" />
								</button>
								<button
									type="button"
									onClick={() => {
										onAddContainer();
										setShowAddChoice(false);
									}}
									className={iconButtonClassName}
									title="Add container"
									aria-label="Add container"
								>
									<IconDisplay iconKey="fp-add-container" size={18} alt="Add container" />
								</button>
							</div>
						) : null}
					</div>
					<button type="button" onClick={onCleanRoom} disabled={!selectedRoomCanClean} className={iconButtonClassName} title="Clean room" aria-label="Clean room">
						<IconDisplay iconKey="fp-clean" size={18} alt="Clean room" />
					</button>
				</div>
			);
		}

		return (
			<div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
				<button type="button" onClick={openHomeAlbumEditor} className={iconButtonClassName} title="Take home photo" aria-label="Take home photo">
					<IconDisplay iconKey="fp-camera" size={18} alt="Take home photo" />
				</button>
				<button type="button" onClick={onOutlineRoom} disabled={!activeStoryHasOutline} className={iconButtonClassName} title="Add Room" aria-label="Add Room">
					<IconDisplay iconKey="fp-add-room" size={18} alt="Add Room" />
				</button>
				<button type="button" onClick={onAddStory} className={iconButtonClassName} title="Add Story" aria-label="Add Story">
					<IconDisplay iconKey="fp-add-story" size={18} alt="Add Story" />
				</button>
			</div>
		);
	})();

	return (
		<div className="border-t border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-950/40">
			{actionContent}
		</div>
	);
}
