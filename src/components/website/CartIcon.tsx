"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { getCart, cartCount, subscribeCart } from "@/lib/cart";

export default function CartIcon({ slug, color }: { slug: string; color: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(cartCount(getCart(slug)));
    return subscribeCart(slug, (items) => setCount(cartCount(items)));
  }, [slug]);

  if (count === 0) {
    return (
      <Link href={`/site/${slug}/cart`} className="relative" style={{ color }} aria-label="Cart">
        <ShoppingCart className="w-5 h-5 opacity-60" />
      </Link>
    );
  }

  return (
    <Link href={`/site/${slug}/cart`} className="relative" style={{ color }} aria-label="Cart">
      <ShoppingCart className="w-5 h-5" />
      <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{count}</span>
    </Link>
  );
}
