import { NextRequest, NextResponse } from 'next/server'

interface SendQuotationBody {
  phone: string
  customerName: string
  quotationId: string
  divisionName: string
  services: Array<{ name: string; qty: number; price: number }>
  total: number
  expiryDate: string
}

function buildMessage(body: SendQuotationBody): string {
  const serviceLines = body.services
    .map((s) => `• ${s.name} x${s.qty} — QAR ${(s.price * s.qty).toLocaleString()}`)
    .join('\n')

  return [
    `Hello ${body.customerName},`,
    '',
    'Please find your quotation below:',
    '',
    `Quotation No: ${body.quotationId}`,
    `Valid Until: ${body.expiryDate}`,
    '',
    'Services:',
    serviceLines,
    '',
    `Total: QAR ${body.total.toLocaleString()}`,
    '',
    `Thank you for choosing ${body.divisionName}.`,
  ].join('\n')
}

export async function POST(req: NextRequest) {
  const WATI_URL = process.env.WATI_API_URL?.replace(/\/$/, '')
  const WATI_TOKEN = process.env.WATI_API_TOKEN

  if (!WATI_URL || !WATI_TOKEN) {
    return NextResponse.json(
      { error: 'WATI credentials not configured' },
      { status: 500 },
    )
  }

  let body: SendQuotationBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate required fields
  if (!body.phone || !body.customerName || !body.quotationId || !body.divisionName || !body.services || body.total === undefined || !body.expiryDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!Array.isArray(body.services) || body.services.length === 0) {
    return NextResponse.json({ error: 'services must be a non-empty array' }, { status: 400 })
  }

  // Normalize phone — WATI expects digits only, no + prefix
  const phone = body.phone.replace(/\D/g, '')

  if (!phone) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
  }

  // 1. Check conversation window
  let contactRes
  try {
    contactRes = await fetch(
      `${WATI_URL}/api/v1/getContacts?pageSize=1&pageNumber=1&name=${phone}`,
      { headers: { Authorization: `Bearer ${WATI_TOKEN}` } },
    )
  } catch (err) {
    console.error('[wati/send-quotation] getContacts fetch error:', err)
    return NextResponse.json(
      { error: 'Failed to reach WATI API' },
      { status: 502 },
    )
  }

  if (!contactRes.ok) {
    const errText = await contactRes.text()
    console.error('[wati/send-quotation] getContacts error:', contactRes.status, errText)
    return NextResponse.json(
      { error: 'Failed to reach WATI API' },
      { status: 502 },
    )
  }

  let contactData
  try {
    contactData = await contactRes.json()
  } catch {
    console.error('[wati/send-quotation] failed to parse getContacts response')
    return NextResponse.json(
      { error: 'Invalid WATI API response' },
      { status: 502 },
    )
  }

  const contact = contactData?.contact_list?.[0]

  // Check if 24-hour conversation window is open
  const windowOpen = (() => {
    if (!contact?.lastReceivedMessageDate) return false
    const last = new Date(contact.lastReceivedMessageDate)
    const diff = Date.now() - last.getTime()
    return diff < 24 * 60 * 60 * 1000 // within 24 hours
  })()

  if (!windowOpen) {
    return NextResponse.json({ windowClosed: true })
  }

  // 2. Send session message
  const message = buildMessage(body)
  let sendRes
  try {
    sendRes = await fetch(
      `${WATI_URL}/api/v1/sendSessionMessage/${phone}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${WATI_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageText: message }),
      },
    )
  } catch (err) {
    console.error('[wati/send-quotation] sendSessionMessage fetch error:', err)
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 502 },
    )
  }

  if (!sendRes.ok) {
    const err = await sendRes.text()
    console.error('[wati/send-quotation] sendSessionMessage error:', sendRes.status, err)
    return NextResponse.json(
      { error: `WATI send failed: ${err}` },
      { status: 502 },
    )
  }

  return NextResponse.json({ sent: true })
}
