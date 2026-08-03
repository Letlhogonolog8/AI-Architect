import { Stack } from 'expo-router';
import { colors } from '@/theme/tokens';

export default function MoreLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.abyss },
        headerTintColor: colors.inkPrimary,
        headerTitleStyle: { fontSize: 16, fontWeight: '600' },
        contentStyle: { backgroundColor: colors.void },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="incidents" options={{ title: 'Incident status' }} />
      <Stack.Screen name="contacts" options={{ title: 'Emergency contacts' }} />
      <Stack.Screen name="watch" options={{ title: 'Smartwatch' }} />
      <Stack.Screen name="evidence" options={{ title: 'Evidence' }} />
      <Stack.Screen name="settings" options={{ title: 'Protection settings' }} />
    </Stack>
  );
}
