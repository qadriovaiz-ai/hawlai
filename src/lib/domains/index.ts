import type { DomainRegistrar } from "./types";
import { vercelRegistrar } from "./vercelRegistrar";
import { resellerClubRegistrar } from "./resellerClubRegistrar";

const REGISTRARS: DomainRegistrar[] = [vercelRegistrar, resellerClubRegistrar];

/** The first registrar with real credentials configured, or null if none are set up yet. */
export function getActiveRegistrar(): DomainRegistrar | null {
  return REGISTRARS.find((r) => r.configured) ?? null;
}

export function listRegistrarStatus(): { name: string; configured: boolean }[] {
  return REGISTRARS.map((r) => ({ name: r.name, configured: r.configured }));
}
