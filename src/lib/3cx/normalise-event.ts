export type RawEvent = 'ringing' | 'pickupincoming' | 'pickupoutgoing'
                     | 'dialing' | 'incoming'       | 'outgoing'

interface CommonFields {
  raw_event:        RawEvent
  call_id1:         string
  call_id2:         string
  caller_phone:     string
  extension:        string
  user_type:        'other' | 'queue' | 'ext'
  did:              string
  sip_displayname:  string
  phonebook:        string
}

export type NormalisedEvent =
  | (CommonFields & { kind: 'ringing'  })
  | (CommonFields & { kind: 'answered' })
  | (CommonFields & { kind: 'dialing'  })
  | (CommonFields & {
      kind:                       'hangup'
      direction:                  'inbound' | 'outbound'
      finish:                     'Ok' | 'Missed'
      transfer:                   boolean
      break_side:                 'Internal' | 'Undef'
      title:                      string
      termination_reason_details: string
      recording_urls:             string[]
    })

function asString(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return `+${digits}`
}

export function normaliseEvent(body: Record<string, unknown>): NormalisedEvent | null {
  const ev = asString(body.event).toLowerCase() as RawEvent
  if (!['ringing','pickupincoming','pickupoutgoing','dialing','incoming','outgoing'].includes(ev)) {
    return null
  }

  const common: CommonFields = {
    raw_event:        ev,
    call_id1:         asString(body.call_id1),
    call_id2:         asString(body.call_id2),
    caller_phone:     normalisePhone(asString(body.callerid)),
    extension:        asString(body.user),
    user_type:        (asString(body.usertype) || 'ext') as CommonFields['user_type'],
    did:              asString(body.did),
    sip_displayname:  asString(body.sip_displayname),
    phonebook:        asString(body.phonebook),
  }

  if (ev === 'ringing')                                    return { ...common, kind: 'ringing'  }
  if (ev === 'pickupincoming' || ev === 'pickupoutgoing')  return { ...common, kind: 'answered' }
  if (ev === 'dialing')                                    return { ...common, kind: 'dialing'  }

  const direction: 'inbound' | 'outbound' = ev === 'incoming' ? 'inbound' : 'outbound'
  const filesRaw = Array.isArray(body.FILES) ? body.FILES : []
  const recording_urls = filesRaw.filter((u): u is string => typeof u === 'string')

  return {
    ...common,
    kind:                       'hangup',
    direction,
    finish:                     (asString(body.finishtype) === 'Missed' ? 'Missed' : 'Ok') as 'Ok' | 'Missed',
    transfer:                   asString(body.transfer) === 'True',
    break_side:                 (asString(body.breakside) === 'Internal' ? 'Internal' : 'Undef') as 'Internal' | 'Undef',
    title:                      asString(body.title),
    termination_reason_details: asString(body.termination_reason_details),
    recording_urls,
  }
}
