'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { humanizeDbError } from '@/lib/dbErrors'
import {
  useQcPointRules, useSaveQcPointRules, useQcConfig, useSaveQcConfig,
  QC_TIMING_LABELS, type QcPointRule, type QcConfig, type QcTiming,
} from '@/hooks/useQcRules'

export default function QcRulesPage() {
  const { data: rulesData, isLoading: rulesLoading } = useQcPointRules()
  const { data: configData, isLoading: configLoading } = useQcConfig()
  const saveRules = useSaveQcPointRules()
  const saveConfig = useSaveQcConfig()

  const [rules, setRules] = useState<QcPointRule[]>([])
  const [config, setConfig] = useState<QcConfig | null>(null)

  useEffect(() => { if (rulesData) setRules(rulesData) }, [rulesData])
  useEffect(() => { if (configData) setConfig(configData) }, [configData])

  const dirty = useMemo(() => {
    if (!rulesData || !configData || !config) return false
    const a = JSON.stringify(rules.map((r) => [r.id, r.points, r.timing, r.active]))
    const b = JSON.stringify(rulesData.map((r) => [r.id, r.points, r.timing, r.active]))
    return a !== b || JSON.stringify(config) !== JSON.stringify(configData)
  }, [rules, config, rulesData, configData])

  const patchRule = (id: string, patch: Partial<QcPointRule>) =>
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  async function handleSave() {
    if (!config) return
    try {
      await saveRules.mutateAsync(rules.map((r) => ({ id: r.id, points: r.points, timing: r.timing, active: r.active })))
      await saveConfig.mutateAsync(config)
      toast.success('QC rules saved')
    } catch (e) {
      toast.error(humanizeDbError(e as Error))
    }
  }

  const saving = saveRules.isPending || saveConfig.isPending
  const loading = rulesLoading || configLoading

  return (
    <PageWrapper>
      <div className="max-w-3xl space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">QC Rules</h2>
            <p className="text-sm text-muted-foreground">
              Each order sums the points of the scenarios it matches. When the total reaches the
              threshold, a QC is auto-booked — highest-scoring orders first, up to the daily limit,
              at the timing of the top-scoring scenario.
            </p>
          </div>
          <Button onClick={handleSave} disabled={!dirty || saving} className="shrink-0">
            <Save className="mr-1.5 h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {/* Scoring rules */}
            <div className="rounded-lg border bg-card">
              <div className="border-b px-4 py-2.5">
                <h3 className="text-sm font-semibold">Scoring rules</h3>
                <p className="text-xs text-muted-foreground">Points per scenario, and when the QC should happen relative to the team.</p>
              </div>
              <div className="divide-y">
                {rules.map((r) => (
                  <div key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className={`min-w-0 flex-1 text-sm font-medium ${!r.active ? 'text-muted-foreground line-through' : ''}`}>
                      {r.label}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground">Points</span>
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-16 text-sm"
                          value={r.points}
                          onChange={(e) => patchRule(r.id, { points: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                        />
                      </div>
                      <Select value={r.timing} onValueChange={(v) => patchRule(r.id, { timing: v as QcTiming })}>
                        <SelectTrigger className="h-8 w-[172px] text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(QC_TIMING_LABELS) as QcTiming[]).map((t) => (
                            <SelectItem key={t} value={t} className="text-sm">{QC_TIMING_LABELS[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Switch checked={r.active} onCheckedChange={(v) => patchRule(r.id, { active: v })} aria-label="Active" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trigger & capacity */}
            {config && (
              <div className="rounded-lg border bg-card">
                <div className="border-b px-4 py-2.5">
                  <h3 className="text-sm font-semibold">Trigger &amp; capacity</h3>
                </div>
                <div className="grid gap-4 px-4 py-3 sm:grid-cols-3">
                  <label className="space-y-1">
                    <span className="text-xs font-medium">Threshold</span>
                    <Input
                      type="number" min={1} className="h-9" value={config.threshold}
                      onChange={(e) => setConfig({ ...config, threshold: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                    />
                    <span className="block text-[11px] text-muted-foreground">Score ≥ this books a QC.</span>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium">Max QCs per day</span>
                    <Input
                      type="number" min={1} className="h-9" value={config.max_qc_per_day}
                      onChange={(e) => setConfig({ ...config, max_qc_per_day: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                    />
                    <span className="block text-[11px] text-muted-foreground">Overflow rolls to the next day.</span>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium">Same site, same day</span>
                    <Select value={config.same_site_mode} onValueChange={(v) => setConfig({ ...config, same_site_mode: v as QcConfig['same_site_mode'] })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="combine">One QC covers all</SelectItem>
                        <SelectItem value="separate">One QC per order</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="block text-[11px] text-muted-foreground">Multiple orders, same customer + site.</span>
                  </label>
                </div>
                <div className="flex items-center justify-between gap-4 border-t px-4 py-3">
                  <div className="space-y-0.5">
                    <span className="text-xs font-medium">Auto-create backwork on rework</span>
                    <span className="block text-xs text-muted-foreground">
                      ON: flagging a post-completion QC for rework creates the redo order automatically.
                      OFF: the call centre books the redo.
                    </span>
                  </div>
                  <Switch
                    checked={config.auto_backwork_on_rework}
                    onCheckedChange={(v) => setConfig({ ...config, auto_backwork_on_rework: v })}
                    aria-label="Auto-create backwork on rework"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PageWrapper>
  )
}
