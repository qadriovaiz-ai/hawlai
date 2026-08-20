-- Automation Engine 2.0 — P1 Wave 6 (7a)
-- Second real step action type alongside send_email — queue_content
-- queues a generate_content agent_task (P1 Wave 3/4 infra) instead of
-- sending an email. WhatsApp/SMS stay unbuilt (neither is connected —
-- see workflowEngine.ts/040_marketing_automation.sql's own comment),
-- so this isn't faking those, just adding the one other action that's
-- genuinely real today.

alter table workflow_steps add column if not exists action_type text not null default 'send_email' check (action_type in ('send_email', 'queue_content'));
alter table workflow_steps add column if not exists content_type text;
alter table workflow_steps add column if not exists content_topic text;
