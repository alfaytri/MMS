import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const useOrderChatMock = vi.fn()
vi.mock('@/hooks/useOrderChat', () => ({
  useOrderChat: () => useOrderChatMock(),
  useSendOrderMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  getOrderChatAttachmentSignedUrl: vi.fn(),
}))
vi.mock('@/hooks/useProfiles', () => ({
  useCurrentUserProfile: () => ({ data: { id: 'u1', full_name: 'Me' } }),
}))
vi.mock('@/components/purchase/BillAttachmentPicker', () => ({
  BillAttachmentPicker: () => null,
}))

import { OrderChatPanel } from '../OrderChatPanel'

const MESSAGES = [
  { id: 'm1', order_kind: 'po', order_id: 'o1', author_id: 'u1', author_name: 'Me', body: 'hello from me', created_at: '2026-09-08T10:00:00Z', attachments: [] },
  { id: 'm2', order_kind: 'po', order_id: 'o1', author_id: 'u2', author_name: 'Colleague', body: 'reply from them', created_at: '2026-09-08T10:01:00Z', attachments: [] },
]

describe('OrderChatPanel', () => {
  beforeEach(() => useOrderChatMock.mockReset())

  it('renders each message body and author', () => {
    useOrderChatMock.mockReturnValue({ data: MESSAGES, isLoading: false })
    render(<OrderChatPanel kind="po" orderId="o1" />)
    expect(screen.getByText('hello from me')).toBeInTheDocument()
    expect(screen.getByText('reply from them')).toBeInTheDocument()
    expect(screen.getByText(/Colleague/)).toBeInTheDocument()
  })

  it('shows an empty state when there are no messages', () => {
    useOrderChatMock.mockReturnValue({ data: [], isLoading: false })
    render(<OrderChatPanel kind="po" orderId="o1" />)
    expect(screen.getByText(/No messages yet/i)).toBeInTheDocument()
  })
})
