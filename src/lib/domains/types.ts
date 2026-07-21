// Domain Registrar adapter interface — every registrar backend
// (Vercel Domains, ResellerClub, ...) implements this same shape so the
// rest of the app never needs to know which one is active. Selection
// happens in index.ts based on which credentials are actually
// configured in the environment.

export interface DomainAvailability {
  domain: string;
  available: boolean;
  price?: number; // in the registrar's native currency
  currency?: string;
}

export interface DomainPurchaseResult {
  success: boolean;
  registrarOrderId?: string;
  error?: string;
}

export interface DomainRegistrar {
  readonly name: string;
  readonly configured: boolean; // false when required env vars/credentials are missing
  checkAvailability(domain: string): Promise<DomainAvailability>;
  purchase(domain: string): Promise<DomainPurchaseResult>;
  /** Attach an already-purchased domain to the live Vercel project. */
  connectToProject(domain: string): Promise<{ success: boolean; error?: string }>;
}
