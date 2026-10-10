// THE LIVE BUG, 10 October 2026: a card with no button.
//
// Live-check step 3. The email card appeared, the approval row was
// written correctly (send_email, pending, kind=lead, request_id, the
// right confirm sentence) — and there was NO APPROVE BUTTON. The chat
// text said "Press Approve on the card above". The owner could not send
// the email at all.
//
// THE CAUSE. ArtifactCard has four return paths. The emailPreview branch
// returns its own JSX, and that JSX contained `{publishStrip}` — the
// button built from the old PublishAction descriptor — and never
// `{approvalStrip}`. G-3 step 3 deleted emailSendAction, so
// artifact.publish became undefined, publishStrip rendered nothing, and
// the branch had no button left.
//
// WHY NO EXISTING TEST CAUGHT IT. Every check was either on the ARTIFACT
// (approval.id is set — it was) or a source grep (approvalStrip is in
// the file — it is). Neither asks the only question that finds this:
// given THIS artifact, which return path runs, and what is inside it?
// That needs a render.
//
// This is the 3 October cardLayout incident repeating. That one cost
// five rounds of diagnosis for the same reason, and its own comment says
// so: "every source-reading test confirmed it, correctly."

// NOT jsdom, deliberately. jsdom defines `window`, and
// lib/supabase/service throws on sight of one - it holds the
// service-role key and refuses to load in anything that looks like a
// browser. MasterChatPage reaches it transitively, so a jsdom
// environment fails to import the file at all.
//
// renderToStaticMarkup needs no DOM: it walks the element tree and
// returns a string. Effects never run, which is exactly right here -
// the question is what the first paint contains, not what a click does.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }));

import { ArtifactCard } from "@/components/chat/MasterChatPage";

/** The markup the owner's browser would produce for this card. */
const render = (artifact: any) => renderToStaticMarkup(createElement(ArtifactCard as any, { artifact }));

const hasApprove = (html: string) => />\s*Approve\s*</.test(html);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ---------------------------------------------------------------------
// The email card — the one that broke live.
// ---------------------------------------------------------------------

const emailCard = (over: any = {}) => ({
  kind: "record",
  label: "Email ready to send",
  fields: [
    { label: "To", value: "asha@example.com" },
    { label: "Subject", value: "Slow evenings are back" },
  ],
  emailPreview: { to: "asha@example.com", subject: "Slow evenings are back", html: null, text: "Hello Asha," },
  approval: { id: "ap-1" },
  confirm: "This sends the email to asha@example.com now. It can't be unsent.",
  ...over,
});

describe("1. THE EMAIL CARD HAS AN APPROVE BUTTON", () => {
  it("IT RENDERS, for a card carrying an approval", () => {
    // The whole bug, in one assertion.
    const html = render(emailCard());
    expect(hasApprove(html)).toBe(true);
  });

  it("and a Reject button, so the decision has two directions", () => {
    expect(render(emailCard())).toMatch(/>\s*Reject\s*</);
  });

  it("THE CONFIRM SENTENCE IS ON SCREEN, above the button", () => {
    // A button that spends or sends with no sentence saying what it does
    // is the 8 October incident in miniature.
    const html = render(emailCard());
    expect(html).toContain("It can&#x27;t be unsent.");
    expect(html.indexOf("unsent")).toBeLessThan(html.indexOf(">Approve<"));
  });

  it("the preview is still there — this card's whole point", () => {
    const html = render(emailCard());
    expect(html).toContain("asha@example.com");
    expect(html).toContain("Hello Asha,");
  });

  it("the HTML preview renders in a sandboxed frame", () => {
    const html = render(emailCard({ emailPreview: { to: "a@b.com", subject: "s", html: "<p>hi</p>", text: "" } }));
    expect(html).toMatch(/<iframe[^>]*sandbox=""/);
  });

  it("NO APPROVAL MEANS NO BUTTON, not a dead one", () => {
    const html = render(emailCard({ approval: undefined, confirm: undefined }));
    expect(hasApprove(html)).toBe(false);
  });
});

// ---------------------------------------------------------------------
// The question Ovaiz asked: do the other two G-3 cards have the button?
// ---------------------------------------------------------------------

describe("2. THE GRAPHIC CARD — live-check step 1", () => {
  const card = (over: any = {}) => ({
    kind: "visual",
    type: "image_quote",
    label: "Image to generate",
    summary: "A poster for the lavender candle",
    departmentHref: "/dashboard/graphic-design",
    approval: { id: "ap-2" },
    confirm: "This makes one AI image now. It costs about ₹3.39 and counts against your plan's monthly image allowance.",
    ...over,
  });

  it("IT HAS AN APPROVE BUTTON", () => {
    expect(hasApprove(render(card()))).toBe(true);
  });

  it("AND THE PRICE IS ON SCREEN", () => {
    // Pressing a money button without seeing the money is the thing G-3
    // step 1 existed to fix.
    const html = render(card());
    expect(html).toContain("3.39");
    expect(html).toContain("monthly image allowance");
  });

  it("no approval, no button", () => {
    expect(hasApprove(render(card({ approval: undefined, confirm: undefined })))).toBe(false);
  });
});

describe("3. THE WEBSITE CARD — live-check step 2", () => {
  const card = (over: any = {}) => ({
    kind: "visual",
    type: "website",
    label: "Website Draft",
    url: "/dashboard/website-builder",
    summary: "Website built as a DRAFT with 5 pages (Home, About, Products, Contact, Terms).",
    departmentHref: "/dashboard/website-builder",
    approval: { id: "ap-3" },
    confirm: "This publishes your ENTIRE live site — every page, not just this one — and anyone with the link can see it straight away.",
    ...over,
  });

  it("IT HAS AN APPROVE BUTTON", () => {
    expect(hasApprove(render(card()))).toBe(true);
  });

  it("AND IT SAYS THE WHOLE SITE GOES PUBLIC", () => {
    expect(render(card())).toContain("ENTIRE live site");
  });

  it("no approval, no button", () => {
    expect(hasApprove(render(card({ approval: undefined, confirm: undefined })))).toBe(false);
  });
});

describe("4. THE SOCIAL CARD keeps its own button", () => {
  // Step 4 deliberately kept the descriptor, so this one is driven by
  // `publish` rather than `approval` — and must still render.
  it("THE PUBLISH BUTTON NAMES THE PAGE", () => {
    const html = render({
      kind: "record",
      label: "Instagram Post",
      summary: "Slow evenings start with the Lavender candle.",
      publish: {
        target: "social_post",
        label: "Publish to your Facebook Page: Candle by Qaaf",
        confirm: "This posts publicly.",
        endpoint: "/api/social/post",
        method: "POST",
        payload: { caption: "x", approval_id: "ap-4" },
        done: "✅ Posted",
      },
    });
    expect(html).toContain("Publish to your Facebook Page: Candle by Qaaf");
  });
});

// ---------------------------------------------------------------------
// The invariant, so the next return path cannot repeat this.
// ---------------------------------------------------------------------

describe("EVERY RETURN PATH THAT CAN CARRY AN APPROVAL RENDERS THE BUTTON", () => {
  // ArtifactCard has four. Each is reached by a different artifact
  // shape, and each is listed here BY the shape that reaches it — so a
  // fifth path added without the strip fails this rather than reaching
  // an owner.
  const shapes: [string, any][] = [
    ["emailPreview branch", { kind: "record", label: "E", emailPreview: { to: "a@b.com", subject: "s", html: null, text: "t" } }],
    ["simple confirmation branch", { kind: "record", label: "C", summary: "Added to your Products tab." }],
    ["full renderer (visual)", { kind: "visual", type: "image_quote", label: "V", summary: "s", departmentHref: "/x" }],
    ["full renderer (fields)", { kind: "record", label: "F", fields: [{ label: "A", value: "1" }] }],
  ];

  it.each(shapes)("%s renders Approve when the artifact carries one", (_name, shape) => {
    const html = render({ ...shape, approval: { id: "ap-x" }, confirm: "This does the thing." });
    expect(hasApprove(html)).toBe(true);
  });

  it.each(shapes)("%s shows the confirm sentence too", (_name, shape) => {
    const html = render({ ...shape, approval: { id: "ap-x" }, confirm: "This does the thing." });
    expect(html).toContain("This does the thing.");
  });

  it.each(shapes)("%s renders NO button without an approval", (_name, shape) => {
    expect(hasApprove(render(shape))).toBe(false);
  });
});

describe("why the compact branch needs no strip", () => {
  it("A CARD WITH AN APPROVAL IS NEVER A SIMPLE CONFIRMATION", async () => {
    // So the compact branch cannot be reached by one, and the
    // approvalStrip that used to sit in it was dead code - a mutation
    // deleting it broke nothing, correctly. Removed, because code that
    // looks like a guard and cannot run is what made both card
    // incidents slow: every source read confirmed the button was
    // "there". This is the condition that makes the removal safe.
    const { isSimpleConfirmation } = await import("@/lib/chat/cardLayout");
    expect(isSimpleConfirmation({ kind: "record", summary: "Added to your Products tab." })).toBe(true);
    expect(isSimpleConfirmation({ kind: "record", summary: "Added.", approval: { id: "ap-1" } })).toBe(false);
  });

  it("and such a card still renders its Approve button, via the full layout", () => {
    // The point of the routing: a decision card gets the layout that
    // can draw what is being decided.
    const html = render({ kind: "record", label: "C", summary: "Added.", approval: { id: "ap-1" }, confirm: "This does the thing." });
    expect(hasApprove(html)).toBe(true);
    expect(html).toContain("This does the thing.");
  });
});
