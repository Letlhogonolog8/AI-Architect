import { useParams } from 'react-router-dom';
import { Radio } from 'lucide-react';
import { Button, PageHeader, Panel, StatusPill, Surface } from '@aegisdrive/ui';
import { humaniseEnum, relativeTime } from '@aegisdrive/shared';
import { useIncident, useIncidentTimeline } from '@/features/incidents/incident.queries';
import { QueryState } from '@/components/common/QueryState';
import { Can } from '@/features/auth/RouteGuards';

/** Timeline entry kinds are open-ended strings; unknown kinds fall back to neutral. */
const KIND_ACCENT: Record<string, string> = {
  STATUS_CHANGE: 'border-aegis-500/40',
  DISPATCH: 'border-signal-warning/40',
  AI_INFERENCE: 'border-hologram/40',
  EVIDENCE_ADDED: 'border-signal-success/40',
  NOTE: 'border-hairline',
};

export function IncidentDetailPage() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const incident = useIncident(incidentId);
  const timeline = useIncidentTimeline(incidentId);

  return (
    <QueryState
      isLoading={incident.isLoading}
      error={incident.error}
      onRetry={() => void incident.refetch()}
    >
      {incident.data && (
        <div className="space-y-8">
          <PageHeader
            eyebrow={incident.data.reference}
            title={incident.data.title}
            description={incident.data.summary}
            actions={
              <Can anyOf={['incident:dispatch']}>
                <Button
                  variant="primary"
                  size="sm"
                  leadingIcon={<Radio className="size-4" aria-hidden />}
                >
                  Dispatch responder
                </Button>
              </Can>
            }
          />

          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              status={{ kind: 'severity', value: incident.data.severity }}
              pulse={incident.data.severity === 'CRITICAL'}
            />
            <StatusPill status={{ kind: 'incident', value: incident.data.status }} />
            <span className="text-xs text-ink-tertiary">
              {humaniseEnum(incident.data.type)} · detected {relativeTime(incident.data.detectedAt)}
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <Panel
              title="Operator timeline"
              description="Append-only. Every status change, dispatch and note is retained as part of the record."
            >
              <QueryState
                isLoading={timeline.isLoading}
                error={timeline.error}
                isEmpty={timeline.data?.length === 0}
                emptyTitle="No timeline entries"
                onRetry={() => void timeline.refetch()}
                skeletonRows={4}
              >
                <ol className="space-y-3">
                  {timeline.data?.map((entry) => (
                    <li key={entry.id}>
                      <Surface
                        elevation="flat"
                        padding="sm"
                        className={`border-l-2 ${KIND_ACCENT[entry.kind] ?? 'border-hairline'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-xs text-ink-primary">{entry.message}</p>
                          <time className="shrink-0 text-[10px] uppercase tracking-widest text-ink-tertiary">
                            {relativeTime(entry.occurredAt)}
                          </time>
                        </div>
                        <p className="mt-1.5 text-[10px] uppercase tracking-widest text-ink-tertiary">
                          {humaniseEnum(entry.kind)}
                        </p>
                      </Surface>
                    </li>
                  ))}
                </ol>
              </QueryState>
            </Panel>

            <div className="space-y-4">
              <Panel title="Detection">
                <dl className="space-y-3 text-xs">
                  <div>
                    <dt className="text-ink-tertiary">Source</dt>
                    <dd className="mt-0.5 text-ink-primary">
                      {incident.data.aiConfidence === null
                        ? 'Filed by an operator'
                        : 'Raised by a detection model'}
                    </dd>
                  </div>
                  {incident.data.aiConfidence !== null && (
                    <div>
                      <dt className="text-ink-tertiary">Model confidence</dt>
                      <dd data-numeric className="mt-0.5 text-ink-primary">
                        {(incident.data.aiConfidence * 100).toFixed(1)}%
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-ink-tertiary">Acknowledged</dt>
                    <dd className="mt-0.5 text-ink-primary">
                      {incident.data.acknowledgedAt
                        ? relativeTime(incident.data.acknowledgedAt)
                        : 'Not yet'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-tertiary">Evidence artefacts</dt>
                    <dd data-numeric className="mt-0.5 text-ink-primary">
                      {incident.data.evidenceCount}
                    </dd>
                  </div>
                </dl>
              </Panel>

              {incident.data.position && (
                <Panel title="Location">
                  <dl className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-ink-tertiary">Latitude</dt>
                      <dd data-numeric className="text-ink-primary">
                        {incident.data.position.latitude.toFixed(6)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-tertiary">Longitude</dt>
                      <dd data-numeric className="text-ink-primary">
                        {incident.data.position.longitude.toFixed(6)}
                      </dd>
                    </div>
                  </dl>
                </Panel>
              )}
            </div>
          </div>
        </div>
      )}
    </QueryState>
  );
}
