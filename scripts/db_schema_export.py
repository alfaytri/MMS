"""
Export a Supabase/Postgres schema to JSON, read-only.

    python scripts/db_schema_export.py --db dev   [--out <path>]
    python scripts/db_schema_export.py --db newprod
    python scripts/db_schema_export.py --db staging

Reads connection details from supabase/.temp/migrate.env. Opens the session
READ ONLY, so it cannot write even by accident.

The output is one JSON document describing the `public` schema: tables with
their columns, constraints, indexes, policies and live row counts, plus enums,
functions, triggers, views and extensions. It is meant to be diffable — keys
are sorted and lists are ordered deterministically.
"""
import argparse
import io
import json
import sys
import urllib.parse
from datetime import datetime, timezone

import psycopg2

ENV_PATH = r"D:\MMS\supabase\.temp\migrate.env"

PROJECTS = {
    "dev":     ("DEV_DB_URL", "wkmvjxxmzstsvahuiwsz"),
    "newprod": ("NEW_DB_URL", "optishfnnctrhffpoywg"),
}


def read_env(path):
    env = {}
    for line in io.open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip("'").strip('"')
    return env


def connect(env, target):
    if target == "staging":
        pw = urllib.parse.quote(env["STAGING_DB_PASSWORD"], safe="")
        url = f"postgresql://postgres:{pw}@db.mwvblpgbgxipvrevkeff.supabase.co:5432/postgres"
        ref = "mwvblpgbgxipvrevkeff"
    else:
        key, ref = PROJECTS[target]
        url = env[key]
        if ref not in url:
            raise SystemExit(f"refusing to run: {key} does not point at {ref}")
    conn = psycopg2.connect(url)
    conn.set_session(readonly=True, autocommit=True)
    return conn, ref


def rows(cur, sql, args=None):
    # Only pass args when there are some: psycopg2 treats `%` as a placeholder
    # whenever a parameter sequence is supplied, which breaks SQL containing
    # format('%I', ...) or a LIKE pattern.
    cur.execute(sql, args) if args else cur.execute(sql)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def export(cur):
    out = {}

    out["columns"] = rows(cur, """
        SELECT c.table_name, c.column_name, c.ordinal_position, c.data_type,
               c.udt_name, c.is_nullable = 'YES' AS is_nullable,
               c.column_default, c.character_maximum_length, c.numeric_precision,
               col_description(format('public.%I', c.table_name)::regclass, c.ordinal_position) AS comment
          FROM information_schema.columns c
          JOIN information_schema.tables t
            ON t.table_schema = c.table_schema AND t.table_name = c.table_name
         WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
         ORDER BY c.table_name, c.ordinal_position;""")

    out["tables"] = rows(cur, """
        SELECT c.relname AS table_name,
               c.relrowsecurity AS rls_enabled,
               c.relforcerowsecurity AS rls_forced,
               c.reltuples::bigint AS estimated_rows,
               pg_total_relation_size(c.oid) AS total_bytes,
               obj_description(c.oid) AS comment
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r'
         ORDER BY c.relname;""")

    out["constraints"] = rows(cur, """
        SELECT c.conrelid::regclass::text AS table_name, c.conname AS name,
               CASE c.contype WHEN 'p' THEN 'primary key' WHEN 'f' THEN 'foreign key'
                              WHEN 'u' THEN 'unique' WHEN 'c' THEN 'check'
                              ELSE c.contype::text END AS kind,
               pg_get_constraintdef(c.oid) AS definition,
               CASE c.confupdtype WHEN 'a' THEN 'no action' WHEN 'r' THEN 'restrict'
                    WHEN 'c' THEN 'cascade' WHEN 'n' THEN 'set null'
                    WHEN 'd' THEN 'set default' END AS on_update,
               CASE c.confdeltype WHEN 'a' THEN 'no action' WHEN 'r' THEN 'restrict'
                    WHEN 'c' THEN 'cascade' WHEN 'n' THEN 'set null'
                    WHEN 'd' THEN 'set default' END AS on_delete
          FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE n.nspname = 'public'
         ORDER BY 1, 3, 2;""")

    out["indexes"] = rows(cur, """
        SELECT i.tablename AS table_name, i.indexname AS name, i.indexdef AS definition,
               s.idx_scan AS scans
          FROM pg_indexes i
          LEFT JOIN pg_stat_user_indexes s
            ON s.schemaname = i.schemaname AND s.indexrelname = i.indexname
         WHERE i.schemaname = 'public'
         ORDER BY 1, 2;""")

    out["policies"] = rows(cur, """
        SELECT c.relname AS table_name, p.polname AS name,
               CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                             WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
                             ELSE 'ALL' END AS command,
               p.polpermissive AS permissive,
               (SELECT array_agg(r.rolname ORDER BY r.rolname)
                  FROM pg_roles r WHERE r.oid = ANY(p.polroles)) AS roles,
               pg_get_expr(p.polqual, p.polrelid) AS using_expr,
               pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_expr
          FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
         ORDER BY 1, 2;""")

    out["enums"] = rows(cur, """
        SELECT t.typname AS name,
               array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
          FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'public'
         GROUP BY t.typname ORDER BY 1;""")

    out["functions"] = rows(cur, """
        SELECT p.proname AS name,
               pg_get_function_identity_arguments(p.oid) AS arguments,
               pg_get_function_result(p.oid) AS returns,
               l.lanname AS language,
               p.prosecdef AS security_definer,
               p.proconfig AS config,
               CASE p.provolatile WHEN 'i' THEN 'immutable' WHEN 's' THEN 'stable'
                                  ELSE 'volatile' END AS volatility
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          JOIN pg_language l ON l.oid = p.prolang
         WHERE n.nspname = 'public' AND p.prokind = 'f'
         ORDER BY 1, 2;""")

    out["triggers"] = rows(cur, """
        SELECT c.relname AS table_name, t.tgname AS name,
               pg_get_triggerdef(t.oid) AS definition
          FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND NOT t.tgisinternal
         ORDER BY 1, 2;""")

    out["views"] = rows(cur, """
        SELECT c.relname AS name, c.relkind = 'm' AS materialized,
               COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions)
                          WHERE option_name = 'security_invoker'), 'false') AS security_invoker
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
         ORDER BY 1;""")

    out["grants"] = rows(cur, """
        SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'service_role')
         GROUP BY 1, 2 ORDER BY 1, 2;""")

    out["extensions"] = rows(cur,
        "SELECT extname AS name, extversion AS version FROM pg_extension ORDER BY 1;")

    return out


def exact_row_counts(cur, table_names):
    """reltuples is an estimate; the audit needs truth for the empty-table check."""
    counts = {}
    for t in table_names:
        try:
            cur.execute(f'SELECT count(*) FROM public."{t}";')
            counts[t] = cur.fetchone()[0]
        except Exception:
            counts[t] = None
    return counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="dev", choices=["dev", "newprod", "staging"])
    ap.add_argument("--out", default=None)
    ap.add_argument("--no-counts", action="store_true",
                    help="skip exact row counts (faster on a large database)")
    args = ap.parse_args()

    env = read_env(ENV_PATH)
    conn, ref = connect(env, args.db)
    cur = conn.cursor()

    cur.execute("SELECT current_database(), version(), pg_database_size(current_database());")
    dbname, version, size = cur.fetchone()

    data = export(cur)
    if not args.no_counts:
        data["row_counts"] = exact_row_counts(cur, [t["table_name"] for t in data["tables"]])

    doc = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "target": args.db,
        "project_ref": ref,
        "database": dbname,
        "server_version": version.split(" on ")[0],
        "database_bytes": size,
        "schema": "public",
        "counts": {k: len(v) for k, v in data.items() if isinstance(v, list)},
        **data,
    }

    out = args.out or rf"D:\MMS\docs\DB Audits\{args.db}-db-schema-{datetime.now().strftime('%Y-%m-%d')}.json"
    io.open(out, "w", encoding="utf-8", newline="\n").write(
        json.dumps(doc, indent=2, default=str, ensure_ascii=False) + "\n")
    print(f"wrote {out}")
    for k, v in doc["counts"].items():
        print(f"  {k:14s} {v}")
    conn.close()


if __name__ == "__main__":
    main()
