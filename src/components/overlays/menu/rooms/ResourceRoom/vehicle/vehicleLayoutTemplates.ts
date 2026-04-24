import { v4 as uuidv4 } from 'uuid';
import type { VehicleLayout, VehicleLayoutArea, VehicleLayoutTemplate } from '../../../../../../types/resource';

export interface VehicleZone {
  id: string;
  name: string;
  icon: string;
  allowsContainers: boolean;
  svgShape: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface VehicleLayoutDefinition {
  template: VehicleLayoutTemplate;
  viewBox: string;
  zones: VehicleZone[];
}

export const VEHICLE_LAYOUT_DEFINITIONS: Record<VehicleLayoutTemplate, VehicleLayoutDefinition> = {
  car: {
    template: 'car',
    viewBox: '0 0 200 400',
    zones: [
      { id: 'front', name: 'Front', icon: 'vehicle', allowsContainers: false, svgShape: { x: 60, y: 10, width: 80, height: 50 } },
      { id: 'engine', name: 'Engine Bay', icon: 'task', allowsContainers: false, svgShape: { x: 60, y: 60, width: 80, height: 60 } },
      { id: 'left', name: 'Left Side', icon: 'vehicle', allowsContainers: false, svgShape: { x: 10, y: 60, width: 50, height: 200 } },
      { id: 'right', name: 'Right Side', icon: 'vehicle', allowsContainers: false, svgShape: { x: 140, y: 60, width: 50, height: 200 } },
      { id: 'cabin', name: 'Cabin', icon: 'resource-home', allowsContainers: true, svgShape: { x: 60, y: 120, width: 80, height: 80 } },
      { id: 'trunk', name: 'Trunk', icon: 'resource-inventory', allowsContainers: true, svgShape: { x: 60, y: 200, width: 80, height: 60 } },
      { id: 'back', name: 'Back', icon: 'vehicle', allowsContainers: false, svgShape: { x: 60, y: 260, width: 80, height: 50 } },
    ],
  },
  truck: {
    template: 'truck',
    viewBox: '0 0 200 400',
    zones: [
      { id: 'front', name: 'Front', icon: 'vehicle', allowsContainers: false, svgShape: { x: 60, y: 10, width: 80, height: 50 } },
      { id: 'engine', name: 'Engine Bay', icon: 'task', allowsContainers: false, svgShape: { x: 60, y: 60, width: 80, height: 60 } },
      { id: 'left', name: 'Left Side', icon: 'vehicle', allowsContainers: false, svgShape: { x: 10, y: 60, width: 50, height: 230 } },
      { id: 'right', name: 'Right Side', icon: 'vehicle', allowsContainers: false, svgShape: { x: 140, y: 60, width: 50, height: 230 } },
      { id: 'cabin', name: 'Cabin', icon: 'resource-home', allowsContainers: true, svgShape: { x: 60, y: 120, width: 80, height: 60 } },
      { id: 'bed', name: 'Bed', icon: 'resource-inventory', allowsContainers: true, svgShape: { x: 60, y: 180, width: 80, height: 110 } },
      { id: 'back', name: 'Back', icon: 'vehicle', allowsContainers: false, svgShape: { x: 60, y: 290, width: 80, height: 50 } },
    ],
  },
  bike: {
    template: 'bike',
    viewBox: '0 0 120 300',
    zones: [
      { id: 'front', name: 'Front Wheel', icon: 'vehicle', allowsContainers: false, svgShape: { x: 30, y: 10, width: 60, height: 60 } },
      { id: 'frame', name: 'Frame and Drivetrain', icon: 'task', allowsContainers: false, svgShape: { x: 30, y: 70, width: 60, height: 130 } },
      { id: 'back', name: 'Back Wheel', icon: 'vehicle', allowsContainers: false, svgShape: { x: 30, y: 200, width: 60, height: 90 } },
      { id: 'left', name: 'Left Side', icon: 'vehicle', allowsContainers: false, svgShape: { x: 10, y: 10, width: 20, height: 280 } },
      { id: 'right', name: 'Right Side', icon: 'vehicle', allowsContainers: false, svgShape: { x: 90, y: 10, width: 20, height: 280 } },
    ],
  },
  plane: {
    template: 'plane',
    viewBox: '0 0 300 200',
    zones: [
      { id: 'nose', name: 'Nose', icon: 'vehicle', allowsContainers: false, svgShape: { x: 10, y: 60, width: 50, height: 80 } },
      { id: 'left-wing', name: 'Left Wing', icon: 'vehicle', allowsContainers: false, svgShape: { x: 60, y: 10, width: 160, height: 50 } },
      { id: 'right-wing', name: 'Right Wing', icon: 'vehicle', allowsContainers: false, svgShape: { x: 60, y: 140, width: 160, height: 50 } },
      { id: 'fuselage', name: 'Fuselage', icon: 'resource-home', allowsContainers: true, svgShape: { x: 60, y: 60, width: 160, height: 80 } },
      { id: 'tail', name: 'Tail', icon: 'vehicle', allowsContainers: false, svgShape: { x: 220, y: 60, width: 70, height: 80 } },
    ],
  },
};

export function getVehicleLayoutDefinition(template: VehicleLayoutTemplate): VehicleLayoutDefinition {
  return VEHICLE_LAYOUT_DEFINITIONS[template];
}

function buildVehicleLayoutArea(zone: VehicleZone): VehicleLayoutArea {
  return {
    id: uuidv4(),
    zoneId: zone.id,
    name: zone.name,
    icon: zone.icon,
    allowsContainers: zone.allowsContainers,
    containerIds: [],
    inspectionHistory: [],
  };
}

export function buildVehicleLayout(template: VehicleLayoutTemplate): VehicleLayout {
  const definition = getVehicleLayoutDefinition(template);
  return {
    template,
    areas: definition.zones.map(buildVehicleLayoutArea),
  };
}
