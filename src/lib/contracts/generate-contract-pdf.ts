/**
 * Renders a contract / quotation document PDF (customer + priced services +
 * schedule + totals), uploads it to the public `contract-pdfs` Storage bucket,
 * and returns the public URL. Generated on-demand (no cache column) so it always
 * reflects the contract's current state.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadPdfFonts } from '@/lib/pdf/pdf-fonts'
import { resolveBrand, brandDataToAssets } from '@/lib/pdf/brand-resolver'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'
import { paymentPeriodCount } from '@/lib/contractUtils'
import {
  buildContractPdfHtml, type ContractPdfServiceInput, type ContractPdfMilestoneInput,
} from '@/lib/contracts/contract-pdf-html'

const BUCKET = 'contract-pdfs'

const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return `${dt.getUTCDate()} ${MONTHS_EN[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`
}

const FREQ_LABEL: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', bi_weekly: 'Bi-weekly', monthly: 'Monthly',
  quarterly: 'Quarterly', semi_annual: 'Semi-annual', annual: 'Annual',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', manager_review: 'Manager Review', customer_pending: 'Awaiting Signature',
  approved: 'Approved', rejected: 'Rejected', active: 'Active', expiring_soon: 'Expiring Soon',
  overdue_payment: 'Overdue', completed: 'Completed', cancelled: 'Cancelled', expired: 'Expired',
}
const QUOTATION_STATUSES = new Set(['draft', 'manager_review', 'customer_pending', 'approved', 'rejected'])

export interface GenerateContractPdfResult { url: string; storageKey: string; contractId: string; bytes: number }

interface ContractRow {
  id: string; contract_id: string | null; quotation_number: string | null; status: string
  customer_name: string | null; phone: string | null; site_name: string | null; agent_name: string | null
  start_date: string; end_date: string; discount: number | null; total_value: number | null
  monthly_value: number | null; payment_mode: string | null; payment_frequency: string | null
  notes: string | null
  contract_services: Array<{
    service_name: string; service_path: string[] | null; is_general: boolean | null
    frequency: string | null; quantity: number | null; total_price: number | null; unit_price: number | null
    item_kind: string | null
  }> | null
  contract_milestones: Array<{ name: string; percentage: number | null; amount: number | null; due_date: string | null; sort_order: number | null }> | null
}

export async function generateContractPdf(
  contractUuid: string,
  supabase: SupabaseClient,
  opts?: { divisionId?: string },
): Promise<GenerateContractPdfResult> {
  const { data: c, error } = await supabase
    .from('contracts')
    .select(`
      id, contract_id, quotation_number, status, customer_name, phone, site_name, agent_name,
      start_date, end_date, discount, total_value, monthly_value, payment_mode, payment_frequency, notes,
      contract_services(service_name, service_path, is_general, frequency, quantity, total_price, unit_price, item_kind),
      contract_milestones(name, percentage, amount, due_date, sort_order)
    `)
    .eq('id', contractUuid)
    .single<ContractRow>()

  if (error || !c) throw new Error(`Contract not found: ${contractUuid} (${error?.message ?? 'no row'})`)

  const start = c.start_date
  const end = c.end_date
  const payFreq = c.payment_frequency || 'monthly'

  const services: ContractPdfServiceInput[] = (c.contract_services ?? []).map((s) => {
    const freq = s.frequency || 'monthly'
    const visits = start && end ? paymentPeriodCount(start, end, freq) : 1
    const total = Number(s.total_price ?? 0)
    return {
      name: s.service_name,
      location: s.is_general ? 'General' : (s.service_path?.slice(-2, -1)?.[0] ?? ''),
      frequency: FREQ_LABEL[freq] ?? freq,
      qty: Number(s.quantity ?? 1),
      unitPrice: Number(s.unit_price ?? total),
      visits,
      lineTotal: total * visits,
    }
  })

  const subtotal = services.reduce((sum, s) => sum + s.lineTotal, 0)
  const discount = Number(c.discount ?? 0)
  const netTotal = Number(c.total_value ?? Math.max(0, subtotal - discount))
  const periods = start && end ? paymentPeriodCount(start, end, payFreq) : 1
  const periodValue = c.payment_mode === 'milestone' ? netTotal : Math.round(netTotal / Math.max(1, periods))
  const months = start && end ? paymentPeriodCount(start, end, 'monthly') : 0

  const milestones: ContractPdfMilestoneInput[] = (c.contract_milestones ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((m) => ({ name: m.name, percentage: Number(m.percentage ?? 0), amount: Number(m.amount ?? 0), dueDate: fmtDate(m.due_date) }))

  const isQuote = QUOTATION_STATUSES.has(c.status)
  const docNumber = (isQuote ? c.quotation_number : c.contract_id) || c.contract_id || c.quotation_number || '—'

  const [brand, fonts] = await Promise.all([resolveBrand(opts?.divisionId ?? null, supabase), loadPdfFonts()])
  const { assets } = brandDataToAssets(brand)

  const html = buildContractPdfHtml({
    docKind: isQuote ? 'quotation' : 'contract',
    docNumber,
    issuingDate: fmtDate(new Date().toISOString()),
    statusLabel: STATUS_LABEL[c.status] ?? c.status,
    customerName: c.customer_name ?? '',
    customerPhone: c.phone ?? '',
    siteName: c.site_name ?? '',
    agentName: c.agent_name ?? '',
    startDate: fmtDate(start),
    endDate: fmtDate(end),
    durationLabel: months > 0 ? `${months} month${months === 1 ? '' : 's'}` : '—',
    paymentLabel: c.payment_mode === 'milestone' ? 'On milestones' : c.payment_mode === 'completion' ? 'On completion' : (FREQ_LABEL[payFreq] ?? payFreq),
    services,
    subtotal,
    discount,
    netTotal,
    periodValue,
    periodLabel: c.payment_mode === 'milestone' ? 'Contract Value' : `${FREQ_LABEL[payFreq] ?? payFreq} Value`,
    milestones: c.payment_mode === 'milestone' ? milestones : [],
    termsText: null,
    notes: c.notes ?? null,
    currency: 'QAR',
    assets,
    fonts,
  })

  const buffer = await htmlToPdfBuffer(html)
  const storageKey = `${docNumber.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storageKey, buffer, { contentType: 'application/pdf', upsert: true, cacheControl: '60' })
  if (uploadErr) throw new Error(`Storage upload failed for ${storageKey}: ${uploadErr.message}`)

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storageKey)
  return { url: urlData.publicUrl, storageKey, contractId: c.id, bytes: buffer.length }
}
