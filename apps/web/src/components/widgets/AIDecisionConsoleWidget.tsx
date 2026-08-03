import { useMemo, useState } from 'react';
import { AlertOctagon, BrainCircuit, Check, ChevronDown, X } from 'lucide-react';
import {
  AIDecisionStatus,
  AutonomyLevel,
  type AIDecision,
  type AIRecommendedAction,
} from '@aegisdrive/types';
import { Badge, Button, StatusPill, cn } from '@aegisdrive/ui';
import { humaniseEnum, relativeTime } from '@aegisdrive/shared';
import {
  useAIDecisions,
  useResolveAIDecision,
} from '@/features/command-centre/command-centre.queries';
import { useCommandCentreStore } from '@/stores/command-centre.store';
import { useAuthStore } from '@/stores/auth.store';
import { Widget } from './Widget';

/**
 * AI decision console.
 *
 * The human-in-the-loop surface: every model recommendation that needs a person
 * to accept, reject or ignore it.
 *
 * Three rules are enforced here, and each exists because the alternative is
 * dangerous rather than merely untidy:
 *
 *   1. **Rationale is always visible before the action.** An operator must not
 *      be able to accept a recommendation to immobilise a moving vehicle
 *      without seeing what the model based it on.
 *   2. **Actions are gated on the operator's own permission.** The control is
 *      disabled with the reason stated, not hidden — an operator who cannot see
 *      why an option is missing escalates to someone who can.
 *   3. **Destructive actions require explicit confirmation.** One click cannot
 *      immobilise a vehicle on a highway.
 */
export function AIDecisionConsoleWidget() {
  const query = useAIDecisions(20);
  const liveDecisions = useCommandCentreStore((state) => state.decisions);
  const resolve = useResolveAIDecision();

  const decisions = useMemo(() => {
    const merged = new Map<string, AIDecision>();
    for (const decision of query.data ?? []) merged.set(decision.id, decision);
    // Live entries supersede fetched ones with the same id.
    for (const decision of liveDecisions) merged.set(decision.id, decision);

    return [...merged.values()].sort((a, b) => {
      const aPending = a.status === AIDecisionStatus.PENDING ? 0 : 1;
      const bPending = b.status === AIDecisionStatus.PENDING ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
  }, [query.data, liveDecisions]);

  const pending = decisions.filter(
    (decision) => decision.status === AIDecisionStatus.PENDING,
  ).length;

  return (
    <Widget
      title="AI decision console"
      subtitle="Model recommendations awaiting a human"
      live
      alarm={pending > 0}
      isLoading={query.isLoading && decisions.length === 0}
      error={query.error}
      isEmpty={decisions.length === 0}
      emptyTitle="No recommendations"
      emptyDescription="Model output requiring an operator decision appears here."
      onRetry={() => void query.refetch()}
      className="h-full"
      actions={
        <Badge tone={pending > 0 ? 'danger' : 'success'}>
          <BrainCircuit className="size-3" aria-hidden />
          {pending} pending
        </Badge>
      }
    >
      <ul className="space-y-2">
        {decisions.map((decision) => (
          <DecisionCard
            key={decision.id}
            decision={decision}
            isResolving={resolve.isPending}
            onResolve={(outcome, actionId) =>
              resolve.mutate({ decisionId: decision.id, outcome, actionId })
            }
          />
        ))}
      </ul>
    </Widget>
  );
}

const AUTONOMY_TONE: Record<AutonomyLevel, 'neutral' | 'accent' | 'warning'> = {
  ADVISORY: 'neutral',
  SUPERVISED: 'accent',
  AUTONOMOUS: 'warning',
};

function DecisionCard({
  decision,
  isResolving,
  onResolve,
}: {
  decision: AIDecision;
  isResolving: boolean;
  onResolve: (outcome: 'ACCEPTED' | 'REJECTED', actionId: string | null) => void;
}) {
  // Pending decisions start expanded. A recommendation an operator has to
  // click to read is a recommendation that gets missed under pressure.
  const [expanded, setExpanded] = useState(decision.status === AIDecisionStatus.PENDING);
  const [confirming, setConfirming] = useState<string | null>(null);

  const isPending = decision.status === AIDecisionStatus.PENDING;

  return (
    <li
      className={cn(
        'rounded-control border transition-colors',
        isPending ? 'border-aegis-500/25 bg-aegis-500/6' : 'border-hairline bg-white/3 opacity-70',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-start gap-2.5 px-2.5 py-2 text-left"
      >
        <StatusPill
          status={{ kind: 'severity', value: decision.severity }}
          size="sm"
          pulse={isPending && decision.severity === 'CRITICAL'}
        />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-medium text-ink-primary">
            {decision.title}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-ink-tertiary">
            <code data-numeric className="text-aegis-300">
              {decision.modelId}
            </code>
            <span aria-hidden>·</span>
            <span data-numeric>{(decision.confidence * 100).toFixed(0)}% confidence</span>
            <span aria-hidden>·</span>
            <span data-numeric>{decision.inferenceMs} ms</span>
            <span aria-hidden>·</span>
            <span>{relativeTime(decision.createdAt)}</span>
          </span>
        </span>

        <ChevronDown
          className={cn(
            'mt-0.5 size-3.5 shrink-0 text-ink-tertiary transition-transform',
            expanded && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {expanded ? (
        <div className="space-y-2.5 border-t border-hairline px-2.5 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={AUTONOMY_TONE[decision.autonomyLevel]}>
              {humaniseEnum(decision.autonomyLevel)}
            </Badge>
            <Badge tone="neutral">{humaniseEnum(decision.kind)}</Badge>
            {!isPending ? (
              <Badge tone={decision.status === AIDecisionStatus.ACCEPTED ? 'success' : 'neutral'}>
                {humaniseEnum(decision.status)}
                {decision.decidedAt ? ` · ${relativeTime(decision.decidedAt)}` : ''}
              </Badge>
            ) : null}
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-tertiary">
              Why the model concluded this
            </p>
            <ol className="mt-1.5 space-y-1">
              {decision.rationale.map((reason, index) => (
                <li
                  key={index}
                  className="flex gap-2 text-[11px] leading-relaxed text-ink-secondary"
                >
                  <span
                    data-numeric
                    aria-hidden
                    className="mt-px shrink-0 text-[10px] text-ink-tertiary"
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {reason}
                </li>
              ))}
            </ol>
          </div>

          {isPending ? (
            <div className="flex flex-wrap gap-1.5 border-t border-hairline pt-2.5">
              {decision.recommendedActions.map((action) => (
                <ActionButton
                  key={action.id}
                  action={action}
                  isConfirming={confirming === action.id}
                  isResolving={isResolving}
                  onRequestConfirm={() => setConfirming(action.id)}
                  onCancelConfirm={() => setConfirming(null)}
                  onCommit={() => {
                    setConfirming(null);
                    onResolve(action.kind === 'DISMISS' ? 'REJECTED' : 'ACCEPTED', action.id);
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function ActionButton({
  action,
  isConfirming,
  isResolving,
  onRequestConfirm,
  onCancelConfirm,
  onCommit,
}: {
  action: AIRecommendedAction;
  isConfirming: boolean;
  isResolving: boolean;
  onRequestConfirm: () => void;
  onCancelConfirm: () => void;
  onCommit: () => void;
}) {
  const canAny = useAuthStore((state) => state.canAny);
  const permitted = canAny([action.permission]);

  if (!permitted) {
    // Disabled with the reason stated, not hidden. An operator who can see the
    // action exists knows to escalate; one who cannot see it assumes the
    // platform has no answer.
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled
        title={`Requires the ${action.permission} permission`}
        className="cursor-not-allowed"
      >
        {action.label}
      </Button>
    );
  }

  if (isConfirming) {
    return (
      <span className="flex items-center gap-1.5 rounded-control border border-signal-critical/40 bg-signal-critical/10 px-2 py-1">
        <span className="flex items-center gap-1 text-[10px] font-medium text-signal-critical">
          <AlertOctagon className="size-3" aria-hidden />
          Confirm?
        </span>
        <Button size="sm" variant="danger" loading={isResolving} onClick={onCommit}>
          <Check className="size-3" aria-hidden />
          Yes
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancelConfirm}>
          <X className="size-3" aria-hidden />
        </Button>
      </span>
    );
  }

  return (
    <Button
      size="sm"
      variant={action.destructive ? 'danger' : action.kind === 'DISMISS' ? 'ghost' : 'primary'}
      loading={isResolving && !action.destructive}
      onClick={action.destructive ? onRequestConfirm : onCommit}
    >
      {action.label}
    </Button>
  );
}
