# How Claude Runs SQL Against the DB

Claude uses the Supabase CLI in query mode against the linked staging project.
The exact command:

```bash
npx supabase db query --linked "SELECT ..."
```

- `--linked` targets the remote linked project
  (staging: `mwvblpgbgxipvrevkeff`)
- Without `--linked` it tries local Postgres on port 54322, which fails
- Results come back as JSON with an untrusted-data warning envelope
- For writes/RPCs Claude can run `INSERT`, `UPDATE`, or `SELECT rpc_...(...)`
  the same way

Auth is via the CLI token stored in `supabase/.temp/` (from a prior
`supabase login`) — Claude never sees credentials, just executes against the
already-linked project.
