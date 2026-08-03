import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { Badge, Button, PageHeader, Panel } from '@aegisdrive/ui';
import { humaniseEnum, relativeTime } from '@aegisdrive/shared';
import type { AuditLog, Paginated } from '@aegisdrive/types';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/app/query-client';
import { QueryState } from '@/components/common/QueryState';

/** Actions worth visually flagging when an auditor scans the list. */
const HIGH_SIGNAL_ACTIONS = new Set([
  'PERMISSION_DENIED',
  'LOGIN_FAILED',
  'IMMOBILISE',
  'EXPORT',
  'DELETE',
]);

export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const filters = { page, pageSize: 50 };

  const logs = useQuery({
    queryKey: queryKeys.auditLogs.list(filters),
    queryFn: () => api.get<Paginated<AuditLog>>('/audit-logs', { query: filters }),
    placeholderData: (previous) => previous,
  });

  const meta = logs.data?.meta;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Audit logs"
        description="Immutable record of every mutation and every authorisation decision."
        actions={
          <Badge tone="accent">
            <ShieldCheck className="size-3" aria-hidden />
            Append-only
          </Badge>
        }
      />

      <Panel
        title={meta ? `${meta.totalItems} entries` : 'Audit trail'}
        description="Entries cannot be edited or deleted through any interface, including this one."
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
          isLoading={logs.isLoading}
          error={logs.error}
          isEmpty={logs.data?.items.length === 0}
          emptyTitle="No audit entries yet"
          onRetry={() => void logs.refetch()}
        >
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-hairline text-left">
                  {['When', 'Actor', 'Action', 'Resource', 'Source IP'].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-3 py-2 text-overline font-semibold uppercase text-ink-tertiary first:pl-5 last:pr-5"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {logs.data?.items.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-hairline/60 transition-colors last:border-0 hover:bg-white/3"
                  >
                    <td className="py-3 pl-5 pr-3 text-xs text-ink-tertiary">
                      {relativeTime(entry.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-xs text-ink-secondary">
                      {entry.actorEmail ?? 'System'}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={HIGH_SIGNAL_ACTIONS.has(entry.action) ? 'danger' : 'neutral'}>
                        {humaniseEnum(entry.action)}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-ink-secondary">
                      {entry.resourceType}
                      {entry.resourceId ? `/${entry.resourceId.slice(0, 8)}` : ''}
                    </td>
                    <td data-numeric className="py-3 pl-3 pr-5 text-xs text-ink-tertiary">
                      {entry.ipAddress ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryState>
      </Panel>
    </div>
  );
}
