import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CalendarToolbar } from './CalendarToolbar'
import type { CalendarSchedule } from '@/hooks/useCalendarSchedule'
import type { Division } from '@/hooks/useDivisions'

const SCHEDULE: CalendarSchedule = {
  mode: 'normal',
  day_start: 8,
  day_end: 17,
  scroll_to: 8,
  label: '8 AM – 5 PM · Normal',
}

// Division fields match DBTable<'divisions'> Row type
const DIVISIONS: Division[] = [
  {
    id: 'div-1',
    slug: 'rsh',
    name: 'RSH',
    short_name: 'RSH',
    sort_order: 1,
    is_active: true,
    company_id: 'co-1',
    color: '#000000',
    default_currency: 'QAR',
    default_tax_rate: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    address: null,
    address_ar: null,
    address_en: null,
    company_name_ar: null,
    company_name_en: null,
    created_by: null,
    css_classes: null,
    footer_motto: null,
    logo_url: null,
    name_ar: null,
    stamp_url: null,
  },
  {
    id: 'div-2',
    slug: 'afm',
    name: 'AFM',
    short_name: 'AFM',
    sort_order: 2,
    is_active: true,
    company_id: 'co-1',
    color: '#000000',
    default_currency: 'QAR',
    default_tax_rate: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    address: null,
    address_ar: null,
    address_en: null,
    company_name_ar: null,
    company_name_en: null,
    created_by: null,
    css_classes: null,
    footer_motto: null,
    logo_url: null,
    name_ar: null,
    stamp_url: null,
  },
]

const baseProps = {
  date: '2026-05-07',
  onDateChange: vi.fn(),
  schedule: SCHEDULE,
  isSuperViewer: false,
  activeDivisionSlug: 'rsh',
  divisions: [DIVISIONS[0]],
  onDivisionChange: vi.fn(),
  activeVisitTypes: new Set<string>(),
  onVisitTypeToggle: vi.fn(),
  fitMode: false,
  onFitModeToggle: vi.fn(),
}

describe('CalendarToolbar', () => {
  it('renders formatted date label', () => {
    render(<CalendarToolbar {...baseProps} />)
    expect(screen.getByText(/Thu, May 7/i)).toBeInTheDocument()
  })

  it('shows schedule badge', () => {
    render(<CalendarToolbar {...baseProps} />)
    expect(screen.getByText('8 AM – 5 PM · Normal')).toBeInTheDocument()
  })

  it('calls onDateChange with next day when › is clicked', () => {
    render(<CalendarToolbar {...baseProps} />)
    fireEvent.click(screen.getByLabelText('next day'))
    expect(baseProps.onDateChange).toHaveBeenCalledWith('2026-05-08')
  })

  it('calls onDateChange with prev day when ‹ is clicked', () => {
    render(<CalendarToolbar {...baseProps} />)
    fireEvent.click(screen.getByLabelText('previous day'))
    expect(baseProps.onDateChange).toHaveBeenCalledWith('2026-05-06')
  })

  it('hides division selector for non-owner with single division', () => {
    render(<CalendarToolbar {...baseProps} isSuperViewer={false} divisions={[DIVISIONS[0]]} />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows division selector for owner', () => {
    render(<CalendarToolbar {...baseProps} isSuperViewer={true} divisions={DIVISIONS} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('renders all 8 visit type chips', () => {
    render(<CalendarToolbar {...baseProps} />)
    expect(screen.getByText('Normal Order')).toBeInTheDocument()
    expect(screen.getByText('Emergency')).toBeInTheDocument()
    expect(screen.getByText('QC Visit')).toBeInTheDocument()
  })

  it('calls onVisitTypeToggle when a chip is clicked', () => {
    render(<CalendarToolbar {...baseProps} />)
    fireEvent.click(screen.getByText('Emergency'))
    expect(baseProps.onVisitTypeToggle).toHaveBeenCalledWith('emergency')
  })
})
