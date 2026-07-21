// Vercel Domains registrar adapter — buys and connects domains through
// Vercel's own domain registration service, billed to the Vercel
// account that owns this project. Natural fit since the site is
// already hosted on Vercel: a purchased domain can be auto-attached to
// the project with no separate DNS/registrar hop.
//
// Requires VERCEL_API_TOKEN (and optionally VERCEL_TEAM_ID) plus
// VERCEL_PROJECT_ID in env — none of which are configured yet, so
// `configured` is false and every call fails clearly rather than
// faking a result.

import type { DomainRegistrar, DomainAvailability, DomainPurchaseResult } from "./types";

const API_BASE = "https://api.vercel.com";

function authHeaders() {
  return { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`, "Content-Type": "application/json" };
}

function teamQuery() {
  return process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
}

export const vercelRegistrar: DomainRegistrar = {
  name: "vercel",
  configured: Boolean(process.env.VERCEL_API_TOKEN),

  async checkAvailability(domain: string): Promise<DomainAvailability> {
    if (!this.configured) throw new Error("Vercel Domains isn't connected yet — VERCEL_API_TOKEN is not set.");
    const res = await fetch(`${API_BASE}/v4/domains/price?name=${encodeURIComponent(domain)}${teamQuery() ? "&" + teamQuery().slice(1) : ""}`, {
      headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      // Vercel returns a 400 with an "unavailable" style error for taken domains.
      return { domain, available: false };
    }
    return { domain, available: true, price: data.price, currency: "USD" };
  },

  async purchase(domain: string): Promise<DomainPurchaseResult> {
    if (!this.configured) return { success: false, error: "Vercel Domains isn't connected yet — VERCEL_API_TOKEN is not set." };
    try {
      const res = await fetch(`${API_BASE}/v5/domains/buy${teamQuery()}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: domain }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data?.error?.message ?? "Purchase failed" };
      return { success: true, registrarOrderId: data?.uid ?? domain };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async connectToProject(domain: string): Promise<{ success: boolean; error?: string }> {
    if (!this.configured) return { success: false, error: "Vercel Domains isn't connected yet." };
    const projectId = process.env.VERCEL_PROJECT_ID;
    if (!projectId) return { success: false, error: "VERCEL_PROJECT_ID is not set." };
    try {
      const res = await fetch(`${API_BASE}/v10/projects/${projectId}/domains${teamQuery()}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: domain }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data?.error?.message ?? "Couldn't attach domain to project" };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};
