'use client'

// ─── InventoryImportDialog — 2-step Excel import flow ──────────────────────
//
// Step 1: user downloads a template, fills it in, then drops/selects the
//         completed .xlsx file. On selection we parse it (client-side) and
//         look up existing inventory data in parallel, then validate +
//         diff the rows so Step 2 can show an accurate preview.
// Step 2: preview table (errors first) + summary badges, "Import N rows"
//         hands the valid rows to useInventoryImport() which creates the
//         missing categories/items/brand-variants in Supabase.

import { useState, useCallback, useRef } from 'react'
import { Upload, Download, CheckCircle2, XCircle, FileSpreadsheet, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { GuardedDialog, type GuardedFormDialogHandle } from '@/components/shared/GuardedFormDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  downloadTemplate,
  parseExcelFile,
  validateRows,
  buildPreview,
  buildParseContext,
  type ValidatedRow,
  type ImportPreview,
  type SubContainerOption,
} from '@/lib/inventory-import'
import { useInventoryImport, useExistingInventoryLookup } from '@/hooks/useInventoryImport'
import { useAllActiveSubContainers } from '@/hooks/useWarehouseSubContainers'

type Step = 'upload' | 'preview'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatPrice(value: number): string {
  return Number.isNaN(value) ? '—' : value.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function sortRowsErrorsFirst(rows: ValidatedRow[]): ValidatedRow[] {
  return [...rows].sort((a, b) => {
    if (a.valid === b.valid) return a.rowIndex - b.rowIndex
    return a.valid ? 1 : -1
  })
}

export function InventoryImportDialog({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const lookupMutation = useExistingInventoryLookup()
  const importMutation = useInventoryImport()
  const { data: activeSubContainers = [] } = useAllActiveSubContainers()
  const [isDownloading, setIsDownloading] = useState(false)

  const subContainerOptions: SubContainerOption[] = activeSubContainers.map((sc) => ({
    warehouse_id:       sc.warehouse_id,
    warehouse_name:     sc.warehouse_name,
    sub_container_id:   sc.sub_container_id,
    sub_container_name: sc.sub_container_name,
    division_id:        sc.division_id,
    division_name:      sc.division_name,
  }))

  const handleDownloadTemplate = useCallback(async () => {
    if (isDownloading) return
    setIsDownloading(true)
    try {
      // Kick off the same lookup the upload path uses so the template's
      // Category dropdowns list every existing category.
      const lookup = await lookupMutation.mutateAsync()
      await downloadTemplate({
        subContainers:      subContainerOptions,
        existingCategories: lookup.existingCategoryOptions,
        countryNames:       lookup.countryNames,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to build the template.')
    } finally {
      setIsDownloading(false)
    }
  }, [isDownloading, lookupMutation, subContainerOptions])

  const resetState = useCallback(() => {
    setStep('upload')
    setFile(null)
    setIsParsing(false)
    setIsDragging(false)
    setPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && importMutation.isPending) return // don't allow closing mid-import
      if (!next) resetState()
      onOpenChange(next)
    },
    [importMutation.isPending, onOpenChange, resetState]
  )

  const handleFileSelected = useCallback(
    async (selected: File) => {
      if (!selected.name.toLowerCase().endsWith('.xlsx')) {
        toast.error('Please upload a .xlsx file')
        return
      }

      setFile(selected)
      setIsParsing(true)
      setPreview(null)

      try {
        // Fetch the lookup first so the parse context has the country map —
        // origin resolution (Origin column → country_id) happens at parse time.
        const lookup = await lookupMutation.mutateAsync()
        const ctx = buildParseContext(subContainerOptions, lookup.countryByName)
        const rows = await parseExcelFile(selected, ctx)

        if (rows.length === 0) {
          toast.error('No data rows found in the file.')
          setFile(null)
          return
        }

        const validated = validateRows(rows)
        const nextPreview = buildPreview(validated, lookup.categoryPaths, lookup.itemKeys, lookup.variantKeys)
        setPreview(nextPreview)
        setStep('preview')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to read the file.')
        setFile(null)
      } finally {
        setIsParsing(false)
      }
    },
    [lookupMutation, subContainerOptions]
  )

  const handleRemoveFile = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setFile(null)
    setPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleBack = useCallback(() => {
    setStep('upload')
    setFile(null)
    setPreview(null)
    setIsParsing(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!isParsing) setIsDragging(true)
    },
    [isParsing]
  )

  const handleDragLeave = useCallback(() => setIsDragging(false), [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const dropped = e.dataTransfer.files?.[0]
      if (dropped) void handleFileSelected(dropped)
    },
    [handleFileSelected]
  )

  const handleImportClick = useCallback(async () => {
    if (!preview) return
    const validRows = preview.rows.filter((r) => r.valid)
    if (validRows.length === 0) return

    try {
      const result = await importMutation.mutateAsync(validRows)

      const created: string[] = []
      if (result.categoriesCreated > 0) created.push(`${result.categoriesCreated} categor${result.categoriesCreated === 1 ? 'y' : 'ies'}`)
      if (result.itemsCreated > 0) created.push(`${result.itemsCreated} item${result.itemsCreated === 1 ? '' : 's'}`)
      if (result.variantsCreated > 0) created.push(`${result.variantsCreated} variant${result.variantsCreated === 1 ? '' : 's'}`)
      if (result.unitsSeeded > 0) created.push(`${result.unitsSeeded.toLocaleString('en-QA')} unit${result.unitsSeeded === 1 ? '' : 's'} of stock`)
      toast.success(created.length > 0 ? `Import complete — created ${created.join(', ')}` : 'Import complete')

      if (result.skipped > 0) {
        toast.info(`${result.skipped} duplicate row${result.skipped === 1 ? '' : 's'} skipped`)
      }
      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} row${result.errors.length === 1 ? '' : 's'} failed during import`)
      }

      resetState()
      guardRef.current?.closeAfterSubmit()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    }
  }, [preview, importMutation, resetState])

  const sortedRows = preview ? sortRowsErrorsFirst(preview.rows) : []
  const isBusy = isParsing || lookupMutation.isPending

  return (
    <GuardedDialog open={open} onOpenChange={handleOpenChange} isDirty={!!file || !!preview} ref={guardRef}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-2xl sm:rounded-xl max-h-[100vh] sm:max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
            Import Inventory
          </DialogTitle>
          <DialogDescription>Download the template, fill in your data, then upload it.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-1">
          {step === 'upload' && (
            <>
              {/* Download template */}
              <div className="rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Need the template?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Download it, fill in your inventory data, then upload the completed file below.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 sm:min-h-8 shrink-0"
                  onClick={() => void handleDownloadTemplate()}
                  disabled={isDownloading}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      Building…
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-1.5" />
                      Download Template
                    </>
                  )}
                </Button>
              </div>

              {/* Upload zone */}
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  'rounded-lg border-2 border-dashed p-6 sm:p-8 text-center transition-colors cursor-pointer',
                  isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50',
                  isBusy && 'pointer-events-none opacity-70'
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => {
                    const selected = e.target.files?.[0]
                    if (selected) void handleFileSelected(selected)
                    e.target.value = ''
                  }}
                />

                {isBusy ? (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm font-medium">Reading your file...</p>
                  </div>
                ) : file ? (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <FileSpreadsheet className="h-8 w-8 text-primary" />
                    <div>
                      <p className="text-sm font-medium break-all">{file.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatFileSize(file.size)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 sm:min-h-8 mt-1"
                      onClick={handleRemoveFile}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Drag &amp; drop your .xlsx file here, or click to browse</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Only .xlsx files are supported</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {step === 'preview' && preview && (
            <>
              {/* Summary badges */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{preview.newCategories} new categor{preview.newCategories === 1 ? 'y' : 'ies'}</Badge>
                <Badge variant="secondary">{preview.newItems} new item{preview.newItems === 1 ? '' : 's'}</Badge>
                <Badge variant="secondary">{preview.newVariants} new variant{preview.newVariants === 1 ? '' : 's'}</Badge>
                {preview.newUnits > 0 && (
                  <Badge variant="secondary">{preview.newUnits.toLocaleString('en-QA')} unit{preview.newUnits === 1 ? '' : 's'} of stock</Badge>
                )}
                {preview.totalErrors > 0 && (
                  <Badge variant="destructive">{preview.totalErrors} error{preview.totalErrors === 1 ? '' : 's'}</Badge>
                )}
              </div>

              {/* Preview table */}
              <ScrollArea className="max-h-[40vh] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-[10px] py-1.5">#</TableHead>
                      <TableHead className="text-[10px] py-1.5">Status</TableHead>
                      <TableHead className="text-[10px] py-1.5">Type</TableHead>
                      <TableHead className="text-[10px] py-1.5">Category Path</TableHead>
                      <TableHead className="text-[10px] py-1.5">Item</TableHead>
                      <TableHead className="text-[10px] py-1.5">Brand</TableHead>
                      <TableHead className="text-[10px] py-1.5 text-right">Cost</TableHead>
                      <TableHead className="text-[10px] py-1.5 text-right">Sell</TableHead>
                      <TableHead className="text-[10px] py-1.5">Origin</TableHead>
                      <TableHead className="text-[10px] py-1.5 text-right">Qty</TableHead>
                      <TableHead className="text-[10px] py-1.5">Sub-container</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRows.map((row) => (
                      <TableRow
                        key={row.rowIndex}
                        className={cn('text-xs', !row.valid && 'bg-destructive/5')}
                        title={!row.valid ? row.errors.join('\n') : undefined}
                      >
                        <TableCell className="text-xs tabular-nums py-1.5">{row.rowIndex}</TableCell>
                        <TableCell className="py-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {row.valid ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                            ) : (
                              <>
                                <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                                <span className="text-destructive truncate max-w-[140px]">{row.errors[0]}</span>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs py-1.5">{row.type || '—'}</TableCell>
                        <TableCell className="text-xs py-1.5 max-w-[180px] truncate" title={row.categorySegments.join(' › ')}>
                          {row.categorySegments.length > 0 ? row.categorySegments.join(' › ') : '—'}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 max-w-[160px] truncate" title={row.itemName}>
                          {row.itemName || '—'}
                        </TableCell>
                        <TableCell className="text-xs py-1.5">{row.brand || '—'}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right tabular-nums">{formatPrice(row.costPrice)}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right tabular-nums">{formatPrice(row.sellingPrice)}</TableCell>
                        <TableCell className="text-xs py-1.5">{row.origin || '—'}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right tabular-nums">{row.quantity > 0 ? row.quantity.toLocaleString('en-QA') : '—'}</TableCell>
                        <TableCell className="text-xs py-1.5 max-w-[220px] truncate" title={row.warehouseSubLabel}>
                          {row.subContainer ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="truncate">{row.subContainer.sub_container_name}</span>
                              {row.subContainer.division_name && (
                                <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">
                                  {row.subContainer.division_name}
                                </Badge>
                              )}
                            </span>
                          ) : (
                            <span className="text-destructive italic">{row.warehouseSubLabel || '—'}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {sortedRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-6">
                          No rows found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </>
          )}
        </div>

        <DialogFooter className="sticky bottom-0 bg-background pt-3 border-t">
          <div className="flex w-full items-center justify-between gap-2">
            <div>
              {step === 'preview' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 sm:min-h-8"
                  onClick={handleBack}
                  disabled={importMutation.isPending}
                >
                  Back
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 sm:min-h-8"
                onClick={() => guardRef.current?.requestClose()}
                disabled={importMutation.isPending}
              >
                Cancel
              </Button>
              {step === 'preview' && preview && preview.totalValid > 0 && (
                <Button
                  type="button"
                  size="sm"
                  className="min-h-11 sm:min-h-8"
                  onClick={handleImportClick}
                  disabled={importMutation.isPending}
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    `Import ${preview.totalValid} row${preview.totalValid === 1 ? '' : 's'}`
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </GuardedDialog>
  )
}
