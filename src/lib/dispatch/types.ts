// THE DISPATCH ENVELOPE — S6/P1.
//
// One shape for every one-shot send: an email, a WhatsApp message, a
// public post, a phone call, a video upload, a reply to a customer.
//
// WHY IT IS NOT `src/lib/publish/` — and this is the whole reason there
// are two families rather than one Action type. CLAUDE.md says it in a
// line: publish/ is "edits to a resource on a platform (previewDiff,
// targetRef, staleness). NOT for one-shot sends". `publish/types.ts`
// defines `FieldChange.before` as "the baseline execution re-verifies
// against".
//
// A SENT EMAIL HAS NO `before`. It cannot be re-read from the platform,
// and it cannot be undone. Migration 208 already models it the other
// way round: rows there are CLAIMS WRITTEN BEFORE THE SEND, and
// `handoff_state: null` means it went. One Action type with an `undo()`
// that half its members must stub out is a contract that lies, which is
// what the architecture doc's §4.2 settled.
//
// SO `undoable` IS THE LITERAL `false`, not a boolean. A dispatcher
// cannot quietly grow an undo: the type will not allow it, and
// `cannotBeTakenBack` is required beside it — a sentence the OWNER
// reads on the card before he approves. The honest "this cannot be
// taken back" is part of asking, not a footnote afterwards.

export type DispatchKey = "place_outbound_call" | "publish_video";

/** What a dispatcher is handed. The service client, already authorised. */
export type DispatchContext = {
  service: any;
  dealershipId: string;
};

/** What the owner is being asked to approve. No side effects. */
export type DispatchPreview = {
  /** What will go out, in the owner's own terms. */
  summary: string;
  /**
   * Who receives it, named.
   *
   * REQUIRED, because the recipient is the half that cannot be undone.
   * "Send the offer" is not a thing anyone can approve; "send the offer
   * to Asha on 98xxxxxx12" is.
   */
  to: string;
  /** Anything the owner should know before saying yes. */
  warnings: string[];
};

export type DispatchResult =
  | {
      ok: true;
      /** What happened, for the owner. */
      note: string;
      /**
       * Did the platform CONFIRM it, or only accept it?
       *
       * The distinction is not pedantry. Two "couldn't confirm" reports
       * in one evening were a Meta pause that had worked and a read-back
       * that had not, and chat called it a network problem. Accepted but
       * unconfirmed is reported as itself.
       */
      verified: boolean;
    }
  | { ok: false; error: string; status: number };

export interface Dispatcher {
  readonly key: DispatchKey;

  /**
   * NO UNDO, EVER. See the header: a Dispatch has no `before` to
   * restore. The literal type is what stops a future dispatcher
   * declaring otherwise.
   */
  readonly undoable: false;

  /**
   * The sentence the owner reads before approving. It must say what
   * cannot be taken back, in his terms, not in the system's.
   */
  readonly cannotBeTakenBack: string;

  /** What will go out. Reads only — a preview that sent would be a send. */
  preview(ctx: DispatchContext, details: any): Promise<DispatchPreview | { error: string }>;

  /**
   * Do it, once.
   *
   * `once` IS THE CLAIM THIS SEND IS MADE UNDER — the approval's own id.
   * The route refuses a card that is not `pending` (S6/P1a, after
   * approving a call card twice placed two real calls), so the
   * no-repeat rule holds for every dispatcher whether or not its
   * platform offers an idempotency key. Where a platform DOES offer one
   * — a customer email's `request_id` under migration 208 — the
   * dispatcher passes this value to it, so the claim is taken on the
   * platform as well as in this product. Where it does not, the
   * dispatcher says so in its own comment rather than pretending.
   *
   * IT RE-READS ITS SUBJECT. A card can sit for hours: a number may
   * have changed, a customer may have opted out, a video may be gone.
   * Every dispatcher checks before it acts, and that check is the
   * reason a `preview` from an hour ago is not enough.
   */
  execute(ctx: DispatchContext, details: any, once: string): Promise<DispatchResult>;
}
