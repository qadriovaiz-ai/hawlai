-- Advanced Billing — Usage/Pricing/Cost-Control spec, Phase 4 piece 1a.
--
-- VERIFIED before writing: dealerships has no legal name, billing
-- address, state, phone, or GSTIN anywhere — only dealership_name (a
-- trade name), city, owner_id. No subscriptions/invoices/billing_events
-- table exists. Hawlai's own subscription billing is entirely manual
-- today (UpgradeCta.tsx opens WhatsApp to negotiate an upgrade by
-- hand) — the existing Razorpay integration is per-dealership, for
-- THEIR customers' storefront orders, unrelated to Hawlai's own
-- revenue.
--
-- Scoped as RECORD-KEEPING infrastructure for the manual billing that
-- already happens, not an automated payment-collection system —
-- that's a materially larger, separate piece.
--
-- tax_inr's real computation, invoice_number's exact format, and
-- whether CGST/SGST needs separate line amounts are DELIBERATELY left
-- open here — those are real legal/tax questions sent to a CA, not
-- engineering decisions. This migration only builds the storage.
--
-- NOTE: this table set was created WITHOUT row-level security — that
-- gap was an oversight in the original proposal (RLS wasn't included
-- in the SQL sent for confirmation) and is closed by migration
-- 147b_billing_rls.sql, proposed and run immediately after this one
-- was discovered to be missing it. Do not treat this file as
-- reflecting a secure end state on its own.

-- Billing/legal identity, separate from operational dealership data.
-- One-to-one with dealerships, optional until a business needs a
-- real invoice.
create table if not exists billing_profiles (
  dealership_id uuid primary key references dealerships(id) on delete cascade,
  legal_business_name text,
  gstin text,                    -- nullable — many small proprietors won't have one
  billing_address_line1 text,
  billing_address_line2 text,
  billing_city text,
  billing_state text,            -- load-bearing for CGST+SGST vs IGST once confirmed
  billing_pincode text,
  billing_email text,
  updated_at timestamptz not null default now()
);

create table if not exists invoices (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  invoice_number text not null unique,  -- numbering scheme provisional, see generateInvoice.ts
  billing_period_start date not null,
  billing_period_end date not null,
  plan text not null,
  subtotal_inr numeric(10,2) not null,
  tax_inr numeric(10,2) not null default 0,   -- 0 until CA confirms rate/applicability
  total_inr numeric(10,2) not null,
  status text not null default 'draft' check (status in ('draft', 'issued', 'paid', 'void')),
  issued_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists billing_events (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade not null,
  invoice_id uuid references invoices(id) on delete set null,
  event_type text not null, -- 'invoice_issued' | 'payment_recorded' | 'plan_changed' | 'overage_charged'
  amount_inr numeric(10,2),
  metadata jsonb,
  created_at timestamptz not null default now()
);
