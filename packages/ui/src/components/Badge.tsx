import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-hairline bg-white/5 text-ink-secondary',
        accent: 'border-aegis-500/25 bg-aegis-500/10 text-aegis-200',
        success: 'border-signal-success/25 bg-signal-success/10 text-signal-success',
        warning: 'border-signal-warning/25 bg-signal-warning/10 text-signal-warning',
        danger: 'border-signal-critical/35 bg-signal-critical/12 text-signal-critical',
        live: 'border-hologram/30 bg-hologram/10 text-hologram',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, tone, ...props },
  ref,
) {
  return <span ref={ref} className={cn(badgeVariants({ tone }), className)} {...props} />;
});

export { badgeVariants };
