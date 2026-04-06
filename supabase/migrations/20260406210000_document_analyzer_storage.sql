-- Persisted chunks for /tools/document-analyzer (survives server restarts; service role only)

create table public.document_analyzer_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  filename text not null,
  char_count int not null default 0
);

create table public.document_analyzer_chunks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.document_analyzer_sessions (id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536) not null,
  unique (session_id, chunk_index)
);

create index document_analyzer_chunks_session_idx
  on public.document_analyzer_chunks (session_id);

create index document_analyzer_chunks_hnsw_idx
  on public.document_analyzer_chunks
  using hnsw (embedding vector_cosine_ops);

alter table public.document_analyzer_sessions enable row level security;
alter table public.document_analyzer_chunks enable row level security;

-- Session-scoped semantic retrieval (service role only)
create or replace function public.match_analyzer_chunks(
  p_session_id uuid,
  query_embedding vector(1536),
  match_count int default 8
)
returns table (
  content text,
  similarity real
)
language sql
stable
parallel safe
as $$
  select
    c.content,
    (1 - (c.embedding <=> query_embedding))::real as similarity
  from public.document_analyzer_chunks c
  where c.session_id = p_session_id
  order by c.embedding <=> query_embedding
  limit least(coalesce(match_count, 8), 32);
$$;

revoke all on function public.match_analyzer_chunks(uuid, vector, integer) from PUBLIC;
grant execute on function public.match_analyzer_chunks(uuid, vector, integer) to service_role;
