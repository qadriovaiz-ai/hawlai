"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Minus, Plus, Trash2, ArrowRight } from "lucide-react";
import { getCart, updateQuantity, cartTotal, type CartItem, subscribeCart } from "@/lib/cart";

export default function CartPage() {
  const params = useParams();
  const slug = String(params.slug);
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(getCart(slug));
    return subscribeCart(slug, setItems);
  }, [slug]);

  const total = cartTotal(items);

  return (
    <div className="px-6 py-10 max-w-2xl mx-auto min-h-[60vh]">
      <h1 className="text-2xl font-bold mb-6">Your Cart</h1>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-neutral-400 mb-4">Your cart is empty.</p>
          <Link href={`/site/${slug}`} className="text-sm underline">Continue shopping</Link>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.productId} className="flex items-center gap-3 border border-neutral-200 rounded-xl p-3">
                <div className="w-16 h-16 bg-neutral-100 rounded-lg overflow-hidden shrink-0">
                  {item.image && <img src={item.image} alt={item.name} className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{item.name}</p>
                  <p className="text-sm text-neutral-500">₹{item.price.toLocaleString("en-IN")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQuantity(slug, item.productId, item.quantity - 1)} className="w-7 h-7 rounded-full border border-neutral-300 flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                  <span className="w-6 text-center text-sm">{item.quantity}</span>
                  <button onClick={() => updateQuantity(slug, item.productId, item.quantity + 1)} className="w-7 h-7 rounded-full border border-neutral-300 flex items-center justify-center"><Plus className="w-3 h-3" /></button>
                </div>
                <button onClick={() => updateQuantity(slug, item.productId, 0)} className="text-neutral-400 hover:text-red-500 ml-1"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between text-lg font-bold border-t border-neutral-200 pt-4">
            <span>Total</span>
            <span>₹{total.toLocaleString("en-IN")}</span>
          </div>

          <button
            onClick={() => router.push(`/site/${slug}/checkout`)}
            className="mt-6 w-full bg-neutral-900 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
          >
            Proceed to Checkout <ArrowRight className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}
