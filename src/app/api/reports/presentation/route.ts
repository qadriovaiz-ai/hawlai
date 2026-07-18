import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateExecutiveReport } from "@/lib/agents/reportingAgent";
import { generateGrowthReport } from "@/lib/agents/growthAdvisorAgent";
import { formatCurrency } from "@/lib/utils";
import PptxGenJS from "pptxgenjs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: dealership } = await supabase.from("dealerships").select("dealership_name, business_category").eq("id", dealershipId).single();
  const [report, growth] = await Promise.all([
    generateExecutiveReport(supabase, dealershipId),
    generateGrowthReport(supabase, dealershipId, dealership?.business_category ?? "business"),
  ]);
  const { stats } = report;
  const name = dealership?.dealership_name ?? "Business";

  const pptx = new PptxGenJS();
  const PURPLE = "7C3AED";
  const DARK = "1E293B";

  // Title slide
  const slide1 = pptx.addSlide();
  slide1.background = { color: DARK };
  slide1.addText(`${name}`, { x: 0.5, y: 2.2, w: 9, h: 1, fontSize: 36, bold: true, color: "FFFFFF" });
  slide1.addText("Performance Report", { x: 0.5, y: 3.1, w: 9, h: 0.6, fontSize: 20, color: PURPLE });
  slide1.addText(new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }), { x: 0.5, y: 3.7, w: 9, h: 0.4, fontSize: 12, color: "94A3B8" });

  // Health score slide
  const slide2 = pptx.addSlide();
  slide2.addText("Health Score", { x: 0.5, y: 0.4, w: 9, h: 0.6, fontSize: 24, bold: true, color: DARK });
  slide2.addText(`${growth.healthScore}/100`, { x: 0.5, y: 1.2, w: 9, h: 1, fontSize: 48, bold: true, color: PURPLE });
  slide2.addText(growth.headline, { x: 0.5, y: 2.3, w: 9, h: 0.8, fontSize: 14, color: "334155" });

  // Key metrics slide
  const slide3 = pptx.addSlide();
  slide3.addText("Key Metrics", { x: 0.5, y: 0.4, w: 9, h: 0.6, fontSize: 24, bold: true, color: DARK });
  const metrics: [string, string][] = [
    ["Total Leads", String(stats.totalLeads)],
    ["Campaigns Launched", String(stats.campaignsLaunched)],
    ["Total Ad Spend", formatCurrency(stats.totalSpend)],
    ["Cost per Lead", stats.costPerLead !== null ? formatCurrency(stats.costPerLead) : "—"],
    ["Revenue", formatCurrency(stats.totalRevenue)],
    ["ROAS", stats.roas !== null ? `${stats.roas.toFixed(1)}x` : "—"],
    ["Appointments Completed", String(stats.appointmentsCompleted)],
  ];
  slide3.addTable(
    metrics.map(([label, value]) => [
      { text: label, options: { bold: true, color: "334155", fontSize: 12 } },
      { text: value, options: { color: DARK, fontSize: 12 } },
    ]),
    { x: 0.5, y: 1.1, w: 9, colW: [5, 4], border: { type: "solid", color: "E2E8F0", pt: 1 } }
  );

  // Strengths / Risks / Next actions
  const slide4 = pptx.addSlide();
  slide4.addText("Where things stand", { x: 0.5, y: 0.4, w: 9, h: 0.6, fontSize: 24, bold: true, color: DARK });
  let y = 1.2;
  if (growth.strengths?.length) {
    slide4.addText("Strengths", { x: 0.5, y, w: 9, h: 0.4, fontSize: 14, bold: true, color: "16A34A" });
    y += 0.4;
    for (const s of growth.strengths) { slide4.addText(`• ${s}`, { x: 0.6, y, w: 8.5, h: 0.35, fontSize: 11, color: "334155" }); y += 0.35; }
    y += 0.2;
  }
  if (growth.risks?.length) {
    slide4.addText("Risks", { x: 0.5, y, w: 9, h: 0.4, fontSize: 14, bold: true, color: "DC2626" });
    y += 0.4;
    for (const r of growth.risks) { slide4.addText(`• ${r}`, { x: 0.6, y, w: 8.5, h: 0.35, fontSize: 11, color: "334155" }); y += 0.35; }
    y += 0.2;
  }
  if (growth.nextActions?.length) {
    slide4.addText("Next Actions", { x: 0.5, y, w: 9, h: 0.4, fontSize: 14, bold: true, color: PURPLE });
    y += 0.4;
    for (const a of growth.nextActions) { slide4.addText(`• ${a}`, { x: 0.6, y, w: 8.5, h: 0.35, fontSize: 11, color: "334155" }); y += 0.35; }
  }

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${name.replace(/[^a-z0-9]+/gi, "-")}-presentation.pptx"`,
    },
  });
}
