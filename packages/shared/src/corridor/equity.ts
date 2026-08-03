import type {
  GeoPoint,
  RouteCandidate,
  RoutingEquityRecord,
  RoutingEquityReport,
} from '@aegisdrive/types';

/**
 * Routing equity accounting.
 *
 * ## Why the router counts what it costs people
 *
 * The harm from crime-avoidance routing is invisible from inside the system
 * that causes it. Every individual detour looks reasonable — a few minutes to
 * avoid a bad offramp, nobody would argue. The harm is the *pattern*: trips to
 * certain destinations consistently cost more, so they get quoted longer, so
 * they get scheduled later, so eventually they get declined. Nobody decides
 * that. It accumulates.
 *
 * In South Africa the destinations on the wrong side of that accumulation are
 * the townships, and the pattern reproduces apartheid spatial planning through
 * a routing algorithm that has never heard of it.
 *
 * So the router keeps score against itself. Every plan records what the
 * avoidance cost, aggregated by coarse geographic cell, and
 * `buildEquityReport` surfaces the cells carrying an outsized burden. That
 * turns an invisible drift into a number somebody has to look at.
 *
 * ## What this deliberately does not do
 *
 * It does not correct the routing automatically. The right response to a cell
 * carrying a 40% detour burden might be to relax the risk aversion, to add a
 * safe haven, to move the depot, or to accept the cost and say so. Those are
 * decisions for people who can weigh them, and a router that quietly
 * self-adjusted would hide the trade-off it was making instead of surfacing it.
 */

export const EQUITY_VERSION = 'routing-equity-v1' as const;

/**
 * Size of the aggregation cell, in degrees.
 *
 * Roughly 5.5 km at the equator, less in latitude terms further south. Chosen
 * deliberately coarse: fine enough to detect that a district is being
 * underserved, coarse enough that a cell is a neighbourhood rather than a
 * customer. A finer grid would turn an equity monitor into a profiling tool.
 */
const CELL_DEGREES = 0.05;

/**
 * A coarse cell reference for a destination.
 *
 * Never an address, never a suburb name. A grid reference has no social
 * meaning attached, which matters: a report keyed on suburb names invites
 * exactly the area-level reasoning this design exists to avoid, and would end
 * up being read as a list of "bad areas".
 */
export function destinationCell(point: GeoPoint): string {
  const lat = Math.floor(point.latitude / CELL_DEGREES) * CELL_DEGREES;
  const lon = Math.floor(point.longitude / CELL_DEGREES) * CELL_DEGREES;

  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

export function recordEquity(input: {
  routePlanId: string;
  destination: GeoPoint;
  chosen: RouteCandidate;
  fastest: RouteCandidate;
  now?: Date;
}): RoutingEquityRecord {
  const now = input.now ?? new Date();

  return {
    routePlanId: input.routePlanId,
    destinationCell: destinationCell(input.destination),
    baselineSeconds: input.fastest.totalTransitSeconds,
    chosenSeconds: input.chosen.totalTransitSeconds,
    detourSecondsAttributable: Math.max(
      0,
      input.chosen.totalTransitSeconds - input.fastest.totalTransitSeconds,
    ),
    riskReduction: input.chosen.riskReduction,
    recordedAt: now.toISOString(),
  };
}

/** Cells below this trip count are not reported — the median would be noise. */
const MINIMUM_TRIPS_FOR_REPORTING = 10;

/**
 * Multiple of the fleet-wide median detour ratio above which a cell is flagged.
 *
 * Relative rather than absolute, because the fleet-wide baseline depends
 * entirely on the risk aversion in force. A cell carrying twice the typical
 * burden is worth a look whether the typical burden is 3% or 15%.
 */
const OUTLIER_MULTIPLE = 2;

export function buildEquityReport(
  records: readonly RoutingEquityRecord[],
  windowDays: number,
): RoutingEquityReport {
  const byCell = new Map<string, RoutingEquityRecord[]>();

  for (const record of records) {
    const bucket = byCell.get(record.destinationCell) ?? [];
    bucket.push(record);
    byCell.set(record.destinationCell, bucket);
  }

  const cells = [...byCell.entries()]
    .filter(([, bucket]) => bucket.length >= MINIMUM_TRIPS_FOR_REPORTING)
    .map(([cell, bucket]) => {
      const detours = bucket.map((record) => record.detourSecondsAttributable);
      const ratios = bucket.map((record) =>
        record.baselineSeconds > 0 ? record.detourSecondsAttributable / record.baselineSeconds : 0,
      );
      const reductions = bucket.map((record) => record.riskReduction);

      return {
        destinationCell: cell,
        tripCount: bucket.length,
        medianDetourSeconds: Math.round(median(detours)),
        medianDetourRatio: round3(median(ratios)),
        medianRiskReduction: round3(median(reductions)),
      };
    })
    .sort((a, b) => b.medianDetourRatio - a.medianDetourRatio);

  const fleetMedianRatio = median(cells.map((cell) => cell.medianDetourRatio));

  const outlierCells = cells
    .filter(
      (cell) =>
        fleetMedianRatio > 0 && cell.medianDetourRatio >= fleetMedianRatio * OUTLIER_MULTIPLE,
    )
    .map((cell) => cell.destinationCell);

  return {
    windowDays,
    cells,
    outlierCells,
    note:
      outlierCells.length > 0
        ? `${outlierCells.length} destination cell${outlierCells.length === 1 ? '' : 's'} carry at least ${OUTLIER_MULTIPLE}× the fleet-median detour burden. ` +
          'This is not automatically wrong — those roads may genuinely be more hazardous — but it is the pattern by which risk-based routing turns into service exclusion, and it needs a person to look at it. ' +
          'Options include relaxing risk aversion for those routes, adding safe-haven coverage, or accepting the cost explicitly.'
        : 'No destination cell is carrying a disproportionate detour burden in this window.',
  };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
