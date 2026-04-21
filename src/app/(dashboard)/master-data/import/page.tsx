'use client'

import { useState, useRef, useCallback } from 'react'
import Papa from 'papaparse'
import { Upload, Download, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  ENTITY_CONFIGS, downloadCSVTemplate, type EntityType,
} from '@/lib/csv/config'
import { validateRows, countValid, countErrors, exportErrorRows, type ParsedRow } from '@/lib/csv/validate'
import {
  useImportSuppliers, useImportInventoryItems, useImportCustomers,
  useImportPurchaseOrders, useImportSaleOrders, type ImportResult,
} from '@/hooks/useCSVImport'

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTITY_TYPES: EntityType[] = ['suppliers', 'inventory_items', 'customers', 'purchase_orders', 'sale_orders']

// ─── Sub-components ────────────────────────────────────────────────────────────

function EntityTab({ type, active, onClick }: { type: EntityType; active: boolean; onClick: () => void }) {
  const cfg = ENTITY_CONFIGS[type]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
        active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
      )}
    >
      {cfg.label}
    </button>
  )
}

function DropZone({
  onFile,
  isDragging,
  setIsDragging,
  fileName,
}: {
  onFile: (file: File) => void
  isDragging: boolean
  setIsDragging: (v: boolean) => void
  fileName: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file && file.name.endsWith('.csv')) {
        onFile(file)
      } else {
        toast.error('Please upload a .csv file')
      }
    },
    [onFile, setIsDragging]
  )

  return (
    <div
      className={cn(
        'rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer',
        isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
      <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
      {fileName ? (
        <div>
          <p className="font-medium text-sm">{fileName}</p>
          <p className="text-xs text-muted-foreground mt-1">Click or drag to replace</p>
        </div>
      ) : (
        <div>
          <p className="font-medium text-sm">Drop your CSV file here</p>
          <p className="text-xs text-muted-foreground mt-1">or click to browse — .csv files only</p>
        </div>
      )}
    </div>
  )
}

function ValidationSummary({ rows, entityType }: { rows: ParsedRow[]; entityType: EntityType }) {
  const valid = countValid(rows)
  const invalid = countErrors(rows)

  return (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5 text-green-600">
        <CheckCircle className="h-4 w-4" />
        <span className="font-medium">{valid} valid rows</span>
      </div>
      {invalid > 0 && (
        <div className="flex items-center gap-1.5 text-destructive">
          <XCircle className="h-4 w-4" />
          <span className="font-medium">{invalid} rows with errors</span>
        </div>
      )}
      {invalid > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => exportErrorRows(rows, entityType)}
        >
          Download Error Rows
        </Button>
      )}
    </div>
  )
}

function PreviewTable({ rows, entityType }: { rows: ParsedRow[]; entityType: EntityType }) {
  const [showOnlyErrors, setShowOnlyErrors] = useState(false)
  const config = ENTITY_CONFIGS[entityType]
  const displayed = showOnlyErrors ? rows.filter((r) => !r._valid) : rows

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-medium">Preview ({rows.length} rows)</p>
        {countErrors(rows) > 0 && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyErrors}
              onChange={(e) => setShowOnlyErrors(e.target.checked)}
              className="h-4 w-4"
            />
            Show errors only
          </label>
        )}
      </div>

      <div className="rounded-md border overflow-x-auto max-h-80 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted border-b">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Row</th>
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Status</th>
              {config.columns.map((col) => (
                <th key={col.key} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                  {col.label}{col.required ? ' *' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((row) => (
              <tr
                key={row._rowIndex as number}
                className={cn(
                  'border-b last:border-0',
                  row._valid ? 'hover:bg-muted/30' : 'bg-destructive/5'
                )}
              >
                <td className="px-2 py-1.5 text-muted-foreground">{row._rowIndex as number}</td>
                <td className="px-2 py-1.5">
                  {row._valid ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                  )}
                </td>
                {config.columns.map((col) => {
                  const val = String(row[col.key] ?? '')
                  const err = (row._errors as Record<string, string>)[col.key]
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        'px-2 py-1.5 max-w-[200px] truncate',
                        err ? 'text-destructive font-medium' : ''
                      )}
                      title={err ? `Error: ${err}` : val}
                    >
                      {val || <span className="text-muted-foreground/50">—</span>}
                      {err && <span className="block text-[10px] text-destructive">{err}</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {displayed.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">No rows to display</div>
        )}
      </div>
    </div>
  )
}

function ResultSummary({ result, onReset }: { result: ImportResult; onReset: () => void }) {
  return (
    <div className="rounded-lg border p-6 space-y-4">
      <h3 className="font-semibold text-lg">Import Complete</h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-md bg-green-50 border border-green-200 p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{result.succeeded}</p>
          <p className="text-xs text-green-600 mt-1">Rows imported</p>
        </div>
        <div className={cn('rounded-md border p-3 text-center', result.failed > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200')}>
          <p className={cn('text-2xl font-bold', result.failed > 0 ? 'text-red-700' : 'text-gray-500')}>{result.failed}</p>
          <p className={cn('text-xs mt-1', result.failed > 0 ? 'text-red-600' : 'text-gray-500')}>Failed rows</p>
        </div>
      </div>

      {result.errors.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-destructive">Errors:</p>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {result.errors.slice(0, 20).map((err, i) => (
              <p key={i} className="text-xs text-destructive">Row {err.row}: {err.message}</p>
            ))}
            {result.errors.length > 20 && (
              <p className="text-xs text-muted-foreground">…and {result.errors.length - 20} more errors</p>
            )}
          </div>
        </div>
      )}

      <Button onClick={onReset}>Import Another File</Button>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function CSVImportPage() {
  const [entityType, setEntityType] = useState<EntityType>('suppliers')
  const [rows, setRows] = useState<ParsedRow[] | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const importSuppliers = useImportSuppliers()
  const importInventory = useImportInventoryItems()
  const importCustomers = useImportCustomers()
  const importPOs = useImportPurchaseOrders()
  const importSOs = useImportSaleOrders()

  const currentConfig = ENTITY_CONFIGS[entityType]

  const isImporting =
    importSuppliers.isPending || importInventory.isPending ||
    importCustomers.isPending || importPOs.isPending || importSOs.isPending

  function handleEntityChange(type: EntityType) {
    setEntityType(type)
    setRows(null)
    setFileName(null)
    setImportResult(null)
  }

  function handleFile(file: File) {
    setFileName(file.name)
    setIsParsing(true)
    setRows(null)
    setImportResult(null)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rawRows = result.data as Record<string, string>[]
        if (rawRows.length === 0) {
          toast.error('CSV file is empty')
          setIsParsing(false)
          return
        }
        const parsed = validateRows(entityType, rawRows)
        setRows(parsed)
        setIsParsing(false)
        const valid = countValid(parsed)
        const invalid = countErrors(parsed)
        if (invalid > 0) {
          toast.warning(`Parsed ${rawRows.length} rows — ${valid} valid, ${invalid} with errors`)
        } else {
          toast.success(`Parsed ${rawRows.length} rows — all valid`)
        }
      },
      error: (err) => {
        toast.error(`Parse error: ${err.message}`)
        setIsParsing(false)
      },
    })
  }

  async function handleImport() {
    if (!rows) return
    const validCount = countValid(rows)
    if (validCount === 0) { toast.error('No valid rows to import'); return }

    const onSuccess = (result: ImportResult) => {
      setImportResult(result)
      if (result.succeeded > 0) {
        toast.success(`Imported ${result.succeeded} rows successfully`)
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} rows failed — see details below`)
      }
    }
    const onError = (err: Error) => toast.error(err.message)

    switch (entityType) {
      case 'suppliers':
        importSuppliers.mutate(rows, { onSuccess, onError }); break
      case 'inventory_items':
        importInventory.mutate(rows, { onSuccess, onError }); break
      case 'customers':
        importCustomers.mutate(rows, { onSuccess, onError }); break
      case 'purchase_orders':
        importPOs.mutate(rows, { onSuccess, onError }); break
      case 'sale_orders':
        importSOs.mutate(rows, { onSuccess, onError }); break
    }
  }

  function handleReset() {
    setRows(null)
    setFileName(null)
    setImportResult(null)
  }

  const validCount = rows ? countValid(rows) : 0
  const errorCount = rows ? countErrors(rows) : 0

  return (
    <PageWrapper>
      <div className="max-w-5xl mx-auto pb-12">
        <PageHeader
          title="CSV Import"
          description="Bulk import data from spreadsheets — download a template, fill it in, then upload"
        />

        {/* Entity Tabs */}
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex border-b min-w-max">
            {ENTITY_TYPES.map((type) => (
              <EntityTab
                key={type}
                type={type}
                active={entityType === type}
                onClick={() => handleEntityChange(type)}
              />
            ))}
          </div>
        </div>

        {/* Entity info + template download */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{currentConfig.label}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{currentConfig.description}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCSVTemplate(entityType)}
              className="shrink-0"
            >
              <Download className="h-4 w-4 mr-1.5" />
              Download Template
            </Button>
          </div>

          {/* Column definitions */}
          <div className="flex flex-wrap gap-2">
            {currentConfig.columns.map((col) => (
              <span
                key={col.key}
                className={cn(
                  'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium',
                  col.required ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                )}
                title={col.hint}
              >
                {col.label}
                {col.required && <span className="ml-0.5 text-primary">*</span>}
              </span>
            ))}
          </div>

          {/* Notes */}
          {currentConfig.notes && (
            <div className="space-y-1">
              {currentConfig.notes.map((note, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {note}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* If import result is shown */}
        {importResult ? (
          <ResultSummary result={importResult} onReset={handleReset} />
        ) : (
          <>
            {/* Upload zone */}
            <DropZone
              onFile={handleFile}
              isDragging={isDragging}
              setIsDragging={setIsDragging}
              fileName={fileName}
            />

            {/* Parsing skeleton */}
            {isParsing && (
              <div className="space-y-2">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-40 w-full" />
              </div>
            )}

            {/* Preview */}
            {rows && !isParsing && (
              <div className="space-y-4">
                <ValidationSummary rows={rows} entityType={entityType} />
                <PreviewTable rows={rows} entityType={entityType} />

                <Separator />

                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {validCount > 0
                      ? `Ready to import ${validCount} valid row${validCount !== 1 ? 's' : ''}${errorCount > 0 ? ` (${errorCount} will be skipped)` : ''}`
                      : 'No valid rows — fix errors and re-upload'}
                  </div>
                  <Button
                    onClick={handleImport}
                    disabled={validCount === 0 || isImporting}
                    className="min-w-32"
                  >
                    {isImporting
                      ? 'Importing…'
                      : `Import ${validCount} Row${validCount !== 1 ? 's' : ''}`}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PageWrapper>
  )
}
