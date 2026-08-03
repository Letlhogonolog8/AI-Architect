import * as SecureStore from 'expo-secure-store';

/**
 * Credential storage.
 *
 * Tokens go to the iOS Keychain / Android Keystore via `expo-secure-store`,
 * never `AsyncStorage` — AsyncStorage is a plaintext file that any app with
 * filesystem access on a compromised device can read.
 *
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY` is deliberate: it keeps the refresh token out
 * of encrypted iCloud backups, so restoring a backup onto a new device cannot
 * resurrect a live session.
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const ACCESS_TOKEN_KEY = 'aegis.accessToken';
const REFRESH_TOKEN_KEY = 'aegis.refreshToken';

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken, OPTIONS),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken, OPTIONS),
  ]);
}

export async function readTokens(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
}> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY, OPTIONS),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY, OPTIONS),
  ]);

  return { accessToken, refreshToken };
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY, OPTIONS),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY, OPTIONS),
  ]);
}
