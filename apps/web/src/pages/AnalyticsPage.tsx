import { PageHeader, Panel, StatTile, Surface } from '@aegisdrive/ui';
import { humaniseEnum, relativeTime } from '@aegisdrive/shared';
import { useAnalyticsSummary } from '@/features/dashboard/dashboard.queries';
import { QueryState } from '@/components/common/QueryState';

/**
 * Analytics.
 *
 * Renders the real aggregates the API computes today. Charts are deliberately
 * absent until there is enough operational history for a trend line to mean
 * something — a sparkline over four data points is decoration, not analysis.
 */
export function AnalyticsPage() {
  const summary = useAnalyticsSummary();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Intelligence"
        title="Analytics"
        description="Operational aggregates across the fleet, incidents and unacknowledged threats."
      />

      <QueryState
        isLoading={summary.isLoading}
        error={summary.error}
        onRetry={() => void summary.refetch()}
      >
        {summary.data && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatTile
                label="Average fleet risk"
                value={`${summary.data.averageRiskScore}/100`}
                caption="composite across all vehicles"
              />
              <StatTile
                label="Open incidents"
                value={summary.data.openIncidentsBySeverity.reduce(
                  (sum, row) => sum + row.count,
                  0,
                )}
                caption="across all severities"
              />
              <StatTile
                label="Unacknowledged threats"
                value={summary.data.unacknowledgedThreatsByLevel.reduce(
                  (sum, row) => sum + row.count,
                  0,
                )}
                caption="awaiting analyst review"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Panel title="Vehicles by status">
                <BreakdownList
                  rows={summary.data.vehiclesByStatus.map((row) => ({
                    label: humaniseEnum(row.status),
                    count: row.count,
                  }))}
                />
              </Panel>

              <Panel title="Open incidents by severity">
                <BreakdownList
                  rows={summary.data.openIncidentsBySeverity.map((row) => ({
                    label: humaniseEnum(row.severity),
                    count: row.count,
                  }))}
                />
              </Panel>

              <Panel title="Threats by level">
                <BreakdownList
                  rows={summary.data.unacknowledgedThreatsByLevel.map((row) => ({
                    label: humaniseEnum(row.level),
                    count: row.count,
                  }))}
                />
              </Panel>
            </div>

            <p className="text-xs text-ink-tertiary">
              Generated {relativeTime(summary.data.generatedAt)}. Unlike the dashboard header, this
              page is uncached — correctness over latency.
            </p>
          </div>
        )}
      </QueryState>
    </div>
  );
}

interface BreakdownRow {
  label: string;
  count: number;
}

/** Proportional bars. The widest row anchors the scale, not an arbitrary maximum. */
function BreakdownList({ rows }: { rows: BreakdownRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-ink-tertiary">No data in this dimension yet.</p>;
  }

  const peak = Math.max(...rows.map((row) => row.count), 1);

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label}>
          <Surface elevation="flat" padding="sm">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-secondary">{row.label}</span>
              <span data-numeric className="font-semibold text-ink-primary">
                {row.count}
              </span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-pill bg-white/6">
              <div
                className="h-full rounded-pill bg-aegis-500"
                style={{ width: `${(row.count / peak) * 100}%` }}
              />
            </div>
          </Surface>
        </li>
      ))}
    </ul>
  );
}
