import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { realtimeDriver } from '@/realtime';
import { useCommandCentreStore } from '@/stores/command-centre.store';
import { queryKeys } from '@/app/query-client';

/**
 * Opens the realtime stream and routes every event into the store.
 *
 * Mounted **once**, by the command centre shell. Widgets read the store; they
 * do not open their own connections. Fifteen widgets each subscribing would
 * mean fifteen handler chains for the same message.
 *
 * Handlers write to the store directly rather than through React state, so a
 * 40 Hz position stream does not schedule 40 renders a second in this
 * component — each widget re-renders only for the slice it selected.
 */
export function useRealtimeStream(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const store = useCommandCentreStore.getState();

    realtimeDriver.connect(
      {
        'vehicle:position': (update) => store.applyPosition(update),
        'responder:updated': (responder) => store.applyResponder(responder),
        'camera:update': (update) =>
          store.applyCamera(update.cameraId, {
            status: update.status,
            detections: update.detections,
            lastFrameAt: update.lastFrameAt,
          }),
        'kpi:tick': (kpis) => store.applyKpis(kpis),
        'fleet:snapshot': (snapshot) => store.applySnapshot(snapshot),
        'ai:decision': (decision) => store.pushDecision(decision),
        'ai:decision-resolved': (decision) => store.resolveDecision(decision),

        // An incident is rare and changes several lists at once, so it is worth
        // invalidating the queries rather than patching caches by hand.
        'incident:created': () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all });
          void queryClient.invalidateQueries({ queryKey: queryKeys.commandCentre.incidents() });
        },
        'incident:updated': () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all });
          void queryClient.invalidateQueries({ queryKey: queryKeys.commandCentre.incidents() });
        },
        'alert:raised': (alert) => {
          store.pushAlert(alert);
          void queryClient.invalidateQueries({ queryKey: queryKeys.commandCentre.alerts() });
        },
        'alert:acknowledged': (alert) => {
          store.dismissAlert(alert.id);
          void queryClient.invalidateQueries({ queryKey: queryKeys.commandCentre.alerts() });
        },
        'threat:detected': (threat) => store.pushThreat(threat),
      },
      (state) => useCommandCentreStore.getState().setConnection(state),
    );

    return () => {
      realtimeDriver.disconnect();
      useCommandCentreStore.getState().reset();
    };
  }, [queryClient]);
}
