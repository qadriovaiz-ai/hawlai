-- YouTube — unlike Meta (a page access token), Google requires a real
-- OAuth flow with a refresh token to upload video on someone's behalf
-- indefinitely (access tokens expire hourly). Same pattern already
-- proven working for Google Ads (migration for google_ads_* columns)
-- — mirrored here for YouTube's own scope/tokens rather than reusing
-- the Ads connection, since a dealer may want to connect a YouTube
-- channel without necessarily running Google Ads.
alter table dealerships add column if not exists youtube_channel_id text;
alter table dealerships add column if not exists youtube_channel_title text;
alter table dealerships add column if not exists youtube_access_token text;
alter table dealerships add column if not exists youtube_refresh_token text;
alter table dealerships add column if not exists youtube_token_expiry timestamptz;

-- Tracks whether/where a generated video got published — a video can
-- exist (video_generations.video_url) without ever being published,
-- publishing is a separate, explicit action.
alter table video_generations add column if not exists youtube_video_id text;
alter table video_generations add column if not exists youtube_url text;
alter table video_generations add column if not exists youtube_publish_error text;
