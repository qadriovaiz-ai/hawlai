-- ============================================================
-- Master audit Part C1.2/C1.3 — DND/opt-out enforcement + DPDP
-- consent tracking on leads.
--
-- dnd_opt_out is the only column that actually gates outreach
-- (calling, bulk email, future bulk WhatsApp) — a lead explicitly
-- marked do-not-contact must never be auto-messaged again.
--
-- consent_status is tracked/visible only, not enforced yet: leads
-- arrive today via CSV upload / Meta ad webhook with no consent-
-- capture flow, so every existing and new lead would default to
-- 'unknown' — enforcing opt-in-required send would silence the
-- entire leads base, a far bigger behavior change than this audit
-- item intended. Approved as Option A: block only explicit opt-outs,
-- track consent for visibility now, enforce later if needed.
-- ============================================================

alter table leads add column if not exists dnd_opt_out boolean not null default false;
alter table leads add column if not exists dnd_opt_out_at timestamptz;
alter table leads add column if not exists dnd_opt_out_source text;

alter table leads add column if not exists consent_status text not null default 'unknown'
  check (consent_status in ('unknown', 'granted', 'withdrawn'));
alter table leads add column if not exists consent_captured_at timestamptz;
alter table leads add column if not exists consent_source text;
