import type { GeoPoint } from '@aegisdrive/types';

/**
 * Geographic reference data for the simulation.
 *
 * Greater Johannesburg, because that is the launch market and because a
 * plausible operating area makes distances, transit times and corridor lengths
 * come out realistic rather than arbitrary.
 *
 * These are real place coordinates. The *entities* placed at them — units,
 * vehicles, incidents — are entirely synthetic.
 */

/** `[west, south, east, north]`. Frames the tactical map. */
export const SIMULATION_BOUNDS: [number, number, number, number] = [27.85, -26.32, 28.22, -25.98];

export interface NamedPlace {
  name: string;
  point: GeoPoint;
}

export const LANDMARKS: readonly NamedPlace[] = [
  { name: 'Sandton CBD', point: { longitude: 28.0567, latitude: -26.1076 } },
  { name: 'Rosebank', point: { longitude: 28.0436, latitude: -26.1438 } },
  { name: 'Johannesburg CBD', point: { longitude: 28.0473, latitude: -26.2041 } },
  { name: 'Midrand', point: { longitude: 28.1263, latitude: -25.9992 } },
  { name: 'Randburg', point: { longitude: 27.9944, latitude: -26.0936 } },
  { name: 'Soweto', point: { longitude: 27.8579, latitude: -26.2678 } },
  { name: 'Alexandra', point: { longitude: 28.0964, latitude: -26.1039 } },
  { name: 'Bedfordview', point: { longitude: 28.1394, latitude: -26.1794 } },
  { name: 'Roodepoort', point: { longitude: 27.8725, latitude: -26.1625 } },
  { name: 'OR Tambo Cargo', point: { longitude: 28.2294, latitude: -26.1367 } },
  { name: 'Germiston', point: { longitude: 28.1728, latitude: -26.2178 } },
  { name: 'Fourways', point: { longitude: 28.0106, latitude: -26.0247 } },
];

export const POLICE_STATIONS: readonly NamedPlace[] = [
  { name: 'Sandton SAPS', point: { longitude: 28.0578, latitude: -26.1023 } },
  { name: 'Rosebank SAPS', point: { longitude: 28.0411, latitude: -26.1461 } },
  { name: 'Johannesburg Central SAPS', point: { longitude: 28.0402, latitude: -26.2044 } },
  { name: 'Midrand SAPS', point: { longitude: 28.1301, latitude: -25.9944 } },
  { name: 'Randburg SAPS', point: { longitude: 27.9989, latitude: -26.0951 } },
  { name: 'Alexandra SAPS', point: { longitude: 28.0942, latitude: -26.1002 } },
  { name: 'Germiston SAPS', point: { longitude: 28.1689, latitude: -26.2201 } },
];

export const HOSPITALS: readonly NamedPlace[] = [
  { name: 'Sandton Mediclinic', point: { longitude: 28.0512, latitude: -26.1042 } },
  { name: 'Milpark Hospital', point: { longitude: 28.0139, latitude: -26.1806 } },
  { name: 'Charlotte Maxeke Academic', point: { longitude: 28.0447, latitude: -26.1789 } },
  { name: 'Netcare Sunninghill', point: { longitude: 28.0631, latitude: -26.0322 } },
  { name: 'Chris Hani Baragwanath', point: { longitude: 27.9394, latitude: -26.2617 } },
  { name: 'Bedford Gardens Hospital', point: { longitude: 28.1408, latitude: -26.1786 } },
];

export const SECURITY_DEPOTS: readonly NamedPlace[] = [
  { name: 'Aegis Response — Sandton', point: { longitude: 28.0623, latitude: -26.1122 } },
  { name: 'Aegis Response — Midrand', point: { longitude: 28.1189, latitude: -26.0067 } },
  { name: 'Aegis Response — Roodepoort', point: { longitude: 27.8811, latitude: -26.1583 } },
  { name: 'Aegis Response — Germiston', point: { longitude: 28.1633, latitude: -26.2122 } },
];

/**
 * Areas with a genuinely elevated hijacking profile in public SAPS reporting.
 * Used to place synthetic hotspots somewhere plausible rather than at random,
 * so corridor risk scores behave the way an operator would expect.
 */
export const HOTSPOT_AREAS: readonly NamedPlace[] = [
  { name: 'M1 / Corlett Drive interchange', point: { longitude: 28.0703, latitude: -26.1289 } },
  { name: 'N1 Buccleuch interchange', point: { longitude: 28.0919, latitude: -26.0619 } },
  { name: 'Marlboro Drive corridor', point: { longitude: 28.0994, latitude: -26.0872 } },
  { name: 'Booysens off-ramp', point: { longitude: 28.0219, latitude: -26.2456 } },
  { name: 'N12 Elandsfontein', point: { longitude: 28.1861, latitude: -26.1969 } },
  { name: 'Empire / Perth junction', point: { longitude: 28.0089, latitude: -26.1861 } },
  { name: 'R24 Rand Airport', point: { longitude: 28.1519, latitude: -26.2428 } },
];

const EARTH_RADIUS_METRES = 6_371_008.8;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Haversine distance in metres. Duplicated from @aegisdrive/shared to keep the mock self-contained. */
export function distanceMetres(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from `a` to `b`, degrees clockwise from true north. */
export function bearingDegrees(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLon = toRadians(b.longitude - a.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Linear interpolation between two points.
 *
 * Straight-line rather than great-circle: over the tens of kilometres this
 * simulation covers, the difference is far below one pixel on screen, and the
 * simpler form keeps the per-tick cost negligible with 40 vehicles moving.
 */
export function interpolate(a: GeoPoint, b: GeoPoint, t: number): GeoPoint {
  return {
    longitude: a.longitude + (b.longitude - a.longitude) * t,
    latitude: a.latitude + (b.latitude - a.latitude) * t,
  };
}

/** Total polyline length in metres. */
export function polylineLengthMetres(points: readonly GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distanceMetres(points[i - 1] as GeoPoint, points[i] as GeoPoint);
  }
  return total;
}
