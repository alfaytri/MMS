/**
 * Shared "notes we entered on the order" block, rendered on every order-derived PDF.
 *
 * Sales documents (invoice, delivery note, credit note) pass the Sales Order's
 * customer-facing notes; purchase documents (bill, receival check/receipt, debit
 * note) pass the Purchase Order's vendor notes. Internal / staff-only notes are
 * intentionally NOT surfaced here — only the customer/vendor-facing fields.
 *
 * Uses the shared `terms-row / terms-key / terms-val` markup from BASE_CSS so it
 * looks identical across all the PDF builders that already ship those classes.
 */

const NOTE_ESCAPE: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => NOTE_ESCAPE[c])
}

export interface OrderNotesInput {
  payment_terms?:        string | null
  payment_terms_notes?:  string | null
  delivery_terms?:       string | null
  delivery_terms_notes?: string | null
  customer_notes?:       string | null   // Sales Order — shown to the customer
  vendor_notes?:         string | null   // Purchase Order — shown to the vendor
}

export interface OrderNoteRow { key: string; val: string }

function combine(term?: string | null, notes?: string | null): string {
  const t = (term ?? '').trim()
  const n = (notes ?? '').trim()
  if (t && n) return `${t} — ${n}`
  return t || n
}

/** Ordered, non-empty note rows to render on a document. Empty when nothing was entered. */
export function orderNotesRows(input: OrderNotesInput): OrderNoteRow[] {
  const rows: OrderNoteRow[] = []
  if ((input.payment_terms ?? '').trim() || (input.payment_terms_notes ?? '').trim()) {
    rows.push({ key: 'Payment Terms', val: combine(input.payment_terms, input.payment_terms_notes) })
  }
  if ((input.delivery_terms ?? '').trim() || (input.delivery_terms_notes ?? '').trim()) {
    rows.push({ key: 'Delivery Terms', val: combine(input.delivery_terms, input.delivery_terms_notes) })
  }
  const cn = (input.customer_notes ?? '').trim()
  if (cn) rows.push({ key: 'Notes', val: cn })
  const vn = (input.vendor_notes ?? '').trim()
  if (vn) rows.push({ key: 'Notes', val: vn })
  return rows
}

/** True when the order carries at least one customer/vendor-facing note to show. */
export function hasOrderNotes(input: OrderNotesInput): boolean {
  return orderNotesRows(input).length > 0
}

/** Renders the rows as the shared `terms-row / terms-key / terms-val` markup (BASE_CSS). */
export function orderNotesTermsHtml(input: OrderNotesInput): string {
  return orderNotesRows(input)
    .map((r) => `
      <div class="terms-row">
        <div class="terms-key">${esc(r.key)}</div>
        <div class="terms-val">${esc(r.val)}</div>
      </div>`)
    .join('')
}
