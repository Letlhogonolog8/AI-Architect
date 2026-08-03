import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthUser, LoginResponse, Permission, RoleName, TokenPair } from '@aegisdrive/types';
import { hasAllPermissions, hasAnyPermission, hasPermission, hasRole } from '@aegisdrive/shared';
import { api, configureApiClient, setTokens } from '@/lib/api-client';

/**
 * Authentication state.
 *
 * **What is persisted and why.** The token pair and the principal are written
 * to `localStorage` so a page refresh does not bounce an operator to the login
 * screen mid-incident. This is a deliberate trade: `localStorage` is readable
 * by any script on the origin, so an XSS gets the access token. It is mitigated
 * by a 15-minute access-token lifetime, by the refresh token also living in an
 * httpOnly cookie the API prefers, and by the API re-reading the principal from
 * the database on every request rather than trusting the stored copy.
 *
 * **The permission helpers here are UX, not security.** They hide affordances a
 * user cannot use. Every one of them is enforced again on the API, which is the
 * only place authorisation actually happens.
 */

interface AuthState {
  user: AuthUser | null;
  tokens: TokenPair | null;
  /** True until the persisted session has been rehydrated and revalidated. */
  isInitialising: boolean;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Revalidates the persisted session against the API on app start. */
  initialise: () => Promise<void>;
  applyTokens: (tokens: TokenPair | null) => void;

  can: (permission: Permission) => boolean;
  canAny: (permissions: readonly Permission[]) => boolean;
  canAll: (permissions: readonly Permission[]) => boolean;
  is: (...roles: RoleName[]) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tokens: null,
      isInitialising: true,

      login: async (email, password) => {
        const result = await api.post<LoginResponse>(
          '/auth/login',
          { email, password },
          { anonymous: true },
        );

        setTokens(result.tokens);
        set({ user: result.user, tokens: result.tokens, isInitialising: false });
      },

      logout: async () => {
        try {
          await api.post('/auth/logout');
        } catch {
          // A failed logout call must still clear the client. The session is
          // already unusable to the operator, and leaving credentials in the
          // browser because the network blipped is the worse outcome.
        } finally {
          setTokens(null);
          set({ user: null, tokens: null });
        }
      },

      initialise: async () => {
        const { tokens } = get();

        if (!tokens) {
          set({ isInitialising: false });
          return;
        }

        setTokens(tokens);

        try {
          // `/auth/me` returns the authoritative principal. Roles may have
          // changed since the copy in storage was written.
          const user = await api.get<AuthUser>('/auth/me');
          set({ user, isInitialising: false });
        } catch {
          setTokens(null);
          set({ user: null, tokens: null, isInitialising: false });
        }
      },

      applyTokens: (tokens) => {
        setTokens(tokens);
        set(tokens ? { tokens } : { tokens: null, user: null });
      },

      can: (permission) => hasPermission(get().user, permission),
      canAny: (permissions) => hasAnyPermission(get().user, permissions),
      canAll: (permissions) => hasAllPermissions(get().user, permissions),
      is: (...roles) => hasRole(get().user, roles),
    }),
    {
      name: 'aegisdrive.auth',
      storage: createJSONStorage(() => localStorage),
      // Only the session itself is persisted; the actions and the transient
      // initialising flag are recreated on every load.
      partialize: (state) => ({ user: state.user, tokens: state.tokens }),
    },
  ),
);

/**
 * Connects the HTTP client's silent token refresh back into this store, so a
 * rotated pair is persisted rather than lost on the next reload.
 */
configureApiClient({
  initialTokens: useAuthStore.getState().tokens,
  onTokensChanged: (tokens) => {
    useAuthStore.getState().applyTokens(tokens);
  },
});

/** Selector hooks. Subscribing to a slice avoids re-rendering on unrelated changes. */
export const useCurrentUser = (): AuthUser | null => useAuthStore((state) => state.user);
export const useIsAuthenticated = (): boolean => useAuthStore((state) => state.user !== null);
