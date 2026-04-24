import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { VehicleLayout as VehicleLayoutModel, VehicleLayoutArea, VehicleLayoutTemplate, VehicleMaintenanceTask, VehicleResource } from '../../../../../../types/resource';
import { isInventory } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { IconPicker } from '../../../../../shared/IconPicker';

interface VehicleLayoutProps {
  resource: VehicleResource;
  isEditMode?: boolean;
  onLayoutChange?: (layout: VehicleLayoutModel | undefined) => void;
  onMaintenanceTasksChange?: (tasks: VehicleMaintenanceTask[]) => void;
}

export const VEHICLE_LAYOUT_TEMPLATE_AREAS: Record<VehicleLayoutTemplate, Array<{ name: string; icon: string }>> = {
  bike: [
    { name: 'Frame', icon: 'vehicle' },
    { name: 'Wheels', icon: 'resource-inventory' },
    { name: 'Drivetrain', icon: 'task' },
    { name: 'Brakes', icon: 'check' },
    { name: 'Cockpit', icon: 'resource-home' },
  ],
  car: [
    { name: 'Engine Bay', icon: 'task' },
    { name: 'Cabin', icon: 'resource-home' },
    { name: 'Trunk', icon: 'resource-inventory' },
    { name: 'Exterior', icon: 'vehicle' },
    { name: 'Undercarriage', icon: 'resource-inventory' },
  ],
  truck: [
    { name: 'Engine Bay', icon: 'task' },
    { name: 'Cabin', icon: 'resource-home' },
    { name: 'Bed', icon: 'resource-inventory' },
    { name: 'Exterior', icon: 'vehicle' },
    { name: 'Undercarriage', icon: 'resource-inventory' },
  ],
  plane: [
    { name: 'Airframe', icon: 'vehicle' },
    { name: 'Cockpit', icon: 'resource-home' },
    { name: 'Engine', icon: 'task' },
    { name: 'Landing Gear', icon: 'resource-inventory' },
    { name: 'Exterior', icon: 'vehicle' },
  ],
};

export function buildVehicleLayout(template: VehicleLayoutTemplate): VehicleLayoutModel {
  return {
    template,
    areas: VEHICLE_LAYOUT_TEMPLATE_AREAS[template].map((area) => ({
      id: uuidv4(),
      name: area.name,
      icon: area.icon,
      containerIds: [],
    })),
  };
}

function titleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export function VehicleLayout({ resource, isEditMode = false, onLayoutChange, onMaintenanceTasksChange }: VehicleLayoutProps) {
  const resources = useResourceStore((state) => state.resources);
  const [expandedAreaId, setExpandedAreaId] = useState<string | null>(resource.layout?.areas[0]?.id ?? null);
  const [pickerAreaId, setPickerAreaId] = useState<string | null>(null);
  const [pendingContainerIdByArea, setPendingContainerIdByArea] = useState<Record<string, string>>({});

  const layout = resource.layout;

  const inventoryEntries = useMemo(() => {
    return Object.values(resources)
      .filter(isInventory)
      .flatMap((inventory) =>
        (inventory.containers ?? []).map((container) => ({
          inventoryId: inventory.id,
          inventoryName: inventory.name,
          container,
          locationLink: container.links?.find((link) => link.relationship === 'location'),
        })),
      );
  }, [resources]);

  const containerLookup = useMemo(() => {
    return new Map(
      inventoryEntries.map((entry) => [entry.container.id, entry]),
    );
  }, [inventoryEntries]);

  const eligibleContainers = useMemo(() => {
    return inventoryEntries.filter((entry) => {
      if (!entry.locationLink) return true;
      return entry.locationLink.targetKind === 'vehicle' && entry.locationLink.targetResourceId === resource.id;
    });
  }, [inventoryEntries, resource.id]);

  if (!layout) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
        Set up vehicle layout in edit mode.
      </div>
    );
  }

  const activeLayout = layout;

  function setLayout(nextLayout: VehicleLayoutModel) {
    onLayoutChange?.(nextLayout);
  }

  function updateArea(areaId: string, patch: Partial<VehicleLayoutArea>) {
    setLayout({
      ...activeLayout,
      areas: activeLayout.areas.map((area) => (area.id === areaId ? { ...area, ...patch } : area)),
    });
  }

  function assignContainerToArea(areaId: string, containerId: string) {
    setLayout({
      ...activeLayout,
      areas: activeLayout.areas.map((area) => {
        const filtered = area.containerIds.filter((id) => id !== containerId);
        return area.id === areaId
          ? { ...area, containerIds: [...filtered, containerId] }
          : { ...area, containerIds: filtered };
      }),
    });
    setPendingContainerIdByArea((prev) => ({ ...prev, [areaId]: '' }));
    setPickerAreaId(null);
  }

  function removeContainerFromArea(areaId: string, containerId: string) {
    updateArea(areaId, {
      containerIds: activeLayout.areas.find((area) => area.id === areaId)?.containerIds.filter((id) => id !== containerId) ?? [],
    });
  }

  function addArea() {
    const nextArea: VehicleLayoutArea = {
      id: uuidv4(),
      name: '',
      icon: 'vehicle',
      containerIds: [],
    };
    setLayout({ ...activeLayout, areas: [...activeLayout.areas, nextArea] });
    setExpandedAreaId(nextArea.id);
  }

  function removeArea(areaId: string) {
    setLayout({ ...activeLayout, areas: activeLayout.areas.filter((area) => area.id !== areaId) });
    setExpandedAreaId((prev) => (prev === areaId ? null : prev));
  }

  function unlinkAreaTasks(areaId: string) {
    if (!onMaintenanceTasksChange) return;
    onMaintenanceTasksChange(
      (resource.maintenanceTasks ?? []).map((task) => (task.areaId === areaId ? { ...task, areaId: undefined } : task)),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Vehicle layout</p>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{titleCase(activeLayout.template)} template</h4>
        </div>
        {isEditMode && onLayoutChange ? (
          <button
            type="button"
            onClick={addArea}
            className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
          >
            Add area
          </button>
        ) : null}
      </div>

      <div className="space-y-2">
        {activeLayout.areas.map((area) => {
          const isExpanded = expandedAreaId === area.id;
          const areaContainers = area.containerIds.map((containerId) => containerLookup.get(containerId)).filter(Boolean);
          const areaTasks = (resource.maintenanceTasks ?? []).filter((task) => task.areaId === area.id);
          const canRemoveArea = area.containerIds.length === 0 && areaTasks.length === 0;

          return (
            <div key={area.id} className="rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-900/40">
              <button
                type="button"
                onClick={() => setExpandedAreaId((prev) => (prev === area.id ? null : area.id))}
                className="flex w-full items-center gap-3 text-left"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
                  <IconDisplay iconKey={area.icon || 'vehicle'} size={18} className="h-4.5 w-4.5 object-contain" alt="" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{area.name.trim() || 'Untitled area'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{area.containerIds.length} linked container{area.containerIds.length === 1 ? '' : 's'}</p>
                </div>
                <span className="text-xs font-medium text-blue-500">{isExpanded ? 'Close' : 'Open'}</span>
              </button>

              {isExpanded ? (
                <div className="mt-3 space-y-3 border-t border-gray-200 pt-3 dark:border-gray-700">
                  {isEditMode ? (
                    <div className="grid grid-cols-[auto_1fr] items-end gap-3">
                      <IconPicker value={area.icon || 'vehicle'} onChange={(value) => updateArea(area.id, { icon: value })} align="left" />
                      <input
                        type="text"
                        value={area.name}
                        onChange={(event) => updateArea(area.id, { name: event.target.value })}
                        placeholder="Area name"
                        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Containers</p>
                      {isEditMode ? (
                        <button
                          type="button"
                          onClick={() => setPickerAreaId((prev) => (prev === area.id ? null : area.id))}
                          className="text-xs font-medium text-blue-500 hover:text-blue-600"
                        >
                          Add container
                        </button>
                      ) : null}
                    </div>

                    {pickerAreaId === area.id ? (
                      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
                        <select
                          value={pendingContainerIdByArea[area.id] ?? ''}
                          onChange={(event) => setPendingContainerIdByArea((prev) => ({ ...prev, [area.id]: event.target.value }))}
                          className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                        >
                          <option value="">Select container</option>
                          {eligibleContainers.map((entry) => (
                            <option key={entry.container.id} value={entry.container.id}>
                              {entry.container.name} - {entry.inventoryName}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!pendingContainerIdByArea[area.id]}
                          onClick={() => {
                            const containerId = pendingContainerIdByArea[area.id];
                            if (!containerId) return;
                            assignContainerToArea(area.id, containerId);
                          }}
                          className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-40"
                        >
                          Add
                        </button>
                      </div>
                    ) : null}

                    {areaContainers.length === 0 ? (
                      <p className="text-xs italic text-gray-400">No linked containers.</p>
                    ) : areaContainers.map((entry) => {
                      if (!entry) return null;
                      return (
                        <div key={entry.container.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/70">
                          <IconDisplay iconKey={entry.container.icon || 'resource-inventory'} size={14} className="h-3.5 w-3.5 shrink-0 object-contain" alt="" />
                          <span className="flex-1 truncate text-gray-700 dark:text-gray-200">{entry.container.name}</span>
                          <span className="text-xs text-gray-400">{entry.container.items.length} item{entry.container.items.length === 1 ? '' : 's'}</span>
                          {isEditMode ? (
                            <button
                              type="button"
                              onClick={() => removeContainerFromArea(area.id, entry.container.id)}
                              className="text-xs text-gray-400 hover:text-red-400"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Linked maintenance tasks</p>
                      {isEditMode && areaTasks.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => unlinkAreaTasks(area.id)}
                          className="text-xs font-medium text-red-400 hover:text-red-500"
                        >
                          Remove task links
                        </button>
                      ) : null}
                    </div>
                    {areaTasks.length === 0 ? (
                      <p className="text-xs italic text-gray-400">No tasks linked to this area.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {areaTasks.map((task) => (
                          <div key={task.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/70">
                            <IconDisplay iconKey={task.icon || 'vehicle'} size={14} className="h-3.5 w-3.5 shrink-0 object-contain" alt="" />
                            <span className="flex-1 truncate text-gray-700 dark:text-gray-200">{task.name}</span>
                            {isEditMode ? (
                              <button
                                type="button"
                                onClick={() => onMaintenanceTasksChange?.((resource.maintenanceTasks ?? []).map((entry) => entry.id === task.id ? { ...entry, areaId: undefined } : entry))}
                                className="text-xs text-gray-400 hover:text-red-400"
                              >
                                Remove link
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {isEditMode ? (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={!canRemoveArea}
                        onClick={() => removeArea(area.id)}
                        className="text-xs font-medium text-gray-400 hover:text-red-400 disabled:opacity-40"
                      >
                        Remove area
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}