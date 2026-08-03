import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * The one button.
 *
 * `danger` is reserved for irreversible operational actions (immobilise,
 * purge evidence) so that colour alone signals consequence in a control room
 * where operators act under time pressure.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap select-none',
    'font-medium tracking-tight',
    'rounded-control border',
    'transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out-expo',
    'active:translate-y-px',
    'disabled:pointer-events-none disabled:opacity-40',
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-aegis-500 border-aegis-400/60 text-white shadow-glow hover:bg-aegis-400 hover:border-aegis-300/70',
        secondary:
          'bg-white/6 border-hairline text-ink-primary hover:bg-white/10 hover:border-hairline-strong',
        ghost:
          'bg-transparent border-transparent text-ink-secondary hover:bg-white/6 hover:text-ink-primary',
        outline:
          'bg-transparent border-hairline-strong text-aegis-200 hover:bg-aegis-500/10 hover:text-aegis-100',
        danger:
          'bg-signal-critical/90 border-signal-critical text-white shadow-alarm hover:bg-signal-critical',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10 p-0',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md', block: false },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Rendered before the label. Pass any icon element; the package stays icon-library agnostic. */
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  /** Replaces the leading icon with a spinner and blocks interaction. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    block,
    leadingIcon,
    trailingIcon,
    loading,
    disabled,
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        leadingIcon
      )}
      {children}
      {trailingIcon}
    </button>
  );
});

export { buttonVariants };
