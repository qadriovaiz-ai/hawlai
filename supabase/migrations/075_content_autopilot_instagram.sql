-- Content Autopilot now posts to Instagram alongside Facebook (when
-- an Instagram Business account is connected to the Page) — these
-- columns track that outcome separately from Facebook's, since
-- either platform can succeed or fail independently of the other.
alter table content_autopilot_log add column if not exists instagram_post_id text;
alter table content_autopilot_log add column if not exists instagram_error text;
