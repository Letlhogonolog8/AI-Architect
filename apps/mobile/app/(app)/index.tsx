import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Body,
  Button,
  Caption,
  Card,
  Divider,
  Overline,
  Pill,
  Row,
  Screen,
  StatBlock,
  Title,
} from '@/components/ui';
import { PanicButton } from '@/components/PanicButton';
import { ConnectivityBanner } from '@/components/ConnectivityBanner';
import { useAuthStore } from '@/stores/auth.store';
import { useSosStore } from '@/stores/sos.store';
import { useTripStore } from '@/stores/trip.store';
import { useWatchStore } from '@/stores/watch.store';
import { WatchPairingState } from '@/services/watch/transport';
import { isTracking, readCurrentPosition, trackingPermissions } from '@/services/location';
import { ThreatLevel, VehicleStatus } from '@/types';
import { spacing } from '@/theme/tokens';

/**
 * Driver dashboard — the app's home.
 *
 * Ordered by what matters when the phone is picked up in a hurry:
 *
 *   1. Anything undelivered (the banner).
 *   2. The panic button. Always in the same place, always reachable by thumb.
 *   3. Protection state — is tracking actually on?
 *   4. Everything else.
 *
 * The panic button sits above the fold on every device size. That is the single
 * hardest layout constraint on this screen and it wins over everything else.
 */
export default function DashboardScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const driver = useAuthStore((state) => state.driver);
  const vehicle = useAuthStore((state) => state.vehicle);

  const sosPhase = useSosStore((state) => state.phase);
  const tripPhase = useTripStore((state) => state.phase);
  const selectedCorridor = useTripStore((state) => state.selectedCorridor);
  const watchState = useWatchStore((state) => state.state);

  const [tracking, setTracking] = useState(false);
  const [permissions, setPermissions] = useState({ foreground: false, background: false });
  const [speedKph, setSpeedKph] = useState<number | null>(null);

  useEffect(() => {
    async function refresh(): Promise<void> {
      setTracking(await isTracking());
      setPermissions(await trackingPermissions());
      const frame = await readCurrentPosition();
      setSpeedKph(frame?.speedKph ?? null);
    }

    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, []);

  const protectionOn = tracking && permissions.background;

  return (
    <Screen>
      <ConnectivityBanner />

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Overline>Driver</Overline>
          <Title>{user ? `${user.firstName} ${user.lastName}` : 'Signed in'}</Title>
        </View>
        {driver ? <Pill label={driver.status.replace(/_/g, ' ')} tone="accent" dot /> : null}
      </View>

      {/* The one control that must never move or be scrolled past. */}
      <PanicButton />

      {sosPhase === 'active' ? (
        <Card tone="alarm">
          <Body tone="danger" style={styles.alarmHeading}>
            An alarm is active
          </Body>
          <Caption>
            The control room has been notified and is tracking you. Keep the app open if it is safe
            to do so.
          </Caption>
          <Button
            label="Open incident status"
            variant="danger"
            block
            onPress={() => router.push('/(app)/more/incidents')}
          />
        </Card>
      ) : null}

      <Card tone={protectionOn ? 'default' : 'accent'}>
        <Row style={styles.between}>
          <Overline>Protection status</Overline>
          <Pill
            label={protectionOn ? 'Active' : 'Not protecting'}
            tone={protectionOn ? 'success' : 'warning'}
            dot
          />
        </Row>

        {protectionOn ? (
          <Caption>
            Your position is streaming to the control room. Protection continues with the screen
            off.
          </Caption>
        ) : (
          <>
            <Caption>
              {permissions.background
                ? 'Tracking is off. Start a trip to begin protection.'
                : 'Background location permission is required. Without it, a hijacking cannot be located once your screen is off.'}
            </Caption>
            <Button
              label={permissions.background ? 'Plan a trip' : 'Fix permissions'}
              variant="primary"
              block
              onPress={() =>
                router.push(permissions.background ? '/(app)/navigate' : '/(app)/more/settings')
              }
            />
          </>
        )}
      </Card>

      {vehicle ? (
        <Card>
          <Row style={styles.between}>
            <Overline>Assigned vehicle</Overline>
            <Pill
              label={vehicle.status.replace(/_/g, ' ')}
              tone={vehicle.status === VehicleStatus.UNDER_THREAT ? 'danger' : 'neutral'}
              dot={vehicle.status === VehicleStatus.UNDER_THREAT}
            />
          </Row>

          <Body tone="primary" style={styles.registration}>
            {vehicle.registrationNumber}
          </Body>
          <Caption>
            {vehicle.make} {vehicle.model} · {vehicle.colour}
          </Caption>

          <Divider />

          <Row gap={spacing.md}>
            <StatBlock
              label="Risk"
              value={`${vehicle.riskScore}`}
              caption="of 100"
              tone={vehicle.threatLevel === ThreatLevel.SEVERE ? 'danger' : 'primary'}
            />
            <StatBlock
              label="Speed"
              value={speedKph === null ? '—' : `${speedKph.toFixed(0)}`}
              caption="km/h"
            />
            <StatBlock label="Mode" value={vehicle.protectionMode.slice(0, 4)} caption="profile" />
          </Row>
        </Card>
      ) : (
        <Card>
          <Overline>Assigned vehicle</Overline>
          <Caption>
            No vehicle is assigned to you yet. Panic activation still works and will carry your
            position.
          </Caption>
        </Card>
      )}

      <Card>
        <Overline>Current trip</Overline>
        {tripPhase === 'active' && selectedCorridor ? (
          <>
            <Body tone="primary">{selectedCorridor.name}</Body>
            <Caption>
              {selectedCorridor.lengthKm} km · about {selectedCorridor.averageTransitMinutes} min ·{' '}
              {selectedCorridor.responderCoverage} response units along the route
            </Caption>
            <Button
              label="Open navigation"
              variant="secondary"
              block
              onPress={() => router.push('/(app)/navigate')}
            />
          </>
        ) : (
          <>
            <Caption>
              No trip in progress. Starting a trip on a SafeCorridor turns on protection and tells
              the control room your expected route.
            </Caption>
            <Button
              label="Plan a trip"
              variant="primary"
              block
              onPress={() => router.push('/(app)/navigate')}
            />
          </>
        )}
      </Card>

      <Card>
        <Overline>Covert channels</Overline>
        <ChannelRow label="Shake to alarm" state="Armed" tone="success" />
        <ChannelRow
          label="Paired watch"
          state={
            watchState === WatchPairingState.PAIRED
              ? 'Connected'
              : watchState === WatchPairingState.DISCONNECTED
                ? 'Out of range'
                : watchState === WatchPairingState.UNSUPPORTED
                  ? 'Not in this build'
                  : 'Not paired'
          }
          tone={
            watchState === WatchPairingState.PAIRED
              ? 'success'
              : watchState === WatchPairingState.DISCONNECTED
                ? 'danger'
                : 'neutral'
          }
        />
        <ChannelRow label="Voice phrase" state="Not in this build" tone="neutral" />

        <Button
          label="Manage covert channels"
          variant="ghost"
          block
          onPress={() => router.push('/(app)/more/settings')}
        />
      </Card>
    </Screen>
  );
}

function ChannelRow({
  label,
  state,
  tone,
}: {
  label: string;
  state: string;
  tone: 'success' | 'danger' | 'neutral';
}) {
  return (
    <Row style={styles.between}>
      <Caption tone="secondary">{label}</Caption>
      <Pill label={state} tone={tone} dot={tone !== 'neutral'} />
    </Row>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  between: {
    justifyContent: 'space-between',
  },
  alarmHeading: {
    fontWeight: '700',
  },
  registration: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
