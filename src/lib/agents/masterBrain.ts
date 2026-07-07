// ------------------------------------------------------------------
// Master Brain — Phase 0 basic router
// ------------------------------------------------------------------
// This is intentionally small right now: it can only route between the
// two agents that actually exist today (Paid Ads Agent, Analytics Agent).
// As more agents get built, add them to `classifyIntent`'s tool list
// and handle their branch below — the dealer-facing behaviour (one text
// box, one dashboard) does not need to change as agents are added.
//
// What it does today:
//  1. Reads the dealer's plain-language request.
//  2. Classifies it as an ad-launch request or an analytics question.
//  3. For ad launches: checks the requested budget against the
//     dealership's approval_threshold. Over the limit -> writes a row
//     to pending_approvals and stops. Under the limit -> tells the
//     dealer to go finish the launch on the full-launch page (that page
//     still needs the car photo, which this text-only endpoint doesn't
//     collect).
//  4. For analytics questions: answers directly using the same leads/
//     calls/appointments data the /api/analytics route uses.
// ------------------------------------------------------------------

interface ClassifiedIntent {
  intent: "ad_launch" | "analytics_query" | "unclear";
  daily_budget?: number | null;
  duration_days?: number | null;
  car_type?: string | null;
  targeting_city?: string | null;
}

interface MasterBrainResult {
  intent: ClassifiedIntent["intent"];
  status: "pending_approval" | "auto_approved" | "answered" | "unclear";
  message: string;
  details?: Record<string, any>;
}

async function classifyIntent(message: string): Promise<ClassifiedIntent> {
  let rawText = "";
  let httpStatus: number | null = null;
  let bodyText = "";
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: `You are the routing brain for an Indian car dealership's marketing dashboard.
A dealer typed this request: "${message}"

Classify it and return JSON only (no markdown, no explanation, no extra text before or after):
{"intent":"ad_launch" | "analytics_query" | "unclear","daily_budget":number or null (rupees per day, if mentioned),"duration_days":number or null (how many days the campaign should run, default 1 if a launch but not mentioned),"car_type":"car model mentioned or null","targeting_city":"city mentioned or null"}

"ad_launch" = they want to create/launch/run an ad or campaign.
"analytics_query" = they're asking about spend, leads, performance, or results.
"unclear" = anything else.`,
          },
        ],
      }),
    });

    httpStatus = response.status;
    // Read as text first (never throws), THEN try to parse — this way we
    // always have something readable to log even if the body is empty,
    // truncated, or not JSON at all.
    bodyText = await response.text();

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set in this environment");
    }
    if (!response.ok) {
      throw new Error(`Anthropic API returned ${httpStatus}: ${bodyText.slice(0, 300)}`);
    }
    if (!bodyText.trim()) {
      throw new Error(`Anthropic API returned an empty body (status ${httpStatus})`);
    }

    const data = JSON.parse(bodyText);
    rawText = data.content?.[0]?.text ?? "";

    // Claude sometimes wraps JSON in a code fence or adds a stray sentence
    // despite instructions — pull out just the {...} block to be safe.
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : rawText).replace(/```json|```/g, "").trim();

    if (!clean) throw new Error("Claude's response had no JSON in it");
    return JSON.parse(clean);
  } catch (err: any) {
    console.error(
      "[master-brain] classifyIntent error:", err.message,
      "| http status:", httpStatus,
      "| body (first 300 chars):", bodyText.slice(0, 300),
      "| parsed text:", rawText
    );
    return { intent: "unclear" };
  }
}

async function answerAnalyticsQuery(supabase: any, dealershipId: string): Promise<string> {
  const [{ data: leads }, { data: calls }, { data: appointments }] = await Promise.all([
    supabase.from("leads").select("*").eq("dealership_id", dealershipId),
    supabase.from("calls").select("*").eq("dealership_id", dealershipId),
    supabase.from("appointments").select("*").eq("dealership_id", dealershipId),
  ]);

  const totalLeads = leads?.length ?? 0;
  const hotLeads = leads?.filter((l: any) => l.lead_temperature === "hot").length ?? 0;
  const warmLeads = leads?.filter((l: any) => l.lead_temperature === "warm").length ?? 0;
  const coldLeads = leads?.filter((l: any) => l.lead_temperature === "cold").length ?? 0;

  if (totalLeads === 0) {
    return "No leads yet. Launch an ad first, then performance will show up here.";
  }

  return `You have ${totalLeads} total leads — ${hotLeads} Hot, ${warmLeads} Warm, ${coldLeads} Cold. ` +
    `${calls?.length ?? 0} calls made, and ${appointments?.length ?? 0} appointments booked. ` +
    `See the Analytics page for detailed cost-per-lead.`;
}

export async function routeRequest(
  supabase: any,
  dealershipId: string,
  message: string
): Promise<MasterBrainResult> {
  const classification = await classifyIntent(message);

  if (classification.intent === "ad_launch") {
    const { data: dealership } = await supabase
      .from("dealerships")
      .select("approval_threshold")
      .eq("id", dealershipId)
      .single();

    const threshold = dealership?.approval_threshold ?? 50000;
    const dailyBudget = classification.daily_budget ?? 500;
    const durationDays = classification.duration_days ?? 1;
    const totalEstimate = dailyBudget * durationDays;

    if (totalEstimate > threshold) {
      const { data: approval } = await supabase
        .from("pending_approvals")
        .insert({
          dealership_id: dealershipId,
          requested_by_agent: "paid_ads_agent",
          action_type: "launch_campaign",
          action_details: { original_request: message, ...classification, total_estimate: totalEstimate },
          amount: totalEstimate,
        })
        .select()
        .single();

      return {
        intent: "ad_launch",
        status: "pending_approval",
        message: `This campaign's estimated cost is ₹${totalEstimate.toLocaleString("en-IN")}, which is above your ₹${threshold.toLocaleString("en-IN")} approval limit. I've added it to "Pending Approvals" — it'll launch once you approve it there.`,
        details: approval,
      };
    }

    return {
      intent: "ad_launch",
      status: "auto_approved",
      message: `This campaign (~₹${totalEstimate.toLocaleString("en-IN")}, within your approval limit) is good to launch. Go to the "Launch Ad" page and upload the car photo — the full ad will be built and launched from there.`,
      details: classification,
    };
  }

  if (classification.intent === "analytics_query") {
    const answer = await answerAnalyticsQuery(supabase, dealershipId);
    return { intent: "analytics_query", status: "answered", message: answer };
  }

  return {
    intent: "unclear",
    status: "unclear",
    message:
      'I didn\'t quite get that. Ask me to launch an ad (e.g. "launch a Swift ad in Lucknow, 1000 per day, 5 days") or ask about performance (e.g. "how is this month\'s performance").',
  };
}
