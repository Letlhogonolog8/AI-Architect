import { THREAT_TOKENS } from '../tokens';
import { cn } from '../lib/cn';
import type { ThreatLevel } from '@aegisdrive/types';

export interface ThreatGaugeProps {
  /** 0-100 composite risk score. */
  score: number;
  level: ThreatLevel;
  label?: string;
  size?: number;
  className?: string;
}

const STROKE = 6;

/**
 * Radial risk gauge.
 *
 * Hand-rolled SVG rather than a charting dependency: it renders once per
 * vehicle card, so pulling in a chart runtime for a single arc would cost more
 * than it saves. The arc sweeps 270°, leaving a gap at the bottom for the value.
 */
export function ThreatGauge({ score, level, label, size = 96, className }: ThreatGaugeProps) {
  const clamped = Math.min(100, Math.max(0, score));
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcFraction = 0.75;
  const arcLength = circumference * arcFraction;
  const progress = arcLength * (clamped / 100);
  const token = THREAT_TOKENS[level];

  return (
    <div className={cn('relative inline-grid place-items-center', className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label ?? 'Risk score'}: ${clamped} of 100, ${token.label}`}
        className="-rotate-[225deg]"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          className="text-white/6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          className={cn('transition-[stroke-dasharray] duration-700 ease-out-expo', token.text)}
        />
      </svg>

      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p data-numeric className={cn('text-xl font-semibold', token.text)}>
            {clamped}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-widest text-ink-tertiary">
            {label ?? token.label}
          </p>
        </div>
      </div>
    </div>
  );
}
