'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useDivisions } from '@/hooks/useDivisions'

interface PdfDivisionPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (divisionId: string) => void
  defaultDivisionId?: string | null
  title?: string
  loading?: boolean
}

export function PdfDivisionPicker({
  open,
  onOpenChange,
  onConfirm,
  defaultDivisionId,
  title = 'Select Division for PDF',
  loading = false,
}: PdfDivisionPickerProps) {
  const { data: divisions } = useDivisions()
  const [selected, setSelected] = useState<string>(defaultDivisionId ?? '')

  const activeDivisions = divisions ?? []

  // Auto-select if only one division exists
  const autoSelected = activeDivisions.length === 1 ? activeDivisions[0].id : selected

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="py-2">
          {activeDivisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No divisions found.</p>
          ) : activeDivisions.length === 1 ? (
            <p className="text-sm">
              Division: <span className="font-medium">{activeDivisions[0].name}</span>
            </p>
          ) : (
            <Select value={autoSelected} onValueChange={(v) => setSelected(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select division…">
                  {autoSelected
                    ? (activeDivisions.find(d => d.id === autoSelected)?.name ?? 'Select division…')
                    : 'Select division…'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {activeDivisions.map(d => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(autoSelected)}
            disabled={!autoSelected || loading}
          >
            {loading ? 'Generating…' : 'Generate PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
