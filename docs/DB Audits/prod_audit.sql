\pset pager off
\set ON_ERROR_STOP off
\timing off

\echo '################ 0. OVERVIEW ################'
select
  (select count(*) from pg_tables where schemaname='public')                      as public_tables,
  (select count(*) from pg_views  where schemaname='public')                      as public_views,
  (select count(*) from pg_matviews where schemaname='public')                    as matviews,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') as public_functions,
  (select count(*) from pg_policies where schemaname='public')                    as policies,
  pg_size_pretty(pg_database_size(current_database()))                            as db_size;

\echo ''
\echo '--- total estimated live rows across public tables ---'
select coalesce(sum(n_live_tup),0) as total_live_rows, count(*) as tables
from pg_stat_user_tables;

\echo ''
\echo '--- extensions ---'
select extname, extversion from pg_extension order by extname;

\echo ''
\echo '################ 1. SECURITY & ACCESS CONTROL ################'
\echo '--- 1a. RLS coverage counts ---'
select count(*) as tables_total,
       count(*) filter (where rowsecurity)      as rls_on,
       count(*) filter (where not rowsecurity)  as rls_off
from pg_tables where schemaname='public';

\echo ''
\echo '--- 1a. tables WITHOUT RLS (should be empty) ---'
select tablename from pg_tables where schemaname='public' and rowsecurity=false order by 1;

\echo ''
\echo '--- 1b. RLS ENABLED but NO policy (deny-all; verify intentional) ---'
select c.relname
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relrowsecurity
  and not exists (select 1 from pg_policy p where p.polrelid=c.oid)
order by 1;

\echo ''
\echo '--- 1c. Permissive USING(true) policies (wide-open reads/writes) ---'
select tablename, policyname, cmd, roles::text
from pg_policies
where schemaname='public' and (qual='true')
order by 1,2;

\echo ''
\echo '--- 1d. INSERT/UPDATE/ALL policies MISSING with_check ---'
select tablename, policyname, cmd, roles::text
from pg_policies
where schemaname='public' and cmd in ('INSERT','UPDATE','ALL') and with_check is null
order by 1,2;

\echo ''
\echo '--- 1e. Non-SELECT policies that target the anon role ---'
select tablename, policyname, cmd, roles::text
from pg_policies
where schemaname='public' and 'anon' = any(roles) and cmd <> 'SELECT'
order by 1,2;

\echo ''
\echo '--- 1f. SECURITY DEFINER function counts ---'
select count(*) filter (where prosecdef) as secdef_total,
       count(*) filter (where prosecdef and not (coalesce(array_to_string(proconfig,','),'') like '%search_path=%')) as secdef_no_searchpath,
       count(*) as functions_total
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public';

\echo ''
\echo '--- 1f. SECURITY DEFINER funcs WITHOUT pinned search_path (search-path injection risk) ---'
select p.proname
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef
  and not (coalesce(array_to_string(proconfig,','),'') like '%search_path=%')
order by 1;

\echo ''
\echo '--- 1g. anon-EXECUTABLE SECURITY DEFINER functions (elevated + reachable by public anon key) ---'
select count(*) as anon_secdef_count
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE');

select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')
order by 1;

\echo ''
\echo '--- 1h. public tables with DIRECT grants to anon ---'
select table_name, string_agg(privilege_type, ',' order by privilege_type) as anon_privs
from information_schema.role_table_grants
where grantee='anon' and table_schema='public'
group by table_name order by 1;

\echo ''
\echo '--- 1i. VIEWS in public: security_invoker flag + who can read (view w/o invoker bypasses RLS) ---'
select c.relname,
  exists(select 1 from unnest(coalesce(c.reloptions,'{}')) o where o ilike 'security_invoker=t%' or o ilike 'security_invoker=on') as sec_invoker,
  has_table_privilege('anon', c.oid, 'SELECT')          as anon_read,
  has_table_privilege('authenticated', c.oid, 'SELECT') as auth_read
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='v'
order by sec_invoker asc, 1;

\echo ''
\echo '################ 2. INDEXING & PERFORMANCE ################'
\echo '--- 2a. unindexed FK columns COUNT (rules.md methodology) ---'
select count(*) as unindexed_fk_columns
from pg_constraint c
join pg_attribute a on a.attrelid=c.conrelid and a.attnum = any(c.conkey)
where c.contype='f'
  and not exists (select 1 from pg_index i where i.indrelid=c.conrelid and a.attnum = any(i.indkey));

\echo ''
\echo '--- 2a. unindexed FKs where NO index has the FK col as LEADING key (true covering gap) ---'
select c.conrelid::regclass::text as table_name, a.attname as column_name, c.conname as fk
from pg_constraint c
join pg_attribute a on a.attrelid=c.conrelid and a.attnum = c.conkey[1]
where c.contype='f' and array_length(c.conkey,1)=1
  and not exists (select 1 from pg_index i where i.indrelid=c.conrelid and i.indkey[0]=a.attnum)
order by 1,2;

\echo ''
\echo '--- 2b. duplicate indexes (same table + same column set) ---'
select indrelid::regclass::text as table_name, array_agg(indexrelid::regclass::text) as dup_indexes
from pg_index
group by indrelid, indkey
having count(*) > 1;

\echo ''
\echo '--- 2c. unused indexes idx_scan=0 (non-PK, non-unique) — CAVEAT: low-traffic prod, stats since last reset ---'
select s.relname as tbl, s.indexrelname as idx, s.idx_scan,
       pg_size_pretty(pg_relation_size(s.indexrelid)) as size
from pg_stat_user_indexes s
join pg_index i on i.indexrelid=s.indexrelid
where s.idx_scan=0 and not i.indisprimary and not i.indisunique
order by pg_relation_size(s.indexrelid) desc, 1
limit 60;

\echo ''
\echo '--- 2c-count unused indexes ---'
select count(*) as unused_nonpk_indexes
from pg_stat_user_indexes s
join pg_index i on i.indexrelid=s.indexrelid
where s.idx_scan=0 and not i.indisprimary and not i.indisunique;

\echo ''
\echo '--- 2d. seq-scan heavy tables (seq_scan >> idx_scan) ---'
select relname, seq_scan, idx_scan, n_live_tup,
       case when seq_scan+coalesce(idx_scan,0)=0 then null
            else round(100.0*seq_scan/(seq_scan+coalesce(idx_scan,0)),1) end as pct_seq
from pg_stat_user_tables
where seq_scan > 0
order by seq_scan desc
limit 20;

\echo ''
\echo '--- 2e. stat-statements reset time (context for scan counts) ---'
select stats_reset from pg_stat_database where datname=current_database();

\echo ''
\echo '################ 3. COLUMN DATA TYPES (enum vs check vs fk) ################'
\echo '--- 3a. status/state/role/tier/type/kind/stage/priority columns ---'
select table_name, column_name, data_type, udt_name, is_nullable
from information_schema.columns
where table_schema='public'
  and column_name ~ '(^|_)(status|state|role|tier|type|kind|stage|priority)$'
order by column_name, table_name;

\echo ''
\echo '--- 3b. user-defined ENUM types ---'
select t.typname, string_agg(e.enumlabel, ', ' order by e.enumsortorder) as values
from pg_type t
join pg_enum e on e.enumtypid=t.oid
join pg_namespace n on n.oid=t.typnamespace
where n.nspname='public'
group by t.typname order by 1;

\echo ''
\echo '--- 3c. CHECK constraint count (public) ---'
select count(*) as check_constraints
from pg_constraint c join pg_namespace n on n.oid=c.connamespace
where n.nspname='public' and c.contype='c';

\echo ''
\echo '################ 4. SCHEMA INTEGRITY & STANDARDS ################'
\echo '--- 4a. tables WITHOUT a primary key (should be empty) ---'
select c.relname
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
  and not exists (select 1 from pg_constraint k where k.conrelid=c.oid and k.contype='p')
order by 1;

\echo ''
\echo '--- 4b. timestamp WITHOUT time zone columns (should be timestamptz) ---'
select table_name, column_name
from information_schema.columns
where table_schema='public' and data_type='timestamp without time zone'
order by 1,2;

\echo ''
\echo '--- 4b-count ---'
select count(*) as naive_timestamp_columns
from information_schema.columns
where table_schema='public' and data_type='timestamp without time zone';

\echo ''
\echo '--- 4c. created_at / updated_at columns WITHOUT a default ---'
select table_name, column_name
from information_schema.columns
where table_schema='public' and column_name in ('created_at','updated_at') and column_default is null
order by 1,2;

\echo ''
\echo '--- 4d. FK ON DELETE action distribution ---'
select case confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT' when 'c' then 'CASCADE'
                        when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end as on_delete,
       count(*)
from pg_constraint where contype='f' group by 1 order by 2 desc;

\echo ''
\echo '--- 4e. total FK count ---'
select count(*) as total_fks from pg_constraint where contype='f';

\echo ''
\echo '################ 5. SIZES / MAINTENANCE / SLOW QUERIES ################'
\echo '--- 5a. largest tables by total size ---'
select relname, n_live_tup as est_rows, pg_size_pretty(pg_total_relation_size(relid)) as total_size
from pg_stat_user_tables
order by pg_total_relation_size(relid) desc
limit 20;

\echo ''
\echo '--- 5b. dead tuples / last autovacuum-analyze (bloat check) ---'
select relname, n_live_tup, n_dead_tup, last_autovacuum, last_autoanalyze
from pg_stat_user_tables
where n_dead_tup > 0
order by n_dead_tup desc
limit 15;

\echo ''
\echo '--- 5c. pg_stat_statements present? ---'
select exists(select 1 from pg_extension where extname='pg_stat_statements') as has_pgss;

\echo ''
\echo '--- 5c. TOP queries by total_exec_time (errors harmlessly if extension absent) ---'
select round(total_exec_time::numeric,2) as total_ms, calls,
       round(mean_exec_time::numeric,2) as avg_ms, left(query,100) as query
from pg_stat_statements
where query not ilike '%pg_stat_statements%'
order by total_exec_time desc
limit 12;

\echo ''
\echo '################ END ################'
