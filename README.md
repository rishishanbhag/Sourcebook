# India GCC Registry (private v1)

A sourced record of India's GCCs. The CSVs in `data/` are the database: edit them in Excel or Sheets.
`npm run build:data` validates them and writes `public/db.json`; the app reads that file. Runs locally only.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Rebuild data, then open the app at http://127.0.0.1:5173 |
| `npm run build:data` | Validate every CSV and write `public/db.json`. Fails with a list of errors. |
| `npm test` | Self-checks for confidence rules, name matching and the MCA filter |
| `npm run import:mca -- data/raw/<file>.csv` | Filter a downloaded MCA company master CSV to `data/mca_filtered.csv` |
| `npm run match` | Score MCA entities against `parents.csv` and write `data/review_queue.csv` |

## Adding data

- **Every fact is a row in `claims.csv`** with a `source_id` from `sources.csv`. Identity tables (`parents`, `sites`, ...) hold no facts.
- `subject_type` + `subject_id` say what the claim is about (`site` + `s_acme_blr`, `city` + `blr`, `policy` + `pol_ka`, `ecosystem` + `india`).
- Fields ending in `_count` need a `unit` (company / entity / site / unstated) and a `period`.
- Every site and every engagement needs at least one claim.
- `gcc_confirmed` engagements need a claim from a source of type `gcc` or `submission`.
- Anonymised case studies: `anonymised=y` and leave `parent_id` and `site_id` empty.
- Never edit an old claim to correct it. Add a new claim; the disagreement will show.
- Do not enter director names, personal emails or phone numbers.

## Matching MCA entities

1. Download the company master CSV(s) into `data/raw/` (gitignored).
2. `npm run import:mca -- data/raw/<file>.csv`. If it reports missing columns, add the names to `COLS` in `scripts/import-mca.ts`.
3. `npm run match`, then open `data/review_queue.csv` and fill `decision` with `same`, `different` or `unsure` (and a `note`).
4. `npm run match` again: filled rows move to `match_decisions.csv` and are never asked again.
5. `npm run build:data`: each `same` creates the legal entity with MCA-sourced claims and links it to the parent's site in that state.

Sources marked `[UNVERIFIED]` in `sources.csv` were copied from the project brief; add URLs, dates and page references.
