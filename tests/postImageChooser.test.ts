// THREE HONEST PLACES TO GET A PICTURE.
//
// Stopping the chat from inventing product photos (8 Oct 2026) left
// captions with nothing to post. "No image, because we can't draw your
// candle" is a correct answer and a useless one: the owner has photos of
// her candles on her phone and already on her own site.
//
// So: her own photo, her own site, or an AI graphic that admits what it
// is — in that order, because that is the order of how truthful each one
// is, and because only the last one costs money.
//
// What is pinned here: EXIF is stripped before anything is public, the
// library is built from rows this business owns and never from a storage
// listing, the picture in the payload is the picture the card shows, and
// where it came from is recorded on the piece.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  collectOwnImages,
  imagesInSections,
  isImageUrl,
  checkUpload,
  uploadPath,
  imageSourceLabel,
  UPLOAD_MAX_BYTES,
} from "@/lib/chat/postImages";

// --- what counts as a picture ----------------------------------------

describe("what can actually be posted", () => {
  it("http(s) with an image extension, and nothing else", () => {
    expect(isImageUrl("https://cdn.example/lavender.jpg")).toBe(true);
    expect(isImageUrl("https://cdn.example/a.png?token=x")).toBe(true);
    expect(isImageUrl("https://cdn.example/a.webp#frag")).toBe(true);
    // Graph fetches the URL itself, so a data URI silently fails at post
    // time rather than being posted.
    expect(isImageUrl("data:image/png;base64,AAAA")).toBe(false);
    // THE SCHEME IS CHECKED SEPARATELY FROM THE EXTENSION. These three
    // all end in a real image extension and none of them is a thing
    // Facebook could fetch - without this, a scheme check that was
    // quietly removed would still look tested, because "data:...png"
    // has no dot before "png" and fails the extension rule anyway.
    expect(isImageUrl("ftp://cdn.example/a.jpg")).toBe(false);
    expect(isImageUrl("file:///C:/Users/ovaiz/a.png")).toBe(false);
    expect(isImageUrl("data:image/png;base64,AAAA#a.png")).toBe(false);
    expect(isImageUrl("/local/relative.jpg")).toBe(false);
    expect(isImageUrl("https://cdn.example/page.html")).toBe(false);
    expect(isImageUrl(null)).toBe(false);
    expect(isImageUrl(42)).toBe(false);
  });
});

// --- her own photos --------------------------------------------------

describe("the pictures this business already has", () => {
  it("product photos lead, because they are the only ones that show what is for sale", () => {
    const images = collectOwnImages({
      products: [
        { name: "Lavender candle", images: ["https://cdn.example/lavender.jpg"] },
        { name: "Rose candle", images: ["https://cdn.example/rose.jpg", "https://cdn.example/rose-2.jpg"] },
      ],
      logoUrl: "https://cdn.example/logo.png",
      graphics: [{ design_type: "social_graphic", image_url: "https://cdn.example/old.png" }],
    });
    expect(images.map((i) => i.from)).toEqual(["product", "product", "product", "logo", "generated"]);
    expect(images[0]).toEqual({ url: "https://cdn.example/lavender.jpg", label: "Lavender candle", from: "product" });
    expect(images[4].label).toMatch(/Earlier graphic \(social graphic\)/);
  });

  it("images are found however deep the page block tree buried them", () => {
    const sections = [
      { type: "hero", props: { imageUrl: "https://cdn.example/hero.jpg" } },
      {
        type: "stack",
        children: [
          { type: "stack", children: [{ type: "image", props: { url: "https://cdn.example/deep.png", alt: "x" } }] },
          { type: "text", props: { html: "not an image" } },
        ],
      },
      { type: "banner", props: { backgroundImage: "https://cdn.example/bg.webp" } },
    ];
    expect(imagesInSections(sections)).toEqual([
      "https://cdn.example/hero.jpg",
      "https://cdn.example/deep.png",
      "https://cdn.example/bg.webp",
    ]);
  });

  it("a button's href is not a picture", () => {
    // `url` is an image key AND a button key, so the extension check is
    // what keeps a link out of the picture grid.
    expect(imagesInSections([{ type: "button", props: { url: "https://hawlai.online/site/c/cart", label: "Buy" } }])).toEqual([]);
  });

  it("the same photo used twice appears once", () => {
    const images = collectOwnImages({
      products: [{ name: "Lavender candle", images: ["https://cdn.example/a.jpg"] }],
      pages: [{ title: "Home", sections: [{ props: { url: "https://cdn.example/a.jpg" } }] }],
    });
    expect(images).toHaveLength(1);
    expect(images[0].from).toBe("product");
  });

  it("a page's name travels with its pictures, so the owner knows where she saw it", () => {
    const images = collectOwnImages({
      pages: [{ title: "About", sections: [{ props: { url: "https://cdn.example/workshop.jpg" } }] }],
    });
    expect(images[0].label).toBe("From your About page");
  });

  it("a product with no photo contributes nothing, rather than a broken tile", () => {
    expect(collectOwnImages({ products: [{ name: "Lavender candle", images: [] }] })).toEqual([]);
    expect(collectOwnImages({ products: [{ name: "x", images: null }] })).toEqual([]);
    expect(collectOwnImages({})).toEqual([]);
  });
});

// --- what an upload has to be ----------------------------------------

describe("an uploaded photo", () => {
  it("JPG, PNG and WEBP only", () => {
    expect(checkUpload("image/jpeg", 1000)).toEqual({ ok: true, mimeType: "image/jpeg", ext: "jpg" });
    expect(checkUpload("image/png", 1000)).toEqual({ ok: true, mimeType: "image/png", ext: "png" });
    expect(checkUpload("IMAGE/WEBP", 1000)).toEqual({ ok: true, mimeType: "image/webp", ext: "webp" });
    // GIF is allowed by the website builder's uploader and refused here:
    // posted as a photo it becomes a still frame nobody chose, and
    // Instagram rejects it outright.
    expect(checkUpload("image/gif", 1000)).toMatchObject({ ok: false });
    expect(checkUpload("application/pdf", 1000)).toMatchObject({ ok: false });
    expect(checkUpload("image/svg+xml", 1000)).toMatchObject({ ok: false });
  });

  it("is refused when empty or over 5MB, in words the owner can act on", () => {
    expect(checkUpload("image/jpeg", 0)).toEqual({ ok: false, error: "That file is empty." });
    const big = checkUpload("image/jpeg", UPLOAD_MAX_BYTES + 1);
    expect(big).toMatchObject({ ok: false });
    expect((big as any).error).toMatch(/over 5MB/);
    expect(checkUpload("image/jpeg", UPLOAD_MAX_BYTES).ok).toBe(true);
  });

  it("lands under the business's own id as the first folder, which is what the storage policies check", () => {
    expect(uploadPath("d1", "jpg", 1700000000000)).toBe("post-images/d1/1700000000000.jpg");
    // Second segment, after the prefix — the shape every policy on this
    // bucket is written against.
    expect(uploadPath("d1", "jpg").split("/")[1]).toBe("d1");
  });
});

// --- what the card says ----------------------------------------------

describe("where the picture came from is said out loud", () => {
  it("an AI graphic is never presented as a photo of the product", () => {
    expect(imageSourceLabel("ai")).toMatch(/not a photo of your product/);
    expect(imageSourceLabel("uploaded")).toBe("Your photo");
    expect(imageSourceLabel("site")).toBe("From your own photos");
    expect(imageSourceLabel(null)).toBeNull();
  });
});

// --- the endpoints ---------------------------------------------------

const upload = vi.fn(async (..._a: any[]) => ({ error: null }));
let rotated = false;
vi.mock("sharp", () => ({
  default: (buf: Buffer) => ({
    rotate: () => ((rotated = true), { toBuffer: async () => Buffer.concat([buf, Buffer.from("-clean")]) }),
  }),
}));

let tables: Record<string, any[]>;
function db() {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === undefined || r[k] === v));
    const api: any = {
      select: () => api,
      order: () => api,
      limit: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    storage: {
      from: () => ({
        upload: (...a: any[]) => upload(...a),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }),
      }),
    },
  }),
}));

import { POST as uploadRoute } from "@/app/api/social/post-image/upload/route";
import { GET as libraryRoute } from "@/app/api/social/post-image/library/route";

const png = Buffer.from("fake-png-bytes").toString("base64");
const call = (body: any) =>
  uploadRoute(new Request("https://hawlai.online/x", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  rotated = false;
  upload.mockClear();
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    products: [{ dealership_id: "d1", name: "Lavender candle", images: ["https://cdn.example/lavender.jpg"], order_index: 0 }],
    websites: [{ id: "w1", dealership_id: "d1", logo_url: "https://cdn.example/logo.png" }],
    website_pages: [{ website_id: "w1", title: "Home", sections: [{ props: { url: "https://cdn.example/hero.jpg" } }] }],
    graphic_designs: [],
  };
});

describe("uploading the owner's own photo", () => {
  it("EXIF IS STRIPPED BEFORE ANYTHING IS PUBLIC", async () => {
    const res = await call({ imageBase64: `data:image/png;base64,${png}` });
    expect(res.status).toBe(200);
    // A phone photo of a candle on a kitchen table carries GPS, and this
    // is about to be a public Facebook post.
    expect(rotated).toBe(true);
    // The stored bytes are sharp's output, not the bytes that arrived.
    expect((upload.mock.calls[0][1] as Buffer).toString()).toMatch(/-clean$/);
  });

  it("stores it under this business's own folder and returns the URL", async () => {
    const body = await (await call({ imageBase64: `data:image/png;base64,${png}` })).json();
    expect(upload.mock.calls[0][0]).toMatch(/^post-images\/d1\/\d+\.png$/);
    expect(body.url).toMatch(/^https:\/\/cdn\.example\/post-images\/d1\//);
    expect(body.source).toBe("uploaded");
  });

  it("a PDF renamed as an image is refused, and nothing is stored", async () => {
    const res = await call({ imageBase64: `data:application/pdf;base64,${png}` });
    expect(res.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it("A TYPE THE DATA URI CALLS AN IMAGE IS STILL CHECKED", async () => {
    // The PDF case above is caught by the data-URI pattern, which only
    // accepts "image/*" — so on its own it proves nothing about the type
    // check. A GIF and an SVG both look like images to that pattern and
    // must be refused by the check itself: a GIF posted as a photo
    // becomes a still frame nobody chose, and an SVG is a script
    // container, not a photograph.
    expect((await call({ imageBase64: `data:image/gif;base64,${png}` })).status).toBe(400);
    expect((await call({ imageBase64: `data:image/svg+xml;base64,${png}` })).status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it("junk instead of an image is refused before sharp is asked", async () => {
    expect((await call({ imageBase64: "not-a-data-uri" })).status).toBe(400);
    expect((await call({})).status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("the library of her own pictures", () => {
  it("is built from rows this business owns, NOT from listing the bucket", async () => {
    // ad-creatives is public-read and holds every business's files, so a
    // folder listing is the exact shape of a cross-business leak.
    const body = await (await libraryRoute()).json();
    expect(body.images.map((i: any) => i.url)).toEqual([
      "https://cdn.example/lavender.jpg",
      "https://cdn.example/hero.jpg",
      "https://cdn.example/logo.png",
    ]);
    expect(body.empty).toBe(false);
  });

  it("another business's product never appears", async () => {
    tables.products.push({ dealership_id: "d2", name: "Someone else's candle", images: ["https://cdn.example/theirs.jpg"], order_index: 0 });
    const body = await (await libraryRoute()).json();
    expect(JSON.stringify(body)).not.toMatch(/theirs\.jpg/);
  });

  it("nothing on file is said, not shown as a blank panel", async () => {
    tables.products = [];
    tables.websites = [{ id: "w1", dealership_id: "d1", logo_url: null }];
    tables.website_pages = [];
    const body = await (await libraryRoute()).json();
    expect(body.images).toEqual([]);
    expect(body.empty).toBe(true);
  });
});
