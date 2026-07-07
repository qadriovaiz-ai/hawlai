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
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
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
"analytics_query" = they're asking about spend, leads, performance, results, kitna kharcha hua, kaise chal raha hai, etc.
"unclear" = anything else.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic API returned ${response.status}: ${errBody.slice(0, 300)}`);
    }

    const data = await response.json();
    rawText = data.content?.[0]?.text ?? "";

    // Claude sometimes wraps JSON in a code fence or adds a stray sentence
    // despite instructions — pull out just the {...} block to be safe.
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : rawText).replace(/```json|```/g, "").trim();

    if (!clean) throw new Error("Empty response text from Claude");
    return JSON.parse(clean);
  } catch (err: any) {
    console.error("[master-brain] classifyIntent error:", err.message, "| raw text:", rawText);
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
    return "Abhi tak koi lead nahi aaya hai. Pehle ek ad launch karo, phir yahan performance dikhega.";
  }

  return `Total ${totalLeads} leads aaye hain — ${hotLeads} Hot, ${warmLeads} Warm, ${coldLeads} Cold. ` +
    `${calls?.length ?? 0} calls ho chuki hain, aur ${appointments?.length ?? 0} appointments book hue hain. ` +
    `Detailed cost-per-lead ke liye Analytics page dekho.`;
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
        message: `Yeh campaign ka estimated kharcha ₹${totalEstimate.toLocaleString("en-IN")} hai, jo tumhare ₹${threshold.toLocaleString("en-IN")} approval limit se zyada hai. Maine ise "Pending Approvals" mein daal diya hai — waha se Approve karne ke baad hi launch hoga.`,
        details: approval,
      };
    }

    return {
      intent: "ad_launch",
      status: "auto_approved",
      message: `Yeh campaign (~₹${totalEstimate.toLocaleString("en-IN")}, tumhari approval limit ke andar) launch karne layak hai. Ab "Launch Ad" page pe jaake car ki photo upload karo — wahan se poora ad ban ke launch ho jayega.`,
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
      'Samajh nahi aaya. Ya toh ek ad launch karne ko bolo (jaise "Swift ka ad chalao Lucknow mein, 1000 per day, 5 din") ya performance poocho (jaise "is mahine ka performance kaisa hai").',
  };
}
