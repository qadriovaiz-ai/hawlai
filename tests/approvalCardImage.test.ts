// You can SEE what you are approving.
//
// The ad approval card claimed a real product photo and showed none.
// It had never shown one: the creative was passed as `url`, and a
// record card ignores `url` unless kind === "link"
// (MasterChatPage.tsx:867). The only reason a picture ever appeared in
// earlier tests was the MODEL choosing to write markdown into its
// reply — so "can I see the ad?" depended on the model's mood, which is
// the same non-determinism as the disambiguation list that vanished.
//
// A preview that describes an image in words is not a preview. The card
// now carries `imageUrl`, which MEANS "render this picture", separate
// from `url`, which means "a link to open".

import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";

function committed(file: string): string {
  return execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

describe("the renderer draws the picture", () => {
  const page = committed("src/components/chat/MasterChatPage.tsx");

  it("the Artifact type has a field that MEANS an inline image", () => {
    expect(page).toMatch(/imageUrl\?: string;/);
  });

  it("renders an <img> for it, not a link", () => {
    // Asserts the MEANING: imageUrl is passed to something that draws
    // an <img>. The first version pinned the exact JSX -- `imageUrl &&
    // (` and `src={artifact.imageUrl}` -- and broke the moment the
    // markup moved into a CardImage component that adds a visible
    // failure state. The picture was still rendered; only the shape
    // changed. Pinning shape makes a correct refactor look like a
    // regression, which is the same trap as pinning a message string.
    expect(page).toMatch(/artifact\.imageUrl &&/);
    expect(page).toMatch(/<CardImage src=\{artifact\.imageUrl\}|src=\{artifact\.imageUrl\}/);
    expect(page).toMatch(/<img\s/);
  });

  it("shows a VISIBLE failure when the image cannot load", () => {
    // A broken <img> renders as nothing, which is indistinguishable
    // from no image having been attached -- the ambiguity that cost
    // three rounds of diagnosis.
    expect(page).toMatch(/onError=\{\(\) => setFailed\(true\)\}/);
    expect(page).toMatch(/didn&apos;t load|didn't load/);
  });

  it("draws it ABOVE the fields — the picture is the thing being approved", () => {
    const body = page.slice(page.indexOf("{artifact.summary && !artifact.columns"));
    expect(body.indexOf("artifact.imageUrl")).toBeLessThan(body.indexOf("artifact.fields && artifact.fields.length"));
  });

  it("shows a thumbnail beside each candidate in a picker", () => {
    // Choosing WHICH PHOTO to advertise, from a list showing no photos,
    // was the same defect in miniature.
    expect(page).toMatch(/src=\{item\.imageUrl\}/);
  });
});

describe("the ad card supplies it", () => {
  const brain = committed("src/lib/agents/masterBrainV2.ts");
  const card = brain.slice(
    brain.indexOf('case "launch_meta_campaign": {', brain.indexOf("function extractArtifact")),
    brain.indexOf('case "propose_campaign_budget_change":', brain.indexOf("function extractArtifact"))
  );

  it("passes the creative as an image", () => {
    expect(card).toMatch(/imageUrl: result\.image_url/);
  });

  it("no longer passes it as `url`, which rendered nothing", () => {
    // The actual bug. Left as a regression guard because the two field
    // names are one character apart in intent and easy to swap back.
    expect(card).not.toMatch(/url: result\.image_url/);
  });

  it("passes each candidate's photo into the picker", () => {
    expect(card).toMatch(/imageUrl: c\.image_url/);
  });
});
