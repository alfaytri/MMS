let lastPlayTime = 0

// Two-note chime (E5 → G#5) via Web Audio API — no asset file needed.
// Debounced to once per 1.5 s so a burst of messages plays a single sound.
export function playNotificationSound(): void {
  const now = Date.now()
  if (now - lastPlayTime < 1500) return
  lastPlayTime = now

  try {
    const ctx = new AudioContext()
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.35, ctx.currentTime)
    master.connect(ctx.destination)

    const tones = [
      { freq: 659.25, start: 0,    dur: 0.28 },  // E5
      { freq: 830.61, start: 0.13, dur: 0.35 },  // G#5
    ]

    for (const { freq, start, dur } of tones) {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(master)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start)
      const t0 = ctx.currentTime + start
      gain.gain.setValueAtTime(0, t0)
      gain.gain.linearRampToValueAtTime(1, t0 + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
      osc.start(t0)
      osc.stop(t0 + dur)
    }

    setTimeout(() => ctx.close(), 700)
  } catch {
    // AudioContext blocked by autoplay policy or not available — fail silently
  }
}
