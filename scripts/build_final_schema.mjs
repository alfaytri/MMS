// scripts/build_final_schema.mjs
// Phase 1: Inventory every migration file.
// Reads all .sql files under supabase/migrations/, sorts by filename
// (timestamp-ordered), and prints per-file counts of CREATE TABLE,
// CREATE FUNCTION, CREATE POLICY, and GRANT statements.
//
// --report mode: detect functions missing GRANT EXECUTE.
// Scans all migrations for CREATE FUNCTION and GRANT EXECUTE statements,
// then prints the set of functions that were created but never granted.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
// --build mode: merge all migrations into a single idempotent SQL file
// ---------------------------------------------------------------------------

if (process.argv.includes('--build')) {
  const OUT_DIR = 'database';
  const OUT_FILE = join(OUT_DIR, 'final_schema.sql');

  // 1. Concatenate all migration files with source markers
  let merged = '';
  for (const f of files) {
    const sql = readFileSync(join(DIR, f), 'utf8');
    merged +=
      `-- ============================================\n` +
      `-- Source: ${f}\n` +
      `-- ============================================\n` +
      sql +
      '\n\n';
  }

  // 2. Extract and dedupe extensions
  //    Matches: CREATE EXTENSION IF NOT EXISTS "name"
  //    and:     CREATE EXTENSION "name"
  const extRe = /CREATE\s+EXTENSION(?:\s+IF\s+NOT\s+EXISTS)?\s+"([^"]+)"/gi;
  const extensions = new Set();
  let extMatch;
  while ((extMatch = extRe.exec(merged)) !== null) {
    extensions.add(extMatch[1]);
  }
  // Always include pgcrypto (gen_random_uuid) and uuid-ossp as they are
  // implicitly required by the schema even if no CREATE EXTENSION exists.
  extensions.add('pgcrypto');
  extensions.add('uuid-ossp');

  // Normalize line endings to LF (some migration files use CRLF on Windows)
  merged = merged.replace(/\r\n/g, '\n');

  // 3. Strip individual BEGIN / COMMIT from migrations — the outer wrapper
  //    provides a single transaction around the whole file.
  merged = merged.replace(/^\s*BEGIN\s*;\s*$/gim, '-- (BEGIN removed — outer transaction)');
  merged = merged.replace(/^\s*COMMIT\s*;\s*$/gim, '-- (COMMIT removed — outer transaction)');

  // 3a. Patch: CREATE TABLE → CREATE TABLE IF NOT EXISTS
  merged = merged.replace(
    /CREATE TABLE(?!\s+IF\s+NOT\s+EXISTS)/gi,
    'CREATE TABLE IF NOT EXISTS'
  );

  // 3b. Patch: Wrap CREATE TYPE ... AS ENUM (...); in an idempotent DO block.
  //     The enum body can span multiple lines, so use the /s flag.
  merged = merged.replace(
    /CREATE\s+TYPE\s+((?:public\.)?\w+)\s+AS\s+ENUM\s*\(([^)]+)\)\s*;/gis,
    (_, name, values) => {
      // Ensure the type name is schema-qualified
      const qualifiedName = name.includes('.') ? name : `public.${name}`;
      return (
        `DO $do_type$ BEGIN\n` +
        `  CREATE TYPE ${qualifiedName} AS ENUM (${values});\n` +
        `EXCEPTION WHEN duplicate_object THEN NULL;\n` +
        `END $do_type$;`
      );
    }
  );

  // 4. Assemble preamble + extensions + merged SQL + epilogue
  const timestamp = new Date().toISOString();
  const extLines = [...extensions]
    .sort()
    .map((e) => `CREATE EXTENSION IF NOT EXISTS "${e}";`)
    .join('\n');

  const output =
    `-- ==========================================================================\n` +
    `-- AUTO-GENERATED: ${OUT_FILE.replace(/\\/g, '/')}\n` +
    `-- Source: supabase/migrations/*.sql (concatenated + patched)\n` +
    `-- Generated: ${timestamp}\n` +
    `-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS\n` +
    `-- ==========================================================================\n\n` +
    `BEGIN;\n\n` +
    `SET client_min_messages = warning;\n` +
    `SET statement_timeout = 0;\n` +
    `SET lock_timeout = 0;\n\n` +
    `-- === EXTENSIONS ===\n` +
    `${extLines}\n\n` +
    `-- === MIGRATIONS (concatenated) ===\n` +
    merged +
    `\nCOMMIT;\n`;

  // 5. Write output
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, output, 'utf8');

  const lines = output.split('\n').length;
  const bytes = Buffer.byteLength(output, 'utf8');
  console.log(`Wrote ${OUT_FILE} (${bytes} bytes, ${lines} lines)`);
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
