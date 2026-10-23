# How it works

India GCC Registry: a private, local tool that records facts about India's Global Capability Centres (GCCs), with the source behind every fact.

## 1. Is this "the exact single source of truth"?

**No, not yet, and the design does not claim to be.** Be careful with that phrase.

What it is: a **single place where every fact is stored together with where it came from**. Nothing in the app is a bare number. Each value comes with its source, the date, how it was collected, and a confidence level.

What it is not: a verified, complete or authoritative list. Today:

- It lists **431 sites** (261 in Bengaluru, 169 in Pune, 1 Ferguson from a press release), mostly from two commercial web directories. That is **11.56%** of the 3,728 sites Nasscom-Zinnov counts (the Overview shows this).
- The site lists have not been checked against a primary source (company filings, government records). The two directories have their own commercial interests.
- 48 sites have a linked legal entity (CIN) from GLEIF. Those links were proposed by Claude and are **not yet reviewed by a person**.
- Of the 7 sources copied from the brief, only Nasscom-Zinnov has been checked (against Zinnov's own page). The other 6 are still marked `[UNVERIFIED]`, with no URL.
- Where sources disagree, the app **shows every value** and marks the field "disputed". It never picks a winner silently. That is how it earns trust: the truth is not asserted, the evidence is laid out.

"Source of truth" is therefore the goal. At this stage it is a **sourced, reconcilable record**.

## 2. The big picture

```
 data/raw/*.txt  (lists I read from public web pages)    data/raw/<mca>.csv (you download)
        │                                                          │
 scripts/load-directories.ts                           scripts/import-mca.ts  (filter)
        │                                                          │
        ▼                                                          ▼
  data/*.csv  ◄── you edit by hand ──►  data/mca_filtered.csv ─┐
        ▲            data/gleif_candidates.csv (npm run gleif) ─┴► scripts/match.ts ─► data/review_queue.csv
  (the database)                                                                      │ you fill "decision"
        ▲                                                                              ▼
        └──────────────────────────────  data/match_decisions.csv  ◄──────────────────┘
        │
 scripts/build.ts   (validate, resolve claims, score confidence)
        │
        ▼
 public/db.json  ──►  Vite + React + Tailwind app at http://127.0.0.1:5173
```

There is no server and no database engine. The CSV files in `data/` **are** the database. You can open them in Excel or Google Sheets. `build.ts` turns them into one JSON file, and the browser reads it. The app only runs on your machine.

## 3. Where the data comes from today

| What | Where it came from | How | Caveats |
|---|---|---|---|
| 261 Bengaluru sites and 169 Pune sites, company names, HQ country, sector | Three web pages: [GCC Journal Bengaluru](https://gccjournal.in/insights/list-of-global-capability-centers-gcc-bangalore/) (50), [Flexiple Bengaluru](https://flexiple.com/global-capability-centers/list-of-global-capability-centers-in-bengaluru) (first 248 of 437) and [Flexiple Pune](https://flexiple.com/global-capability-centers/list-of-global-capability-centers-in-pune) (all 169) | Each page fetched once with a web-fetch tool, saved to `data/raw/*.txt`; `npm run load:dirs` converts them to rows | Commercial directories, not primary sources. Terms of use not checked. Not an automated scraper. |
| GCC counts (2,117 / 3,728 / ~1,700 / ~1,800), employees (2.36 million), broker leasing shares (30%+ / 35-40% / 45%) | Your project brief | Typed in as claims | 2,117, 3,728 and 2.36 million were checked against [Zinnov's report page](https://zinnov.com/centers-of-excellence/zinnov-nasscom-india-gcc-landscape-2026-report/) (the full report is gated). The rest are copied from the brief and unverified. |
| Office rent and leasing volume, Bengaluru and Pune | [Knight Frank India Real Estate, H1 2026](https://content.knightfrank.com/research/3116/documents/en/india-real-estate-office-and-residential-market-h1-2026-12927.pdf), page 13 | PDF downloaded; the rent table was read from the rendered page, because text extraction shifted values by a row | A broker that sells property advisory. Bengaluru INR 102, Pune INR 82 per sq ft per month. |
| Pune office market 2026 | Punekar News reporting Knight Frank (9M 2026); Free Press Journal reporting Cushman & Wakefield (Q2 2026); [KPMG Pune report](https://assets.kpmg.com/content/dam/kpmgsites/in/pdf/2026/06/pune-a-strong-growth-frontier-for-global-capability-centers-in-india.pdf) | Pages read; figures typed as claims | The two news items are secondary reports. They give different GCC shares (35% over 9M, 52% in Q2) for different periods, so they are separate rows, not a dispute. KPMG's 500+ count excludes micro and nano GCCs. |
| Provider engagements | [Ferguson's press release](https://www.theweek.in/wire-updates/business/2025/06/19/dcm47-ansr.html) (names ANSR), [ANSR's customers page](https://ansr.com/customers/), [TT&A's announcement](https://tta.in/?p=12496) | Pages read; typed as engagements | Only the Ferguson one is `gcc_confirmed` (issued by the GCC itself). The others are self-reported by the provider. |
| Bengaluru office rent, occupancy, GCC share of rentals; 4 named top-10 tenants | [Embassy REIT supplementary databook Q1 FY27](https://www.embassyofficeparks.com/wp-content/uploads/2026/07/embassy_reit_supplementary_databook.pdf), page 6 | Downloaded the PDF, read the page as an image, typed the figures as claims | A landlord's own figures; covers the whole Embassy portfolio, not only Bengaluru. Two anonymised tenants ("Large US Bank", "Fortune 500 Major Retail") are not guessed. |
| State incentives (Karnataka, Maharashtra, Gujarat) | Karnataka policy PDF (third-party copy), Grant Thornton Maharashtra summary, Gujarat DST page and a law-firm note | Text extracted with `pdftotext`, typed as claims with page numbers | Official Karnataka and Maharashtra documents not yet found; Gujarat percentages are in images not yet read. |
| Indian legal entities and CINs | GLEIF public API (free, no key) | `npm run gleif` writes candidates only | Candidates are suggestions; nothing links until you decide. |
| 6 cities | Seeded by hand | `cities.csv` | Just names and states. |
| Talent cost, rents for Chennai, Hyderabad, Mumbai, Ahmedabad | **Nothing yet** | Not collected | Those cities have no sites either, so their City pack is mostly empty. |
| Legal entities (company registration numbers) | Candidates only, from GLEIF; the MCA master itself is not downloaded | See above | data.gov.in lists "Company Master Data" (updated 13/10/2026) but the download needs a free data.gov.in API key, which I do not have. |

## 4. The tables (`data/*.csv`)

| File | Holds |
|---|---|
| `sources.csv` | Every place a fact can come from: name, publisher, URL, date, type (govt / industry_body / consultant / broker / press / company / submission), and the source's **commercial interest** (e.g. "sells GCC advisory") |
| `claims.csv` | **Every fact.** One row = one statement from one source. Columns: subject (which company/site/city), field, value, unit, period, source, dates, method, exact quote, page |
| `parents.csv` | Company groups (e.g. Microsoft). Identity only. |
| `entities.csv` | Legal entities in India (name, CIN, state). Identity only. |
| `sites.csv` | A GCC location: parent, city, function. Identity only. |
| `cities.csv`, `policies.csv` | Cities; state policy documents |
| `providers.csv`, `engagements.csv` | Service providers (legal, recruiting, real estate...) and which GCC they served |
| `match_decisions.csv` | Your recorded decisions about whether two records are the same company |

Key rule: the identity tables hold **no facts**. A site's HQ country, sector, opening year, rent and so on all live in `claims.csv`. So nothing can appear without a source.

## 5. Validation (`scripts/build.ts`)

`npm run build:data` refuses to write anything if any rule fails, and prints every error. It checks, among others:

- Column headers are exact; required fields are filled; enums are valid; IDs are unique.
- Every reference points to something that exists (a claim's source, a site's parent and city).
- Dates are YYYY, YYYY-MM or YYYY-MM-DD.
- Counts (any field ending `_count`) must state a **unit** (company, entity, site or unstated) and a **period**. This is what stops "2,117 companies" and "3,728 sites" being mistaken for the same thing.
- Every site and every engagement has at least one claim.
- A `gcc_confirmed` provider engagement needs a claim from a GCC or a submission, not from the provider alone.
- Anonymised case studies must have no parent or site filled in (the app never guesses the client).

Tested: a deliberately bad row produced 6 clear errors and wrote nothing.

## 6. How a value is decided (claims → facts)

1. Claims are grouped by **(subject, field, unit, period)**. Values are compared after trivial cleanup ("about", commas, "~").
2. **All agree** → one value. **They differ** → status `disputed`; every value is shown with its source. Nothing is deleted or overridden.
3. A "preferred" value is picked only for sorting and display: the highest-tier source, then the newest. It never hides the others.
4. **Old claims are never edited.** A correction is a new claim; if it conflicts, the dispute appears automatically.

### Confidence score

Start from the best source's tier weight:

| Source type | Weight |
|---|---|
| govt | 0.9 |
| industry_body | 0.7 |
| consultant, broker, gcc | 0.6 |
| press, company | 0.5 |
| submission | 0.4 |

Then: **+0.1** for each extra independent agreeing source (max +0.2); **−0.2** if the newest claim is older than 24 months; **−0.2** if disputed. Levels: **High ≥ 0.75, Medium ≥ 0.5, otherwise Low**. A site is capped at Medium until its legal entity is linked.

Example: the 261 directory sites sit at **Low/Medium**: the sources are `company` type (0.5), and the ones in both lists get +0.1 for agreement.

## 7. Matching names (`scripts/match.ts`)

The problem: "Acme Technology India Pvt Ltd" in the government register vs "Acme" in a press list. The script suggests, **you decide**.

1. Normalise names: drop "private limited", "pvt", "ltd", "india", "technologies", "services" and similar words.
2. Score each pair by adding up: same registration number = 1.0; same website domain +0.5; same core name up to +0.4; same state +0.1; same city +0.1; parent name inside the legal name +0.2.
3. Score ≥ 0.5 → goes into `data/review_queue.csv`. ≥ 0.9 also gets a "same" suggestion.
4. You fill `decision` (same / different / unsure). The next run moves your answers to `match_decisions.csv` and never asks again.
5. A `same` decision makes `build.ts` create the legal entity, with claims sourced to the MCA master, and link it to the site.

It deliberately catches traps like "Acme Foods India", which has the same core name as "Acme" but is a different company, and sends it to you. This was tested end-to-end on made-up data only.

**The directory loader uses a cruder rule:** companies in the two web lists are treated as the same if they start with the same first word, with a few exceptions (Fidelity, Siemens, "American", "First"). That can wrongly merge two companies. Spot-check it.

### GLEIF candidates (how legal entities get linked today)

`npm run gleif` asks GLEIF's free public API for Indian entities whose registered name starts with each company's name, keeping only active ones with an MCA registration number (CIN). They are written to `data/gleif_candidates.csv`. `npm run match` then queues the ones registered in a state where the company has a site. A `same` decision creates the legal entity, with claims sourced to GLEIF (name, CIN, incorporation date, LEI) and a "parent company" claim that records the review note.

Current state: 48 pairs are marked `same` with the note "Proposed by Claude ... Not yet reviewed by a person". They were the cases where the legal name matched the company name and it was the only candidate in the state. To undo one, delete its row in `data/match_decisions.csv` and rebuild. 67 pairs are still open in `data/review_queue.csv` (for example Amazon has six candidate entities).

## 8. MCA import (`scripts/import-mca.ts`)

Filters a company master CSV you download into `data/raw/`:
- Keeps only active companies whose sub-category contains "foreign" (subsidiaries of foreign companies).
- Keeps states KA, MH, TG, AP, TN, GJ and business/IT activity codes (read from the registration number).
- Drops email and address columns. **No director or personal data is kept.**

## 9. The app (`src/`)

One page with seven tabs, built with React and Tailwind CSS in plain black and white (no colour; emphasis comes from weight, borders and fill). Shared pieces live in `src/components/ui.tsx` (tabs, tables, badges, cards, filters). The data comes from `public/db.json`, loaded once.

**How every value looks.** Each value is a `<Fact>` (`src/Fact.tsx`): the value, then small badges, then an always-visible line "as reported by [publisher] · [date]". Click the value to open every claim behind it: value, unit, source link, date, method, page, exact quote, the source's commercial interest, the source's note, the date it was read, and a "Suggest a correction" link. Badges:

- **High** (solid black), **Medium** (outlined), **Low** (dashed grey): the confidence level (section 6).
- **disputed**: sources disagree; all values are shown, separated by "/".
- **unverified**: a source's note says it has not been checked against the original document. It can sit next to a High badge: confidence comes from the source type, not from whether I could check the original (for example, the Karnataka policy is a government document, read from a third-party copy).

### Tab 1: Overview

The honest headline. It has two parts:

1. **Coverage line.** "431 sites listed = 11.56% of 3,728 sites (source name, FY26). This registry does not list every GCC." The 3,728 comes from the newest `gcc_count` claim whose unit is "site", so the percentage compares sites with sites, never companies with sites.
2. **"How big is the ecosystem? Sources disagree."** Every ecosystem-level number, one row per field, unit and period, each with its sources: GCC counts (2,117 unstated / 3,728 sites / ~1,700 / ~1,800), the 2.36 million employees, and the three broker figures for GCC share of office leasing (30%+, 35-40%, 45%), which show as disputed.

Data: `claims.csv` rows with subject `ecosystem:india`.

### Tab 2: Registry

A searchable table of every site (431), sorted by company name. Columns: Company, India legal entity (name and CIN, or "not yet linked"), City, Industry, Parent country, Function, Confidence.

- **Filters:** a search box (company, legal name, CIN or city), city, function, parent country, industry, and entity linked or not. A counter shows "N of 431 sites".
- **Click a row** (or press Enter) to open a detail card below: the **site** facts (e.g. "listed as GCC in city"), the **company** facts (HQ country, sector, Embassy REIT tenant share, ...) and the **legal entity** facts (name, CIN, incorporation date, LEI, who matched it) when linked.
- Confidence stays at Medium or below here, because the sources are web directories and most sites have no legal entity yet.

Data: `sites.csv`, `parents.csv`, `entities.csv` plus their claims.

### Tab 3: City pack

The decision view for one city. A drop-down picks the city (all 6 are listed; only Bengaluru and Pune have sites). It shows, top to bottom:

1. A one-line count: "N GCC sites listed in [city]. Coverage is partial."
2. **Office rent and talent cost:** all facts about that city, e.g. rent per sq ft (Knight Frank, and for Bengaluru Embassy REIT's in-place and market rent), leasing volume, GCC share of leasing, vacancy, KPMG's Pune GCC count, REIT occupancy. A different period is a different row.
3. **[State] incentives:** the incentive facts of the policy for that city's state (Karnataka for Bengaluru, Maharashtra for Pune), with the policy link.
4. **Comparable GCCs:** the sites in that city (Company, Function, Opened, Confidence), with a function filter.
5. **Providers with delivery evidence:** providers ranked by 3 x engagements confirmed by the GCC + 1 x self-reported, ties by name, confirmed and self-reported shown in separate columns. Only engagements tied to a site in that city count, so today Bengaluru shows ANSR (Ferguson confirmed; Target and Lowe's self-reported), and Pune shows none. TT&A is not shown here because its engagement has no site or city; it appears on the Providers tab.

### Tab 4: Compare cities

Two drop-downs pick any two cities (default Bengaluru and Pune). The table has one row per measure and period that either city has a fact for, so a figure is only ever set against the same measure in the same period:

- the number of GCC sites listed in each city, and each city's state policy (with its link);
- every city fact: office rent, leasing volume, GCC share of leasing, vacancy, GCC counts and shares of India, REIT figures.

Each cell is a clickable `<Fact>`, or **"Not yet sourced"** where that city has no figure (not zero). Rents from different sources are different rows, because they are different measures (Knight Frank average, Embassy in-place, Embassy market). Pune has two GCC-share-of-leasing rows (35% over 9M 2026 from Knight Frank, 52% in Q2 2026 from Cushman & Wakefield) because the periods differ.

### Tab 5: State incentives

States side by side: columns are the policies (Karnataka, Maharashtra, Gujarat), each header linking to the policy document with its period. Rows are every incentive type any state has a fact for (capital subsidy, rental assistance, EPF reimbursement, electricity duty, ...), in alphabetical order. Each cell is a `<Fact>` (click for the quote and page) or **"No published figure"**, which means none was found, not zero. Karnataka has 8 incentives and Maharashtra 7, mostly in non-overlapping categories; Gujarat has 3 rows (targets, minimum 50 employees, lease-rent cap) because its percentages are in images not yet read.

### Tab 6: Providers

Providers that have at least one engagement with evidence (today ANSR and TT&A), ranked by 3 x engagements confirmed by the GCC + 1 x self-reported, ties by name; a category filter narrows the list. The table shows Confirmed, Self-reported and Disputed counts side by side, never summed. Under it, one evidence table per provider lists each engagement: the client (or "Anonymised, not attributed"), the city (or "Not stated"), the service, the status and the evidence claim with its source. A claim made only by the provider is never shown as confirmed: the Ferguson engagement is confirmed because Ferguson itself announced it; Target, Lowe's and N2G are self-reported. Providers with no evidence are not listed. Paid placement does not exist and cannot change the order.

### Tab 7: Method

A plain-language rulebook inside the app, with the same numbers the code uses (the tier weights and the 24-month staleness limit are read from `src/logic.ts`, so the page cannot drift). Nine items: units (company, entity, site), receipts, disagreements, confidence, matching names, providers, corrections, what is not stored, and coverage.

## 10. Neutrality

Provider ranking = `confirmed engagements × 3 + self-reported × 1`, ties broken by name. The two counts are always shown separately. The sponsorship table is never read by the ranking code, so paid placement cannot change the order. Weak signals set a visible flag on a claim; they never remove one.

## 11. Privacy and legal

Company-level, professional information only: companies, legal entities, city-level sites, provider firms. **No** director names, personal emails or phone numbers, or LinkedIn data. LinkedIn scraping is avoided because it breaks their terms.

Not yet resolved, so keep the app private: India's DPDP Act for any personal data in submissions; whether quoting these directories and paid reports is allowed; whether publishing "disputed" labels on providers carries defamation risk; each source's terms of use.

## 12. Why "0" appeared, and what is still empty

The CSVs started with only the brief's headline figures, so there were no sites, policies or providers to display. Since then: the directory lists filled the Registry (431 sites), policy documents filled State incentives, Knight Frank and Embassy REIT filled City pack rents, and ANSR and TT&A filled a handful of provider engagements. **Still thin or empty:** talent cost, rents for the four other cities, opening years, the 383 sites without a linked legal entity, and most providers (lawyers, recruiters, employer-of-record firms).

## 13. What would make it a real source of truth

1. Replace the web directories with primary sources: the MCA company master (needs a free data.gov.in API key), SEC EDGAR Exhibit 21 (blocked for me), the official state policy documents, REIT tenant lists (Knowledge Realty Trust and Mindspace downloads failed).
2. Verify the 6 remaining sources from the brief and add URLs, dates and page numbers.
3. Review the 48 proposed GLEIF entity links and the 67 open pairs in `data/review_queue.csv`.
4. Get GCCs and providers to confirm their own records (the `submission` / `gcc_confirmed` path).
5. Keep publishing coverage as a % of official counts, and never claim "every GCC".

## 14. Commands

| Command | Does |
|---|---|
| `npm run dev` | Rebuild data, then open the app at http://127.0.0.1:5173 |
| `npm run build:data` | Validate everything and write `public/db.json` |
| `npm run gleif` | Ask GLEIF's free API for Indian legal entities (with CINs) matching each parent; writes `data/gleif_candidates.csv` for you to review |
| `npm run load:dirs` | Rebuild the directory-derived rows (Bengaluru and Pune) from `data/raw/*.txt` |
| `npm run import:mca -- data/raw/<file>.csv` | Filter a downloaded MCA file |
| `npm run match` | Score entity pairs and manage the review queue |
| `npm test` | Self-checks for confidence rules, matching, MCA filter, directory loader |
| `npm run typecheck` | TypeScript check |
