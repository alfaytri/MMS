import { describe, it, expect, vi } from 'vitest'
import { markResolved } from '../mark-resolved'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSupabase(error: any = null) {
  return {
    from: () => ({
      update: () => ({
        eq: () => Promise.resolve({ error }),
      }),
    }),
  }
}

describe('markResolved', () => {
  it('applies optimistic patch then commits on success', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patches: any[] = []
    const dexie = {
      conversations: {
        get:    vi.fn(async () => ({ id: 'c1', unanswered_dismissed_at: null })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: vi.fn(async (_id: string, p: any) => { patches.push(p); return 1 }),
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await markResolved(makeSupabase() as any, dexie as any, 'c1')
    expect(patches).toHaveLength(1)
    expect(patches[0].unanswered_dismissed_at).toBeTruthy()
    expect(dexie.conversations.update).toHaveBeenCalledTimes(1)
  })

  it('reverts the optimistic patch on server failure', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patches: any[] = []
    const dexie = {
      conversations: {
        get:    vi.fn(async () => ({ id: 'c1', unanswered_dismissed_at: null })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: vi.fn(async (_id: string, p: any) => { patches.push(p); return 1 }),
      },
    }
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      markResolved(makeSupabase({ message: 'boom' }) as any, dexie as any, 'c1'),
    ).rejects.toThrow('boom')
    expect(patches).toHaveLength(2)
    expect(patches[1].unanswered_dismissed_at).toBeNull()
  })
})
