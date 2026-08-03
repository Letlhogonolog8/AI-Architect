import {
  FileAudio,
  FileJson,
  FileText,
  Film,
  Image,
  Lock,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { EvidenceStatus, EvidenceType, type Evidence } from '@aegisdrive/types';
import { Badge, cn } from '@aegisdrive/ui';
import { formatBytes, formatDuration, relativeTime } from '@aegisdrive/shared';
import { useRecentEvidence } from '@/features/command-centre/command-centre.queries';
import { Widget } from './Widget';

/**
 * Evidence vault.
 *
 * Recent artefacts with their seal state and checksum. The checksum is shown —
 * truncated, monospaced — because it is the anchor of the chain of custody, and
 * an operator preparing a disclosure needs to be able to quote it.
 *
 * Unsealed artefacts are visually distinct from sealed ones. An artefact whose
 * bytes have not been verified against its declared digest is not yet evidence,
 * and the interface should never let those two states look alike.
 */

const TYPE_ICON: Record<EvidenceType, LucideIcon> = {
  VIDEO: Film,
  AUDIO: FileAudio,
  IMAGE: Image,
  TELEMETRY_SNAPSHOT: FileJson,
  DOCUMENT: FileText,
  AI_INFERENCE: FileJson,
  SYSTEM_LOG: FileText,
};

const STATUS_META: Record<
  EvidenceStatus,
  { tone: 'success' | 'accent' | 'warning' | 'danger' | 'neutral'; label: string }
> = {
  PENDING_UPLOAD: { tone: 'warning', label: 'Awaiting upload' },
  UPLOADING: { tone: 'warning', label: 'Uploading' },
  SEALED: { tone: 'accent', label: 'Sealed' },
  VERIFIED: { tone: 'success', label: 'Verified' },
  CORRUPTED: { tone: 'danger', label: 'Corrupted' },
  PURGED: { tone: 'neutral', label: 'Purged' },
};

export function EvidenceVaultWidget() {
  const query = useRecentEvidence(14);
  const artefacts = query.data ?? [];

  const sealed = artefacts.filter(
    (artefact) =>
      artefact.status === EvidenceStatus.SEALED || artefact.status === EvidenceStatus.VERIFIED,
  ).length;

  const corrupted = artefacts.filter(
    (artefact) => artefact.status === EvidenceStatus.CORRUPTED,
  ).length;

  return (
    <Widget
      title="Evidence vault"
      subtitle={`${sealed} of ${artefacts.length} sealed`}
      alarm={corrupted > 0}
      isLoading={query.isLoading}
      error={query.error}
      isEmpty={artefacts.length === 0}
      emptyTitle="No evidence captured"
      emptyDescription="Artefacts attached to incidents appear here once registered."
      onRetry={() => void query.refetch()}
      className="h-full"
      actions={
        corrupted > 0 ? (
          <Badge tone="danger">{corrupted} corrupted</Badge>
        ) : (
          <Badge tone="success">
            <ShieldCheck className="size-3" aria-hidden />
            Chain intact
          </Badge>
        )
      }
    >
      <ul className="space-y-1">
        {artefacts.map((artefact) => (
          <EvidenceRow key={artefact.id} artefact={artefact} />
        ))}
      </ul>
    </Widget>
  );
}

function EvidenceRow({ artefact }: { artefact: Evidence }) {
  const Icon = TYPE_ICON[artefact.type];
  const meta = STATUS_META[artefact.status];
  const isSealed =
    artefact.status === EvidenceStatus.SEALED || artefact.status === EvidenceStatus.VERIFIED;

  return (
    <li
      className={cn(
        'flex items-center gap-2.5 rounded-control border px-2 py-1.5',
        artefact.status === EvidenceStatus.CORRUPTED
          ? 'border-signal-critical/35 bg-signal-critical/8'
          : 'border-hairline bg-white/3',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid size-6 shrink-0 place-items-center rounded',
          isSealed ? 'bg-signal-success/12 text-signal-success' : 'bg-white/6 text-ink-tertiary',
        )}
      >
        <Icon className="size-3" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-ink-primary">{artefact.label}</p>
        <p className="flex items-center gap-1 text-[10px] text-ink-tertiary">
          <span data-numeric>{formatBytes(artefact.sizeBytes)}</span>
          {artefact.durationSeconds !== null ? (
            <>
              <span aria-hidden>·</span>
              <span data-numeric>{formatDuration(artefact.durationSeconds)}</span>
            </>
          ) : null}
          <span aria-hidden>·</span>
          <span>{relativeTime(artefact.capturedAt)}</span>
        </p>
      </div>

      {isSealed ? (
        <span
          className="hidden shrink-0 items-center gap-1 font-mono text-[9px] text-ink-tertiary lg:flex"
          title={`SHA-256 ${artefact.checksum}`}
        >
          <Lock className="size-2.5" aria-hidden />
          {artefact.checksum.slice(0, 8)}
        </span>
      ) : null}

      <Badge tone={meta.tone} className="shrink-0">
        {meta.label}
      </Badge>
    </li>
  );
}
