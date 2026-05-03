<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Responsive Design — Mandatory Rule

Every UI component and page MUST be fully responsive across all four breakpoints:

| Breakpoint | Target | Tailwind prefix |
|---|---|---|
| `< 640px` | Phone | (default / no prefix) |
| `640px – 1024px` | Tablet | `sm:` / `md:` |
| `1024px – 1920px` | Laptop / Desktop | `lg:` / `xl:` |
| `> 1920px` | TV / Large screen | `2xl:` |

**Rules:**
- Never hardcode pixel widths on layout containers — use `w-full`, `max-w-*`, or responsive fractions
- Tables must collapse gracefully on mobile: hide lower-priority columns below `md:`, use horizontal scroll as fallback
- Dialogs/modals: full-screen on mobile (`w-full h-full rounded-none`), centered card on `md:+`
- Navigation: TopNav is desktop-first — implement a hamburger/drawer for `< lg:` screens
- Font sizes, padding, and spacing must scale — avoid fixed `px` values that look wrong on 4K
- Touch targets must be at least `44px` tall on mobile (use `min-h-11` or `h-11`)
- Test mentally at each breakpoint before marking any UI task complete

---

📜 PROGRESS.md Mandatory Update Protocol
Objective: Maintain a real-time, high-integrity record of development. This rule is a Hard Constraint — it applies on both task START and task COMPLETION.

1. Trigger & Sequence — ON START
When you begin a task, before writing any code:

Update ## 🔄 In Progress with the task you are starting.

Format: `🚀 Starting: **[Plan Name] Task N: [Task Name]**`

Perform a git commit: `docs: update PROGRESS.md — starting [Task Name]`

This commit must contain ONLY the PROGRESS.md change.

2. Trigger & Sequence — ON COMPLETION
You must update PROGRESS.md after every task before proceeding to the next one.

Complete the task (code, fix, or feature).

Perform a git commit for the task code.

Immediately update PROGRESS.md in the same turn.

Perform a separate git commit for the docs update.

3. File Update Requirements
## ✅ Completed: Add a bullet at the top of the list.

Format: - [YYYY-MM-DD] **[Plan Name] Task N: [Task Name]** — [Files modified/created] — [Brief summary of functionality]

## 🔄 In Progress: Remove the task you just finished. Add the very next task from your plan.

Plan Table: Update the Status column for the relevant task (e.g., change [ ] to [x] or Pending to Done).

3. Git Commit Standards
Message: docs: update PROGRESS.md — [Task Name] complete

Isolation: Never include code changes in this commit. It must only contain the PROGRESS.md file.

4. Constraints (Negative Rules)
No Batching: Do not wait until the end of the session to update multiple tasks.

No Generalizations: Avoid vague summaries. If you built a login form, name the specific component (e.g., LoginForm.tsx).

No Context Switching: Do not ask the user for the "next task" until PROGRESS.md is updated and committed.

5. Expected Format Example
Markdown
- 2024-05-20 **Authentication Plan Task 2: JWT Implementation** — `auth_service.py`,

---

# Dropdown UUID Guard — Mandatory Rule

Whenever you create or modify a `<Select>` / dropdown component, you **must** verify that displayed values are human-readable labels — never raw UUIDs or database IDs.

**Checklist (run before marking the task done):**
1. Identify what value the dropdown `<SelectItem>` or `<option>` renders as its visible text
2. If the value comes from a database record (e.g. a foreign-key lookup), confirm that a `name`, `label`, or equivalent human-readable field is used for display — not `id` or any UUID
3. If the data arrives as a list of objects, the display text must be mapped explicitly: e.g. `item.name`, `profile.full_name`, `supplier.name` — never `item.id`
4. If a selected value cannot be resolved to a label (e.g. data not yet loaded), render a placeholder such as `"Select…"` or `"Loading…"` — never fall back to showing the raw UUID
5. When using controlled selects with UUID `value` props (standard pattern), ensure the *trigger display* uses a lookup or `.find()` to resolve the label from the loaded data

**Common failure patterns to catch:**
- `<SelectValue>` showing a UUID because the display map is missing or the data hasn't loaded yet
- `value={item.id}` passed without a matching `{item.name}` in the label slot
- Stale / empty data causing the resolved label to be `undefined`, which React renders as nothing or falls back to the raw value

---

# Visual Companion — Never Offer

**Do NOT offer the brainstorming visual companion (browser mockups / local URL).** This project uses text-only brainstorming. Skip that offer entirely in every session.

---

# Database Migrations — Mandatory Rule

**Always use the Supabase CLI to apply migrations. Never ask the user to run SQL manually.**

**Project ref:** `wkmvjxxmzstsvahuiwsz`  
**Config:** `supabase/config.toml` (committed to repo — CLI reads it automatically)  
**Auth token:** stored in `supabase/.temp/` (gitignored, machine-local)

## Workflow for every migration

1. Create the SQL file in `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
2. Run `npx supabase db push` to apply it to the remote database immediately
3. Commit the migration file to git

```bash
npx supabase db push
git add supabase/migrations/<file>.sql
git commit -m "feat(db): ..."
```

## If the CLI is not linked (fresh clone / new machine)

Run once:
```bash
npx supabase link --project-ref wkmvjxxmzstsvahuiwsz
```
No password needed when logged in via `npx supabase login`.

## Finding credentials

| What | Where |
|---|---|
| Project ref | `supabase/config.toml` → `project_id` field, or Supabase dashboard URL: `supabase.com/dashboard/project/<ref>` |
| DB connection string | Supabase dashboard → Project Settings → Database → Connection string |
| Service role / anon key | Supabase dashboard → Project Settings → API |

## If migrations get out of sync (manual SQL was run)

Use `npx supabase migration repair --status applied <version>` for each manually-applied migration, then verify with `npx supabase db push --dry-run` — it must show "Remote database is up to date."

---

# Git Co-Authorship — Mandatory Rule

Every commit **must** include both authors in the commit message trailer. No exceptions.

```
Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

**How to apply:** Always pass the commit message via a HEREDOC so both trailers are included:

```bash
git commit -m "$(cat <<'EOF'
feat(scope): description

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

This applies to every commit — feature code, PROGRESS.md updates, migrations, and fixes alike.

---

# Code Review — Mandatory Rule

After completing any task (code, feature, fix, or refactor), your work will be reviewed by **Codex**. Write code as if Codex will scrutinize every line — because it will.

**Rules:**
- Do not consider a task done until it is ready for external review
- Do not cut corners, skip edge cases, or leave TODOs in delivered code
- Every change must be self-contained, correct, and match the requirements exactly
- If Codex finds a mistake, it reflects on the quality of your work — aim for zero findings
