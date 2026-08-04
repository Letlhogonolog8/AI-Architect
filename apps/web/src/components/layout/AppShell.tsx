import { Outlet, useLocation } from 'react-router';
import { motion } from 'framer-motion';
import { useUiStore } from '@/stores/ui.store';
import { useCommandCentreStore } from '@/stores/command-centre.store';
import { useRealtimeStream } from '@/features/command-centre/useRealtimeStream';
import { useFleetSnapshot } from '@/features/dashboard/dashboard.queries';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { AlertRail } from './AlertRail';

/**
 * The authenticated application frame.
 *
 * Owns the realtime connection for the whole session: opened once when the user
 * enters the app and torn down on sign-out. Pages and widgets read the store
 * rather than opening their own sockets — fifteen widgets each subscribing
 * would mean fifteen handler chains for the same message.
 */
export function AppShell() {
  const location = useLocation();
  const alertRailOpen = useUiStore((state) => state.alertRailOpen);
  const liveAlerts = useCommandCentreStore((state) => state.liveAlerts);
  const snapshotFromSocket = useCommandCentreStore((state) => state.snapshot);
  const { data: polledSnapshot } = useFleetSnapshot();

  // The socket is authoritative when it is delivering; the polled query is the
  // fallback that keeps the shell correct if the stream is down.
  const snapshot = snapshotFromSocket ?? polledSnapshot;

  useRealtimeStream();

  return (
    <div className="flex h-dvh overflow-hidden bg-void text-ink-primary">
      <Sidebar
        counts={{
          openIncidents: snapshot?.openIncidents,
          openAlerts: snapshot?.openAlerts,
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar posture={snapshot?.postureLevel} unreadAlerts={liveAlerts.length} />

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto grid-backdrop">
            {/*
              Keyed on pathname so the transition replays per route. The
              distance is small on purpose: a control-room operator switching
              screens under pressure should perceive responsiveness, not
              choreography.
            */}
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto max-w-[1600px] px-6 py-8"
            >
              <ErrorBoundary>
                <Outlet />
              </ErrorBoundary>
            </motion.div>
          </main>

          {alertRailOpen && <AlertRail />}
        </div>
      </div>
    </div>
  );
}
