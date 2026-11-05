import { env } from '../config/env';
import { HttpError } from './http';
import { meterUnits } from './ai/gateway';

/**
 * Google Places API (New): real places for shoot locations.
 * https://developers.google.com/maps/documentation/places/web-service/text-search
 * The key stays on the server; photo links are resolved here so the browser never sees it.
 */
const BASE = 'https://places.googleapis.com/v1';
const FIELDS = ['places.id', 'places.displayName', 'places.formattedAddress', 'places.location', 'places.googleMapsUri', 'places.photos', 'places.types', 'places.rating'].join(',');

export const placesReady = () => Boolean(env.GOOGLE_MAPS_API_KEY);

function key() {
  if (!env.GOOGLE_MAPS_API_KEY) throw new HttpError(503, 'Location search is not set up yet. Add GOOGLE_MAPS_API_KEY on the server');
  return env.GOOGLE_MAPS_API_KEY;
}

export interface PlaceResult {
  placeId: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  mapsUri?: string;
  photoNames: string[];
  types: string[];
  rating?: number;
}

interface RawPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  googleMapsUri?: string;
  photos?: { name: string }[];
  types?: string[];
  rating?: number;
}

export async function searchPlaces(query: string, region?: string, max = 8): Promise<PlaceResult[]> {
  const started = Date.now();
  const res = await fetch(`${BASE}/places:searchText`, {
    method: 'POST',
    signal: AbortSignal.timeout(20_000),
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key(), 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify({ textQuery: query, pageSize: max, ...(region ? { regionCode: region } : {}) }),
  });
  if (!res.ok) throw new HttpError(502, `Google Places returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  await meterUnits('google', 'google.places_text_search', 1, 'places:searchText', Date.now() - started);
  const body = (await res.json()) as { places?: RawPlace[] };
  return (body.places ?? []).map((p) => ({
    placeId: p.id,
    name: p.displayName?.text ?? 'Unnamed place',
    address: p.formattedAddress,
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    mapsUri: p.googleMapsUri,
    photoNames: (p.photos ?? []).slice(0, 6).map((ph) => ph.name),
    types: p.types ?? [],
    rating: p.rating,
  }));
}

/**
 * Photo links already resolved, kept for an hour in memory. Every location card asks for its
 * photo on every page view, and each lookup is a paid Google call; this keeps it to one an hour.
 */
const PHOTO_TTL = 60 * 60 * 1000;
const photoCache = new Map<string, { uri: string; until: number }>();

/** A short-lived public image link for a place photo (the key is not part of it). */
export async function photoUri(photoName: string, maxWidth = 800): Promise<string> {
  if (!/^places\/[^/]+\/photos\/[^/]+$/.test(photoName)) throw new HttpError(400, 'Invalid photo');
  const cacheKey = `${photoName}@${maxWidth}`;
  const hit = photoCache.get(cacheKey);
  if (hit && hit.until > Date.now()) return hit.uri;
  const res = await fetch(`${BASE}/${photoName}/media?maxWidthPx=${maxWidth}&skipHttpRedirect=true`, {
    signal: AbortSignal.timeout(20_000),
    headers: { 'X-Goog-Api-Key': key() },
  });
  if (!res.ok) throw new HttpError(502, `Google Places photo returned ${res.status}`);
  await meterUnits('google', 'google.places_photo', 1, 'places:photo');
  const body = (await res.json()) as { photoUri?: string };
  if (!body.photoUri) throw new HttpError(502, 'Google returned no photo');
  if (photoCache.size > 2000) photoCache.clear();
  photoCache.set(cacheKey, { uri: body.photoUri, until: Date.now() + PHOTO_TTL });
  return body.photoUri;
}
