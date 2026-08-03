import type { GeoPoint } from '@aegisdrive/types';

/**
 * Equirectangular projection onto a fixed viewport.
 *
 * Chosen over Web Mercator deliberately. Mercator's value is that it preserves
 * angles at global scale; across a single metropolitan bounding box the
 * difference is imperceptible, and equirectangular is a linear transform —
 * which means projecting 40 vehicles every second costs two multiplications
 * each instead of a `log(tan(...))` per point.
 *
 * Longitude is scaled by `cos(centreLatitude)` so the aspect ratio stays true:
 * without it, a city at 26° south renders visibly stretched horizontally.
 *
 * When Mapbox lands (ADR-0004) this file is what it replaces. Every layer
 * component takes a `Projection` and knows nothing else about the map.
 */
export interface Projection {
  /** Geographic point → viewport coordinates. */
  project: (point: GeoPoint) => { x: number; y: number };
  /** Viewport coordinates → geographic point. Used for click-to-locate. */
  unproject: (x: number, y: number) => GeoPoint;
  width: number;
  height: number;
  /** Metres per viewport unit at the centre latitude. Drives the scale bar. */
  metresPerUnit: number;
}

const EARTH_RADIUS_METRES = 6_371_008.8;

export function createProjection(
  bounds: [number, number, number, number],
  width: number,
  height: number,
  /** Fraction of the viewport kept clear at each edge. */
  padding = 0.04,
): Projection {
  const [west, south, east, north] = bounds;

  const centreLatitude = (south + north) / 2;
  const lonScale = Math.cos((centreLatitude * Math.PI) / 180);

  // Work in "scaled longitude" so both axes share one unit.
  const spanX = (east - west) * lonScale;
  const spanY = north - south;

  const padX = width * padding;
  const padY = height * padding;
  const usableWidth = width - padX * 2;
  const usableHeight = height - padY * 2;

  // One scale for both axes preserves shape; the smaller one guarantees the
  // whole bounding box fits.
  const scale = Math.min(usableWidth / spanX, usableHeight / spanY);

  // Centre whatever slack the aspect mismatch left over.
  const offsetX = padX + (usableWidth - spanX * scale) / 2;
  const offsetY = padY + (usableHeight - spanY * scale) / 2;

  const project = (point: GeoPoint): { x: number; y: number } => ({
    x: offsetX + (point.longitude - west) * lonScale * scale,
    // SVG y grows downward; latitude grows upward.
    y: offsetY + (north - point.latitude) * scale,
  });

  const unproject = (x: number, y: number): GeoPoint => ({
    longitude: west + (x - offsetX) / (lonScale * scale),
    latitude: north - (y - offsetY) / scale,
  });

  const degreesPerUnit = 1 / scale;
  const metresPerUnit = (degreesPerUnit * Math.PI * EARTH_RADIUS_METRES) / 180;

  return { project, unproject, width, height, metresPerUnit };
}

/** Converts a radius in metres to viewport units at the projection's scale. */
export function metresToUnits(projection: Projection, metres: number): number {
  return metres / projection.metresPerUnit;
}

/** Projects a polyline to an SVG `points` attribute. */
export function toPolylinePoints(projection: Projection, points: readonly GeoPoint[]): string {
  return points
    .map((point) => {
      const { x, y } = projection.project(point);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
