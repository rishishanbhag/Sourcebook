# India GCC Source of Truth — Architecture Plan (v1, one evening)

## Context
No neutral, entity-level record of India's GCCs exists where every fact shows its source. Counts disagree (2,117 / ~1,700 / ~1,800) because sources count different units (company, entity, site) and hide their method. v1 tests the core idea: a **sourced, reconciled record** and one **city/state decision pack** on top of it, for a foreign company evaluating India.

**Your answers:** Vite + TypeScript, 6+ hours tonight, private, free only.
**Working dir:** `C:\Users\Rishi\Desktop\Dev\swiggy` is empty, so nothing to reuse; greenfield.

**Facts vs assumptions.** Figures in the brief (counts, broker shares) are taken from the brief as given; I did not re-verify them. Anything marked **[UNVERIFIED]** below must be checked before you rely on it.

---

## Architecture in one picture

```
  HAND-EDITED CSVs (source of truth, open in Excel/Sheets)        AUTOMATED
  data/*.csv  ─────────────────────────────┐            data/raw/mca_*.csv (downloaded by hand)
   sources, parents, entities, sites,      │                       │
   claims, cities, policies, providers,    │                       ▼
   engagements, match_decisions            │        scripts/import-mca.ts  (filter foreign subs, IT codes)
                                           │                       │
                                           │                       ▼
                                           │        scripts/match.ts ──► data/review_queue.csv
                                           │             (name normalise + score)     │
                                           │                                          │ you fill in
                                           │                                          ▼ decision column
                                           └──────────► scripts/build.ts ◄── data/match_decisions.csv
                                                       (validate, resolve claims,
                                                        compute confidence, coverage)
                                                                   │
                                                                   ▼
                                                       public/db.json (one file)
                                                                   │
                                                                   ▼
                                       Vite + React app (local only, `npm run dev`)
                                       ├─ Registry search
                                       ├─ City pack (comparables, rent, talent, providers)
                                       └─ State incentive comparison
                                       every value shows: source · date · method · confidence
                                       disputed fields show all claims side by side
```

**Why this shape:** CSVs are the "lean version" the brief asks for and the real store at the same time — no database, no server, no hosting. A build script turns them into one JSON file; the browser reads it. Private by default because it only runs on your machine. Moving to SQLite/Postgres later is a change to `build.ts` only.

**Stack:** Vite + React + TypeScript; Node scripts run with `tsx`; `papaparse` for CSV (quoting is easy to get wrong by hand). No router (three tabs in state), no UI kit, no database. Total deps: react, react-dom, papaparse, tsx, vite.

---

## 1. Scope of v1

**In (tonight):**
- CSV schema + build script that validates every row and refuses rows without a source.
- Hand-entered seed: **1 city fully (Bengaluru)** + 2 others partially (Pune, Hyderabad); 5 state policies; ~30–50 GCC sites; ~10 providers; the headline count disagreement (Nasscom-Zinnov / Economic Survey / CII-Deloitte) as claims with unit stated.
- One automated import: MCA company master data, filtered.
- Name matching script + review queue (CSV).
- Three pages: registry search, city pack, state incentive comparison. Provenance on every value, disagreements shown.
- Coverage line: "N sites listed = X% of [source] count of [unit]".

**Deferred (named, not built):** public hosting, login, correction submission form (v1 = mailto link that you log as a claim), paid placement UI, provider confirmation workflow, job-posting signal, broker/REIT parsing automation, ML matching, continuous refresh scheduler, maturity-framework tagging beyond one column, charts.

## 2. Data model

Each table is one CSV in `data/`. IDs are short slugs you type (`p_acme`, `e_acme_in1`, `s_acme_blr`), so hand entry stays easy.

| Table | Columns |
|---|---|
| `sources` | source_id, name, publisher, url, published_date, type (`govt`/`industry_body`/`consultant`/`broker`/`press`/`company`/`submission`), conflict_of_interest (free text, e.g. "sells GCC setup"), terms_note |
| `parents` | parent_id, name, hq_country, website_domain, sector |
| `entities` | entity_id, parent_id, legal_name, cin, state, incorporation_date, mca_status |
| `sites` | site_id, entity_id, parent_id, city_id, function (`tech`/`finance`/`analytics`/`ops`/mixed), maturity_stage, maturity_framework, opened_year |
| `cities` | city_id, name, state |
| `policies` | policy_id, state, name, period, doc_url, capex_subsidy, rent_subsidy, payroll_subsidy, other (each cell short text; numbers come via claims) |
| `providers` | provider_id, name, category (`legal`/`recruit`/`real_estate`/`eor`/`advisory`), website |
| `engagements` | engagement_id, provider_id, site_id (nullable), parent_id (nullable), service, status (`self_reported`/`gcc_confirmed`/`disputed`), anonymised (y/n) |
| `claims` | claim_id, subject_type (`parent`/`entity`/`site`/`city`/`policy`/`provider`/`engagement`/`ecosystem`), subject_id, field, value, unit, period, source_id, source_date, retrieved_date, method (`manual`/`import`/`submission`/`derived`), quote, page_ref |
| `match_decisions` | left_ref, right_ref, decision (`same`/`different`/`unsure`), decided_by, decided_date, note |
| `sponsorships` | provider_id, placement, start, end (empty tonight; exists so separation is structural) |

**Confidence** is computed, not typed (see §4/§5), so it can't drift.
**Count rule:** every ecosystem number is a claim with `unit` ∈ {company, entity, site} and a `period`. The UI refuses to show a count without its unit.

**Maturity:** one `maturity_stage` column mapped to a published framework (e.g. Zinnov's GCC maturity stages or Nasscom's) **[UNVERIFIED: confirm the framework's stage names and its licence/attribution terms before using]**.

## 3. Ingestion

| Source | How | Manual/auto | Legal / terms risk | Refresh |
|---|---|---|---|---|
| MCA company master (via data.gov.in) | Download CSV by hand → `data/raw/`; `import-mca.ts` filters to foreign-company subsidiaries in target states with IT/ITES/business-services activity codes | Download manual, filter automated | Low: govt open data under the Govt Open Data Licence **[UNVERIFIED: confirm the dataset is still published, its column names, and that it covers class "subsidiary of foreign company"]**. No director data in it; don't add any. | Monthly / when portal updates |
| State GCC/IT policies (KA, MH, GJ, TS, TN) | Read PDF, type key incentives as claims with page_ref | Manual | Low: public docs. **[UNVERIFIED: which states have a GCC-specific policy vs only an IT policy, and current periods]** | When policy changes; check quarterly |
| Nasscom, Zinnov, Economic Survey, CII-Deloitte | Type headline numbers as claims, with unit + period + quote | Manual | Medium: copyright — quote short facts, cite, link; never republish tables | Annually |
| Broker / REIT reports | Type rent ranges and GCC-share figures as claims; REIT tenant names only where disclosed | Manual | Medium: same as above; many reports need email sign-up — check terms | Half-yearly |
| Press releases / case studies | Type site openings, provider engagements as claims (`self_reported`) | Manual | Low for facts with citation | Weekly in later versions |
| Job postings | Deferred | — | High: most job boards forbid scraping; use only official APIs or feeds | — |
| LinkedIn | Not used | — | High: no open headcount API; scraping breaks terms. If headcount ever shown, label "rough estimate" with method | — |
| GCC leader submissions / provider confirmations | v1: email → you enter as `method=submission` claim | Manual | Medium: DPDP — store company facts only, not the submitter's personal data beyond what you need to verify | On receipt |

## 4. Entity resolution

**Step 1 – normalise names** (`match.ts`): lowercase, strip punctuation, remove legal suffixes (`private limited`, `pvt`, `ltd`, `llp`, `inc`), remove generic words (`india`, `technology/technologies`, `services`, `solutions`, `global`, `centre/center`, `gcc`, `capability`). What's left is the **core token(s)**.

**Step 2 – score each candidate pair** (0–1, add up, cap at 1):

| Signal | Points |
|---|---|
| Same CIN | → 1.0, auto-link |
| Same website domain (entity/press/parent) | +0.5 |
| Core tokens identical | +0.4 (partial overlap: Jaccard × 0.4) |
| Same state | +0.1 |
| Same city on a site claim | +0.1 |
| Parent's name appears in MCA name | +0.2 |

**Step 3 – route:** ≥0.9 → suggested `same`, still listed for one-click confirm; 0.5–0.9 → `review_queue.csv`; <0.5 → treated as different, not queued. Nothing links without a row in `match_decisions.csv` (except identical CIN). The build reads decisions; re-running matching never overwrites them.

**Worked example.** "Acme Technology India Pvt Ltd" (MCA, Karnataka) vs "Acme Global Services" (press release: "opens Bengaluru centre", acme.com).
- Normalised: `acme` vs `acme` → core tokens identical +0.4
- MCA state Karnataka, press city Bengaluru → same state +0.1, same city +0.1
- Parent "Acme" appears in MCA name +0.2
- No CIN in press, no domain on MCA row → 0
- **Score 0.8 → review queue.** You check the MCA registered address or the parent's site, mark `same`, note "acme.com careers page lists Bengaluru entity". Done.
- Trap it catches: "Acme Foods India Pvt Ltd" also normalises to `acme`. Same score shape, so it also lands in the queue — which is the point: you decide, not the script.

**When to go advanced:** move to a probabilistic matcher (e.g. Splink, Python) or embeddings only when the queue exceeds ~200 pairs a week or records pass ~5,000 entities. Below that, manual review is faster and more accurate.

## 5. Evidence and provenance

- **Every displayed fact is a claim row.** Canonical tables (`parents`, `sites`…) hold identity only; facts like headcount, rent, opened year, incentive amounts live in `claims`. Build fails on any claim with no `source_id` or `source_date`.
- **Field resolution rule** (in `build.ts`, written down in the UI "Method" page):
  1. Group claims by (subject, field, unit, period).
  2. If all values agree → one value, confidence from best source.
  3. If they disagree → status `disputed`; show **all** values, each with source, date, method, and the source's `conflict_of_interest`. No silent pick. Optionally mark a "preferred" value using: govt > industry body > consultant/broker > company/press > submission; newer beats older within a tier.
- **Confidence score (per field):** `tier weight (govt 0.9, industry 0.7, consultant/broker 0.6, press/company 0.5, submission 0.4) + 0.1 per extra agreeing independent source (max +0.2) − 0.2 if older than 24 months − 0.2 if disputed`, clamped 0–1, shown as High (≥0.75) / Medium (0.5–0.75) / Low. Site-level confidence = lowest of its identity fields (entity link, city, parent link).
- **Count disagreement display:** the headline table shows 2,117 / ~1,700 / ~1,800 side by side with unit, period and publisher — the reconciliation itself is the feature.

## 6. Product layer

All three pages read `public/db.json` (built by `build.ts`; shape: `{ parents, entities, sites, cities, policies, providers, engagements, sources, fields: {subjectKey: {field: {status, preferred, claims[]}}}, coverage }`).

- **Registry search:** one text box + city/state/function filters over sites joined to parent/entity. Each row: parent, legal entity, city, function, confidence badge. Click → detail panel listing every field with its claims. Plain `Array.filter` — fine for thousands of rows.
- **City pack:** pick a city → comparable GCC sites (filter by function), rent range claims, talent cost claims, providers with engagement count split into `gcc_confirmed` vs `self_reported`, and the state's policy row. Coverage line at the top.
- **State incentive comparison:** table, states as columns, incentive types as rows, each cell a claim with source/page link; "No published figure" where empty, never blank-as-zero.
- Shared `<Fact>` component renders value + source tooltip + confidence + "disputed" marker — the one piece of UI reused everywhere.

## 7. Neutrality and trust controls

- **Separation by structure:** ranking reads only `engagements` + `claims`. `sponsorships` is a separate table that the ranking function never imports; sponsored items would render in a separate, labelled box. Tonight `sponsorships` is empty and unused.
- **Organic provider ranking (published formula):** `gcc_confirmed × 3 + self_reported × 1`, ties by most recent evidence. Shown on the Method page.
- **Self-reported vs confirmed** shown as two separate numbers, never summed in the UI.
- **Anonymised case studies:** never guess the client; store engagement with `parent_id` empty and `anonymised=y`. If you believe you know the client, add a `derived` claim with low confidence and visible "inferred" label — or leave it out.
- **No auto-rejection:** weak signals set a `flag` shown next to the claim; nothing is deleted.
- **Corrections/disputes:** v1 "Suggest a correction" = mailto link. Each one becomes a `submission` claim; disputed status appears automatically; you resolve by adding evidence, not by editing old claims. Old claims are never edited, only superseded (append-only log).

## 8. Privacy and compliance

- **Store:** companies, legal entities (CIN), sites at city level, company-level facts, provider firms.
- **Don't store:** director names/DIN, personal emails/phones, individual employees, LinkedIn profile data, submitter details beyond a name+company you need to verify (keep that outside the repo).
- **Needs legal review before going public:** DPDP Act applicability to any personal data in submissions; copyright/fair-use on quoting paid reports; defamation risk on "disputed" provider claims; terms of each data source; use of a third-party maturity framework.
- Private/local v1 keeps exposure low while these are open.

## 9. Tonight's build order (~6–7 h)

| # | Step | Time | Checkpoint (must pass before moving on) |
|---|---|---|---|
| 1 | `npm create vite@latest` (React+TS), add papaparse, tsx; create `data/` with empty CSVs + headers | 20 min | `npm run dev` shows a blank page; CSVs open in Excel |
| 2 | **By hand:** enter `sources` + the 3 headline count claims + 5 state policies (incentives as claims with page refs) | 60 min | Every row has source_id and date; you can name the unit for each count |
| 3 | `build.ts`: parse CSVs, validate (required fields, IDs exist, claim has source), group claims, compute status + confidence, write `db.json` | 60 min | Break a row on purpose → build fails with a clear message. Fix → `db.json` written. Include assert-based self-check for confidence + dispute logic |
| 4 | `<Fact>` + State incentive page | 40 min | Table shows 5 states, every cell hovers to source; one deliberately conflicting claim shows as disputed |
| 5 | **By hand:** Bengaluru seed — ~30 sites (parents, entities, sites), rent + talent cost claims, ~10 providers + engagements | 75 min | `npm run build:data` passes; counts look right |
| 6 | Registry search + detail panel; City pack page with coverage line | 60 min | Search "acme"-style name finds the site; city pack for Bengaluru shows comparables, rent, talent, providers (confirmed vs self-reported split), policy |
| 7 | `import-mca.ts`: filter downloaded MCA CSV to foreign subs in KA/MH/TS/TN/GJ | 30 min | Prints row count per state; spot-check 5 rows |
| 8 | `match.ts`: normalise + score MCA rows against your hand-entered parents/sites → `review_queue.csv`; build reads `match_decisions.csv` | 50 min | Acme-style pair lands in queue at ~0.8; mark 10 decisions; rebuild shows linked CINs on sites. Self-check asserts on the normaliser and the worked example |
| 9 | Method page (rules, formulas, coverage, known gaps) + mailto correction link | 20 min | A stranger could explain where any number came from |

If you run short: stop after step 6 — that's a usable decision pack. Steps 7–8 are the first automation.

## 10. Known weak points — how each is handled

| Weak point | Approach in v1 | Time cost | Limit that remains |
|---|---|---|---|
| **Name matching** | Normalise + additive score + review queue; CIN/domain as hard keys; decisions stored and never overwritten | ~50 min tonight; then ~1 min per pair | Fully solved only for small volumes. Brand reuse across unrelated companies and renamed entities still need a human. Upgrade trigger in §4. |
| **Restricted data (financials, directors)** | Don't need it for v1. Use MCA master (free) for entity existence, status, incorporation date, state. Financials/headcount only from sourced public claims, labelled with method | 0 extra | No revenue/headcount from filings. Paid providers (e.g. MCA paid filings, data vendors) only after demand is proven **[UNVERIFIED: costs]** |
| **Partial REIT disclosures** | Treat REIT tenant names as one claim type among many; rent ranges from broker reports as claims with source; GCC-share-of-leasing shown as the disagreement (30%+ / 35–40% / 45%) rather than one number | Part of step 5 | Can't attribute most leases to tenants. Not solvable tonight; v1 shows ranges and disagreement instead of a precise figure |
| **Untested demand** | Not solvable by code. v1 is built to be shown in interviews (private, local). Test plan in §11 | 0 tonight | Remains the biggest risk |

## 11. Risks and open questions (ranked)

| # | Risk / question | Cheap test |
|---|---|---|
| 1 | Entrants won't pay, and are too infrequent to matter | 5–8 calls with expansion leads; show the Bengaluru pack; ask what they paid advisors and whether they'd pay for this. Pass bar: 2+ ask for a second city |
| 2 | Providers won't pay for neutral listing with confirmed track record | 5 provider calls; offer a "confirmed engagement" badge; pass bar: 2+ agree to ask a client to confirm |
| 3 | GCCs won't confirm engagements or submit corrections | Email 10 GCC leaders their own record; measure reply rate |
| 4 | MCA dataset not available / not filterable to foreign subs **[UNVERIFIED]** | Download it first thing (step 7 can move to step 1 if you want certainty) |
| 5 | Legal: quoting paid reports, DPDP, provider defamation | One hour with a lawyer before going public; until then stay private |
| 6 | Manual entry doesn't scale | Time yourself in step 5: minutes per site × target coverage = hours needed |
| 7 | Neutrality claim not believed | Ask interviewees what would make them trust it; check if the Method page answers it |

---

## Files to create (tonight, after approval)
- `package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx` (three tabs), `src/Fact.tsx`, `src/pages/{Registry,CityPack,Incentives,Method}.tsx`
- `scripts/build.ts`, `scripts/import-mca.ts`, `scripts/match.ts` (each with an assert-based self-check)
- `data/*.csv` (tables in §2), `data/raw/` (gitignored), `public/db.json` (generated)

## Verification
1. `npx tsx scripts/build.ts` passes on seed data and fails on a planted bad row.
2. `npx tsx scripts/match.ts --selftest` passes (normaliser + worked example score 0.8).
3. `npm run dev`: search finds a known site; Bengaluru pack shows all four sections with sources; incentive table hovers to page refs; the headline count table shows three disagreeing numbers with units.
