export type DialError =
  | 'softphone_offline'
  | 'extension_busy'
  | 'invalid_number'
  | 'pbx_unreachable'
  | 'auto_answer_not_supported'
  | 'no_extension_assigned'

export type ClaimError = 'already_claimed' | 'expired' | 'pbx_unreachable' | 'softphone_offline'

export type CallStatus = { exists: boolean; state?: 'ringing' | 'connected' | 'ended' }

export type EndpointHint = 'desktop' | 'web' | 'mobile' | 'unknown'

export interface LiveCall {
  id: string
  threecxCallId: string
  direction: 'inbound' | 'outbound'
  state: 'ringing' | 'dialing' | 'connected'
  customerPhone: string
  customerName: string | null
  conversationId: string | null
  did: string | null
  claimedBy: string | null
  claimedAt: string | null
  agentExtension: string | null
  initiatedBy: string | null
  startedAt: string
  connectedAt: string | null
}

export type LiveCallEvent =
  | { kind: 'incoming';   call: LiveCall }
  | { kind: 'outgoing';   call: LiveCall }
  | { kind: 'claimed';    callId: string; by: { id: string; name: string | null } }
  | { kind: 'connected';  callId: string; connectedAt: string }
  | { kind: 'ended';      callId: string }

export interface CallController {
  dial(rawInput: string): Promise<{ ok: true; callId: string } | { ok: false; error: DialError }>
  hangup(callId: string): Promise<{ ok: boolean }>
  claim(callId: string): Promise<{ ok: true } | { ok: false; reason: ClaimError }>
  pollStatus(callId: string): Promise<CallStatus>
  preflight(): Promise<{ ok: boolean; error?: DialError; endpointHint?: EndpointHint }>
  subscribe(handler: (event: LiveCallEvent) => void): () => void
}

let _instance: CallController | null = null

export function getCallController(): CallController {
  if (_instance) return _instance
  const choice = process.env['NEXT_PUBLIC_3CX_PROVIDER'] ?? 'rest'
  if (choice === 'webrtc') {
    const { WebRtcProvider } = require('./providers/webrtc-provider') as typeof import('./providers/webrtc-provider')
    _instance = new WebRtcProvider()
  } else {
    const { RestProvider } = require('./providers/rest-provider') as typeof import('./providers/rest-provider')
    _instance = new RestProvider()
  }
  return _instance!
}

export function _resetCallController(): void {
  _instance = null
}
