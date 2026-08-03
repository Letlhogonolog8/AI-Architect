import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * The layering primitive every panel in the product is built from.
 *
 * Three elevations only. More than three and depth stops reading as hierarchy
 * and starts reading as noise.
 */
const surfaceVariants = cva('relative rounded-panel', {
  variants: {
    elevation: {
      /** Flush with the page. Grouping without visual weight. */
      flat: 'bg-surface/60 border border-hairline',
      /** The default card. Translucent, blurred, sits above the page. */
      glass: 'glass shadow-panel',
      /** Modals, popovers, the alert rail. Opaque enough to read over the map. */
      raised: 'glass-strong shadow-raised',
    },
    padding: {
      none: 'p-0',
      sm: 'p-4',
      md: 'p-5',
      lg: 'p-7',
    },
    /** Adds the accent hairline along the top edge. */
    holo: {
      true: 'holo-edge',
      false: '',
    },
    /** Pulls attention to a panel showing a live critical condition. */
    alarm: {
      true: 'border-signal-critical/40 shadow-alarm',
      false: '',
    },
  },
  defaultVariants: { elevation: 'glass', padding: 'md', holo: false, alarm: false },
});

export interface SurfaceProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof surfaceVariants> {}

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { className, elevation, padding, holo, alarm, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(surfaceVariants({ elevation, padding, holo, alarm }), className)}
      {...props}
    />
  );
});

/**
 * `title` is widened from the DOM's `string` tooltip attribute to `ReactNode`,
 * so it has to be omitted from the base before being redeclared.
 */
export interface PanelProps extends Omit<SurfaceProps, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  /** Rendered at the top-right: filters, menus, live indicators. */
  actions?: ReactNode;
  /** Rendered under a hairline at the bottom of the panel. */
  footer?: ReactNode;
}

/** A `Surface` with the standard title / actions / body / footer composition. */
export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { title, description, actions, footer, children, className, padding = 'none', ...props },
  ref,
) {
  const hasHeader = Boolean(title || description || actions);

  return (
    <Surface ref={ref} padding={padding} className={cn('flex flex-col', className)} {...props}>
      {hasHeader ? (
        <header className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
          <div className="min-w-0">
            {title ? (
              <h2 className="truncate text-sm font-semibold tracking-tight text-ink-primary">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-xs leading-relaxed text-ink-tertiary">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}

      <div className={cn('min-h-0 flex-1', hasHeader ? 'px-5 pb-5' : 'p-5')}>{children}</div>

      {footer ? (
        <footer className="border-t border-hairline px-5 py-3 text-xs text-ink-tertiary">
          {footer}
        </footer>
      ) : null}
    </Surface>
  );
});

export { surfaceVariants };
