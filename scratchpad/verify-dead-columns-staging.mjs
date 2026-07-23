#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:/MMS';
const JSON_PATH = 'C:/Users/IT/AppData/Local/Temp/claude/D--MMS/ec61aed3-670d-4616-b639-fa48e772c124/scratchpad/schema-audit.json';
const MIG_DIR = path.join(ROOT, 'supabase/migrations-staging');
const FUNC_DIR = path.join(ROOT, 'supabase/functions');
const SRC_DIR = path.join(ROOT, 'src');

function walk(dir, exts) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (exts.some((x) => p.toLowerCase().endsWith(x))) out.push(p);
    }
  }
  return out;
}

const migFiles = walk(MIG_DIR, ['.sql']);
const funcFiles = walk(FUNC_DIR, ['.ts', '.js']);
const srcFiles = walk(SRC_DIR, ['.ts', '.tsx']);

// Concatenate migration content
const migContent = migFiles.map((f) => ({ file: f, text: fs.readFileSync(f, 'utf8') }));

// Extract RPC bodies: CREATE (OR REPLACE) FUNCTION public.<name> ... $$ ... $$
const rpcBodies = []; // {name, body}
const funcRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\([^)]*\)[\s\S]*?\$([a-zA-Z0-9_]*)\$([\s\S]*?)\$\2\$/gi;
for (const { text } of migContent) {
  let m;
  while ((m = funcRe.exec(text)) !== null) {
    rpcBodies.push({ name: m[1], body: m[3] });
  }
}

// Extract triggers: CREATE TRIGGER ... ON <schema.>?<table> ... EXECUTE (PROCEDURE|FUNCTION) <fn>
const triggers = []; // {table, fn}
const trigRe = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+[a-zA-Z0-9_"]+\s+(?:BEFORE|AFTER|INSTEAD\s+OF)[\s\S]*?ON\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?[\s\S]*?EXECUTE\s+(?:PROCEDURE|FUNCTION)\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
for (const { text } of migContent) {
  let m;
  while ((m = trigRe.exec(text)) !== null) {
    triggers.push({ table: m[1], fn: m[2] });
  }
}

// Map trigger functions to their bodies
const rpcByName = new Map();
for (const r of rpcBodies) {
  if (!rpcByName.has(r.name)) rpcByName.set(r.name, []);
  rpcByName.get(r.name).push(r.body);
}

// Edge functions content
const edgeContent = funcFiles.map((f) => ({ file: f, text: fs.readFileSync(f, 'utf8') }));

// Src files scan for select('*') per table + select("*")
const srcContent = srcFiles.map((f) => ({ file: f, text: fs.readFileSync(f, 'utf8') }));

// Determine tables using select('*'): find .from('<table>') patterns adjacent to select('*')
// Simpler: for each src file, extract tables referenced via .from('X') and check if file has .select('*')
const selectStarTables = new Set();
for (const { text } of srcContent) {
  if (!/\.select\(\s*['"`]\*['"`]\s*\)/.test(text)) continue;
  const fromRe = /\.from\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g;
  let m;
  while ((m = fromRe.exec(text)) !== null) selectStarTables.add(m[1]);
}

// Also map: table -> first src file that uses select('*') on it
const selectStarEvidence = new Map();
for (const { file, text } of srcContent) {
  if (!/\.select\(\s*['"`]\*['"`]\s*\)/.test(text)) continue;
  const fromRe = /\.from\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g;
  let m;
  while ((m = fromRe.exec(text)) !== null) {
    if (!selectStarEvidence.has(m[1])) {
      selectStarEvidence.set(m[1], path.relative(ROOT, file).replace(/\\/g, '/'));
    }
  }
}

// Audit log patterns
const AUDIT_TABLES = new Set([
  'activity_log', 'audit_log', 'notification_trail', 'webhook_logs',
  'payment_sessions', 'stock_adjustment_approvals', 'workflow_approval_steps',
  'receival_edit_requests', 'warehouse_manager_log', 'notification_queue'
]);
function isAuditTable(t) {
  if (AUDIT_TABLES.has(t)) return true;
  return /(_log|_logs|_trail|_history)$/.test(t);
}

// Pending: CREATE TABLE dated 20260701+ in staging migrations
const pendingTables = new Set();
for (const { file, text } of migContent) {
  const base = path.basename(file);
  const dateMatch = base.match(/^(\d{8})/);
  if (!dateMatch) continue;
  const date = parseInt(dateMatch[1], 10);
  if (date < 20260701) continue;
  const ctRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-zA-Z0-9_]+)"?/gi;
  let m;
  while ((m = ctRe.exec(text)) !== null) pendingTables.add(m[1]);
}

// Helpers
function usedInRpc(table, col) {
  const colRe = new RegExp(`\\b${col}\\b`);
  const tblRe = new RegExp(`\\b${table}\\b`);
  for (const r of rpcBodies) {
    if (colRe.test(r.body) && tblRe.test(r.body)) return r.name;
  }
  return null;
}

function usedInTrigger(table, col) {
  const colRe = new RegExp(`\\b${col}\\b`);
  const tblRe = new RegExp(`\\b${table}\\b`);
  // Direct: trigger on this table AND function body references col
  for (const t of triggers) {
    const bodies = rpcByName.get(t.fn) || [];
    for (const b of bodies) {
      if (colRe.test(b)) {
        if (t.table === table || tblRe.test(b)) return `trigger:${t.fn} on ${t.table}`;
      }
    }
  }
  return null;
}

function usedInEdge(table, col) {
  const colRe = new RegExp(`\\b${col}\\b`);
  const tblRe = new RegExp(`\\b${table}\\b`);
  for (const { file, text } of edgeContent) {
    if (tblRe.test(text) && colRe.test(text)) return path.relative(ROOT, file).replace(/\\/g, '/');
  }
  return null;
}

// Load JSON
const audit = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));

const counts = {
  used_in_rpc: 0, used_in_trigger: 0, used_in_edge: 0,
  select_star_consumer: 0, audit_log_table: 0, pending: 0, truly_dead: 0
};

let deadCount = 0;
for (const tbl of audit.tables) {
  const tableName = tbl.name;
  for (const col of tbl.columns) {
    if (!col.flags || !col.flags.includes('dead')) continue;
    deadCount++;
    const colName = col.name;

    let verdict = null, evidence = null;

    const rpc = usedInRpc(tableName, colName);
    if (rpc) { verdict = 'used_in_rpc'; evidence = `rpc:${rpc}`; }

    if (!verdict) {
      const tr = usedInTrigger(tableName, colName);
      if (tr) { verdict = 'used_in_trigger'; evidence = tr; }
    }
    if (!verdict) {
      const ed = usedInEdge(tableName, colName);
      if (ed) { verdict = 'used_in_edge'; evidence = ed; }
    }
    if (!verdict && selectStarTables.has(tableName)) {
      verdict = 'select_star_consumer';
      evidence = selectStarEvidence.get(tableName) || 'src/**';
    }
    if (!verdict && isAuditTable(tableName)) {
      verdict = 'audit_log_table';
      evidence = `pattern:${tableName}`;
    }
    if (!verdict && pendingTables.has(tableName)) {
      verdict = 'pending';
      evidence = `staging migration >=20260701 CREATE TABLE ${tableName}`;
    }
    if (!verdict) {
      verdict = 'truly_dead';
      evidence = null;
    }

    col.verdict = verdict;
    col.verdict_evidence = evidence;
    counts[verdict]++;
  }
}

audit.verdicts_summary = counts;
audit.verifier_meta = {
  sources: ['supabase/migrations-staging/', 'supabase/functions/', 'src/'],
  rpc_bodies_scanned: rpcBodies.length,
  triggers_scanned: triggers.length,
  select_star_tables: selectStarTables.size,
  staging_only: true
};

fs.writeFileSync(JSON_PATH, JSON.stringify(audit, null, 2));

// Report
console.log('Dead columns processed:', deadCount);
console.log('Counts:', counts);

// Top 10 tables by truly_dead
const tally = [];
for (const tbl of audit.tables) {
  const n = tbl.columns.filter((c) => c.verdict === 'truly_dead').length;
  if (n > 0) tally.push([tbl.name, n]);
}
tally.sort((a, b) => b[1] - a[1]);
console.log('Top 10 truly_dead:');
for (const [t, n] of tally.slice(0, 10)) console.log(' ', t, n);

console.log('rpc_bodies:', rpcBodies.length, 'triggers:', triggers.length, 'select_star_tables:', selectStarTables.size);
