/**
 * Smartwatch pairing and transport.
 *
 * A watch is the best covert panic channel there is: it is already on the
 * driver's wrist, a press looks like checking the time, and it works with the
 * phone in a bag or a door pocket.
 *
 * ## Why this is an interface
 *
 * There is no single watch API. The three real options need different native
 * code, and none of them work in Expo Go:
 *
 *   | Target            | Mechanism                        | Requires |
 *   | ----------------- | -------------------------------- | -------- |
 *   | Apple Watch       | WatchConnectivity + a watchOS app | Dev build + separate watch target |
 *   | Wear OS           | Wearable Data Layer + a Wear app  | Dev build + separate Wear module |
 *   | Generic BLE band  | GATT characteristic write         | Dev build + `react-native-ble-plx` |
 *
 * So the app defines the protocol and the pairing state machine here, and a
 * transport is registered at startup by whichever build supports one. The
 * pairing screen, the panic routing and the battery/latency telemetry are then
 * identical across all three.
 */

export const WatchPairingState = {
  /** No transport is compiled into this build. */
  UNSUPPORTED: 'UNSUPPORTED',
  UNPAIRED: 'UNPAIRED',
  SCANNING: 'SCANNING',
  PAIRING: 'PAIRING',
  PAIRED: 'PAIRED',
  /** Paired, but the watch is out of range or its battery is dead. */
  DISCONNECTED: 'DISCONNECTED',
  ERROR: 'ERROR',
} as const;
export type WatchPairingState = (typeof WatchPairingState)[keyof typeof WatchPairingState];

export interface WatchDevice {
  id: string;
  name: string;
  /** `APPLE_WATCH`, `WEAR_OS`, `BLE_BAND`. */
  kind: string;
  /** 0-100, when the device reports it. */
  batteryPercent: number | null;
  /** Signal strength in dBm. Null for non-BLE transports. */
  rssi: number | null;
  lastSeenAt: string;
}

/**
 * Messages the watch sends to the phone.
 *
 * `PANIC` is the one that matters. `HEARTBEAT` exists so the phone can tell the
 * difference between "the watch is quiet" and "the watch is gone" — a paired
 * panic button that silently stopped working is worse than no panic button,
 * because the driver is relying on it.
 */
export type WatchInboundMessage =
  | { type: 'PANIC'; pressedAt: string }
  | { type: 'PANIC_CANCEL'; pressedAt: string }
  | { type: 'HEARTBEAT'; batteryPercent: number | null; sentAt: string }
  | { type: 'ACK'; ofMessageId: string };

/** Messages the phone sends to the watch. */
export type WatchOutboundMessage =
  | { type: 'STATUS'; protectionActive: boolean; incidentOpen: boolean }
  | { type: 'HAPTIC'; pattern: 'CONFIRM' | 'ALERT' }
  | { type: 'CHECK_IN_REQUEST'; incidentId: string; message: string };

export interface WatchTransport {
  readonly name: string;
  readonly kind: string;
  isSupported(): Promise<boolean>;
  /** Discovers pairable devices. */
  scan(timeoutMs: number): Promise<WatchDevice[]>;
  pair(deviceId: string): Promise<WatchDevice>;
  unpair(): Promise<void>;
  send(message: WatchOutboundMessage): Promise<void>;
  /** Subscribes to inbound messages. Returns an unsubscribe function. */
  subscribe(handler: (message: WatchInboundMessage) => void): () => void;
}

/**
 * Beyond this without a heartbeat, the watch is treated as disconnected and the
 * driver is told. Two minutes: long enough to survive a brief range loss,
 * short enough that a dead watch is not silently trusted for an entire trip.
 */
export const HEARTBEAT_TIMEOUT_MS = 120_000;

/** Battery level below which the driver is warned the watch may not last the trip. */
export const LOW_BATTERY_PERCENT = 15;

class UnsupportedTransport implements WatchTransport {
  readonly name = 'none';
  readonly kind = 'NONE';

  async isSupported(): Promise<boolean> {
    return false;
  }

  async scan(): Promise<WatchDevice[]> {
    throw new Error(
      'Smartwatch pairing needs a development build. Expo Go cannot access WatchConnectivity, the Wear Data Layer or Bluetooth GATT.',
    );
  }

  async pair(): Promise<WatchDevice> {
    throw new Error('No smartwatch transport is available in this build.');
  }

  async unpair(): Promise<void> {}

  async send(): Promise<void> {}

  subscribe(): () => void {
    return () => {};
  }
}

let transport: WatchTransport = new UnsupportedTransport();

/** Installs a transport. Called once at startup by a development build. */
export function registerWatchTransport(implementation: WatchTransport): void {
  transport = implementation;
}

export function watchTransport(): WatchTransport {
  return transport;
}
