import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  /** `quiet` for empty panels inside a populated page; `full` for empty pages. */
  size?: 'quiet' | 'full';
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  size = 'quiet',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'full' ? 'gap-4 py-20' : 'gap-3 py-12',
        className,
      )}
    >
      {icon ? (
        <div className="grid size-12 place-items-center rounded-panel border border-hairline bg-white/4 text-ink-tertiary">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink-primary">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-xs leading-relaxed text-ink-tertiary">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
