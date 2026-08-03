import { Suspense, type ComponentType } from 'react';
import { SkeletonRows, cn } from '@aegisdrive/ui';
import type { Permission } from '@aegisdrive/types';
import { useAuthStore } from '@/stores/auth.store';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Widget } from './Widget';

/**
 * A widget as the registry describes it.
 *
 * Layout is data, not markup: the dashboard is an array of these, so
 * reordering panels, granting a role a different view, or letting an operator
 * save a personal layout are all changes to a value rather than to JSX.
 */
export interface WidgetDefinition {
  id: string;
  /** Rendered by the widget itself, so it can add live counts to its own title. */
  component: ComponentType;
  /** Hidden when the principal lacks every listed permission. */
  permissions: readonly Permission[];
  /** Columns spanned on a 12-column grid, per breakpoint. */
  span: { base: number; md: number; xl: number };
  /** Grid rows spanned. Row height is fixed so panels align across the board. */
  rowSpan?: number;
}

export interface WidgetGridProps {
  widgets: readonly WidgetDefinition[];
  className?: string;
}

/**
 * Tailwind cannot see interpolated class names, so spans map to complete
 * literals. A `col-span-${n}` template would compile locally and produce an
 * unstyled grid in a production build.
 */
const COL_SPAN: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
  5: 'col-span-5',
  6: 'col-span-6',
  7: 'col-span-7',
  8: 'col-span-8',
  9: 'col-span-9',
  10: 'col-span-10',
  11: 'col-span-11',
  12: 'col-span-12',
};

const MD_COL_SPAN: Record<number, string> = {
  1: 'md:col-span-1',
  2: 'md:col-span-2',
  3: 'md:col-span-3',
  4: 'md:col-span-4',
  5: 'md:col-span-5',
  6: 'md:col-span-6',
  7: 'md:col-span-7',
  8: 'md:col-span-8',
  9: 'md:col-span-9',
  10: 'md:col-span-10',
  11: 'md:col-span-11',
  12: 'md:col-span-12',
};

const XL_COL_SPAN: Record<number, string> = {
  1: 'xl:col-span-1',
  2: 'xl:col-span-2',
  3: 'xl:col-span-3',
  4: 'xl:col-span-4',
  5: 'xl:col-span-5',
  6: 'xl:col-span-6',
  7: 'xl:col-span-7',
  8: 'xl:col-span-8',
  9: 'xl:col-span-9',
  10: 'xl:col-span-10',
  11: 'xl:col-span-11',
  12: 'xl:col-span-12',
};

const ROW_SPAN: Record<number, string> = {
  1: 'row-span-1',
  2: 'row-span-2',
  3: 'row-span-3',
  4: 'row-span-4',
};

/**
 * Renders a dashboard from its descriptor.
 *
 * Each cell is independently error-bounded, so one widget throwing leaves the
 * other fourteen on screen. In a security operations centre, a dashboard that
 * blanks because the evidence panel had a bad render is a far worse outcome
 * than one panel showing an error.
 */
export function WidgetGrid({ widgets, className }: WidgetGridProps) {
  const canAny = useAuthStore((state) => state.canAny);

  const visible = widgets.filter((widget) => canAny(widget.permissions));

  return (
    <div
      className={cn(
        'grid auto-rows-[minmax(0,var(--widget-row-height))] grid-cols-1 gap-4 md:grid-cols-12',
        className,
      )}
      style={{ '--widget-row-height': '13rem' } as React.CSSProperties}
    >
      {visible.map((widget) => {
        const Component = widget.component;

        return (
          <div
            key={widget.id}
            className={cn(
              'min-h-0',
              COL_SPAN[1],
              MD_COL_SPAN[widget.span.md] ?? 'md:col-span-6',
              XL_COL_SPAN[widget.span.xl] ?? 'xl:col-span-4',
              ROW_SPAN[widget.rowSpan ?? 1] ?? 'row-span-1',
            )}
          >
            <ErrorBoundary
              fallback={(error, reset) => (
                <Widget
                  title="Widget failed"
                  alarm
                  error={error}
                  onRetry={reset}
                  scrollBody={false}
                >
                  {null}
                </Widget>
              )}
            >
              <Suspense fallback={<SkeletonRows rows={3} className="h-8" />}>
                <Component />
              </Suspense>
            </ErrorBoundary>
          </div>
        );
      })}
    </div>
  );
}
