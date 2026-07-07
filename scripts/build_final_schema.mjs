// scripts/build_final_schema.mjs
// Phase 1: Inventory every migration file.
// Reads all .sql files under supabase/migrations/, sorts by filename
// (timestamp-ordered), and prints per-file counts of CREATE TABLE,
// CREATE FUNCTION, CREATE POLICY, and GRANT statements.
//
// --report mode: detect functions missing GRANT EXECUTE.
// Scans all migrations for CREATE FUNCTION and GRANT EXECUTE statements,
// then prints the set of functions that were created but never granted.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/migrations';

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

// ---------------------------------------------------------------------------
// --report mode: detect functions without matching GRANT EXECUTE
// ---------------------------------------------------------------------------

function extractFunctionNames(sql) {
  // Match: CREATE [OR REPLACE] FUNCTION [public.]<name>(
  const re = /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+(?:public\.)?(\w+)\s*\(/gi;
  const names = new Set();
  let m;
  while ((m = re.exec(sql)) !== null) names.add(m[1].toLowerCase());
  return names;
}

function extractGrantedFunctions(sql) {
  // Match: GRANT EXECUTE ON FUNCTION public.<name>
  // Also handles optional schema and optional arg-list parentheses
  const re = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+(?:public\.)?(\w+)/gi;
  const names = new Set();
  let m;
  while ((m = re.exec(sql)) !== null) names.add(m[1].toLowerCase());
  return names;
}

if (process.argv.includes('--report')) {
  const allCreated = new Map();   // name -> [files]
  const allGranted = new Set();

  for (const f of files) {
    const sql = readFileSync(join(DIR, f), 'utf8');
    const created = extractFunctionNames(sql);
    const granted = extractGrantedFunctions(sql);

    for (const name of created) {
      if (!allCreated.has(name)) allCreated.set(name, []);
      allCreated.get(name).push(f);
    }
    for (const name of granted) {
      allGranted.add(name);
    }
  }

  // Functions created but never granted
  const ungranted = [...allCreated.keys()]
    .filter((name) => !allGranted.has(name))
    .sort();

  console.log(`\nUnique functions found: ${allCreated.size}`);
  console.log(`Functions with GRANT EXECUTE: ${allGranted.size}`);
  console.log(`Functions WITHOUT GRANT EXECUTE: ${ungranted.length}\n`);

  console.log('--- Ungranted functions (sorted) ---');
  ungranted.forEach((name, i) => {
    console.log(`  ${i + 1}. ${name}`);
  });

  process.exit(0);
}

// ---------------------------------------------------------------------------
// Default mode: inventory
// ---------------------------------------------------------------------------

const counts = files.map((f) => {
  const sql = readFileSync(join(DIR, f), 'utf8');
  return {
    file: f,
    tables: (sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+/gi) || []).length,
    functions: (sql.match(/CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+/gi) || []).length,
    policies: (sql.match(/CREATE\s+POLICY\s+/gi) || []).length,
    grants: (sql.match(/^\s*GRANT\s+/gim) || []).length,
  };
});

console.table(counts);

const total = counts.reduce(
  (a, c) => ({
    tables: a.tables + c.tables,
    functions: a.functions + c.functions,
    policies: a.policies + c.policies,
    grants: a.grants + c.grants,
  }),
  { tables: 0, functions: 0, policies: 0, grants: 0 },
);

console.log(`FILES: ${counts.length}`);
console.log('TOTAL:', total);
