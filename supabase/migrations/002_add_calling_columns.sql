alter table calls add column if not exists vapi_call_id text;
alter table calls add column if not exists direction text default 'outbound' check (direction in ('inbound', 'outbound'));
alter table calls add column if not exists triggered_at timestamptz;
