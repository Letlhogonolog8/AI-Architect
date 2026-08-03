import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Body,
  Caption,
  Card,
  Divider,
  EmptyState,
  Overline,
  Pill,
  Row,
  Screen,
  StatBlock,
  Title,
} from '@/components/ui';
import { ConnectivityBanner } from '@/components/ConnectivityBanner';
import { useAuthStore } from '@/stores/auth.store';
import { bufferedFrameCount, readCurrentPosition, type TelemetryFrame } from '@/services/location';
import { ProtectionMode, ThreatLevel, VehicleStatus } from '@/types';
import { spacing } from '@/theme/tokens';

/**
 * Vehicle status.
 *
 * What the driver can verify about their own vehicle, plus the telemetry the
 * platform is receiving from it. The buffered-frame count is shown deliberately:
 * a driver should be able to see that tracking is genuinely working, not just
 * that a toggle is on.
 */

const PROTECTION_DESCRIPTION: Record<ProtectionMode, string> = {
  PASSIVE: 'Telemetry only. No automatic action is taken.',
  GUARDIAN: 'Behavioural modelling with alerts on anomalies.',
  SENTINEL: 'Guardian plus autonomous countermeasures, including immobilisation.',
  ESCORT: 'Continuous monitoring by a named operator.',
};

const THREAT_TONE: Record<ThreatLevel, 'success' | 'warning' | 'danger' | 'neutral'> = {
  MINIMAL: 'success',
  GUARDED: 'success',
  ELEVATED: 'warning',
  HIGH: 'danger',
  SEVERE: 'danger',
};

export default function VehicleScreen() {
  const vehicle = useAuthStore((state) => state.vehicle);
  const refreshProfile = useAuthStore((state) => state.refreshProfile);

  const [frame, setFrame] = useState<TelemetryFrame | null>(null);
  const [buffered, setBuffered] = useState(0);

  useEffect(() => {
    async function refresh(): Promise<void> {
      setFrame(await readCurrentPosition());
      setBuffered(await bufferedFrameCount());
    }

    void refresh();
    void refreshProfile();

    const timer = setInterval(() => void refresh(), 5_000);
    return () => clearInterval(timer);
  }, [refreshProfile]);

  if (!vehicle) {
    return (
      <Screen>
        <ConnectivityBanner />
        <Title>Vehicle</Title>
        <Card>
          <EmptyState
            title="No vehicle assigned"
            description="Your fleet administrator has not assigned a vehicle to you yet. Panic activation still works and will carry your position."
          />
        </Card>
      </Screen>
    );
  }

  const underThreat = vehicle.status === VehicleStatus.UNDER_THREAT;

  return (
    <Screen>
      <ConnectivityBanner />

      <View style={styles.header}>
        <Overline>Assigned vehicle</Overline>
        <Title>{vehicle.registrationNumber}</Title>
        <Caption>
          {vehicle.make} {vehicle.model} · {vehicle.year} · {vehicle.colour}
        </Caption>
      </View>

      <Card tone={underThreat ? 'alarm' : 'default'}>
        <Row style={styles.between}>
          <Overline>Status</Overline>
          <Pill
            label={vehicle.status.replace(/_/g, ' ')}
            tone={underThreat ? 'danger' : 'success'}
            dot
          />
        </Row>

        {underThreat ? (
          <Caption tone="danger">
            The control room has flagged this vehicle as under threat and is actively monitoring it.
          </Caption>
        ) : null}

        <Divider />

        <Row gap={spacing.md}>
          <StatBlock
            label="Risk score"
            value={`${vehicle.riskScore}`}
            caption="of 100"
            tone={THREAT_TONE[vehicle.threatLevel] === 'danger' ? 'danger' : 'primary'}
          />
          <StatBlock label="Threat" value={vehicle.threatLevel} caption="assessed level" />
          <StatBlock
            label="Odometer"
            value={`${Math.round(vehicle.odometerKm / 1000)}k`}
            caption="km"
          />
        </Row>
      </Card>

      <Card>
        <Overline>Protection profile</Overline>
        <Row style={styles.between}>
          <Body tone="primary">{vehicle.protectionMode}</Body>
          <Pill
            label={vehicle.protectionMode === ProtectionMode.SENTINEL ? 'Highest' : 'Standard'}
            tone={vehicle.protectionMode === ProtectionMode.SENTINEL ? 'accent' : 'neutral'}
          />
        </Row>
        <Caption>{PROTECTION_DESCRIPTION[vehicle.protectionMode]}</Caption>
      </Card>

      <Card>
        <Overline>Live telemetry</Overline>

        {frame ? (
          <>
            <Row gap={spacing.md}>
              <StatBlock
                label="Speed"
                value={frame.speedKph === null ? '—' : frame.speedKph.toFixed(0)}
                caption="km/h"
              />
              <StatBlock
                label="Heading"
                value={frame.heading === null ? '—' : `${frame.heading.toFixed(0)}°`}
                caption="from north"
              />
              <StatBlock
                label="Accuracy"
                value={frame.accuracy === null ? '—' : `±${frame.accuracy.toFixed(0)}`}
                caption="metres"
              />
            </Row>

            <Divider />

            <Row style={styles.between}>
              <Caption>Position</Caption>
              <Caption tone="secondary">
                {frame.latitude.toFixed(5)}, {frame.longitude.toFixed(5)}
              </Caption>
            </Row>
          </>
        ) : (
          <Caption>
            No position fix yet. This is normal indoors or in a basement; the app keeps trying.
          </Caption>
        )}

        <Divider />

        <Row style={styles.between}>
          <Caption>Frames waiting to upload</Caption>
          <Pill
            label={String(buffered)}
            tone={buffered > 200 ? 'warning' : buffered > 0 ? 'accent' : 'success'}
          />
        </Row>
        <Caption>
          {buffered === 0
            ? 'Everything captured has been sent.'
            : 'Buffered on this device and sent automatically when there is signal. Nothing is lost.'}
        </Caption>
      </Card>

      <Card>
        <Overline>Device</Overline>
        <Row style={styles.between}>
          <Caption>Tracker serial</Caption>
          <Caption tone="secondary">{vehicle.deviceSerial ?? 'Not fitted'}</Caption>
        </Row>
        <Row style={styles.between}>
          <Caption>VIN</Caption>
          <Caption tone="secondary">{vehicle.vin}</Caption>
        </Row>
        <Row style={styles.between}>
          <Caption>Last seen by control room</Caption>
          <Caption tone="secondary">
            {vehicle.lastSeenAt ? new Date(vehicle.lastSeenAt).toLocaleTimeString() : 'Never'}
          </Caption>
        </Row>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 2,
  },
  between: {
    justifyContent: 'space-between',
  },
});
