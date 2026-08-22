import { getAccessToken, requireEnv } from './auth'

interface DropResponse {
  finalstatus: string
  reason:      string
  reasontext:  string
  result:      unknown
}

export async function dropCall(extension: string, participantId: number): Promise<void> {
  if (!extension) throw new Error('extension is required')
  if (!Number.isFinite(participantId)) throw new Error('participantId is required')

  const pbx   = requireEnv('3CX_PBX_URL').replace(/\/$/, '')
  const token = await getAccessToken()

  // POST /callcontrol/{dn}/participants/{id}/drop with empty JSON body — the
  // exact shape validated against alfaytri.3cx.asia:5001 in the call-control
  // preflight script (Content-Type is required, otherwise the PBX returns 415).
  const path = `/callcontrol/${encodeURIComponent(extension)}/participants/${participantId}/drop`
  const res = await fetch(`${pbx}${path}`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept':        'application/json',
      'Content-Type':  'application/json',
    },
    body: '{}',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`3CX drop failed: ${res.status} ${text.slice(0, 200)}`)
  }

  // Body should be {"finalstatus":"Success",...}. The PBX returns 200 even for
  // some non-success final statuses (e.g. participant already dropped). Throw
  // when finalstatus is not "Success" so the route surfaces the failure.
  const body = await res.json() as DropResponse
  if (body.finalstatus !== 'Success') {
    throw new Error(`3CX drop returned non-success: ${body.finalstatus} ${body.reasontext}`)
  }
}
