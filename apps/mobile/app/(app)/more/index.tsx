import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Body, Button, Caption, Card, Overline, Pill, Row, Screen, Title } from '@/components/ui';
import { ConnectivityBanner } from '@/components/ConnectivityBanner';
import { useAuthStore } from '@/stores/auth.store';
import { useConnectivityStore } from '@/stores/connectivity.store';
import { useWatchStore } from '@/stores/watch.store';
import { WatchPairingState } from '@/services/watch/transport';
import { colors, radii, spacing } from '@/theme/tokens';

interface MenuItem {
  href: Href;
  label: string;
  detail: string;
  badge?: { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' };
}

export default function MoreScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const pending = useConnectivityStore((state) => state.pending);
  const watchState = useWatchStore((state) => state.state);

  const items: MenuItem[] = [
    {
      href: '/(app)/more/incidents',
      label: 'Incident status',
      detail: 'Live status of anything raised about you or your vehicle',
    },
    {
      href: '/(app)/more/contacts',
      label: 'Emergency contacts',
      detail: 'Who is called if you cannot be reached',
    },
    {
      href: '/(app)/more/watch',
      label: 'Smartwatch',
      detail: 'Pair a watch as a covert panic button',
      badge:
        watchState === WatchPairingState.PAIRED
          ? { label: 'Paired', tone: 'success' }
          : watchState === WatchPairingState.DISCONNECTED
            ? { label: 'Out of range', tone: 'danger' }
            : { label: 'Not paired', tone: 'neutral' },
    },
    {
      href: '/(app)/more/evidence',
      label: 'Evidence',
      detail: 'Capture and review evidence held on this device',
      badge: pending > 0 ? { label: `${pending} queued`, tone: 'warning' } : undefined,
    },
    {
      href: '/(app)/more/settings',
      label: 'Protection settings',
      detail: 'Permissions, covert channels and offline behaviour',
    },
  ];

  return (
    <Screen>
      <ConnectivityBanner />

      <View style={styles.header}>
        <Overline>Account</Overline>
        <Title>{user ? `${user.firstName} ${user.lastName}` : 'Driver'}</Title>
        <Caption>{user?.email}</Caption>
      </View>

      <View style={styles.menu}>
        {items.map((item) => (
          <Pressable
            key={String(item.href)}
            onPress={() => router.push(item.href)}
            accessibilityRole="link"
            accessibilityLabel={`${item.label}. ${item.detail}`}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <View style={styles.itemText}>
              <Body tone="primary" style={styles.itemLabel}>
                {item.label}
              </Body>
              <Caption>{item.detail}</Caption>
            </View>

            <Row gap={spacing.sm}>
              {item.badge ? <Pill label={item.badge.label} tone={item.badge.tone} /> : null}
              <Body tone="tertiary">›</Body>
            </Row>
          </Pressable>
        ))}
      </View>

      <Card>
        <Overline>Session</Overline>
        <Caption>
          Signing out clears your credentials from this device. Anything still queued is sent first
          — sign out only when you have signal.
        </Caption>
        <Button
          label="Sign out"
          variant="secondary"
          block
          disabled={pending > 0}
          onPress={() => void logout()}
        />
        {pending > 0 ? (
          <Caption tone="warning">
            {pending} action{pending === 1 ? '' : 's'} still queued. Sign-out is blocked until they
            send.
          </Caption>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 2 },
  menu: { gap: spacing.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  itemText: { flex: 1, gap: 2 },
  itemLabel: { fontWeight: '600' },
  pressed: { opacity: 0.8 },
});
