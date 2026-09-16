// src/lib/optimumfleet.ts
//
// Optimum Fleet (Trakzee / Uffizio) telematics client — server-side only.
//
// This talks to the platform's CURRENT API generation, confirmed by live probing
// the instance on 2026-09-16:
//   • Base path:  `${OPTIMUMFLEET_BASE_URL}/tracking`   (the old `/webservice`
//     user+pass API replies "API Deprecated" on this instance and must not be used).
//   • Auth:       an Access Code sent in the `auth-code` HTTP header. Generate it in
//     Trakzee → Settings → General → (your account) → User Settings → API Access Code.
//   • Method:     `?token=getLiveData&format=json` (query style; path style 404s).
//   • Rate limit: 1 request / 2 min per company for whole-fleet calls — so the proxy
//     route caches via the Next Data Cache (see revalidate below); never loop per vehicle.
//
// It mirrors src/lib/traccar.ts so `/map` stays a drop-in: `getLiveData()` returns a
// normalised fleet, and `toTraccarPosition()` / `toVehicleMapData()` adapt each vehicle
// to the exact shapes VehicleMarkerLayer already consumes (no UI change).

import type { TraccarPosition } from './traccar'
import type { VehicleMapData } from '@/components/map/VehicleMarkerLayer'

// ── Env (server-side secrets — never referenced from client code) ────────────────
const BASE_URL = (process.env.OPTIMUMFLEET_BASE_URL ?? '').replace(/\/$/, '')
const ACCESS_CODE = process.env.OPTIMUMFLEET_ACCESS_CODE ?? ''

/**
 * True when the live API can actually be called. The Access Code is required —
 * the legacy user/pass method is deprecated on this instance, so USER/PASS alone
 * is treated as "not configured" (the route then returns an empty fleet, not an error).
 */
export function optimumFleetConfigured(): boolean {
  return Boolean(BASE_URL && ACCESS_CODE)
}

// ── Uffizio getLiveData row (documented response shape) ──────────────────────────
export interface UffizioVehicleData {
  Vehicle_Name?: string
  Vehicle_No?: string
  Imeino?: string
  Vehicletype?: string
  Branch?: string
  Company?: string
  DeviceModel?: string
  Latitude?: string
  Longitude?: string
  Speed?: string
  Angle?: string
  GPS?: string
  IGN?: string
  Status?: string
  Datetime?: string
  GPSActualTime?: string
  Odometer?: string
  Fuel?: unknown
  Power?: string
  SOS?: string
  Immobilize_State?: string
  ExternalVolt?: string
  battery_percentage?: number | string
  Location?: string
  Driver_First_Name?: string
  Driver_Middle_Name?: string
  Driver_Last_Name?: string
  [k: string]: unknown
}

export type FleetStatus = 'moving' | 'idle' | 'stopped' | 'offline'

/** Normalised, provider-agnostic vehicle used inside the app. */
export interface OptimumFleetVehicle {
  imei: string
  deviceId: number          // synthetic, stable numeric id derived from the IMEI
  vehicleId: string         // stable string id (`of:<imei|plate>`)
  name: string | null
  plate: string
  type: string
  company: string | null
  latitude: number
  longitude: number
  speedKmh: number
  heading: number           // degrees, 0–359
  status: FleetStatus
  ignition: boolean
  motion: boolean
  lastUpdate: string | null // ISO 8601 (parsed from Uffizio Datetime, requested as UTC)
  location: string | null   // reverse-geocoded address (sidebar — Phase 4)
  driver: string | null     // driver full name (popup — Phase 4)
  odometer: number | null
  battery: number | null
  hasFix: boolean           // false when lat/lng are absent/zero — no map marker
}

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────────

/**
 * Stable unsigned-32-bit hash (djb2) of the IMEI → a positive integer device id.
 * VehicleMarkerLayer matches positions to vehicles by numeric id; both sides come
 * from this same hash so they always line up, and it stays constant across polls.
 */
export function hashImei(key: string): number {
  let h = 5381
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) >>> 0
  }
  return h
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * Parse a Uffizio datetime to an ISO string. We request `Tformat=UTC`, so the
 * components are treated as UTC. Handles `dd-MM-yyyy HH:mm[:ss]` and `yyyy-MM-dd HH:mm[:ss]`.
 */
export function parseUffizioDate(s?: string | null): string | null {
  if (!s) return null
  const t = String(s).trim()
  let m = t.match(/^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (m) {
    const [, dd, MM, yyyy, HH, mm, ss] = m
    return new Date(Date.UTC(+yyyy, +MM - 1, +dd, +HH, +mm, +(ss ?? 0))).toISOString()
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (m) {
    const [, yyyy, MM, dd, HH, mm, ss] = m
    return new Date(Date.UTC(+yyyy, +MM - 1, +dd, +HH, +mm, +(ss ?? 0))).toISOString()
  }
  const p = Date.parse(t)
  return Number.isNaN(p) ? null : new Date(p).toISOString()
}

const truthyIgn = (ign?: string): boolean => {
  const s = String(ign ?? '').trim().toLowerCase()
  return s === '1' || s === 'on' || s === 'true' || s === 'yes'
}

/** Map the Uffizio Status string (+ ignition + speed) to our 4-state status. */
export function normalizeStatus(status: string | undefined, ignOn: boolean, speedKmh: number): FleetStatus {
  const s = String(status ?? '').toLowerCase()
  if (s.includes('inactive') || s.includes('nodata') || s.includes('no data') ||
      s.includes('offline') || s.includes('expire') || s.includes('disconnect')) return 'offline'
  if (speedKmh > 0 || s.includes('running') || s.includes('moving') || s.includes('tow')) return 'moving'
  if (s.includes('idle')) return 'idle'
  if (s.includes('stop') || s.includes('park')) return 'stopped'
  return ignOn ? 'idle' : 'stopped'
}

/** Uffizio getLiveData row → normalised vehicle. Returns null if the row has no identity. */
export function mapLiveDataToVehicle(row: UffizioVehicleData): OptimumFleetVehicle | null {
  const imei = String(row.Imeino ?? '').trim()
  const plate = String(row.Vehicle_No ?? '').trim()
  const name = String(row.Vehicle_Name ?? '').trim()
  const key = imei || plate || name
  if (!key) return null

  const latitude = num(row.Latitude)
  const longitude = num(row.Longitude)
  const speedKmh = num(row.Speed)
  const ignOn = truthyIgn(row.IGN)
  const status = normalizeStatus(row.Status, ignOn, speedKmh)

  const driver = [row.Driver_First_Name, row.Driver_Middle_Name, row.Driver_Last_Name]
    .map((p) => String(p ?? '').trim()).filter(Boolean).join(' ') || null

  const hasFix = Number.isFinite(latitude) && Number.isFinite(longitude) &&
    !(latitude === 0 && longitude === 0)

  return {
    imei,
    deviceId: hashImei(key),
    vehicleId: `of:${key}`,
    name: name || null,
    plate: plate || name || imei,
    type: String(row.Vehicletype ?? '').trim(),
    company: String(row.Company ?? '').trim() || null,
    latitude,
    longitude,
    speedKmh,
    heading: ((Math.round(num(row.Angle)) % 360) + 360) % 360,
    status,
    // Drive the marker/popup consistently from the normalised status:
    motion: status === 'moving',
    ignition: status === 'moving' || status === 'idle',
    lastUpdate: parseUffizioDate(row.Datetime) ?? parseUffizioDate(row.GPSActualTime),
    location: String(row.Location ?? '').trim() || null,
    driver,
    odometer: row.Odometer != null && String(row.Odometer).trim() !== '' ? num(row.Odometer) : null,
    battery: row.battery_percentage != null && String(row.battery_percentage).trim() !== ''
      ? num(row.battery_percentage) : null,
    hasFix,
  }
}

// ── Adapters to the existing map contract (VehicleMarkerLayer) ───────────────────

export function toVehicleMapData(v: OptimumFleetVehicle): VehicleMapData {
  return {
    vehicleId: v.vehicleId,
    name: v.name,
    plate: v.plate,
    type: v.type,
    traccarDeviceId: v.deviceId,
  }
}

export function toTraccarPosition(v: OptimumFleetVehicle): TraccarPosition {
  const t = v.lastUpdate ?? new Date().toISOString()
  return {
    id: v.deviceId,
    deviceId: v.deviceId,
    latitude: v.latitude,
    longitude: v.longitude,
    // Zero speed unless actually moving, so a stale Speed can't flip a stopped
    // vehicle's marker to "moving" (deriveVehicleStatus keys off speed>0).
    speed: v.motion ? Math.round(v.speedKmh) : 0,
    course: v.heading,
    deviceTime: t,
    fixTime: t,
    serverTime: t,
    attributes: { ignition: v.ignition, motion: v.motion },
  }
}

// ── Live fetch ───────────────────────────────────────────────────────────────────

interface UffizioEnvelope {
  success?: boolean
  status?: { code?: number; description?: string }
  message?: string
  root?: { VehicleData?: UffizioVehicleData[] } | UffizioVehicleData[]
  VehicleData?: UffizioVehicleData[]
  data?: UffizioVehicleData[]
  vehicles?: UffizioVehicleData[]
}

function extractRows(json: UffizioEnvelope | UffizioVehicleData[] | null): UffizioVehicleData[] {
  if (Array.isArray(json)) return json
  if (!json || typeof json !== 'object') return []
  const root = json.root
  const candidate =
    (root && !Array.isArray(root) ? root.VehicleData : undefined) ??
    (Array.isArray(root) ? root : undefined) ??
    json.VehicleData ?? json.data ?? json.vehicles
  if (Array.isArray(candidate)) return candidate
  if (candidate && typeof candidate === 'object') return [candidate as UffizioVehicleData]
  return []
}

/**
 * Fetch the whole fleet's live data. Cached server-side for 120s to honour the
 * per-company rate limit (1 request / 2 min); the client hook may poll faster and
 * simply reads the cache.
 */
export async function getLiveData(opts?: { company?: string }): Promise<OptimumFleetVehicle[]> {
  if (!BASE_URL) throw new Error('OPTIMUMFLEET_BASE_URL is not set')
  if (!ACCESS_CODE) {
    throw new Error(
      'OPTIMUMFLEET_ACCESS_CODE is not set. The user/pass API is deprecated on this instance — ' +
      'generate an Access Code in Trakzee (Settings → General → your account → User Settings → API Access Code).'
    )
  }

  const url = new URL(`${BASE_URL}/tracking`)
  url.searchParams.set('token', 'getLiveData')
  url.searchParams.set('format', 'json')
  url.searchParams.set('Tformat', 'UTC')
  if (opts?.company) url.searchParams.set('company', opts.company)

  const res = await fetch(url.toString(), {
    headers: { 'auth-code': ACCESS_CODE, accept: 'application/json' },
    next: { revalidate: 120 },
  })

  const text = await res.text()
  let json: UffizioEnvelope | UffizioVehicleData[]
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Optimum Fleet returned non-JSON (HTTP ${res.status}): ${text.slice(0, 160)}`)
  }

  if (!Array.isArray(json) && json && json.success === false) {
    const desc = json.status?.description ?? json.message ?? 'request failed'
    throw new Error(`Optimum Fleet API: ${String(desc).trim()} (code ${json.status?.code ?? '?'})`)
  }

  return extractRows(json)
    .map(mapLiveDataToVehicle)
    .filter((v): v is OptimumFleetVehicle => v !== null)
}
