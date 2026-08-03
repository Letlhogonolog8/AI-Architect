import { create } from 'zustand';
import { api, onSessionExpiry, setAccessToken } from '@/lib/api-client';
import { clearTokens, readTokens, saveTokens } from '@/lib/secure-storage';
import type { AuthUser, Driver, LoginResponse, Vehicle } from '@/types';

/**
 * Session state.
 *
 * Unlike the web client, **nothing is persisted to plain storage**. Tokens live
 * only in the Keychain/Keystore via `expo-secure-store`; the principal is held
 * in memory and re-fetched on launch. A stolen unlocked phone is a realistic
 * threat for this app in a way it is not for a control-room desktop.
 */
interface AuthState {
  user: AuthUser | null;
  /** The driver record for the signed-in user, if they have one. */
  driver: Driver | null;
  /** The vehicle currently assigned to that driver. */
  vehicle: Vehicle | null;
  isInitialising: boolean;
  error: string | null;

  initialise: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  driver: null,
  vehicle: null,
  isInitialising: true,
  error: null,

  /**
   * Restores a session from secure storage on launch.
   *
   * A network failure here does **not** clear the session. A driver opening the
   * app in a parking basement must not be signed out; the stored tokens stay
   * and the app runs in its offline mode until the next successful call.
   */
  initialise: async () => {
    const { accessToken } = await readTokens();

    if (!accessToken) {
      set({ isInitialising: false });
      return;
    }

    setAccessToken(accessToken);

    try {
      const user = await api.get<AuthUser>('/auth/me');
      set({ user, isInitialising: false, error: null });
      await get().refreshProfile();
    } catch {
      // Kept signed in. `onSessionExpiry` is the only path that clears state,
      // and it fires only when the API actively rejects the refresh token.
      set({ isInitialising: false });
    }
  },

  login: async (email, password) => {
    set({ error: null });

    try {
      const result = await api.post<LoginResponse>(
        '/auth/login',
        { email, password },
        { anonymous: true },
      );

      await saveTokens(result.tokens.accessToken, result.tokens.refreshToken);
      setAccessToken(result.tokens.accessToken);

      set({ user: result.user, isInitialising: false });
      await get().refreshProfile();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Sign-in failed.' });
      throw error;
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // The local session is cleared regardless. Leaving credentials on the
      // device because the network blipped is the worse outcome.
    } finally {
      await clearTokens();
      setAccessToken(null);
      set({ user: null, driver: null, vehicle: null, error: null });
    }
  },

  /** Loads the driver record and assigned vehicle behind the signed-in user. */
  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;

    try {
      const drivers = await api.get<{ items: Driver[] }>('/drivers', {
        query: { pageSize: 50 },
      });

      const driver = drivers.items.find((entry) => entry.userId === user.id) ?? null;
      set({ driver });

      if (driver?.assignedVehicleId) {
        const vehicle = await api.get<Vehicle>(`/vehicles/${driver.assignedVehicleId}`);
        set({ vehicle });
      }
    } catch {
      // Cached values stay. The dashboard degrades to last-known rather than
      // blanking, which is the correct behaviour with no signal.
    }
  },
}));

/** Wired once so an actively rejected refresh token clears the session. */
onSessionExpiry(() => {
  void useAuthStore.getState().logout();
});
