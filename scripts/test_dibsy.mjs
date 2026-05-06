/**
 * Dibsy integration test script
 * Run: node scripts/test_dibsy.mjs
 *
 * Tests:
 *   1. Dibsy API key validity (direct API call)
 *   2. Webhook handler logic (direct POST to local route)
 */

import { createClient } from '@supabase/supabase-js'

const DIBSY_SECRET_KEY = 'sk_test_218279e5aed93c8256ea352aadda8b3a2759'
const DIBSY_BASE = 'https://api.dibsy.one/v2'
const LOCAL_BASE = 'http://localhost:3000'
const SUPABASE_URL = 'https://wkmvjxxmzstsvahuiwsz.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// ─── helpers ──────────────────────────────────────────────────────────────────

function pass(msg) { console.log(`  ✅  ${msg}`) }
function fail(msg) { console.log(`  ❌  ${msg}`) }
function section(msg) { console.log(`\n── ${msg} ──`) }

// ─── Test 1: Dibsy API key ────────────────────────────────────────────────────

section('Test 1: Dibsy API key — create a payment session')

try {
  const res = await fetch(`${DIBSY_BASE}/payments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DIBSY_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: { value: '1.00', currency: 'QAR' },
      description: 'MMS integration test',
      method: 'creditcard',
      redirectUrl: 'http://localhost:3000/test-redirect',
      webhookUrl: 'http://localhost:3000/api/payments/dibsy/webhook',
      metadata: { subscription_id: 'test-only' },
    }),
  })

  const data = await res.json()
  console.log('  Dibsy response:', JSON.stringify(data, null, 2))

  const checkoutUrl = data._links?.checkout?.href ?? data.checkoutUrl
  if ((res.status === 200 || res.status === 201) && checkoutUrl) {
    pass(`Payment created — ID: ${data.id}`)
    pass(`Checkout URL: ${checkoutUrl}`)
    console.log('\n  👉 Open this URL to test the full payment flow with Dibsy test cards.')
  } else if (res.status === 401) {
    fail('API key rejected — check DIBSY_SECRET_KEY')
  } else {
    fail(`Unexpected response (${res.status})`)
  }
} catch (err) {
  fail(`Network error: ${err.message}`)
}

// ─── Test 2: Webhook handler — simulate a paid event ─────────────────────────

section('Test 2: Webhook handler — simulate payment.paid')

// First, get a real subscription_id from the DB (or use a dummy UUID for dry-run)
let testSubscriptionId = '00000000-0000-0000-0000-000000000000' // dummy fallback

if (SERVICE_ROLE_KEY) {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data: subs } = await supabase
    .from('customer_subscriptions')
    .select('id, status')
    .eq('status', 'pending_payment')
    .limit(1)
    .maybeSingle()

  if (subs) {
    testSubscriptionId = subs.id
    console.log(`  Using real subscription: ${testSubscriptionId} (${subs.status})`)
  } else {
    console.log('  No pending_payment subscription found — using dummy UUID (DB update will no-op)')
  }
} else {
  console.log('  SUPABASE_SERVICE_ROLE_KEY not set — using dummy UUID (DB update will no-op)')
}

try {
  const res = await fetch(`${LOCAL_BASE}/api/payments/dibsy/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'pay_test_integration_check',
      status: 'paid',
      amount: { value: '150.00', currency: 'QAR' },
      metadata: { subscription_id: testSubscriptionId },
    }),
  })

  const data = await res.json()

  if (res.ok && data.ok) {
    pass(`Webhook accepted (${res.status}) — subscription ${testSubscriptionId} should now be active`)
  } else {
    fail(`Webhook returned ${res.status}: ${JSON.stringify(data)}`)
  }
} catch (err) {
  fail(`Could not reach local server — is "npm run dev" running? (${err.message})`)
}

// ─── Done ─────────────────────────────────────────────────────────────────────

console.log('\n── Summary ──')
console.log('  Test cards for Dibsy sandbox:')
console.log('    Visa success:  4111 1111 1111 1111  exp: any  CVV: any')
console.log('    Declined:      4000 0000 0000 0002')
console.log('\n  Full e2e flow:')
console.log('  1. npm run dev')
console.log('  2. node scripts/test_dibsy.mjs')
console.log('  3. Open the checkoutUrl from Test 1 and pay with the test card')
console.log('  4. Dibsy will POST to your webhookUrl — use ngrok for local testing')
