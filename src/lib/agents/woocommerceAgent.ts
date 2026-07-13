// ------------------------------------------------------------------
// WooCommerce Agent — REST API keys generated in the store's own
// wp-admin, no approval process, no OAuth app registration needed.
// ------------------------------------------------------------------

function normalizeStoreUrl(storeUrl: string): string {
  let url = storeUrl.trim();
  if (!/^https?:\/\//.test(url)) url = `https://${url}`;
  return url.replace(/\/$/, "");
}

export async function testWooCommerceConnection(storeUrl: string, consumerKey: string, consumerSecret: string): Promise<{ success: boolean; storeName?: string; error?: string }> {
  try {
    const domain = normalizeStoreUrl(storeUrl);
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    const res = await fetch(`${domain}/wp-json/wc/v3/system_status`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) {
      return { success: false, error: `WooCommerce returned ${res.status} — check the store URL and API keys` };
    }
    const data = await res.json();
    return { success: true, storeName: data?.settings?.title ?? domain };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export interface WooCommerceProduct {
  id: string;
  title: string;
  price: string | null;
  image_url: string | null;
  product_url: string | null;
}

export async function fetchWooCommerceProducts(storeUrl: string, consumerKey: string, consumerSecret: string, limit: number = 20): Promise<WooCommerceProduct[]> {
  const domain = normalizeStoreUrl(storeUrl);
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const res = await fetch(`${domain}/wp-json/wc/v3/products?per_page=${limit}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`WooCommerce returned ${res.status}`);
  const data = await res.json();
  return (data ?? []).map((p: any) => ({
    id: String(p.id),
    title: p.name,
    price: p.price ?? null,
    image_url: p.images?.[0]?.src ?? null,
    product_url: p.permalink ?? null,
  }));
}
