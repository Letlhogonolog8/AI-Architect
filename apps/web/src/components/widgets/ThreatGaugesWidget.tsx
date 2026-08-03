import { useMemo } from 'react';
import { ThreatLevel, type ThreatLevel as ThreatLevelValue } from '@aegisdrive/types';
import { StatusPill, ThreatGauge, cn } from '@aegisdrive/ui';
import { riskScoreToThreatLevel } from '@aegisdrive/shared';
import { useFleetSnapshotQuery } from '@/features/command-centre/command-centre.queries';
import { useCommandCentreStore } from '@/stores/command-centre.store';
import { Widget } from './Widget';

/**
 * Threat posture gauges.
 *
 * Three readings, because "how dangerous is right now" is three different
 * questions: the aggregate fleet risk, the worst single vehicle, and how much
 * of the fleet is currently exposed. A single number hides the case that
 * matters most — 200 calm vehicles and one being hijacked averages to calm.
 */
export function ThreatGaugesWidget() {
  const query = useFleetSnapshotQuery();
  const liveSnapshot = useCommandCentreStore((state) => state.snapshot);
  const positions = useCommandCentreStore((state) => state.positions);

  const snapshot = liveSnapshot ?? query.data;

  const { peakRisk, peakLevel, exposedPercent } = useMemo(() => {
    const entries = Object.values(positions);

    if (entries.length === 0) {
      return {
        peakRisk: snapshot?.averageRiskScore ?? 0,
        peakLevel: snapshot?.postureLevel ?? ThreatLevel.MINIMAL,
        exposedPercent: 0,
      };
    }

    const peak = entries.reduce((worst, entry) => Math.max(worst, entry.riskScore), 0);

    // "Exposed" is ELEVATED and above — the band at which the platform would
    // act rather than merely watch.
    const exposed = entries.filter(
      (entry) =>
        entry.threatLevel === ThreatLevel.ELEVATED ||
        entry.threatLevel === ThreatLevel.HIGH ||
        entry.threatLevel === ThreatLevel.SEVERE,
    ).length;

    return {
      peakRisk: peak,
      peakLevel: riskScoreToThreatLevel(peak),
      exposedPercent: Math.round((exposed / entries.length) * 100),
    };
  }, [positions, snapshot]);

  const postureLevel: ThreatLevelValue = snapshot?.postureLevel ?? ThreatLevel.MINIMAL;

  return (
    <Widget
      title="Threat posture"
      subtitle="Fleet aggregate, worst case, and exposure"
      live={Boolean(liveSnapshot)}
      alarm={postureLevel === ThreatLevel.SEVERE}
      isLoading={query.isLoading && !snapshot}
      error={query.error}
      onRetry={() => void query.refetch()}
      scrollBody={false}
      className="h-full"
      actions={
        <StatusPill
          status={{ kind: 'threat', value: postureLevel }}
          size="sm"
          pulse={postureLevel === ThreatLevel.SEVERE}
        />
      }
    >
      <div className="grid h-full grid-cols-3 items-center gap-2">
        <Gauge
          score={snapshot?.averageRiskScore ?? 0}
          level={postureLevel}
          caption="Fleet aggregate"
        />
        <Gauge
          score={peakRisk}
          level={peakLevel}
          caption="Worst vehicle"
          alarm={peakLevel === ThreatLevel.SEVERE}
        />
        <Gauge
          score={exposedPercent}
          level={riskScoreToThreatLevel(exposedPercent)}
          caption="Fleet exposed"
          suffix="%"
        />
      </div>
    </Widget>
  );
}

function Gauge({
  score,
  level,
  caption,
  alarm = false,
  suffix,
}: {
  score: number;
  level: ThreatLevelValue;
  caption: string;
  alarm?: boolean;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <ThreatGauge score={score} level={level} size={92} label={suffix ? `${suffix}` : undefined} />
      <p
        className={cn(
          'text-center text-[10px] font-semibold uppercase tracking-[0.1em]',
          alarm ? 'text-signal-critical' : 'text-ink-tertiary',
        )}
      >
        {caption}
      </p>
    </div>
  );
}
