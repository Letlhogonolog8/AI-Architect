import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/**
 * Loading placeholder. A sweeping highlight rather than an opacity pulse — on a
 * dark theme, pulsing blocks read as flickering data.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn('relative overflow-hidden rounded-control bg-white/5', className)}
      {...props}
    >
      <span className="absolute inset-y-0 -left-full w-full animate-sweep bg-gradient-to-r from-transparent via-white/8 to-transparent" />
    </div>
  );
}

/** Convenience skeleton matching the height and rhythm of a table row. */
export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}
