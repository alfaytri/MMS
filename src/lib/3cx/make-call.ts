import { getAccessToken, requireEnv } from './auth'

interface MakeCallArgs {
  extension:   string  // the 3CX extension (DN) that should ring first
  destination: string  // E.164, e.g. "+97455123456"
}

/** Thrown when 3CX can't reach the user's softphone (extension not registered). */
export class SoftphoneOfflineError extends Error {
  constructor() {
    super('Softphone offline')
    this.name = 'SoftphoneOfflineError'
  }
}

export async function makeCall({ extension, destination }: MakeCallArgs): Promise<void> {
  if (!extension)   throw new Error('extension is required')
  if (!destination) throw new Error('destination is required')

  const pbx   = requireEnv('3CX_PBX_URL').replace(/\/$/, '')
  const token = await getAccessToken()

  const res = await fetch(`${pbx}/xapi/v1/Users/Pbx.MakeCall`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ dn: extension, destination }),
  })

  if (!res.ok) {
    // 404 from MakeCall means 3CX can't find a registered endpoint for this DN —
    // i.e., the softphone app isn't running / signed in.
    if (res.status === 404) throw new SoftphoneOfflineError()
    const text = await res.text()
    throw new Error(`3CX MakeCall failed: ${res.status} ${text.slice(0, 200)}`)
  }
}
