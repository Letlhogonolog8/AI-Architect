import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from '@/lib/api-client';
import { enqueue } from '@/db/outbox';

/**
 * Device fingerprinting.
 *
 * The strongest non-biometric identity signal available: the phone is
 * physically present, hard to clone, and the OS will vouch for its integrity.
 *
 * ## What is collected, and what deliberately is not
 *
 * Only **stable hardware and OS properties**. Nothing derived from browsing,
 * contacts, installed apps, advertising identifiers or anything else a driver
 * would be surprised to learn their employer could see. The list below is the
 * whole of it, and it is short on purpose — a fingerprint built from fifty
 * attributes would identify the *person* far beyond what verifying the *device*
 * requires.
 *
 * ## Why the hash rather than the attributes
 *
 * The server stores a SHA-256 over the attribute set. It only ever needs to
 * answer "is this the same device as last time", which a hash answers exactly
 * as well as the raw values while revealing less if the table is ever dumped.
 */

export interface DeviceAttributes {
  installationId: string;
  platform: 'IOS' | 'ANDROID';
  osVersion: string;
  deviceModel: string;
  manufacturer: string;
}

export interface DeviceIntegrity {
  attestation: 'VERIFIED' | 'UNVERIFIED' | 'FAILED' | 'UNSUPPORTED';
  compromised: boolean;
  emulated: boolean;
}

/**
 * Stable installation identifier.
 *
 * On Android this is a per-install UUID; on iOS the vendor identifier. Both
 * rotate on reinstall, which the server detects as a new device rather than
 * treating as the same one — a reinstall is a legitimate event that should
 * restart the trust probation, not inherit it.
 */
async function readInstallationId(): Promise<string> {
  if (Platform.OS === 'android') {
    const id = await Application.getAndroidId();
    if (id) return id;
  }

  if (Platform.OS === 'ios') {
    const id = await Application.getIosIdForVendorAsync();
    if (id) return id;
  }

  // Neither is guaranteed. A random per-install id still works: the server
  // treats an unrecognised id as a new device, which is the correct outcome.
  return Crypto.randomUUID();
}

export async function collectAttributes(): Promise<DeviceAttributes> {
  return {
    installationId: await readInstallationId(),
    platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
    osVersion: Device.osVersion ?? 'unknown',
    deviceModel: Device.modelName ?? 'unknown',
    manufacturer: Device.manufacturer ?? 'unknown',
  };
}

/**
 * SHA-256 over the stable attributes.
 *
 * `installationId` is excluded from the hash on purpose. It is the *key*; the
 * hash is what detects the app being restored onto different hardware under the
 * same installation id — the clearest device-level attack signal there is. If
 * the id were inside the hash, that mismatch could never be observed.
 */
export async function computeFingerprint(attributes: DeviceAttributes): Promise<string> {
  const canonical = [
    attributes.platform,
    attributes.deviceModel,
    attributes.manufacturer,
    // Major OS version only: a point release must not invalidate the
    // fingerprint and reset the driver's trust probation every few weeks.
    attributes.osVersion.split('.')[0] ?? '',
  ].join('|');

  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonical, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

/**
 * Device integrity.
 *
 * **Hardware attestation is not wired up.** Play Integrity (Android) and
 * DeviceCheck / App Attest (iOS) both need native modules and a server-side
 * verification endpoint, neither of which exists in this build. Rather than
 * returning `VERIFIED` and lying, this reports `UNSUPPORTED`, and the API's
 * scoring treats that as a small penalty rather than a pass.
 *
 * `Device.isDevice` is the one real signal available in managed Expo: it
 * distinguishes hardware from a simulator. In this product an emulator is
 * effectively always an attack, so it is treated as a spoofed device.
 */
export async function assessIntegrity(): Promise<DeviceIntegrity> {
  const emulated = !Device.isDevice;

  return {
    attestation: 'UNSUPPORTED',
    // Root/jailbreak detection needs a native module too. Reported as false
    // rather than guessed — a wrong "compromised" flag would downgrade every
    // signal from an honest driver's phone.
    compromised: false,
    emulated,
  };
}

export interface AttestationResult {
  attributes: DeviceAttributes;
  fingerprintHash: string;
  integrity: DeviceIntegrity;
  /** True when the report reached the server; false when it was queued. */
  delivered: boolean;
}

/**
 * Reports this device to the identity engine.
 *
 * Queued through the outbox on failure rather than thrown away. A device
 * check-in from a dead zone is still evidence about who was driving, and it is
 * cheap to deliver late.
 */
export async function reportDevice(driverId: string | null): Promise<AttestationResult> {
  const attributes = await collectAttributes();
  const fingerprintHash = await computeFingerprint(attributes);
  const integrity = await assessIntegrity();

  const payload = {
    installationId: attributes.installationId,
    fingerprintHash,
    driverId,
    platform: attributes.platform,
    osVersion: attributes.osVersion,
    deviceModel: attributes.deviceModel,
    manufacturer: attributes.manufacturer,
    attestation: integrity.attestation,
    compromised: integrity.compromised,
    emulated: integrity.emulated,
  };

  try {
    await api.post('/identity/devices/attest', payload, { timeoutMs: 8_000 });
    return { attributes, fingerprintHash, integrity, delivered: true };
  } catch {
    await enqueue('DEVICE_ATTEST', payload);
    return { attributes, fingerprintHash, integrity, delivered: false };
  }
}

/** Plain-language summary for the settings screen. */
export function describeIntegrity(integrity: DeviceIntegrity): {
  tone: 'success' | 'warning' | 'danger';
  label: string;
  detail: string;
} {
  if (integrity.emulated) {
    return {
      tone: 'danger',
      label: 'Emulator',
      detail:
        'This app is running in a simulator. Identity signals from this device are not trusted.',
    };
  }

  if (integrity.compromised) {
    return {
      tone: 'danger',
      label: 'Device modified',
      detail:
        'Root or jailbreak detected. Every signal from this device is downgraded, because a modified device can forge them.',
    };
  }

  return {
    tone: 'warning',
    label: 'Attestation unavailable',
    detail:
      'Hardware attestation needs a development build. Your device is recognised by its fingerprint, which is weaker but still contributes.',
  };
}
