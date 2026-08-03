import type { Prisma } from '@prisma/client';
import type {
  AuthUser,
  EmergencyChannel,
  EmergencyDispatchPayload,
  Paginated,
  SosActivation,
  SosActivationDetail,
  SosActivationMethod as SosActivationMethodType,
  SosStatus as SosStatusType,
} from '@aegisdrive/types';
import {
  AuditAction,
  DispatchStatus,
  EmergencyChannel as Channel,
  REACHED_DISPATCH_STATUSES,
  SosActivationMethod,
  SosStatus as Status,
} from '@aegisdrive/types';
import {
  BadRequestError,
  ChannelDeliveryError,
  ConflictError,
  NotFoundError,
  SOS_DEDUPE_WINDOW_SECONDS,
  SOS_INCIDENT_SEVERITY,
  SOS_INCIDENT_TYPE,
  channelProvider,
  channelsForActivation,
  configuredChannels,
  dispatchSummary,
  normalisePagination,
  paginate,
} from '@aegisdrive/shared';
import { moduleLogger } from '../../core/logger';
import { recordAudit } from '../audit-logs/audit.service';
import {
  emitDispatchUpdated,
  emitIncidentCreated,
  emitSosRaised,
  emitSosUpdated,
} from '../../realtime/emitter';
import {
  allocateReference,
  appendTimelineEntry,
  insertIncident,
} from '../incidents/incident.repository';
import { toIncidentDto } from '../incidents/incident.mapper';
import * as repository from './sos.repository';
import { toActivationDetailDto, toDispatchDto } from './sos.mapper';
import type {
  AcknowledgeSosInput,
  ActivateSosInput,
  DispatchSosInput,
  ListActivationsQuery,
  ResolveSosInput,
} from './sos.schema';

const log = moduleLogger('sos');

/**
 * Permitted status transitions.
 *
 * Forward-only, like an incident's, and terminal states accept nothing further.
 * `ACKNOWLEDGED` is reachable only from an open state, and the three terminal
 * dispositions only from an open one — an operator cannot re-open a stood-down
 * activation, because the record of what was decided must not be rewritten.
 */
const ALLOWED_TRANSITIONS: Record<SosStatusType, readonly SosStatusType[]> = {
  [Status.ACTIVATED]: [
    Status.DISPATCHING,
    Status.ACKNOWLEDGED,
    Status.RESOLVED,
    Status.CANCELLED,
    Status.FALSE_ALARM,
  ],
  [Status.DISPATCHING]: [
    Status.ACKNOWLEDGED,
    Status.RESOLVED,
    Status.CANCELLED,
    Status.FALSE_ALARM,
  ],
  [Status.ACKNOWLEDGED]: [Status.RESOLVED, Status.CANCELLED, Status.FALSE_ALARM],
  [Status.RESOLVED]: [],
  [Status.CANCELLED]: [],
  [Status.FALSE_ALARM]: [],
};

const METHOD_LABELS: Record<SosActivationMethodType, string> = {
  [SosActivationMethod.HIDDEN_BUTTON]: 'hidden button',
  [SosActivationMethod.DURESS_PIN]: 'duress PIN',
  [SosActivationMethod.DURESS_PHRASE]: 'duress phrase',
  [SosActivationMethod.POWER_BUTTON_SEQUENCE]: 'power-button sequence',
  [SosActivationMethod.APP_GESTURE]: 'covert app gesture',
  [SosActivationMethod.WEARABLE]: 'panic wearable',
  [SosActivationMethod.DEADMAN]: 'dead-man timeout',
  [SosActivationMethod.DECISION_ENGINE]: 'threat decision engine',
};

/** A default label for a channel, which an operator can override on dispatch. */
const DEFAULT_RECIPIENT: Record<EmergencyChannel, string> = {
  [Channel.POLICE]: 'Law enforcement',
  [Channel.PRIVATE_SECURITY]: 'Contracted armed response',
  [Channel.FAMILY]: 'Nominated emergency contact',
  [Channel.INSURANCE]: 'Vehicle insurer',
};

// ---------------------------------------------------------------- activation

/**
 * Raises a silent SOS.
 *
 * Opens a CRITICAL incident so the control room sees it at once, records the
 * activation, and fans the emergency out to the external parties its method
 * targets. Everything the caller could observe is deliberately uniform — the
 * controller answers the same neutral receipt whether this opened a fresh
 * emergency or folded a repeat — so a captor watching the driver's screen learns
 * nothing.
 *
 * Delivery to the external channels is kicked off but **not awaited**: the
 * activation must return instantly, and a slow or dead provider must never hold
 * up the acknowledgement the app is waiting for.
 */
export async function activateSos(
  user: AuthUser,
  input: ActivateSosInput,
): Promise<SosActivationDetail> {
  const method = input.method;
  const source =
    input.source ??
    (method === SosActivationMethod.DECISION_ENGINE ? 'decision-engine' : 'mobile-app');
  const confidence =
    method === SosActivationMethod.DECISION_ENGINE ? (input.confidence ?? null) : null;
  const position = input.position ?? null;

  // Fold a repeat from the same vehicle into the open emergency rather than
  // opening a second one. Ten police dispatches for one event is how a real
  // alarm gets dismissed as a malfunction.
  if (input.vehicleId) {
    const since = new Date(Date.now() - SOS_DEDUPE_WINDOW_SECONDS * 1_000);
    const open = await repository.findRecentOpenActivationForVehicle(
      user.organizationId,
      input.vehicleId,
      since,
    );

    if (open) {
      if (open.incidentId) {
        await appendTimelineEntry({
          incidentId: open.incidentId,
          kind: 'NOTE',
          message: `Repeat silent activation via ${METHOD_LABELS[method]} folded into this incident.`,
          actorUserId: null,
          metadata: { method, source, deduped: true },
        });
      }

      log.warn(
        { activationId: open.id, vehicleId: input.vehicleId, method },
        'Silent SOS de-duplicated into open activation',
      );

      void recordAudit({
        organizationId: user.organizationId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: AuditAction.UPDATE,
        resourceType: 'sos_activation',
        resourceId: open.id,
        metadata: { method, source, deduped: true },
      });

      return toActivationDetailDto(open);
    }
  }

  // Open the incident first — it carries the human-quotable reference the
  // dispatch payload needs.
  const reference = await allocateReference(user.organizationId);
  const incidentRow = await insertIncident(user.organizationId, {
    reference,
    type: SOS_INCIDENT_TYPE,
    severity: SOS_INCIDENT_SEVERITY,
    title: `Silent SOS — ${METHOD_LABELS[method]}`,
    summary:
      `A silent emergency was raised via the ${METHOD_LABELS[method]}. Covert response is ` +
      `engaged: nothing has been surfaced to the vehicle, and nothing will be. Verify quietly.`,
    longitude: position?.longitude ?? null,
    latitude: position?.latitude ?? null,
    detectedAt: new Date(),
    aiConfidence: confidence,
    ...(input.vehicleId ? { vehicle: { connect: { id: input.vehicleId } } } : {}),
    ...(input.driverId ? { driver: { connect: { id: input.driverId } } } : {}),
  });

  await appendTimelineEntry({
    incidentId: incidentRow.id,
    kind: 'STATUS_CHANGE',
    message: `Silent SOS raised via ${METHOD_LABELS[method]}.`,
    actorUserId: null,
    metadata: { method, source, confidence },
  });

  emitIncidentCreated(toIncidentDto(incidentRow));

  const activationRow = await repository.insertActivation(user.organizationId, {
    method,
    status: Status.ACTIVATED,
    covert: true,
    longitude: position?.longitude ?? null,
    latitude: position?.latitude ?? null,
    confidence,
    source,
    ...(input.vehicleId ? { vehicle: { connect: { id: input.vehicleId } } } : {}),
    ...(input.driverId ? { driver: { connect: { id: input.driverId } } } : {}),
    incident: { connect: { id: incidentRow.id } },
  });

  // Build the minimised payload every dispatch carries.
  const vehicleRegistration = input.vehicleId
    ? await repository.findVehicleRegistration(user.organizationId, input.vehicleId)
    : null;

  const payload: EmergencyDispatchPayload = {
    incidentReference: incidentRow.reference,
    vehicleRegistration,
    position,
    activatedAt: activationRow.activatedAt.toISOString(),
    summary: dispatchSummary(vehicleRegistration),
  };

  const channels = channelsForActivation(method);
  await repository.insertDispatches(
    channels.map((channel) => ({
      organizationId: user.organizationId,
      activationId: activationRow.id,
      channel,
      status: DispatchStatus.PENDING,
      recipientReference: DEFAULT_RECIPIENT[channel],
      recipientContact: null,
      payload: payload as unknown as Prisma.InputJsonValue,
    })),
  );

  const dispatching = await repository.updateActivationById(user.organizationId, activationRow.id, {
    status: Status.DISPATCHING,
  });
  const detail = toActivationDetailDto(dispatching ?? activationRow);

  log.warn(
    { activationId: activationRow.id, method, source, channels },
    'Silent SOS raised — covert response engaged',
  );

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'sos_activation',
    resourceId: activationRow.id,
    metadata: { method, source, channels, incidentId: incidentRow.id },
  });

  emitSosRaised(detail);

  // Deliver without blocking the acknowledgement. With no provider installed
  // this resolves instantly to UNCONFIGURED; with one it may take time the
  // driver's app must never wait on.
  void deliverActivationDispatches(user.organizationId, activationRow.id).catch((error) => {
    log.error({ err: error, activationId: activationRow.id }, 'Dispatch fan-out failed');
  });

  return detail;
}

/**
 * Delivers every still-pending dispatch for an activation.
 *
 * Honest by construction: a channel with no registered provider becomes
 * `UNCONFIGURED`, never `SENT`. The platform records that it intended to reach a
 * party and could not, rather than a delivery nobody made.
 */
async function deliverActivationDispatches(
  organizationId: string,
  activationId: string,
  onlyChannels?: readonly EmergencyChannel[],
): Promise<void> {
  const dispatches = await repository.findDispatchesByActivation(organizationId, activationId);

  for (const dispatch of dispatches) {
    if (dispatch.status !== DispatchStatus.PENDING) continue;
    if (onlyChannels && !onlyChannels.includes(dispatch.channel as EmergencyChannel)) continue;
    await deliverOne(
      organizationId,
      dispatch.id,
      dispatch.channel as EmergencyChannel,
      dispatch.payload,
    );
  }
}

async function deliverOne(
  organizationId: string,
  dispatchId: string,
  channel: EmergencyChannel,
  rawPayload: Prisma.JsonValue,
): Promise<void> {
  const provider = channelProvider(channel);
  const now = new Date();

  if (!provider) {
    const updated = await repository.updateDispatchById(organizationId, dispatchId, {
      status: DispatchStatus.UNCONFIGURED,
      lastAttemptAt: now,
    });
    log.warn(
      { dispatchId, channel },
      'No provider configured for channel — dispatch recorded UNCONFIGURED, not sent',
    );
    if (updated) emitDispatchUpdated(toDispatchDto(updated));
    return;
  }

  const sending = await repository.updateDispatchById(organizationId, dispatchId, {
    status: DispatchStatus.SENT,
    providerId: provider.providerId,
    sentAt: now,
    lastAttemptAt: now,
    attemptCount: { increment: 1 },
  });
  if (sending) emitDispatchUpdated(toDispatchDto(sending));

  try {
    const payload = rawPayload as unknown as EmergencyDispatchPayload;
    const result = await provider.send({
      recipientReference: sending?.recipientReference ?? DEFAULT_RECIPIENT[channel],
      recipientContact: sending?.recipientContact ?? null,
      payload,
    });

    const status = result.acknowledged
      ? DispatchStatus.ACKNOWLEDGED
      : result.delivered
        ? DispatchStatus.DELIVERED
        : DispatchStatus.SENT;

    const updated = await repository.updateDispatchById(organizationId, dispatchId, {
      status,
      externalReference: result.externalReference ?? null,
      ...(result.recipientContact ? { recipientContact: result.recipientContact } : {}),
      ...(result.acknowledged ? { acknowledgedAt: new Date() } : {}),
      failureReason: null,
    });
    if (updated) emitDispatchUpdated(toDispatchDto(updated));
  } catch (error) {
    const reason =
      error instanceof ChannelDeliveryError ? error.message : 'Delivery failed at the provider.';
    const updated = await repository.updateDispatchById(organizationId, dispatchId, {
      status: DispatchStatus.FAILED,
      failureReason: reason,
    });
    log.error({ err: error, dispatchId, channel }, 'Dispatch delivery failed');
    if (updated) emitDispatchUpdated(toDispatchDto(updated));
  }
}

// ------------------------------------------------------------------- reads

export async function listActivations(
  user: AuthUser,
  query: ListActivationsQuery,
): Promise<Paginated<SosActivationDetail>> {
  const pagination = normalisePagination(query);

  const { rows, total } = await repository.findActivations({
    ...pagination,
    organizationId: user.organizationId,
    status: query.status,
    method: query.method,
    vehicleId: query.vehicleId,
    driverId: query.driverId,
    openOnly: query.openOnly,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
  });

  return paginate(rows.map(toActivationDetailDto), pagination, total);
}

export async function getActivation(
  user: AuthUser,
  activationId: string,
): Promise<SosActivationDetail> {
  const row = await repository.findActivationById(user.organizationId, activationId);
  if (!row) throw new NotFoundError('SOS activation', activationId);
  return toActivationDetailDto(row);
}

// ---------------------------------------------------------------- handling

export async function acknowledgeActivation(
  user: AuthUser,
  activationId: string,
  input: AcknowledgeSosInput,
): Promise<SosActivationDetail> {
  const existing = await repository.findActivationById(user.organizationId, activationId);
  if (!existing) throw new NotFoundError('SOS activation', activationId);

  if (!ALLOWED_TRANSITIONS[existing.status as SosStatusType].includes(Status.ACKNOWLEDGED)) {
    throw new ConflictError(`An activation in ${existing.status} cannot be acknowledged.`);
  }

  const now = new Date();
  const row = await repository.updateActivationById(user.organizationId, activationId, {
    status: Status.ACKNOWLEDGED,
    acknowledgedAt: existing.acknowledgedAt ?? now,
    acknowledgedByUserId: user.id,
  });
  if (!row) throw new NotFoundError('SOS activation', activationId);

  if (existing.incidentId) {
    await appendTimelineEntry({
      incidentId: existing.incidentId,
      kind: 'NOTE',
      message: input.note ?? 'Silent SOS acknowledged by the control room.',
      actorUserId: user.id,
      metadata: { sosActivationId: activationId },
    });
  }

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'sos_activation',
    resourceId: activationId,
    metadata: { to: Status.ACKNOWLEDGED },
  });

  const detail = toActivationDetailDto(row);
  emitSosUpdated(detail);
  return detail;
}

/**
 * Stands an activation down.
 *
 * This is the **only** path to `CANCELLED`, and it is an authenticated
 * control-room act — never a vehicle one. A cancel affordance in the cabin is
 * the first thing a captor forces the driver to use, so it does not exist. A
 * `FALSE_ALARM` disposition requires a note: a mistaken trigger is the signal
 * that calibrates the method that produced it.
 *
 * Standing down cancels any dispatch that has not yet reached its party, but
 * leaves the incident's own status to the incident module — closing a CRITICAL
 * incident is its own reviewed act, not a side effect of this one.
 */
export async function resolveActivation(
  user: AuthUser,
  activationId: string,
  input: ResolveSosInput,
): Promise<SosActivationDetail> {
  const existing = await repository.findActivationById(user.organizationId, activationId);
  if (!existing) throw new NotFoundError('SOS activation', activationId);

  const permitted = ALLOWED_TRANSITIONS[existing.status as SosStatusType];
  if (!permitted.includes(input.disposition)) {
    throw new ConflictError(
      permitted.length === 0
        ? `An activation in ${existing.status} is already stood down.`
        : `An activation in ${existing.status} cannot move to ${input.disposition}.`,
    );
  }

  if (input.disposition === Status.FALSE_ALARM && !input.note) {
    throw new BadRequestError('A false-alarm disposition requires a note explaining why.');
  }

  const now = new Date();
  const row = await repository.updateActivationById(user.organizationId, activationId, {
    status: input.disposition,
    resolvedAt: now,
    resolvedByUserId: user.id,
    dispositionNote: input.note ?? null,
    acknowledgedAt: existing.acknowledgedAt ?? now,
    acknowledgedByUserId: existing.acknowledgedByUserId ?? user.id,
  });
  if (!row) throw new NotFoundError('SOS activation', activationId);

  const cancelled = await repository.cancelPendingDispatches(user.organizationId, activationId);

  if (existing.incidentId) {
    await appendTimelineEntry({
      incidentId: existing.incidentId,
      kind: 'NOTE',
      message: `Silent SOS stood down as ${input.disposition}.${input.note ? ` ${input.note}` : ''}`,
      actorUserId: user.id,
      metadata: { disposition: input.disposition, dispatchesCancelled: cancelled },
    });
  }

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'sos_activation',
    resourceId: activationId,
    metadata: { disposition: input.disposition, note: input.note, dispatchesCancelled: cancelled },
  });

  const detail = toActivationDetailDto(row);
  emitSosUpdated(detail);
  return detail;
}

// --------------------------------------------------------------- dispatch

/**
 * Manually fans an activation out, or retries it.
 *
 * With no channel, fills the gaps — every channel the method targets that has
 * not already been reached or queued. With a channel, dispatches to exactly that
 * party, which is the case where an operator adds a recipient the automatic path
 * did not, or retries one that failed. Transmitting a person's live location to
 * an outside party is why this needs `sos:dispatch` and not merely `sos:manage`.
 */
export async function dispatchActivation(
  user: AuthUser,
  activationId: string,
  input: DispatchSosInput,
): Promise<SosActivationDetail> {
  const existing = await repository.findActivationById(user.organizationId, activationId);
  if (!existing) throw new NotFoundError('SOS activation', activationId);

  if (ALLOWED_TRANSITIONS[existing.status as SosStatusType].length === 0) {
    throw new ConflictError('A stood-down activation cannot be dispatched.');
  }

  const targets: readonly EmergencyChannel[] = input.channel
    ? [input.channel]
    : channelsForActivation(existing.method as SosActivationMethodType);

  // Reuse the payload the fan-out already built and stored; every activation has
  // at least one dispatch row by the time it can be dispatched manually.
  const templatePayload = (existing.dispatches[0]?.payload ?? {
    incidentReference: null,
    vehicleRegistration: null,
    position:
      existing.longitude !== null && existing.latitude !== null
        ? { longitude: existing.longitude, latitude: existing.latitude }
        : null,
    activatedAt: existing.activatedAt.toISOString(),
    summary: dispatchSummary(null),
  }) as unknown as Prisma.InputJsonValue;

  const toDeliver: EmergencyChannel[] = [];

  for (const channel of targets) {
    const rows = existing.dispatches.filter((d) => d.channel === channel);
    const reached = rows.some((d) =>
      REACHED_DISPATCH_STATUSES.includes(d.status as (typeof REACHED_DISPATCH_STATUSES)[number]),
    );

    // Gap-fill mode leaves reached and in-flight channels alone.
    if (!input.channel) {
      const active = rows.some(
        (d) => d.status === DispatchStatus.PENDING || d.status === DispatchStatus.SENT,
      );
      if (reached || active) continue;
    }

    const retryable = rows.find(
      (d) =>
        d.status === DispatchStatus.FAILED ||
        d.status === DispatchStatus.UNCONFIGURED ||
        d.status === DispatchStatus.CANCELLED ||
        d.status === DispatchStatus.PENDING,
    );

    if (retryable && !reached) {
      await repository.updateDispatchById(user.organizationId, retryable.id, {
        status: DispatchStatus.PENDING,
        failureReason: null,
        ...(input.recipientReference ? { recipientReference: input.recipientReference } : {}),
        ...(input.recipientContact ? { recipientContact: input.recipientContact } : {}),
      });
    } else {
      await repository.insertDispatch({
        organizationId: user.organizationId,
        activationId,
        channel,
        status: DispatchStatus.PENDING,
        recipientReference: input.recipientReference ?? DEFAULT_RECIPIENT[channel],
        recipientContact: input.recipientContact ?? null,
        payload: templatePayload,
      });
    }

    toDeliver.push(channel);
  }

  if (toDeliver.length === 0) {
    throw new ConflictError(
      'Every targeted channel has already been reached or is in flight; nothing to dispatch.',
    );
  }

  await deliverActivationDispatches(user.organizationId, activationId, toDeliver);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.DISPATCH,
    resourceType: 'sos_activation',
    resourceId: activationId,
    metadata: { channels: toDeliver, manual: true },
  });

  const refreshed = await repository.findActivationById(user.organizationId, activationId);
  const detail = toActivationDetailDto(refreshed ?? existing);
  emitSosUpdated(detail);
  return detail;
}

// ---------------------------------------------------------------- channels

export interface ChannelStatus {
  channel: EmergencyChannel;
  /** Whether a live provider is installed. False for every channel in this build. */
  configured: boolean;
}

/**
 * Which emergency channels can actually be reached.
 *
 * An honest health surface: the control room can see at a glance that police,
 * security, family and insurance dispatch will record as `UNCONFIGURED` until a
 * provider is registered, rather than discovering it during an emergency.
 */
export function channelStatus(): ChannelStatus[] {
  const live = new Set(configuredChannels());
  return (Object.values(Channel) as EmergencyChannel[]).map((channel) => ({
    channel,
    configured: live.has(channel),
  }));
}

export type { SosActivation };
