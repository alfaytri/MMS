// src/hooks/useTraccar.ts
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { TraccarDevice, TraccarPosition, GeofenceResponse, LeafletGeometry } from '@/lib/traccar'

// ── Devices ─────────────────────────────────────────────────────

export function useTraccarDevices() {
  return useQuery({
    queryKey: ['traccar-devices'],
    queryFn: async (): Promise<TraccarDevice[]> => {
      const res = await fetch('/api/traccar/devices')
      if (!res.ok) throw new Error('Failed to fetch Traccar devices')
      return res.json()
    },
    staleTime: 60_000,
  })
}

// ── Live Positions ──────────────────────────────────────────────

export function useTraccarPositions(deviceIds: number[]) {
  return useQuery({
    queryKey: ['traccar-positions', deviceIds],
    queryFn: async (): Promise<TraccarPosition[]> => {
      if (deviceIds.length === 0) return []
      const params = deviceIds.join(',')
      const res = await fetch(`/api/traccar/positions?deviceIds=${params}`)
      if (!res.ok) throw new Error('Failed to fetch positions')
      return res.json()
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    enabled: deviceIds.length > 0,
  })
}

// ── Position History ────────────────────────────────────────────

export function useTraccarHistory(
  deviceId: number | null,
  from: string | null,
  to: string | null
) {
  return useQuery({
    queryKey: ['traccar-history', deviceId, from, to],
    queryFn: async (): Promise<TraccarPosition[]> => {
      const res = await fetch(
        `/api/traccar/positions/history?deviceId=${deviceId}&from=${encodeURIComponent(from!)}&to=${encodeURIComponent(to!)}`
      )
      if (!res.ok) throw new Error('Failed to fetch position history')
      return res.json()
    },
    enabled: deviceId != null && from != null && to != null,
    staleTime: 60_000,
  })
}

// ── Geofences ───────────────────────────────────────────────────

export function useTraccarGeofences() {
  return useQuery({
    queryKey: ['traccar-geofences'],
    queryFn: async (): Promise<GeofenceResponse[]> => {
      const res = await fetch('/api/traccar/geofences')
      if (!res.ok) throw new Error('Failed to fetch geofences')
      return res.json()
    },
    staleTime: 30_000,
  })
}

export function useCreateGeofence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      name: string
      description?: string
      color?: string
      geometry: LeafletGeometry
    }) => {
      const res = await fetch('/api/traccar/geofences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to create geofence')
      }
      return res.json() as Promise<GeofenceResponse>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['traccar-geofences'] })
    },
  })
}

export function useUpdateGeofence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      traccarGeofenceId: number
      name: string
      description?: string
      color?: string
      geometry?: LeafletGeometry
    }) => {
      const res = await fetch(`/api/traccar/geofences/${input.traccarGeofenceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to update geofence')
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['traccar-geofences'] })
    },
  })
}

export function useDeleteGeofence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (traccarGeofenceId: number) => {
      const res = await fetch(`/api/traccar/geofences/${traccarGeofenceId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to delete geofence')
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['traccar-geofences'] })
    },
  })
}
