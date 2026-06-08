// src/types/contracts.ts

// ——— Status types ———
export type ContractQuotationStatus =
  | 'draft'
  | 'manager_review'
  | 'customer_pending'
  | 'approved'
  | 'rejected'
  | 'expired';

export type ContractLiveStatus =
  | 'active'
  | 'expiring_soon'
  | 'overdue_payment'
  | 'completed'
  | 'cancelled';

export type ContractStatus = ContractQuotationStatus | ContractLiveStatus;

export type ServiceFrequency =
  | 'daily'
  | 'weekly'
  | 'bi_weekly'
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'annual';

// ——— Building tree ———
export interface BuildingNode {
  id: string;
  name: string;
  type: 'complex' | 'building' | 'floor' | 'area';
  parentId: string | null;
}

export interface BuildingTree {
  nodes: BuildingNode[];
}

// ——— Contract service (line item) ———
export interface ContractService {
  id: string;
  contract_id: string;
  service_id: string | null;
  building_node_id: string | null;
  service_name: string;
  service_path: string[];
  brand_id: string | null;
  brand_name: string | null;
  reliability_factor: number;
  condition: 'good' | 'fair' | 'poor' | null;
  condition_factor: number;
  frequency: ServiceFrequency;
  quantity: number;
  base_price: number;
  unit_price: number;
  total_price: number;
  divisions: string[];
  note: string | null;
  is_general: boolean;
  contract_type: 'preventive' | 'area' | 'general';
  item_kind: 'service' | 'product';
  pricing_mode: 'fixed' | 'by_condition';
  discount: number;
  discount_scope: 'services_only' | 'services_and_products';
  price_unit: string | null;
  sort_order: number;
  _isNew?: boolean;
  _isDirty?: boolean;
}

// ——— Contract milestone ———
export interface ContractMilestone {
  id: string;
  contract_id: string;
  name: string;
  percentage: number;
  amount: number;
  due_date: string | null;
  sort_order: number;
  _isNew?: boolean;
  _isDirty?: boolean;
}

// ——— Contract visit ———
export interface ContractVisit {
  id: string;
  contract_id: string;
  contract_service_id: string | null;
  service_name: string;
  scheduled_date: string;
  team_id: string | null;
  team_name?: string;
  completed: boolean;
  building_node_id?: string;
  service_path?: string[];
  brand_name?: string;
  frequency?: string;
  divisions?: string[];
}

// ——— Contract payment ———
export interface ContractPayment {
  id: string;
  contract_id: string;
  due_date: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue';
}

// ——— Pending visit ———
export interface PendingVisit {
  temp_id: string;
  scheduled_date: string;
  service_name: string;
  service_id: string;
  building_node_id: string | null;
  team_id: string | null;
  notes: string;
}

// ——— Service brand ———
export interface ServiceBrand {
  id: string;
  service_id: string;
  brand_id: string;
  brand_name: string;
  reliability_factor: number;
  is_reliable: boolean;
}

// ——— Full contract (detail view) ———
export interface Contract {
  id: string;
  contract_id: string | null;
  quotation_number: string | null;
  customer_id: string;
  customer_name: string;
  phone: string;
  address: string;
  site_name: string;
  divisions: string[];
  services_summary: string;
  agent_name: string;
  source_type: 'site_visit' | 'direct';
  start_date: string;
  end_date: string;
  status: ContractStatus;
  building_tree: BuildingTree;
  discount: number;
  payment_mode: 'fixed' | 'milestone' | 'completion';
  payment_frequency: string;
  notes: string | null;
  signed_doc_url: string | null;
  terms_snapshot: object | null;
  monthly_value: number;
  total_value: number;
  total_visits: number;
  completed_visits: number;
  total_payments: number;
  paid_amount: number;
  has_signed_doc: boolean;
  area_count: number;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_by: string | null;
  rejected_reason: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  cancelled_date: string | null;
  cancel_reason: string | null;
  last_saved_session: string | null;
  created_at: string;
  updated_at: string;
}

// ——— Quotation card (list view) ———
export interface ContractQuotationSummary {
  id: string;
  quotation_number: string;
  status: ContractQuotationStatus;
  customer_name: string;
  site_name: string;
  phone: string;
  agent_name: string;
  divisions: string[];
  services_summary: string;
  start_date: string;
  end_date: string;
  total_value: number;
  monthly_value: number;
  payment_schedule: string;
  area_count: number;
  total_visits: number;
  has_signed_doc: boolean;
  created_at: string;
}

// ——— Live contract card (list view) ———
export interface LiveContractSummary {
  id: string;
  contract_id: string;
  status: ContractLiveStatus;
  customer_name: string;
  site_name: string;
  phone: string;
  agent_name: string;
  divisions: string[];
  services_summary: string;
  start_date: string;
  end_date: string;
  monthly_value: number;
  total_value: number;
  total_visits: number;
  completed_visits: number;
  upcoming_visits: { date: string; service_name: string; team_name?: string }[];
  total_payments: number;
  paid_amount: number;
  payments: ContractPayment[];
  payment_schedule: string;
  has_signed_doc: boolean;
  area_count: number;
  cancelled_date: string | null;
  cancel_reason: string | null;
}

// ——— Filter types ———
export interface QuotationFilters {
  status?: ContractQuotationStatus[];
  dateFrom?: string;
  dateTo?: string;
  contractNumber?: string;
  customer?: string;
  phone?: string;
  siteName?: string;
  agent?: string;
  sortBy?: 'date' | 'value';
  sortDir?: 'asc' | 'desc';
}

export interface ContractFilters {
  status?: ContractLiveStatus[];
  contractNumber?: string;
  customer?: string;
  site?: string;
  agent?: string;
  sortBy?: 'endDate' | 'balance' | 'visits';
  sortDir?: 'asc' | 'desc';
}

// ——— Form data types ———
export interface ContractFormData {
  sourceType: 'site_visit' | 'direct';
  serviceCustomerId?: string;
  phoneId?: string;
  customerName: string;
  phone: string;
  address: string;
  siteName: string;
  divisions: string[];
  startDate: string;
  endDate: string;
  discount: number;
  paymentMode: 'fixed' | 'milestone' | 'completion';
  paymentFrequency: string;
  buildingTree: BuildingTree;
  notes: string;
  services: ContractService[];
  milestones: ContractMilestone[];
  agentName: string;
  createdBy: string;
  areaCount: number;
  servicesSummary: string;
  totalValue: number;
  monthlyValue: number;
  subtotal: number;
  termsFile?: File | null;
}

// ——— Save validation ———
export interface SaveValidationResult {
  valid: boolean;
  errors: string[];
}

// ——— Tree integrity ———
export interface TreeValidationResult {
  valid: boolean;
  orphanedServices: ContractService[];
  message: string | null;
}

// ——— Schedule types ———
export interface ScheduleDate {
  date: string;
  services: ScheduleService[];
  allAssigned: boolean;
}

export interface ScheduleService {
  visitId: string;
  serviceName: string;
  location: string;
  division: string;
  teamId: string | null;
  teamName: string | null;
  timeSlot: string | null;
}

// ——— Status display config ———
export const STATUS_CONFIG: Record<ContractStatus, {
  label: string;
  color: string;
  badgeVariant: string;
}> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700', badgeVariant: 'muted' },
  manager_review: { label: 'Manager Review', color: 'bg-yellow-100 text-yellow-700', badgeVariant: 'warning' },
  customer_pending: { label: 'Awaiting Signature', color: 'bg-orange-100 text-orange-700', badgeVariant: 'warning' },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700', badgeVariant: 'success' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', badgeVariant: 'destructive' },
  expired: { label: 'Expired', color: 'bg-gray-100 text-gray-700', badgeVariant: 'muted' },
  active: { label: 'Active', color: 'bg-green-100 text-green-800 font-semibold', badgeVariant: 'success' },
  expiring_soon: { label: 'Expiring Soon', color: 'bg-yellow-100 text-yellow-700', badgeVariant: 'warning' },
  overdue_payment: { label: 'Overdue', color: 'bg-red-100 text-red-700', badgeVariant: 'destructive' },
  completed: { label: 'Completed', color: 'bg-blue-100 text-blue-700', badgeVariant: 'default' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-700', badgeVariant: 'muted' },
};

export const QUOTATION_STATUSES: ContractQuotationStatus[] = [
  'draft', 'manager_review', 'customer_pending', 'approved', 'rejected', 'expired',
];

export const LIVE_STATUSES: ContractLiveStatus[] = [
  'active', 'expiring_soon', 'overdue_payment', 'completed', 'cancelled',
];
