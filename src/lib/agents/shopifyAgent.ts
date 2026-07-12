// ------------------------------------------------------------------
// Shopify Agent — merchant's own Custom App token, no OAuth approval
// ------------------------------------------------------------------
// Instead of Hawlai registering its own public Shopify app (a real
// review process, same category as Google/LinkedIn/TikTok Ads), the
// merchant creates a "Custom App" inside their OWN store admin
// (Settings -> Apps -> Develop apps), which takes a couple of
// minutes and needs no approval from Shopify at all, and pastes the
// generated Admin API access token here.
// ------------------------------------------------------------------

function normalizeStoreUrl(storeUrl: string): string {
  let url = storeUrl.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!url.includes(".myshopify.com") && !url.includes(".")) {
    url = `${url}.myshopify.com`;
  }
  return url;
}

export async function testShopifyConnection(storeUrl: string, accessToken: string): Promise<{ success: boolean; shopName?: string; error?: string }> {
  try {
    const domain = normalizeStoreUrl(storeUrl);
    const res = await fetch(`https://${domain}/admin/api/2024-01/shop.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { success: false, error: body?.errors ?? `Shopify returned ${res.status} — check the store URL and token` };
    }
    const data = await res.json();
    return { success: true, shopName: data.shop?.name };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export interface ShopifyProduct {
  id: string;
  title: string;
  price: string | null;
  image_url: string | null;
}

export async function fetchShopifyProducts(storeUrl: string, accessToken: string, limit: number = 20): Promise<ShopifyProduct[]> {
  const domain = normalizeStoreUrl(storeUrl);
  const res = await fetch(`https://${domain}/admin/api/2024-01/products.json?limit=${limit}`, {
    headers: { "X-Shopify-Access-Token": accessToken },
  });
  if (!res.ok) throw new Error(`Shopify returned ${res.status}`);
  const data = await res.json();
  return (data.products ?? []).map((p: any) => ({
    id: String(p.id),
    title: p.title,
    price: p.variants?.[0]?.price ?? null,
    image_url: p.images?.[0]?.src ?? null,
  }));
}
