-- Allow multiple embedding rows per logical source (chunked PDF text, etc.)

alter table public.grant_os_embeddings
  drop constraint if exists grant_os_embeddings_source_type_source_id_key;

alter table public.grant_os_embeddings
  add column if not exists chunk_index integer not null default 0;

create unique index if not exists grant_os_embeddings_source_chunk_uid
  on public.grant_os_embeddings (source_type, source_id, chunk_index);

-- Wider candidate pool for multi-chunk sources (caller dedupes by source)
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
  limit least(coalesce(match_count, 12), 120);
$$;

revoke all on function public.match_grant_os_embeddings(vector, integer, text) from PUBLIC;
grant execute on function public.match_grant_os_embeddings(vector, integer, text) to service_role;
