"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle } from "lucide-react";
import { getCart, clearCart, cartTotal, type CartItem } from "@/lib/cart";

export default function CheckoutPage() {
  const params = useParams();
  const slug = String(params.slug);
  const [items, setItems] = useState<CartItem[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    setItems(getCart(slug));
  }, [slug]);

  const total = cartTotal(items);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Please enter your name");
    if (phone.trim().length < 8) return setError("Please enter a valid phone number");
    if (address.trim().length < 5) return setError("Please enter a delivery address");
    if (items.length === 0) return setError("Your cart is empty");

    setLoading(true);
    try {
      const res = await fetch("/api/public/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          customerName: name,
          customerPhone: phone,
          customerEmail: email || null,
          shippingAddress: address,
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          honeypot,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      clearCart(slug);
      setOrderId(data.orderId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (orderId) {
    return (
      <div className="px-6 py-20 max-w-md mx-auto text-center">
        <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2">Order placed!</h1>
        <p className="text-sm text-neutral-500 mb-6">The business will contact you shortly to confirm. Payment is Cash on Delivery.</p>
        <Link href={`/site/${slug}`} className="text-sm underline">Back to store</Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-6 py-20 max-w-md mx-auto text-center">
        <p className="text-neutral-400 mb-4">Your cart is empty.</p>
        <Link href={`/site/${slug}`} className="text-sm underline">Continue shopping</Link>
      </div>
    );
  }

  return (
    <div className="px-6 py-10 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-6">Checkout</h1>

      <div className="bg-neutral-50 rounded-xl p-4 mb-6 space-y-1.5">
        {items.map((item) => (
          <div key={item.productId} className="flex justify-between text-sm">
            <span>{item.name} x{item.quantity}</span>
            <span>₹{(item.price * item.quantity).toLocaleString("en-IN")}</span>
          </div>
        ))}
        <div className="flex justify-between font-bold pt-2 border-t border-neutral-200 mt-2">
          <span>Total</span>
          <span>₹{total.toLocaleString("en-IN")}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input type="text" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} className="hidden" tabIndex={-1} autoComplete="off" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2.5" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2.5" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2.5" />
        <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Delivery address" rows={3} className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2.5" />

        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
          Payment: Cash on Delivery. The business will confirm your order by phone.
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button type="submit" disabled={loading} className="w-full bg-neutral-900 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Place Order
        </button>
      </form>
    </div>
  );
}
