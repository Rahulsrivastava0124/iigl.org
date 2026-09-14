import { db } from '../db/index.js';
import { env } from '../lib/env.js';

/**
 * Where a laboratory's city is, for the website's Branches map.
 *
 * Looked up from the city and state on the laboratory's record, with
 * OpenStreetMap's Nominatim, and stored on the record (`geo_*`, migration 058).
 * Nothing is typed by hand and nothing is hardcoded: rename a laboratory's city
 * and its pin moves on the next lookup.
 *
 * **Nominatim's usage policy** is followed rather than hoped for: at most one
 * request a second (the queue below), an identifying User-Agent, and results
 * kept rather than asked for again — a city is looked up once, not once per
 * visitor. `GEOCODER_URL` points it at another Nominatim-compatible server.
 *
 * **Only settlements.** A free-text search for "Tata Nagar" returns a car shop
 * of that name; restricted to cities, towns and villages it returns nothing
 * instead, which is the honest answer — the website then falls back to the
 * state, and the panel shows that the city was not found so its spelling can
 * be corrected.
 */

const RETRY_FAILED_AFTER_MS = 24 * 60 * 60 * 1000;
const MIN_GAP_MS = 1100;
const TIMEOUT_MS = 8000;

export interface Point {
  lat: number;
  lon: number;
}

/** What a lookup is keyed on: the city and state as the record holds them. */
export const geoKey = (city: string | null, state: string | null) =>
  `${(city ?? '').trim().toLowerCase().replace(/\s+/g, ' ')}|${(state ?? '').trim().toLowerCase().replace(/\s+/g, ' ')}`;

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

/** Runs one request at a time, at least MIN_GAP_MS apart. */
function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await task();
    } finally {
      lastRequestAt = Date.now();
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

async function search(params: Record<string, string>): Promise<Point | null> {
  const url = new URL('/search', env.geocoderUrl);
  for (const [k, v] of Object.entries({ format: 'jsonv2', limit: '1', countrycodes: 'in', ...params })) {
    url.searchParams.set(k, v);
  }
  const response = await throttled(() =>
    fetch(url, {
      headers: { 'User-Agent': 'IIGL-API/1.0 (branch map; https://www.iigl.org)', Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
  );
  if (!response.ok) throw new Error(`geocoder answered ${response.status}`);
  const rows = (await response.json()) as Array<{ lat: string; lon: string }>;
  const first = rows[0];
  if (!first) return null;
  const lat = Number(first.lat);
  const lon = Number(first.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

/**
 * The point for a city in a state, or null when there is no such settlement.
 * Throws when the geocoder could not be asked — a network failure is not an
 * answer, and must not be stored as "not found".
 */
export async function geocodeCity(city: string, state: string): Promise<Point | null> {
  const c = city.trim();
  const s = state.trim();
  if (!c) return null;
  // Structured first: "city=Howrah&state=West Bengal" cannot match a shop.
  const structured = await search({ city: c, ...(s ? { state: s } : {}) });
  if (structured) return structured;
  // Then free text, still settlements only — catches towns Nominatim files as
  // `town` or `village` rather than `city`.
  return search({ q: s ? `${c}, ${s}` : c, featureType: 'settlement' });
}

interface LabGeo {
  id: number;
  city: string | null;
  state: string | null;
  geo_latitude: unknown;
  geo_longitude: unknown;
  geo_query: string | null;
  geo_at: Date | null;
}

/** The stored point, when it was found for the city and state the record holds now. */
export function storedPoint(lab: LabGeo): Point | null {
  if (lab.geo_query !== geoKey(lab.city, lab.state)) return null;
  if (lab.geo_latitude == null || lab.geo_longitude == null) return null;
  return { lat: Number(lab.geo_latitude), lon: Number(lab.geo_longitude) };
}

/** Whether the record needs looking up: never done, city changed, or a miss old enough to retry. */
export function needsLookup(lab: LabGeo): boolean {
  if (!(lab.city ?? '').trim()) return false;
  if (lab.geo_query !== geoKey(lab.city, lab.state)) return true;
  if (lab.geo_latitude != null) return false;
  return !lab.geo_at || Date.now() - new Date(lab.geo_at).getTime() > RETRY_FAILED_AFTER_MS;
}

const inFlight = new Set<number>();

/**
 * Looks one laboratory's city up and stores the answer. A found point and a
 * definite "no such city" are both stored; a failure to reach the geocoder is
 * logged and stores nothing, so the next request tries again.
 */
export async function locateLaboratory(lab: LabGeo): Promise<Point | null> {
  if (inFlight.has(lab.id)) return null;
  inFlight.add(lab.id);
  try {
    const point = await geocodeCity(lab.city ?? '', lab.state ?? '');
    await db
      .updateTable('users')
      .set({
        geo_latitude: point ? point.lat.toFixed(6) : null,
        geo_longitude: point ? point.lon.toFixed(6) : null,
        geo_query: geoKey(lab.city, lab.state),
        geo_at: new Date(),
      })
      .where('id', '=', lab.id)
      .execute();
    return point;
  } catch (err) {
    console.warn(`[geocode] laboratory ${lab.id} (${lab.city}, ${lab.state}) not looked up: ${(err as Error).message}`);
    return null;
  } finally {
    inFlight.delete(lab.id);
  }
}

/** Looks up, in the background, every laboratory in the list that needs it. */
export function locateInBackground(labs: LabGeo[]): void {
  for (const lab of labs) if (needsLookup(lab)) void locateLaboratory(lab);
}
