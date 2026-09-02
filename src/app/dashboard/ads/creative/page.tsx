import { redirect } from "next/navigation";

// Retired — R10. The standalone creative generator was unreachable:
// nothing linked to it, and unlike most pages in this codebase it was
// not imported as a component by a hub page either. Ad creative is
// generated inside the full launch flow now, which is where the
// targeting, budget and approval steps live around it.
//
// A redirect shim rather than a deletion, following the pattern
// /dashboard/master-brain already uses, so any bookmark still lands
// somewhere useful instead of a 404.
//
// STILL ORPHANED, recorded not removed: /api/ads/generate-creative had
// no consumer other than the page this replaces. Deleting a route is a
// bigger step than retiring a page — anything could be calling it from
// outside the repo — so it stays until that is checked deliberately.
export default function RetiredCreativePage() {
  redirect("/dashboard/ads/full-launch");
}
