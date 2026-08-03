import { Activity, FlaskConical, Radio, WifiOff } from 'lucide-react';
import { Badge, PageHeader, cn } from '@aegisdrive/ui';
import { APP_NAME } from '@aegisdrive/shared';
import { WidgetGrid } from '@/components/widgets/WidgetGrid';
import { COMMAND_CENTRE_LAYOUT } from '@/config/dashboard-layout';
import { useCommandCentreStore } from '@/stores/command-centre.store';
import { isSimulated } from '@/data';
import { useCurrentUser } from '@/stores/auth.store';

/**
 * AEGISDRIVE Command Centre.
 *
 * The page owns exactly two things: the header and the layout it hands to the
 * grid. It renders no widget markup of its own — every panel comes from
 * `COMMAND_CENTRE_LAYOUT`, so the board is reconfigurable without touching this
 * file.
 *
 * The realtime connection is opened once by `AppShell` for the whole session,
 * not here: the alert rail needs it on every screen, and a second connection
 * per page would double the socket load for the same messages.
 */
export function DashboardPage() {
  const user = useCurrentUser();
  const connection = useCommandCentreStore((state) => state.connection);
  const lastMessageAt = useCommandCentreStore((state) => state.lastMessageAt);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Security Operations Centre"
        title={`${APP_NAME} Command Centre`}
        description={
          user
            ? `Signed in as ${user.firstName} ${user.lastName} · ${user.roles.join(' · ')}`
            : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            {isSimulated ? <SimulationBadge /> : null}
            <ConnectionBadge state={connection} lastMessageAt={lastMessageAt} />
          </div>
        }
      />

      <WidgetGrid widgets={COMMAND_CENTRE_LAYOUT} />
    </div>
  );
}

/**
 * Unmissable marker that the board is showing generated data.
 *
 * Deliberately loud. An operator must never be able to glance at this screen
 * and believe a simulated hijacking is real — nor the reverse, which is worse.
 */
function SimulationBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill border border-signal-warning/40 bg-signal-warning/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-signal-warning"
      title="VITE_DATA_SOURCE=mock — all vehicles, threats and positions on this screen are generated. Not operational data."
    >
      <FlaskConical className="size-3" aria-hidden />
      Simulation
    </span>
  );
}

function ConnectionBadge({
  state,
  lastMessageAt,
}: {
  state: string;
  lastMessageAt: number | null;
}) {
  if (state === 'connected') {
    const secondsSince = lastMessageAt ? Math.round((Date.now() - lastMessageAt) / 1000) : null;
    // Silence on a connected socket is its own failure mode: the transport is
    // up but nothing is arriving. Surfaced rather than shown as healthy.
    const stale = secondsSince !== null && secondsSince > 15;

    return (
      <Badge tone={stale ? 'warning' : 'live'}>
        <Activity className={cn('size-3', !stale && 'animate-pulse')} aria-hidden />
        {stale ? `No data ${secondsSince}s` : 'Streaming'}
      </Badge>
    );
  }

  if (state === 'connecting' || state === 'reconnecting') {
    return (
      <Badge tone="warning">
        <Radio className="size-3 animate-pulse" aria-hidden />
        {state === 'connecting' ? 'Connecting' : 'Reconnecting'}
      </Badge>
    );
  }

  return (
    <Badge tone="danger" title="Live feed unavailable — everything on screen may be stale">
      <WifiOff className="size-3" aria-hidden />
      Feed down
    </Badge>
  );
}
