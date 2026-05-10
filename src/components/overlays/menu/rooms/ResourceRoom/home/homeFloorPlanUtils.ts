import { CUSTOM_ITEM_TEMPLATE_PREFIX, getItemTaskTemplateMeta } from '../../../../../../coach/ItemLibrary';
import { taskTemplateLibrary } from '../../../../../../coach';
import type {
	FloorPlanSegment,
	InventoryContainer,
	InventoryItemTemplate,
	ItemRecurringTask,
	PlacedInstance,
	RecurrenceDayOfWeek,
	ResourceRecurrenceRule,
	SegmentDirection,
} from '../../../../../../types/resource';
import { makeDefaultRecurrenceRule } from '../../../../../../types/resource';
import type { ConsumeEntry, ConsumeInputFields, TextInputFields } from '../../../../../../types/taskTemplate';
import { resolveInventoryItemTemplate } from '../../../../../../utils/inventoryItems';
import { segmentsToPoints } from '../../../../../../utils/floorPlan';

export type ContainerFace = 'width-depth' | 'width-height' | 'depth-height';
export type FaceGridDraft = { columns: number; rows: number };
export type FaceGridInputDraft = { columns: string; rows: string };

const DOW_LABELS: Array<{ key: RecurrenceDayOfWeek; label: string }> = [
	{ key: 'sun', label: 'Su' },
	{ key: 'mon', label: 'Mo' },
	{ key: 'tue', label: 'Tu' },
	{ key: 'wed', label: 'We' },
	{ key: 'thu', label: 'Th' },
	{ key: 'fri', label: 'Fr' },
	{ key: 'sat', label: 'Sa' },
];

export function getPlacedInstanceQuantity(placement: Pick<PlacedInstance, 'quantity'>) {
	return placement.quantity ?? 1;
}

export function getDayOfMonth(isoDate: string) {
	const parsed = Number(isoDate.split('-')[2] ?? 1);
	return Math.min(31, Math.max(1, parsed || 1));
}

export function formatDayOfMonth(day: number) {
	const mod10 = day % 10;
	const mod100 = day % 100;
	if (mod10 === 1 && mod100 !== 11) return `${day}st`;
	if (mod10 === 2 && mod100 !== 12) return `${day}nd`;
	if (mod10 === 3 && mod100 !== 13) return `${day}rd`;
	return `${day}th`;
}

export function describeTaskRecurrence(rule: ResourceRecurrenceRule) {
	const interval = Math.max(1, rule.interval || 1);
	switch (rule.frequency) {
		case 'daily':
			return interval === 1 ? 'Daily' : `Every ${interval} days`;
		case 'weekly': {
			const days = rule.days.length > 0
				? rule.days.map((day) => DOW_LABELS.find((entry) => entry.key === day)?.label ?? day).join(', ')
				: 'Seed day';
			return interval === 1 ? `Weekly · ${days}` : `Every ${interval} weeks · ${days}`;
		}
		case 'monthly': {
			const day = rule.monthlyDay ?? getDayOfMonth(rule.seedDate);
			return interval === 1 ? `Monthly · ${formatDayOfMonth(day)}` : `Every ${interval} months · ${formatDayOfMonth(day)}`;
		}
		case 'yearly':
			return interval === 1 ? 'Yearly' : `Every ${interval} years`;
		default:
			return 'Recurring';
	}
}

export function describeReminder(leadDays: number) {
	if (leadDays < 0) return 'No reminder';
	if (leadDays === 0) return 'Day of';
	if (leadDays === 1) return '1 day before';
	return `${leadDays} days before`;
}

export function buildPlacedTaskQuickActionsKey(placementId: string, recurringTaskId: string, resourceRef: string | null | undefined) {
	return `resource-task:${resourceRef ?? ''}:home-placement:${placementId}:${recurringTaskId}`;
}

export function buildPlacementCleanQuickActionsKey(placementId: string, resourceRef: string | null | undefined) {
	return `resource-task:${resourceRef ?? ''}:home-placement:${placementId}:clean`;
}

export function buildPlacedRecurringTaskId(placementId: string, taskTemplateRef: string) {
	return `placed-task:${placementId}:${taskTemplateRef.trim().toLowerCase()}`;
}

export function humanizeTaskRef(taskTemplateRef: string) {
	return taskTemplateRef
		.replace(/^resource-task:/, '')
		.replace(/^item-tmpl-/, '')
		.replace(/[-_]+/g, ' ')
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getItemTaskTypeLabel(taskType: string | null | undefined) {
	if (taskType === 'TEXT') return 'Use';
	if (taskType === 'CONSUME') return 'Consume';
	if (taskType === 'CHECK' || !taskType) return 'Check';
	return taskType;
}

export function buildPlacedRecurringTaskInputFields(
	taskName: string,
	taskType: string | null | undefined,
	inputFields?: Partial<ConsumeInputFields> | Partial<TextInputFields>,
) {
	if (taskType === 'CONSUME') {
		const consumeInputFields = (inputFields as Partial<ConsumeInputFields> | undefined) ?? {};
		return {
			label: taskName,
			entries: ((consumeInputFields.entries ?? []) as ConsumeEntry[]).map((entry) => ({
				itemTemplateRef: entry.itemTemplateRef,
				quantity: Math.max(1, Number(entry.quantity) || 1),
			})),
		} satisfies ConsumeInputFields;
	}

	if (taskType === 'TEXT') {
		const textInputFields = (inputFields as Partial<TextInputFields> | undefined) ?? {};
		return {
			prompt: typeof textInputFields.prompt === 'string' ? textInputFields.prompt : '',
			maxLength: null,
			expectedValue: typeof textInputFields.expectedValue === 'string' ? textInputFields.expectedValue : '',
		} satisfies TextInputFields;
	}

	return {
		label: taskName,
	};
}

export function buildPlacedItemRecurringTasks(placementId: string, itemTemplateRef: string, availableTemplates: InventoryItemTemplate[]): ItemRecurringTask[] {
	const customTemplate = availableTemplates.find((option) => option.id === itemTemplateRef);
	if (itemTemplateRef.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX)) {
		const customTaskTemplates = (customTemplate?.customTaskTemplates ?? []) as Array<{
			id: string;
			name: string;
			taskType?: string;
			inputFields?: Partial<ConsumeInputFields>;
		}>;
		return customTaskTemplates
			.filter((taskTemplate) => taskTemplate.name.trim().length > 0)
			.map((taskTemplate) => ({
				id: buildPlacedRecurringTaskId(placementId, taskTemplate.name.trim()),
				taskTemplateRef: taskTemplate.name.trim(),
				taskType: taskTemplate.taskType ?? 'CHECK',
				inputFields: buildPlacedRecurringTaskInputFields(
					taskTemplate.name.trim(),
					taskTemplate.taskType ?? 'CHECK',
					taskTemplate.inputFields as Partial<ConsumeInputFields> | undefined,
				),
				recurrenceMode: 'never',
				recurrence: makeDefaultRecurrenceRule(),
				reminderLeadDays: 7,
			}));
	}

	const template = resolveInventoryItemTemplate(itemTemplateRef, availableTemplates);
	const taskRefs = new Set<string>();
	for (const task of template?.builtInTasks ?? []) {
		if (task.taskTemplateRef) taskRefs.add(task.taskTemplateRef);
	}

	return [...taskRefs].map((taskTemplateRef) => ({
		id: buildPlacedRecurringTaskId(placementId, taskTemplateRef),
		taskTemplateRef,
		recurrenceMode: 'never',
		recurrence: makeDefaultRecurrenceRule(),
		reminderLeadDays: 7,
	}));
}

export function resolvePlacedTaskDisplay(taskTemplateRef: string, itemTemplateRef: string, availableTemplates: InventoryItemTemplate[]) {
	if (itemTemplateRef.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX)) {
		const customTemplate = availableTemplates.find((option) => option.id === itemTemplateRef);
		const customTask = customTemplate?.customTaskTemplates?.find((taskTemplate) => taskTemplate.name.trim() === taskTemplateRef);
		if (customTask) {
			return {
				name: customTask.name,
				icon: customTask.icon || 'task',
			};
		}
	}

	const coachTaskTemplate = taskTemplateLibrary.find((template) => template.id === taskTemplateRef);
	if (coachTaskTemplate) {
		return {
			name: coachTaskTemplate.name,
			icon: coachTaskTemplate.icon || 'task',
		};
	}

	const itemTaskTemplate = getItemTaskTemplateMeta(taskTemplateRef);
	if (itemTaskTemplate) {
		return {
			name: itemTaskTemplate.name,
			icon: itemTaskTemplate.icon || 'task',
		};
	}

	return {
		name: humanizeTaskRef(taskTemplateRef),
		icon: 'task',
	};
}

export function containerFaceLabel(face: ContainerFace) {
	switch (face) {
		case 'width-height':
			return 'Front View';
		case 'depth-height':
			return 'Side View';
		case 'width-depth':
		default:
			return 'Top View';
	}
}

export function clampGridCount(value: number) {
	return Math.min(10, Math.max(1, value));
}

export function resolveContainerFaceGrid(layoutGrid: InventoryContainer['layoutGrid'] | undefined, face: ContainerFace): FaceGridDraft {
	const fallback = {
		columns: clampGridCount(layoutGrid?.columns ?? 1),
		rows: clampGridCount(layoutGrid?.rows ?? 1),
	};

	switch (face) {
		case 'width-height':
			return layoutGrid?.widthHeight ?? fallback;
		case 'depth-height':
			return layoutGrid?.depthHeight ?? fallback;
		case 'width-depth':
		default:
			return layoutGrid?.widthDepth ?? fallback;
	}
}

export function normaliseFaceGridInput(draft: FaceGridInputDraft): FaceGridDraft {
	return {
		columns: clampGridCount(Number(draft.columns) || 1),
		rows: clampGridCount(Number(draft.rows) || 1),
	};
}

export function clampZoom(zoom: number) {
	return Math.min(2.5, Math.max(0.45, zoom));
}

export function combineBounds(boundsList: Array<{ minX: number; minY: number; maxX: number; maxY: number }>) {
	if (boundsList.length === 0) return null;

	let minX = boundsList[0].minX;
	let minY = boundsList[0].minY;
	let maxX = boundsList[0].maxX;
	let maxY = boundsList[0].maxY;

	for (const bounds of boundsList.slice(1)) {
		minX = Math.min(minX, bounds.minX);
		minY = Math.min(minY, bounds.minY);
		maxX = Math.max(maxX, bounds.maxX);
		maxY = Math.max(maxY, bounds.maxY);
	}

	return {
		minX,
		minY,
		maxX,
		maxY,
		width: maxX - minX,
		height: maxY - minY,
	};
}

export function midpoint(left: { x: number; y: number }, right: { x: number; y: number }) {
	return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

export function formatDistance(distance: number) {
	return `${Math.round(distance)}`;
}

export function projectPoint(origin: { x: number; y: number }, direction: SegmentDirection, distance: number) {
	switch (direction) {
		case 'up':
			return { x: origin.x, y: origin.y - distance };
		case 'down':
			return { x: origin.x, y: origin.y + distance };
		case 'left':
			return { x: origin.x - distance, y: origin.y };
		case 'right':
		default:
			return { x: origin.x + distance, y: origin.y };
	}
}

export function getRotatedRectPoints(center: { x: number; y: number }, width: number, depth: number, rotation: number) {
	const halfWidth = width / 2;
	const halfDepth = depth / 2;
	const radians = rotation * (Math.PI / 180);
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	const corners = [
		{ x: -halfWidth, y: -halfDepth },
		{ x: halfWidth, y: -halfDepth },
		{ x: halfWidth, y: halfDepth },
		{ x: -halfWidth, y: halfDepth },
	];

	return corners.map((corner) => ({
		x: center.x + corner.x * cos - corner.y * sin,
		y: center.y + corner.x * sin + corner.y * cos,
	}));
}

export function getDirectionAndDistance(from: { x: number; y: number }, to: { x: number; y: number }) {
	const dx = to.x - from.x;
	const dy = to.y - from.y;

	if (Math.abs(dx) >= Math.abs(dy)) {
		return {
			direction: (dx >= 0 ? 'right' : 'left') as SegmentDirection,
			distance: Math.abs(dx),
		};
	}

	return {
		direction: (dy >= 0 ? 'down' : 'up') as SegmentDirection,
		distance: Math.abs(dy),
	};
}

export function getSegmentLines(origin: { x: number; y: number }, segments: FloorPlanSegment[]) {
	const points = segmentsToPoints(origin, segments);
	return segments.map((segment, index) => ({
		segment,
		index,
		start: points[index] ?? origin,
		end: points[index + 1] ?? points[index] ?? origin,
	}));
}
