import type { CallController } from '../call-controller'

export class WebRtcProvider implements CallController {
  dial(): never { throw new Error('webrtc_provider: not_implemented') }
  hangup(): never { throw new Error('webrtc_provider: not_implemented') }
  claim(): never { throw new Error('webrtc_provider: not_implemented') }
  pollStatus(): never { throw new Error('webrtc_provider: not_implemented') }
  preflight(): never { throw new Error('webrtc_provider: not_implemented') }
  subscribe(): never { throw new Error('webrtc_provider: not_implemented') }
}
