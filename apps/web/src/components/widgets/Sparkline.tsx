import { useId } from 'react';

export interface SparklineProps {
  /** Oldest to newest. Fewer than two points renders nothing. */
  series: readonly number[];
  /** Stroke and fill colour. Pass a CSS custom property or any valid colour. */
  colour?: string;
  /** Horizontal reference line, e.g. an operational target. */
  target?: number | null;
  width?: number;
  height?: number;
  className?: string;
  /** Screen-reader description. Without it the chart is invisible to assistive tech. */
  label?: string;
}

/**
 * Minimal trend line.
 *
 * Hand-rolled rather than pulled from a charting library: a dashboard with
 * fifteen widgets cannot afford a chart runtime for what is a polyline and a
 * gradient fill, and every KPI tile renders one.
 *
 * The y-axis is scaled to the series' own range rather than to zero. For
 * metrics like uplink health that live between 96% and 100%, a zero-based axis
 * would flatten every real movement into a straight line.
 */
export function Sparkline({
  series,
  colour = 'var(--color-aegis-400)',
  target = null,
  width = 120,
  height = 32,
  className,
  label,
}: SparklineProps) {
  const gradientId = useId();

  if (series.length < 2) {
    return <div className={className} style={{ width, height }} aria-hidden />;
  }

  const values = target === null ? series : [...series, target];
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero; give it a nominal range so it renders
  // as a centred horizontal line rather than collapsing.
  const range = max - min || 1;

  const stepX = width / (series.length - 1);
  const toY = (value: number): number => height - ((value - min) / range) * height;

  const points = series.map(
    (value, index) => `${(index * stepX).toFixed(1)},${toY(value).toFixed(1)}`,
  );
  const line = points.join(' ');
  const area = `${line} ${width},${height} 0,${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.28" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>

      <polygon points={area} fill={`url(#${gradientId})`} />

      {target !== null ? (
        <line
          x1={0}
          y1={toY(target)}
          x2={width}
          y2={toY(target)}
          stroke="var(--color-ink-tertiary)"
          strokeOpacity={0.5}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ) : null}

      <polyline
        points={line}
        fill="none"
        stroke={colour}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {/* Head marker: the current value is the one an operator reads. */}
      <circle cx={width} cy={toY(series[series.length - 1] as number)} r={2} fill={colour} />
    </svg>
  );
}
