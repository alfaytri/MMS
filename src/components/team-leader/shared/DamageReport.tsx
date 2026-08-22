// src/components/team-leader/shared/DamageReport.tsx
'use client'

import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PhotoCapture } from './PhotoCapture'

interface DamageReportValue {
  noted: boolean
  description?: string
  photos?: Blob[]
}

interface Props {
  visitId: string
  value: DamageReportValue
  onChange: (val: DamageReportValue) => void
}

export function DamageReport({ visitId, value, onChange }: Props) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="damage-toggle" className="text-sm font-medium">
          Damage / Issue Noted
        </Label>
        <Switch
          id="damage-toggle"
          checked={value.noted}
          onCheckedChange={(noted) => onChange({ ...value, noted })}
        />
      </div>

      {value.noted && (
        <>
          <Textarea
            placeholder="Describe the damage or issue..."
            value={value.description ?? ''}
            onChange={(e) => onChange({ ...value, description: e.target.value })}
            rows={3}
          />
          <PhotoCapture
            visitId={`${visitId}-damage`}
            label="Damage Photos"
            photos={value.photos ?? []}
            onChange={(photos) => onChange({ ...value, photos })}
          />
        </>
      )}
    </div>
  )
}
