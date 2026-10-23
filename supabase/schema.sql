-- Mirrors SPEC in scripts/build.ts. All columns are text (same all-strings shape as the CSVs);
-- blank = ''. Optional FKs (sites.entity_id, engagements.site_id/parent_id) are not enforced here
-- because blank is not a valid reference; build.ts checks them.
-- Run once in the Supabase SQL editor.

create table sources (
  source_id text primary key, name text not null, publisher text not null default '', url text not null default '',
  published_date text not null default '', type text not null
    check (type in ('govt','industry_body','consultant','broker','press','company','gcc','submission')),
  conflict_of_interest text not null default '', terms_note text not null default ''
);
create table parents (
  parent_id text primary key, name text not null, hq_country text not null default '',
  website_domain text not null default '', sector text not null default ''
);
create table entities (
  entity_id text primary key, parent_id text not null references parents, legal_name text not null,
  cin text not null default '', state text not null default '', incorporation_date text not null default '',
  mca_status text not null default ''
);
create table cities (city_id text primary key, name text not null, state text not null);
create table sites (
  site_id text primary key, entity_id text not null default '', parent_id text not null references parents,
  city_id text not null references cities,
  function text not null default '' check (function in ('','tech','finance','analytics','ops','mixed')),
  maturity_stage text not null default '', maturity_framework text not null default '', opened_year text not null default ''
);
create table policies (
  policy_id text primary key, state text not null, name text not null, period text not null default '',
  doc_url text not null default ''
);
create table providers (
  provider_id text primary key, name text not null,
  category text not null check (category in ('legal','recruit','real_estate','eor','advisory')),
  website text not null default ''
);
create table engagements (
  engagement_id text primary key, provider_id text not null references providers,
  site_id text not null default '', parent_id text not null default '', service text not null default '',
  status text not null check (status in ('self_reported','gcc_confirmed','disputed')),
  anonymised text not null check (anonymised in ('y','n'))
);
create table claims (
  claim_id text primary key,
  subject_type text not null
    check (subject_type in ('parent','entity','site','city','policy','provider','engagement','ecosystem')),
  subject_id text not null, field text not null, value text not null, unit text not null default '',
  period text not null default '', source_id text not null references sources, source_date text not null default '',
  retrieved_date text not null default '', method text not null check (method in ('manual','import','submission','derived')),
  quote text not null default '', page_ref text not null default '', flag text not null default ''
);
create table match_decisions (
  left_ref text not null, right_ref text not null,
  decision text not null check (decision in ('same','different','unsure')),
  decided_by text not null default '', decided_date text not null default '', note text not null default '',
  primary key (left_ref, right_ref)
);

create table submissions (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('report','engagement')),
  payload jsonb not null, contact text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  ip_hash text not null, created_at timestamptz not null default now()
);
create index on submissions (ip_hash, created_at);

-- RLS on with no policies: anon/authenticated get nothing. Only the service role (scripts, Edge Function) bypasses it.
alter table sources enable row level security;
alter table parents enable row level security;
alter table entities enable row level security;
alter table cities enable row level security;
alter table sites enable row level security;
alter table policies enable row level security;
alter table providers enable row level security;
alter table engagements enable row level security;
alter table claims enable row level security;
alter table match_decisions enable row level security;
alter table submissions enable row level security;
