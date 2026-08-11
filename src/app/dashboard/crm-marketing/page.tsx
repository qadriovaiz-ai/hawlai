import { redirect } from "next/navigation";

// Retired: this page duplicated leads-hub (lead capture/qualification/
// pipeline links) and Home's own follow-up-reminder signal, with one
// genuinely unique piece — the public booking-link generator — which
// moved to the Appointments tab (see BookingLinkCard.tsx) since that's
// its natural home. Kept as a redirect, same pattern as
// /dashboard/master-brain and /dashboard/ads, so old links/bookmarks
// still land somewhere real instead of 404ing.
export default function CrmMarketingRedirect() {
  redirect("/dashboard/leads-hub?tab=appointments");
}
