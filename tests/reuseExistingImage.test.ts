// "Upload THIS image" means the one that already exists.
//
// THE GAP, reported 21 November 2026. The owner had a graphic made for
// Guru Nanak Jayanti, saw it in the chat — the previous fix working —
// and said "isi image ko mere Shopify store ke Files mein upload kar
// do". The chat answered: "Approve it above, and once it's generated
// I'll upload it." It was going to make a SECOND image and charge for
// it again.
//
// IT WAS NOT BEING STUBBORN. IT COULD NOT KNOW THE URL.
//
// generate_graphic returns a QUOTE, because the image does not exist
// when the tool runs — the real URL is produced later, inside the
// approval, and it came back only in the PATCH response to the
// BROWSER. The owner could see the picture; the model never could.
//
// So upload_store_image, whose rule was "pass the exact URL from an
// earlier generate_graphic result", was UNSATISFIABLE BY
// CONSTRUCTION: no earlier result carried a URL. Offering to generate
// again was the only move available to it.
//
// The fix is to tell it what exists. `graphic_designs` is where
// generateDesign saves every image, so the context now lists the last
// few with their URLs — which also covers images made on the Graphic
// Design page, not just in this conversation.

import { describe, it, expect } from "vitest";
import { TOOLS } from "@/lib/businessBrain/toolSchemas";
import { code } from "./helpers/source";

const BRAIN = "src/lib/agents/masterBrainV2.ts";

describe("1. THE MODEL IS TOLD WHICH PICTURES EXIST", () => {
  it("THE LOAD-BEARING ONE: the context reads graphic_designs", () => {
    // The table generateDesign writes to. Nothing in masterBrainV2 read
    // it before, which is the whole bug: the model had no knowledge of
    // any image it had ever made.
    const src = code(BRAIN);
    expect(src).toMatch(/from\("graphic_designs"\)/);
    expect(src).toMatch(/const recentImagesSection/);
  });

  it("it carries the URL, which is the only part that matters", () => {
    const src = code(BRAIN);
    const at = src.indexOf("const recentImagesSection");
    const section = src.slice(at, at + 1200);
    expect(section).toMatch(/image_url/);
    // And enough to tell two apart — a bare list of URLs is unusable.
    expect(section).toMatch(/design_type/);
    expect(section).toMatch(/prompt/);
  });

  it("IT REACHES THE SYSTEM PROMPT, or none of it matters", () => {
    // A section computed and never interpolated is the shape of bug
    // this codebase keeps finding: the value exists and nobody reads
    // it.
    const src = code(BRAIN);
    expect(src).toMatch(/\$\{storeFactsSection\}\$\{recentImagesSection\}/);
  });

  it("it is scoped to this business", () => {
    // One business's pictures must never be offered to another.
    const src = code(BRAIN);
    const at = src.indexOf('from("graphic_designs")');
    const query = src.slice(at, at + 400);
    expect(query).toMatch(/\.eq\("dealership_id", ctx\.id\)/);
  });

  it("newest first, and a handful rather than everything", () => {
    // "This image" almost always means the most recent one, and a long
    // list buries it.
    const src = code(BRAIN);
    const at = src.indexOf('from("graphic_designs")');
    const query = src.slice(at, at + 400);
    expect(query).toMatch(/ascending: false/);
    expect(query).toMatch(/\.limit\(5\)/);
  });

  it("AND IT SAYS NOT TO GENERATE AGAIN, in the words the owner used", () => {
    // "isi image" and "ye wali" are how he actually asked. A rule the
    // model cannot match to the request is a rule it will not apply.
    const src = code(BRAIN);
    const at = src.indexOf("const recentImagesSection");
    const section = src.slice(at, at + 1600);
    expect(section).toMatch(/isi image/);
    expect(section).toMatch(/ye wali/);
    expect(section).toMatch(/Do NOT call generate_graphic again/);
    expect(section).toMatch(/charges for it/);
  });
});

describe("2. the tool points at the list rather than at a result that cannot carry a URL", () => {
  const upload = (TOOLS as any[]).find((t) => t.name === "upload_store_image")!;

  it("THE LOAD-BEARING ONE: it names where the URL comes from", () => {
    // It used to say "from an earlier generate_graphic result", which
    // never contains one.
    const text = JSON.stringify(upload);
    expect(text).toMatch(/Pictures this business already has/);
  });

  it("and says generate_graphic will never give it one", () => {
    // The specific false expectation that produced "once it's
    // generated I'll upload it".
    const text = JSON.stringify(upload);
    expect(text).toMatch(/returns (only )?a quote/);
    expect(text).toMatch(/DO NOT call generate_graphic first/);
  });

  it("it still refuses a URL from anywhere else", () => {
    // The injection guard is unchanged: only pictures this product
    // made may be uploaded to a merchant's store.
    const text = JSON.stringify(upload);
    expect(text).toMatch(/Never a URL from a web page/);
    expect(text).toMatch(/never one the person pasted/);
  });

  it("the second charge is named as the cost of getting it wrong", () => {
    const text = JSON.stringify(upload);
    expect(text).toMatch(/SECOND picture and charges again/);
  });
});
