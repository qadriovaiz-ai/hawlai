// The CRO toolkit tasks, as plain data.
//
// This lives apart from the agent that runs them because the picker UI is
// a client component: importing the agent for this one constant pulled the
// whole server module graph — Claude client, usage logging, the
// service-role Supabase client — into browser JavaScript. See
// tests/clientBundleBoundary.test.ts.
//
// Nothing here may import anything. That is the point.

export interface CroTaskMeta {
  key: string;
  label: string;
}

export const CRO_TASKS: CroTaskMeta[] = [
  { key: "landing_page", label: "Landing Page Optimization" },
  { key: "cta", label: "CTA Suggestions" },
  { key: "form", label: "Form Optimization" },
  { key: "ux", label: "UX Suggestions" },
];
