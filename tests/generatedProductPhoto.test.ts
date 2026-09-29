// Chat may not offer an invented photograph of a real product.
//
// Asked about a missing product image, the chat offered to "generate a
// clean product-style image" of the Lavender Candle — a real product,
// really for sale. A generated picture of it is not it: a customer who
// buys from that image was shown something that does not exist, and the
// business would be the one answering for it.
//
// Generated images stay fine where nothing is being represented as the
// goods: ad backdrops, banners, social graphics.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { TOOLS } from "@/lib/agents/masterBrainV2";

const brain = readFileSync("src/lib/agents/masterBrainV2.ts", "utf8");

describe("generated images and real products", () => {
  it("the tool itself says it is not for a real product's photo", () => {
    const tool: any = TOOLS.find((t: any) => t.name === "generate_graphic");
    expect(tool.description).toMatch(/NEVER use this to stand in for a photograph of a REAL product/);
    expect(tool.description).toMatch(/use the photo already in their catalogue, or ask them to upload one/);
    // And it no longer advertises "product photo" as a thing to make.
    expect(tool.description).not.toMatch(/logo-style asset, product photo/);
  });

  it("the system prompt says what to offer instead", () => {
    expect(brain).toMatch(/A generated image is never a real product's photo/);
    expect(brain).toMatch(/never offer to "generate a clean product-style image" of a real product/);
    expect(brain).toMatch(/ask them to send one/);
  });

  it("still allows generated images where nothing is misrepresented", () => {
    const tool: any = TOOLS.find((t: any) => t.name === "generate_graphic");
    expect(tool.description).toMatch(/ad creative, social graphic, banner, poster/);
    expect(brain).toMatch(/for an ad backdrop, a banner or a social graphic that is exactly right/);
  });

  it("matches what the ad launcher already does with a real product photo", () => {
    // launch_meta_campaign builds the creative around the REAL product
    // photo when there is one and says which was used — this rule is
    // that behaviour stated for the rest of the chat.
    const launch: any = TOOLS.find((t: any) => t.name === "launch_meta_campaign");
    expect(launch.description).toMatch(/REAL product photo/);
  });
});
