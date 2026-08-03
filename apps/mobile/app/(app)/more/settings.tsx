import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Switch, TextInput, View } from 'react-native';
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
} from '@/components/ui';
import { ConnectivityBanner } from '@/components/ConnectivityBanner';
import {
  bufferedFrameCount,
  requestTrackingPermissions,
  trackingPermissions,
} from '@/services/location';
import { isShakeDetectionAvailable } from '@/services/covert-activation';
import {
  VoiceTriggerState,
  activeRecognizerName,
  validatePhrase,
  voiceTriggerState,
} from '@/services/voice-trigger';
import { useConnectivityStore } from '@/stores/connectivity.store';
import { colors, radii, spacing } from '@/theme/tokens';

/**
 * Protection settings.
 *
 * The screen exists to answer one question honestly: **which of my protections
 * are actually armed right now?**
 *
 * Every row states its real state, including "not available in this build".
 * A settings screen that shows a toggle for something that cannot work is worse
 * than one that says so, because a driver will switch it on and rely on it.
 */
export default function SettingsScreen() {
  const [permissions, setPermissions] = useState({ foreground: false, background: false });
  const [shakeAvailable, setShakeAvailable] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceTriggerState>(VoiceTriggerState.UNAVAILABLE);
  const [phrase, setPhrase] = useState('');
  const [buffered, setBuffered] = useState(0);

  const pending = useConnectivityStore((state) => state.pending);
  const isOnline = useConnectivityStore((state) => state.isOnline);
  const lastSyncAt = useConnectivityStore((state) => state.lastSyncAt);
  const retryNow = useConnectivityStore((state) => state.retryNow);

  const refresh = useCallback(async (): Promise<void> => {
    setPermissions(await trackingPermissions());
    setShakeAvailable(await isShakeDetectionAvailable());
    setVoiceState(await voiceTriggerState(phrase || null));
    setBuffered(await bufferedFrameCount());
  }, [phrase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const phraseCheck = phrase.length > 0 ? validatePhrase(phrase) : null;

  return (
    <Screen>
      <ConnectivityBanner />

      <Card tone={permissions.background ? 'default' : 'alarm'}>
        <Row style={styles.between}>
          <Overline>Location permission</Overline>
          <Pill
            label={
              permissions.background ? 'Always' : permissions.foreground ? 'While in use' : 'Denied'
            }
            tone={permissions.background ? 'success' : 'danger'}
            dot
          />
        </Row>

        {permissions.background ? (
          <Caption>
            Protection continues with the screen off and the app in the background — which is when a
            hijacking happens.
          </Caption>
        ) : (
          <>
            <Caption tone="danger">
              Without &ldquo;Always&rdquo; location, your position stops being reported the moment
              you leave the app. A hijacking could not be located.
            </Caption>
            <Button
              label="Grant always-on location"
              variant="primary"
              block
              onPress={() => {
                void (async () => {
                  const granted = await requestTrackingPermissions();
                  setPermissions(granted);
                  // The OS only shows its dialog once. After that the driver has
                  // to change it in Settings, so send them there.
                  if (!granted.background) void Linking.openSettings();
                })();
              }}
            />
          </>
        )}
      </Card>

      <Card>
        <Overline>Covert activation</Overline>

        <Row style={styles.between}>
          <View style={styles.rowText}>
            <Body tone="primary">Shake to alarm</Body>
            <Caption>Four sharp shakes within 2.5 seconds raises a silent alarm.</Caption>
          </View>
          <Pill
            label={shakeAvailable ? 'Armed' : 'No sensor'}
            tone={shakeAvailable ? 'success' : 'neutral'}
            dot={shakeAvailable}
          />
        </Row>

        <Divider />

        <Row style={styles.between}>
          <View style={styles.rowText}>
            <Body tone="primary">Voice duress phrase</Body>
            <Caption>
              {voiceState === VoiceTriggerState.UNAVAILABLE
                ? 'Needs a development build with an on-device wake-word engine. Not available here.'
                : 'Speak your phrase to raise a silent alarm.'}
            </Caption>
          </View>
          <Pill
            label={voiceState === VoiceTriggerState.UNAVAILABLE ? 'Unavailable' : 'Available'}
            tone={voiceState === VoiceTriggerState.UNAVAILABLE ? 'neutral' : 'success'}
          />
        </Row>

        {voiceState !== VoiceTriggerState.UNAVAILABLE ? (
          <>
            <TextInput
              value={phrase}
              onChangeText={setPhrase}
              placeholder="e.g. I need to fetch my blue folder"
              placeholderTextColor={colors.inkTertiary}
              style={styles.input}
              accessibilityLabel="Duress phrase"
            />
            {phraseCheck && !phraseCheck.valid ? (
              <View style={styles.problems}>
                {phraseCheck.problems.map((problem) => (
                  <Caption key={problem} tone="warning">
                    • {problem}
                  </Caption>
                ))}
              </View>
            ) : null}
            <Caption>
              Choose something ordinary. The phrase must not sound like a distress call to anyone
              listening.
            </Caption>
          </>
        ) : (
          <Caption tone="tertiary">Recogniser: {activeRecognizerName()}</Caption>
        )}
      </Card>

      <Card>
        <Overline>Offline behaviour</Overline>

        <Row gap={spacing.md}>
          <StatBlock
            label="Queued"
            value={String(pending)}
            caption="actions"
            tone={pending > 0 ? 'warning' : 'primary'}
          />
          <StatBlock label="Telemetry" value={String(buffered)} caption="frames held" />
          <StatBlock
            label="Network"
            value={isOnline ? 'Online' : 'Offline'}
            tone={isOnline ? 'success' : 'warning'}
          />
        </Row>

        <Divider />

        <Caption>
          Everything you do works offline. Panic activation, evidence capture and messages are
          written to this device first and sent automatically when signal returns. Nothing is
          discarded, however long that takes.
        </Caption>

        {lastSyncAt ? (
          <Caption tone="tertiary">
            Last successful sync {new Date(lastSyncAt).toLocaleTimeString()}.
          </Caption>
        ) : null}

        <Button
          label="Retry sending now"
          variant="secondary"
          block
          disabled={pending === 0}
          onPress={() => void retryNow()}
        />
      </Card>

      <Card>
        <Overline>What is always available</Overline>
        <Caption>
          • The panic button works without signal and without a vehicle assigned.{'\n'}• The shake
          gesture is armed on every signed-in screen.{'\n'}• Emergency contacts are stored on this
          device and can be dialled with no data connection.{'\n'}• Evidence is hashed and stored
          locally before any upload is attempted.
        </Caption>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  rowText: { flex: 1, gap: 2 },
  input: {
    minHeight: 48,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: spacing.md,
    color: colors.inkPrimary,
    fontSize: 15,
    marginTop: spacing.sm,
  },
  problems: { gap: 2, marginTop: spacing.xs },
});
