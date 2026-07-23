// Rebuild schema-audit.json from staging.types.ts (live DB source of truth).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:/MMS';
const SCRATCH = 'C:/Users/IT/AppData/Local/Temp/claude/D--MMS/ec61aed3-670d-4616-b639-fa48e772c124/scratchpad';
const TYPES_PATH = path.join(SCRATCH, 'staging.types.ts');
const OUT_PATH = path.join(SCRATCH, 'schema-audit.json');

const src = fs.readFileSync(TYPES_PATH, 'utf8');
const lines = src.split(/\r?\n/);

// ---------- Parse ----------
function stripType(raw) {
  // remove trailing ` | null`, unwrap Database["public"]["Enums"]["x"]
  let t = raw.trim();
  t = t.replace(/\s*\|\s*null\s*$/g, '');
  const enumMatch = t.match(/^Database\["public"\]\["Enums"\]\["([^"]+)"\]$/);
  if (enumMatch) return `enum:${enumMatch[1]}`;
  return t;
}

const tables = {}; // name -> {columns: {colname:{type,nullable,optional}}, fks: [], order: []}
const views = {};
const enums = {};

let i = 0;
let currentSection = null; // 'Tables' | 'Views' | 'Enums' | null
let currentTable = null;
let currentSub = null; // 'Row' | 'Insert' | 'Update' | 'Relationships'
let inSchema = false;

while (i < lines.length) {
  const line = lines[i];
  const indent = line.match(/^ */)[0].length;
  const trimmed = line.trim();

  // Section headers at indent 4
  if (indent === 4) {
    const m = trimmed.match(/^(Tables|Views|Enums|Functions|CompositeTypes):\s*\{/);
    if (m) {
      currentSection = m[1];
      currentTable = null;
      currentSub = null;
      i++;
      continue;
    }
    // closing of a section
    if (trimmed === '}') {
      currentSection = null;
      i++;
      continue;
    }
  }

  // Table/View start at indent 6
  if ((currentSection === 'Tables' || currentSection === 'Views') && indent === 6) {
    const m = trimmed.match(/^([a-zA-Z_][\w]*):\s*\{$/);
    if (m) {
      currentTable = m[1];
      const bag = currentSection === 'Tables' ? tables : views;
      bag[currentTable] = { section: currentSection, columns: {}, order: [], fks: [] };
      currentSub = null;
      i++;
      continue;
    }
    if (trimmed === '}') {
      currentTable = null;
      currentSub = null;
      i++;
      continue;
    }
  }

  // Sub-block at indent 8
  if (currentTable && indent === 8) {
    const m = trimmed.match(/^(Row|Insert|Update|Relationships):\s*(\{|\[)/);
    if (m) {
      currentSub = m[1];
      i++;
      continue;
    }
    if (trimmed === '}' || trimmed === ']') {
      currentSub = null;
      i++;
      continue;
    }
  }

  // Column line inside Row/Insert/Update at indent 10
  if (currentTable && currentSub && (currentSub === 'Row' || currentSub === 'Insert' || currentSub === 'Update') && indent === 10) {
    // may be a column decl: name(?): type
    const colMatch = trimmed.match(/^([a-zA-Z_][\w]*)(\?)?:\s*(.*)$/);
    if (colMatch) {
      const colName = colMatch[1];
      const optional = !!colMatch[2];
      let typeStr = colMatch[3];
      // multi-line type: if type ends with `:` or continues on next line starting with `|`
      // Detect continuation: next line indent 12 starting with '|'
      let j = i + 1;
      while (j < lines.length) {
        const nl = lines[j];
        const nIndent = nl.match(/^ */)[0].length;
        const nTrim = nl.trim();
        if (nIndent >= 12 && nTrim.startsWith('|')) {
          typeStr += ' ' + nTrim;
          j++;
        } else {
          break;
        }
      }
      const nullable = /\|\s*null\b/.test(typeStr) || optional;
      const type = stripType(typeStr);
      const bag = currentSection === 'Tables' ? tables : views;
      const t = bag[currentTable];
      if (currentSub === 'Row') {
        if (!t.columns[colName]) {
          t.columns[colName] = { type, nullable, optional_in_insert: false };
          t.order.push(colName);
        }
      } else if (currentSub === 'Insert') {
        if (t.columns[colName]) t.columns[colName].optional_in_insert = optional;
      }
      i = j;
      continue;
    }
  }

  // Relationships FK parsing at indent 10 (block starts with `{`)
  if (currentTable && currentSub === 'Relationships' && indent === 10 && trimmed === '{') {
    // parse until matching '}'
    let fk = { foreignKeyName: null, columns: null, referencedRelation: null, referencedColumns: null };
    let j = i + 1;
    while (j < lines.length) {
      const nl = lines[j].trim();
      if (nl === '},' || nl === '}') { j++; break; }
      const fkMatch = nl.match(/^foreignKeyName:\s*"([^"]+)"/);
      if (fkMatch) fk.foreignKeyName = fkMatch[1];
      const colsMatch = nl.match(/^columns:\s*\[([^\]]*)\]/);
      if (colsMatch) {
        fk.columns = colsMatch[1].split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
      }
      const rrMatch = nl.match(/^referencedRelation:\s*"([^"]+)"/);
      if (rrMatch) fk.referencedRelation = rrMatch[1];
      const rcMatch = nl.match(/^referencedColumns:\s*\[([^\]]*)\]/);
      if (rcMatch) fk.referencedColumns = rcMatch[1].split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
      j++;
    }
    if (fk.columns && fk.referencedRelation) {
      tables[currentTable] && tables[currentTable].fks.push(fk);
      views[currentTable] && views[currentTable].fks.push(fk);
    }
    i = j;
    continue;
  }

  // Enums at indent 6: name: values
  if (currentSection === 'Enums' && indent === 6) {
    const m = trimmed.match(/^([a-zA-Z_][\w]*):\s*(.*)$/);
    if (m) {
      const enumName = m[1];
      let valsStr = m[2];
      // multi-line
      let j = i + 1;
      while (j < lines.length) {
        const nl = lines[j];
        const nIndent = nl.match(/^ */)[0].length;
        const nTrim = nl.trim();
        if (nIndent >= 8 && nTrim.startsWith('|')) {
          valsStr += ' ' + nTrim;
          j++;
        } else break;
      }
      const vals = [];
      const re = /"([^"]+)"/g;
      let vm;
      while ((vm = re.exec(valsStr)) !== null) vals.push(vm[1]);
      enums[enumName] = vals;
      i = j;
      continue;
    }
    if (trimmed === '}') { currentSection = null; i++; continue; }
  }

  i++;
}

// ---------- Build file index for code refs ----------
const SRC_DIR = path.join(ROOT, 'src');
function walk(dir, out=[]) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue;
      walk(p, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) {
      // exclude database.types.ts
      if (p.endsWith(path.join('src','types','database.types.ts'))) continue;
      out.push(p);
    }
  }
  return out;
}
const srcFiles = walk(SRC_DIR);
console.error(`[info] ${srcFiles.length} source files indexed`);
// preload contents
const fileContents = new Map();
for (const f of srcFiles) {
  try { fileContents.set(f, fs.readFileSync(f, 'utf8')); } catch {}
}

function rel(p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }

// Precompute per-file lines for line-number lookups
const fileLines = new Map();
function getLines(f) {
  if (!fileLines.has(f)) fileLines.set(f, fileContents.get(f).split(/\r?\n/));
  return fileLines.get(f);
}

// Find files that mention a table name (whole word)
function filesMentioningTable(tableName) {
  const re = new RegExp(`\\b${tableName}\\b`);
  const out = [];
  for (const [f, content] of fileContents) {
    if (re.test(content)) out.push(f);
  }
  return out;
}

// Find refs {file,line} of a column name inside a given set of files
function findColRefs(colName, filesSet) {
  const re = new RegExp(`\\b${colName}\\b`);
  const refs = [];
  let total = 0;
  for (const f of filesSet) {
    const content = fileContents.get(f);
    if (!re.test(content)) continue;
    const ls = getLines(f);
    for (let idx = 0; idx < ls.length; idx++) {
      if (re.test(ls[idx])) {
        total++;
        if (refs.length < 50) refs.push({ file: rel(f), line: idx + 1 });
      }
    }
  }
  return { refs, total, truncated: total > 50 };
}

// ---------- Verdicts helpers ----------
// staging migrations
const STAGING_MIG_DIR = path.join(ROOT, 'supabase', 'migrations-staging');
function readAllStagingMigrations() {
  const out = [];
  let files = [];
  try { files = fs.readdirSync(STAGING_MIG_DIR); } catch {}
  for (const f of files) {
    if (!f.endsWith('.sql')) continue;
    try {
      out.push({ file: f, content: fs.readFileSync(path.join(STAGING_MIG_DIR, f), 'utf8') });
    } catch {}
  }
  return out;
}
const migrations = readAllStagingMigrations();
console.error(`[info] ${migrations.length} staging migrations`);

// edge functions
const FUNCS_DIR = path.join(ROOT, 'supabase', 'functions');
function walkFuncs(dir, out=[]) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFuncs(p, out);
    else if (/\.(ts|js)$/.test(e.name)) out.push(p);
  }
  return out;
}
const funcFiles = walkFuncs(FUNCS_DIR);
const funcContents = new Map();
for (const f of funcFiles) {
  try { funcContents.set(f, fs.readFileSync(f, 'utf8')); } catch {}
}

// Extract RPC (CREATE OR REPLACE FUNCTION) blocks: name + body between $$...$$
function extractRpcBlocks(sqlText) {
  const blocks = [];
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z_][\w]*)\s*\([^)]*\)[\s\S]*?\$\$([\s\S]*?)\$\$/gi;
  let m;
  while ((m = re.exec(sqlText)) !== null) {
    blocks.push({ name: m[1], body: m[2] });
  }
  return blocks;
}

// Extract triggers: CREATE TRIGGER <name> ... ON <table> ... EXECUTE (FUNCTION|PROCEDURE) <fnName>
function extractTriggers(sqlText) {
  const out = [];
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+([a-zA-Z_][\w]*)[\s\S]*?ON\s+(?:public\.)?([a-zA-Z_][\w]*)[\s\S]*?EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(?:public\.)?([a-zA-Z_][\w]*)/gi;
  let m;
  while ((m = re.exec(sqlText)) !== null) {
    out.push({ triggerName: m[1], table: m[2], fnName: m[3] });
  }
  return out;
}

// Precompute all RPC blocks and triggers across staging migrations
const allRpcBlocks = []; // {name, body, file}
const allTriggers = []; // {triggerName, table, fnName, file}
for (const mig of migrations) {
  for (const b of extractRpcBlocks(mig.content)) allRpcBlocks.push({ ...b, file: mig.file });
  for (const t of extractTriggers(mig.content)) allTriggers.push({ ...t, file: mig.file });
}

// Table -> earliest CREATE TABLE migration filename
const tableCreatedIn = {};
for (const mig of migrations) {
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z_][\w]*)/gi;
  let m;
  while ((m = re.exec(mig.content)) !== null) {
    const t = m[1];
    if (!tableCreatedIn[t] || mig.file < tableCreatedIn[t]) tableCreatedIn[t] = mig.file;
  }
}

// select('*') callsites per table
function findSelectStar(tableName) {
  // pattern: from('<table>').select('*') or .from("<table>").select("*")
  // Simpler: files with .from('<table>') AND .select('*') on the same file where the select is on that table's chain
  // For coarse: find files with .from('<tableName>') that also contain .select('*')
  const fromRe = new RegExp(`\\.from\\(\\s*['"\`]${tableName}['"\`]\\s*\\)`);
  const starRe = /\.select\(\s*['"`]\*['"`]/;
  for (const [f, content] of fileContents) {
    if (fromRe.test(content) && starRe.test(content)) return rel(f);
  }
  return null;
}

const AUDIT_TABLES = new Set([
  'activity_log','notification_trail','webhook_logs','payment_sessions',
  'warehouse_manager_log','receival_edit_requests','stock_adjustment_approvals',
  'workflow_approval_steps'
]);
function isAuditTable(name) {
  if (AUDIT_TABLES.has(name)) return true;
  return /(_log|_logs|_trail|_history|_audit)$/.test(name);
}

function verdictFor(tableName, colName) {
  // 1. used_in_rpc: rpc body mentions both table and column
  const colRe = new RegExp(`\\b${colName}\\b`);
  const tableRe = new RegExp(`\\b${tableName}\\b`);
  for (const b of allRpcBlocks) {
    if (colRe.test(b.body) && tableRe.test(b.body)) {
      return { verdict: 'used_in_rpc', verdict_evidence: b.name };
    }
  }
  // 2. used_in_trigger
  const triggersOnTable = allTriggers.filter(t => t.table === tableName);
  for (const trg of triggersOnTable) {
    const fnBlock = allRpcBlocks.find(b => b.name === trg.fnName);
    if (fnBlock && colRe.test(fnBlock.body)) {
      return { verdict: 'used_in_trigger', verdict_evidence: trg.triggerName };
    }
  }
  // 3. used_in_edge
  for (const [f, content] of funcContents) {
    if (tableRe.test(content) && colRe.test(content)) {
      return { verdict: 'used_in_edge', verdict_evidence: rel(f) };
    }
  }
  // 4. select_star_consumer
  const ss = findSelectStar(tableName);
  if (ss) return { verdict: 'select_star_consumer', verdict_evidence: ss };
  // 5. audit_log_table
  if (isAuditTable(tableName)) return { verdict: 'audit_log_table', verdict_evidence: 'audit/log table pattern' };
  // 6. pending
  const mf = tableCreatedIn[tableName];
  if (mf) {
    const ts = mf.match(/^(\d{8})/);
    if (ts && ts[1] >= '20260701') return { verdict: 'pending', verdict_evidence: mf };
  }
  // 7. truly_dead
  return { verdict: 'truly_dead', verdict_evidence: '' };
}

// ---------- Module grouping ----------
function moduleOf(name) {
  const n = name;
  if (n === 'invoice_line_items') return 'invoices';
  if (n.includes('invoice') && !n.includes('line_items')) return 'invoices';
  if (n.includes('bill')) return 'bills';
  if (/^(payment|credit_group|customer_credit)/.test(n)) return 'payments';
  if (n.includes('sale_') || n.includes('sale_order')) return 'sales';
  if (/(purchase|^po_|receival|rfq)/.test(n)) return 'purchase';
  if (/(warehouse_transfer|warehouse_stock|warehouse_reorder|warehouse_field|warehouse_manager)/.test(n) || n === 'warehouses') return 'warehouse';
  if (/(inventory_|fifo|landed_cost|stock_adjust|cogs|brand|shipments|returns|return_lines)/.test(n)) return 'inventory';
  if (n.includes('customer_') || n === 'customers') return 'customers';
  if (n.includes('supplier') && n !== 'supplier_bills') return 'suppliers';
  if (['profiles','custom_roles','user_custom_roles','user_company_divisions'].includes(n)) return 'users_rbac';
  if (/(notification|activity_log|webhook_logs)/.test(n)) return 'activity';
  if (['company_divisions','companies','country_codes','currencies','document_terms','reason_lists','reason_list_categories','payment_methods','app_settings','credit_groups'].includes(n)) return 'config';
  if (n.includes('approval')) return 'approvals';
  return 'misc';
}

// ---------- Build final tables output ----------
const viewNames = new Set(Object.keys(views));

const outTables = [];
let totalCols = 0, totalDead = 0, totalRedundant = 0;
const verdictsSummary = {
  used_in_rpc: 0, used_in_trigger: 0, used_in_edge: 0,
  select_star_consumer: 0, audit_log_table: 0, pending: 0, truly_dead: 0
};

const tableNames = Object.keys(tables).sort();
for (const tName of tableNames) {
  const t = tables[tName];
  const filesSet = filesMentioningTable(tName);
  const colsOrder = t.order;

  // Prebuild set of columns for flag lookups
  const colSet = new Set(colsOrder);

  const columnsOut = [];
  for (const colName of colsOrder) {
    const col = t.columns[colName];
    // Find FK for this column
    const fk = t.fks.find(fk => fk.columns && fk.columns[0] === colName && !viewNames.has(fk.referencedRelation));
    const refs = findColRefs(colName, filesSet);

    const flags = [];
    const isDead = refs.total === 0 && !['id','created_at','updated_at','deleted_at'].includes(colName);
    if (isDead) flags.push('dead');
    // denormalized
    const dm = colName.match(/^(.+)_(name|label)$/);
    if (dm && colSet.has(`${dm[1]}_id`)) flags.push('denormalized');
    // dual_text_and_id
    if (colSet.has(`${colName}_id`)) {
      const tType = (col.type || '').toLowerCase();
      if (tType.includes('string')) flags.push('dual_text_and_id');
    }
    // deprecated_id_col
    if (/_id$/.test(colName)) {
      const tType = (col.type || '').toLowerCase();
      if (tType === 'string' || tType.includes('varchar') || tType.includes('text')) {
        // uuid comes as 'string' in TS too — heuristic: if there is NO FK on this column, treat as deprecated
        if (!fk) flags.push('deprecated_id_col');
      }
    }
    if (flags.includes('denormalized') || flags.includes('dual_text_and_id') || flags.includes('deprecated_id_col')) totalRedundant++;

    let verdict = null, verdict_evidence = null;
    if (isDead) {
      const v = verdictFor(tName, colName);
      verdict = v.verdict;
      verdict_evidence = v.verdict_evidence;
      verdictsSummary[verdict]++;
      totalDead++;
    }

    columnsOut.push({
      name: colName,
      type: col.type,
      nullable: col.nullable,
      default: null,
      fk: fk ? { references_table: fk.referencedRelation, references_column: (fk.referencedColumns && fk.referencedColumns[0]) || 'id' } : null,
      ref_count: refs.total,
      truncated: refs.truncated,
      refs: refs.refs,
      flags,
      verdict,
      verdict_evidence
    });
    totalCols++;
  }

  outTables.push({
    name: tName,
    module: moduleOf(tName),
    file_count: filesSet.length,
    files: filesSet.map(rel).slice(0, 100),
    columns: columnsOut
  });
}

const outViews = Object.keys(views).sort().map(n => ({ name: n, sql_snippet: null }));

const output = {
  generated_at: '2026-07-22',
  totals: {
    tables: outTables.length,
    columns: totalCols,
    dead: totalDead,
    redundant: totalRedundant,
    views: outViews.length,
    enums: Object.keys(enums).length
  },
  verdicts_summary: verdictsSummary,
  verifier_meta: {
    sources: ['staging.types.ts (live DB)', 'supabase/migrations-staging/', 'supabase/functions/', 'src/'],
    staging_only: true,
    schema_source: 'live DB gen_types (project mwvblpgbgxipvrevkeff)'
  },
  enums,
  tables: outTables,
  views: outViews
};

fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
console.error(`[done] wrote ${OUT_PATH}`);

// Print report data
const trulyDeadByTable = outTables.map(t => ({
  name: t.name,
  count: t.columns.filter(c => c.verdict === 'truly_dead').length
})).filter(x => x.count > 0).sort((a,b) => b.count - a.count).slice(0, 10);

console.log(JSON.stringify({
  totals: output.totals,
  verdicts_summary: output.verdicts_summary,
  top10_truly_dead: trulyDeadByTable,
  ghost_check: {
    approval_chains: !!tables['approval_chains'],
    approval_requests: !!tables['approval_requests'],
    approval_chain_tiers: !!tables['approval_chain_tiers'],
    workflow_approval_steps: !!tables['workflow_approval_steps'],
    divisions: !!tables['divisions'],
    user_divisions: !!tables['user_divisions'],
    pricing_factors: !!tables['pricing_factors'],
    quotations: !!tables['quotations'],
    quotation_line_items: !!tables['quotation_line_items'],
    quotation_log: !!tables['quotation_log'],
    service_change_requests: !!tables['service_change_requests']
  },
  present_check: {
    po_approval_chains: !!tables['po_approval_chains'],
    po_approval_chain_tiers: !!tables['po_approval_chain_tiers'],
    sale_order_approvals: !!tables['sale_order_approvals'],
    user_company_divisions: !!tables['user_company_divisions']
  },
  view_names: Object.keys(views),
  enum_count: Object.keys(enums).length
}, null, 2));
