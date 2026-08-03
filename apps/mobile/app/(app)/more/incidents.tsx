import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Body,
  Button,
  Caption,
  Card,
  Divider,
  EmptyState,
  LoadingBlock,
  Overline,
  Pill,
  Row,
  Screen,
  StatBlock,
} from '@/components/ui';
import { ConnectivityBanner } from '@/components/ConnectivityBanner';
import { api } from '@/lib/api-client';
import { readCache, writeCache } from '@/db/cache';
import { useSosStore } from '@/stores/sos.store';
import { useAuthStore } from '@/stores/auth.store';
import { IncidentSeverity, IncidentStatus, type Incident, type Paginated } from '@/types';
import { spacing } from '@/theme/tokens';

/**
 * Live incident status.
 *
 * What the driver is allowed to know: that an incident is open, what stage it
 * has reached, and whether anyone has been dispatched. Deliberately **not** the
 * responder's position or ETA — a driver whose phone is in an attacker's hands
 * must not be showing them where armed response is and how long they have.
 *
 * This is also where an active alarm is stood down, and that is on purpose: it
 * is two navigation steps from the panic button, so it cannot be hit by accident
 * or by someone who has grabbed the phone.
 */

const STATUS_TONE: Record<IncidentStatus, 'danger' | 'warning' | 'accent' | 'success' | 'neutral'> =
  {
    DETECTED: 'danger',
    TRIAGED: 'warning',
    ESCALATED: 'danger',
    RESPONDING: 'accent',
    CONTAINED: 'accent',
    RESOLVED: 'success',
    FALSE_POSITIVE: 'neutral',
    ARCHIVED: 'neutral',
  };

const STATUS_EXPLANATION: Record<IncidentStatus, string> = {
  DETECTED: 'Raised and waiting for an operator to pick it up.',
  TRIAGED: 'An operator has reviewed this and is assessing it.',
  ESCALATED: 'Escalated to the control room lead.',
  RESPONDING: 'Response has been dispatched and is on the way.',
  CONTAINED: 'The situation is contained. The operator is confirming.',
  RESOLVED: 'Closed. No further action is needed from you.',
  FALSE_POSITIVE: 'Reviewed and closed as a false alarm.',
  ARCHIVED: 'Archived.',
};

export default function IncidentsScreen() {
  const driver = useAuthStore((state) => state.driver);
  const sosPhase = useSosStore((state) => state.phase);
  const activation = useSosStore((state) => state.activation);
  const standDown = useSosStore((state) => state.standDown);

  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [standingDown, setStandingDown] = useState(false);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const page = await api.get<Paginated<Incident>>('/incidents', {
          query: { driverId: driver?.id, pageSize: 20 },
        });

        setIncidents(page.items);
        setOffline(false);
        await writeCache('incidents', page.items);
      } catch {
        const cached = await readCache<Incident[]>('incidents');
        setIncidents(cached ?? []);
        setOffline(true);
      }
    }

    void load();
    const timer = setInterval(() => void load(), 20_000);
    return () => clearInterval(timer);
  }, [driver?.id]);

  const handleStandDown = async (): Promise<void> => {
    setStandingDown(true);
    try {
      await standDown('Driver confirmed they are safe from the mobile app.');
    } finally {
      setStandingDown(false);
    }
  };

  return (
    <Screen>
      <ConnectivityBanner />

      {sosPhase === 'active' ? (
        <Card tone="alarm">
          <Overline tone="danger">Your alarm is active</Overline>
          <Caption>
            The control room has your position and is tracking you. Only stand down if you are
            genuinely safe — this tells responders to stop.
          </Caption>

          {activation ? (
            <>
              <Divider />
              <Row gap={spacing.md}>
                <StatBlock
                  label="Raised"
                  value={new Date(activation.activatedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  caption={activation.trigger.replace(/_/g, ' ').toLowerCase()}
                />
                <StatBlock
                  label="Mode"
                  value={activation.mode === 'SILENT' ? 'Silent' : 'Audible'}
                  caption="activation"
                />
              </Row>
            </>
          ) : null}

          <Button
            label={standingDown ? 'Standing down' : 'I am safe — stand down'}
            variant="secondary"
            block
            loading={standingDown}
            onPress={() => void handleStandDown()}
          />
        </Card>
      ) : null}

      <View style={styles.header}>
        <Overline>Incidents involving you</Overline>
        {offline ? (
          <Caption tone="warning">Showing the last synced copy — you are offline.</Caption>
        ) : null}
      </View>

      {incidents === null ? (
        <LoadingBlock label="Loading incident status" />
      ) : incidents.length === 0 ? (
        <Card>
          <EmptyState
            title="No incidents"
            description="Nothing has been raised about you or your vehicle. Anything that is will appear here with its live status."
          />
        </Card>
      ) : (
        incidents.map((incident) => <IncidentCard key={incident.id} incident={incident} />)
      )}
    </Screen>
  );
}

function IncidentCard({ incident }: { incident: Incident }) {
  const isOpen = !['RESOLVED', 'FALSE_POSITIVE', 'ARCHIVED'].includes(incident.status);
  const critical = incident.severity === IncidentSeverity.CRITICAL;

  return (
    <Card tone={isOpen && critical ? 'alarm' : 'default'}>
      <Row style={styles.between}>
        <Caption tone="accent">{incident.reference}</Caption>
        <Pill
          label={incident.status.replace(/_/g, ' ')}
          tone={STATUS_TONE[incident.status]}
          dot={isOpen}
        />
      </Row>

      <Body tone="primary" style={styles.title}>
        {incident.title}
      </Body>

      <Caption>{STATUS_EXPLANATION[incident.status]}</Caption>

      <Divider />

      <Row gap={spacing.md}>
        <StatBlock
          label="Severity"
          value={incident.severity}
          tone={critical ? 'danger' : 'primary'}
        />
        <StatBlock
          label="Raised"
          value={new Date(incident.detectedAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
          caption={new Date(incident.detectedAt).toLocaleDateString()}
        />
        <StatBlock label="Evidence" value={String(incident.evidenceCount)} caption="artefacts" />
      </Row>

      {incident.acknowledgedAt ? (
        <Caption tone="success">
          An operator acknowledged this at{' '}
          {new Date(incident.acknowledgedAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
          .
        </Caption>
      ) : isOpen ? (
        <Caption tone="warning">Not yet acknowledged by an operator.</Caption>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4 },
  between: { justifyContent: 'space-between' },
  title: { fontWeight: '600', fontSize: 15 },
});
