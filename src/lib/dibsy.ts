// Dibsy payment gateway client — Qatar (api.dibsy.one/v2)

const DIBSY_BASE = 'https://api.dibsy.one/v2'
const SECRET_KEY = process.env.DIBSY_SECRET_KEY

export interface DibsyAmount {
  value: string   // e.g. "150.00"
  currency: string // "QAR"
}

export interface DibsyCreatePaymentParams {
  amount: DibsyAmount
  description: string
  redirectUrl: string
  webhookUrl: string
  metadata?: Record<string, string>
}

interface DibsyRawPayment {
  id: string
  status: string
  amount: DibsyAmount
  metadata?: Record<string, string>
  _links?: {
    checkout?: { href: string }
    self?: { href: string }
  }
}

export interface DibsyPayment {
  id: string
  status: string
  checkoutUrl: string
  amount: DibsyAmount
  metadata?: Record<string, string>
}

function normalizePayment(raw: DibsyRawPayment): DibsyPayment {
  return {
    id: raw.id,
    status: raw.status,
    checkoutUrl: raw._links?.checkout?.href ?? '',
    amount: raw.amount,
    metadata: raw.metadata,
  }
}

export interface DibsyWebhookPayload {
  id: string
  status: 'paid' | 'failed' | 'expired' | 'refunded' | string
  amount: DibsyAmount
  metadata?: Record<string, string>
}

function authHeader(): HeadersInit {
  if (!SECRET_KEY) throw new Error('DIBSY_SECRET_KEY is not set')
  return {
    'Authorization': `Bearer ${SECRET_KEY}`,
    'Content-Type': 'application/json',
  }
}

export async function createDibsyPayment(
  params: DibsyCreatePaymentParams
): Promise<DibsyPayment> {
  const res = await fetch(`${DIBSY_BASE}/payments`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({
      amount: params.amount,
      description: params.description,
      method: 'creditcard',
      redirectUrl: params.redirectUrl,
      webhookUrl: params.webhookUrl,
      metadata: params.metadata,
    }),
  })

  // Dibsy returns 201 Created for new payments
  if (res.status !== 200 && res.status !== 201) {
    const text = await res.text()
    throw new Error(`Dibsy API error ${res.status}: ${text}`)
  }

  const raw = await res.json() as DibsyRawPayment
  return normalizePayment(raw)
}

export async function getDibsyPayment(paymentId: string): Promise<DibsyPayment> {
  const res = await fetch(`${DIBSY_BASE}/payments/${paymentId}`, {
    headers: authHeader(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Dibsy API error ${res.status}: ${text}`)
  }

  const raw = await res.json() as DibsyRawPayment
  return normalizePayment(raw)
}

export function dibsyStatusToSubscriptionStatus(
  dibsyStatus: string
): 'pending_payment' | 'active' | 'cancelled' | null {
  switch (dibsyStatus) {
    case 'paid':      return 'active'
    case 'failed':
    case 'expired':   return 'pending_payment'
    case 'refunded':  return 'cancelled'
    default:          return null
  }
}
