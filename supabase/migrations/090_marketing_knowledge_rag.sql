-- Migration 090: RAG Marketing Knowledge Base — real semantic retrieval
-- of marketing frameworks/playbooks/case studies into Master Chat's
-- context, instead of relying only on what's baked into the system
-- prompt. Uses Supabase's pgvector extension (no separate vector DB
-- service needed) + Voyage AI embeddings (Anthropic's recommended
-- embedding provider for RAG alongside Claude).
--
-- Requires a VOYAGE_API_KEY environment variable to actually populate
-- and query this table — until that's set, the retrieval code falls
-- back gracefully (Master Chat works exactly as before, just without
-- the extra knowledge injection).

create extension if not exists vector;

create table if not exists marketing_knowledge (
  id uuid primary key default uuid_generate_v4(),

  category text not null check (category in ('framework', 'case_study', 'channel_playbook', 'psychology', 'metrics')),
  title text not null,
  content text not null, -- the actual knowledge, written to be genuinely useful when injected into a conversation — not filler

  -- voyage-4-lite at its default output dimension. If a different
  -- Voyage model or dimension is ever used instead, this column
  -- (and every stored embedding) needs to be regenerated to match —
  -- cosine similarity is meaningless across mismatched dimensions/models.
  embedding vector(1024),

  created_at timestamptz default now()
);

-- Approximate nearest-neighbour index for fast cosine similarity
-- search. ivfflat needs at least ~1000 rows to be genuinely useful;
-- with only 10-15 seed rows tonight this index does effectively
-- nothing yet, but it's the correct index type to have in place as
-- the knowledge base grows over future sessions, rather than
-- retrofitting it later.
create index if not exists idx_marketing_knowledge_embedding on marketing_knowledge using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- This table is genuinely global platform knowledge (marketing
-- frameworks, not any business's private data) — no dealership_id,
-- no RLS needed. Every business's Master Chat draws from the same
-- shared knowledge base.
--
-- ***** SUPERSEDED BY MIGRATION 161 — DO NOT ACT ON THE PARAGRAPH
-- ***** ABOVE. It reasons only about reads, and is correct about
-- ***** them: there is no private data here to leak. It does not
-- ***** consider WRITES, and that is where the risk was. Because
-- ***** every tenant's Master Chat draws from this table, anyone who
-- ***** can write to it injects text into every other business's AI
-- ***** context. A 2026-09-02 audit found the `anon` role — the
-- ***** UNAUTHENTICATED one — holding INSERT, DELETE and TRUNCATE
-- ***** here with RLS off. Migration 161 enables RLS, adds a
-- ***** read-only policy for `authenticated`, and revokes those
-- ***** grants. "Shared by everyone" is the reason to protect this
-- ***** table, not the reason it needed no protection.

-- Supabase's JS client can't run raw vector operators (<=>) directly
-- in a .select() call — this RPC function is the standard way to
-- expose cosine-similarity search to application code.
create or replace function match_marketing_knowledge(
  query_embedding vector(1024),
  match_count int default 3
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
  order by embedding <=> query_embedding
  limit match_count;
$$;

