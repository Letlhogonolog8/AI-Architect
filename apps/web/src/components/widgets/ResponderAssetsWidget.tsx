import { useMemo } from 'react';
import { Building2, Shield, Siren, Stethoscope, Truck, type LucideIcon } from 'lucide-react';
import { ResponderKind, ResponderStatus, type ResponderAsset } from '@aegisdrive/types';
import { Badge, cn } from '@aegisdrive/ui';
import { relativeTime } from '@aegisdrive/shared';
import { useResponderAssets } from '@/features/command-centre/command-centre.queries';
import { useCommandCentreStore } from '@/stores/command-centre.store';
import { Widget } from './Widget';

/**
 * Response-asset roster, parameterised by kind.
 *
 * Police, hospitals and security companies are the same widget with a different
 * `kind`. They answer the same operational question — what is available, where,
 * and how soon — so they are one component instantiated three times rather than
 * three near-identical files that drift apart on the first change.
 *
 * `presets` at the bottom bind the parameters for the registry, which needs
 * zero-argument components.
 */

interface ResponderAssetsWidgetProps {
  kind: ResponderKind;
  title: string;
  /** Fixed facilities are listed by capacity; mobile units by availability. */
  emphasis: 'availability' | 'capacity';
  icon: LucideIcon;
  capacityLabel: string;
}

const STATUS_TONE: Record<
  ResponderStatus,
  'success' | 'accent' | 'warning' | 'neutral' | 'danger'
> = {
  AVAILABLE: 'success',
  EN_ROUTE: 'accent',
  ON_SCENE: 'warning',
  BUSY: 'warning',
  OFFLINE: 'neutral',
};

export function ResponderAssetsWidget({
  kind,
  title,
  emphasis,
  icon: Icon,
  capacityLabel,
}: ResponderAssetsWidgetProps) {
  const query = useResponderAssets(kind);
  const liveResponders = useCommandCentreStore((state) => state.responders);

  const assets = useMemo(() => {
    const merged = (query.data ?? []).map((asset) => liveResponders[asset.id] ?? asset);

    // Available first, then the units already committed, then anything dark.
    const order: ResponderStatus[] = [
      ResponderStatus.AVAILABLE,
      ResponderStatus.EN_ROUTE,
      ResponderStatus.ON_SCENE,
      ResponderStatus.BUSY,
      ResponderStatus.OFFLINE,
    ];

    return [...merged].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  }, [query.data, liveResponders]);

  const available = assets.filter((asset) => asset.status === ResponderStatus.AVAILABLE).length;
  const totalCapacity = assets.reduce((sum, asset) => sum + (asset.capacity ?? 0), 0);

  return (
    <Widget
      title={title}
      subtitle={
        emphasis === 'capacity'
          ? `${assets.length} facilities · ${totalCapacity} ${capacityLabel}`
          : `${available} of ${assets.length} available`
      }
      live={Object.keys(liveResponders).length > 0}
      isLoading={query.isLoading}
      error={query.error}
      isEmpty={assets.length === 0}
      emptyTitle={`No ${title.toLowerCase()} on record`}
      onRetry={() => void query.refetch()}
      className="h-full"
      actions={
        <Badge tone={available > 0 ? 'success' : 'warning'}>
          <Icon className="size-3" aria-hidden />
          {available}
        </Badge>
      }
    >
      <ul className="space-y-0.5">
        {assets.map((asset) => (
          <ResponderRow key={asset.id} asset={asset} capacityLabel={capacityLabel} />
        ))}
      </ul>
    </Widget>
  );
}

function ResponderRow({ asset, capacityLabel }: { asset: ResponderAsset; capacityLabel: string }) {
  const isMobile = asset.callSign !== null;

  return (
    <li
      className={cn(
        'flex items-center gap-2.5 rounded-control px-2 py-1.5',
        asset.status === ResponderStatus.OFFLINE && 'opacity-45',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid size-5 shrink-0 place-items-center rounded text-ink-tertiary',
          isMobile ? 'bg-white/6' : 'border border-hairline',
        )}
      >
        {isMobile ? <Siren className="size-3" /> : <Building2 className="size-3" />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-ink-primary">{asset.name}</p>
        <p className="truncate text-[10px] text-ink-tertiary">
          {asset.callSign ? (
            <span data-numeric>{asset.callSign}</span>
          ) : (
            `${asset.capacity ?? 0} ${capacityLabel}`
          )}
          {' · '}
          {relativeTime(asset.lastUpdatedAt)}
        </p>
      </div>

      {asset.etaMinutes !== null ? (
        <span data-numeric className="shrink-0 text-[11px] font-semibold text-aegis-200">
          {asset.etaMinutes}m
        </span>
      ) : null}

      <Badge tone={STATUS_TONE[asset.status]} className="shrink-0">
        {asset.status === ResponderStatus.AVAILABLE
          ? 'Ready'
          : asset.status === ResponderStatus.EN_ROUTE
            ? 'En route'
            : asset.status === ResponderStatus.ON_SCENE
              ? 'On scene'
              : asset.status === ResponderStatus.BUSY
                ? 'Busy'
                : 'Offline'}
      </Badge>
    </li>
  );
}

/**
 * Registry-ready bindings.
 *
 * The widget registry needs components it can render with no props, so the
 * three configurations are bound here rather than being passed through the
 * layout descriptor.
 */
export function PoliceWidget() {
  return (
    <ResponderAssetsWidget
      kind={ResponderKind.POLICE}
      title="Police"
      emphasis="availability"
      icon={Shield}
      capacityLabel="officers"
    />
  );
}

export function HospitalsWidget() {
  return (
    <ResponderAssetsWidget
      kind={ResponderKind.HOSPITAL}
      title="Hospitals"
      emphasis="capacity"
      icon={Stethoscope}
      capacityLabel="beds"
    />
  );
}

export function SecurityCompaniesWidget() {
  return (
    <ResponderAssetsWidget
      kind={ResponderKind.SECURITY}
      title="Security companies"
      emphasis="availability"
      icon={Truck}
      capacityLabel="crew"
    />
  );
}
