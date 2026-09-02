// Request coalescing — the storm cap from the blank-dashboard incident.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWithTimeout } from "@/lib/hooks/fetchWithTimeout";

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

function stubFetch(delayMs = 0) {
  const spy = vi.fn(async () => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return { ok: true, json: async () => ({ value: "ok" }) } as any;
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("coalescing", () => {
  it("collapses concurrent mounts into ONE network request", async () => {
    const spy = stubFetch(20);
    const key = `k-${Math.random()}`;
    // 50 remounts firing before the first completes — the storm shape.
    const results = await Promise.all(
      Array.from({ length: 50 }, () => fetchWithTimeout<any>("/api/x", { dedupeKey: key }))
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.data?.value === "ok")).toBe(true);
  });

  it("serves a repeat mount from the recent-result window", async () => {
    const spy = stubFetch();
    const key = `k-${Math.random()}`;
    await fetchWithTimeout<any>("/api/x", { dedupeKey: key });
    await fetchWithTimeout<any>("/api/x", { dedupeKey: key });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("caches failures too, so a broken endpoint cannot be stormed", async () => {
    const spy = vi.fn(async () => ({ ok: false, status: 500 }) as any);
    vi.stubGlobal("fetch", spy);
    const key = `k-${Math.random()}`;
    const a = await fetchWithTimeout<any>("/api/x", { dedupeKey: key });
    const b = await fetchWithTimeout<any>("/api/x", { dedupeKey: key });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(a.error).toBeTruthy();
    expect(b.error).toBeTruthy();
  });

  it("does NOT coalesce when no key is given", async () => {
    const spy = stubFetch();
    // Writes must never be deduplicated — opt-in is the safeguard.
    await fetchWithTimeout<any>("/api/x", { method: "PATCH" });
    await fetchWithTimeout<any>("/api/x", { method: "PATCH" });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("keeps different keys independent", async () => {
    const spy = stubFetch();
    await fetchWithTimeout<any>("/api/a", { dedupeKey: `a-${Math.random()}` });
    await fetchWithTimeout<any>("/api/b", { dedupeKey: `b-${Math.random()}` });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("always settles", () => {
  it("returns a timeout result rather than hanging", async () => {
    vi.stubGlobal("fetch", vi.fn((_u: string, init: any) => new Promise((_res, rej) => {
      init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })));
    const res = await fetchWithTimeout<any>("/api/slow", { timeoutMs: 30 });
    expect(res.timedOut).toBe(true);
    expect(res.error).toBeTruthy();
    expect(res.data).toBeNull();
  });

  it("never rejects, so a missing catch cannot hide a failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    await expect(fetchWithTimeout<any>("/api/x")).resolves.toMatchObject({ data: null });
  });
});
