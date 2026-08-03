import { cn } from '@aegisdrive/ui';

interface LoadingScreenProps {
  label?: string;
  /** `inline` fills its container; `full` covers the viewport. */
  variant?: 'inline' | 'full';
}

export function LoadingScreen({ label = 'Loading', variant = 'full' }: LoadingScreenProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'grid place-items-center',
        variant === 'full' ? 'min-h-dvh grid-backdrop' : 'min-h-64',
      )}
    >
      <div className="flex flex-col items-center gap-4">
        <span
          aria-hidden
          className="size-10 animate-spin rounded-full border-2 border-aegis-500/25 border-t-aegis-400"
        />
        <p className="text-overline font-semibold uppercase text-ink-tertiary">{label}</p>
      </div>
    </div>
  );
}
