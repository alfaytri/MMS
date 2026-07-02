const BASE = 'https://api.17track.net/track/v2.2'

function headers() {
  return {
    '17token': process.env.SEVENTEEN_TRACK_API_KEY!,
    'Content-Type': 'application/json',
  }
}

export const ERR_QUOTA_EXCEEDED    = 4031
export const ERR_AMBIGUOUS_CARRIER = 4013

// v2.2 event shape from tracking.providers[].events[]
export interface Track17Event {
  time_iso: string
  time_utc: string
  description: string
  location: string | null
  stage: string | null
  sub_status: string
}

export interface Track17TrackInfo {
  number: string
  carrier: number
  tag: string
  track_info: {
    latest_status?: { status: string; sub_status: string }
    tracking?: {
      providers?: Array<{
        provider: { key: number; name: string; country: string }
        events: Track17Event[]
      }>
    }
  }
}

export interface Track17RegisterRejection {
  number: string
  error: { code: number; message: string; data?: number[] }
}

export interface Track17RegisterResult {
  accepted: Array<{ number: string; carrier: number }>
  rejected: Track17RegisterRejection[]
}

export function extractEvents(info: Track17TrackInfo): Track17Event[] {
  return info.track_info?.tracking?.providers?.[0]?.events ?? []
}

export function extractCarrierName(info: Track17TrackInfo): string | null {
  return info.track_info?.tracking?.providers?.[0]?.provider?.name ?? null
}

export function extractStatus(info: Track17TrackInfo): string | null {
  return info.track_info?.latest_status?.status ?? null
}

export async function registerTracking(
  trackingNumber: string,
  carrierCode?: number
): Promise<Track17RegisterResult> {
  const body: Record<string, unknown>[] = [{ number: trackingNumber }]
  if (carrierCode !== undefined) body[0].carrier = carrierCode
  const res = await fetch(`${BASE}/register`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  const json = await res.json()
  return { accepted: json.data?.accepted ?? [], rejected: json.data?.rejected ?? [] }
}

export async function getTrackInfo(
  trackingNumber: string,
  carrierCode?: number
): Promise<Track17TrackInfo | null> {
  const body: Record<string, unknown>[] = [{ number: trackingNumber }]
  if (carrierCode !== undefined) body[0].carrier = carrierCode
  const res = await fetch(`${BASE}/gettrackinfo`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (json.code !== 0) {
    console.error('[17track/gettrackinfo] API error:', json.code, json.message)
    return null
  }
  const info = json.data?.accepted?.[0] as Track17TrackInfo | undefined
  if (info) {
    const events = extractEvents(info)
    const status = extractStatus(info)
    console.log(`[17track/gettrackinfo] status=${status}, carrier=${info.carrier}, events=${events.length}`)
  }
  return info ?? null
}

export async function stopTracking(trackingNumber: string): Promise<void> {
  await fetch(`${BASE}/stoptrack`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify([{ number: trackingNumber }]),
  })
}
