-- Expose chunk_index for UI citations (drop + recreate: return shape changed)

drop function if exists public.match_analyzer_chunks(uuid, vector, integer);
drop function if exists public.match_analyzer_chunks(uuid, vector, int);

create or replace function public.match_analyzer_chunks(
  p_session_id uuid,
  query_embedding vector(1536),
  match_count int default 8
)
returns table (
  chunk_index int,
  content text,
  similarity real
)
language sql
stable
parallel safe
as $$
  select
    c.chunk_index,
    c.content,
    (1 - (c.embedding <=> query_embedding))::real as similarity
  from public.document_analyzer_chunks c
  where c.session_id = p_session_id
  order by c.embedding <=> query_embedding
  limit least(coalesce(match_count, 8), 32);
$$;

revoke all on function public.match_analyzer_chunks(uuid, vector, integer) from PUBLIC;
grant execute on function public.match_analyzer_chunks(uuid, vector, integer) to service_role;
