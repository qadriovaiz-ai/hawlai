// One report, one set of numbers.
//
// The executive summary and the health-score narrative are always shown
// together — on the Reports page, the shared client report, the PDF, the
// presentation and the weekly snapshot. They used to gather their own
// figures separately, with different definitions, and contradicted each
// other on the same page. Now the numbers are gathered once and both are
// written from them.

import { gatherBusinessNumbers, type BusinessNumbers } from "./businessNumbers";
import { generateExecutiveReport, type ExecutiveReport } from "@/lib/agents/reportingAgent";
import { generateGrowthReport, type GrowthReport } from "@/lib/agents/growthAdvisorAgent";

export async function generateReportBundle(
  supabase: any,
  dealershipId: string,
  businessCategory: string
): Promise<{ report: ExecutiveReport; growth: GrowthReport; numbers: BusinessNumbers }> {
  const numbers = await gatherBusinessNumbers(supabase, dealershipId);
  const [report, growth] = await Promise.all([
    generateExecutiveReport(supabase, dealershipId, numbers),
    generateGrowthReport(supabase, dealershipId, businessCategory, numbers),
  ]);
  return { report, growth, numbers };
}
