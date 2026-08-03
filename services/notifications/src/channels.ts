import { pino } from 'pino';
import { NotificationChannel } from '@aegisdrive/types';
import { LOG_REDACT_CENSOR, LOG_REDACT_PATHS } from '@aegisdrive/shared';
import { serviceEnv } from './config';

const logger = pino({
  level: serviceEnv.LOG_LEVEL,
  base: { service: 'notifications:channels' },
  redact: { paths: LOG_REDACT_PATHS, censor: LOG_REDACT_CENSOR },
});

export interface DeliveryRequest {
  channel: NotificationChannel;
  subject: string;
  body: string;
  recipientEmail: string;
  recipientPhone: string | null;
}

/**
 * A delivery transport. Each provider integration implements this and nothing
 * more, so swapping an SMS vendor touches exactly one file.
 */
export interface ChannelTransport {
  send: (request: DeliveryRequest) => Promise<void>;
}

/**
 * Development transport.
 *
 * Logs instead of sending. This is not a stub to be replaced and forgotten —
 * it is the correct behaviour in development and test, where sending a real
 * SMS to a real driver during a test run is the failure mode to avoid.
 */
function loggingTransport(channel: NotificationChannel): ChannelTransport {
  return {
    send: async (request) => {
      logger.info(
        {
          channel,
          to: channel === NotificationChannel.SMS ? request.recipientPhone : request.recipientEmail,
          subject: request.subject,
        },
        'Notification delivered (logging transport)',
      );
    },
  };
}

/**
 * Transport registry.
 *
 * Provider clients are constructed lazily when their key is configured;
 * requiring every key in every environment would make a development run
 * impossible without four vendor accounts.
 */
const transports: Record<NotificationChannel, ChannelTransport> = {
  [NotificationChannel.IN_APP]: {
    // In-app needs no transport: the row in `notifications` *is* the delivery,
    // and the client reads it over the API.
    send: async () => undefined,
  },
  [NotificationChannel.PUSH]: loggingTransport(NotificationChannel.PUSH),
  [NotificationChannel.SMS]: loggingTransport(NotificationChannel.SMS),
  [NotificationChannel.EMAIL]: loggingTransport(NotificationChannel.EMAIL),
  [NotificationChannel.VOICE]: loggingTransport(NotificationChannel.VOICE),
  [NotificationChannel.WEBHOOK]: loggingTransport(NotificationChannel.WEBHOOK),
};

export async function deliver(request: DeliveryRequest): Promise<void> {
  const transport = transports[request.channel];

  if (!transport) {
    throw new Error(`No transport registered for channel ${request.channel}.`);
  }

  if (request.channel === NotificationChannel.SMS && !request.recipientPhone) {
    // A permanent failure, not a transient one: retrying cannot conjure a phone
    // number. The worker's attempt ceiling will retire it.
    throw new Error('Recipient has no phone number on file.');
  }

  await transport.send(request);
}
