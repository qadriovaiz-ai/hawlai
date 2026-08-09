-- Migration 092: Hybrid search support for the marketing knowledge
-- base — adds full-text search alongside the existing vector search,
-- so retrieval can combine keyword matching (catches exact terms
-- vector similarity sometimes misses) with semantic similarity.
-- Also adds lightweight response feedback (thumbs up/down) on
-- Master Chat messages — a real signal-capture step, even without a
-- full feedback-driven retraining loop built yet.

alter table marketing_knowledge add column if not exists search_vector tsvector
  generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))) stored;

create index if not exists idx_marketing_knowledge_search_vector on marketing_knowledge using gin(search_vector);

create or replace function keyword_search_marketing_knowledge(
  search_query text,
  match_count int default 8
)
returns table (
  id uuid,
  category text,
  title text,
  content text
)
language sql stable
as $$
  select id, category, title, content
  from marketing_knowledge
  where search_vector @@ websearch_to_tsquery('english', search_query)
  order by ts_rank(search_vector, websearch_to_tsquery('english', search_query)) desc
  limit match_count;
$$;

alter table chat_messages add column if not exists feedback text check (feedback in ('up', 'down'));

