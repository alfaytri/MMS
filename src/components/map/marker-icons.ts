// src/components/map/marker-icons.ts
import L from 'leaflet'
import type { TeamLocationStatus } from '@/hooks/useTeamLocations'
import type { OrderLocationStatus } from '@/hooks/useOrderLocations'

// ── Status color maps (hex — needed for Leaflet inline HTML) ─────

const TEAM_STATUS_COLORS: Record<TeamLocationStatus, string> = {
  moving:  '#22c55e',
  idle:    '#eab308',
  stopped: '#ef4444',
  offline: '#94a3b8',
}

const ORDER_STATUS_COLORS: Record<OrderLocationStatus, string> = {
  scheduled:     '#3b82f6',
  'in-progress': '#f59e0b',
  completed:     '#22c55e',
  pending:       '#94a3b8',
}

// ── SVG paths ────────────────────────────────────────────────────

const NAVIGATION_ARROW = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`

const MAP_PIN = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="{color}" stroke="none"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`

// ── Team marker icons (cached — 4 total) ─────────────────────────

const teamIconCache = new Map<TeamLocationStatus, L.DivIcon>()

export function getTeamIcon(status: TeamLocationStatus): L.DivIcon {
  const cached = teamIconCache.get(status)
  if (cached) return cached

  const color = TEAM_STATUS_COLORS[status]
  const pulseClass = status === 'moving' ? ' marker-pulse' : ''

  const icon = L.divIcon({
    className: '', // prevent Leaflet's default icon class
    html: `<div class="${pulseClass}" style="background:${color};width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">${NAVIGATION_ARROW}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  })

  teamIconCache.set(status, icon)
  return icon
}

// ── Order marker icons (cached — 4 total) ────────────────────────

const orderIconCache = new Map<OrderLocationStatus, L.DivIcon>()

export function getOrderIcon(status: OrderLocationStatus): L.DivIcon {
  const cached = orderIconCache.get(status)
  if (cached) return cached

  const color = ORDER_STATUS_COLORS[status]
  const pinSvg = MAP_PIN.replace('{color}', color)

  const icon = L.divIcon({
    className: '',
    html: `<div style="background:white;width:24px;height:24px;border-radius:6px;border:2.5px solid ${color};box-shadow:0 2px 6px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;">${pinSvg}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  })

  orderIconCache.set(status, icon)
  return icon
}

// ── Popup HTML builders ──────────────────────────────────────────

export function buildTeamPopup(team: {
  teamName: string
  driverName: string
  vehiclePlate: string
  speed: number | null
  status: TeamLocationStatus
  currentTask: string | null
}): string {
  const lines = [
    `<div style="font-size:13px;line-height:1.4;">`,
    `<div style="font-weight:600;margin-bottom:2px;">${team.teamName}</div>`,
    `<div style="color:#64748b;font-size:11px;">${team.driverName} · ${team.vehiclePlate}</div>`,
  ]
  if (team.currentTask) {
    lines.push(`<div style="color:#64748b;font-size:11px;margin-top:3px;">📍 ${team.currentTask}</div>`)
  }
  if (team.status === 'moving' && team.speed != null) {
    lines.push(`<div style="color:#64748b;font-size:11px;margin-top:2px;">🚗 ${Math.round(team.speed)} km/h</div>`)
  }
  lines.push('</div>')
  return lines.join('')
}

export function buildOrderPopup(order: {
  orderId: string
  customerName: string
  service: string
  address: string
  status: string
}): string {
  const color = ORDER_STATUS_COLORS[order.status as OrderLocationStatus] ?? '#94a3b8'
  return [
    `<div style="font-size:13px;line-height:1.4;">`,
    `<div style="font-weight:600;margin-bottom:2px;">${order.orderId}</div>`,
    `<div style="color:#64748b;font-size:11px;">${order.customerName}</div>`,
    order.service ? `<div style="color:#64748b;font-size:11px;">🔧 ${order.service}</div>` : '',
    order.address ? `<div style="color:#64748b;font-size:11px;">📍 ${order.address}</div>` : '',
    `<div style="font-size:11px;font-weight:600;color:${color};margin-top:3px;text-transform:capitalize;">${order.status}</div>`,
    `</div>`,
  ].join('')
}

// ── Cluster icon factory ─────────────────────────────────────────

export function createClusterIcon(cluster: { getChildCount: () => number }): L.DivIcon {
  const count = cluster.getChildCount()
  let sizeClass = 'cluster-icon--sm'
  let size = 30
  if (count >= 50) { sizeClass = 'cluster-icon--lg'; size = 50 }
  else if (count >= 10) { sizeClass = 'cluster-icon--md'; size = 40 }

  return L.divIcon({
    className: '',
    html: `<div class="cluster-icon ${sizeClass}">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

// ── Vehicle tracking status ─────────────────────────────────────

export type VehicleTrackingStatus = 'moving' | 'idle' | 'stopped'

const VEHICLE_STATUS_COLORS: Record<VehicleTrackingStatus, string> = {
  moving:  '#22c55e',
  idle:    '#f59e0b',
  stopped: '#94a3b8',
}

const CAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-2-2.2-3.3C13 5.6 12 5 11 5H5c-.6 0-1.1.2-1.4.6L1.8 7.8A2 2 0 0 0 1 9.5V16c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>`

const vehicleIconCache = new Map<VehicleTrackingStatus, L.DivIcon>()

export function getVehicleIcon(status: VehicleTrackingStatus): L.DivIcon {
  const cached = vehicleIconCache.get(status)
  if (cached) return cached

  const color = VEHICLE_STATUS_COLORS[status]
  const pulseClass = status === 'moving' ? ' marker-pulse' : ''

  const icon = L.divIcon({
    className: '',
    html: `<div class="${pulseClass}" style="background:${color};width:32px;height:32px;border-radius:8px;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">${CAR_SVG}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  })

  vehicleIconCache.set(status, icon)
  return icon
}

// ── Vehicle popup builder ───────────────────────────────────────

export function buildVehiclePopup(vehicle: {
  plate: string
  type: string
  speed: number
  ignition: boolean
  motion: boolean
  lastUpdate: string
}): string {
  const statusText = vehicle.motion ? 'Moving' : vehicle.ignition ? 'Idle' : 'Stopped'
  const ignitionText = vehicle.ignition ? '🟢 On' : '🔴 Off'
  return [
    `<div style="font-size:13px;line-height:1.4;">`,
    `<div style="font-weight:600;margin-bottom:2px;">${vehicle.plate}</div>`,
    `<div style="color:#64748b;font-size:11px;text-transform:capitalize;">${vehicle.type}</div>`,
    `<div style="color:#64748b;font-size:11px;margin-top:3px;">🚗 ${vehicle.speed} km/h</div>`,
    `<div style="color:#64748b;font-size:11px;">Ignition: ${ignitionText}</div>`,
    `<div style="color:#64748b;font-size:11px;">Status: ${statusText}</div>`,
    `<div style="color:#94a3b8;font-size:10px;margin-top:3px;">⏱ ${new Date(vehicle.lastUpdate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>`,
    `</div>`,
  ].join('')
}

export function deriveVehicleStatus(
  motion: boolean | undefined,
  ignition: boolean | undefined
): VehicleTrackingStatus {
  if (motion) return 'moving'
  if (ignition) return 'idle'
  return 'stopped'
}
