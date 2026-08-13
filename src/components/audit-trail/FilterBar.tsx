'use client'

import { useEffect, useMemo, useState } from 'react'
import { SearchInput } from '@/components/shared/SearchInput'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { MODULE_GROUPS, humanizeModule } from '@/lib/utils/auditPermissionMap'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface FilterBarProps {
  search: string
  onSearchChange: (value: string) => void
  dateFrom: string
  dateTo: string
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
  module: string
  onModuleChange: (value: string) => void
  allowedModules: string[]
}

export function FilterBar({
  search, onSearchChange,
  dateFrom, dateTo, onDateFromChange, onDateToChange,
  module, onModuleChange,
  allowedModules,
}: FilterBarProps) {
  const groupOfModule = useMemo(() => {
    for (const [group, mods] of Object.entries(MODULE_GROUPS)) {
      if ((mods as readonly string[]).includes(module)) return group
    }
    return ''
  }, [module])

  const [pendingGroup, setPendingGroup] = useState<string>(groupOfModule)
  useEffect(() => {
    if (groupOfModule) setPendingGroup(groupOfModule)
  }, [groupOfModule])

  const activeGroup = module ? groupOfModule : pendingGroup

  const activeGroupModules = useMemo(() => {
    if (!activeGroup) return []
    const mods = MODULE_GROUPS[activeGroup as keyof typeof MODULE_GROUPS] as readonly string[] | undefined
    if (!mods) return []
    return mods.filter((m) => allowedModules.includes(m))
  }, [activeGroup, allowedModules])

  const handleGroupChange = (value: string | null) => {
    const v = value ?? ''
    if (v === '' || v === 'all') {
      setPendingGroup('')
      onModuleChange('')
      return
    }
    setPendingGroup(v)
    onModuleChange('')
  }

  const handleModuleChange = (value: string | null) => {
    const v = value ?? ''
    onModuleChange(v === 'all' ? '' : v)
  }

  const hasFilters = search || dateFrom || dateTo || module

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder="Search audit trail…"
      />

      <div className="flex gap-2 items-center">
        <DatePicker
          value={dateFrom}
          onChange={onDateFromChange}
          placeholder="From date"
          className="min-h-11 md:min-h-0"
        />
        <span className="text-muted-foreground text-sm">to</span>
        <DatePicker
          value={dateTo}
          onChange={onDateToChange}
          placeholder="To date"
          className="min-h-11 md:min-h-0"
        />
      </div>

      <div className="flex gap-2 items-center">
        <Select value={activeGroup || 'all'} onValueChange={handleGroupChange}>
          <SelectTrigger className="w-full sm:w-40 h-9 min-h-11 md:min-h-0">
            <SelectValue placeholder="All Groups" />
          </SelectTrigger>
          <SelectContent className="max-h-72 overflow-y-auto overflow-x-hidden">
            <SelectItem value="all">All Groups</SelectItem>
            {Object.keys(MODULE_GROUPS).map((g) => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={module || 'all'}
          onValueChange={handleModuleChange}
          disabled={!activeGroup}
        >
          <SelectTrigger className="w-full sm:w-48 h-9 min-h-11 md:min-h-0">
            <SelectValue placeholder={activeGroup ? 'All Modules' : 'Pick a group…'} />
          </SelectTrigger>
          <SelectContent className="max-h-72 overflow-y-auto overflow-x-hidden">
            <SelectItem value="all">All Modules</SelectItem>
            {activeGroupModules.map((m) => (
              <SelectItem key={m} value={m}>{humanizeModule(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 min-h-11 md:min-h-0 px-2 text-muted-foreground"
          onClick={() => {
            onSearchChange('')
            onDateFromChange('')
            onDateToChange('')
            onModuleChange('')
            setPendingGroup('')
          }}
        >
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  )
}
