import type { VehicleLayoutArea, VehicleLayoutTemplate } from '../../../../../../types/resource';
import { getVehicleLayoutDefinition } from './vehicleLayoutTemplates';

interface VehicleLayoutDiagramProps {
  template: VehicleLayoutTemplate;
  areas: VehicleLayoutArea[];
  selectedZoneId: string | null;
  onZoneSelect: (zoneId: string) => void;
  isEditMode: boolean;
}

function splitLabel(label: string): string[] {
  const words = label.split(' ');
  if (words.length <= 2) return [label];
  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(' '), words.slice(midpoint).join(' ')];
}

function getZoneFill(area: VehicleLayoutArea | undefined, isSelected: boolean): string {
  if (isSelected) return 'rgba(59, 130, 246, 0.18)';
  const lastInspection = area?.inspectionHistory[0];
  if (!lastInspection) return 'rgba(148, 163, 184, 0.18)';
  return lastInspection.result === 'pass'
    ? 'var(--zone-pass, rgba(34, 197, 94, 0.18))'
    : 'var(--zone-fail, rgba(239, 68, 68, 0.18))';
}

export function VehicleLayoutDiagram({ template, areas, selectedZoneId, onZoneSelect }: VehicleLayoutDiagramProps) {
  const definition = getVehicleLayoutDefinition(template);
  const areaByZoneId = new Map(areas.map((area) => [area.zoneId, area]));

  return (
    <div
      className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900/40"
      style={{
        ['--zone-pass' as string]: 'rgba(34, 197, 94, 0.18)',
        ['--zone-fail' as string]: 'rgba(239, 68, 68, 0.18)',
      }}
    >
      <svg viewBox={definition.viewBox} className="h-full w-full" role="img" aria-label={`${template} vehicle layout diagram`}>
        {definition.zones.map((zone) => {
          const area = areaByZoneId.get(zone.id);
          const isSelected = zone.id === selectedZoneId;
          const labelLines = splitLabel(zone.name);
          const badgeCount = zone.allowsContainers ? area?.containerIds.length ?? 0 : 0;
          const centerX = zone.svgShape.x + zone.svgShape.width / 2;
          const centerY = zone.svgShape.y + zone.svgShape.height / 2;

          return (
            <g key={zone.id} onClick={() => onZoneSelect(zone.id)} className="cursor-pointer">
              <rect
                x={zone.svgShape.x}
                y={zone.svgShape.y}
                width={zone.svgShape.width}
                height={zone.svgShape.height}
                rx={12}
                fill={getZoneFill(area, isSelected)}
                stroke={isSelected ? 'rgb(59, 130, 246)' : 'rgba(100, 116, 139, 0.45)'}
                strokeWidth={isSelected ? 3.5 : 1.5}
              />
              <text
                x={centerX}
                y={centerY - (labelLines.length - 1) * 7}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill="currentColor"
                className="text-slate-700 dark:text-slate-200"
              >
                {labelLines.map((line, index) => (
                  <tspan key={line} x={centerX} dy={index === 0 ? 0 : 12}>{line}</tspan>
                ))}
              </text>
              {badgeCount > 0 ? (
                <g>
                  <rect
                    x={zone.svgShape.x + zone.svgShape.width - 26}
                    y={zone.svgShape.y + 8}
                    width={18}
                    height={18}
                    rx={9}
                    fill="rgba(15, 23, 42, 0.88)"
                  />
                  <text
                    x={zone.svgShape.x + zone.svgShape.width - 17}
                    y={zone.svgShape.y + 20}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="700"
                    fill="white"
                  >
                    {badgeCount}
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
