/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
import { useEffect, useState } from 'react';
import { AlbumViewer } from '../../../../../shared/AlbumViewer';
import type { AlbumEntry, ResourceRecurrenceRule } from '../../../../../../types/resource';
import type { ConsumeInputFields, TextInputFields } from '../../../../../../types/taskTemplate';

interface HomeFloorPlanRoomRowsProps {
	summary: any;
	isEditingStory?: boolean;
	[key: string]: any;
}

export function HomeFloorPlanRoomRows({ summary, ...props }: HomeFloorPlanRoomRowsProps) {
	const {
		IconDisplay,
		IconPicker,
		INPUT_CLS,
		ITEM_TASK_TYPE_OPTIONS,
		DOW_LABELS,
		describeReminder,
		describeTaskRecurrence,
		executePlacedRecurringTask,
		expandedPlacedContainerId,
		expandedPlacedTaskId,
		getDayOfMonth,
		getItemTaskTypeLabel,
		homeAlbum,
		isPlacedTaskInQuickActions,
		isPlacementCleanInQuickActions,
		mergedItemTemplates,
		normalizeRecurrenceMode,
		onPlacedItemSelectRef,
		onSelectRoom,
		photoStatusByScope,
		pushPlacedRecurringTaskReminder,
		renderContainerItems,
		resolvePlacedTaskDisplay,
		setAddingItemContainerId,
		setEditingPlacedContainerId,
		setExpandedPlacedContainerId,
		setExpandedPlacedTaskId,
		setSelectedPlacementId,
		setViewingContainerPlacementId,
		updatePlacedItem,
		updatePlacedRecurringTask,
		updatePlacedRecurringTaskName,
		updatePlacedRecurringTaskType,
		updatePlacedRecurringTaskRecurrence,
		togglePlacedRecurringTaskDay,
		addPlacedRecurringTask,
		removePlacedRecurringTask,
		addPlacedRecurringTaskConsumeEntry,
		updatePlacedRecurringTaskConsumeEntry,
		removePlacedRecurringTaskConsumeEntry,
		updatePlacedRecurringTaskTextInput,
		userConsumableTaskTemplates,
		viewingContainerPlacementId,
		isEditingStory = false,
	} = props;

	const [activeRoomTab, setActiveRoomTab] = useState<'items' | 'containers' | 'album'>('items');

	useEffect(() => {
		if (!expandedPlacedContainerId) return;

		const isContainer = summary.placedEntries.some(
			(e: any) => e.placement.kind === 'container' && e.placement.id === expandedPlacedContainerId
		);
		const isItem = summary.placedEntries.some(
			(e: any) => e.placement.kind === 'item' && e.placement.id === expandedPlacedContainerId
		);

		// eslint-disable-next-line react-hooks/set-state-in-effect
		if (isContainer) setActiveRoomTab('containers');
		else if (isItem) setActiveRoomTab('items');
	}, [expandedPlacedContainerId]); // eslint-disable-line react-hooks/exhaustive-deps
	if (isEditingStory) return null;

	const { room, placedContainerEntries, placedLooseItemEntries } = summary;
	const roomAlbumEntries = ((homeAlbum ?? []) as AlbumEntry[]).filter((entry) => entry.sourceRef === room.id);
	const selectedContainerEntry = placedContainerEntries.find((entry) => entry.placement.id === expandedPlacedContainerId) ?? null;
	const selectedLooseItemEntry = placedLooseItemEntries.find((entry) => entry.placement.id === expandedPlacedContainerId) ?? null;
	const visibleContainerEntries = selectedContainerEntry ? [selectedContainerEntry] : selectedLooseItemEntry ? [] : placedContainerEntries;
	const visibleLooseItemEntries = selectedLooseItemEntry ? [selectedLooseItemEntry] : selectedContainerEntry ? [] : placedLooseItemEntries;

	return (
		<>
			<div className="space-y-3 border-t border-gray-200 px-2 py-2 dark:border-gray-700">
				<div className="flex items-center gap-4 border-b border-gray-200 px-1 pb-2 dark:border-gray-700">
					{([
						{ key: 'items', label: 'Items' },
						{ key: 'containers', label: 'Containers' },
						{ key: 'album', label: 'Album' },
					] as const).map((tab) => (
						<button
							key={tab.key}
							type="button"
							onClick={() => setActiveRoomTab(tab.key)}
							className={`text-sm font-medium transition-colors ${
								activeRoomTab === tab.key
									? 'text-gray-900 dark:text-gray-100'
									: 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
							}`}
						>
							{tab.label}
						</button>
					))}
				</div>

				{activeRoomTab === 'items' && visibleLooseItemEntries.length > 0 ? (
				<div className="space-y-2 rounded-xl bg-gray-50 py-3 text-sm dark:bg-gray-800/60">
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
													onPlacedItemSelectRef.current?.(null);
													return;
												}

												onSelectRoom(room.id);
												setExpandedPlacedContainerId(entry.placement.id);
												setSelectedPlacementId(entry.placement.id);
												setViewingContainerPlacementId(null);
											}}
											className="flex w-full items-center gap-3 px-3 py-3 text-left"
										>
											<div className="flex min-w-0 items-center gap-3">
												<IconDisplay iconKey={entry.itemIcon || 'inventory'} size={16} className="h-4 w-4 shrink-0 object-contain" alt="" />
												<div className="min-w-0">
													<div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{entry.itemName}</div>
													<div className="text-[11px] text-gray-500 dark:text-gray-400">{quantityLabel}{entry.threshold != null ? ` · Threshold ${entry.threshold}` : ''} · {entry.inventoryName}{hasCleanTaskInQuickActions ? ' · In Quick Actions' : ''}</div>
												</div>
											</div>
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
																					<div className="flex min-w-0 items-center gap-2">
																						<div className="truncate text-xs font-medium text-gray-800 dark:text-gray-100">{taskDisplay.name}</div>
																						<span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
																							(task.taskType ?? 'CHECK') === 'CONSUME'
																								? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
																								: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
																						}`}>
																							{getItemTaskTypeLabel(task.taskType ?? 'CHECK')}
																						</span>
																					</div>
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
																							<div className="space-y-1">
																								<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Icon</span>
																								<IconPicker
																									value={task.icon ?? ''}
																									onChange={(icon) => updatePlacedRecurringTask(room.id, entry.placement.id, task.id, 'icon', icon || undefined)}
																									align="left"
																								/>
																							</div>
																							<label className="space-y-1">
																								<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Task name</span>
																								<input value={task.taskTemplateRef} onChange={(event) => updatePlacedRecurringTaskName(room.id, entry.placement.id, task.id, event.target.value)} className={`${INPUT_CLS} w-full`} />
																							</label>
																							<button type="button" onClick={() => removePlacedRecurringTask(room.id, entry.placement.id, task.id)} className="rounded-full bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 sm:self-end">Remove task</button>
																						</>
																					)}
																				</div>
																				<div className={`grid gap-2 ${isBuiltInTask ? 'sm:grid-cols-[12rem]' : 'sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end'}`}>
																					{isBuiltInTask ? null : (
																						<label className="space-y-1">
																							<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Task type</span>
																							<select value={task.taskType ?? 'CHECK'} onChange={(event) => updatePlacedRecurringTaskType(room.id, entry.placement.id, task.id, event.target.value)} className={`${INPUT_CLS} w-full`}>
																								{ITEM_TASK_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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
																				{!isBuiltInTask && (task.taskType ?? 'CHECK') === 'CONSUME' ? (
																					<div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-600 dark:bg-gray-800/70">
																						<div className="flex items-center justify-between gap-2">
																							<div className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Consume entries</div>
																							<button type="button" onClick={() => addPlacedRecurringTaskConsumeEntry(room.id, entry.placement.id, task.id)} className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-200 dark:hover:bg-blue-900/40">Add entry</button>
																						</div>
																						{(((task.inputFields as ConsumeInputFields | undefined)?.entries) ?? []).length === 0 ? (
																							<div className="rounded-md border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">No consume entries yet.</div>
																						) : (
																							<div className="space-y-2">
																								{(((task.inputFields as ConsumeInputFields | undefined)?.entries) ?? []).map((consumeEntry, consumeIndex) => (
																									<div key={`${task.id}-consume-${consumeIndex}`} className="grid gap-3 rounded-md border border-gray-200 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-900/70 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end">
																										<label className="space-y-1">
																											<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Item</span>
																											<select value={consumeEntry.itemTemplateRef} onChange={(event) => updatePlacedRecurringTaskConsumeEntry(room.id, entry.placement.id, task.id, consumeIndex, { itemTemplateRef: event.target.value })} className={`${INPUT_CLS} w-full`}>
																												<option value="">Select item</option>
																												{userConsumableTaskTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
																											</select>
																										</label>
																										<label className="space-y-1">
																											<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Quantity</span>
																											<input type="number" min={1} value={consumeEntry.quantity} onChange={(event) => updatePlacedRecurringTaskConsumeEntry(room.id, entry.placement.id, task.id, consumeIndex, { quantity: Math.max(1, Number(event.target.value) || 1) })} className={`${INPUT_CLS} w-full`} />
																										</label>
																										<button type="button" onClick={() => removePlacedRecurringTaskConsumeEntry(room.id, entry.placement.id, task.id, consumeIndex)} className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 sm:self-end">Remove</button>
																									</div>
																								))}
																							</div>
																						)}
																					</div>
																				) : null}
																				{!isBuiltInTask && (task.taskType ?? 'CHECK') === 'TEXT' ? (
																					<div className="grid gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-600 dark:bg-gray-800/70">
																						<label className="space-y-1">
																							<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Prompt</span>
																							<input
																								type="text"
																								value={((task.inputFields as TextInputFields | undefined)?.prompt) ?? ''}
																								onChange={(event) => updatePlacedRecurringTaskTextInput(room.id, entry.placement.id, task.id, { prompt: event.target.value })}
																								className={`${INPUT_CLS} w-full`}
																								placeholder="Enter the prompt shown to the user"
																							/>
																						</label>
																						<label className="space-y-1">
																							<span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Expected value return</span>
																							<input
																								type="text"
																								value={((task.inputFields as TextInputFields | undefined)?.expectedValue) ?? ''}
																								onChange={(event) => updatePlacedRecurringTaskTextInput(room.id, entry.placement.id, task.id, { expectedValue: event.target.value })}
																								className={`${INPUT_CLS} w-full`}
																								placeholder="Enter the expected response"
																							/>
																						</label>
																					</div>
																				) : null}
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
																						<button type="button" onClick={() => executePlacedRecurringTask(taskDisplay.name, task, entry.itemTemplateRef)} className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-200 dark:hover:bg-emerald-900/40">Execute</button>
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
												) : null}
												<div className="mt-3 flex flex-wrap items-center gap-2">
													<div className="text-[11px] text-gray-500 dark:text-gray-400">Drag the selected footprint on the canvas to move it.</div>
												</div>
												{photoStatusByScope[`placed-item:${entry.placement.id}`] ? (
													<div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">{photoStatusByScope[`placed-item:${entry.placement.id}`]}</div>
												) : null}
											</div>
										) : null}
									</div>
								);
							})}
						</div>
					)}
				</div>
				) : null}

				{activeRoomTab === 'containers' && visibleContainerEntries.length > 0 ? (
				<div className="space-y-2 rounded-xl bg-gray-50 py-3 text-sm dark:bg-gray-800/60">
					<div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Container placement</div>
					{visibleContainerEntries.length === 0 ? (
						<div className="mt-2 text-xs italic text-gray-400">No placed containers.</div>
					) : (
						<div className="space-y-2">
							{visibleContainerEntries.map((entry) => {
								const isSelectedPlacement = expandedPlacedContainerId === entry.placement.id;
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
													onPlacedItemSelectRef.current?.(null);
													return;
												}

												onSelectRoom(room.id);
												setExpandedPlacedContainerId(entry.placement.id);
												setSelectedPlacementId(entry.placement.id);
												setViewingContainerPlacementId(null);
											}}
											className="flex w-full items-center gap-3 px-3 py-3 text-left"
										>
											<div className="flex min-w-0 items-center gap-3">
												<IconDisplay iconKey={entry.containerIcon || 'inventory'} size={16} className="h-4 w-4 shrink-0 object-contain" alt="" />
												<div className="min-w-0">
													<div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{entry.containerName}</div>
													<div className="text-[11px] text-gray-500 dark:text-gray-400">{entry.items.length} item{entry.items.length === 1 ? '' : 's'} · {entry.inventoryName}{hasCleanTaskInQuickActions ? ' · In Quick Actions' : ''}</div>
												</div>
											</div>
										</button>
										{isSelectedPlacement ? (
											<div className="border-t border-gray-200 px-3 py-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
												<div className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">{entry.inventoryName}</div>
												{renderContainerItems(entry.placement.refId, entry.items, false)}
												{photoStatusByScope[`placed-container:${entry.placement.id}`] ? (
													<div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">{photoStatusByScope[`placed-container:${entry.placement.id}`]}</div>
												) : null}
											</div>
										) : null}
									</div>
								);
							})}
						</div>
					)}
				</div>
				) : null}

				{activeRoomTab === 'album' ? (
				<div className="rounded-xl bg-gray-50 px-3 py-3 dark:bg-gray-800/60">
					<AlbumViewer
						entries={roomAlbumEntries}
						title="Room Photos"
					/>
				</div>
				) : null}
			</div>
		</>
	);
}
