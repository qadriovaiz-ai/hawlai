// The research tasks, as plain data.
//
// This lives apart from the agent that runs them because the picker UI is
// a client component: importing the agent for this one constant pulled the
// whole server module graph — Claude client, usage logging, the
// service-role Supabase client — into browser JavaScript. See
// tests/clientBundleBoundary.test.ts.
//
// Nothing here may import anything. That is the point.

export interface ResearchTaskMeta {
  key: string;
  label: string;
  usesWebSearch: boolean;
}

export const RESEARCH_TASKS: ResearchTaskMeta[] = [
  { key: "industry_trends", label: "Industry Trends", usesWebSearch: true },
  { key: "market_research", label: "Market Research", usesWebSearch: true },
  { key: "new_opportunities", label: "New Opportunities", usesWebSearch: true },
  { key: "customer_sentiment", label: "Customer Sentiment", usesWebSearch: false },
];
