import type { DroneObjective, GeoPoint } from '@aegisdrive/types';

/**
 * The drone-support provider contract.
 *
 * ## Why there is no drone in this build
 *
 * Flying an uncrewed aircraft over a moving vehicle is not a software feature.
 * It is a beyond-visual-line-of-sight operation in civil airspace, which needs
 * an operator's certificate, airspace authorisation, a remote pilot, detect-and-
 * avoid, and a fallback for lost link — none of which a repository can ship. So
 * no provider is installed, and `requireDroneProvider` throws rather than
 * pretending a flight happened.
 *
 * What *is* built is everything that is the platform's judgement: what to task a
 * drone to do, where to send it, which recovery it belongs to, and how the
 * result is recorded. That is the same split as the road-graph router and the
 * emergency channels — the reviewable decisions here, the regulated commodity
 * behind an interface that a certified operator's integration fills later.
 *
 * ## The honesty rule
 *
 * With no provider registered, a drone task is recorded as `UNAVAILABLE`: the
 * platform intended aerial support and has no way to provide it, and says so. It
 * is not `FAILED` (a provider that tried and could not) and never `LAUNCHED`. A
 * control room that believes a drone is overhead when none is will make a worse
 * decision than one that knows it is on its own.
 */

export const DRONE_PROVIDER_CONTRACT_VERSION = 'drone-provider-v1' as const;

export class DroneProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DroneProviderUnavailableError';
  }
}

export interface DroneTaskRequest {
  droneReference: string;
  objective: DroneObjective;
  target: GeoPoint | null;
}

export interface DroneTaskResult {
  /** True once the provider has committed an asset. */
  accepted: boolean;
  /** The provider's own task/flight identifier. */
  externalReference?: string;
}

/**
 * A drone-tasking provider.
 *
 * Deliberately narrow: task and report. It does not decide whether a flight is
 * lawful or safe — that gate belongs to the certified operator the provider
 * fronts, not to this platform, which is why the contract carries no "approved"
 * flag this side could set.
 */
export interface DroneProvider {
  readonly providerId: string;
  isAvailable(): Promise<boolean>;
  task(request: DroneTaskRequest): Promise<DroneTaskResult>;
}

let installed: DroneProvider | null = null;

export function registerDroneProvider(provider: DroneProvider): void {
  installed = provider;
}

export function registeredDroneProvider(): DroneProvider | null {
  return installed;
}

/**
 * Returns the installed provider, or throws with a message that says what is
 * missing rather than a generic failure. The service catches this and records
 * the task as `UNAVAILABLE` rather than surfacing an error — an unfulfilled
 * request is a state, not a fault.
 */
export function requireDroneProvider(): DroneProvider {
  if (installed === null) {
    throw new DroneProviderUnavailableError(
      'No drone-support provider is installed, so no aerial task can be flown. The tasking ' +
        'model, objectives and recovery linkage are all built; what is missing is a certified ' +
        'uncrewed-aircraft operator integration and the airspace authorisation behind it. ' +
        'Register one with registerDroneProvider() — see ADR-0013.',
    );
  }
  return installed;
}

export function resetDroneProvider(): void {
  installed = null;
}
