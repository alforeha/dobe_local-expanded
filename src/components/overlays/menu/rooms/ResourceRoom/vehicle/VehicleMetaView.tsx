// VehicleMetaView - read-only display of VehicleResource. W24.

import { normalizeRecurrenceMode, type VehicleMaintenanceTask, type VehicleResource } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { ResourceMetaTabs } from '../shared/ResourceMetaTabs';

interface VehicleMetaViewProps {
  resource: VehicleResource;
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate.slice(0, 10) + 'T00:00:00');
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const RECURRENCE_LABEL: Record<string, string> = {
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
  yearly: 'yearly',
};

function getMaintenanceSummary(task: VehicleMaintenanceTask) {
  if (normalizeRecurrenceMode(task.recurrenceMode) === 'never') return 'Intermittent';
  return RECURRENCE_LABEL[task.recurrence.frequency] ?? task.recurrence.frequency;
}

export function VehicleMetaView({ resource }: VehicleMetaViewProps) {
  const allResources = useResourceStore((s) => s.resources);

  const linkedResources = [
    resource.linkedContactId ? allResources[resource.linkedContactId] ?? null : null,
    resource.linkedAccountId ? allResources[resource.linkedAccountId] ?? null : null,
    ...(resource.linkedDocIds ?? []).map((id) => allResources[id] ?? null),
  ].filter(Boolean);

  const hasAny =
    resource.make ||
    resource.model ||
    resource.year ||
    resource.mileage != null ||
    resource.licensePlate ||
    resource.insuranceExpiry ||
    resource.serviceNextDate ||
    (resource.maintenanceTasks?.length ?? 0) > 0 ||
    linkedResources.length > 0 ||
    (resource.notes?.length ?? 0) > 0;

  const details = (
    <div className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300 mb-1">
      <div className="flex items-center gap-2 mb-2">
        <IconDisplay iconKey={resource.icon} size={20} className="h-5 w-5 shrink-0 object-contain" alt="" />
        <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
          {resource.name}
        </span>
      </div>

      {!hasAny ? (
        <p className="text-xs text-gray-400 italic">No details on file.</p>
      ) : null}

      {resource.make && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Make</span>
          <span>{resource.make}</span>
        </div>
      )}
      {resource.model && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Model</span>
          <span>{resource.model}</span>
        </div>
      )}
      {resource.year != null && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Year</span>
          <span>{resource.year}</span>
        </div>
      )}
      {resource.licensePlate && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Plate</span>
          <span>{resource.licensePlate}</span>
        </div>
      )}
      {resource.mileage != null && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Mileage</span>
          <span>{resource.mileage.toLocaleString()} km</span>
        </div>
      )}
      {resource.insuranceExpiry && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Insurance</span>
          <span>{formatDate(resource.insuranceExpiry)}</span>
        </div>
      )}
      {resource.serviceNextDate && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Service</span>
          <span>{formatDate(resource.serviceNextDate)}</span>
        </div>
      )}

      {resource.maintenanceTasks && resource.maintenanceTasks.length > 0 && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Tasks</span>
          <div className="flex flex-col gap-0.5">
            {resource.maintenanceTasks.map((task) => (
              <span key={task.id} className="flex items-center gap-1.5">
                {task.icon ? <IconDisplay iconKey={task.icon} size={14} className="h-3.5 w-3.5 object-contain" alt="" /> : null}
                <span>{task.name}</span>
                <span className="text-gray-400">
                  - {getMaintenanceSummary(task)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {linkedResources.length > 0 && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Linked</span>
          <div className="flex flex-wrap gap-1">
            {linkedResources.map((linked) => (
              <span
                key={linked!.id}
                className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded text-xs"
              >
                <IconDisplay iconKey={linked!.icon} size={14} className="h-3.5 w-3.5 object-contain" alt="" />
                <span>{linked!.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return <ResourceMetaTabs resource={resource} details={details} />;
}
