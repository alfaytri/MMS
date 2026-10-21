"""
Read-only database audit against docs/DB Audits/Audit requirement/rules.md,
plus a dead-column sweep the rubric does not cover.

    python scripts/db_audit.py --db dev --schema "docs/DB Audits/dev-db-schema-2026-10-21.json"

Emits findings as JSON on stdout (and to --out), for a human to write up.
Opens the session READ ONLY. Never writes.

On "dead" columns — two independent signals, reported separately because
neither is proof on its own:

  * data signal   — the column is NULL in every row of a non-empty table.
                    Strong, but a brand-new column is legitimately all-NULL.
  * code signal   — the column name never appears anywhere in src/. Weak for
                    generic names (`id`, `name`, `status`) and blind to
                    `select('*')`, so it is only reported alongside the data
                    signal, never alone.

A column is listed as a candidate only when BOTH fire. Anything else is noise.
"""
import argparse
import io
import json
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db_schema_export import ENV_PATH, connect, read_env, rows  # noqa: E402

SRC_DIR = r"D:\MMS\src"
# Names too generic for the code signal to mean anything.
GENERIC = {
    "id", "name", "type", "status", "code", "value", "key", "data", "state",
    "url", "label", "title", "date", "time", "order", "index", "count", "total",
    "amount", "price", "qty", "notes", "created_at", "updated_at", "deleted_at",
}


def load_src_text():
    blob = []
    for root, _dirs, files in os.walk(SRC_DIR):
        for f in files:
            if f.endswith((".ts", ".tsx")):
                try:
                    blob.append(io.open(os.path.join(root, f), encoding="utf-8",
                                        errors="ignore").read())
                except OSError:
                    pass
    return "\n".join(blob)


def audit(cur, schema, src_text):
    f = {}
    tables = {t["table_name"]: t for t in schema["tables"]}
    counts = schema.get("row_counts", {})
    cols_by_table = defaultdict(list)
    for c in schema["columns"]:
        cols_by_table[c["table_name"]].append(c)

    # ── 1. Security ─────────────────────────────────────────────────────────
    f["rls_disabled"] = sorted(t for t, v in tables.items() if not v["rls_enabled"])

    pol_tables = {p["table_name"] for p in schema["policies"]}
    f["rls_on_but_no_policy"] = sorted(
        t for t, v in tables.items() if v["rls_enabled"] and t not in pol_tables)

    f["blanket_true_policies"] = sorted(
        f"{p['table_name']}.{p['name']} [{p['command']}] roles={p['roles']}"
        for p in schema["policies"]
        if p["permissive"] and (p["using_expr"] or "").strip().lower() == "true")

    f["write_policies_without_check"] = sorted(
        f"{p['table_name']}.{p['name']} [{p['command']}]"
        for p in schema["policies"]
        if p["command"] in ("INSERT", "UPDATE", "ALL") and not p["with_check_expr"])

    f["definer_without_search_path"] = sorted(
        f"{fn['name']}({fn['arguments']})" for fn in schema["functions"]
        if fn["security_definer"] and not any(
            str(c).startswith("search_path=") for c in (fn["config"] or [])))

    f["views_not_security_invoker"] = sorted(
        v["name"] for v in schema["views"] if str(v["security_invoker"]).lower() != "true")

    anon_write = []
    for g in schema["grants"]:
        if g["grantee"] != "anon":
            continue
        privs = set(g["privileges"].split(","))
        if privs & {"INSERT", "UPDATE", "DELETE", "TRUNCATE"}:
            t = tables.get(g["table_name"])
            if t and not t["rls_enabled"]:
                anon_write.append(f"{g['table_name']} ({g['privileges']})")
    f["anon_write_on_unprotected_table"] = sorted(anon_write)

    # ── 2. Indexing ─────────────────────────────────────────────────────────
    f["unindexed_foreign_keys"] = rows(cur, """
        SELECT c.conrelid::regclass::text AS table_name, a.attname AS column_name,
               c.conname AS constraint_name
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
          JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE c.contype = 'f' AND n.nspname = 'public'
           AND NOT EXISTS (
             SELECT 1 FROM pg_index i
              WHERE i.indrelid = c.conrelid AND i.indkey[0] = a.attnum)
         ORDER BY 1, 2;""")

    dup = defaultdict(list)
    for i in schema["indexes"]:
        body = re.sub(r"INDEX \S+ ON", "INDEX ON", i["definition"])
        dup[body].append(f"{i['table_name']}.{i['name']}")
    f["duplicate_indexes"] = [v for v in dup.values() if len(v) > 1]

    f["unused_indexes"] = sorted(
        f"{i['table_name']}.{i['name']}" for i in schema["indexes"]
        if (i["scans"] or 0) == 0 and "_pkey" not in i["name"])

    # ── 3. Column types ─────────────────────────────────────────────────────
    enum_names = {e["name"] for e in schema["enums"]}
    f["enum_columns"] = sum(1 for c in schema["columns"] if c["udt_name"] in enum_names)
    f["check_constraints"] = sum(1 for c in schema["constraints"] if c["kind"] == "check")
    status_kinds = defaultdict(list)
    for c in schema["columns"]:
        if c["column_name"] in ("status", "state"):
            kind = "enum" if c["udt_name"] in enum_names else c["data_type"]
            status_kinds[kind].append(f"{c['table_name']}.{c['column_name']}")
    f["status_column_kinds"] = {k: len(v) for k, v in status_kinds.items()}
    f["status_text_columns"] = sorted(status_kinds.get("text", []))

    # ── 4. Schema integrity ─────────────────────────────────────────────────
    pk_tables = {c["table_name"] for c in schema["constraints"] if c["kind"] == "primary key"}
    f["tables_without_primary_key"] = sorted(set(tables) - pk_tables)

    f["naive_timestamp_columns"] = sorted(
        f"{c['table_name']}.{c['column_name']}" for c in schema["columns"]
        if c["data_type"] == "timestamp without time zone")

    f["fks_without_explicit_delete_rule"] = sorted(
        f"{c['table_name']}.{c['name']}" for c in schema["constraints"]
        if c["kind"] == "foreign key" and c["on_delete"] == "no action")

    f["timestamp_columns_without_default"] = sorted(
        f"{c['table_name']}.{c['column_name']}" for c in schema["columns"]
        if c["column_name"] in ("created_at", "updated_at")
        and not c["column_default"])

    # ── 5. Dead weight ──────────────────────────────────────────────────────
    f["empty_tables"] = sorted(t for t, n in counts.items() if n == 0)

    populated = {t: n for t, n in counts.items() if (n or 0) > 0}
    all_null, checked = [], 0
    for t, n in sorted(populated.items()):
        nullable = [c for c in cols_by_table[t] if c["is_nullable"]]
        if not nullable:
            continue
        probes = ", ".join(
            f'count("{c["column_name"]}") AS "{c["column_name"]}"' for c in nullable)
        try:
            cur.execute(f'SELECT {probes} FROM public."{t}";')
            got = dict(zip([d[0] for d in cur.description], cur.fetchone()))
            checked += len(nullable)
            for col, non_null in got.items():
                if non_null == 0:
                    all_null.append({"table": t, "column": col, "rows": n})
        except Exception as e:
            all_null.append({"table": t, "column": None, "error": str(e).splitlines()[0]})
    f["all_null_columns"] = all_null
    f["columns_probed_for_null"] = checked

    dead = []
    for entry in all_null:
        col = entry.get("column")
        if not col or col in GENERIC:
            continue
        if not re.search(r"\b" + re.escape(col) + r"\b", src_text):
            dead.append(entry)
    f["dead_column_candidates"] = dead

    return f


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="dev", choices=["dev", "newprod", "staging"])
    ap.add_argument("--schema", required=True)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    schema = json.load(io.open(args.schema, encoding="utf-8"))
    env = read_env(ENV_PATH)
    conn, ref = connect(env, args.db)
    cur = conn.cursor()

    print(f"auditing {args.db} ({ref}) against {args.schema}", file=sys.stderr)
    findings = audit(cur, schema, load_src_text())

    doc = {"target": args.db, "project_ref": ref, "schema_file": args.schema, **findings}
    text = json.dumps(doc, indent=2, default=str, ensure_ascii=False) + "\n"
    if args.out:
        io.open(args.out, "w", encoding="utf-8", newline="\n").write(text)
        print(f"wrote {args.out}", file=sys.stderr)

    for k, v in findings.items():
        n = len(v) if isinstance(v, (list, dict)) else v
        print(f"  {k:38s} {n}")
    conn.close()


if __name__ == "__main__":
    main()
