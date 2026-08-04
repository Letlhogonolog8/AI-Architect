import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { StatusPill } from '@aegisdrive/ui';
import { humaniseEnum, relativeTime } from '@aegisdrive/shared';
import type { Incident } from '@aegisdrive/types';
import { routes } from '@/config/routes';

interface IncidentTableProps {
  incidents: Incident[];
}

/**
 * Incident list.
 *
 * A semantic `<table>` rather than a grid of divs: operators sort, scan
 * columns and use screen readers, all of which depend on real table semantics.
 * The whole row is a link target via the reference cell, so the click area is
 * generous without nesting interactive elements inside each other.
 */
export function IncidentTable({ incidents }: IncidentTableProps) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-hairline text-left">
            <th
              scope="col"
              className="px-5 py-2 text-overline font-semibold uppercase text-ink-tertiary"
            >
              Reference
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-overline font-semibold uppercase text-ink-tertiary"
            >
              Type
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-overline font-semibold uppercase text-ink-tertiary"
            >
              Severity
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-overline font-semibold uppercase text-ink-tertiary"
            >
              Status
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-overline font-semibold uppercase text-ink-tertiary"
            >
              Detected
            </th>
            <th scope="col" className="px-5 py-2">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {incidents.map((incident) => (
            <tr
              key={incident.id}
              className="group border-b border-hairline/60 transition-colors last:border-0 hover:bg-white/3"
            >
              <td className="px-5 py-3">
                <Link
                  to={routes.incidentDetail(incident.id)}
                  className="block focus:outline-none focus-visible:underline"
                >
                  <span data-numeric className="text-xs font-semibold text-aegis-200">
                    {incident.reference}
                  </span>
                  <span className="mt-0.5 block max-w-xs truncate text-xs text-ink-secondary">
                    {incident.title}
                  </span>
                </Link>
              </td>

              <td className="px-3 py-3 text-xs text-ink-secondary">
                {humaniseEnum(incident.type)}
              </td>

              <td className="px-3 py-3">
                <StatusPill
                  status={{ kind: 'severity', value: incident.severity }}
                  size="sm"
                  pulse={incident.severity === 'CRITICAL'}
                />
              </td>

              <td className="px-3 py-3">
                <StatusPill status={{ kind: 'incident', value: incident.status }} size="sm" />
              </td>

              <td className="px-3 py-3 text-xs text-ink-tertiary">
                {relativeTime(incident.detectedAt)}
              </td>

              <td className="px-5 py-3 text-right">
                <ChevronRight
                  className="inline size-4 text-ink-tertiary transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
