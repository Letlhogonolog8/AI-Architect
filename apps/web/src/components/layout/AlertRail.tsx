import { motion, AnimatePresence } from 'framer-motion';
import { BellOff } from 'lucide-react';
import { EmptyState, StatusPill, Surface } from '@aegisdrive/ui';
import { relativeTime } from '@aegisdrive/shared';
import { useCommandCentreStore } from '@/stores/command-centre.store';

/**
 * Live alert rail.
 *
 * Fed entirely from the realtime store rather than a polled query — an alert
 * that arrives on the socket must appear immediately, not on the next refetch
 * tick. Newest first, because during an incident the top of this list is the
 * only part an operator reads.
 */
export function AlertRail() {
  const alerts = useCommandCentreStore((state) => state.liveAlerts);

  return (
    <aside
      aria-label="Live alerts"
      className="hidden w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-hairline bg-abyss/60 p-4 backdrop-blur-xl xl:flex"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-overline font-semibold uppercase text-ink-tertiary">Live alerts</h2>
        {alerts.length > 0 && (
          <span data-numeric className="text-xs font-semibold text-signal-critical">
            {alerts.length}
          </span>
        )}
      </div>

      {alerts.length === 0 ? (
        <EmptyState
          icon={<BellOff className="size-5" aria-hidden />}
          title="No active alerts"
          description="Incoming alerts appear here the moment the platform raises them."
        />
      ) : (
        <AnimatePresence initial={false}>
          {alerts.map((alert) => (
            <motion.div
              key={alert.id}
              layout
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <Surface
                elevation="raised"
                padding="sm"
                alarm={alert.severity === 'CRITICAL'}
                className="space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-ink-primary">{alert.title}</p>
                  <StatusPill
                    status={{ kind: 'severity', value: alert.severity }}
                    size="sm"
                    pulse={alert.severity === 'CRITICAL'}
                  />
                </div>
                <p className="line-clamp-3 text-[11px] leading-relaxed text-ink-secondary">
                  {alert.message}
                </p>
                <p className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                  {relativeTime(alert.raisedAt)}
                </p>
              </Surface>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </aside>
  );
}
