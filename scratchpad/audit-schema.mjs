#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = 'D:/MMS';
const MIG_DIR = path.join(ROOT, 'supabase/migrations-staging');
const SRC_DIR = path.join(ROOT, 'src');
const OUT = 'C:/Users/IT/AppData/Local/Temp/claude/D--MMS/ec61aed3-670d-4616-b639-fa48e772c124/scratchpad/schema-audit.json';

// ---------- SQL Parsing ----------
function stripCommentsAndFunctionBodies(sql) {
  // remove -- line comments
  sql = sql.replace(/--[^\n]*/g, '');
  // remove /* */ comments
  sql = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  // remove $$...$$ function bodies (also $tag$...$tag$)
  sql = sql.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, ' ');
  return sql;
}

// split top-level statements by semicolon, respecting parentheses & quotes
function splitStatements(sql) {
  const stmts = [];
  let cur = '';
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (inSingle) {
      cur += c;
      if (c === "'" && sql[i+1] === "'") { cur += sql[++i]; continue; }
      if (c === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      cur += c;
      if (c === '"') inDouble = false;
      continue;
    }
    if (c === "'") { inSingle = true; cur += c; continue; }
    if (c === '"') { inDouble = true; cur += c; continue; }
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ';' && depth === 0) {
      if (cur.trim()) stmts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) stmts.push(cur.trim());
  return stmts;
}

function splitTopLevelCommas(s) {
  const parts = [];
  let cur = '';
  let depth = 0;
  let inS = false, inD = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inS) { cur += c; if (c === "'") inS = false; continue; }
    if (inD) { cur += c; if (c === '"') inD = false; continue; }
    if (c === "'") { inS = true; cur += c; continue; }
    if (c === '"') { inD = true; cur += c; continue; }
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) { parts.push(cur.trim()); cur=''; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

const tables = {}; // name -> {columns: [{name,type,nullable,default,fk}], }
const enums = {};
const views = [];
const parseErrors = [];

function stripQuotes(s) { return s.replace(/^"(.*)"$/, '$1'); }
function normName(s) {
  s = s.trim();
  s = s.replace(/^public\./i, '');
  return stripQuotes(s);
}

function parseColumnDef(line) {
  // line is a single column definition
  // format: name TYPE [modifiers...] [REFERENCES public.tab(col)]
  const m = line.match(/^\s*("?[A-Za-z_][A-Za-z0-9_]*"?)\s+([A-Za-z][A-Za-z0-9_ ]*(?:\([^)]*\))?(?:\s*\[\])?)/);
  if (!m) return null;
  const name = stripQuotes(m[1]);
  let type = m[2].trim().toLowerCase();
  const rest = line.slice(m[0].length);
  const upper = rest.toUpperCase();
  const nullable = !/NOT\s+NULL/i.test(rest);
  let def = null;
  const dm = rest.match(/DEFAULT\s+([^,]+?)(?:\s+(?:NOT\s+NULL|NULL|REFERENCES|CHECK|UNIQUE|PRIMARY|GENERATED|COLLATE)\b|$)/i);
  if (dm) def = dm[1].trim();
  let fk = null;
  const rm = rest.match(/REFERENCES\s+(?:public\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)\s*(?:\(\s*("?[A-Za-z_][A-Za-z0-9_]*"?)\s*\))?/i);
  if (rm) fk = { table: stripQuotes(rm[1]), column: rm[2] ? stripQuotes(rm[2]) : 'id' };
  return { name, type, nullable, default: def, fk };
}

function processStatement(stmt) {
  const s = stmt.replace(/\s+/g, ' ').trim();
  const su = s.toUpperCase();

  // CREATE TYPE ... AS ENUM
  let m = s.match(/^CREATE\s+TYPE\s+(?:public\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)\s+AS\s+ENUM\s*\(([^)]*)\)/i);
  if (m) {
    const name = stripQuotes(m[1]);
    const vals = m[2].split(',').map(v => v.trim().replace(/^'|'$/g, ''));
    enums[name] = vals;
    return;
  }

  m = s.match(/^DROP\s+TYPE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)/i);
  if (m) { delete enums[stripQuotes(m[1])]; return; }

  // CREATE TABLE
  m = stmt.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)\s*\(([\s\S]*)\)\s*$/i);
  if (m) {
    const name = stripQuotes(m[1]);
    const body = m[2];
    const parts = splitTopLevelCommas(body);
    const cols = [];
    for (const p of parts) {
      const pt = p.trim();
      const uu = pt.toUpperCase();
      if (uu.startsWith('CONSTRAINT') || uu.startsWith('PRIMARY KEY') || uu.startsWith('UNIQUE') || uu.startsWith('CHECK') || uu.startsWith('EXCLUDE') || uu.startsWith('LIKE')) {
        // table-level FK?
        const fkm = pt.match(/FOREIGN\s+KEY\s*\(\s*("?[A-Za-z_][A-Za-z0-9_]*"?)\s*\)\s*REFERENCES\s+(?:public\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)\s*(?:\(\s*("?[A-Za-z_][A-Za-z0-9_]*"?)\s*\))?/i);
        if (fkm) {
          const colName = stripQuotes(fkm[1]);
          const c = cols.find(x => x.name === colName);
          if (c && !c.fk) c.fk = { table: stripQuotes(fkm[2]), column: fkm[3] ? stripQuotes(fkm[3]) : 'id' };
        }
        continue;
      }
      const cd = parseColumnDef(pt);
      if (cd) cols.push(cd);
    }
    tables[name] = { columns: cols };
    return;
  }

  m = s.match(/^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)/i);
  if (m) { delete tables[stripQuotes(m[1])]; return; }

  // ALTER TABLE ... ADD/DROP/RENAME COLUMN (may have multiple actions)
  m = s.match(/^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)\s+(.*)$/i);
  if (m) {
    const tname = stripQuotes(m[1]);
    const rest = m[2];
    if (!tables[tname]) tables[tname] = { columns: [] };
    // split actions by top-level comma
    const actions = splitTopLevelCommas(rest);
    for (const a of actions) {
      let am;
      am = a.match(/^ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?("?[A-Za-z_][A-Za-z0-9_]*"?)\s+([A-Za-z][\s\S]*)$/i);
      if (am) {
        const colDef = stripQuotes(am[1]) + ' ' + am[2];
        const cd = parseColumnDef(colDef);
        if (cd && !tables[tname].columns.find(c => c.name === cd.name)) tables[tname].columns.push(cd);
        continue;
      }
      am = a.match(/^DROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?("?[A-Za-z_][A-Za-z0-9_]*"?)/i);
      if (am) {
        const cn = stripQuotes(am[1]);
        tables[tname].columns = tables[tname].columns.filter(c => c.name !== cn);
        continue;
      }
      am = a.match(/^RENAME\s+(?:COLUMN\s+)?("?[A-Za-z_][A-Za-z0-9_]*"?)\s+TO\s+("?[A-Za-z_][A-Za-z0-9_]*"?)/i);
      if (am) {
        const oldN = stripQuotes(am[1]), newN = stripQuotes(am[2]);
        const c = tables[tname].columns.find(c => c.name === oldN);
        if (c) c.name = newN;
        continue;
      }
      am = a.match(/^ADD\s+CONSTRAINT\s+\S+\s+FOREIGN\s+KEY\s*\(\s*("?[A-Za-z_][A-Za-z0-9_]*"?)\s*\)\s*REFERENCES\s+(?:public\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)\s*(?:\(\s*("?[A-Za-z_][A-Za-z0-9_]*"?)\s*\))?/i);
      if (am) {
        const cn = stripQuotes(am[1]);
        const c = tables[tname].columns.find(c => c.name === cn);
        if (c) c.fk = { table: stripQuotes(am[2]), column: am[3] ? stripQuotes(am[3]) : 'id' };
        continue;
      }
    }
    return;
  }

  // CREATE VIEW / CREATE OR REPLACE VIEW / MATERIALIZED
  m = stmt.match(/^CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)\s+AS\s+([\s\S]+)$/i);
  if (m) {
    const name = stripQuotes(m[1]);
    const body = m[2].trim().slice(0, 500);
    const existing = views.findIndex(v => v.name === name);
    const rec = { name, sql_snippet: body };
    if (existing >= 0) views[existing] = rec; else views.push(rec);
    return;
  }
  m = s.match(/^DROP\s+(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+EXISTS\s+)?(?:public\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)/i);
  if (m) {
    const n = stripQuotes(m[1]);
    const i = views.findIndex(v => v.name === n);
    if (i >= 0) views.splice(i, 1);
    return;
  }
}

const migFiles = fs.readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort();
for (const f of migFiles) {
  try {
    const full = path.join(MIG_DIR, f);
    let sql = fs.readFileSync(full, 'utf8');
    sql = stripCommentsAndFunctionBodies(sql);
    const stmts = splitStatements(sql);
    for (const st of stmts) {
      try { processStatement(st); } catch (e) { /* per-stmt skip */ }
    }
  } catch (e) {
    parseErrors.push({ file: f, error: String(e.message || e) });
  }
}

// ---------- Code Usage ----------
function walk(dir, out = []) {
  const ents = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === 'dist' || e.name === 'build') continue;
      walk(p, out);
    } else {
      if (/\.(ts|tsx|js|jsx)$/.test(e.name)) {
        // skip generated types file
        if (p.endsWith(path.join('src','types','database.types.ts'))) continue;
        out.push(p);
      }
    }
  }
  return out;
}

const srcFiles = walk(SRC_DIR);
// Read all files into memory once (with lines)
const fileCache = {};
for (const f of srcFiles) {
  try {
    const c = fs.readFileSync(f, 'utf8');
    fileCache[f] = { content: c, lines: c.split('\n') };
  } catch {}
}

function relPath(f) {
  return f.substring(ROOT.length + 1).replace(/\\/g, '/');
}

const tableNames = Object.keys(tables);
// Build regex per table for word-boundary or quoted
function findFilesForTable(tname) {
  const re = new RegExp(`(?:['"\`]${tname}['"\`]|\\b${tname}\\b)`);
  const out = [];
  for (const f of srcFiles) {
    const fc = fileCache[f];
    if (!fc) continue;
    if (re.test(fc.content)) out.push(f);
  }
  return out;
}

const tableFiles = {}; // tname -> [absPath...]
for (const t of tableNames) {
  tableFiles[t] = findFilesForTable(t);
}

// Column refs (within table's files)
const BOILERPLATE = new Set(['id','created_at','updated_at','deleted_at']);
let REF_CAP = 50;

function collectColumnRefs(tname, colName, cap) {
  const files = tableFiles[tname] || [];
  const refs = [];
  let total = 0;
  const re = new RegExp(`\\b${colName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  for (const f of files) {
    const fc = fileCache[f];
    if (!fc) continue;
    for (let i = 0; i < fc.lines.length; i++) {
      if (re.test(fc.lines[i])) {
        total++;
        if (refs.length < cap) refs.push({ file: relPath(f), line: i + 1 });
      }
    }
  }
  return { refs, total };
}

// Module grouping heuristic
function moduleFor(name) {
  const n = name.toLowerCase();
  if (n.includes('invoice')) return 'invoices';
  if (n.includes('bill')) return 'bills';
  if (n.includes('payment')) return 'payments';
  if (/\bsale_|\bso_|quotation/.test(n) || n.startsWith('sales') || n.startsWith('sale_') || n.startsWith('so_')) return 'sales';
  if (n.startsWith('warehouse_transfer') || n.startsWith('warehouse_stock')) return 'warehouse';
  if (/purchase|^po_|receival/.test(n)) return 'purchase';
  if (n.startsWith('inventory_') || n.includes('brand_variant') || n.includes('fifo') || n.includes('landed')) return 'inventory';
  if (n.startsWith('supplier')) return 'suppliers';
  if (n.startsWith('customer_') || n === 'customers' || n.includes('credit_group')) return 'customers';
  if (n.includes('contract') || n.includes('subscription')) return 'contracts';
  if (n.includes('service')) return 'services';
  if (n === 'profiles' || n.includes('custom_role') || n.startsWith('user_')) return 'users_rbac';
  if (n.includes('activity') || n.includes('audit') || n.includes('webhook_log')) return 'activity';
  if (n.startsWith('company_') || n === 'country_codes' || n === 'currencies') return 'config';
  return 'misc';
}

function buildFlags(tname, col, tableCols) {
  const flags = [];
  if (col.refs === 0 && !BOILERPLATE.has(col.name)) flags.push('dead');
  // denormalized: <entity>_name or _label with sibling <entity>_id FK
  const m = col.name.match(/^(.+)_(name|label)$/);
  if (m) {
    const sibling = tableCols.find(c => c.name === m[1] + '_id' && c.fk);
    if (sibling) flags.push('denormalized');
  }
  // dual_text_and_id
  if (/^(text|varchar|character varying|char)/i.test(col.type)) {
    const sib = tableCols.find(c => c.name === col.name + '_id' && /uuid/i.test(c.type));
    if (sib) flags.push('dual_text_and_id');
  }
  // deprecated_id_col: name ends _id but type is text/varchar
  if (/_id$/.test(col.name) && /^(text|varchar|character varying|char)/i.test(col.type)) {
    flags.push('deprecated_id_col');
  }
  return flags;
}

function buildOutput(cap) {
  const outTables = [];
  let totalCols = 0, totalDead = 0, totalRedundant = 0;
  for (const tname of tableNames.sort()) {
    const t = tables[tname];
    const files = (tableFiles[tname] || []).map(relPath);
    const cols = [];
    for (const c of t.columns) {
      const { refs, total } = collectColumnRefs(tname, c.name, cap);
      const colObj = {
        name: c.name,
        type: c.type,
        nullable: c.nullable,
        default: c.default,
        fk: c.fk,
        refs,
        ref_count: total,
        truncated: total > cap,
      };
      // temp store total for flag calc
      colObj._refs_total = total;
      cols.push(colObj);
      totalCols++;
    }
    for (const c of cols) {
      const flagCol = { name: c.name, type: c.type, fk: c.fk, refs: c._refs_total };
      c.flags = buildFlags(tname, flagCol, cols.map(x => ({ name: x.name, type: x.type, fk: x.fk })));
      if (c.flags.includes('dead')) totalDead++;
      if (c.flags.some(f => f !== 'dead')) totalRedundant++;
      delete c._refs_total;
    }
    outTables.push({
      name: tname,
      module: moduleFor(tname),
      file_count: files.length,
      files,
      columns: cols,
    });
  }
  return {
    generated_at: new Date().toISOString().slice(0, 10),
    totals: {
      tables: outTables.length,
      columns: totalCols,
      dead: totalDead,
      redundant: totalRedundant,
      views: views.length,
      enums: Object.keys(enums).length,
    },
    enums,
    tables: outTables,
    views,
    parse_errors: parseErrors,
  };
}

let out = buildOutput(REF_CAP);
let json = JSON.stringify(out);
if (json.length > 30 * 1024 * 1024) {
  REF_CAP = 20;
  out = buildOutput(REF_CAP);
  json = JSON.stringify(out);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

const size = fs.statSync(OUT).size;

// Report
const byDead = out.tables.map(t => ({ n: t.name, d: t.columns.filter(c => c.flags.includes('dead')).length })).sort((a,b) => b.d - a.d).slice(0, 10);
const byFlagged = out.tables.map(t => ({ n: t.name, f: t.columns.reduce((s,c) => s + c.flags.length, 0) })).sort((a,b) => b.f - a.f).slice(0, 10);

console.log('OUT:', OUT);
console.log('SIZE:', size, 'REF_CAP:', REF_CAP);
console.log('TOTALS:', JSON.stringify(out.totals));
console.log('TOP_DEAD:', JSON.stringify(byDead));
console.log('TOP_FLAGGED:', JSON.stringify(byFlagged));
console.log('PARSE_ERRORS:', parseErrors.length);
if (parseErrors.length) console.log(JSON.stringify(parseErrors, null, 2));
