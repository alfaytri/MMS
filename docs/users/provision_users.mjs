#!/usr/bin/env node
/**
 * Bulk user provisioning for new-prod (Alfaytri ERP).
 *
 * Clears all non-admin users and creates the reconciled 63-user set from
 * provision_spec.json, each with a temporary password + must_change_password=true
 * (forced reset on first login), their role(s), and division scope(s).
 *
 * SAFE BY DEFAULT: dry-run unless --confirm is passed. The password is NEVER stored
 * in the repo — it is passed at runtime via --password.
 *
 * Usage:
 *   node docs/users/provision_users.mjs                              # dry-run (read-only, prints the plan)
 *   node docs/users/provision_users.mjs --confirm --password "Test@123"
 *
 * Guards:
 *   - Aborts unless the target URL is new-prod (optishfnnctrhffpoywg).
 *   - Aborts if the kept admin (admin@alfaytri.com) is not found.
 *   - Aborts if >20 non-admin users already exist (looks already-provisioned) unless
 *     --reprovision is also passed — prevents an accidental second run from wiping a
 *     populated user base.
 *
 * Credentials: the new-prod URL is fixed below. The service_role key is read from the
 * SB_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) environment variable that YOU set at
 * runtime — it is never read from a committed file. Get it from the Supabase dashboard:
 *   optishfnnctrhffpoywg → Settings → API → service_role (secret).
 *   (Do NOT use .env.local — that points at the paused dev DB.)
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2)
const CONFIRM = args.includes('--confirm')
const REPROVISION = args.includes('--reprovision')
// --create-missing: skip the delete phase entirely and create ONLY spec users that are
// not already present. Safe, non-destructive top-up (touches no existing user or team link).
const CREATE_MISSING = args.includes('--create-missing')
const pwIdx = args.indexOf('--password')
const PASSWORD = pwIdx >= 0 ? args[pwIdx + 1] : null
const KEEP_EMAIL = 'admin@alfaytri.com'
const NEWPROD_REF = 'optishfnnctrhffpoywg'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const URL = process.env.SB_URL || `https://${NEWPROD_REF}.supabase.co`
const KEY = process.env.SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) {
  console.error('ABORT: no service key. Set it from the new-prod dashboard (Settings → API → service_role):')
  console.error('  export SB_SERVICE_KEY="<new-prod service_role key>"')
  process.exit(1)
}
if (!URL.includes(NEWPROD_REF)) { console.error(`ABORT (safety): target is not new-prod — ${URL}`); process.exit(1) }
// Decode the service-role JWT and confirm its project ref is new-prod (prevents a wrong-project key).
try {
  const payload = JSON.parse(Buffer.from(KEY.split('.')[1], 'base64').toString('utf8'))
  if (payload.ref && payload.ref !== NEWPROD_REF) {
    console.error(`ABORT (safety): the service key belongs to project '${payload.ref}', not new-prod '${NEWPROD_REF}'.`)
    process.exit(1)
  }
  if (payload.role && payload.role !== 'service_role') {
    console.error(`ABORT: the key role is '${payload.role}', not 'service_role'. Use the service_role secret key.`)
    process.exit(1)
  }
} catch { console.error('ABORT: could not parse the service key as a JWT — check you copied the full key.'); process.exit(1) }

const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const spec = JSON.parse(readFileSync(join(__dir, 'provision_spec.json'), 'utf8'))

// Login-email domain, derived exactly like the app (companies.name_en slug).
const { data: company } = await sb.from('companies').select('name_en').eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
const slug = (company?.name_en ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mms'
const emailFor = (u) => `${u}@${slug}.com`

console.log('='.repeat(70))
console.log(`Target      : ${URL}`)
console.log(`Mode        : ${CONFIRM ? 'EXECUTE (--confirm)' : 'DRY-RUN (no changes)'}`)
console.log(`Domain      : @${slug}.com`)
console.log(`Keep        : ${KEEP_EMAIL}`)
console.log(`To create   : ${spec.users.length}`)
console.log('='.repeat(70))

// --- current state ---
async function listAllAuthUsers() {
  const out = []
  let page = 1
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    out.push(...data.users)
    if (data.users.length < 1000) break
    page++
  }
  return out
}
const authUsers = await listAllAuthUsers()
const { data: profiles } = await sb.from('user_data').select('id,auth_user_id,email')
const profByAuth = new Map((profiles || []).map((p) => [p.auth_user_id, p]))

const keptAdmin = authUsers.find((u) => (u.email || '').toLowerCase() === KEEP_EMAIL)
if (!keptAdmin) { console.error(`ABORT: kept admin ${KEEP_EMAIL} not found — refusing to proceed (would leave no admin).`); process.exit(1) }

// In --create-missing mode nothing is deleted; we only top up spec users that are absent.
const toDelete = CREATE_MISSING ? [] : authUsers.filter((u) => (u.email || '').toLowerCase() !== KEEP_EMAIL)
// "Already exists" is judged against who REMAINS after the delete (kept users), not the
// pre-delete snapshot — otherwise a spec user whose email matched a deleted placeholder
// (e.g. rafid) would be deleted and then wrongly skipped.
const keptEmails = new Set(authUsers.filter((u) => !toDelete.includes(u)).map((u) => (u.email || '').toLowerCase()))
const toCreate = spec.users.filter((u) => !keptEmails.has(emailFor(u.username).toLowerCase()))

if (CREATE_MISSING) console.log(`\n--- MODE: create-missing (no deletes) ---`)
console.log(`\n--- DELETE (${toDelete.length}) --- (keeping ${authUsers.length - toDelete.length})`)
for (const u of toDelete) console.log(`  del  ${u.email}`)

console.log(`\n--- CREATE (${toCreate.length} of ${spec.users.length} spec; ${spec.users.length - toCreate.length} already present) ---`)
for (const u of toCreate) {
  console.log(`  new  ${emailFor(u.username).padEnd(32)}  ${(u.roles.join(' + ') || '(no role)').padEnd(38)}  ${u.divisions.join(', ') || '(no division)'}`)
}

if (!CONFIRM) {
  console.log(`\nDRY-RUN complete — nothing changed.`)
  const flags = CREATE_MISSING ? '--confirm --create-missing' : '--confirm'
  console.log(`To execute:  node docs/users/provision_users.mjs ${flags} --password "Test@123"`)
  process.exit(0)
}

// ---------------- EXECUTE ----------------
if (!PASSWORD) { console.error('ABORT: --confirm requires --password "<pw>"'); process.exit(1) }
if (toDelete.length > 20 && !REPROVISION) {
  console.error(`ABORT: ${toDelete.length} non-admin users already exist (looks already-provisioned).`)
  console.error('If you really mean to wipe + recreate them, re-run with --reprovision.')
  process.exit(1)
}

// DELETE: clear NO-ACTION children first, then delete auth users (cascades user_data + notifications).
const delProfileIds = toDelete.map((u) => profByAuth.get(u.id)?.id).filter(Boolean)
if (delProfileIds.length) {
  const { error: e1 } = await sb.from('user_custom_roles').delete().in('profile_id', delProfileIds)
  if (e1) { console.error(`ABORT clearing user_custom_roles: ${e1.message}`); process.exit(1) }
  const { error: e2 } = await sb.from('user_company_divisions').delete().in('profile_id', delProfileIds)
  if (e2) { console.error(`ABORT clearing user_company_divisions: ${e2.message}`); process.exit(1) }
}
let delOk = 0
for (const u of toDelete) {
  const { error } = await sb.auth.admin.deleteUser(u.id)
  if (error) console.error(`  DEL FAIL ${u.email}: ${error.message}`)
  else delOk++
}
console.log(`\nDeleted ${delOk}/${toDelete.length} non-admin users.`)

// CREATE (only the absent spec users; toCreate already excludes anyone who remains)
let ok = 0, fail = 0
for (const u of toCreate) {
  const email = emailFor(u.username)
  const { data: created, error: cErr } = await sb.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: u.full_name },
  })
  if (cErr || !created?.user) { console.error(`  CREATE FAIL ${email}: ${cErr?.message}`); fail++; continue }
  const authId = created.user.id
  const { data: prof, error: pErr } = await sb.from('user_data').insert({
    auth_user_id: authId, email, full_name: u.full_name, user_type: 'internal',
    is_active: true, must_change_password: true, active_division_id: u.division_ids[0] ?? null,
  }).select('id').single()
  if (pErr || !prof) { console.error(`  PROFILE FAIL ${email}: ${pErr?.message}`); await sb.auth.admin.deleteUser(authId); fail++; continue }
  if (u.role_ids.length) {
    const { error: rErr } = await sb.rpc('replace_user_custom_roles_v2', {
      p_user_id: prof.id, p_assignments: u.role_ids.map((id) => ({ role_id: id, approval_scopes: null })),
    })
    if (rErr) console.error(`  ROLES WARN ${email}: ${rErr.message}`)
  }
  if (u.division_ids.length) {
    const { error: dErr } = await sb.from('user_company_divisions').insert(u.division_ids.map((did) => ({ profile_id: prof.id, division_id: did })))
    if (dErr) console.error(`  DIV WARN ${email}: ${dErr.message}`)
  }
  ok++
  console.log(`  ok   ${email}`)
  await sleep(150) // gentle on the auth admin API
}
console.log(`\nDONE. Created ${ok}, failed ${fail}. Every new user: password set, must_change_password=true (forced reset on first login).`)
