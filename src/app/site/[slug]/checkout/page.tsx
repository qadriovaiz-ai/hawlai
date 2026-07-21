"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle, Tag, X } from "lucide-react";
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
  const [couponInput, setCouponInput] = useState("");
  const [couponApplying, setCouponApplying] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [discountAmount, setDiscountAmount] = useState(0);

  useEffect(() => {
    setItems(getCart(slug));
  }, [slug]);

  const subtotal = cartTotal(items);
  const total = Math.max(0, subtotal - discountAmount);

  async function applyCoupon() {
    if (!couponInput.trim()) return;
    setCouponApplying(true);
    setCouponError(null);
    try {
      const r = await fetch("/api/public/discounts/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, code: couponInput.trim(), subtotal }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Invalid code");
      setAppliedCode(couponInput.trim().toUpperCase());
      setDiscountAmount(d.discountAmount);
      setCouponInput("");
    } catch (err: any) {
      setCouponError(err.message);
    } finally {
      setCouponApplying(false);
    }
  }

  function removeCoupon() {
    setAppliedCode(null);
    setDiscountAmount(0);
  }

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
          discountCode: appliedCode,
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

      <div className="bg-neutral-50 rounded-xl p-4 mb-4 space-y-1.5">
        {items.map((item) => (
          <div key={item.productId} className="flex justify-between text-sm">
            <span>{item.name} x{item.quantity}</span>
            <span>₹{(item.price * item.quantity).toLocaleString("en-IN")}</span>
          </div>
        ))}
        <div className="flex justify-between text-sm pt-2 border-t border-neutral-200 mt-2">
          <span>Subtotal</span>
          <span>₹{subtotal.toLocaleString("en-IN")}</span>
        </div>
        {appliedCode && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Discount ({appliedCode})</span>
            <span>-₹{discountAmount.toLocaleString("en-IN")}</span>
          </div>
        )}
        <div className="flex justify-between font-bold pt-2 border-t border-neutral-200 mt-2">
          <span>Total</span>
          <span>₹{total.toLocaleString("en-IN")}</span>
        </div>
      </div>

      {appliedCode ? (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4 text-sm">
          <span className="text-green-700 flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> {appliedCode} applied</span>
          <button onClick={removeCoupon} className="text-green-700 hover:text-green-900"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <div className="mb-4">
          <div className="flex gap-2">
            <input value={couponInput} onChange={(e) => setCouponInput(e.target.value)} placeholder="Discount code" className="flex-1 text-sm border border-neutral-300 rounded-lg px-3 py-2" />
            <button onClick={applyCoupon} disabled={couponApplying || !couponInput.trim()} className="text-sm bg-neutral-200 hover:bg-neutral-300 px-4 py-2 rounded-lg disabled:opacity-50">
              {couponApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
            </button>
          </div>
          {couponError && <p className="text-xs text-red-500 mt-1">{couponError}</p>}
        </div>
      )}

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
