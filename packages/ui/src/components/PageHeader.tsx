import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface PageHeaderProps {
  /** Small uppercase context line, e.g. `Operations`. */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Primary and secondary actions, right-aligned on wide viewports. */
  actions?: ReactNode;
  /** Tabs or filters, rendered under a hairline. */
  toolbar?: ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  toolbar,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('space-y-4', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          {eyebrow ? (
            <p className="text-overline font-semibold uppercase text-aegis-400">{eyebrow}</p>
          ) : null}
          <h1 className="text-title font-semibold text-ink-primary">{title}</h1>
          {description ? (
            <p className="max-w-2xl text-sm leading-relaxed text-ink-secondary">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {toolbar ? <div className="border-t border-hairline pt-4">{toolbar}</div> : null}
    </header>
  );
}
