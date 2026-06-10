import type {
  CallController,
  DialError,
  ClaimError,
  CallStatus,
  LiveCallEvent,
  EndpointHint,
} from '../call-controller'

export class RestProvider implements CallController {
  async dial(_rawInput: string): Promise<{ ok: true; callId: string } | { ok: false; error: DialError }> {
    throw new Error('rest_provider.dial: not_implemented')
  }

  async hangup(_callId: string): Promise<{ ok: boolean }> {
    throw new Error('rest_provider.hangup: not_implemented')
  }

  async claim(_callId: string): Promise<{ ok: true } | { ok: false; reason: ClaimError }> {
    throw new Error('rest_provider.claim: not_implemented')
  }

  async pollStatus(_callId: string): Promise<CallStatus> {
    throw new Error('rest_provider.pollStatus: not_implemented')
  }

  async preflight(): Promise<{ ok: boolean; error?: DialError; endpointHint?: EndpointHint }> {
    throw new Error('rest_provider.preflight: not_implemented')
  }

  subscribe(_handler: (event: LiveCallEvent) => void): () => void {
    throw new Error('rest_provider.subscribe: not_implemented')
  }
}
