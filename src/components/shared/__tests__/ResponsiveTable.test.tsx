import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ResponsiveTable, type ResponsiveTableColumn } from '../ResponsiveTable'

interface Row { id: string; name: string; total: number }

const COLUMNS: ResponsiveTableColumn<Row>[] = [
  { header: 'Name', cell: (r) => r.name },
  { header: 'Total', cell: (r) => r.total, align: 'right' },
]

const DATA: Row[] = [
  { id: '1', name: 'Alice', total: 100 },
  { id: '2', name: 'Bob', total: 200 },
]

describe('ResponsiveTable', () => {
  it('renders a desktop table (always present in DOM, visible above md:)', () => {
    render(<ResponsiveTable<Row> data={DATA} columns={COLUMNS} getRowKey={(r) => r.id} />)
    expect(screen.getAllByText('Name').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Total').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0)
  })

  it('renders mobile cards when mobileCardRender is provided', () => {
    render(
      <ResponsiveTable<Row>
        data={DATA}
        columns={COLUMNS}
        getRowKey={(r) => r.id}
        mobileCardRender={(r) => <div data-testid={`card-${r.id}`}>{r.name}</div>}
      />,
    )
    expect(screen.getByTestId('card-1')).toBeInTheDocument()
    expect(screen.getByTestId('card-2')).toBeInTheDocument()
  })

  it('falls back to horizontal-scroll wrapper when no mobileCardRender', () => {
    const { container } = render(
      <ResponsiveTable<Row> data={DATA} columns={COLUMNS} getRowKey={(r) => r.id} />,
    )
    const wrapper = container.querySelector('[data-mobile-fallback]')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.className).toContain('overflow-x-auto')
  })

  it('renders empty state when data is empty', () => {
    render(
      <ResponsiveTable<Row>
        data={[]}
        columns={COLUMNS}
        getRowKey={(r) => r.id}
        emptyState={<span>No data</span>}
      />,
    )
    expect(screen.getByText('No data')).toBeInTheDocument()
  })

  it('renders loading skeleton when isLoading', () => {
    render(
      <ResponsiveTable<Row>
        data={[]}
        columns={COLUMNS}
        getRowKey={(r) => r.id}
        isLoading
      />,
    )
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })
})
