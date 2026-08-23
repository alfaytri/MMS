// src/app/api/follow-up-requests/__tests__/create.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/require-admin', () => ({
  requirePermission: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

import { POST } from '../route'
import { requirePermission } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'

type AnyFn = (...a: unknown[]) => unknown

function makeReq(body: unknown): Request {
  return new Request('http://x/api/follow-up-requests', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/follow-up-requests', () => {
  const userId = '11111111-1111-1111-1111-111111111111'
  const teamId = '22222222-2222-2222-2222-222222222222'
  const parentId = '33333333-3333-3333-3333-333333333333'

  beforeEach(() => {
    vi.resetAllMocks()
    ;(requirePermission as AnyFn) = vi.fn().mockResolvedValue({
      ok: true,
      authUserId: userId,
      email: 'test@example.com',
      profileId: 'pid',
    })
  })

  it('returns 403 when caller lacks follow_ups.request', async () => {
    ;(requirePermission as AnyFn) = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      message: 'Forbidden — required permission: follow_ups.request',
    })
    const res = await POST(makeReq({}))
    expect(res.status).toBe(403)
  })

  it('returns 409 when team is busy', async () => {
    const admin = {
      from: vi.fn((table: string) => {
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: parentId, status: 'completed' },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'order_team_assignments') {
          // This table is queried twice:
          //  1) parent's team:  .select().eq().limit(1).single()
          //  2) bookings:       .select().eq().in()
          return {
            select: () => ({
              eq: () => ({
                limit: () => ({
                  single: vi.fn().mockResolvedValue({
                    data: { team_id: teamId },
                    error: null,
                  }),
                }),
                in: () => ({
                  data: [
                    { team_id: teamId, scheduled_date: '2026-06-20', time_slot: '09:00-11:00', duration: '2h' },
                  ],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'teams') {
          return {
            select: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: teamId, schedule_start: 8, schedule_end: 18 },
                  error: null,
                }),
              }),
            }),
          }
        }
        return { select: () => ({ eq: () => ({ in: () => ({ data: [], error: null }) }) }) }
      }),
    }
    ;(createAdminClient as AnyFn) = vi.fn().mockReturnValue(admin)

    const res = await POST(
      makeReq({
        parent_order_id: parentId,
        services_to_followup: [{ order_service_id: 'a', name: 'X' }],
        requested_date: '2026-06-20',
        requested_time_from: '10:00',
        requested_time_to: '12:00',
        time_note: null,
        notes: 'cleaning',
      })
    )
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('team_busy')
    expect(Array.isArray(body.free_slots)).toBe(true)
  })
})
