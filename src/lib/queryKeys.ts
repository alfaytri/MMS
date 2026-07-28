/**
 * Centralized TanStack Query key factory.
 *
 * Every query key in the application is defined here so that
 * invalidation, cancellation, and optimistic updates always
 * reference the same canonical key.
 *
 * Naming conventions:
 *   - `.all`        — matches every query in the module (prefix-match)
 *   - `.list(…)`    — list / search queries (often filtered)
 *   - `.detail(id)` — single-entity queries
 *   - `.byX(x)`     — queries scoped to a parent entity
 */

// Shorthand — many params are nullable at call sites.
type Nullable = string | null | undefined

export const queryKeys = {
  /* ── Activity Log ─────────────────────────────────────── */
  activityLog: {
    all: ['activity-log'] as const,
    list: (filters: unknown) => ['activity-log', filters] as const,
  },

  /* ── Approvals ────────────────────────────────────────── */
  approvals: {
    chains: ['approval-chains'] as const,
    chainForDivisionAll: ['approval-chain-for-division'] as const,
    chainForDivision: (divisionId: Nullable) =>
      ['approval-chain-for-division', divisionId] as const,
    roleAssignments: ['approval-role-assignments'] as const,
    roleAssignmentsByDivision: (divisionId: Nullable) =>
      ['approval-role-assignments', divisionId] as const,
    myRoles: ['my-approval-roles'] as const,
    poApprovals: ['po-approvals'] as const,
    poApprovalsPending: ['po-approvals', 'pending'] as const,
    poApprovalsCompleted: ['po-approvals', 'completed'] as const,
    sales:          ['approvals', 'sales'] as const,
    salesPending:   ['approvals', 'sales', 'pending']   as const,
    salesCompleted: ['approvals', 'sales', 'completed'] as const,
    salesDetail:    (id: Nullable) => ['approvals', 'sales', 'detail', id] as const,
    salesBySo:      (soId: Nullable) => ['approvals', 'sales', 'so', soId] as const,
  },


  /* ── Companies ────────────────────────────────────────── */
  companies: {
    all: ['companies'] as const,
  },

  /* ── Contact Center ───────────────────────────────────── */
  contactCenter: {
    addresses: (customerId: Nullable) =>
      ['cc-addresses', customerId] as const,
    serviceCustomer: (customerId: Nullable) =>
      ['service-customer', customerId] as const,
    serviceCustomerPhones: (customerId: Nullable) =>
      ['service-customer-phones', customerId] as const,
    serviceCustomerAddresses: (customerId: Nullable) =>
      ['service-customer-addresses', customerId] as const,
    serviceCustomerProducts: (customerId: Nullable) =>
      ['service-customer-products', customerId] as const,
    customerBlocks: (customerId: Nullable) =>
      ['customer-blocks', customerId] as const,
    permission: ['cc-permission'] as const,
    orderHistory: (customerId: Nullable) =>
      ['cc-order-history', customerId] as const,
    instructionsForChat: ['instructions-for-chat'] as const,
  },

  /* ── Contracts ────────────────────────────────────────── */
  contracts: {
    all: ['contracts'] as const,
    list: (filters: unknown) => ['contracts', filters] as const,
    detail: (id: Nullable) => ['contractDetail', id] as const,
    detailAll: ['contractDetail'] as const,
    quotations: (filters?: unknown) =>
      filters !== undefined
        ? (['contractQuotations', filters] as const)
        : (['contractQuotations'] as const),
    quotationsAll: ['contractQuotations'] as const,
    schedule: (id: Nullable) => ['contractSchedule', id] as const,
    divisionTerms: (divisions: unknown) =>
      ['contractDivisionTerms', divisions] as const,
    serviceTerms: (serviceIds: unknown) =>
      ['contractServiceTerms', serviceIds] as const,
    serviceChildren: (parentId: Nullable) =>
      ['contractServiceChildren', parentId] as const,
    serviceMedia: (serviceId: Nullable) =>
      ['serviceMedia', serviceId] as const,
  },

  /* ── Country Codes ────────────────────────────────────── */
  countryCodes: {
    all: ['country-codes'] as const,
  },

  /* ── Credit Groups ────────────────────────────────────── */
  creditGroups: {
    all: ['credit-groups'] as const,
    counts: ['credit-group-counts'] as const,
  },

  /* ── Credit Group Approval Workflow ────────────────────── */
  creditGroupApprovals: {
    all:                ['credit-group-approvals'] as const,
    pending:            ['credit-group-approvals', 'pending'] as const,
    completed:          ['credit-group-approvals', 'completed'] as const,
    byCustomerAll:      ['credit-group-approvals', 'by-customer'] as const,
    byCustomer: (id: string | null) => ['credit-group-approvals', 'by-customer', id ?? null] as const,
  },

  /* ── Credit / Debit Notes ─────────────────────────────── */
  creditNotes: {
    all: ['credit-notes'] as const,
    debitNotes: ['debit-notes'] as const,
    debitDetail: (id: Nullable) => ['debit-notes', 'detail', id] as const,
  },

  /* ── Currencies ───────────────────────────────────────── */
  currencies: {
    all: ['currencies'] as const,
    list: (activeOnly: boolean) => ['currencies', activeOnly] as const,
  },

  /* ── Customers (legacy) ───────────────────────────────── */
  customers: {
    all: ['customers'] as const,
    search: (search: Nullable) => ['customers', search] as const,
    allCustomers: ['all-customers'] as const,
    allCustomersSearch: (search: string, page: number) =>
      ['all-customers', search, page] as const,
    quotations: (customerId: Nullable) =>
      ['customer-quotations', customerId] as const,
  },

  /* ── Customer History ─────────────────────────────────── */
  customerHistory: {
    orders: (customerId: Nullable, year: number, month: number, page: number, pageSize: number) =>
      ['customer-history-orders', customerId, year, month, page, pageSize] as const,
    products: (customerId: Nullable, year: number, month: number, page: number, pageSize: number) =>
      ['customer-history-products', customerId, year, month, page, pageSize] as const,
  },

  /* ── Customer Invoices ────────────────────────────────── */
  customerInvoices: {
    all: ['customer-invoices'] as const,
    list: (filters: unknown) => ['customer-invoices', filters] as const,
    detail: (id: Nullable) => ['customer-invoice', id] as const,
    bySo: (soId: Nullable) => ['invoices-by-so', soId] as const,
  },

  /* ── Customer Payments ────────────────────────────────── */
  customerPayments: {
    all: ['customer-payments'] as const,
    byInvoice: (invoiceId?: Nullable) =>
      ['customer-payments', invoiceId] as const,
  },

  /* ── Dead Stock ───────────────────────────────────────── */
  deadStock: {
    all: ['dead_stock'] as const,
  },

  /* ── Finance ─────────────────────────────────────────── */
  dashboard: {
    stats: ['dashboard-stats'] as const,
  },

  finance: {
    dashboard: ['finance-dashboard'] as const,
    purchaseAging: ['purchase-aging-report'] as const,
    salesAging: ['sales-aging-report'] as const,
    customerStatement: (customerId: Nullable, dateFrom: Nullable, dateTo: Nullable) =>
      ['customer-statement', customerId, dateFrom, dateTo] as const,
    productProfitability: (from: string, to: string) =>
      ['product-profitability', from, to] as const,
    profitabilityDrilldown: (from: string, to: string) =>
      ['profitability-drilldown', from, to] as const,
  },

  /* ── Divisions ────────────────────────────────────────── */
  divisions: {
    all: ['divisions'] as const,
    allList: ['divisions', 'all'] as const,
    byCompany: (companyId: Nullable) =>
      ['divisions', 'company', companyId] as const,
  },

  /* ── Inventory ────────────────────────────────────────── */
  inventory: {
    categories: ['inventory-categories'] as const,
    categoriesByType: (type: string, showArchived?: boolean) =>
      ['inventory-categories', type, showArchived] as const,
    categoriesTree: ['inventory-categories-tree'] as const,
    categoriesTreeByType: (type: string, showArchived?: boolean) =>
      ['inventory-categories-tree', type, showArchived] as const,
    categoriesAllFlat: ['inventory-categories-all-flat'] as const,
    items: ['inventory-items'] as const,
    itemsByType: (categoryType: Nullable) =>
      ['inventory-items', categoryType] as const,
    itemsByCategory: ['inventory-items-by-category'] as const,
    itemsByCategoryId: (categoryId: Nullable, showArchived?: boolean) =>
      ['inventory-items-by-category', categoryId, showArchived] as const,
    itemsAll: ['inventory_items_all'] as const,
    itemsAllV2: ['inventory-items-all'] as const,
    brandVariants: ['brand-variants'] as const,
    brandVariantsByItem: (itemId: Nullable) =>
      ['brand-variants', itemId] as const,
    brandVariantsV2: ['brand-variants-v2'] as const,
    brandVariantsV2ByItem: (itemId: Nullable, showArchived?: boolean) =>
      ['brand-variants-v2', itemId, showArchived] as const,
    brandVariantsGrouped: ['brand-variants-grouped'] as const,
    brandVariantsPriceSummary: ['brand-variants-price-summary'] as const,
    brandVariantsPriceSummaryByIds: (idsKey: string) =>
      ['brand-variants-price-summary', idsKey] as const,
    brandVariantAncestry: (variantId: Nullable) =>
      ['brand-variant-ancestry', variantId] as const,
    inventoryBrandVariants: ['inventory-brand-variants'] as const,
    allBrandNames: ['all-brand-names'] as const,
    fifoLayers: ['fifo-layers'] as const,
    fifoLayersByVariant: (brandVariantId: Nullable) =>
      ['fifo-layers', brandVariantId] as const,
    variantWarehouseStock: ['variant_warehouse_stock'] as const,
    variantWarehouseStockById: (variantId: Nullable) =>
      ['variant_warehouse_stock', variantId] as const,
    reservedOrderLines: ['reserved-order-lines'] as const,
    reservedOrderLinesByVariant: (brandVariantId: Nullable) =>
      ['reserved-order-lines', brandVariantId] as const,
    servicesWithInventory: ['services_with_inventory'] as const,
    servicesAllForLinks: ['services-all-for-links'] as const,
    servicesForLinks: ['services-for-links'] as const,
    serviceLinksAll: ['service-links-all'] as const,
    serviceInventoryLinks: (brandVariantId: Nullable) =>
      ['service-inventory-links', brandVariantId] as const,
    serviceInventory: (brandVariantId: Nullable) =>
      ['service-inventory', brandVariantId] as const,
    cogsEntries: ['cogs-entries'] as const,
    cogsEntriesByVariant: (brandVariantId: Nullable) =>
      ['cogs-entries', brandVariantId] as const,
    cogsBreakdown: (variantId: string) =>
      ['inventory', 'cogsBreakdown', variantId] as const,
    stockValueCogsSummary: (variantIds: string[] | null) =>
      ['inventory', 'stockValueCogsSummary', variantIds ? [...variantIds].sort() : null] as const,
    stockMovements: ['stock_movements'] as const,
    stockMovementsByVariant: (brandVariantId: Nullable) =>
      ['stock_movements', 'by_variant', brandVariantId] as const,
    itemAttributes: (itemId: Nullable) =>
      ['inventory-item-attributes', itemId] as const,
    staffProfiles: ['staff-profiles'] as const,
    toolAssetUnits: (itemId: Nullable) =>
      ['tool-asset-units', itemId] as const,
    categoryStockAggregates: (type: string) =>
      ['category-stock-aggregates', type] as const,
  },

  /* ── Invoices ─────────────────────────────────────────── */
  invoices: {
    all: ['invoices'] as const,
    list: (filters: unknown) => ['invoices', filters] as const,
    summary: ['invoice-summary'] as const,
  },

  /* ── Landed Costs ─────────────────────────────────────── */
  landedCosts: {
    all: ['landed_costs'] as const,
    list: (search?: string) =>
      ['landed_costs', { search }] as const,
    detail: (id: Nullable) => ['landed_costs', id] as const,
    validateAllocation: (lcId: Nullable) =>
      ['validate-lc-allocation', lcId] as const,
    billSignedUrls: (paths: string[]) =>
      ['bill-signed-urls', paths] as const,
    usedReceivalIds: ['landed_costs', 'used_receival_ids'] as const,
  },

  /* ── Notification Config ──────────────────────────────── */
  notificationConfig: {
    all: ['notification_config'] as const,
  },

  /* ── Notifications ────────────────────────────────────── */
  notifications: {
    all: ['notifications'] as const,
    templates: ['notification_templates'] as const,
    reminderCategories: ['reminder_categories'] as const,
    reminders: ['reminders'] as const,
    unreadCount: ['notifications', 'unread-count'] as const,
    pendingCount: ['notifications', 'pending-count'] as const,
    recent: ['notifications', 'recent'] as const,
    pending: ['notifications', 'pending'] as const,
    completed: ['notifications', 'completed'] as const,
  },

  /* ── Orders ───────────────────────────────────────────── */
  orders: {
    all: ['orders'] as const,
    list: (filter: unknown) => ['orders', filter] as const,
    counts: ['order-counts'] as const,
    detail: (orderId: Nullable) => ['order-detail', orderId] as const,
    locations: (dateFrom: Nullable, dateTo: Nullable) =>
      ['order-locations', dateFrom, dateTo] as const,
  },

  /* ── Payments ─────────────────────────────────────────── */
  payments: {
    all: ['payments'] as const,
    list: (filters: unknown) => ['payments', filters] as const,
    summary: ['payment-summary'] as const,
    pending: ['pending-payments'] as const,
    plans: (invoiceId: Nullable) =>
      ['payment-plans', invoiceId] as const,
    paymentAmount: (paymentId: Nullable) =>
      ['payment-amount', paymentId] as const,
    methods: ['payment_methods'] as const,
  },

  /* ── Permissions ──────────────────────────────────────── */
  permissions: {
    user: ['user-permissions'] as const,
  },

  /* ── PO Edit Requests (Phase D) ───────────────────────── */
  poEditRequests: {
    all:  ['po-edit-requests'] as const,
    byPo: (poId: Nullable) => ['po-edit-requests', 'by-po', poId] as const,
  },

  /* ── Profiles ─────────────────────────────────────────── */
  profiles: {
    all: ['profiles'] as const,
    my: ['my-profile'] as const,
    userDivisions: (profileId: Nullable) =>
      ['user-divisions', profileId] as const,
    allSelect: ['all-profiles-select'] as const,
    isAdmin: ['is-admin'] as const,
  },

  /* ── Promotions ───────────────────────────────────────── */
  promotions: {
    campaigns: ['promotion_campaigns'] as const,
    vouchers: ['vouchers'] as const,
  },

  /* ── Purchase Orders ──────────────────────────────────── */
  purchaseOrders: {
    all: ['purchase-orders'] as const,
    list: (filters: unknown) => ['purchase-orders', filters] as const,
    detail: (id: Nullable) => ['purchase-order', id] as const,
    payments: (poId: Nullable) => ['po-payments', poId] as const,
    receivals: (poId: Nullable) => ['po-receivals', poId] as const,
    versions: (poId: Nullable) => ['po-versions', poId] as const,
    versionsAll: ['po-versions'] as const,
  },

  /* ── Purchase Returns ─────────────────────────────────── */
  purchaseReturns: {
    all: ['po-returns'] as const,
    list: (filters: unknown) => ['po-returns', filters] as const,
    byPo: ['po-returns-by-po'] as const,
    byPoId: (poId: Nullable) => ['po-returns-by-po', poId] as const,
  },

  /* ── Quotations ───────────────────────────────────────── */
  quotations: {
    all: ['quotations'] as const,
    list: (filter: unknown) => ['quotations', 'list', filter] as const,
    counts: ['quotation-counts'] as const,
    detail: (id: Nullable) => ['quotation-detail', id] as const,
  },

  /* ── Reason Lists ─────────────────────────────────────── */
  reasonLists: {
    all: ['reason-lists'] as const,
    byCategory: (category: string) => ['reason-lists', category] as const,
  },

  /* ── Receivals ────────────────────────────────────────── */
  receivals: {
    all: ['receivals'] as const,
    list: (filters: unknown) => ['receivals', filters] as const,
    detail: (id: Nullable) => ['receival', id] as const,
    editRequests: ['receival_edit_requests'] as const,
    editRequestsByReceival: (receivalId: Nullable) =>
      ['receival_edit_requests', receivalId] as const,
    lcSelector: (search?: string) =>
      ['receivals-lc-selector', { search }] as const,
    itemsFifo: (receivalId: Nullable) =>
      ['receival-items-fifo', receivalId] as const,
    inventoryReceivable: (brandVariantId: Nullable, warehouseId: Nullable) =>
      ['fifo-layers-for-variant', brandVariantId, warehouseId] as const,
    canCreateInventoryReceival: ['can-create-inventory-receival'] as const,
  },


  /* ── Roles ────────────────────────────────────────────── */
  roles: {
    custom: ['custom-roles'] as const,
    userRoles: (profileId: Nullable) => ['user-roles', profileId] as const,
    myApprovalSlots: ['roles','my-approval-slots'] as const,
    workflowSteps: ['workflow-approval-steps'] as const,
    workflowGroups: ['workflow-approval-groups'] as const,
    approvalCoverage: ['roles', 'approval-coverage'] as const,
  },

  /* ── Sale Deliveries ──────────────────────────────────── */
  saleDeliveries: {
    all: ['sale-deliveries'] as const,
    list: (filters: unknown) => ['sale-deliveries', filters] as const,
    byReturnId: (returnId: Nullable) => ['sale-deliveries', 'by-return', returnId] as const,
  },

  /* ── Sale Orders ──────────────────────────────────────── */
  saleOrders: {
    all: ['sale-orders'] as const,
    list: (filters: unknown) => ['sale-orders', filters] as const,
    detail: (id: Nullable) => ['sale-order', id] as const,
    payments: (soId: Nullable) => ['so-payments', soId] as const,
  },

  /* ── Sale Returns ─────────────────────────────────────── */
  saleReturns: {
    all: ['sale-returns'] as const,
    list: (filters: unknown) => ['sale-returns', filters] as const,
    bySo: ['sale-returns-by-so'] as const,
    bySoId: (soId: Nullable) => ['sale-returns-by-so', soId] as const,
    unresolved: (soId: Nullable) => ['sale-returns', 'unresolved', soId] as const,
    progress: (returnId: Nullable) => ['sale-returns', 'progress', returnId] as const,
    lineProgress: (returnId: Nullable) => ['sale-returns', 'line-progress', returnId] as const,
  },

  /* ── Service Brands ───────────────────────────────────── */
  serviceBrands: {
    byService: (serviceId: Nullable) => ['serviceBrands', serviceId] as const,
  },

  /* ── Service Change Requests ──────────────────────────── */
  serviceChangeRequests: {
    all: ['service-change-requests'] as const,
    list: (filters: unknown) => ['service-change-requests', filters] as const,
    pendingAdds: ['service-change-requests', 'pending-adds'] as const,
    pendingCount: ['service-change-requests', 'pending-count'] as const,
    history: ['service-change-history'] as const,
    historyByService: (serviceId: Nullable) =>
      ['service-change-history', serviceId] as const,
  },

  /* ── Service Customers ────────────────────────────────── */
  serviceCustomers: {
    all: ['service-customers'] as const,
    list: (search: string, page: number, pageSize: number, multiplePhones: boolean) =>
      ['service-customers', search, page, pageSize, multiplePhones] as const,
  },

  /* ── Services ─────────────────────────────────────────── */
  services: {
    all: ['services'] as const,
    byType: (treeType: string, divisionSlugs?: string[]) =>
      ['services', treeType, divisionSlugs] as const,
    instructions: ['instructions'] as const,
    instructionsFull: ['instructions', 'full'] as const,
    serviceInstructions: ['service_instructions'] as const,
    serviceInstructionsByService: (serviceId: Nullable) =>
      ['service_instructions', serviceId] as const,
    serviceInstructionsAll: ['service_instructions', 'all'] as const,
    allPicker: ['services-all-picker'] as const,
  },

  /* ── Shipments ────────────────────────────────────────── */
  shipments: {
    all: ['shipments'] as const,
    list: (archived?: boolean, search?: string) =>
      ['shipments', { archived, search }] as const,
  },

  /* ── Site Visits ──────────────────────────────────────── */
  siteVisits: {
    all: ['site-visits'] as const,
    list: (filter: unknown) => ['site-visits', filter] as const,
    detail: (visitId: Nullable) => ['site-visit-detail', visitId] as const,
  },

  /* ── Subscription Packages ────────────────────────────── */
  subscriptionPackages: {
    all: ['subscription_packages'] as const,
    list: (includeArchived?: boolean) =>
      ['subscription_packages', { includeArchived }] as const,
    services: (packageId: Nullable) =>
      ['subscription_package_services', packageId] as const,
  },

  /* ── Supplier Bills ───────────────────────────────────── */
  supplierBills: {
    all: ['supplier-bills'] as const,
    list: (filters: unknown) => ['supplier-bills', filters] as const,
    detail: (id: Nullable) => ['supplier-bill', id] as const,
    byPo: (poId: Nullable) => ['supplier-bills-by-po', poId] as const,
    viewModel: ['bill-view-model'] as const,
    viewModelById: (id: Nullable) => ['bill-view-model', id] as const,
  },

  /* ── Supplier Payments ────────────────────────────────── */
  supplierPayments: {
    all: ['supplier-payments'] as const,
    available: (supplierId: Nullable) =>
      ['supplier-payments-available', supplierId] as const,
    unlinkedOutgoing: (supplierId?: Nullable) =>
      ['unlinked-outgoing-payments', supplierId ?? null] as const,
  },

  /* ── Suppliers ────────────────────────────────────────── */
  suppliers: {
    all: ['suppliers'] as const,
  },

  /* ── Unlinked AR ──────────────────────────────────────── */
  unlinkedAr: {
    incomingPaymentsAll: ['unlinked-incoming-payments'] as const,
    incomingPayments: (customerId: Nullable) =>
      ['unlinked-incoming-payments', customerId] as const,
    invoicesAll: ['unlinked-ar-invoices'] as const,
    invoices: (customerId: Nullable) =>
      ['unlinked-ar-invoices', customerId] as const,
  },

  /* ── User Division Scope ──────────────────────────────── */
  userDivisionScope: {
    jwtClaims: ['jwt-claims'] as const,
    companyDivisions: ['user-company-divisions'] as const,
  },

  /* ── Warehouses ───────────────────────────────────────── */
  warehouses: {
    all: ['warehouses'] as const,
  },

  /* ── Warehouse Operations ─────────────────────────────── */
  warehouseOps: {
    stockMovements: (warehouseId: Nullable, limit: number) =>
      ['stock_movements', { warehouseId, limit }] as const,
    warehouseStock: (warehouseId: Nullable) =>
      ['warehouse_stock', warehouseId] as const,
    warehouseStockAll: ['warehouse_stock'] as const,
    warehouseTransfers: ['warehouse_transfers'] as const,
    warehouseTransfersByStatus: (status?: Nullable) =>
      ['warehouse_transfers', { status }] as const,
    stockAdjustments: ['stock_adjustments'] as const,
    stockAdjustmentsByWarehouse: (warehouseId: Nullable) =>
      ['stock_adjustments', { warehouseId }] as const,
    inventoryChecks: ['inventory_checks'] as const,
    inventoryChecksByWarehouse: (warehouseId: Nullable) =>
      ['inventory_checks', { warehouseId }] as const,
    inventoryCheckDetail: (id: Nullable) =>
      ['inventory_checks', id] as const,
    inventoryCheckAssignments: (checkId: string) =>
      ['inventory_check_assignments', checkId] as const,
    inventoryCheckLog: (checkId: string) =>
      ['inventory_check_log', checkId] as const,
    inventoryCheckApprovals: (checkId: string) =>
      ['inventory_check_approvals', checkId] as const,
    inventoryCheckGeneratedSAs: (checkId: string) =>
      ['inventory_check_generated_sas', checkId] as const,
    receivalsDeliveries: ['receivals_deliveries'] as const,
    responsiblePersons: ['warehouse_responsible_persons'] as const,
    responsiblePersonsByWarehouse: (warehouseId: Nullable) =>
      ['warehouse_responsible_persons', { warehouseId }] as const,
    reorderPoints: ['reorder_points'] as const,
    reorderPointsByWarehouse: (warehouseId: Nullable) =>
      ['reorder_points', { warehouseId }] as const,
    transferDetail: (transferId: Nullable) =>
      ['warehouse_transfers', 'detail', transferId] as const,
    transferItems: (transferId: Nullable) =>
      ['warehouse_transfer_items', transferId] as const,
  },

  /* ── Brand Groups (admin page) ──────────────────────────── */
  brandGroups: {
    all: ['brand-groups'] as const,
    brands: ['brands'] as const,
  },

  /* ── LC Attached (page-level) ─────────────────────────── */
  lcAttached: {
    receivals: (idsKey: string) => ['lc-attached-receivals', idsKey] as const,
    pos: (idsKey: string) => ['lc-attached-pos', idsKey] as const,
  },

  /* ── Misc (component-only keys) ───────────────────────── */
  misc: {
    divisionBySlug: (slug: Nullable) =>
      ['division-by-slug', slug] as const,
    brandVariantsUnderscore: ['brand_variants'] as const,
  },
} as const
