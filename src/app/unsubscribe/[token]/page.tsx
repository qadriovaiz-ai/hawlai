import { createServiceClient } from "@/lib/supabase/service";
import { readUnsubscribeToken } from "@/lib/email/consent";
import { senderDisplayName } from "@/lib/email/resendClient";

// The page an email's "Unsubscribe" link opens. Showing it changes
// nothing — the person confirms with a button, so a link scanner opening
// the link can't unsubscribe anyone by accident.

export const dynamic = "force-dynamic";

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const { token } = await params;
  const { done, error } = await searchParams;

  const service = createServiceClient();
  let target: Awaited<ReturnType<typeof readUnsubscribeToken>> = null;
  let unavailable = false;
  try {
    target = await readUnsubscribeToken(service, token);
  } catch {
    unavailable = true;
  }
  let business = "this business";
  if (target) {
    const { data } = await service.from("dealerships").select("dealership_name").eq("id", target.dealershipId).maybeSingle();
    business = senderDisplayName(data?.dealership_name);
  }

  const shell = (children: React.ReactNode) => (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6", padding: 24, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
      <div style={{ maxWidth: 440, width: "100%", background: "#ffffff", borderRadius: 10, padding: "32px 28px", color: "#1f2328", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>{children}</div>
    </main>
  );

  if (unavailable || error) {
    return shell(
      <>
        <h1 style={{ fontSize: 20, margin: "0 0 10px" }}>Couldn't unsubscribe right now</h1>
        <p style={{ margin: 0, lineHeight: 1.6, color: "#5f6670" }}>Something went wrong on our side. Open the link from the email again in a few minutes.</p>
      </>
    );
  }

  if (!target) {
    return shell(
      <>
        <h1 style={{ fontSize: 20, margin: "0 0 10px" }}>This link isn't valid</h1>
        <p style={{ margin: 0, lineHeight: 1.6, color: "#5f6670" }}>Use the unsubscribe link at the bottom of the email you received.</p>
      </>
    );
  }

  if (done) {
    return shell(
      <>
        <h1 style={{ fontSize: 20, margin: "0 0 10px" }}>You're unsubscribed</h1>
        <p style={{ margin: 0, lineHeight: 1.6, color: "#5f6670" }}>
          {maskEmail(target.email)} won't get marketing emails from {business} again.
        </p>
      </>
    );
  }

  return shell(
    <>
      <h1 style={{ fontSize: 20, margin: "0 0 10px" }}>Unsubscribe from {business}?</h1>
      <p style={{ margin: "0 0 20px", lineHeight: 1.6, color: "#5f6670" }}>
        {maskEmail(target.email)} will stop getting marketing emails from {business}.
      </p>
      <form method="POST" action={`/api/public/unsubscribe/${encodeURIComponent(token)}`}>
        <input type="hidden" name="from" value="page" />
        <button type="submit" style={{ width: "100%", padding: "12px 16px", fontSize: 16, fontWeight: 700, color: "#ffffff", background: "#1f2937", border: 0, borderRadius: 6, cursor: "pointer" }}>
          Unsubscribe
        </button>
      </form>
    </>
  );
}
