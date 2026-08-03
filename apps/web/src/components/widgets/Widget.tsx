import type { ReactNode } from 'react';
import { AlertTriangle, Maximize2 } from 'lucide-react';
import { Button, EmptyState, LiveDot, SkeletonRows, Surface, cn } from '@aegisdrive/ui';
import { ApiError } from '@/lib/api-client';

export interface WidgetProps {
  title: string;
  /** One-line context under the title. Keep it short; this is chrome, not content. */
  subtitle?: string;
  /** Filters, menus, counts. Rendered at the top-right. */
  actions?: ReactNode;
  /** Shows the pulsing live indicator. Only pass when data genuinely streams. */
  live?: boolean;
  /** Renders the panel in alarm styling. */
  alarm?: boolean;

  // Data state. A widget passes these straight from its query.
  isLoading?: boolean;
  error?: unknown;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
  skeletonRows?: number;

  /** Body scrolls internally rather than growing the grid row. */
  scrollBody?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * The frame every dashboard widget renders inside.
 *
 * It owns the four states a data panel can be in — loading, error, empty,
 * ready — so no widget re-implements them and no widget can accidentally render
 * nothing on failure. That last case is the reason this exists: a control-room
 * panel that silently shows an empty list when its request failed is worse than
 * one that shows an error, because an operator reads "no threats" instead of
 * "unknown".
 *
 * Widgets stay presentational. This frame holds no data logic of its own.
 */
export function Widget({
  title,
  subtitle,
  actions,
  live = false,
  alarm = false,
  isLoading = false,
  error,
  isEmpty = false,
  emptyTitle = 'No data',
  emptyDescription,
  onRetry,
  skeletonRows = 4,
  scrollBody = true,
  className,
  children,
}: WidgetProps) {
  return (
    <Surface
      elevation="glass"
      padding="none"
      holo
      alarm={alarm}
      className={cn('flex min-h-0 flex-col overflow-hidden', className)}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold tracking-tight text-ink-primary">
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-0.5 truncate text-[11px] text-ink-tertiary">{subtitle}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {live ? <LiveDot label="Live" /> : null}
        </div>
      </header>

      <div
        className={cn(
          'min-h-0 flex-1 px-4 py-3',
          scrollBody ? 'overflow-y-auto' : 'overflow-hidden',
        )}
      >
        <WidgetBody
          isLoading={isLoading}
          error={error}
          isEmpty={isEmpty}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          onRetry={onRetry}
          skeletonRows={skeletonRows}
        >
          {children}
        </WidgetBody>
      </div>
    </Surface>
  );
}

function WidgetBody({
  isLoading,
  error,
  isEmpty,
  emptyTitle,
  emptyDescription,
  onRetry,
  skeletonRows,
  children,
}: Pick<
  WidgetProps,
  'isLoading' | 'error' | 'isEmpty' | 'emptyTitle' | 'emptyDescription' | 'onRetry' | 'skeletonRows'
> & { children: ReactNode }) {
  if (isLoading) return <SkeletonRows rows={skeletonRows ?? 4} className="h-8" />;

  if (error) {
    const message =
      error instanceof ApiError || error instanceof Error
        ? error.message
        : 'This panel could not load its data.';

    return (
      <EmptyState
        icon={<AlertTriangle className="size-4 text-signal-critical" aria-hidden />}
        title="Unavailable"
        description={message}
        action={
          onRetry ? (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Retry
            </Button>
          ) : undefined
        }
      />
    );
  }

  if (isEmpty) {
    return <EmptyState title={emptyTitle ?? 'No data'} description={emptyDescription} />;
  }

  return children;
}

/** Standard expand affordance for widgets that have a fuller page elsewhere. */
export function WidgetExpandAction({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-6 place-items-center rounded text-ink-tertiary transition-colors hover:bg-white/6 hover:text-ink-secondary"
    >
      <Maximize2 className="size-3.5" aria-hidden />
    </button>
  );
}
