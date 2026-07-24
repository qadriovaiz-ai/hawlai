-- Multi-model video generation (Higgsfield-style model picker) —
-- track which model actually generated each video, and the raw task
-- id from whichever provider handled it (Gemini operation name for
-- Veo, Runway task id for everything else).
alter table video_generations add column if not exists model_key text default 'veo';
alter table video_generations add column if not exists task_id text;

-- operation_name stays for backward compatibility with existing Veo
-- rows; task_id is the generalized field new code should use going
-- forward for any provider.
update video_generations set task_id = operation_name where task_id is null and operation_name is not null;
