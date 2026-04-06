-- Grant OS core tables for Supabase (run via CLI or SQL Editor)

create table public.grant_opportunities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_url text not null,
  title text not null,
  agency text not null default '',
  eligibility text[] not null default '{}',
  closing_date text,
  funding_amount text,
  high_priority boolean not null default false,
  raw jsonb
);

create unique index grant_opportunities_source_title_uid
  on public.grant_opportunities (source_url, title);

create index grant_opportunities_created_at_idx
  on public.grant_opportunities (created_at desc);

create index grant_opportunities_high_priority_idx
  on public.grant_opportunities (high_priority desc, created_at desc);

create table public.pdf_analyses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  filename text not null,
  extracted_chars int not null,
  summary text not null
);

create index pdf_analyses_created_at_idx
  on public.pdf_analyses (created_at desc);

alter table public.grant_opportunities enable row level security;
alter table public.pdf_analyses enable row level security;

-- Live feed: anyone with anon key can read opportunities (no PII expected).
create policy "grant_opportunities_select_public"
  on public.grant_opportunities
  for select
  to anon, authenticated
  using (true);

-- PDF analyses stay server-side only (service role bypasses RLS).

create or replace function public.grant_opportunities_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger grant_opportunities_set_updated_at
  before update on public.grant_opportunities
  for each row
  execute procedure public.grant_opportunities_set_updated_at();
