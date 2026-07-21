// ResellerClub registrar adapter — India-focused domain reseller
// (INR pricing, GST-ready invoicing), a better long-term fit than
// Vercel Domains for Indian SMB customers but requires its own reseller
// account + API credentials (RESELLERCLUB_RESELLER_ID,
// RESELLERCLUB_API_KEY) which aren't set up yet — same shape as the
// pending Google Ads Basic Access approval. `configured` stays false
// until those are added to env.
//
// Unlike Vercel Domains, ResellerClub only registers the domain — it
// doesn't host anything, so connectToProject() can't auto-attach it.
// Once purchased, the owner (or Hawlai on their behalf) still needs to
// point the domain's DNS at Vercel; connectToProject() here returns
// the DNS instructions rather than pretending to do it automatically.

import type { DomainRegistrar, DomainAvailability, DomainPurchaseResult } from "./types";

const API_BASE = "https://domains.httpapi.com/api";

function authParams() {
  return `auth-userid=${process.env.RESELLERCLUB_RESELLER_ID}&api-key=${process.env.RESELLERCLUB_API_KEY}`;
}

export const resellerClubRegistrar: DomainRegistrar = {
  name: "resellerclub",
  configured: Boolean(process.env.RESELLERCLUB_RESELLER_ID && process.env.RESELLERCLUB_API_KEY),

  async checkAvailability(domain: string): Promise<DomainAvailability> {
    if (!this.configured) throw new Error("ResellerClub isn't connected yet — reseller account + API key required.");
    const [name, ...tldParts] = domain.split(".");
    const tld = tldParts.join(".");
    const res = await fetch(`${API_BASE}/domains/available.json?${authParams()}&domain-name=${encodeURIComponent(name)}&tlds=${encodeURIComponent(tld)}`);
    const data = await res.json();
    const entry = data?.[domain];
    return { domain, available: entry?.status === "available" };
  },

  async purchase(domain: string): Promise<DomainPurchaseResult> {
    if (!this.configured) return { success: false, error: "ResellerClub isn't connected yet — reseller account + API key required." };
    // Real registration on ResellerClub needs a registered customer-id
    // and contact-id (registrant details) created ahead of time via
    // their Customer/Contact APIs — intentionally not stubbed here
    // since fabricating registrant identity data would be wrong. This
    // fails clearly until that onboarding step exists.
    return { success: false, error: "ResellerClub purchase requires registrant contact details to be set up first — not yet implemented." };
  },

  async connectToProject(domain: string): Promise<{ success: boolean; error?: string }> {
    return {
      success: false,
      error: `ResellerClub only registers the domain. Point its DNS at Vercel manually: add a CNAME record for "${domain}" to cname.vercel-dns.com (or an A record to 76.76.21.21), then add the domain in the Vercel project settings.`,
    };
  },
};
