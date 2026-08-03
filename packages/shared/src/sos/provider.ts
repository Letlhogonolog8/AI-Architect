import type { EmergencyChannel, EmergencyDispatchPayload } from '@aegisdrive/types';

/**
 * The emergency-channel provider contract.
 *
 * ## Why there is no live channel in this build
 *
 * Actually reaching the police, an armed-response company, a family member or an
 * insurer means an integration this repository does not ship: a national
 * emergency-services gateway, a security company's dispatch API, an SMS/voice
 * carrier, an insurer's claims webhook. Each is a commercial contract and a
 * jurisdiction-specific one, so none is installed here.
 *
 * What *is* built is everything that is the platform's own judgement: when an
 * activation fans out, to which channels, with what minimised payload, how a
 * result is recorded, and — the point of this file — the refusal to record a
 * delivery nobody made. That split is the same one the road-graph provider and
 * the AI gateway draw: the judgement is in reviewable code, the commodity is
 * behind an interface.
 *
 * ## The honesty rule
 *
 * When no provider is registered for a channel, a dispatch to that channel is
 * recorded as `UNCONFIGURED` — not `SENT`, not `FAILED`. `SENT` would be a lie
 * an operator acts on; `FAILED` would imply the platform tried and a provider
 * refused, when in truth there was nothing to try. The dispatch still exists, so
 * the control room sees exactly who has not been reached and can fall back to a
 * phone in their hand. This is the `NotImplementedError`/501 principle expressed
 * as a row rather than a status code.
 *
 * ## What a provider must not do
 *
 * A provider transmits the payload it is given and returns what the recipient
 * said back. It does **not** decide whether to send, enrich the payload, or add
 * recipients — all of that is `policy.ts`, where it is bounded, minimised and
 * audited. A provider that quietly attached a driver's identity or a live
 * location feed would defeat the data-minimisation boundary invisibly, from
 * inside a vendor SDK nobody reviews.
 */

export const CHANNEL_PROVIDER_CONTRACT_VERSION = 'emergency-channel-provider-v1' as const;

/** The result a provider reports for one transmission. */
export interface ChannelDeliveryResult {
  /**
   * `DELIVERED` when the recipient's system confirmed receipt, `ACKNOWLEDGED`
   * when it returned an actionable reference (a case number). A provider must
   * not report either optimistically — an unacknowledged send is `SENT`, which
   * the engine sets before calling, so a provider that cannot confirm simply
   * returns `delivered: false`.
   */
  delivered: boolean;
  acknowledged: boolean;
  /** The reference the recipient returned, e.g. a police case number. */
  externalReference?: string;
  /** The endpoint actually used, when the provider resolved one. */
  recipientContact?: string;
}

export class ChannelDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChannelDeliveryError';
  }
}

export interface ChannelSendRequest {
  /** Where it is going, as named by the operator or the routing policy. */
  recipientReference: string;
  recipientContact: string | null;
  /** The minimised content. A provider transmits this and adds nothing. */
  payload: EmergencyDispatchPayload;
}

/**
 * A single external channel — police, security, family or insurance.
 *
 * Deliberately narrow: transmit and report. Everything that is policy rather
 * than transport stays out of it.
 */
export interface EmergencyChannelProvider {
  /** The channel this provider serves. */
  readonly channel: EmergencyChannel;
  /** Versioned, e.g. `police-webhook-v1`. Recorded on every dispatch it handles. */
  readonly providerId: string;

  isAvailable(): Promise<boolean>;
  send(request: ChannelSendRequest): Promise<ChannelDeliveryResult>;
}

const registry = new Map<EmergencyChannel, EmergencyChannelProvider>();

/** Installs (or replaces) the provider for a channel. */
export function registerChannelProvider(provider: EmergencyChannelProvider): void {
  registry.set(provider.channel, provider);
}

/** The provider for a channel, or `null` when none is installed. */
export function channelProvider(channel: EmergencyChannel): EmergencyChannelProvider | null {
  return registry.get(channel) ?? null;
}

/** For diagnostics and the health surface: which channels can actually be reached. */
export function configuredChannels(): EmergencyChannel[] {
  return [...registry.keys()];
}

/** Test and boot-time hygiene — clears every registration. */
export function resetChannelProviders(): void {
  registry.clear();
}
