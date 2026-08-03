import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
  Title,
} from '@/components/ui';
import { ConnectivityBanner } from '@/components/ConnectivityBanner';
import { useAuthStore } from '@/stores/auth.store';
import { isCorridorDepartable, useTripStore } from '@/stores/trip.store';
import { readCurrentPosition } from '@/services/location';
import { CorridorStatus, type SafeCorridor } from '@/types';
import { colors, radii, spacing } from '@/theme/tokens';

/**
 * SafeCorridor navigation.
 *
 * Not a turn-by-turn navigator — the driver has one of those. This is a
 * *protection* layer: which vetted route to take, what risk it carries, how
 * much response coverage sits along it, and whether the vehicle has left it.
 *
 * Turn-by-turn is deliberately out of scope. Competing with Google Maps on
 * routing would be a losing fight and is not what a driver opens this app for.
 */

const STATUS_TONE: Record<CorridorStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  CLEAR: 'success',
  CAUTION: 'warning',
  DEGRADED: 'danger',
  CLOSED: 'neutral',
};

export default function NavigateScreen() {
  const vehicle = useAuthStore((state) => state.vehicle);
  const {
    phase,
    corridors,
    selectedCorridor,
    hotspotsOnRoute,
    deviation,
    error,
    loadRoutes,
    selectCorridor,
    startTrip,
    endTrip,
    evaluatePosition,
  } = useTripStore();

  useEffect(() => {
    void loadRoutes();
  }, [loadRoutes]);

  // Deviation is evaluated on a timer against the current fix rather than being
  // pushed from the background task: the task is tuned for battery and may be
  // several seconds stale, which is fine for telemetry and too slow for a
  // warning the driver is meant to act on.
  useEffect(() => {
    if (phase !== 'active') return;

    const timer = setInterval(() => {
      void (async () => {
        const frame = await readCurrentPosition();
        if (frame) {
          evaluatePosition({ longitude: frame.longitude, latitude: frame.latitude });
        }
      })();
    }, 15_000);

    return () => clearInterval(timer);
  }, [phase, evaluatePosition]);

  if (corridors.length === 0 && !error) {
    return (
      <Screen>
        <ConnectivityBanner />
        <Title>SafeCorridor</Title>
        <LoadingBlock label="Loading vetted routes" />
      </Screen>
    );
  }

  return (
    <Screen>
      <ConnectivityBanner />

      <View style={styles.header}>
        <Overline>Navigation</Overline>
        <Title>SafeCorridor</Title>
        <Caption>
          Vetted routes with known historical risk and known response coverage. Use these instead of
          the fastest route.
        </Caption>
      </View>

      {deviation ? (
        <Card tone="alarm">
          <Row style={styles.between}>
            <Body tone="danger" style={styles.bold}>
              Off the corridor
            </Body>
            <Pill label={`${Math.round(deviation.distanceMetres)} m`} tone="danger" dot />
          </Row>
          <Caption>
            You are away from your assigned route. If this is a diversion or traffic, no action is
            needed — the control room can see it. If you are being directed off-route, use the
            silent SOS.
          </Caption>
        </Card>
      ) : null}

      {phase === 'active' && selectedCorridor ? (
        <Card tone="accent">
          <Row style={styles.between}>
            <Overline>Trip in progress</Overline>
            <Pill label="Protecting" tone="success" dot />
          </Row>

          <Body tone="primary" style={styles.bold}>
            {selectedCorridor.name}
          </Body>

          <Row gap={spacing.md}>
            <StatBlock label="Distance" value={`${selectedCorridor.lengthKm}`} caption="km" />
            <StatBlock
              label="Typical"
              value={`${selectedCorridor.averageTransitMinutes}`}
              caption="minutes"
            />
            <StatBlock
              label="Coverage"
              value={`${selectedCorridor.responderCoverage}`}
              caption="units"
            />
          </Row>

          {hotspotsOnRoute.length > 0 ? (
            <>
              <Divider />
              <Overline tone="warning">
                {hotspotsOnRoute.length} hotspot{hotspotsOnRoute.length === 1 ? '' : 's'} on this
                route
              </Overline>
              {hotspotsOnRoute.map((hotspot) => (
                <Row key={hotspot.id} style={styles.between}>
                  <Caption tone="secondary">{hotspot.name}</Caption>
                  <Pill
                    label={hotspot.level}
                    tone={
                      hotspot.level === 'SEVERE' || hotspot.level === 'HIGH' ? 'danger' : 'warning'
                    }
                  />
                </Row>
              ))}
            </>
          ) : null}

          <Button
            label="End trip"
            variant="secondary"
            block
            onPress={() => {
              if (vehicle) void endTrip(vehicle.id);
            }}
          />
        </Card>
      ) : null}

      {error ? (
        <Card>
          <Caption tone="warning">{error}</Caption>
        </Card>
      ) : null}

      {phase !== 'active' ? (
        <>
          <Overline>Available routes</Overline>

          {corridors.length === 0 ? (
            <Card>
              <EmptyState
                title="No routes available"
                description="Vetted corridors appear here once your fleet has defined them."
              />
            </Card>
          ) : (
            corridors.map((corridor) => (
              <CorridorCard
                key={corridor.id}
                corridor={corridor}
                selected={selectedCorridor?.id === corridor.id}
                onSelect={() => selectCorridor(corridor)}
                onStart={() => {
                  if (vehicle) void startTrip(vehicle.id);
                }}
                canStart={Boolean(vehicle)}
              />
            ))
          )}
        </>
      ) : null}
    </Screen>
  );
}

function CorridorCard({
  corridor,
  selected,
  onSelect,
  onStart,
  canStart,
}: {
  corridor: SafeCorridor;
  selected: boolean;
  onSelect: () => void;
  onStart: () => void;
  canStart: boolean;
}) {
  const departable = isCorridorDepartable(corridor);

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.corridor, selected && styles.corridorSelected]}
    >
      <Row style={styles.between}>
        <Body tone="primary" style={styles.bold} numberOfLines={1}>
          {corridor.originLabel} → {corridor.destinationLabel}
        </Body>
        <Pill label={corridor.status} tone={STATUS_TONE[corridor.status]} />
      </Row>

      <Row gap={spacing.md}>
        <StatBlock label="Distance" value={`${corridor.lengthKm}`} caption="km" />
        <StatBlock label="Typical" value={`${corridor.averageTransitMinutes}`} caption="min" />
        <StatBlock
          label="Risk"
          value={`${corridor.riskScore}`}
          caption="of 100"
          tone={
            corridor.riskScore >= 60 ? 'danger' : corridor.riskScore >= 35 ? 'warning' : 'primary'
          }
        />
      </Row>

      {/* Risk bar. Length carries the score and colour carries the band, so the
          reading survives a colour-vision deficiency or bright sunlight. */}
      <View style={styles.riskTrack}>
        <View
          style={[
            styles.riskFill,
            {
              width: `${corridor.riskScore}%`,
              backgroundColor:
                corridor.riskScore >= 60
                  ? colors.critical
                  : corridor.riskScore >= 35
                    ? colors.warning
                    : colors.success,
            },
          ]}
        />
      </View>

      {selected ? (
        <Button
          label={
            !departable
              ? 'Route closed'
              : canStart
                ? 'Start trip on this route'
                : 'No vehicle assigned'
          }
          variant="primary"
          block
          disabled={!departable || !canStart}
          onPress={onStart}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4 },
  between: { justifyContent: 'space-between' },
  bold: { fontWeight: '700' },
  corridor: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: spacing.md,
    gap: spacing.sm,
  },
  corridorSelected: {
    borderColor: 'rgba(46,139,255,0.55)',
    backgroundColor: 'rgba(46,139,255,0.07)',
  },
  riskTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  riskFill: {
    height: '100%',
    borderRadius: 2,
  },
});
