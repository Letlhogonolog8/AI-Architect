import { useState } from 'react';
import { Button, PageHeader, Panel } from '@aegisdrive/ui';
import { cn } from '@aegisdrive/ui';
import { useIncidents } from '@/features/incidents/incident.queries';
import { IncidentTable } from '@/components/domain/IncidentTable';
import { QueryState } from '@/components/common/QueryState';

type Scope = 'open' | 'all';

export function IncidentsPage() {
  const [scope, setScope] = useState<Scope>('open');
  const [page, setPage] = useState(1);

  const incidents = useIncidents({
    openOnly: scope === 'open' ? true : undefined,
    page,
    pageSize: 25,
  });

  const meta = incidents.data?.meta;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operations"
        title="Incidents"
        description="Detection through to resolution, with the full operator timeline behind each record."
        toolbar={
          <div
            role="tablist"
            aria-label="Incident scope"
            className="inline-flex gap-1 rounded-control border border-hairline bg-white/4 p-1"
          >
            {(['open', 'all'] as const).map((value) => (
              <button
                key={value}
                role="tab"
                type="button"
                aria-selected={scope === value}
                onClick={() => {
                  setScope(value);
                  setPage(1);
                }}
                className={cn(
                  'rounded-[7px] px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                  scope === value
                    ? 'bg-aegis-500/15 text-aegis-100'
                    : 'text-ink-tertiary hover:text-ink-secondary',
                )}
              >
                {value === 'open' ? 'Requires attention' : 'All incidents'}
              </button>
            ))}
          </div>
        }
      />

      <Panel
        title={meta ? `${meta.totalItems} incidents` : 'Incidents'}
        footer={
          meta && meta.totalPages > 1 ? (
            <div className="flex items-center justify-between">
              <span>
                Page {meta.page} of {meta.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!meta.hasPreviousPage}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!meta.hasNextPage}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        <QueryState
          isLoading={incidents.isLoading}
          error={incidents.error}
          isEmpty={incidents.data?.items.length === 0}
          emptyTitle={scope === 'open' ? 'Nothing requires attention' : 'No incidents recorded'}
          emptyDescription={
            scope === 'open'
              ? 'Every detected incident has been triaged and closed.'
              : 'Incidents raised by the detection models or by operators appear here.'
          }
          onRetry={() => void incidents.refetch()}
        >
          <IncidentTable incidents={incidents.data?.items ?? []} />
        </QueryState>
      </Panel>
    </div>
  );
}
