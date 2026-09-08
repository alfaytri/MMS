import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/hooks/useUnits', () => ({
  useUnits: () => ({ data: [{ id: 'u1', name: 'Piece', name_ar: null, sort_order: 1 }], isLoading: false }),
  useCreateUnit: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

import { UnitCombobox } from '../UnitCombobox'

describe('UnitCombobox', () => {
  it('shows the selected unit name on the trigger', () => {
    render(<UnitCombobox value="Piece" onChange={() => {}} />)
    expect(screen.getByText('Piece')).toBeInTheDocument()
  })
  it('shows the placeholder when nothing is selected', () => {
    render(<UnitCombobox value={null} onChange={() => {}} />)
    expect(screen.getByText('Select unit…')).toBeInTheDocument()
  })
})
