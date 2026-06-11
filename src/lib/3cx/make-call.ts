import { getAccessToken } from './auth'

interface MakeCallArgs {
  extension:   string  // the 3CX extension (DN) that should ring first
  destination: string  // E.164, e.g. "+97455123456"
}

export async function makeCall({ extension, destination }: MakeCallArgs): Promise<void> {
  if (!extension)   throw new Error('extension is required')
  if (!destination) throw new Error('destination is required')

  const pbx   = process.env['3CX_PBX_URL']!.replace(/\/$/, '')
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
    const text = await res.text()
    throw new Error(`3CX MakeCall failed: ${res.status} ${text.slice(0, 200)}`)
  }
}
