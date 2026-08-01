#!/usr/bin/env node
// Flow Visualizer Phase A — generate docs/flows-visualizer.html from
// docs/flows-registry.md. Standalone; run with `node scripts/build-flows-visualizer.mjs`.
//
// The registry is the source of truth; the HTML is a generated artifact
// that opens in any browser (no server required). Re-run whenever the
// registry changes.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const SRC = path.join(REPO_ROOT, 'docs', 'flows-registry.md')
const OUT = path.join(REPO_ROOT, 'docs', 'flows-visualizer.html')

// ─── Parser ────────────────────────────────────────────────────────────────

const FIELD_ALIASES = {
  'trigger': 'trigger',
  'trigger surface(s)': 'trigger',
  'module': 'module',
  'status': 'status',
  'hook': 'hook',
  'hook(s)': 'hook',
  'hooks': 'hook',
  'primary hook(s)': 'hook',
  'rpc': 'rpc',
  'rpc(s)': 'rpc',
  'rpcs': 'rpc',
  'writes': 'writes',
  'ledger writes': 'writes',
  'ledger_writes': 'writes',
  'downstream side-effects': 'side_effects',
  'side-effects': 'side_effects',
  'side effects': 'side_effects',
  'dialog': 'dialog',
  'dialog / component': 'dialog',
  'guards': 'guards',
  'guards / preconditions': 'guards',
  'related': 'related',
  'related flows': 'related',
  'docs': 'docs',
  'docs / plans': 'docs',
  'notes': 'notes',
  'migrations': 'migrations',
  'historic surface': 'historic_surface',
}

function parseMarkdown(md) {
  // Split into top-level ## sections (keeping the header text).
  const lines = md.split(/\r?\n/)
  const sections = []
  let currentSection = null

  const REGISTRY_HEADERS_TO_SKIP = new Set([
    'business flow registry',
    'why this exists',
    'mandatory rule',
    'entry template',
    'cross-flow patterns',
    'registered placeholders — not yet implemented in code',
  ])

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const h2 = line.match(/^##\s+(.+?)\s*$/)
    if (h2) {
      const title = h2[1].trim()
      if (REGISTRY_HEADERS_TO_SKIP.has(title.toLowerCase())) {
        currentSection = null
        continue
      }
      currentSection = { title, body: [] }
      sections.push(currentSection)
      continue
    }
    if (currentSection) currentSection.body.push(line)
  }

  // Registry section (first ## Registry entry contains all top-level Sales
  // flows using the full template). The flows there are all under "Registry".
  // Compact sections follow: Purchase Orders, PO Shipments, Supplier Bills,
  // etc. Each contains ### Flow entries. We treat every ## header we didn't
  // skip as a section.
  const parsed = []
  for (const sec of sections) {
    const flows = parseFlowsInSection(sec.body.join('\n'), sec.title)
    if (flows.length) parsed.push({ section: sec.title, flows })
  }
  return parsed
}

function parseFlowsInSection(text, sectionTitle) {
  // Split by ### Flow Title lines while remembering position.
  const flows = []
  const re = /^###\s+(.+?)\s*$/gm
  const matches = [...text.matchAll(re)]
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length
    const chunk = text.slice(start, end)
    const titleMatch = chunk.match(/^###\s+(.+?)\s*$/m)
    const title = titleMatch ? titleMatch[1].trim() : 'Untitled'
    const body = chunk.replace(/^###\s+.+\r?\n?/, '')
    const fields = parseFieldBullets(body)
    flows.push({
      title,
      section: sectionTitle,
      fields,
    })
  }
  return flows
}

function parseFieldBullets(body) {
  // Match "- **Label:** value" bullets, allowing value to span until the
  // next "- **" bullet, "---", or blank line followed by end.
  const fields = {}
  const bulletRe = /^-\s+\*\*(.+?)\*\*:?\s*(.*)$/gm
  const matches = [...body.matchAll(bulletRe)]
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    // Registry template writes `- **Field:** value` — the colon is inside
    // the bold. Strip it so the alias map matches.
    const rawLabel = m[1].trim().toLowerCase().replace(/:\s*$/, '')
    const label = FIELD_ALIASES[rawLabel] ?? rawLabel.replace(/[^a-z0-9]+/g, '_')
    const start = m.index + m[0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length
    let value = (m[2] + '\n' + body.slice(start, end)).trim()
    // Trim trailing `---` if it caught the section separator.
    value = value.replace(/\s*\n\s*---\s*$/m, '').trim()
    if (fields[label]) {
      // Merge (e.g. both "Hook:" and "Hooks:" present) → newline-join.
      fields[label] = fields[label] + '\n\n' + value
    } else {
      fields[label] = value
    }
  }
  return fields
}

// ─── Table extraction for the diagram ──────────────────────────────────────

const KNOWN_SUFFIXES = ['_line_items', '_lines', '_movements', '_layers', '_items', '_notes', '_orders', '_returns', '_transfers', '_receivals', '_deliveries', '_dispositions', '_resolutions', '_summary', '_stock', '_allocations', '_categories', '_check_lines', '_containers']

function extractTables(text) {
  if (!text) return []
  const tables = new Set()
  // Match backticked identifiers that look like tables OR table.column pairs.
  // First capture: the table (snake_case, 2+ words). Second capture (optional):
  // ignored — we only want the table part.
  const re = /`([a-z][a-z0-9_]*(?:_[a-z0-9]+){1,})(?:\.[a-z][a-z0-9_]*)?`/g
  const noise = new Set([
    'auth_uid', 'user_data_id', 'char_length', 'security_definer', 'on_delete',
    'on_conflict', 'not_null', 'if_null', 'auth_role', 'source_type',
    'from_warehouse_id', 'to_warehouse_id', 'sub_container_id',
    'brand_variant_id', 'warehouse_transfer_id', 'return_line_disposition_id',
    'created_at', 'updated_at', 'deleted_at', 'is_active', 'is_virtual',
    'security_invoker', 'default_sub_container_id', 'active_division_id',
    'from_sub_container_id', 'to_sub_container_id', 'warehouse_transfer_id',
    'source_return_line_disposition_id', 'source_transfer_id', 'movement_type',
    'transfer_kind', 'resolution_type', 'disposition_type', 'refund_method',
    'refund_reference', 'payment_status', 'credit_note_id', 'debit_note_id',
    'repair_vendor_id', 'expected_return_date', 'dispatched_at', 'received_at',
    'received_by_profile_id', 'restock_warehouse_id', 'exchange_gain',
    'exchange_loss', 'initial_exchange_rate', 'initial_rate_captured_at',
    'initial_rate_captured_by', 'source_currency', 'source_exchange_rate',
    'exchange_rate', 'landed_cost_per_unit', 'unit_cost', 'weighted_unit_cost',
    'total_unit_cost', 'qty_received', 'qty_remaining', 'brand_variant_id',
    'company_id', 'division_id', 'category_id', 'parent_id', 'sub_container_scope_select_r',
    'is_sub_container_visible', 'is_division_visible', 'condition',
    'inventory_remaining_qty', 'customer_remaining', 'inventory_remaining',
  ])
  for (const m of text.matchAll(re)) {
    const name = m[1]
    if (noise.has(name)) continue
    if (name.startsWith('p_') || name.startsWith('v_') || name.startsWith('trg_')) continue
    if (name.startsWith('rpc_') || name.startsWith('_')) continue
    if (name.endsWith('_id') || name.endsWith('_by') || name.endsWith('_at')) continue
    tables.add(name)
  }
  return [...tables].sort()
}

// ─── Reference resolution ──────────────────────────────────────────────────

function slugify(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function resolveWikilinks(html, allFlowSlugs) {
  // Replace [[Flow name]] with anchor links when the target exists.
  return html.replace(/\[\[([^\]]+)\]\]/g, (m, name) => {
    const slug = slugify(name.trim())
    if (allFlowSlugs.has(slug)) {
      return `<a class="wikilink" href="#flow-${slug}">${escapeHtml(name)}</a>`
    }
    return `<span class="wikilink-unresolved" title="No matching flow registered">${escapeHtml(name)}</span>`
  })
}

// ─── HTML rendering ────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Minimal inline markdown: code, links, wikilinks, bold, newlines.
function renderInline(text, allFlowSlugs) {
  let out = escapeHtml(text)
  // Markdown links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, txt, url) => {
    const safeUrl = url.replace(/[&"]/g, s => s === '&' ? '&amp;' : '&quot;')
    return `<a class="mdlink" href="${safeUrl}" target="_blank" rel="noopener">${escapeHtml(txt)}</a>`
  })
  // Inline code
  out = out.replace(/`([^`]+)`/g, (m, c) => `<code>${escapeHtml(c)}</code>`)
  // Bold **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // Wikilinks
  out = resolveWikilinks(out, allFlowSlugs)
  // Newlines → <br>
  out = out.replace(/\n/g, '<br>')
  return out
}

function renderTableHopDiagram(tables) {
  if (tables.length === 0) {
    return '<div class="diagram-empty">No table hops extracted from Writes/Ledger.</div>'
  }
  const chips = tables.map(t => `<span class="table-chip">${escapeHtml(t)}</span>`).join('<span class="arrow">→</span>')
  return `<div class="diagram">${chips}</div>`
}

function renderFlowCard(flow, allFlowSlugs) {
  const slug = slugify(flow.title)
  const f = flow.fields
  const status = (f.status ?? '').toLowerCase()
  const statusClass = status.includes('deprecated') || status.includes('dropped') ? 'status-deprecated'
    : status.includes('planned') ? 'status-planned'
    : 'status-active'

  const writes = f.writes ?? ''
  const sideEffects = f.side_effects ?? ''
  const tables = extractTables(writes + '\n' + sideEffects)

  const FIELD_ORDER = [
    ['module', 'Module'],
    ['status', 'Status'],
    ['trigger', 'Trigger surface(s)'],
    ['hook', 'Hook(s)'],
    ['rpc', 'RPC(s)'],
    ['writes', 'Ledger writes / side-effects on write'],
    ['side_effects', 'Downstream side-effects'],
    ['dialog', 'Dialog / component'],
    ['guards', 'Guards / preconditions'],
    ['related', 'Related flows'],
    ['docs', 'Docs / plans'],
    ['migrations', 'Migrations'],
    ['notes', 'Notes'],
    ['historic_surface', 'Historic surface'],
  ]

  const fieldRows = FIELD_ORDER
    .filter(([key]) => f[key])
    .map(([key, label]) => `
      <div class="field">
        <div class="field-label">${label}</div>
        <div class="field-value">${renderInline(f[key], allFlowSlugs)}</div>
      </div>`)
    .join('')

  // Any un-recognised fields — surface them so parser drift is visible.
  const shown = new Set(FIELD_ORDER.map(([k]) => k))
  const extras = Object.entries(f).filter(([k]) => !shown.has(k))
  const extraRows = extras.map(([key, val]) => `
    <div class="field field-extra">
      <div class="field-label">${escapeHtml(key)}</div>
      <div class="field-value">${renderInline(val, allFlowSlugs)}</div>
    </div>`).join('')

  return `
    <article id="flow-${slug}" class="flow-card" data-section="${escapeHtml(flow.section)}" data-title="${escapeHtml(flow.title.toLowerCase())}">
      <header class="flow-header">
        <div class="flow-title-row">
          <h3 class="flow-title">${escapeHtml(flow.title)}</h3>
          <span class="badge ${statusClass}">${escapeHtml(f.status ?? 'Active')}</span>
        </div>
        <div class="flow-section">${escapeHtml(flow.section)}</div>
      </header>
      <div class="flow-diagram-row">
        <div class="diagram-label">Table hops</div>
        ${renderTableHopDiagram(tables)}
      </div>
      <div class="flow-body">
        ${fieldRows}
        ${extraRows}
      </div>
    </article>`
}

function render(parsed) {
  // Collect all flow slugs so wikilinks can resolve.
  const allFlowSlugs = new Set()
  for (const sec of parsed) {
    for (const flow of sec.flows) allFlowSlugs.add(slugify(flow.title))
  }

  const totalFlows = parsed.reduce((s, sec) => s + sec.flows.length, 0)

  const nav = parsed.map(sec => {
    const links = sec.flows.map(f => `
      <li><a href="#flow-${slugify(f.title)}" data-slug="${slugify(f.title)}">${escapeHtml(f.title)}</a></li>
    `).join('')
    return `
      <section class="nav-section">
        <div class="nav-section-title">${escapeHtml(sec.section)} <span class="nav-count">${sec.flows.length}</span></div>
        <ul>${links}</ul>
      </section>`
  }).join('')

  const cards = parsed.map(sec => `
    <section class="section" id="section-${slugify(sec.section)}">
      <h2 class="section-heading">${escapeHtml(sec.section)}</h2>
      ${sec.flows.map(f => renderFlowCard(f, allFlowSlugs)).join('')}
    </section>
  `).join('')

  const moduleChips = parsed.map(sec => `
    <button class="chip" data-filter-section="${escapeHtml(sec.section)}">${escapeHtml(sec.section)} <span class="chip-count">${sec.flows.length}</span></button>
  `).join('')

  const generated = new Date().toISOString().slice(0, 10)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MMS Business Flows — Visualizer</title>
<style>
  :root {
    --bg: #f8fafc;
    --surface: #ffffff;
    --border: #e2e8f0;
    --text: #0f172a;
    --text-muted: #64748b;
    --primary: #f97316;
    --primary-tint: #fff7ed;
    --secondary: #3b82f6;
    --success: #22c55e;
    --warning: #eab308;
    --destructive: #ef4444;
    --code-bg: #f1f5f9;
    --shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f172a;
      --surface: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary-tint: #7c2d12;
      --code-bg: #0f172a;
      --shadow: 0 1px 3px rgba(0,0,0,0.3);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    background: var(--bg);
    color: var(--text);
    font-size: 14px;
    line-height: 1.5;
  }
  a { color: var(--secondary); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code {
    background: var(--code-bg);
    padding: 1px 5px;
    border-radius: 3px;
    font-family: ui-monospace, 'SF Mono', Consolas, monospace;
    font-size: 12px;
    color: var(--text);
  }

  .top {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .brand { font-weight: 700; font-size: 16px; color: var(--primary); }
  .brand-sub { font-size: 12px; color: var(--text-muted); font-weight: 400; }
  .search {
    flex: 1;
    min-width: 200px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    font-size: 13px;
  }
  .search:focus { outline: 2px solid var(--primary); outline-offset: -1px; border-color: var(--primary); }
  .meta { font-size: 11px; color: var(--text-muted); }

  .chips {
    display: flex;
    gap: 6px;
    padding: 8px 20px;
    overflow-x: auto;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .chip {
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg);
    color: var(--text);
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }
  .chip.active { background: var(--primary); color: white; border-color: var(--primary); }
  .chip-count {
    display: inline-block;
    padding: 0 4px;
    margin-left: 4px;
    background: rgba(0,0,0,0.08);
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
  }
  .chip.active .chip-count { background: rgba(255,255,255,0.25); }

  .layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    max-width: 1400px;
    margin: 0 auto;
  }
  @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } .nav { display: none; } }

  .nav {
    position: sticky;
    top: 105px;
    align-self: start;
    max-height: calc(100vh - 120px);
    overflow-y: auto;
    padding: 20px 16px;
    border-right: 1px solid var(--border);
  }
  .nav-section { margin-bottom: 18px; }
  .nav-section-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin-bottom: 6px;
  }
  .nav-count {
    display: inline-block;
    padding: 0 4px;
    background: var(--code-bg);
    border-radius: 3px;
    font-weight: 600;
    font-size: 10px;
    margin-left: 2px;
  }
  .nav ul { list-style: none; padding: 0; margin: 0; }
  .nav li a {
    display: block;
    padding: 4px 8px;
    border-radius: 4px;
    color: var(--text);
    font-size: 12px;
    line-height: 1.35;
  }
  .nav li a:hover { background: var(--code-bg); text-decoration: none; }

  .main { padding: 20px 24px 60px; }

  .section { margin-bottom: 32px; }
  .section-heading {
    font-size: 18px;
    font-weight: 700;
    margin: 20px 0 12px;
    padding-bottom: 6px;
    border-bottom: 2px solid var(--primary);
    display: inline-block;
  }

  .flow-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px 18px;
    margin-bottom: 14px;
    box-shadow: var(--shadow);
  }
  .flow-header { margin-bottom: 12px; }
  .flow-title-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .flow-title { margin: 0; font-size: 15px; font-weight: 700; }
  .flow-section { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
  .badge {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 999px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .status-active { background: rgba(34,197,94,0.15); color: var(--success); }
  .status-deprecated { background: rgba(239,68,68,0.15); color: var(--destructive); }
  .status-planned { background: rgba(234,179,8,0.15); color: var(--warning); }

  .flow-diagram-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: var(--primary-tint);
    border: 1px dashed var(--primary);
    border-radius: 6px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .diagram-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--primary);
    white-space: nowrap;
  }
  .diagram { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .diagram-empty { font-size: 11px; color: var(--text-muted); font-style: italic; }
  .table-chip {
    font-family: ui-monospace, 'SF Mono', Consolas, monospace;
    font-size: 11px;
    padding: 3px 8px;
    background: var(--surface);
    border: 1px solid var(--primary);
    border-radius: 4px;
    color: var(--text);
    white-space: nowrap;
  }
  .arrow { color: var(--primary); font-weight: 700; font-size: 12px; }

  .flow-body {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .field {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 12px;
    padding: 6px 0;
    border-top: 1px solid var(--border);
  }
  @media (max-width: 700px) { .field { grid-template-columns: 1fr; } }
  .field-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    padding-top: 2px;
  }
  .field-value { font-size: 13px; line-height: 1.6; color: var(--text); }
  .field-value code { font-size: 11.5px; }
  .field-extra .field-label { color: var(--destructive); }

  .wikilink {
    color: var(--primary);
    border-bottom: 1px dashed var(--primary);
    font-weight: 500;
  }
  .wikilink:hover { text-decoration: none; background: var(--primary-tint); }
  .wikilink-unresolved {
    color: var(--text-muted);
    border-bottom: 1px dotted var(--text-muted);
    cursor: help;
  }
  .mdlink { color: var(--secondary); }

  .hidden { display: none !important; }
  .empty-state {
    padding: 60px 20px;
    text-align: center;
    color: var(--text-muted);
  }
</style>
</head>
<body>
<div class="top">
  <div class="brand">MMS Flows <span class="brand-sub">generated ${generated} · ${totalFlows} flows</span></div>
  <input class="search" id="search" placeholder="Search flow name, table, hook…" autocomplete="off">
</div>
<div class="chips" id="chips">
  <button class="chip active" data-filter-section="__all__">All <span class="chip-count">${totalFlows}</span></button>
  ${moduleChips}
</div>
<div class="layout">
  <aside class="nav" id="nav">
    ${nav}
  </aside>
  <main class="main" id="main">
    ${cards}
    <div class="empty-state hidden" id="empty">No flows match your search.</div>
  </main>
</div>
<script>
(function() {
  const search = document.getElementById('search')
  const main   = document.getElementById('main')
  const empty  = document.getElementById('empty')
  const chips  = document.getElementById('chips')
  const nav    = document.getElementById('nav')
  const cards  = Array.from(main.querySelectorAll('.flow-card'))

  let activeSection = '__all__'

  function apply() {
    const q = search.value.trim().toLowerCase()
    let visible = 0
    for (const card of cards) {
      const sec = card.dataset.section
      const title = card.dataset.title
      const body = card.innerText.toLowerCase()
      const sectionMatch = activeSection === '__all__' || sec === activeSection
      const searchMatch = !q || title.includes(q) || body.includes(q)
      const show = sectionMatch && searchMatch
      card.classList.toggle('hidden', !show)
      if (show) visible++
    }
    // Hide empty section wrappers too
    for (const section of main.querySelectorAll('.section')) {
      const any = section.querySelector('.flow-card:not(.hidden)')
      section.classList.toggle('hidden', !any)
    }
    // Nav: hide entries without visible cards
    for (const li of nav.querySelectorAll('li a')) {
      const slug = li.dataset.slug
      const card = document.getElementById('flow-' + slug)
      li.parentElement.classList.toggle('hidden', card ? card.classList.contains('hidden') : true)
    }
    for (const s of nav.querySelectorAll('.nav-section')) {
      const anyLi = s.querySelector('li:not(.hidden)')
      s.classList.toggle('hidden', !anyLi)
    }
    empty.classList.toggle('hidden', visible !== 0)
  }

  search.addEventListener('input', apply)
  chips.addEventListener('click', e => {
    const btn = e.target.closest('.chip')
    if (!btn) return
    activeSection = btn.dataset.filterSection
    for (const c of chips.querySelectorAll('.chip')) c.classList.toggle('active', c === btn)
    apply()
  })

  // Deep-link support: #flow-xxx opens with search cleared + all sections
  if (location.hash) {
    const el = document.querySelector(location.hash)
    if (el) setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }), 100)
  }
})()
</script>
</body>
</html>
`
}

// ─── Main ──────────────────────────────────────────────────────────────────

const md = fs.readFileSync(SRC, 'utf8')
const parsed = parseMarkdown(md)
const html = render(parsed)
fs.writeFileSync(OUT, html, 'utf8')

const totalFlows = parsed.reduce((s, sec) => s + sec.flows.length, 0)
console.log(`Wrote ${OUT}`)
console.log(`  ${parsed.length} sections, ${totalFlows} flows`)
for (const sec of parsed) console.log(`    ${sec.section} — ${sec.flows.length} flows`)
