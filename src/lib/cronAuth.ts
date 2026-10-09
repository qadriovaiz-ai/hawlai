// A cron endpoint with no secret set must refuse, not run.
//
// PHASE 2B. Two endpoints authenticated themselves like this:
//
//     if (cronSecret) { ...check the header... }
//     else console.warn("CRON_SECRET is not set — currently unprotected")
//
// So with the variable missing, anyone who knew the path could drain
// the event queue or run the daily autopilot for every business on the
// platform. The code said so in a log line nobody reads.
//
// Contrast the Meta webhook, which gets this right: verifyMetaSignature
// REJECTS every payload when FACEBOOK_APP_SECRET is unset, and says
// that is why. Same class of secret, opposite default. This brings the
// cron endpoints to the webhook's behaviour.
//
// The header is the only accepted carrier. daily-run also took the
// secret as `?secret=` in the query string, and a secret in a URL ends
// up in access logs, proxy logs and referrers — three places it cannot
// be recalled from. Vercel's own cron sends the Authorization header,
// so nothing legitimate needed the query form.

export type CronAuth = { ok: true } | { ok: false; reason: string; status: 401 | 503 };

/**
 * Whether this request is the scheduler.
 *
 * `missing secret` is 503 rather than 401 on purpose: 401 says "your
 * credential is wrong", and the truth is that the server is not
 * configured to accept any credential. An operator reading the status
 * code should be sent to the environment, not to the caller.
 */
export function authorizeCron(request: Request, secret = process.env.CRON_SECRET): CronAuth {
  const configured = (secret ?? "").trim();
  if (!configured) {
    return {
      ok: false,
      status: 503,
      reason: "CRON_SECRET is not set, so this endpoint refuses every request. Set it and redeploy.",
    };
  }
  const header = request.headers.get("authorization");
  if (header !== `Bearer ${configured}`) {
    return { ok: false, status: 401, reason: "Unauthorized" };
  }
  return { ok: true };
}
