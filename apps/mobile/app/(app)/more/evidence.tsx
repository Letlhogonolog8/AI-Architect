import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import {
  Body,
  Button,
  Caption,
  Card,
  Divider,
  EmptyState,
  Overline,
  Pill,
  Row,
  Screen,
  StatBlock,
} from '@/components/ui';
import { ConnectivityBanner } from '@/components/ConnectivityBanner';
import {
  captureEvidence,
  listLocalEvidence,
  localEvidenceBytes,
  type LocalEvidence,
} from '@/services/evidence-recorder';
import { useAuthStore } from '@/stores/auth.store';
import { useSosStore } from '@/stores/sos.store';
import { EvidenceType } from '@/types';
import { colors, radii, spacing } from '@/theme/tokens';

/**
 * Evidence capture and local vault.
 *
 * Captured media is hashed on the device before it goes anywhere, and the file
 * stays local until the server confirms the upload. Both properties come from
 * the same fact: a hijacking happens where there is no signal, and the phone is
 * often the only copy of the evidence for hours afterwards.
 *
 * The checksum shown against each artefact is the same SHA-256 the API verifies
 * on seal. A driver can quote it, and it is what makes the artefact admissible.
 */
export default function EvidenceScreen() {
  const vehicle = useAuthStore((state) => state.vehicle);
  const activation = useSosStore((state) => state.activation);

  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [items, setItems] = useState<LocalEvidence[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);

  const cameraRef = useRef<CameraView>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setItems(await listLocalEvidence());
    setTotalBytes(await localEvidenceBytes());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const takePhoto = async (): Promise<void> => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo?.uri) return;

      await captureEvidence({
        sourceUri: photo.uri,
        type: EvidenceType.IMAGE,
        mimeType: 'image/jpeg',
        incidentId: activation?.id ?? null,
        vehicleId: vehicle?.id ?? null,
        label: 'Photo captured by driver',
      });

      await refresh();
    } catch (error) {
      Alert.alert('Capture failed', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setCapturing(false);
    }
  };

  const toggleRecording = async (): Promise<void> => {
    if (!cameraRef.current) return;

    if (recording) {
      cameraRef.current.stopRecording();
      setRecording(false);
      return;
    }

    setRecording(true);

    try {
      // Capped at 60 seconds. An uncapped recording on a phone that is about to
      // be taken produces a large file that will never finish uploading.
      const video = await cameraRef.current.recordAsync({ maxDuration: 60 });
      if (!video?.uri) return;

      await captureEvidence({
        sourceUri: video.uri,
        type: EvidenceType.VIDEO,
        mimeType: 'video/mp4',
        incidentId: activation?.id ?? null,
        vehicleId: vehicle?.id ?? null,
        label: 'Video captured by driver',
      });

      await refresh();
    } catch (error) {
      Alert.alert('Recording failed', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setRecording(false);
    }
  };

  if (cameraOpen) {
    if (!permission?.granted) {
      return (
        <Screen>
          <Card>
            <Overline tone="warning">Camera permission needed</Overline>
            <Caption>
              Evidence capture needs the camera. Nothing is recorded unless you press capture.
            </Caption>
            <Button
              label="Grant camera access"
              variant="primary"
              block
              onPress={() => void requestPermission()}
            />
            <Button label="Back" variant="ghost" block onPress={() => setCameraOpen(false)} />
          </Card>
        </Screen>
      );
    }

    return (
      <View style={styles.cameraScreen}>
        <CameraView ref={cameraRef} style={styles.camera} facing={facing} mode="video" />

        <View style={styles.cameraControls}>
          <Button
            label="Close"
            variant="ghost"
            onPress={() => {
              if (recording) cameraRef.current?.stopRecording();
              setCameraOpen(false);
            }}
          />
          <Button
            label={recording ? 'Stop' : 'Record'}
            variant={recording ? 'danger' : 'primary'}
            size="lg"
            onPress={() => void toggleRecording()}
          />
          <Button
            label="Photo"
            variant="secondary"
            loading={capturing}
            onPress={() => void takePhoto()}
          />
          <Button
            label="Flip"
            variant="ghost"
            onPress={() => setFacing((current) => (current === 'back' ? 'front' : 'back'))}
          />
        </View>
      </View>
    );
  }

  return (
    <Screen>
      <ConnectivityBanner />

      <Card tone={activation ? 'alarm' : 'default'}>
        <Overline>
          {activation ? 'Capturing against your active alarm' : 'Capture evidence'}
        </Overline>
        <Caption>
          Media is hashed on this device before it is sent, and the local copy is kept until the
          control room confirms receipt. Capture works with no signal.
        </Caption>
        <Button label="Open camera" variant="primary" block onPress={() => setCameraOpen(true)} />
      </Card>

      <Card>
        <Row style={styles.between}>
          <Overline>On this device</Overline>
          <Pill
            label={`${(totalBytes / 1_000_000).toFixed(1)} MB`}
            tone={totalBytes > 500_000_000 ? 'warning' : 'neutral'}
          />
        </Row>
        <Row gap={spacing.md}>
          <StatBlock label="Artefacts" value={String(items.length)} caption="captured" />
          <StatBlock
            label="Uploaded"
            value={String(items.filter((item) => item.uploaded).length)}
            caption="confirmed"
          />
          <StatBlock
            label="Pending"
            value={String(items.filter((item) => !item.uploaded).length)}
            caption="queued"
          />
        </Row>
      </Card>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            title="No evidence captured"
            description="Photos and video you capture appear here with their checksum until the control room confirms receipt."
          />
        </Card>
      ) : (
        items.map((item) => <EvidenceRow key={item.id} item={item} />)
      )}
    </Screen>
  );
}

function EvidenceRow({ item }: { item: LocalEvidence }) {
  return (
    <Card>
      <Row style={styles.between}>
        <Body tone="primary" style={styles.itemTitle}>
          {item.type === EvidenceType.VIDEO ? 'Video' : 'Photo'}
        </Body>
        <Pill
          label={item.uploaded ? 'Uploaded' : 'On device'}
          tone={item.uploaded ? 'success' : 'warning'}
          dot={!item.uploaded}
        />
      </Row>

      <Caption>
        {new Date(item.capturedAt).toLocaleString()} · {(item.sizeBytes / 1_000_000).toFixed(1)} MB
        {item.durationSeconds !== null ? ` · ${item.durationSeconds}s` : ''}
      </Caption>

      <Divider />

      <Caption tone="tertiary">SHA-256 {item.checksum.slice(0, 24)}…</Caption>
    </Card>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  itemTitle: { fontWeight: '600' },
  cameraScreen: { flex: 1, backgroundColor: '#000000' },
  camera: { flex: 1 },
  cameraControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.void,
    borderTopLeftRadius: radii.panel,
    borderTopRightRadius: radii.panel,
  },
});
