import { logger } from "./logger";

// Thin wrapper around the Google Geocoding API. Turns a free-text address into
// latitude/longitude so the app can compute "distance from" a store. Best-effort:
// every failure resolves to null and is logged — geocoding is never on a
// critical path, so a missing key or a bad address must not break a request.

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

export function isGeocodeConfigured(): boolean {
  return !!process.env.GOOGLE_MAPS_API_KEY;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const trimmed = address.trim();
  if (!trimmed) return null;

  try {
    const url = `${GEOCODE_URL}?address=${encodeURIComponent(trimmed)}&key=${key}`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Geocoding request failed");
      return null;
    }
    const body = (await res.json()) as {
      status: string;
      results?: { geometry?: { location?: { lat: number; lng: number } } }[];
    };
    if (body.status !== "OK" || !body.results?.length) {
      // ZERO_RESULTS / OVER_QUERY_LIMIT / REQUEST_DENIED etc. — non-fatal.
      if (body.status !== "ZERO_RESULTS") {
        logger.warn({ status: body.status }, "Geocoding returned no usable result");
      }
      return null;
    }
    const loc = body.results[0]?.geometry?.location;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return null;
    return { lat: loc.lat, lng: loc.lng };
  } catch (err) {
    logger.warn({ err }, "Geocoding threw");
    return null;
  }
}

// Great-circle (Haversine) distance between two points, in kilometres.
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371; // Earth radius in km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
