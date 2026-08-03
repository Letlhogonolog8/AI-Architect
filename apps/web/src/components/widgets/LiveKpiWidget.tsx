import { KpiTrend, type KpiMetric } from '@aegisdrive/types';
import { cn } from '@aegisdrive/ui';
import { useKpiMetrics } from '@/features/command-centre/command-centre.queries';
import { useCommandCentreStore } from '@/stores/command-centre.store';
import { Widget } from './Widget';
import { Sparkline } from './Sparkline';

/**
 * Headline operational metrics.
 *
 * Values stream over the socket; the query is the fallback that keeps the panel
 * correct if the stream is down. Live wins when present, because a KPI a minute
 * stale is a KPI that reads as broken.
 */
export function LiveKpiWidget() {
  const query = useKpiMetrics();
  const live = useCommandCentreStore((state) => state.kpis);

  const metrics = live.length > 0 ? live : (query.data ?? []);

  return (
    <Widget
      title="Live KPIs"
      subtitle="Operational health across the protected fleet"
      live={live.length > 0}
      isLoading={query.isLoading && metrics.length === 0}
      error={query.error}
      isEmpty={!query.isLoading && metrics.length === 0}
      emptyTitle="No metrics"
      onRetry={() => void query.refetch()}
      scrollBody={false}
      className="h-full"
    >
      <div className="grid h-full grid-cols-2 gap-x-5 gap-y-3 lg:grid-cols-3">
        {metrics.map((metric) => (
          <KpiTile key={metric.id} metric={metric} />
        ))}
      </div>
    </Widget>
  );
}

function KpiTile({ metric }: { metric: KpiMetric }) {
  // `isPositive` describes what a *rise* means for this metric, so the colour
  // follows meaning rather than direction. Response time going up is red even
  // though the arrow points the same way as vehicles protected going up.
  const improving =
    metric.trend === KpiTrend.FLAT ? null : (metric.trend === KpiTrend.UP) === metric.isPositive;

  const deltaColour =
    improving === null
      ? 'text-ink-tertiary'
      : improving
        ? 'text-signal-success'
        : 'text-signal-critical';

  const lineColour =
    improving === null
      ? 'var(--color-ink-tertiary)'
      : improving
        ? 'var(--color-signal-success)'
        : 'var(--color-signal-critical)';

  const missesTarget =
    metric.target !== null &&
    (metric.isPositive ? metric.value < metric.target : metric.value > metric.target);

  return (
    <div className="flex min-w-0 flex-col justify-between">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-tertiary">
        {metric.label}
      </p>

      <div className="mt-1 flex items-baseline gap-1.5">
        <span
          data-numeric
          className={cn(
            'text-2xl font-semibold leading-none',
            missesTarget ? 'text-signal-warning' : 'text-ink-primary',
          )}
        >
          {metric.value.toLocaleString()}
        </span>
        {metric.unit ? <span className="text-xs text-ink-tertiary">{metric.unit}</span> : null}
      </div>

      <div className="mt-1.5 flex items-end justify-between gap-2">
        <span className={cn('text-[11px] font-medium', deltaColour)}>
          {metric.delta === null || metric.delta === 0
            ? '—'
            : `${metric.delta > 0 ? '▲' : '▼'} ${Math.abs(metric.delta).toFixed(1)}`}
          <span className="ml-1 font-normal text-ink-tertiary">{metric.comparisonLabel}</span>
        </span>

        <Sparkline
          series={metric.series}
          colour={lineColour}
          target={metric.target}
          width={64}
          height={22}
          label={`${metric.label} trend`}
        />
      </div>
    </div>
  );
}
