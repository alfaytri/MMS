const BASE = 'https://api.17track.net/track/v2.2'

function headers() {
  return {
    '17token': process.env.SEVENTEEN_TRACK_API_KEY!,
    'Content-Type': 'application/json',
  }
}

// 17track rejection error codes
export const ERR_QUOTA_EXCEEDED    = 4031
export const ERR_AMBIGUOUS_CARRIER = 4013

export interface Track17Event {
  a: string  // timestamp string from carrier
  b: string  // location
  c: string  // description
  z: string  // status tag (e.g. "InTransit")
}

export interface Track17TrackInfo {
  number: string
  carrier: number
  tag: string
  track: { z0?: { a?: Track17Event[] } }
}

export interface Track17RegisterRejection {
  number: string
  error: { code: number; message: string; data?: number[] }
}

export interface Track17RegisterResult {
  accepted: Array<{ number: string; carrier: number }>
  rejected: Track17RegisterRejection[]
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
  return json.data?.accepted?.[0] ?? null
}

export async function stopTracking(trackingNumber: string): Promise<void> {
  await fetch(`${BASE}/stoptrack`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify([{ number: trackingNumber }]),
  })
}
