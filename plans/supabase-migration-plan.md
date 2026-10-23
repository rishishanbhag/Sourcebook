# Move to Supabase + public submissions (anon, captcha, rate limit)

## Context
Data is CSV in git; `scripts/build.ts` validates it and bakes `public/db.json`, which `src/App.tsx:23` fetches. That only works for one editor. The goal is to deploy the app and let the public submit reports and engagements, so the data needs a database with a safe write path. Decisions: Supabase; anonymous submitters with captcha + rate limit; private now, possibly public after launch.

## Design (smallest thing that works)
- **Supabase Postgres is the source of truth** for the same tables as the CSVs, plus a `submissions` table.
- **The frontend keeps reading a baked `db.json`.** `build.ts` reads from the DB instead of CSV, with the same validation and fact resolution. This avoids rewriting `resolveGroup` / site confidence / coverage for the browser and avoids read policies on the public tables. Approving a submission triggers a rebuild (host build hook), so the site updates in about a minute.
- **Submissions never publish directly.** The browser cannot insert into any table. It calls an Edge Function that checks the captcha and rate limit, then inserts into `submissions` as status `pending`. You approve or reject.
- **Privacy while private:** host-level password / access gate on the deployed site (db.json is a downloadable file). At launch, remove the gate; no code change.

## Steps

### 1. Supabase project and schema
- Create the project; keep keys in `.env` (gitignored) and the host's env vars. Add `@supabase/supabase-js` and `dotenv` (or `--env-file`).
- New `supabase/schema.sql`: one table per entry in `SPEC` (`scripts/build.ts:14-58`), columns and enums as `check` constraints, `*_id` primary keys, foreign keys matching the `fk(...)` calls (`build.ts:~129-135`). Keep `claims.value`, dates etc. as `text` to stay identical to today's all-strings `Row`.
- Add `submissions(id, kind 'report'|'engagement', payload jsonb, contact text, status 'pending'|'approved'|'rejected', ip_hash, created_at)`.
- Row-level security on every table, with no policies for `anon`; only the service role (scripts, Edge Function, you) can read or write.

### 2. One-off CSV import
- `scripts/csv-to-db.ts`: read each `data/*.csv` with `readCsv` (`scripts/csv.ts`) and upsert into Postgres in FK order (sources, parents, cities, entities, sites, policies, providers, engagements, claims, match_decisions).
- Check row counts against `wc -l` of the CSVs (claims 1248, parents 353, sites 431, ...).

### 3. DB access layer replacing CSV
- New `scripts/db.ts` exporting `readTable(name): Row[]` and `writeTable(name, cols, rows)`, same shape as `readCsv`/`writeCsv`, over supabase-js with the service key.
- Swap callers: `build.ts:69` (`readCsv` -> `readTable`), and the writers in `match.ts`, `load-directories.ts`, `import-mca.ts`, `gleif.ts`. `registers.ts` reads raw register CSVs in `data/raw` and stays as is.
- Keep `data/*.csv` as a periodic export for backup and git diffs.

### 4. Build from the DB
- `build.ts` keeps all validation, claim resolution and `public/db.json` output unchanged; only the read source changes.
- Add `"build": "npm run build:data && vite build"` to `package.json`.
- Run `npm run build:data`, diff the new `db.json` against the old one (should be identical apart from `generated_at`).

### 5. Submission endpoint (captcha + rate limit)
- Cloudflare Turnstile (free) for the captcha; widget on the form.
- Supabase Edge Function `submit`: verify the Turnstile token server-side, hash the IP, reject if the same hash has more than N pending/recent submissions (count rows in `submissions` over the last hour; no extra service), validate required fields and enums (reuse the `SPEC` rules: anonymised engagements must leave `parent_id`/`site_id` empty, count fields need a unit and period, dates match `DATE_RE`), then insert as `pending`. Cap payload size.
- Anyone can post spam; the review step is what protects the data.

### 6. Frontend form
- New tab `Submit` in `src/App.tsx` (`TABS`) and `src/pages/Submit.tsx` using `Section`/`Card`/`Muted` from `src/components`. Fields: report or engagement, subject, value, unit, period, source URL and quote, contact (optional), Turnstile widget. Posts to the Edge Function; shows a "received, pending review" message.
- Copy on the page: submissions are reviewed and shown with their source; no guessing of anonymised clients.

### 7. Review and approve
- Start with the Supabase table editor, no custom admin UI yet (shortcut: upgrade to an admin page behind login when volume warrants).
- `scripts/approve-submission.ts <id>`: loads the submission and inserts the corresponding `claims` / `engagements` row with `method='submission'` and a `submission` source (the existing rule that `gcc_confirmed` needs a `gcc` or `submission` source then applies), marks it approved, then calls the host build hook. `build.ts` re-validates, so a bad approval fails the build rather than publishing.

### 8. Deploy
- Static host (Netlify/Vercel/Cloudflare Pages): build command `npm run build`, output `dist`, env vars for Supabase service key (build only, never shipped to the browser) and Turnstile secret (Edge Function). The browser only gets the anon key and Turnstile site key.
- Gate the site with the host's password protection until launch.
- Add a build-hook URL as an env var for step 7.

## Risks and known limits
- Submissions go live only after a rebuild, so there is about a minute of delay by design.
- IP-hash rate limiting is simple and can be bypassed with many IPs; the captcha plus manual review covers that for now.
- The service key must never reach the browser or git.

## Verification
1. `psql`/table editor: row counts match the CSVs; `npm run build:data` output matches the old `db.json`.
2. `npm test` and `npm run typecheck` pass.
3. Locally submit through the form: captcha rejects a bad token; the 6th rapid submission is rate limited; a valid one lands as `pending` and does not appear on the site.
4. Try an anonymous insert straight at the REST API: it must be denied.
5. Approve one test submission: build runs, it appears with its source; an invalid one (e.g. anonymised with a `parent_id`) makes the build fail without publishing.
6. Open the deployed site logged out: the password gate shows.
