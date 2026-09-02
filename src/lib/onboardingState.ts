// ------------------------------------------------------------------
// Where is this user in onboarding? — ONE answer, one query shape.
// ------------------------------------------------------------------
// WHY THIS EXISTS. `onboarding_completed` decides two redirects that
// point at each other:
//
//   /dashboard/page  — complete    -> redirect /chat
//   /chat/layout     — NOT complete -> redirect /dashboard
//
// They are only safe while they agree. They were reading the same
// field through DIFFERENT query shapes — /dashboard via a direct
// select on dealerships, /chat via an embedded profiles->dealerships
// join — and this schema has a documented history of those two shapes
// diverging. Migration 117's own header records it: "a direct query on
// dealerships hit it in production; an embedded profiles->dealerships
// join apparently didn't, purely by chance of plan shape."
//
// When they disagree the result is an infinite redirect. Because
// Next.js resolves server redirects through RSC navigation rather than
// HTTP 302s, the browser never trips ERR_TOO_MANY_REDIRECTS — it just
// loops silently, remounting the dashboard layout each time and firing
// its client fetches again, until the connection pool is saturated and
// every request sits pending. Which is exactly what a blank dashboard
// with 126 stuck requests looks like.
//
// TWO RULES, both load-bearing:
//
//   1. One query shape, here, for every caller. Two shapes cannot
//      disagree if there is only one.
//   2. An inconclusive read is NOT "incomplete". It reports
//      `indeterminate`, and callers must not redirect on it. Being
//      wrong in the direction of letting someone in shows a slightly
//      wrong screen; being wrong in the direction of redirecting makes
//      the product unusable. Only one of those is recoverable by the
//      person using it.
// ------------------------------------------------------------------

export interface OnboardingState {
  dealershipId: string | null;
  dealershipName: string | null;
  ownerName: string | null;
  /** Defaults TRUE when the read is inconclusive — see rule 2. */
  onboardingCompleted: boolean;
  /** True when the dealership row could not be read at all. Never redirect on this. */
  indeterminate: boolean;
}

export async function resolveOnboardingState(supabase: any, userId: string): Promise<OnboardingState> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("dealership_id, full_name")
    .eq("id", userId)
    .maybeSingle();

  const dealershipId = profile?.dealership_id ?? null;
  if (!dealershipId) {
    return {
      dealershipId: null,
      dealershipName: null,
      ownerName: profile?.full_name ?? null,
      onboardingCompleted: true,
      indeterminate: true,
    };
  }

  // Direct select, deliberately — the shape /dashboard already used
  // successfully. maybeSingle() rather than single(): a missing row is
  // an answer to handle, not an exception to throw inside a layout.
  const { data: dealership, error } = await supabase
    .from("dealerships")
    .select("dealership_name, onboarding_completed")
    .eq("id", dealershipId)
    .maybeSingle();

  if (error || !dealership) {
    return {
      dealershipId,
      dealershipName: null,
      ownerName: profile?.full_name ?? null,
      onboardingCompleted: true,
      indeterminate: true,
    };
  }

  return {
    dealershipId,
    dealershipName: dealership.dealership_name ?? null,
    ownerName: profile?.full_name ?? null,
    onboardingCompleted: Boolean(dealership.onboarding_completed),
    indeterminate: false,
  };
}

/**
 * Should this caller redirect the user into onboarding?
 *
 * The only place that question gets answered, so no caller has to
 * remember that indeterminate must not redirect.
 */
export function shouldSendToOnboarding(state: OnboardingState): boolean {
  return !state.indeterminate && !state.onboardingCompleted;
}
