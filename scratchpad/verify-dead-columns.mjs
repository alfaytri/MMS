#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = 'D:/MMS';
const AUDIT_PATH = 'C:/Users/IT/AppData/Local/Temp/claude/D--MMS/ec61aed3-670d-4616-b639-fa48e772c124/scratchpad/schema-audit.json';
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const EDGE_DIR = join(ROOT, 'supabase', 'functions');
const SRC_DIR = join(ROOT, 'src');

const AUDIT_TABLE_PATTERNS = [
  /^activity_log$/, /^audit_log$/, /^notification_trail$/, /^webhook_logs$/,
  /^payment_sessions$/, /^stock_adjustment_approvals$/, /^workflow_approval_steps$/,
  /^receival_edit_requests$/, /^warehouse_manager_log$/, /^notification_queue$/,
  /_log$/, /_logs$/, /_trail$/, /_history$/,
];

function walk(dir, exts) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) out.push(...walk(p, exts));
    else if (exts.some(x => e.endsWith(x))) out.push(p);
  }
  return out;
}

// Load audit
const audit = JSON.parse(readFileSync(AUDIT_PATH, 'utf8'));

// Load migrations
console.log('Loading migrations...');
const migFiles = walk(MIGRATIONS_DIR, ['.sql']);
const migAll = migFiles.map(f => ({ path: f, name: f.split(/[\\/]/).pop(), text: readFileSync(f, 'utf8') }));

// Build combined migration text and per-file
const migCombined = migAll.map(m => m.text).join('\n');

// Extract functions: CREATE (OR REPLACE) FUNCTION public.<name>(...) ... $$ ... $$ (or $body$ ... $body$)
// Use dollar-quoted body detection.
const rpcs = []; // {name, body, file}
{
  for (const m of migAll) {
    const text = m.text;
    // Find all CREATE FUNCTION statements
    const fnRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*\(/gi;
    let match;
    while ((match = fnRegex.exec(text)) !== null) {
      const name = match[1];
      const startIdx = match.index;
      // Find first $tag$ after this position
      const dollarRe = /\$([a-zA-Z_]*)\$/g;
      dollarRe.lastIndex = startIdx;
      const openMatch = dollarRe.exec(text);
      if (!openMatch) continue;
      const tag = openMatch[1];
      const closeIdx = text.indexOf(`$${tag}$`, openMatch.index + openMatch[0].length);
      if (closeIdx === -1) continue;
      const body = text.slice(openMatch.index + openMatch[0].length, closeIdx);
      rpcs.push({ name, body, file: m.name });
    }
  }
}
console.log('RPCs found:', rpcs.length);

// Extract triggers: CREATE TRIGGER ... ON <table> ... EXECUTE (FUNCTION|PROCEDURE) <fn>
const triggers = []; // {name, table, fn, body}
{
  const trigRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+(?:BEFORE|AFTER|INSTEAD\s+OF)[\s\S]*?ON\s+(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?[\s\S]*?EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;
  let m;
  while ((m = trigRegex.exec(migCombined)) !== null) {
    triggers.push({ name: m[1], table: m[2], fn: m[3], stmt: m[0] });
  }
}
console.log('Triggers found:', triggers.length);

// Build map: table -> [trigger fn bodies]
const triggerFnByTable = new Map();
for (const t of triggers) {
  const fnBody = rpcs.find(r => r.name === t.fn);
  if (!triggerFnByTable.has(t.table)) triggerFnByTable.set(t.table, []);
  triggerFnByTable.get(t.table).push({ trigName: t.name, fn: t.fn, body: fnBody?.body || '', stmt: t.stmt });
}

// Load edge functions
console.log('Loading edge functions...');
const edgeFiles = walk(EDGE_DIR, ['.ts', '.js']);
const edgeContents = edgeFiles.map(f => ({ path: relative(ROOT, f).replace(/\\/g, '/'), text: readFileSync(f, 'utf8') }));

// Load src files for select('*')
console.log('Scanning src for select("*") ...');
const srcFiles = walk(SRC_DIR, ['.ts', '.tsx']);
// tableName -> first file where .from('<table>').select('*') appears (approx: file has both .from('table') and .select('*'))
const selectStarByTable = new Map();
// Simpler: for each file, find all .from('X') tables, and check if file also has .select('*') or .select("*")
for (const f of srcFiles) {
  let text;
  try { text = readFileSync(f, 'utf8'); } catch { continue; }
  if (!/\.select\(\s*['"]\*['"]\s*\)/.test(text)) continue;
  const fromRegex = /\.from\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\s*\)/g;
  let m;
  const tablesInFile = new Set();
  while ((m = fromRegex.exec(text)) !== null) tablesInFile.add(m[1]);
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  for (const t of tablesInFile) {
    if (!selectStarByTable.has(t)) selectStarByTable.set(t, rel);
  }
}
console.log('select("*") tables:', selectStarByTable.size);

// Table creation date map: table -> earliest migration filename with CREATE TABLE
const tableCreatedIn = new Map();
{
  for (const m of migAll) {
    const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;
    let mm;
    while ((mm = re.exec(m.text)) !== null) {
      const t = mm[1];
      if (!tableCreatedIn.has(t)) tableCreatedIn.set(t, m.name);
    }
  }
}

// Helpers
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function isAuditLogTable(name) {
  return AUDIT_TABLE_PATTERNS.some(re => re.test(name));
}

function isPendingTable(name) {
  const mig = tableCreatedIn.get(name);
  if (!mig) return false;
  // Filename like 20260701120000_xxx.sql — extract prefix digits
  const m = /^(\d{8})/.exec(mig);
  if (!m) return false;
  return m[1] >= '20260701';
}

// For each RPC, precompute
const rpcMatchers = rpcs.map(r => ({ name: r.name, body: r.body, file: r.file }));

// Verdict evaluator
function verdictFor(tableName, colName) {
  // Skip trivial
  if (['id', 'created_at', 'updated_at', 'deleted_at'].includes(colName)) return null;

  const colRe = new RegExp(`\\b${escapeRe(colName)}\\b`);
  const tableRe = new RegExp(`\\b${escapeRe(tableName)}\\b`);

  // 1) used_in_rpc
  for (const r of rpcMatchers) {
    if (colRe.test(r.body) && tableRe.test(r.body)) {
      return { verdict: 'used_in_rpc', evidence: r.name };
    }
  }

  // 2) used_in_trigger
  const trigs = triggerFnByTable.get(tableName) || [];
  for (const t of trigs) {
    if (colRe.test(t.stmt)) {
      return { verdict: 'used_in_trigger', evidence: t.trigName };
    }
    if (t.body && colRe.test(t.body)) {
      return { verdict: 'used_in_trigger', evidence: `${t.trigName} (via ${t.fn})` };
    }
  }

  // 3) used_in_edge
  for (const ef of edgeContents) {
    if (tableRe.test(ef.text) && colRe.test(ef.text)) {
      return { verdict: 'used_in_edge', evidence: ef.path };
    }
  }

  // 4) select_star_consumer
  if (selectStarByTable.has(tableName)) {
    return { verdict: 'select_star_consumer', evidence: selectStarByTable.get(tableName) };
  }

  // 5) audit_log_table
  if (isAuditLogTable(tableName)) {
    return { verdict: 'audit_log_table', evidence: 'audit/log table pattern' };
  }

  // 6) pending
  if (isPendingTable(tableName)) {
    return { verdict: 'pending', evidence: tableCreatedIn.get(tableName) };
  }

  return { verdict: 'truly_dead', evidence: '' };
}

// Run
console.log('Evaluating...');
const summary = {
  used_in_rpc: 0,
  used_in_trigger: 0,
  used_in_edge: 0,
  select_star_consumer: 0,
  audit_log_table: 0,
  pending: 0,
  truly_dead: 0,
};

const trulyDeadByTable = new Map();

for (const t of audit.tables) {
  for (const c of (t.columns || [])) {
    if (!(c.flags || []).includes('dead')) continue;
    const v = verdictFor(t.name, c.name);
    if (!v) continue;
    c.verdict = v.verdict;
    c.verdict_evidence = v.evidence;
    summary[v.verdict]++;
    if (v.verdict === 'truly_dead') {
      trulyDeadByTable.set(t.name, (trulyDeadByTable.get(t.name) || 0) + 1);
    }
  }
}

audit.verdicts_summary = summary;

writeFileSync(AUDIT_PATH, JSON.stringify(audit, null, 2));

console.log('\nSummary:', JSON.stringify(summary, null, 2));
console.log('\nTop 10 tables by truly_dead columns:');
const top = [...trulyDeadByTable.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
for (const [t, n] of top) console.log(`  ${t}: ${n}`);
