// src/lib/optimumfleet.ts
//
// Optimum Fleet (Trakzee / Uffizio) telematics client — server-side only.
//
// Confirmed against Optimum Solutions' own API manual + live probing (2026-09-16).
// This tenant ("AVL Premium", ProjectId 37) exposes live data through a TWO-STEP
// flow on the `/webservice` endpoint — NOT the `/tracking` header API (whose methods
// aren't provisioned for this package) and NOT the UI "API Access Code" JWT:
//
//   1. POST /webservice?token=generateAccessToken   body {username,password}
//        -> { result:1, data:{ token } }              (token cached + refreshed on 401)
//   2. POST /webservice?token=getTokenBaseLiveData&ProjectId=37
//        headers: auth-code:<token>, Content-Type: application/json
//        body:    { company_names:"ALFAYTRI" }        (>=1 filter is mandatory)
//        -> { root:{ VehicleData:[ … ] } }
//
// Rate limit: whole-fleet calls are throttled per company, so results are cached in
// memory for 120s and stale cache is served on transient errors. Datetimes come back
// in tenant-local time (Qatar, UTC+3) and are normalised to UTC on parse.
//
// It mirrors src/lib/traccar.ts so `/map` stays a drop-in: getLiveData() returns a
// normalised fleet, and toTraccarPosition()/toVehicleMapData() adapt each vehicle to
// the shapes VehicleMarkerLayer already consumes (no UI change).

import type { TraccarPosition } from './traccar'
import type { VehicleMapData } from '@/components/map/VehicleMarkerLayer'

// ── Env (server-side only) ───────────────────────────────────────────────────────
const BASE_URL = (process.env.OPTIMUMFLEET_BASE_URL ?? '').replace(/\/$/, '')
const USER = process.env.OPTIMUMFLEET_USER ?? ''
const PASS = process.env.OPTIMUMFLEET_PASS ?? ''
const COMPANY = process.env.OPTIMUMFLEET_COMPANY ?? 'ALFAYTRI'
const PROJECT_ID = process.env.OPTIMUMFLEET_PROJECT_ID ?? '37' // 37 = AVL Premium, 49 = Standard
// Tenant datetimes are local wall-clock; Qatar is UTC+3 (no DST). Override if needed.
const TZ_OFFSET_MIN = Number(process.env.OPTIMUMFLEET_TZ_OFFSET_MIN ?? '180')

/**
 * True when the live API can actually be called. generateAccessToken needs the
 * account username + password; without them the route returns an empty fleet (no error).
 */
export function optimumFleetConfigured(): boolean {
  return Boolean(BASE_URL && USER && PASS)
}

// ── Uffizio getTokenBaseLiveData row (confirmed response shape) ───────────────────
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
  lastUpdate: string | null // ISO 8601 UTC (parsed from tenant-local Datetime)
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
 * Parse a Uffizio datetime to a UTC ISO string. `offsetMinutes` is the tenant's
 * timezone offset from UTC (e.g. 180 for Qatar UTC+3): the wall-clock is that many
 * minutes ahead of UTC, so we subtract it. Handles `dd-MM-yyyy HH:mm[:ss]` and
 * `yyyy-MM-dd HH:mm[:ss]`. Default offset 0 treats the value as already-UTC.
 */
export function parseUffizioDate(s?: string | null, offsetMinutes = 0): string | null {
  if (!s) return null
  const t = String(s).trim()
  const build = (yyyy: number, MM: number, dd: number, HH: number, mm: number, ss: number) =>
    new Date(Date.UTC(yyyy, MM - 1, dd, HH, mm, ss) - offsetMinutes * 60_000).toISOString()
  let m = t.match(/^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (m) return build(+m[3], +m[2], +m[1], +m[4], +m[5], +(m[6] ?? 0))
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (m) return build(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0))
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

/** Uffizio row → normalised vehicle. Returns null if the row has no identity. */
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
    .map((p) => String(p ?? '').trim())
    .filter((p) => p && p.toLowerCase() !== 'null')
    .join(' ') || null

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
    lastUpdate: parseUffizioDate(row.Datetime, TZ_OFFSET_MIN) ?? parseUffizioDate(row.GPSActualTime, TZ_OFFSET_MIN),
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

// ── Live fetch (2-step /webservice flow, with token + data caching) ──────────────

interface UffizioEnvelope {
  result?: number
  message?: string
  success?: boolean
  status?: { code?: number; description?: string }
  data?: { token?: string } | UffizioVehicleData[]
  root?: { VehicleData?: UffizioVehicleData[] } | UffizioVehicleData[]
  VehicleData?: UffizioVehicleData[]
}

let _token: { value: string; at: number } | null = null
let _fleet: { at: number; data: OptimumFleetVehicle[] } | null = null
const TOKEN_TTL_MS = 45 * 60_000
const FLEET_TTL_MS = 120_000

/** Step 1 — exchange username/password for an access token (cached, refreshable). */
async function getAccessToken(force = false): Promise<string> {
  if (!force && _token && Date.now() - _token.at < TOKEN_TTL_MS) return _token.value
  const res = await fetch(`${BASE_URL}/webservice?token=generateAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => null)) as UffizioEnvelope | null
  const token = json && !Array.isArray(json.data) ? json.data?.token : undefined
  if (!json || json.result !== 1 || !token) {
    throw new Error(`Optimum Fleet auth failed: ${json?.message || `HTTP ${res.status}`}`)
  }
  _token = { value: token, at: Date.now() }
  return token
}

function extractRows(json: UffizioEnvelope | null): UffizioVehicleData[] {
  if (!json) return []
  const root = json.root
  const rows = (root && !Array.isArray(root) ? root.VehicleData : undefined) ??
    (Array.isArray(root) ? root : undefined) ?? json.VehicleData
  return Array.isArray(rows) ? rows : []
}

/** Step 2 — call getTokenBaseLiveData with a token; caller handles token refresh. */
async function fetchLiveRows(token: string): Promise<UffizioEnvelope> {
  const res = await fetch(`${BASE_URL}/webservice?token=getTokenBaseLiveData&ProjectId=${PROJECT_ID}`, {
    method: 'POST',
    headers: { 'auth-code': token, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ company_names: COMPANY }),
    cache: 'no-store',
  })
  const text = await res.text()
  try {
    return JSON.parse(text) as UffizioEnvelope
  } catch {
    throw new Error(`Optimum Fleet returned non-JSON (HTTP ${res.status}): ${text.slice(0, 160)}`)
  }
}

const isInvalidToken = (j: UffizioEnvelope): boolean =>
  j?.result === 0 && /invalid token/i.test(String(j?.message ?? ''))

/**
 * Whole fleet's live data, normalised. Cached 120s to respect the per-company rate
 * limit; on a transient upstream error the last good snapshot is served if we have one.
 */
export async function getLiveData(): Promise<OptimumFleetVehicle[]> {
  if (!BASE_URL) throw new Error('OPTIMUMFLEET_BASE_URL is not set')
  if (!USER || !PASS) {
    throw new Error('OPTIMUMFLEET_USER / OPTIMUMFLEET_PASS are not set (required for generateAccessToken)')
  }

  const now = Date.now()
  if (_fleet && now - _fleet.at < FLEET_TTL_MS) return _fleet.data

  try {
    let token = await getAccessToken()
    let json = await fetchLiveRows(token)
    if (isInvalidToken(json)) {           // token expired/rotated → refresh once and retry
      token = await getAccessToken(true)
      json = await fetchLiveRows(token)
    }
    if (json.result === 0) {
      throw new Error(`Optimum Fleet API: ${String(json.message ?? 'request failed').trim()}`)
    }
    const data = extractRows(json)
      .map(mapLiveDataToVehicle)
      .filter((v): v is OptimumFleetVehicle => v !== null)
    _fleet = { at: now, data }
    return data
  } catch (err) {
    if (_fleet) return _fleet.data       // serve stale snapshot on transient failure
    throw err
  }
}
