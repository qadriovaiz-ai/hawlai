"use client";

import { useEffect, useState } from "react";
import { Star, Loader2 } from "lucide-react";

interface Review {
  id: string;
  customer_name: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

function Stars({ value, size = "w-4 h-4" }: { value: number; size?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${size} ${n <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-neutral-300"}`} />
      ))}
    </div>
  );
}

export default function ProductReviews({ productId }: { productId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [average, setAverage] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function load() {
    setLoading(true);
    fetch(`/api/public/products/${productId}/reviews`)
      .then((r) => r.json())
      .then((d) => {
        setReviews(d.reviews ?? []);
        setAverage(d.average ?? 0);
        setCount(d.count ?? 0);
      })
      .finally(() => setLoading(false));
  }
  useEffect(load, [productId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (phone.trim().length < 8) return setSubmitError("Enter the phone number used on your order");
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await fetch(`/api/public/products/${productId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), rating, comment: comment.trim() || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Couldn't submit your review");
      setSubmitted(true);
      setFormOpen(false);
      load();
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-t border-neutral-200 pt-8 mt-8">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div>
          <p className="text-lg font-bold">Reviews</p>
          {count > 0 ? (
            <div className="flex items-center gap-2 mt-1">
              <Stars value={average} />
              <span className="text-sm text-neutral-500">{average} out of 5 ({count} review{count === 1 ? "" : "s"})</span>
            </div>
          ) : (
            <p className="text-sm text-neutral-400 mt-1">No reviews yet</p>
          )}
        </div>
        {!formOpen && !submitted && (
          <button onClick={() => setFormOpen(true)} className="text-sm underline text-neutral-600">Write a Review</button>
        )}
      </div>

      {submitted && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">Thanks! Your review has been submitted.</p>}

      {formOpen && (
        <form onSubmit={handleSubmit} className="bg-neutral-50 rounded-xl p-4 mb-6 space-y-3">
          <p className="text-xs text-neutral-500">Only customers with a delivered order for this product can leave a review. Enter the phone number used on your order to verify.</p>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number used on your order" className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-600">Your rating:</span>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRating(n)}>
                  <Star className={`w-5 h-5 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-neutral-300"}`} />
                </button>
              ))}
            </div>
          </div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Share your experience (optional)" rows={3} className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2" />
          {submitError && <p className="text-xs text-red-500">{submitError}</p>}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={submitting} className="text-sm bg-neutral-900 text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Review"}
            </button>
            <button type="button" onClick={() => setFormOpen(false)} className="text-sm text-neutral-500">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-neutral-400">Loading reviews...</p>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div key={r.id} className="border-b border-neutral-100 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Stars value={r.rating} size="w-3.5 h-3.5" />
                <span className="text-sm font-semibold">{r.customer_name}</span>
                <span className="text-xs text-neutral-400">{new Date(r.created_at).toLocaleDateString("en-IN")}</span>
              </div>
              {r.comment && <p className="text-sm text-neutral-600">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
