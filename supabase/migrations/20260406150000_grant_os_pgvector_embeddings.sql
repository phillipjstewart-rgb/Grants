-- Semantic index: OpenAI text-embedding-3-small (1536 dimensions)

create extension if not exists vector;

create table public.grant_os_embeddings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_type text not null check (source_type in ('grant_opportunity', 'pdf_analysis')),
  source_id uuid not null,
  content text not null,
  embedding vector(1536) not null,
  unique (source_type, source_id)
);

create index grant_os_embeddings_hnsw_idx
  on public.grant_os_embeddings
  using hnsw (embedding vector_cosine_ops);

create index grant_os_embeddings_source_idx
  on public.grant_os_embeddings (source_type, source_id);

alter table public.grant_os_embeddings enable row level security;

-- Match RPC: service role only (no anon/authenticated execute)
create or replace function public.match_grant_os_embeddings(
  query_embedding vector(1536),
  match_count int default 12,
  filter_source_type text default null
)
returns table (
  source_type text,
  source_id uuid,
  content text,
  similarity real
)
language sql
stable
parallel safe
as $$
  select
    e.source_type,
    e.source_id,
    e.content,
    (1 - (e.embedding <=> query_embedding))::real as similarity
  from public.grant_os_embeddings e
  where filter_source_type is null or e.source_type = filter_source_type
  order by e.embedding <=> query_embedding
  limit least(coalesce(match_count, 12), 50);
$$;

revoke all on function public.match_grant_os_embeddings(vector, integer, text) from PUBLIC;
grant execute on function public.match_grant_os_embeddings(vector, integer, text) to service_role;
