import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Body,
  Button,
  Caption,
  Card,
  Divider,
  EmptyState,
  LoadingBlock,
  Overline,
  Pill,
  Row,
  Screen,
  StatBlock,
} from '@/components/ui';
import { ConnectivityBanner } from '@/components/ConnectivityBanner';
import { isWatchBatteryLow, useWatchStore } from '@/stores/watch.store';
import { WatchPairingState } from '@/services/watch/transport';
import { colors, radii, spacing } from '@/theme/tokens';

/**
 * Smartwatch pairing.
 *
 * A watch is the best covert panic channel available: already on the wrist, a
 * press looks like checking the time, and it works with the phone in a bag.
 *
 * The screen is explicit about the heartbeat, and that is the point. A paired
 * panic button that has silently stopped working is *worse* than no panic
 * button, because the driver is relying on it — so "out of range" is shown as a
 * warning, not hidden.
 */
export default function WatchScreen() {
  const { state, device, discovered, lastHeartbeatAt, error, initialise, scan, pair, unpair } =
    useWatchStore();

  useEffect(() => {
    void initialise();
  }, [initialise]);

  if (state === WatchPairingState.UNSUPPORTED) {
    return (
      <Screen>
        <ConnectivityBanner />
        <Card>
          <Overline tone="warning">Not available in this build</Overline>
          <Caption>
            Smartwatch pairing needs a development build. Expo Go cannot reach WatchConnectivity on
            iOS, the Wear Data Layer on Android, or Bluetooth GATT for a generic band.
          </Caption>
          <Divider />
          <Caption>
            Your other covert channels are unaffected: the shake gesture is armed, and the panic
            button works on every build.
          </Caption>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <ConnectivityBanner />

      {state === WatchPairingState.PAIRED || state === WatchPairingState.DISCONNECTED ? (
        <Card tone={state === WatchPairingState.DISCONNECTED ? 'alarm' : 'accent'}>
          <Row style={styles.between}>
            <Overline>Paired watch</Overline>
            <Pill
              label={state === WatchPairingState.PAIRED ? 'Connected' : 'Out of range'}
              tone={state === WatchPairingState.PAIRED ? 'success' : 'danger'}
              dot
            />
          </Row>

          <Body tone="primary" style={styles.deviceName}>
            {device?.name ?? 'Unknown device'}
          </Body>
          <Caption>{device?.kind.replace(/_/g, ' ')}</Caption>

          <Divider />

          <Row gap={spacing.md}>
            <StatBlock
              label="Battery"
              value={device?.batteryPercent === null ? '—' : `${device?.batteryPercent}%`}
              tone={isWatchBatteryLow(device) ? 'danger' : 'primary'}
            />
            <StatBlock
              label="Last heartbeat"
              value={
                lastHeartbeatAt ? `${Math.round((Date.now() - lastHeartbeatAt) / 1000)}s` : '—'
              }
              caption="ago"
            />
            <StatBlock
              label="Signal"
              value={device?.rssi === null ? '—' : `${device?.rssi}`}
              caption="dBm"
            />
          </Row>

          {state === WatchPairingState.DISCONNECTED ? (
            <Caption tone="danger">
              Your watch has stopped responding. The panic button on it will not work until it
              reconnects — use the app or the shake gesture instead.
            </Caption>
          ) : null}

          {isWatchBatteryLow(device) ? (
            <Caption tone="warning">Watch battery is low. It may not last the trip.</Caption>
          ) : null}

          <Button label="Unpair" variant="secondary" block onPress={() => void unpair()} />
        </Card>
      ) : (
        <>
          <Card>
            <Overline>Pair a watch</Overline>
            <Caption>
              Once paired, holding the button on your watch raises a silent alarm immediately — with
              no countdown, because a watch press is already a deliberate act.
            </Caption>
            <Button
              label={state === WatchPairingState.SCANNING ? 'Scanning' : 'Scan for devices'}
              variant="primary"
              block
              loading={state === WatchPairingState.SCANNING}
              onPress={() => void scan()}
            />
          </Card>

          {state === WatchPairingState.SCANNING ? (
            <LoadingBlock label="Looking for nearby devices" />
          ) : null}

          {error ? (
            <Card tone="alarm">
              <Caption tone="danger">{error}</Caption>
            </Card>
          ) : null}

          {discovered.length > 0 ? (
            <>
              <Overline>Found {discovered.length} device(s)</Overline>
              {discovered.map((candidate) => (
                <Pressable
                  key={candidate.id}
                  onPress={() => void pair(candidate.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Pair with ${candidate.name}`}
                  style={({ pressed }) => [styles.candidate, pressed && styles.pressed]}
                >
                  <View style={styles.candidateText}>
                    <Body tone="primary" style={styles.deviceName}>
                      {candidate.name}
                    </Body>
                    <Caption>
                      {candidate.kind.replace(/_/g, ' ')}
                      {candidate.rssi !== null ? ` · ${candidate.rssi} dBm` : ''}
                    </Caption>
                  </View>
                  <Body tone="accent">Pair ›</Body>
                </Pressable>
              ))}
            </>
          ) : state === WatchPairingState.UNPAIRED && !error ? (
            <Card>
              <EmptyState
                title="No devices found yet"
                description="Make sure your watch is unlocked, nearby, and has the AEGISDRIVE companion app installed."
              />
            </Card>
          ) : null}
        </>
      )}

      <Card>
        <Overline>How it behaves</Overline>
        <Caption>
          • A watch press raises a silent alarm with no countdown.{'\n'}• The watch sends a
          heartbeat every minute. If two minutes pass without one, you are told it is out of range.
          {'\n'}• The watch never shows incident detail — a phone or watch in someone else's hands
          must not reveal what response is doing.
        </Caption>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  deviceName: { fontWeight: '600', fontSize: 16 },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  candidateText: { flex: 1, gap: 2 },
  pressed: { opacity: 0.8 },
});
