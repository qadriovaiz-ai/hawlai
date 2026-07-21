// Client-side storefront cart — localStorage-backed, scoped per site
// slug so a visitor can browse multiple Hawlai storefronts without carts
// mixing. This is the customer's own browser storage on the dealer's
// live public website (not a Claude artifact), so localStorage is the
// right, normal choice here.

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

const CART_EVENT = "hawlai-cart-changed";

function storageKey(slug: string) {
  return `hawlai_cart_${slug}`;
}

export function getCart(slug: string): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(slug));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persist(slug: string, items: CartItem[]) {
  localStorage.setItem(storageKey(slug), JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: { slug } }));
}

export function addToCart(slug: string, item: Omit<CartItem, "quantity">, quantity = 1) {
  const items = getCart(slug);
  const existing = items.find((i) => i.productId === item.productId);
  if (existing) existing.quantity += quantity;
  else items.push({ ...item, quantity });
  persist(slug, items);
}

export function updateQuantity(slug: string, productId: string, quantity: number) {
  let items = getCart(slug);
  if (quantity <= 0) items = items.filter((i) => i.productId !== productId);
  else items = items.map((i) => (i.productId === productId ? { ...i, quantity } : i));
  persist(slug, items);
}

export function clearCart(slug: string) {
  persist(slug, []);
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

export function subscribeCart(slug: string, cb: (items: CartItem[]) => void): () => void {
  const handler = () => cb(getCart(slug));
  window.addEventListener(CART_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CART_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
