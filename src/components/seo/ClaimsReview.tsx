"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldAlert, Check, Trash2, PencilLine, CheckCircle2 } from "lucide-react";
import Link from "next/link";

// "Claims on your site" — the owner going through the lines Hawlai wrote
// on their behalf, one at a time.
//
// Three answers, and the first one is the interesting half: "Keep — it's
// true" writes the line into Business Knowledge, which makes the OWNER
// the source for it instead of the page that happened to print it. The
// claim stops being flagged because it has become genuinely backed, and
// every other surface may use it too.
//
// Nothing is removed from a live page unless they press Remove.

type Item = {
  pageId: string;
  pageSlug: string;
  pageTitle: string;
  blockId: string | null;
  field: string;
  sentence: string;
  reason: string;
  kind: "claim" | "comparative" | "contact" | "offer" | "product";
  /** The exact words flagged — what Keep would attest, and nothing more. */
  claim: string | null;
  keepable: boolean;
  /** What the sentence becomes if Remove is pressed. */
  removeLeaves: string;
  removable: boolean;
};

type Coverage = { slug: string; title: string; read: number; checked: number; ownerWritten: number; unreadable: boolean; items: number; contentSource: string | null };
type Totals = { pages: number; read: number; checked: number; items: number; unreadable: number };

const KIND_LABEL: Record<Item["kind"], string> = {
  contact: "Contact detail",
  offer: "Offer",
  claim: "Claim",
  comparative: "Comparison",
  product: "Product you don't sell",
};

export default function ClaimsReview() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  /** What was looked at, beside what was found. */
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [showCoverage, setShowCoverage] = useState(false);

  useEffect(() => {
    fetch("/api/seo/claims-review")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return setItems([]);
        setItems(Array.isArray(data.items) ? data.items : []);
        setReviewedAt(data.reviewedAt ?? null);
        setCoverage(Array.isArray(data.coverage) ? data.coverage : []);
        setTotals(data.totals ?? null);
      })
      .catch(() => setItems([]));
  }, []);

  const key = (item: Item) => `${item.pageId}:${item.blockId ?? ""}:${item.reason}`;

  async function decide(item: Item, action: "keep" | "remove") {
    setWorking(key(item));
    setError(null);
    try {
      const res = await fetch("/api/seo/claims-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // claim as well as sentence: Keep records the flagged words
        // only, and the server refuses without them.
        body: JSON.stringify({ action, sentence: item.sentence, claim: item.claim, kind: item.kind, pageId: item.pageId, blockId: item.blockId, field: item.field }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return setError(data?.error ?? "Couldn't save that — try again.");
      setDone((d) => ({ ...d, [key(item)]: action === "keep" ? "Kept — it's in your Business Knowledge now." : "Taken off the page." }));
    } catch {
      setError("Couldn't reach Hawlai — check your connection.");
    } finally {
      setWorking(null);
    }
  }

  async function finish() {
    setWorking("finish");
    const res = await fetch("/api/seo/claims-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "finish" }),
    });
    const data = await res.json().catch(() => null);
    setWorking(null);
    if (!res.ok) return setError(data?.error ?? "Couldn't save that — try again.");
    setReviewedAt(data.reviewedAt);
  }

  if (items === null) {
    return (
      <div className="card p-5 flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Reading your pages...
      </div>
    );
  }

  const outstanding = items.filter((i) => !done[key(i)]);

  return (
    <div className="card p-5 space-y-3">
      <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-slate-400" /> Claims on your site
      </p>

      {/* WHAT WAS LOOKED AT. A card that lists items and says nothing
          about the pages it was silent on makes a suppressed line and a
          clean line look identical — which is how the About page stayed
          invisible until somebody queried the database by hand. */}
      {totals && (
        <div className="text-[11px] text-slate-500">
          <button onClick={() => setShowCoverage((v) => !v)} className="hover:underline">
            Checked {totals.pages} {totals.pages === 1 ? "page" : "pages"}, {totals.checked} of {totals.read}{" "}
            {totals.read === 1 ? "line" : "lines"}
            {totals.unreadable > 0 ? ` — ${totals.unreadable} I couldn't read` : ""} ·{" "}
            {showCoverage ? "hide" : "show"} the breakdown
          </button>
          {showCoverage && (
            <div className="mt-1.5 space-y-1 border-l-2 border-slate-200 pl-2">
              {coverage.map((c) => (
                <div key={c.slug} className="flex items-baseline gap-1.5">
                  <span className="font-medium text-slate-600">{c.title}</span>
                  <span>
                    {c.unreadable
                      ? "has blocks I couldn't read any words out of — tell Hawlai, this is a bug"
                      : `${c.checked} of ${c.read} lines checked${c.ownerWritten > 0 ? `, ${c.ownerWritten} yours and left alone` : ""} · ${c.items} flagged`}
                  </span>
                </div>
              ))}
              <p className="text-slate-400 pt-0.5">
                Lines you wrote yourself are skipped on purpose — they&apos;re your words, not Hawlai&apos;s.
              </p>
            </div>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-green-600 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" /> Nothing on your pages says something your business can&apos;t back up.
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Hawlai wrote these lines when it built your site, and nothing in your catalogue or Business Knowledge backs them
            up. You know whether they&apos;re true — keep the ones that are, and they become part of what Hawlai knows about
            your business.
          </p>

          <div className="space-y-2.5">
            {items.map((item) => {
              const k = key(item);
              const settled = done[k];
              return (
                <div key={k} className="border border-slate-200 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                      {KIND_LABEL[item.kind]}
                    </span>
                    <span className="text-[11px] text-slate-400">{item.pageTitle} page</span>
                  </div>
                  <p className="text-sm text-slate-700">&ldquo;{item.sentence}&rdquo;</p>
                  <p className="text-xs text-slate-500">Flagged because {item.reason}.</p>
                  {/* What Keep would actually attest. The Instagram line
                      mixes a real handle with restock alerts nobody has
                      promised, so saying which words are in question is
                      the difference between a true statement and a
                      blanket one. */}
                  {item.keepable && item.claim && item.claim !== item.sentence && (
                    <p className="text-[11px] text-slate-500">
                      Keeping this records only <span className="font-semibold">&ldquo;{item.claim}&rdquo;</span> as true — not the rest of
                      the sentence.
                    </p>
                  )}
                  {!item.removable && (
                    <p className="text-[11px] text-amber-600">
                      This sentence is on a legal page and says more than the flagged words. Removing it would take the whole
                      sentence, including the part that tells customers where they stand — so edit it instead, with your eyes
                      on it.
                    </p>
                  )}
                  {item.kind === "comparative" && (
                    <p className="text-[11px] text-amber-600">
                      This compares your product with someone else&apos;s. Hawlai can&apos;t check a claim about goods you don&apos;t
                      make, whoever says it — so there&apos;s nothing to keep. Reword it to say what yours is, or take it off.
                    </p>
                  )}
                  {settled ? (
                    <p className="text-[11px] text-green-600">{settled}</p>
                  ) : (
                    <div className="space-y-1">
                      {/* Exactly what Remove deletes, before it is
                          pressed. A sentence that mixes a flagged claim
                          with real information is better edited than
                          cut, and the only way to know which is to see
                          what would be left. */}
                      {item.claim && item.claim !== item.sentence && (
                        <p className="text-[11px] text-slate-500">
                          Remove deletes the whole sentence, not just those words
                          {item.removeLeaves.replace(/<[^>]*>/g, "").trim()
                            ? <> — this block would read &ldquo;{item.removeLeaves.replace(/<[^>]*>/g, "").trim()}&rdquo;</>
                            : <> and leaves this block empty</>}
                          . Edit keeps the rest.
                        </p>
                      )}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      {item.keepable && (
                      <button
                        onClick={() => decide(item, "keep")}
                        disabled={working !== null}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" /> {item.kind === "contact" ? <>Keep — it&apos;s mine</> : <>Keep — it&apos;s true</>}
                      </button>
                      )}
                      <Link
                        href="/dashboard/website-builder"
                        className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center gap-1"
                      >
                        <PencilLine className="w-3 h-3" /> Edit
                      </Link>
                      {item.removable && (
                      <button
                        onClick={() => decide(item, "remove")}
                        disabled={working !== null}
                        className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-slate-300 text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Remove from page
                      </button>
                      )}
                    </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {reviewedAt ? (
        <p className="text-[11px] text-slate-400">
          You went through this on {new Date(reviewedAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}. From then on,
          Hawlai only treats your own words as proof of a claim — not text it wrote itself.
        </p>
      ) : (
        <div className="space-y-1.5 pt-1">
          <button
            onClick={finish}
            disabled={working !== null || outstanding.length > 0}
            className="text-xs text-brand-400 hover:underline disabled:opacity-50 disabled:no-underline"
          >
            {working === "finish" ? "Saving..." : "I've been through this list"}
          </button>
          <p className="text-[10.5px] text-slate-400">
            {outstanding.length > 0
              ? `${outstanding.length} still to decide. `
              : ""}
            After this, Hawlai stops treating its own writing as proof — only your catalogue, your Business Knowledge and
            words you wrote yourself count.
          </p>
        </div>
      )}
    </div>
  );
}
