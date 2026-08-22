import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTeamPhones } from '../useTeamPhones'
import React from 'react'

const mockSelect = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        is: () => ({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          then: (resolve: any) => Promise.resolve(mockSelect()).then(resolve),
        }),
      }),
    }),
  }),
}))

function wrap({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useTeamPhones', () => {
  beforeEach(() => mockSelect.mockReset())

  it('returns empty map when no teams have a phone', async () => {
    mockSelect.mockResolvedValue({ data: [{ id: 't1', name_en: 'A', name_ar: null, phone: null, division_id: null }], error: null })
    const { result } = renderHook(() => useTeamPhones(), { wrapper: wrap })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.byPhone.size).toBe(0)
    expect(result.current.teams).toHaveLength(0)
  })

  it('indexes teams by normalised phone', async () => {
    mockSelect.mockResolvedValue({
      data: [
        { id: 't1', name_en: 'A', name_ar: null, phone: '+974-5555-1234', division_id: 'd1' },
        { id: 't2', name_en: 'B', name_ar: null, phone: '00974 5555 9999', division_id: 'd1' },
        { id: 't3', name_en: 'C', name_ar: null, phone: null, division_id: 'd2' },
      ],
      error: null,
    })
    const { result } = renderHook(() => useTeamPhones(), { wrapper: wrap })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.teams).toHaveLength(2)
    expect(result.current.byPhone.get('+97455551234')?.id).toBe('t1')
    expect(result.current.byPhone.get('+97455559999')?.id).toBe('t2')
  })
})
