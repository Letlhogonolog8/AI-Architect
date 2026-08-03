import { useState, type FormEvent } from 'react';
import { Bell, Mail, MessageSquare, Phone, Send, Smartphone, Webhook } from 'lucide-react';
import { NotificationChannel, type NotificationChannel as Channel } from '@aegisdrive/types';
import { Badge, Button, Field, Input, cn } from '@aegisdrive/ui';
import { useSendNotification } from '@/features/command-centre/command-centre.queries';
import { useAuthStore } from '@/stores/auth.store';
import { Widget } from './Widget';

/**
 * Notification dispatch.
 *
 * Composes a message and fans it out across channels. The API only enqueues —
 * `services/notifications` owns delivery, retries and provider selection — so
 * this returns as soon as the rows are durable rather than waiting on an SMS
 * gateway that can block for thirty seconds.
 *
 * Channel selection is explicit rather than a "notify everyone" button. Voice
 * and SMS wake people up; sending them by accident at 03:00 erodes the trust
 * that makes an operator answer the next one.
 */

const CHANNEL_META: Record<Channel, { label: string; icon: typeof Bell; hint: string }> = {
  IN_APP: { label: 'In-app', icon: Bell, hint: 'Console notification' },
  PUSH: { label: 'Push', icon: Smartphone, hint: 'Mobile device push' },
  SMS: { label: 'SMS', icon: MessageSquare, hint: 'Text message' },
  EMAIL: { label: 'Email', icon: Mail, hint: 'Email' },
  VOICE: { label: 'Voice', icon: Phone, hint: 'Automated voice call' },
  WEBHOOK: { label: 'Webhook', icon: Webhook, hint: 'Partner integration' },
};

const AUDIENCES = [
  { id: 'control-room', label: 'Control room', size: 6 },
  { id: 'armed-response', label: 'Armed response', size: 14 },
  { id: 'drivers-affected', label: 'Affected drivers', size: 3 },
  { id: 'management', label: 'Management', size: 4 },
] as const;

export function NotificationDispatchWidget() {
  const send = useSendNotification();
  const canSend = useAuthStore((state) => state.canAny(['notification:send']));

  const [audience, setAudience] = useState<string>(AUDIENCES[0].id);
  const [channels, setChannels] = useState<Set<Channel>>(
    new Set([NotificationChannel.IN_APP, NotificationChannel.PUSH]),
  );
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const selectedAudience = AUDIENCES.find((entry) => entry.id === audience) ?? AUDIENCES[0];
  const recipientCount = selectedAudience.size;
  const messageCount = recipientCount * channels.size;

  const toggleChannel = (channel: Channel): void => {
    setChannels((current) => {
      const next = new Set(current);
      if (next.has(channel)) {
        next.delete(channel);
      } else {
        next.add(channel);
      }
      return next;
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canSend || channels.size === 0) return;

    send.mutate(
      {
        // Audience → user ids is resolved server-side once the directory
        // endpoint exists; the id is passed through as a group reference.
        recipientUserIds: Array.from({ length: recipientCount }, (_, i) => `${audience}:${i}`),
        channels: [...channels],
        subject,
        body,
      },
      {
        onSuccess: () => {
          setSubject('');
          setBody('');
        },
      },
    );
  };

  return (
    <Widget
      title="Notification dispatch"
      subtitle="Fan out to responders, drivers and management"
      className="h-full"
      actions={
        send.isSuccess ? (
          <Badge tone="success">{send.data.queued} queued</Badge>
        ) : (
          <Badge tone="neutral">{messageCount} messages</Badge>
        )
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-tertiary">
            Audience
          </p>
          <div className="flex flex-wrap gap-1">
            {AUDIENCES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setAudience(entry.id)}
                aria-pressed={audience === entry.id}
                className={cn(
                  'rounded-pill border px-2 py-0.5 text-[10px] font-medium transition-colors',
                  audience === entry.id
                    ? 'border-aegis-500/35 bg-aegis-500/12 text-aegis-100'
                    : 'border-hairline bg-white/3 text-ink-tertiary hover:text-ink-secondary',
                )}
              >
                {entry.label}
                <span data-numeric className="ml-1 opacity-70">
                  {entry.size}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-tertiary">
            Channels
          </p>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(CHANNEL_META) as Channel[]).map((channel) => {
              const meta = CHANNEL_META[channel];
              const Icon = meta.icon;
              const active = channels.has(channel);
              // Voice and SMS are intrusive; mark them so a mis-click is visible.
              const intrusive =
                channel === NotificationChannel.VOICE || channel === NotificationChannel.SMS;

              return (
                <button
                  key={channel}
                  type="button"
                  onClick={() => toggleChannel(channel)}
                  aria-pressed={active}
                  title={meta.hint}
                  className={cn(
                    'flex items-center gap-1 rounded-control border px-1.5 py-1 text-[10px] font-medium transition-colors',
                    active
                      ? intrusive
                        ? 'border-signal-warning/40 bg-signal-warning/12 text-signal-warning'
                        : 'border-aegis-500/35 bg-aegis-500/12 text-aegis-100'
                      : 'border-hairline bg-white/3 text-ink-tertiary hover:text-ink-secondary',
                  )}
                >
                  <Icon className="size-3" aria-hidden />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <Field label="Subject" required>
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Vehicle under threat — immediate response required"
              maxLength={160}
              required
            />
          )}
        </Field>

        <Field label="Message" required hint={`${body.length}/500`}>
          {({ id, describedBy }) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={3}
              maxLength={500}
              required
              placeholder="Include vehicle registration, last known position and heading."
              className="w-full resize-none rounded-control border border-hairline bg-white/4 px-3 py-2 text-xs text-ink-primary placeholder:text-ink-tertiary focus:border-aegis-500/60 focus:outline-none"
            />
          )}
        </Field>

        {send.isError ? (
          <p role="alert" className="text-[11px] text-signal-critical">
            {send.error.message}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          size="sm"
          block
          loading={send.isPending}
          disabled={!canSend || channels.size === 0 || subject.length === 0 || body.length === 0}
          leadingIcon={<Send className="size-3.5" aria-hidden />}
          title={canSend ? undefined : 'Requires the notification:send permission'}
        >
          {canSend ? `Dispatch to ${recipientCount} recipients` : 'Dispatch not permitted'}
        </Button>
      </form>
    </Widget>
  );
}
