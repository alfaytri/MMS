// src/lib/traccar.ts

// ── Types ────────────────────────────────────────────────────────

export interface TraccarDevice {
  id: number
  name: string
  uniqueId: string
  status: string
  lastUpdate: string | null
  groupId: number
  phone: string
  model: string
  contact: string
}

export interface TraccarPosition {
  id: number
  deviceId: number
  latitude: number
  longitude: number
  speed: number       // knots from Traccar — convert to km/h
  course: number
  deviceTime: string
  fixTime: string
  serverTime: string
  attributes: {
    ignition?: boolean
    motion?: boolean
    [key: string]: unknown
  }
}

export interface TraccarGeofence {
  id: number
  name: string
  description: string
  area: string        // WKT string
  attributes: Record<string, unknown>
}

export interface GeofenceInput {
  name: string
  description?: string
  area: string        // WKT string (converted from Leaflet geometry before calling)
}

// ── parseTraccarId — centralised TEXT↔number conversion ─────────

export function parseTraccarId(id: string | null | undefined): number | null {
  if (id == null || id === '') return null
  const n = parseInt(id, 10)
  return Number.isNaN(n) ? null : n
}

// ── Auth ─────────────────────────────────────────────────────────

const TRACCAR_URL = process.env.TRACCAR_API_URL ?? ''
const TRACCAR_EMAIL = process.env.TRACCAR_EMAIL ?? ''
const TRACCAR_PASSWORD = process.env.TRACCAR_PASSWORD ?? ''

function authHeaders(): HeadersInit {
  if (!TRACCAR_URL) throw new Error('TRACCAR_API_URL is not set')
  if (!TRACCAR_EMAIL || !TRACCAR_PASSWORD) throw new Error('TRACCAR_EMAIL / TRACCAR_PASSWORD not set')
  const encoded = Buffer.from(`${TRACCAR_EMAIL}:${TRACCAR_PASSWORD}`).toString('base64')
  return {
    'Authorization': `Basic ${encoded}`,
    'Content-Type': 'application/json',
  }
}

async function traccarFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${TRACCAR_URL}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...init?.headers },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Traccar API ${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ── Device methods ──────────────────────────────────────────────

export async function getDevices(): Promise<TraccarDevice[]> {
  return traccarFetch<TraccarDevice[]>('/devices')
}

export async function getDevice(id: number): Promise<TraccarDevice | null> {
  const devices = await traccarFetch<TraccarDevice[]>(`/devices?id=${id}`)
  return devices[0] ?? null
}

// ── Position methods ────────────────────────────────────────────

export async function getPositions(deviceIds?: number[]): Promise<TraccarPosition[]> {
  if (deviceIds && deviceIds.length === 0) return []
  const params = deviceIds ? deviceIds.map(id => `deviceId=${id}`).join('&') : ''
  return traccarFetch<TraccarPosition[]>(`/positions${params ? `?${params}` : ''}`, {
    next: { revalidate: 5 },
  })
}

export async function getPositionHistory(
  deviceId: number,
  from: string,
  to: string
): Promise<TraccarPosition[]> {
  return traccarFetch<TraccarPosition[]>(
    `/positions?deviceId=${deviceId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  )
}

// ── Geofence methods ────────────────────────────────────────────

export async function getGeofences(): Promise<TraccarGeofence[]> {
  return traccarFetch<TraccarGeofence[]>('/geofences')
}

export async function createGeofence(input: GeofenceInput): Promise<TraccarGeofence> {
  return traccarFetch<TraccarGeofence>('/geofences', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateGeofence(id: number, input: GeofenceInput): Promise<TraccarGeofence> {
  return traccarFetch<TraccarGeofence>(`/geofences/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ id, ...input }),
  })
}

export async function deleteGeofence(id: number): Promise<void> {
  await traccarFetch<void>(`/geofences/${id}`, { method: 'DELETE' })
}

// ── Speed conversion ────────────────────────────────────────────

export function knotsToKmh(knots: number): number {
  return Math.round(knots * 1.852)
}

// ── WKT ↔ Leaflet geometry converters ───────────────────────────

export interface PolygonGeometry {
  type: 'polygon'
  coordinates: [number, number][]  // [lat, lng] pairs
}

export interface CircleGeometry {
  type: 'circle'
  center: [number, number]  // [lat, lng]
  radius: number            // meters
}

export type LeafletGeometry = PolygonGeometry | CircleGeometry

export function leafletToTraccarWKT(geom: LeafletGeometry): string {
  if (geom.type === 'circle') {
    return `CIRCLE (${geom.center[0]} ${geom.center[1]}, ${geom.radius})`
  }
  // Polygon: Traccar WKT uses lng-lat order
  const coords = geom.coordinates.map(([lat, lng]) => `${lng} ${lat}`)
  // Close the ring if not already closed
  const first = geom.coordinates[0]
  const last = geom.coordinates[geom.coordinates.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push(`${first[1]} ${first[0]}`)
  }
  return `POLYGON ((${coords.join(', ')}))`
}

export function traccarWKTToLeaflet(wkt: string): LeafletGeometry | null {
  const circleMatch = wkt.match(/^CIRCLE\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/i)
  if (circleMatch) {
    return {
      type: 'circle',
      center: [parseFloat(circleMatch[1]), parseFloat(circleMatch[2])],
      radius: parseFloat(circleMatch[3]),
    }
  }

  const polygonMatch = wkt.match(/^POLYGON\s*\(\((.+)\)\)$/i)
  if (polygonMatch) {
    const coords = polygonMatch[1].split(',').map(pair => {
      const [lng, lat] = pair.trim().split(/\s+/).map(Number)
      return [lat, lng] as [number, number]
    })
    // Remove closing duplicate if present
    const first = coords[0]
    const last = coords[coords.length - 1]
    if (coords.length > 1 && first[0] === last[0] && first[1] === last[1]) {
      coords.pop()
    }
    return { type: 'polygon', coordinates: coords }
  }

  return null
}

// ── Douglas-Peucker simplification ─────────────────────────────

interface SimplifyPoint {
  lat: number
  lng: number
  [key: string]: unknown
}

function perpendicularDistance(
  point: SimplifyPoint,
  lineStart: SimplifyPoint,
  lineEnd: SimplifyPoint
): number {
  const dx = lineEnd.lng - lineStart.lng
  const dy = lineEnd.lat - lineStart.lat
  const mag = Math.sqrt(dx * dx + dy * dy)
  if (mag === 0) return Math.sqrt(
    (point.lng - lineStart.lng) ** 2 + (point.lat - lineStart.lat) ** 2
  )
  const u = ((point.lng - lineStart.lng) * dx + (point.lat - lineStart.lat) * dy) / (mag * mag)
  const closestLng = lineStart.lng + u * dx
  const closestLat = lineStart.lat + u * dy
  return Math.sqrt((point.lng - closestLng) ** 2 + (point.lat - closestLat) ** 2)
}

export function simplifyPositions<T extends SimplifyPoint>(
  points: T[],
  tolerance: number = 0.0001 // ~10m in degrees at equator
): T[] {
  if (points.length <= 2) return points

  let maxDist = 0
  let maxIdx = 0
  const first = points[0]
  const last = points[points.length - 1]

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last)
    if (dist > maxDist) {
      maxDist = dist
      maxIdx = i
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPositions(points.slice(0, maxIdx + 1), tolerance)
    const right = simplifyPositions(points.slice(maxIdx), tolerance)
    return [...left.slice(0, -1), ...right]
  }

  return [first, last]
}
