// src/hooks/useGpsTracking.ts
// Fix 3: uses interval-based throttle, NOT debounce.
// watchPosition stores latest coords; interval flushes every 30s.
import { useEffect, useRef } from 'react'

interface GpsTrackingOptions {
  teamId: string | null
  enabled: boolean
}

export function useGpsTracking({ teamId, enabled }: GpsTrackingOptions) {
  const latestCoords = useRef<GeolocationCoordinates | null>(null)
  const watchId      = useRef<number | null>(null)
  const intervalId   = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!enabled || !teamId || typeof navigator === 'undefined') return

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => { latestCoords.current = pos.coords },
      (err) => console.warn('[GPS]', err.message),
      { enableHighAccuracy: true, maximumAge: 15_000 }
    )

    intervalId.current = setInterval(async () => {
      const coords = latestCoords.current
      if (!coords) return
      try {
        await fetch('/api/team-leader/update-location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            team_id:  teamId,
            lat:      coords.latitude,
            lng:      coords.longitude,
            accuracy: coords.accuracy,
          }),
        })
      } catch (err) {
        console.warn('[GPS ping failed]', err)
      }
    }, 30_000)

    return () => {
      if (watchId.current !== null)    navigator.geolocation.clearWatch(watchId.current)
      if (intervalId.current !== null) clearInterval(intervalId.current)
    }
  }, [enabled, teamId])
}
