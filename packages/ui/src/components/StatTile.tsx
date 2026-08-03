import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Surface } from './Surface';

export interface StatTileProps {
  label: string;
  /** Pre-formatted. The tile never formats; callers own units and locale. */
  value: ReactNode;
  /** Small qualifier under the value, e.g. `of 248 vehicles`. */
  caption?: ReactNode;
  icon?: ReactNode;
  /**
   * Period-over-period movement. `direction` is what the number did;
   * `isPositive` is whether that is *good*, which for incident counts is the
   * opposite of "up".
   */
  delta?: {
    value: string;
    direction: 'up' | 'down' | 'flat';
    isPositive?: boolean;
  };
  /** Renders the tile in alarm styling regardless of value. */
  alarm?: boolean;
  className?: string;
}

const DELTA_GLYPH: Record<'up' | 'down' | 'flat', string> = {
  up: '▲',
  down: '▼',
  flat: '—',
};

export function StatTile({ label, value, caption, icon, delta, alarm, className }: StatTileProps) {
  const deltaTone =
    delta === undefined || delta.direction === 'flat'
      ? 'text-ink-tertiary'
      : (delta.isPositive ?? delta.direction === 'up')
        ? 'text-signal-success'
        : 'text-signal-critical';

  return (
    <Surface holo alarm={alarm} padding="md" className={cn('animate-rise', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-overline font-semibold uppercase text-ink-tertiary">{label}</p>
        {icon ? <span className="shrink-0 text-ink-tertiary">{icon}</span> : null}
      </div>

      <p
        data-numeric
        className={cn(
          'mt-3 text-metric font-semibold',
          alarm ? 'text-signal-critical' : 'text-ink-primary',
        )}
      >
        {value}
      </p>

      <div className="mt-2 flex items-center gap-2 text-xs">
        {delta ? (
          <span className={cn('inline-flex items-center gap-1 font-medium', deltaTone)}>
            <span aria-hidden>{DELTA_GLYPH[delta.direction]}</span>
            {delta.value}
          </span>
        ) : null}
        {caption ? <span className="truncate text-ink-tertiary">{caption}</span> : null}
      </div>
    </Surface>
  );
}
