// What an approval MAKES comes back into the conversation.
//
// THE BUG, reported 21 November 2026 after the graphic card finally
// got its button. The owner approved an image. It was generated,
// saved, and arrived in the Design Studio — correctly, candles and not
// diyas. And the chat said:
//
//   "Applied to your store."   + "Open in department"
//
// The picture he had just paid for was not in the conversation, and
// the side panel went on saying "Not made yet" about a thing that now
// existed. To see what he had agreed to, he had to leave the chat.
//
// WHY THAT IS A PRINCIPLE PROBLEM AND NOT A COSMETIC ONE. This product
// is chat-first: website copy comes back into the conversation after
// approval, so do social posts. The one approval whose RESULT IS A
// PICTURE was the one that did not. The department page is meant to be
// a fallback, not the only way to see what you bought.
//
// THE CAUSE WAS ONE DISCARDED VALUE. decide.ts ran generateDesign,
// checked `made.ok`, and threw `made.url` away. The URL existed, was
// written to the database, and never reached the response.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { code } from "./helpers/source";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { ArtifactCard } from "@/components/chat/MasterChatPage";

const DECIDE = "src/lib/approvals/decide.ts";
const PAGE = "src/components/chat/MasterChatPage.tsx";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("1. THE SERVER KEEPS WHAT IT MADE", () => {
  it("THE LOAD-BEARING ONE: the generated URL is not discarded", () => {
    // `made.url` was computed and thrown away. The whole bug.
    const src = code(DECIDE);
    const at = src.indexOf('action_type === "generate_graphic"');
    expect(at, "the graphic branch is gone").toBeGreaterThan(-1);
    const branch = src.slice(at, at + 1600);
    expect(branch).toMatch(/produced = \{ imageUrl: made\.url/);
  });

  it("and it reaches the response rather than a local variable", () => {
    // A value captured and never returned is the same bug one line
    // later.
    const src = code(DECIDE);
    expect(src).toMatch(/return NextResponse\.json\(produced \? \{ \.\.\.data, produced \} : data\)/);
  });

  it("the decision and the publish verdict still travel too", () => {
    // `produced` is additional information, not a different answer —
    // the card needs the status and any read-back verdict as well.
    const src = code(DECIDE);
    expect(src).toMatch(/\.\.\.data, produced/);
  });
});

describe("2. THE CARD SHOWS IT, in the conversation", () => {
  const render = (artifact: any, onProduced?: any) =>
    renderToStaticMarkup(createElement(ArtifactCard as any, { artifact, onProduced }));

  it("the card has somewhere to put it", () => {
    // Rendered from state after the PATCH returns, so the markup of a
    // fresh card cannot show the image — what this asserts is that the
    // strip exists and is wired to that state, not that a first paint
    // contains a picture.
    const src = code(PAGE);
    expect(src).toMatch(/const \[producedImage, setProducedImage\] = useState/);
    expect(src).toMatch(/setProducedImage\(data\.produced\.imageUrl\)/);
    expect(src).toMatch(/const producedStrip = producedImage \?/);
  });

  it("THE STRIP IS NESTED INSIDE THE APPROVAL STRIP, not beside it", () => {
    // ArtifactCard has several return paths. The email card lost its
    // button on 10 October because one path rendered `{publishStrip}`
    // and not `{approvalStrip}`; three Shopify tools shipped with no
    // card at all in the morning. A result nested in the strip cannot
    // be forgotten by a path that renders the strip.
    const src = code(PAGE);
    const at = src.indexOf("const approvalStrip = artifact.approval ?");
    expect(at).toBeGreaterThan(-1);
    const strip = src.slice(at, src.indexOf("const publishStrip", at));
    expect(strip, "producedStrip is not inside approvalStrip").toContain("{producedStrip}");
  });

  it("it shows the IMAGE, not a link to go and find it", () => {
    // "Open in department" was the whole complaint.
    const src = code(PAGE);
    const at = src.indexOf("const producedStrip = producedImage ?");
    const strip = src.slice(at, at + 900);
    expect(strip).toMatch(/<img/);
    expect(strip).toMatch(/src=\{producedImage\}/);
  });

  it("and an ordinary card renders unchanged, with no image", () => {
    // The strip must not appear for approvals that make nothing.
    const html = render({
      kind: "record",
      label: "Search title & description",
      approval: { id: "ap-1" },
      confirm: "This changes what Google shows.",
      fields: [],
    });
    expect(html).toMatch(/>\s*Approve\s*</);
    expect(html).not.toContain("<img");
  });
});

describe("3. THE PANEL STOPS SAYING NOT MADE YET", () => {
  it("THE LOAD-BEARING ONE: the artifact becomes the real image", () => {
    // The panel renders by `type`, and `image_quote` says "Not made
    // yet" — correctly, before approval. After it, the same artifact
    // was still in the panel, still a quote.
    const src = code(PAGE);
    const at = src.indexOf("onProduced={({ imageUrl })");
    expect(at, "the page does not handle onProduced").toBeGreaterThan(-1);
    const handler = src.slice(at, at + 500);
    expect(handler).toMatch(/type: "image"/);
    expect(handler).toMatch(/url: imageUrl/);
    expect(handler).toMatch(/setActiveArtifact\(made\)/);
  });

  it("the quote's own panel text is still there for BEFORE approval", () => {
    // It was right until the moment the image existed, and removing it
    // would leave an empty panel again.
    const src = code(PAGE);
    expect(src).toMatch(/artifact\.type === "image_quote"/);
    expect(src).toMatch(/Nothing has been generated and nothing has been spent/);
  });

  it("and the callback is threaded all the way down", () => {
    // Page -> VisualArtifactStrip -> ArtifactCard. A callback declared
    // and never passed is the registry bug in miniature.
    const src = code(PAGE);
    expect(src).toMatch(/onProduced\?: \(produced: \{ imageUrl: string \}\) => void;/);
    expect(src).toMatch(/<ArtifactCard artifact=\{artifact\} onEdit=\{onEdit\} onProduced=\{onProduced\} \/>/);
    expect(src).toMatch(/onProduced\?\.\(\{ imageUrl: data\.produced\.imageUrl \}\)/);
  });
});
