'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrencies, useToggleCurrency, useAddCurrency } from '@/hooks/useCurrencies'

export function CurrenciesAdmin() {
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newSymbol, setNewSymbol] = useState('')

  const { data: currencies = [], isLoading, isError } = useCurrencies(false)
  const toggleMutation = useToggleCurrency()
  const addMutation = useAddCurrency()

  function handleAdd() {
    const code = newCode.trim().toUpperCase()
    const name = newName.trim()
    const symbol = newSymbol.trim()

    if (!code || !name || !symbol) {
      toast.error('All fields are required')
      return
    }
    if (currencies.some((c) => c.code === code)) {
      toast.error(`Currency "${code}" already exists`)
      return
    }

    addMutation.mutate(
      { code, name, symbol },
      {
        onSuccess: () => {
          setNewCode('')
          setNewName('')
          setNewSymbol('')
          toast.success('Currency added')
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : 'Failed to add currency'),
      },
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError) {
    return (
      <p className="py-12 text-sm text-center text-destructive">
        Failed to load currencies. Please refresh.
      </p>
    )
  }

  return (
    <div className="space-y-6 max-w-lg">
      {/* List */}
      <div className="rounded-lg border divide-y">
        {currencies.map((c) => (
          <div
            key={c.id}
            className={cn(
              'flex items-center justify-between px-4 py-3',
              !c.is_active && 'opacity-40',
            )}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">{c.name}</span>
              <Badge variant="outline" className="text-[10px] font-mono">
                {c.code}
              </Badge>
              <span className="text-xs text-muted-foreground">{c.symbol}</span>
            </div>
            <Switch
              checked={c.is_active}
              aria-label={`Toggle ${c.name}`}
              onCheckedChange={(checked) =>
                toggleMutation.mutate(
                  { id: c.id, is_active: checked },
                  { onError: () => toast.error('Failed to update currency') },
                )
              }
            />
          </div>
        ))}
        {currencies.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">
            No currencies yet.
          </p>
        )}
      </div>

      {/* Add form */}
      <div className="rounded-lg border p-4 space-y-3">
        <p className="text-sm font-semibold">Add Currency</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cur-code">Code</Label>
            <Input
              id="cur-code"
              placeholder="e.g. TRY"
              value={newCode}
              maxLength={4}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cur-name">Name</Label>
            <Input
              id="cur-name"
              placeholder="e.g. Turkish Lira"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cur-symbol">Symbol</Label>
            <Input
              id="cur-symbol"
              placeholder="e.g. ₺"
              value={newSymbol}
              maxLength={5}
              onChange={(e) => setNewSymbol(e.target.value)}
            />
          </div>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={handleAdd}
          disabled={!newCode.trim() || !newName.trim() || !newSymbol.trim() || addMutation.isPending}
        >
          {addMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Add Currency
        </Button>
      </div>
    </div>
  )
}
