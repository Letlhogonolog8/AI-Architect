import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Surface } from '@aegisdrive/ui';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Rendered instead of the default panel when provided. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time exceptions so one broken panel cannot blank the whole
 * control room.
 *
 * A class component because React still offers no hook equivalent of
 * `componentDidCatch`. Note this does *not* catch errors in event handlers or
 * async code — React Query's error states cover those.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Replace with the observability sink once one is wired up; until then the
    // console is the only place this is visible, and silence would be worse.
    console.error('Unhandled render error', error, info.componentStack);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <Surface elevation="raised" padding="lg" alarm className="mx-auto my-12 max-w-lg text-center">
        <h2 className="text-sm font-semibold text-ink-primary">This panel stopped responding</h2>
        <p className="mt-2 text-xs leading-relaxed text-ink-tertiary">
          The rest of the console is unaffected. If this keeps happening, quote the time and the
          page to your administrator.
        </p>
        <p className="mt-4 rounded-control bg-black/30 p-3 text-left font-mono text-[11px] text-ink-tertiary">
          {error.message}
        </p>
        <Button variant="primary" size="sm" className="mt-5" onClick={this.reset}>
          Try again
        </Button>
      </Surface>
    );
  }
}
