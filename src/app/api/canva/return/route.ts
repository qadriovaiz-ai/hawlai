import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { verifyCorrelationJwt } from "@/lib/canva/returnJwt";

// Where Canva sends the user when they click its "Return to Hawlai"
// button. This URL must be registered on the Return navigation page of
// the integration's settings in Canva's developer portal — it isn't
// passed as a parameter, so it won't work until that's configured.
//
// Nothing here is load-bearing: if return navigation is never set up,
// or the user just closes the Canva tab instead of clicking Return,
// their design is still on the Design & Edit page with an Export
// button. This route only makes the common path smoother.

const DESTINATION = "/dashboard/design-edit";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("correlation_jwt");
  const back = new URL(DESTINATION, url.origin);

  if (!token) return NextResponse.redirect(back);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/login", url.origin));

  try {
    const claims = await verifyCorrelationJwt(token);

    // correlation_state is the canva_designs row id we set on the edit
    // link. It's used only as a hint for which card to highlight — the
    // actual lookup is by design_id AND user_id, so a forged or
    // swapped state can't reach another user's row. RLS is the backstop
    // underneath that.
    if (claims.correlation_state) back.searchParams.set("design", claims.correlation_state);

    // The design may have been renamed inside Canva; the title shown in
    // Hawlai should follow rather than keep the name it was born with.
    await supabase
      .from("canva_designs")
      .update({ status: "draft" })
      .eq("user_id", user.id)
      .eq("canva_design_id", claims.design_id);

    back.searchParams.set("returned", "1");
  } catch (err: any) {
    // A bad token is not worth blocking the user over — they still end
    // up on their designs page, just without the highlight. Logged
    // because a persistent failure here means the integration's keys
    // or client id are misconfigured.
    console.error("[canva] return token rejected:", err?.message);
  }

  return NextResponse.redirect(back);
}
