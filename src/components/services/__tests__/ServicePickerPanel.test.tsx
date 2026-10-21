import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ServicePickerPanel, type BasketLine } from '../ServicePickerPanel'

// ── Fixtures ──────────────────────────────────────────────────────────────────
// Two services both named "Cleaning" under different parents — the case the
// invoice's name-string lookup cannot resolve, and the reason every row and
// every basket line carries its breadcrumb.
const SPLIT_CLEANING = {
  id: 'svc-split-cleaning', name_en: 'Cleaning', name_ar: null,
  path: ['AC General Service', 'Split', 'Cleaning'],
  price: 180, emergency_price: 260, duration: 60,
  division: ['main-division'], thumb_url: 'https://cdn.test/split-clean_thumb.webp',
  is_leaf: true,
}
const DUCTED_CLEANING = {
  id: 'svc-ducted-cleaning', name_en: 'Cleaning', name_ar: null,
  path: ['AC General Service', 'Ducted', 'Cleaning'],
  price: 340, emergency_price: null, duration: 90,
  division: ['main-division'], thumb_url: null,          // no photo — no image slot
  is_leaf: true,
}
const REPAIR_BRANCH = {
  id: 'svc-repair', name_en: 'Repair', name_ar: null,
  path: ['AC General Service', 'Split', 'Repair'],
  price: null, emergency_price: null, duration: null,
  division: ['main-division'], thumb_url: null,
  is_leaf: false,                                        // a branch — must not be addable
}
const GAS_REFILL = {
  id: 'svc-gas', name_en: 'Gas Refill', name_ar: null,
  path: ['AC General Service', 'Split', 'Repair', 'Gas Refill'],
  price: 220, emergency_price: null, duration: 45,
  division: ['main-division'], thumb_url: null, is_leaf: true,
}

const mock = vi.hoisted(() => ({ hits: [] as unknown[], rpc: vi.fn() }))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: mock.rpc.mockImplementation(async () => ({ data: mock.hits, error: null })),
  }),
}))

// Browse mode reads the flat tree; the children of "Repair" are what drilling shows.
vi.mock('@/hooks/useServices', () => ({
  useServiceTree: () => ({
    data: [
      // A real root, so "Browse all categories" has something to show.
      { id: 'svc-split', name_en: 'Split', parent_id: null, price: null,
        emergency_price: null, duration: null, division: ['main-division'] },
      { id: 'svc-repair', name_en: 'Repair', parent_id: 'svc-split', price: null,
        emergency_price: null, duration: null, division: ['main-division'] },
      { id: 'svc-gas', name_en: 'Gas Refill', parent_id: 'svc-repair', price: 220,
        emergency_price: null, duration: 45, division: ['main-division'] },
      { id: 'svc-thermo', name_en: 'Thermostat', parent_id: 'svc-repair', price: 160,
        emergency_price: null, duration: 30, division: ['main-division'] },
    ],
    isLoading: false,
  }),
}))

function renderPanel(onCommit = vi.fn(), props: Record<string, unknown> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ServicePickerPanel onCommit={onCommit} {...props} />
    </QueryClientProvider>,
  )
  return { onCommit }
}

async function search(term: string) {
  const box = screen.getByRole('searchbox')
  fireEvent.change(box, { target: { value: term } })
  await waitFor(() => expect(mock.rpc).toHaveBeenCalled())
  return box
}

beforeEach(() => {
  mock.hits = []
  mock.rpc.mockClear()
})

describe('ServicePickerPanel — search', () => {
  it('focuses the search field on mount', () => {
    renderPanel()
    expect(document.activeElement).toBe(screen.getByRole('searchbox'))
  })

  it('shows each result with its name, breadcrumb and price', async () => {
    mock.hits = [SPLIT_CLEANING]
    renderPanel()
    await search('clean')
    const row = await screen.findByTestId('result-svc-split-cleaning')
    expect(within(row).getByText('Cleaning')).toBeInTheDocument()
    expect(within(row).getByText('AC General Service › Split › Cleaning')).toBeInTheDocument()
    expect(within(row).getByText(/180/)).toBeInTheDocument()
  })

  it('renders no image slot at all for a service without a photo', async () => {
    mock.hits = [SPLIT_CLEANING, DUCTED_CLEANING]
    renderPanel()
    await search('clean')
    const withPhoto = await screen.findByTestId('result-svc-split-cleaning')
    const without = screen.getByTestId('result-svc-ducted-cleaning')
    // Queried by tag, not by role: the thumbnail carries alt="" because the
    // service name sits right beside it, which makes it presentational.
    expect(withPhoto.querySelector('img')).not.toBeNull()
    expect(without.querySelector('img')).toBeNull()
  })
})

describe('ServicePickerPanel — basket', () => {
  it('adds a leaf to the basket on Enter and keeps the query', async () => {
    mock.hits = [SPLIT_CLEANING]
    renderPanel()
    const box = await search('clean')
    await screen.findByTestId('result-svc-split-cleaning')  // results must be on screen first
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(await screen.findByTestId('basket-svc-split-cleaning')).toBeInTheDocument()
    expect((box as HTMLInputElement).value).toBe('clean')
  })

  it('drills into a branch instead of adding it to the basket', async () => {
    mock.hits = [REPAIR_BRANCH]
    renderPanel()
    await search('repair')
    const row = await screen.findByTestId('result-svc-repair')
    fireEvent.click(row)
    // The branch itself never reaches the basket...
    expect(screen.queryByTestId('basket-svc-repair')).toBeNull()
    // ...and its children are now on screen to pick from.
    expect(await screen.findByText('Gas Refill')).toBeInTheDocument()
    expect(screen.getByText('Thermostat')).toBeInTheDocument()
  })

  it('backs out of a drilled branch to its parent, not all the way to search', async () => {
    mock.hits = [REPAIR_BRANCH]
    renderPanel()
    await search('repair')
    fireEvent.click(await screen.findByTestId('result-svc-repair'))
    expect(await screen.findByText('Gas Refill')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    // svc-repair's parent is svc-split, whose only child in the fixture tree is
    // Repair itself — so going back shows Repair again, not an empty panel.
    await waitFor(() => expect(screen.getByTestId('result-svc-repair')).toBeInTheDocument())
    expect(screen.queryByText('Gas Refill')).toBeNull()
  })

  it('accumulates several services and commits them in one call', async () => {
    mock.hits = [SPLIT_CLEANING, DUCTED_CLEANING]
    const { onCommit } = renderPanel()
    await search('clean')
    fireEvent.click(await screen.findByTestId('result-svc-split-cleaning'))
    fireEvent.click(screen.getByTestId('result-svc-ducted-cleaning'))
    fireEvent.click(screen.getByRole('button', { name: /add .*2/i }))

    expect(onCommit).toHaveBeenCalledTimes(1)
    const lines = onCommit.mock.calls[0][0] as BasketLine[]
    expect(lines.map((l) => l.service.id)).toEqual(
      ['svc-split-cleaning', 'svc-ducted-cleaning'],
    )
  })

  it('commits the quantity as edited per basket line', async () => {
    mock.hits = [SPLIT_CLEANING]
    const { onCommit } = renderPanel()
    await search('clean')
    fireEvent.click(await screen.findByTestId('result-svc-split-cleaning'))
    const qty = within(screen.getByTestId('basket-svc-split-cleaning')).getByRole('spinbutton')
    fireEvent.change(qty, { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: /add/i }))

    const lines = onCommit.mock.calls[0][0] as BasketLine[]
    expect(lines[0].qty).toBe(4)
  })

  it('shows a breadcrumb on each basket line so same-named services stay distinct', async () => {
    mock.hits = [SPLIT_CLEANING, DUCTED_CLEANING]
    const { onCommit } = renderPanel()
    await search('clean')
    fireEvent.click(await screen.findByTestId('result-svc-split-cleaning'))
    fireEvent.click(screen.getByTestId('result-svc-ducted-cleaning'))

    const a = screen.getByTestId('basket-svc-split-cleaning')
    const b = screen.getByTestId('basket-svc-ducted-cleaning')
    expect(within(a).getByText(/Split › Cleaning/)).toBeInTheDocument()
    expect(within(b).getByText(/Ducted › Cleaning/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /add/i }))
    const lines = onCommit.mock.calls[0][0] as BasketLine[]
    expect(lines[0].pathNames).toEqual(['AC General Service', 'Split', 'Cleaning'])
    expect(lines[1].pathNames).toEqual(['AC General Service', 'Ducted', 'Cleaning'])
  })

  it('commits nothing when the basket is empty', async () => {
    mock.hits = [GAS_REFILL]
    const { onCommit } = renderPanel()
    await search('gas')
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled()
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe('ServicePickerPanel — after committing', () => {
  it('empties the basket so a second tap cannot re-add the same services', async () => {
    // The team-leader surfaces render this panel inline and never remount it.
    // A basket that survives its own commit means a second tap doubles the
    // quantities on the invoice — on a phone, mid-job, with no warning.
    mock.hits = [SPLIT_CLEANING]
    const { onCommit } = renderPanel()
    await search('clean')
    fireEvent.click(await screen.findByTestId('result-svc-split-cleaning'))
    fireEvent.click(screen.getByRole('button', { name: /add/i }))

    expect(screen.queryByTestId('basket-svc-split-cleaning')).toBeNull()
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled()
    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})

describe('ServicePickerPanel — browsing without searching', () => {
  it('offers a way into the catalogue when nothing has been typed', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /browse all/i }))
    // Root-level nodes are those with no parent in the fixture tree.
    // By row id: "Split" appears in both the name and the breadcrumb.
    expect(await screen.findByTestId('result-svc-split')).toBeInTheDocument()
  })

  it('does not reuse a stale highlight after drilling into a branch', async () => {
    mock.hits = [SPLIT_CLEANING, DUCTED_CLEANING, REPAIR_BRANCH]
    renderPanel()
    const box = await search('ea')
    await screen.findByTestId('result-svc-repair')
    // Highlight the third row, then drill into it: the child list has fewer
    // rows, so a stale index would make Enter resolve undefined and do nothing.
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    fireEvent.click(screen.getByTestId('result-svc-repair'))
    await screen.findByText('Gas Refill')
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(await screen.findByTestId('basket-svc-gas')).toBeInTheDocument()
  })
})

describe('ServicePickerPanel — embedded use', () => {
  it('does not steal focus when autofocus is off', () => {
    renderPanel(vi.fn(), { autoFocusSearch: false })
    expect(document.activeElement).not.toBe(screen.getByRole('searchbox'))
  })
})
