// The face of the sales agent, in the business's own colours.
//
// The widget launched with a generic chat bubble. A face says somebody
// is here; a bubble says there is a form. The tests that matter are the
// multi-tenant one — no palette of ours anywhere in it — and the one
// that keeps the face readable when it is drawn on its own colour.

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AgentAvatar from "@/components/website/AgentAvatar";
import { code } from "./helpers/source";

const render = (props: any) => renderToStaticMarkup(createElement(AgentAvatar as any, props));

/** The four themes a storefront can actually be set to. */
const THEME_DARKS = ["#122744", "#1F1B1B", "#1E3A2B", "#0B1E3D"];

describe("1. IT IS DRAWN IN THE BUSINESS'S OWN COLOURS — rule 3", () => {
  it("THE COLOUR COMES IN; NO PALETTE OF OURS IS BAKED IN", () => {
    // THE LOAD-BEARING MULTI-TENANT TEST. A robot that is always navy
    // is our brand on somebody else's shop.
    for (const dark of THEME_DARKS) {
      const svg = render({ color: dark });
      expect(svg, dark).toContain(dark);
    }
  });

  it("AND THE SOURCE CONTAINS NO COLOUR BUT THE FIXED GEOMETRY", () => {
    // White eyes and the dark screen the face sits on are geometry: the
    // eyes have to be lighter than the screen for a face to exist at
    // all. Any OTHER hex literal would be a palette choice made on a
    // business's behalf.
    const src = code("src/components/website/AgentAvatar.tsx");
    const hexes = new Set((src.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []).map((h) => h.toUpperCase()));
    expect([...hexes].sort()).toEqual(["#0B1220", "#FFFFFF"]);
  });

  it("two different businesses do not get the same drawing", () => {
    expect(render({ color: "#122744" })).not.toBe(render({ color: "#1E3A2B" }));
  });
});

describe("2. THE FACE SURVIVES BEING DRAWN ON ITS OWN COLOUR", () => {
  it("ON THE ACCENT BUTTON THE SHELL FLIPS, so the robot is not invisible", () => {
    // The launcher is a circle filled with the business's colour. A
    // robot drawn in that same colour on it would be a blank button.
    //
    // THE HEAD ITSELF, not "white appears somewhere". The first version
    // of this assertion was `toContain("#FFFFFF")`, which the white
    // EYES satisfy — so a mutation pinning the shell to the business's
    // colour survived it. The eyes are white in every variant; they
    // prove nothing about the shell.
    const head = (svg: string) => (svg.match(/<rect x="9"[^>]*>/) ?? [""])[0];

    const onButton = render({ color: "#122744", onColor: "#FFFFFF" });
    expect(head(onButton)).toContain('fill="#FFFFFF"');
    // ...and the business's colour is still present — it becomes the
    // face screen, so the drawing is still theirs.
    expect(onButton).toContain("#122744");

    // Off the button, the head is the business's colour again.
    expect(head(render({ color: "#122744" }))).toContain('fill="#122744"');
  });

  it("AND THE SCREEN IS OPAQUE THERE, not a translucent wash over white", () => {
    const onButton = render({ color: "#122744", onColor: "#FFFFFF" });
    expect(onButton).not.toContain("0.82");
    const plain = render({ color: "#122744" });
    expect(plain).toContain("0.82");
  });
});

describe("3. IT IS ONE DRAWING AT EVERY SIZE", () => {
  it("THE GEOMETRY DOES NOT CHANGE WITH THE SIZE — only the box does", () => {
    // Sharp at 14px and at 44px because it is the same vector scaled by
    // viewBox, not three crops of a raster.
    const small = render({ color: "#122744", size: 14 });
    const large = render({ color: "#122744", size: 44 });
    expect(small).toContain('width="14"');
    expect(large).toContain('width="44"');
    expect(small).toContain('viewBox="0 0 48 48"');
    expect(large).toContain('viewBox="0 0 48 48"');
    const strip = (s: string) => s.replace(/(width|height)="\d+"/g, "");
    expect(strip(small)).toBe(strip(large));
  });

  it("it is inline markup, not a request", () => {
    // The widget is on every page of a customer's storefront now. An
    // <img> is a round trip before the launcher can even be drawn.
    const svg = render({ color: "#122744" });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toContain("<img");
    // NOT "no http": the svg xmlns IS an http URI and is fetched by
    // nobody. What must be absent is anything that makes the browser go
    // and get something — a source, a link or a css url().
    expect(svg).not.toMatch(/\ssrc=/);
    expect(svg).not.toMatch(/\shref=/);
    expect(svg).not.toMatch(/url\(/);
    expect(svg).not.toMatch(/<image\b/);
  });

  it("IT HAS A FACE: two eyes and a mouth", () => {
    // Otherwise every assertion above passes on an empty box.
    const svg = render({ color: "#122744" });
    const eyes = svg.match(/<circle[^>]*fill="#FFFFFF"/g) ?? [];
    expect(eyes).toHaveLength(2);
    expect(svg).toContain('stroke="#FFFFFF"');
  });

  it("it is decorative — the control around it carries the label", () => {
    expect(render({ color: "#122744" })).toContain('aria-hidden="true"');
  });
});

describe("4. THE WIDGET USES IT, AND THE BUBBLE IS GONE", () => {
  const widget = () => code("src/components/website/ChatWidget.tsx");

  it("THE CHAT-BUBBLE ICON IS NO LONGER IMPORTED OR DRAWN", () => {
    expect(widget()).not.toMatch(/MessageCircle/);
  });

  it("THE LAUNCHER DRAWS THE ROBOT ON THE ACCENT BUTTON", () => {
    const src = widget();
    const start = src.indexOf("trackEvent(slug, \"chat_open\")");
    expect(start).toBeGreaterThan(-1);
    const button = src.slice(start, src.indexOf("</button>", start));
    expect(button).toMatch(/<AgentAvatar[^>]*onColor="#FFFFFF"/);
  });

  it("and the agent's own replies are the ones that carry a face", () => {
    const src = widget();
    const start = src.indexOf('m.role === "assistant" && (');
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf(")}", start));
    expect(block).toMatch(/<AgentAvatar/);
  });

  it("EVERY AVATAR IN THE WIDGET IS GIVEN THE BUSINESS'S COLOUR", () => {
    const src = widget();
    const mounts = src.match(/<AgentAvatar[^/]*\/>/g) ?? [];
    expect(mounts.length).toBeGreaterThanOrEqual(4);
    for (const m of mounts) expect(m, m).toMatch(/color=\{accentColor\}/);
  });
});
