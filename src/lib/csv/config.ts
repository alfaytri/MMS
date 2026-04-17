// ─── Types ────────────────────────────────────────────────────────────────────

export type EntityType = 'suppliers' | 'inventory_items' | 'customers' | 'purchase_orders' | 'sale_orders'

export type ColumnDef = {
  key: string
  label: string
  required: boolean
  type: 'string' | 'number' | 'boolean'
  hint?: string
}

export type EntityConfig = {
  label: string
  description: string
  columns: ColumnDef[]
  exampleRow: Record<string, string>
  notes?: string[]
}

// ─── Entity Configs ────────────────────────────────────────────────────────────

export const ENTITY_CONFIGS: Record<EntityType, EntityConfig> = {
  suppliers: {
    label: 'Suppliers',
    description: 'Import suppliers into the system',
    columns: [
      { key: 'name',         label: 'Name',         required: true,  type: 'string' },
      { key: 'category',     label: 'Category',     required: false, type: 'string', hint: 'e.g. Electrical, Plumbing' },
      { key: 'contact_name', label: 'Contact Name', required: false, type: 'string' },
      { key: 'phone',        label: 'Phone',        required: false, type: 'string' },
      { key: 'email',        label: 'Email',        required: false, type: 'string' },
      { key: 'address',      label: 'Address',      required: false, type: 'string' },
      { key: 'notes',        label: 'Notes',        required: false, type: 'string' },
    ],
    exampleRow: {
      name: 'Al Jazeera Trading', category: 'Electrical', contact_name: 'Ahmed Ali',
      phone: '+97412345678', email: 'ahmed@aljazeera.qa', address: 'Industrial Area, Doha', notes: '',
    },
  },

  inventory_items: {
    label: 'Inventory Items',
    description: 'Import inventory items with brand variants',
    columns: [
      { key: 'item_name',     label: 'Item Name',      required: true,  type: 'string' },
      { key: 'item_name_ar',  label: 'Item Name (AR)', required: false, type: 'string' },
      { key: 'category_name', label: 'Category',       required: true,  type: 'string', hint: 'Must match existing category name' },
      { key: 'brand_name',    label: 'Brand',          required: true,  type: 'string' },
      { key: 'sku',           label: 'SKU',            required: false, type: 'string' },
      { key: 'unit',          label: 'Unit',           required: true,  type: 'string', hint: 'e.g. pcs, m, kg, L' },
      { key: 'cost_price',    label: 'Cost Price',     required: true,  type: 'number' },
      { key: 'selling_price', label: 'Selling Price',  required: true,  type: 'number' },
    ],
    exampleRow: {
      item_name: 'LED Bulb 9W', item_name_ar: 'مصباح LED 9 وات',
      category_name: 'Electrical', brand_name: 'Philips', sku: 'LED-9W-E27',
      unit: 'pcs', cost_price: '8.50', selling_price: '15.00',
    },
    notes: ['Category must already exist in the system', 'A new brand variant will be created for each row'],
  },

  customers: {
    label: 'Customers',
    description: 'Import customer contact records',
    columns: [
      { key: 'customer_name', label: 'Customer Name', required: true,  type: 'string' },
      { key: 'phone',         label: 'Phone',         required: false, type: 'string' },
      { key: 'email',         label: 'Email',         required: false, type: 'string' },
      { key: 'address',       label: 'Address',       required: false, type: 'string' },
      { key: 'notes',         label: 'Notes',         required: false, type: 'string' },
    ],
    exampleRow: {
      customer_name: 'Qatar Petroleum LLC', phone: '+97444445555',
      email: 'facilities@qp.com.qa', address: 'West Bay, Doha', notes: '',
    },
  },

  purchase_orders: {
    label: 'Purchase Orders',
    description: 'Import purchase orders — one row per line item (group by PO number)',
    columns: [
      { key: 'po_number',      label: 'PO Number',      required: true,  type: 'string', hint: 'Rows with same PO number are grouped' },
      { key: 'supplier_name',  label: 'Supplier Name',  required: true,  type: 'string' },
      { key: 'currency',       label: 'Currency',       required: false, type: 'string', hint: 'Default: QAR' },
      { key: 'created_date',   label: 'Created Date',   required: false, type: 'string', hint: 'YYYY-MM-DD' },
      { key: 'payment_terms',  label: 'Payment Terms',  required: false, type: 'string' },
      { key: 'item_name',      label: 'Item Name',      required: true,  type: 'string' },
      { key: 'sku',            label: 'SKU',            required: false, type: 'string' },
      { key: 'qty',            label: 'Qty',            required: true,  type: 'number' },
      { key: 'unit',           label: 'Unit',           required: false, type: 'string', hint: 'Default: pcs' },
      { key: 'unit_price',     label: 'Unit Price',     required: true,  type: 'number' },
    ],
    exampleRow: {
      po_number: 'PO-2026-001', supplier_name: 'Al Jazeera Trading', currency: 'QAR',
      created_date: '2026-04-17', payment_terms: '50/50',
      item_name: 'LED Bulb 9W', sku: 'LED-9W-E27', qty: '100', unit: 'pcs', unit_price: '8.50',
    },
    notes: ['Multiple rows with the same PO number = one PO with multiple line items', 'PO will be created in Draft status'],
  },

  sale_orders: {
    label: 'Sale Orders',
    description: 'Import sale orders — one row per line item (group by SO number or customer+date)',
    columns: [
      { key: 'customer_name',   label: 'Customer Name',  required: true,  type: 'string' },
      { key: 'phone',           label: 'Phone',          required: false, type: 'string' },
      { key: 'group_key',       label: 'Group Key',      required: false, type: 'string', hint: 'Groups rows into one SO. Defaults to customer_name+created_date' },
      { key: 'created_date',    label: 'Created Date',   required: false, type: 'string', hint: 'YYYY-MM-DD' },
      { key: 'notes',           label: 'Notes',          required: false, type: 'string' },
      { key: 'item_name',       label: 'Item Name',      required: true,  type: 'string' },
      { key: 'sku',             label: 'SKU',            required: false, type: 'string' },
      { key: 'qty',             label: 'Qty',            required: true,  type: 'number' },
      { key: 'unit',            label: 'Unit',           required: false, type: 'string', hint: 'Default: pcs' },
      { key: 'unit_price',      label: 'Unit Price',     required: true,  type: 'number' },
    ],
    exampleRow: {
      customer_name: 'Qatar Petroleum LLC', phone: '+97444445555',
      group_key: 'QP-APR-001', created_date: '2026-04-17', notes: '',
      item_name: 'LED Bulb 9W', sku: 'LED-9W-E27', qty: '50', unit: 'pcs', unit_price: '15.00',
    },
    notes: ['Rows with the same group_key are combined into one Sale Order', 'SO will be created as Quotation status'],
  },
}

// ─── Template generator ────────────────────────────────────────────────────────

export function generateCSVTemplate(entityType: EntityType): string {
  const config = ENTITY_CONFIGS[entityType]
  const headers = config.columns.map((c) => c.key).join(',')
  const example = config.columns.map((c) => {
    const val = config.exampleRow[c.key] ?? ''
    return val.includes(',') ? `"${val}"` : val
  }).join(',')
  return `${headers}\n${example}\n`
}

export function downloadCSVTemplate(entityType: EntityType) {
  const config = ENTITY_CONFIGS[entityType]
  const csv = generateCSVTemplate(entityType)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `template_${entityType}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
