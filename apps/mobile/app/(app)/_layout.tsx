import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { PanicMode, PanicTrigger } from '@/services/panic';
import { startShakeDetector } from '@/services/covert-activation';
import { useSosStore } from '@/stores/sos.store';
import { useMessagingStore } from '@/stores/messaging.store';
import { colors } from '@/theme/tokens';

/**
 * Signed-in tab layout.
 *
 * Five tabs, chosen because a driver glancing at a phone in a cradle can hit
 * five targets and not seven. Everything else lives behind "More".
 *
 * The covert shake detector is mounted here rather than per-screen: it must be
 * armed on every signed-in screen, and mounting it per-screen would start and
 * stop the accelerometer on every navigation.
 */
export default function AppLayout() {
  const triggerImmediate = useSosStore((state) => state.triggerImmediate);
  const phase = useSosStore((state) => state.phase);
  const unreadCount = useMessagingStore((state) => state.unreadCount);
  const loadMessages = useMessagingStore((state) => state.load);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    // Already alarming: stop listening so a driver shaken about in a struggle
    // does not re-trigger repeatedly.
    if (phase === 'active') return;

    const detector = startShakeDetector(() => {
      void triggerImmediate(PanicTrigger.COVERT_GESTURE, PanicMode.SILENT);
    });

    return () => detector.stop();
  }, [triggerImmediate, phase]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.aegis400,
        tabBarInactiveTintColor: colors.inkTertiary,
        tabBarLabelStyle: styles.tabLabel,
        sceneStyle: { backgroundColor: colors.void },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Protect',
          tabBarIcon: ({ color }) => <TabGlyph glyph="◆" color={color} />,
        }}
      />
      <Tabs.Screen
        name="vehicle"
        options={{
          title: 'Vehicle',
          tabBarIcon: ({ color }) => <TabGlyph glyph="▣" color={color} />,
        }}
      />
      <Tabs.Screen
        name="navigate"
        options={{
          title: 'Route',
          tabBarIcon: ({ color }) => <TabGlyph glyph="➤" color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color }) => <TabGlyph glyph="✉" color={color} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: styles.badge,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color }) => <TabGlyph glyph="⋯" color={color} />,
        }}
      />
    </Tabs>
  );
}

/**
 * Text glyphs rather than an icon font.
 *
 * Keeps the bundle free of an icon dependency for five symbols, and text
 * glyphs scale with the OS accessibility text setting, which vector icons in
 * a fixed size do not.
 */
function TabGlyph({ glyph, color }: { glyph: string; color: string }) {
  return (
    <View style={styles.glyphWrapper}>
      <Text style={[styles.glyph, { color }]}>{glyph}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.abyss,
    borderTopColor: 'rgba(255,255,255,0.08)',
    borderTopWidth: StyleSheet.hairlineWidth,
    height: 64,
    paddingBottom: 8,
    paddingTop: 6,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  glyphWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 22,
  },
  glyph: {
    fontSize: 17,
  },
  badge: {
    backgroundColor: colors.critical,
    fontSize: 10,
  },
});
