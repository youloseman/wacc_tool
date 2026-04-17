interface BetaSparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}

type Trend = 'falling' | 'rising' | 'stable';

const COLORS: Record<Trend, { line: string; area: string }> = {
  falling: { line: '#2D6A4F', area: 'rgba(45,106,79,0.10)' },
  rising: { line: '#D97706', area: 'rgba(217,119,6,0.10)' },
  stable: { line: '#6B8F71', area: 'rgba(107,143,113,0.10)' },
};

function getTrend(first: number, last: number): Trend {
  if (last < first - 0.05) return 'falling';
  if (last > first + 0.05) return 'rising';
  return 'stable';
}

const ARROW: Record<Trend, string> = { falling: '↓', rising: '↑', stable: '→' };

export function BetaSparkline({
  values,
  width = 64,
  height = 20,
  className,
}: BetaSparklineProps) {
  if (values.length === 0) return null;

  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const first = values[0];
  const last = values[values.length - 1];
  const trend = getTrend(first, last);
  const { line: lineColor, area: areaColor } = COLORS[trend];

  const tooltip = `β ${first.toFixed(2)} → ${last.toFixed(2)} ${ARROW[trend]} (${values.length} quarters)`;

  if (values.length === 1) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={tooltip}
        className={className}
      >
        <title>{tooltip}</title>
        <circle cx={width / 2} cy={height / 2} r={2} fill={lineColor} />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * w;
    const y = pad + (1 - (v - min) / range) * h;
    return [x, y] as const;
  });

  const linePoints = points.map(([x, y]) => `${x},${y}`).join(' ');
  const areaPoints =
    linePoints + ` ${points[points.length - 1][0]},${pad + h} ${points[0][0]},${pad + h}`;

  const lastPt = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={tooltip}
      className={className}
    >
      <title>{tooltip}</title>
      <polygon points={areaPoints} fill={areaColor} />
      <polyline points={linePoints} fill="none" stroke={lineColor} strokeWidth={1.2} />
      <circle cx={lastPt[0]} cy={lastPt[1]} r={2} fill={lineColor} />
    </svg>
  );
}
