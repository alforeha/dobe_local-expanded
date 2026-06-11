// ─────────────────────────────────────────
// RadarChart — shared SVG radar/spider chart (GASTRO HUB A4).
// Generic over axis sets: consumers map axes to food groups, nutritional
// categories, or anything else (value vs max per axis). All colors via
// tokens — series uses the accent token, grid/labels use gray classes.
// ─────────────────────────────────────────

export interface RadarAxisDatum {
  key: string;
  label: string;
  /** Current value along the axis (e.g. consumed today). */
  value: number;
  /** Target / 100% reference for the axis (e.g. recommended daily value). */
  max: number;
}

interface RadarChartProps {
  /** Axis set — minimum 3 axes to form a polygon. */
  axes: RadarAxisDatum[];
  /** Rendered width/height in px. Defaults to 180. */
  size?: number;
  /** Number of concentric grid rings. Defaults to 4. */
  rings?: number;
  /** Values are clamped at this multiple of max so overshoot stays readable. Defaults to 1.25. */
  overshootCap?: number;
  showLabels?: boolean;
  className?: string;
  /** Accessible title for the chart. */
  title?: string;
}

function polarPoint(center: number, radius: number, index: number, count: number): [number, number] {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  return [center + radius * Math.cos(angle), center + radius * Math.sin(angle)];
}

function toPoints(coords: Array<[number, number]>): string {
  return coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

/**
 * Radar chart — values are normalized per axis (value / max) so heterogeneous
 * units (g, mg, servings) share one polygon. The outer ring is 100% of each
 * axis target.
 */
export function RadarChart({
  axes,
  size = 180,
  rings = 4,
  overshootCap = 1.25,
  showLabels = true,
  className,
  title,
}: RadarChartProps) {
  if (axes.length < 3) return null;

  const labelPad = showLabels ? 26 : 8;
  const center = size / 2;
  const radius = center - labelPad;
  /** Radius representing 100% of an axis target — leaves headroom for overshoot. */
  const targetRadius = radius / overshootCap;
  const count = axes.length;

  const ringPolygons = Array.from({ length: rings }, (_, ringIndex) => {
    const r = (targetRadius * (ringIndex + 1)) / rings;
    return toPoints(axes.map((_, axisIndex) => polarPoint(center, r, axisIndex, count)));
  });

  const seriesPoints = toPoints(
    axes.map((axis, index) => {
      const ratio = axis.max > 0 ? Math.min(axis.value / axis.max, overshootCap) : 0;
      return polarPoint(center, targetRadius * ratio, index, count);
    }),
  );

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={title ?? 'Radar chart'}
      className={className}
    >
      {title ? <title>{title}</title> : null}

      {/* Grid rings + axis spokes */}
      <g className="text-gray-300 dark:text-gray-600" aria-hidden="true">
        {ringPolygons.map((points, index) => (
          <polygon
            key={`ring-${index}`}
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth={index === rings - 1 ? 1.2 : 0.6}
            opacity={index === rings - 1 ? 0.9 : 0.55}
          />
        ))}
        {axes.map((axis, index) => {
          const [x, y] = polarPoint(center, targetRadius, index, count);
          return (
            <line
              key={`spoke-${axis.key}`}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="currentColor"
              strokeWidth={0.6}
              opacity={0.55}
            />
          );
        })}
      </g>

      {/* Value polygon */}
      <g className="text-accent">
        <polygon
          points={seriesPoints}
          fill="currentColor"
          fillOpacity={0.25}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        {axes.map((axis, index) => {
          const ratio = axis.max > 0 ? Math.min(axis.value / axis.max, overshootCap) : 0;
          const [x, y] = polarPoint(center, targetRadius * ratio, index, count);
          return <circle key={`dot-${axis.key}`} cx={x} cy={y} r={2} fill="currentColor" />;
        })}
      </g>

      {/* Axis labels */}
      {showLabels && (
        <g className="text-gray-500 dark:text-gray-400" aria-hidden="true">
          {axes.map((axis, index) => {
            const [x, y] = polarPoint(center, radius + 10, index, count);
            const anchor =
              Math.abs(x - center) < 4 ? 'middle' : x > center ? 'start' : 'end';
            return (
              <text
                key={`label-${axis.key}`}
                x={x}
                y={y + 3}
                textAnchor={anchor}
                fill="currentColor"
                fontSize={8}
              >
                {axis.label}
              </text>
            );
          })}
        </g>
      )}
    </svg>
  );
}
