-- ============================================================
-- What the departments have noticed, in one place (Brain, Phase 0b).
--
-- WHY: the vision's Cross-Intelligence chain — market research notices
-- something, competitor research confirms it, search demand agrees,
-- content backs it up, strategy concludes — needs the departments to be
-- able to READ each other. Today each one writes to its own table and
-- reads nobody else's: the only cross-department edges in the whole
-- system are the calendar reading the diagnosis and positioning, and
-- content reading the facts. Two edges is not a graph.
--
-- WHAT THIS IS NOT, so it doesn't become a duplicate of something that
-- already works:
--   business_memory  — durable, subjective insights about the business,
--                      written during chat and read back in chat.
--   opportunities    — a todo feed of things to DO, rule-based, with
--                      resolve semantics and a place in the UI.
--   *_alerts         — one channel's feed, shown to the owner as news.
-- A signal is none of those: it is a dated OBSERVATION with its evidence
-- attached, written by whichever engine saw it, for other engines to
-- read as input. It may later become an opportunity, or nothing at all.
--
-- THE HONESTY AXIS is `confidence`, and it is the reason this table is
-- worth having rather than a jsonb blob somewhere:
--   counted   — from this business's own rows. A number we added up.
--   observed  — read off a public page or a search result. Someone
--               else's claim, quoted accurately.
--   inferred  — a model's reading of the above. True only as far as the
--               model is.
-- Anything consuming signals must be able to tell these apart, because
-- "3 competitors added delivery" (observed) and "delivery is becoming
-- an expectation" (inferred) are not the same sentence.
--
-- Signals go stale. A competitor's price from two months ago is not
-- current, so every signal carries expires_at and readers filter on it
-- rather than quietly presenting old news as today's.
-- ============================================================

create table if not exists business_signals (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid not null references dealerships(id) on delete cascade,
  -- Which engine saw it.
  source text not null check (source in (
    'competitor_monitor', 'topic_monitor', 'positioning', 'seo', 'aeo',
    'content_results', 'diagnosis', 'season'
  )),
  -- What it is about, as a short slug the reader can group on.
  topic text not null,
  -- One sentence, in the owner's language, no jargon.
  summary text not null,
  -- The counted or quoted facts behind the sentence. Never the model's
  -- prose: a reader that wants to state a number takes it from here.
  evidence jsonb not null default '{}'::jsonb,
  confidence text not null check (confidence in ('counted', 'observed', 'inferred')),
  -- Where it came from, when it can be linked to.
  source_url text,
  observed_at timestamptz not null default now(),
  -- Seen again today: the row is touched, not duplicated.
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  -- The same observation seen twice is one signal. Computed by the
  -- writer from whatever makes it that observation.
  fingerprint text not null,
  unique (dealership_id, source, fingerprint)
);

create index if not exists idx_business_signals_read
  on business_signals(dealership_id, expires_at, observed_at desc);
create index if not exists idx_business_signals_source
  on business_signals(dealership_id, source, observed_at desc);

alter table business_signals enable row level security;
drop policy if exists "business_signals_owner_read" on business_signals;
create policy "business_signals_owner_read" on business_signals
  for select using (dealership_id in (select id from dealerships where owner_id = auth.uid()));
-- Written by the server only, like every other derived row.
