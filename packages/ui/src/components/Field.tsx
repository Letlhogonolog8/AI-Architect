import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leadingIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, leadingIcon, ...props },
  ref,
) {
  return (
    <div className="relative">
      {leadingIcon ? (
        <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-ink-tertiary">
          {leadingIcon}
        </span>
      ) : null}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'h-10 w-full rounded-control border bg-white/4 px-3 text-sm text-ink-primary',
          'placeholder:text-ink-tertiary',
          'transition-colors duration-200 ease-out-expo',
          'hover:bg-white/6 focus:bg-white/6 focus:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-40',
          leadingIcon && 'pl-9',
          invalid
            ? 'border-signal-critical/50 focus:border-signal-critical'
            : 'border-hairline focus:border-aegis-500/60',
          className,
        )}
        {...props}
      />
    </div>
  );
});

export interface FieldProps {
  label: string;
  /** Guidance shown under the control while it is valid. */
  hint?: string;
  /** Replaces the hint and switches the control to the invalid style. */
  error?: string;
  required?: boolean;
  className?: string;
  /** Receives the generated id so the label and description stay associated. */
  children: (props: { id: string; describedBy: string; invalid: boolean }) => ReactNode;
}

/**
 * Label + control + message, wired for accessibility.
 *
 * The render-prop shape means the caller keeps full control of the input while
 * `Field` still owns the id generation and `aria-describedby` plumbing that is
 * easy to forget and impossible to notice when missing.
 */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const describedBy = `${id}-description`;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-xs font-medium text-ink-secondary">
        {label}
        {required ? (
          <span className="ml-1 text-signal-critical" aria-hidden>
            *
          </span>
        ) : null}
      </label>

      {children({ id, describedBy, invalid: Boolean(error) })}

      {error || hint ? (
        <p
          id={describedBy}
          role={error ? 'alert' : undefined}
          className={cn('text-xs', error ? 'text-signal-critical' : 'text-ink-tertiary')}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}
