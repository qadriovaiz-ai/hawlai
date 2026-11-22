-- Phase 1 item 3 — what an approval actually produced.
--
-- THE FAILURE THIS EXISTS FOR, 21 November 2026. The owner approved a
-- graphic. It was generated, uploaded and saved to the Design Studio.
-- decide.ts checked `made.ok` and THREW `made.url` AWAY — a URL it had
-- just computed. The chat could only say "Applied to your store" with a
-- link to another page, and the side panel went on saying "Not made
-- yet" about a thing that now existed.
--
-- That was fixed by returning the URL to the BROWSER. The model still
-- could not see it, which is why the next turn offered to generate a
-- second image and charge again when the owner said "upload isi image".
--
-- WHY THE APPROVAL ROW AND NOT THE CHAT MESSAGE. The obvious home for
-- this is the artifact on the message that offered the card — the owner
-- sees the result where he asked for it. But `pending_approvals` has NO
-- link to a chat message, and the approval is pressed in a later
-- request than the one that wrote the message. Adding that link is a
-- bigger change than this item, and the approval row is the honest
-- place regardless: the approval IS the record of the action, so what
-- the action produced belongs on it.
--
-- SHAPE: whatever the action made, as a small flat object, e.g.
--   { "imageUrl": "https://…/guru-nanak.png", "id": "…" }
--   { "fileStatus": "UPLOADED", "url": null, "processing": true }
-- Deliberately not a schema per action type. The reader is a context
-- section and a card, both of which handle a missing key; a typed
-- column per action would need a migration for every new one.
--
-- NOT NULLABLE, DEFAULT EMPTY, for the reason 236 gives: null would
-- merge "produced nothing" with "could not be read", and an approval
-- that produced something must never be reported as having produced
-- nothing.
--
-- NOTHING SENSITIVE GOES IN HERE. It is read into an LLM prompt by the
-- context section that consumes it, so it holds addresses and ids of
-- things the owner already has — never a token, a key, or a customer's
-- details. The storage URLs it holds are already in chat_messages.artifacts.

alter table pending_approvals
  add column if not exists result_details jsonb not null default '{}'::jsonb;

comment on column pending_approvals.result_details is
  'What the approved action produced — e.g. {"imageUrl":"…"}. Written by applyApprovalDecision at the moment the work succeeds, so the chat can show the result and a later turn can re-use it instead of remaking it. Never holds tokens, keys or customer data: it is read into an LLM prompt.';
