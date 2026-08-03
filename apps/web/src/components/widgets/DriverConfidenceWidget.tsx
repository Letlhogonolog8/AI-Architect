import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import {
  IdentityBand,
  IdentityModality,
  type IdentityAssessment,
  type ModalityContribution,
} from '@aegisdrive/types';
import { Badge, Surface, cn } from '@aegisdrive/ui';
import { humaniseEnum, relativeTime } from '@aegisdrive/shared';
import { dataSource } from '@/data';
import { queryKeys } from '@/app/query-client';
import { Widget } from './Widget';

/**
 * Driver confidence.
 *
 * Renders the Continuous Identity Engine's output for the drivers whose
 * confidence is currently lowest.
 *
 * **The contributions are the product, not a debug panel.** An operator
 * deciding whether to treat someone as an impostor must see which signals drove
 * the number — a bare "34%" invites acting on a figure nobody can interrogate,
 * and the action on the other side of that decision can put armed responders
 * next to a citizen. So every row expands to the per-modality evidence.
 */

const BAND_STYLE: Record<
  IdentityBand,
  { tone: 'success' | 'accent' | 'warning' | 'danger' | 'neutral'; icon: typeof ShieldCheck }
> = {
  VERIFIED: { tone: 'success', icon: ShieldCheck },
  PROBABLE: { tone: 'accent', icon: ShieldCheck },
  UNCERTAIN: { tone: 'neutral', icon: ShieldQuestion },
  SUSPECT: { tone: 'warning', icon: ShieldAlert },
  IMPOSTOR: { tone: 'danger', icon: ShieldAlert },
};

const BAND_MEANING: Record<IdentityBand, string> = {
  VERIFIED: 'Multiple signals agree. Normal operation.',
  PROBABLE: 'Consistent with the enrolled driver on thinner evidence.',
  UNCERTAIN: 'Not enough usable evidence — almost always a sensor issue, not an impostor.',
  SUSPECT: 'Evidence actively contradicts the enrolled driver.',
  IMPOSTOR: 'Strong evidence of a different person, or a detected spoof.',
};

export function DriverConfidenceWidget() {
  const query = useQuery({
    queryKey: queryKeys.commandCentre.identity(),
    queryFn: () => dataSource.getIdentityAssessments({ limit: 12 }),
    refetchInterval: 30_000,
  });

  const assessments = query.data ?? [];

  // Lowest confidence first: the whole point of the panel is the driver who
  // needs looking at, not a roster.
  const ranked = [...assessments].sort((a, b) => a.confidence - b.confidence);

  const flagged = ranked.filter(
    (entry) => entry.band === IdentityBand.SUSPECT || entry.band === IdentityBand.IMPOSTOR,
  ).length;

  return (
    <Widget
      title="Driver identity"
      subtitle="Continuous multi-factor confidence"
      live
      alarm={flagged > 0}
      isLoading={query.isLoading}
      error={query.error}
      isEmpty={assessments.length === 0}
      emptyTitle="No assessments yet"
      emptyDescription="Confidence scores appear once the identity engine receives observations."
      onRetry={() => void query.refetch()}
      className="h-full"
      actions={
        flagged > 0 ? (
          <Badge tone="danger">{flagged} flagged</Badge>
        ) : (
          <Badge tone="success">All verified</Badge>
        )
      }
    >
      <ul className="space-y-2">
        {ranked.map((assessment) => (
          <AssessmentRow key={assessment.id} assessment={assessment} />
        ))}
      </ul>
    </Widget>
  );
}

function AssessmentRow({ assessment }: { assessment: IdentityAssessment }) {
  const style = BAND_STYLE[assessment.band];
  const Icon = style.icon;

  const flagged =
    assessment.band === IdentityBand.SUSPECT || assessment.band === IdentityBand.IMPOSTOR;

  return (
    <li>
      <Surface
        elevation="flat"
        padding="sm"
        className={cn('space-y-2', flagged && 'border-signal-critical/35 bg-signal-critical/8')}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Icon
              className={cn(
                'size-4 shrink-0',
                flagged ? 'text-signal-critical' : 'text-ink-tertiary',
              )}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium text-ink-primary">
                {assessment.driverId
                  ? `Driver ${assessment.driverId.slice(0, 8)}`
                  : 'Unassigned driver'}
              </p>
              <p className="text-[10px] text-ink-tertiary">
                {relativeTime(assessment.assessedAt)} · {assessment.policyVersion}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <span
              data-numeric
              className={cn(
                'text-sm font-semibold',
                flagged ? 'text-signal-critical' : 'text-ink-primary',
              )}
            >
              {assessment.confidence}%
            </span>
            <Badge tone={style.tone}>{assessment.band}</Badge>
          </div>
        </div>

        {assessment.spoofDetected ? (
          <p className="rounded border border-signal-critical/40 bg-signal-critical/12 px-2 py-1 text-[10px] font-medium text-signal-critical">
            Presentation attack detected — a photograph, mask or audio replay was presented to a
            sensor. Confidence is forced to zero.
          </p>
        ) : (
          <p className="text-[10px] leading-relaxed text-ink-tertiary">
            {BAND_MEANING[assessment.band]}
          </p>
        )}

        {assessment.contributions.length > 0 ? (
          <div className="space-y-1 border-t border-hairline pt-1.5">
            {assessment.contributions
              .slice()
              .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
              .map((contribution) => (
                <ContributionBar key={contribution.modality} contribution={contribution} />
              ))}
          </div>
        ) : null}

        {assessment.occupancy?.unexpectedOccupancy ? (
          <p className="text-[10px] font-medium text-signal-warning">
            {assessment.occupancy.occupantCount} occupants detected where{' '}
            {assessment.occupancy.expectedCount} were expected.
          </p>
        ) : null}
      </Surface>
    </li>
  );
}

const MODALITY_LABEL: Record<IdentityModality, string> = {
  FACE: 'Face',
  VOICE: 'Voice',
  DEVICE: 'Device',
  BEHAVIOUR: 'Driving',
  INTERACTION: 'Touch',
  EXPLICIT: 'Confirmed',
};

/**
 * One modality's contribution, as a signed bar from centre.
 *
 * Signed rather than absolute because direction is the information: a face
 * contributing −2.1 and one contributing +2.1 are opposite claims, and a
 * magnitude-only bar would render them identically.
 */
function ContributionBar({ contribution }: { contribution: ModalityContribution }) {
  // Clamped to the largest per-modality LLR cap in the calibration table, so
  // the bar scale is stable across rows rather than rescaling per assessment.
  const magnitude = Math.min(1, Math.abs(contribution.contribution) / 4);
  const positive = contribution.contribution >= 0;

  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[10px] text-ink-tertiary">
        {MODALITY_LABEL[contribution.modality]}
      </span>

      <div className="relative h-1 flex-1 rounded-pill bg-white/6">
        {/* Centre line: contributions read left (against) or right (for). */}
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
        <div
          className={cn(
            'absolute inset-y-0 rounded-pill',
            positive ? 'left-1/2 bg-signal-success' : 'right-1/2 bg-signal-critical',
          )}
          style={{ width: `${magnitude * 50}%` }}
        />
      </div>

      <span
        data-numeric
        className="w-16 shrink-0 text-right text-[10px] text-ink-tertiary"
        title={`Score ${contribution.score.toFixed(2)}, quality ${contribution.quality.toFixed(2)}, ${Math.round(contribution.ageSeconds)}s old`}
      >
        {contribution.weight < 0.05
          ? 'stale'
          : `${positive ? '+' : ''}${contribution.contribution.toFixed(1)}`}
      </span>
    </div>
  );
}
