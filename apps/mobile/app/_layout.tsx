import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { openDatabase } from '@/db/database';
import { useAuthStore } from '@/stores/auth.store';
import { useConnectivityStore } from '@/stores/connectivity.store';
import { useSosStore } from '@/stores/sos.store';
import { useWatchStore } from '@/stores/watch.store';
import { colors } from '@/theme/tokens';

void SplashScreen.preventAutoHideAsync();

/**
 * Root layout.
 *
 * Boot order matters and is deliberate:
 *
 *   1. **Database first.** The outbox must be readable before anything can
 *      queue into it — including a panic raised in the first second.
 *   2. **Sync engine second**, so anything left over from a previous session
 *      starts draining immediately. A panic queued last night in a dead zone
 *      should send the moment the app opens on signal.
 *   3. **Session restore last**, because it is the only step allowed to fail
 *      without blocking the app.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount) => failureCount < 2,
      // The phone is frequently offline; refetching on every focus would burn
      // battery producing failures.
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const initialise = useAuthStore((state) => state.initialise);
  const beginSync = useConnectivityStore((state) => state.begin);
  const initialiseWatch = useWatchStore((state) => state.initialise);

  useEffect(() => {
    async function boot(): Promise<void> {
      try {
        await openDatabase();
        beginSync();
        await Promise.all([initialise(), initialiseWatch()]);
      } catch (error) {
        // The app must still start. A driver with a corrupt cache needs the
        // panic button far more than they need a working dashboard.
        console.error('Boot sequence failed', error);
      } finally {
        setReady(true);
        await SplashScreen.hideAsync();
      }
    }

    void boot();
  }, [initialise, beginSync, initialiseWatch]);

  if (!ready) {
    return (
      <View style={styles.booting}>
        <ActivityIndicator color={colors.aegis400} size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <AuthGate />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.void },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Routes between the signed-in and signed-out stacks.
 *
 * A component rather than logic inside `RootLayout` because expo-router must
 * have mounted the navigator before any navigation is attempted; calling
 * `replace` during the parent's first render throws.
 */
function AuthGate() {
  const user = useAuthStore((state) => state.user);
  const isInitialising = useAuthStore((state) => state.isInitialising);
  const sosPhase = useSosStore((state) => state.phase);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isInitialising) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      // An active alarm is never interrupted by a session problem. The panic is
      // already durable in the outbox and will send with whatever credentials
      // are available; throwing a login screen over it would be indefensible.
      if (sosPhase === 'active') return;
      router.replace('/(auth)/login');
      return;
    }

    if (user && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [user, isInitialising, segments, router, sosPhase]);

  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  booting: {
    flex: 1,
    backgroundColor: colors.void,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
