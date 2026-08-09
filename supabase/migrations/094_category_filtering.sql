-- Migration 094: Add optional category filtering to both marketing
-- knowledge search functions — real capability so retrieval CAN be
-- scoped to specific categories (e.g. objection_handling only) when
-- calling code has a reliable category signal, without forcing every
-- call to guess/filter blindly.

create or replace function match_marketing_knowledge(
  query_embedding vector(1024),
  match_count int default 5,
  filter_categories text[] default null
)
returns table (
  id uuid,
  category text,
  title text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    id,
    category,
    title,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from marketing_knowledge
  where filter_categories is null or category = any(filter_categories)
  order by embedding <=> query_embedding
  limit match_count;
$$;

create or replace function keyword_search_marketing_knowledge(
  search_query text,
  match_count int default 8,
  filter_categories text[] default null
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
    and (filter_categories is null or category = any(filter_categories))
  order by ts_rank(search_vector, websearch_to_tsquery('english', search_query)) desc
  limit match_count;
$$;
