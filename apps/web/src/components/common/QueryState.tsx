import type { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { Button, EmptyState, SkeletonRows } from '@aegisdrive/ui';
import { ApiError } from '@/lib/api-client';

interface QueryStateProps {
  isLoading: boolean;
  error: unknown;
  /** When true and not loading, the empty state is shown instead of children. */
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRetry?: () => void;
  skeletonRows?: number;
  children: ReactNode;
}

/**
 * The loading / error / empty / ready ladder, in one place.
 *
 * Every list screen has the same four states, and hand-rolling them per page is
 * how a product ends up with four different spinners and one screen that
 * silently renders nothing on failure.
 */
export function QueryState({
  isLoading,
  error,
  isEmpty = false,
  emptyTitle = 'Nothing to show yet',
  emptyDescription,
  emptyAction,
  onRetry,
  skeletonRows = 6,
  children,
}: QueryStateProps) {
  if (isLoading) return <SkeletonRows rows={skeletonRows} />;

  if (error) {
    const isApiError = error instanceof ApiError;

    return (
      <EmptyState
        size="full"
        icon={<AlertTriangle className="size-5 text-signal-critical" aria-hidden />}
        title={isApiError ? error.message : 'Could not load this data'}
        description={
          isApiError && error.requestId
            ? `Reference ${error.requestId} when reporting this.`
            : 'The request did not complete. Check your connection and try again.'
        }
        action={
          onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Retry
            </Button>
          ) : undefined
        }
      />
    );
  }

  if (isEmpty) {
    return (
      <EmptyState
        icon={<Inbox className="size-5" aria-hidden />}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return children;
}
