import { redirect } from "next/navigation";

// P0 12b — this page's controls (auto-pause, auto-generate-variant,
// seasonal prep, the dormant budget-reallocation display) all moved
// to /dashboard/autopilot, which is now the one canonical automation
// control surface instead of one of several partial ones. Redirecting
// rather than deleting so any existing bookmark/link still lands
// somewhere real.
export default function AutomationSettingsRedirect() {
  redirect("/dashboard/autopilot");
}
