import { describe, it, expect } from 'vitest'
import { ensureTeamConversation } from '../ensure-team-conversation'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function supabaseStub(seq: Array<any>) {
  let i = 0
  const pop = () => seq[i++]
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve(pop()),
          }),
        }),
      }),
      insert: () => ({
        select: () => ({ single: () => Promise.resolve(pop()) }),
      }),
    }),
  }
}

describe('ensureTeamConversation', () => {
  it('returns existing conversation id when one is found', async () => {
    const supa = supabaseStub([{ data: { id: 'existing-id' }, error: null }])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = await ensureTeamConversation(supa as any, {
      phone:    '+97455551234',
      teamName: 'Team A',
    })
    expect(id).toBe('existing-id')
  })

  it('inserts and returns new id when conversation is absent', async () => {
    const supa = supabaseStub([
      { data: null, error: null },
      { data: { id: 'new-id' }, error: null },
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = await ensureTeamConversation(supa as any, {
      phone:    '+97455551234',
      teamName: 'Team A',
    })
    expect(id).toBe('new-id')
  })

  it('recovers from a 23505 race by re-fetching the winner', async () => {
    const supa = supabaseStub([
      { data: null, error: null },
      { data: null, error: { code: '23505', message: 'dup' } },
      { data: { id: 'raced-id' }, error: null },
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = await ensureTeamConversation(supa as any, {
      phone:    '+97455551234',
      teamName: 'Team A',
    })
    expect(id).toBe('raced-id')
  })

  it('throws on unexpected insert error', async () => {
    const supa = supabaseStub([
      { data: null, error: null },
      { data: null, error: { code: '42P01', message: 'no table' } },
    ])
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ensureTeamConversation(supa as any, { phone: '+97455551234', teamName: 'Team A' }),
    ).rejects.toThrow('no table')
  })
})
