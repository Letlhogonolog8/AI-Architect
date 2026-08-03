import { cn } from '../lib/cn';

export interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function Separator({ orientation = 'horizontal', className }: SeparatorProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'bg-hairline',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
    />
  );
}

/** Live-data indicator used in panel headers next to streaming content. */
export function LiveDot({ className, label = 'Live' }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-hologram',
        className,
      )}
    >
      <span aria-hidden className="size-1.5 animate-pulse-ring rounded-full bg-hologram" />
      {label}
    </span>
  );
}
