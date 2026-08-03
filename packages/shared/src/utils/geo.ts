import type { GeoPoint } from '@aegisdrive/types';

const EARTH_RADIUS_METRES = 6_371_008.8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in metres.
 *
 * Haversine is accurate to ~0.5% at the distances the threat engine cares about
 * (hundreds of metres to tens of kilometres) and costs a fraction of a
 * PostGIS round trip, so proximity pre-filters run here before hitting the DB.
 */
export function distanceMetres(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True when `point` lies inside the circle defined by `centre` and `radiusMetres`. */
export function isWithinRadius(point: GeoPoint, centre: GeoPoint, radiusMetres: number): boolean {
  return distanceMetres(point, centre) <= radiusMetres;
}

/** Initial bearing from `a` to `b`, in degrees clockwise from true north. */
export function bearingDegrees(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLon = toRadians(b.longitude - a.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function isValidCoordinate(point: GeoPoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

/** GeoJSON orders coordinates `[longitude, latitude]`. Mixing this up is the classic bug. */
export function toGeoJsonPosition(point: GeoPoint): [number, number] {
  return [point.longitude, point.latitude];
}
