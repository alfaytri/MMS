// scripts/build_final_schema.mjs
// Phase 1: Inventory every migration file.
// Reads all .sql files under supabase/migrations/, sorts by filename
// (timestamp-ordered), and prints per-file counts of CREATE TABLE,
// CREATE FUNCTION, CREATE POLICY, and GRANT statements.
//
// This is inventory only — no SQL is generated yet.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/migrations';

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

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
