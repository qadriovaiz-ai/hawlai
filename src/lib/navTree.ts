// The dashboard's navigation, as data.
//
// WHAT THIS REPLACES: six sidebar items, one of which ("Business") was
// a hub page holding TWENTY-FOUR flat cards — orders sat beside agency
// billing limits and two-factor authentication. Seventeen departments
// with real, working pages appeared in no navigation at all; they were
// reachable only by typing the URL or following a chat card's "open in
// department" link. Most of the product was built and unnavigable.
//
// A tree rather than JSX so the grouping can be READ and TESTED —
// no duplicate routes, no leaf without a destination, no group left
// empty for a mode. The sidebar renders it; it decides nothing.

export type NavLeaf = {
  label: string;
  href: string;
  /** Marks a hub tab, so tests can check the ?tab= contract. */
  tab?: string;
};

export type NavNode = {
  label: string;
  /** Set when the node itself is a destination as well as a parent. */
  href?: string;
  children?: NavNode[];
  tab?: string;
  /** Agency-only sections, hidden for ordinary accounts. */
  agencyOnly?: boolean;
};

export type NavSection = {
  label: string;
  /** Simple top-level links with no children (Overview, Work…). */
  href?: string;
  iconKey: string;
  children?: NavNode[];
  agencyOnly?: boolean;
  /** Only shown in this product mode, matching the old MODE_ITEM gate. */
  mode?: "calling";
  /** Big, rarely-browsed groups start shut. */
  defaultCollapsed?: boolean;
};

/** `/dashboard/marketing?tab=campaigns` — one place builds these. */
export function tabHref(href: string, tab?: string): string {
  return tab ? `${href}?tab=${tab}` : href;
}

export const NAV_TREE: NavSection[] = [
  { label: "Overview", href: "/dashboard/overview", iconKey: "home" },
  { label: "AI Employee", href: "/chat", iconKey: "brain" },
  { label: "Work", href: "/dashboard/tasks", iconKey: "tasks" },
  { label: "Approvals", href: "/dashboard/approvals", iconKey: "approvals" },

  // ---- STORE: what the business sells and who buys it ----------------
  //
  // Orders were three levels deep behind a card called "Website &
  // Products", named only in its grey subtitle. They are now two
  // clicks from anywhere.
  {
    label: "Store",
    iconKey: "store",
    children: [
      {
        label: "Website & Products",
        href: "/dashboard/website-builder",
        children: [
          { label: "Website", href: "/dashboard/website-builder", tab: "website" },
          { label: "Products", href: "/dashboard/website-builder", tab: "products" },
          { label: "Orders", href: "/dashboard/website-builder", tab: "orders" },
          { label: "Offers", href: "/dashboard/website-builder", tab: "offers" },
          { label: "Shipping", href: "/dashboard/website-builder", tab: "shipping" },
          { label: "Payments", href: "/dashboard/website-builder", tab: "payments" },
          { label: "Domain", href: "/dashboard/website-builder", tab: "domain" },
        ],
      },
      {
        label: "Leads & CRM",
        href: "/dashboard/leads-hub",
        children: [
          { label: "Leads", href: "/dashboard/leads-hub", tab: "leads" },
          { label: "Pipeline", href: "/dashboard/leads-hub", tab: "pipeline" },
          { label: "Retention", href: "/dashboard/leads-hub", tab: "retention" },
          { label: "Call Queue", href: "/dashboard/leads-hub", tab: "queue" },
          { label: "Call History", href: "/dashboard/leads-hub", tab: "calls" },
          { label: "Appointments", href: "/dashboard/leads-hub", tab: "appointments" },
        ],
      },
      { label: "Complaints", href: "/dashboard/complaints" },
      { label: "Refund Requests", href: "/dashboard/refunds" },
      { label: "Affiliate Marketing", href: "/dashboard/affiliate-marketing" },
      { label: "Audience", href: "/dashboard/audience" },
    ],
  },

  // ---- MARKETING: top level, not buried ------------------------------
  //
  // PLACEMENT CALL. Marketing was a card inside Business, so reaching a
  // campaign took Business → Marketing → tab: three levels for the
  // thing the product is named after. It has seven tabs of its own and
  // is the primary daily surface, so it is top-level.
  {
    label: "Marketing",
    iconKey: "megaphone",
    children: [
      {
        label: "Campaigns",
        href: "/dashboard/marketing",
        children: [
          { label: "Strategy", href: "/dashboard/marketing", tab: "strategy" },
          { label: "Launch Ad", href: "/dashboard/marketing", tab: "launch" },
          { label: "My Campaigns", href: "/dashboard/marketing", tab: "campaigns" },
          { label: "Campaign Groups", href: "/dashboard/marketing", tab: "campaign-groups" },
          { label: "Creative Studio", href: "/dashboard/marketing", tab: "creative" },
          { label: "Social Post", href: "/dashboard/marketing", tab: "social" },
          { label: "Website", href: "/dashboard/marketing", tab: "website" },
        ],
      },
      { label: "Content Calendar", href: "/dashboard/calendar" },
      // PLACEMENT CALL — Automation. It fits neither Store nor
      // Settings: it is not commerce and not configuration, it is
      // work that runs without you. Both surfaces are predominantly
      // marketing (content autopilot, campaign pausing, social
      // posting, seasonal prep), so they sit here rather than becoming
      // a top-level group of two.
      { label: "Autopilot", href: "/dashboard/autopilot" },
      { label: "Workflows", href: "/dashboard/marketing-automation" },
    ],
  },

  // ---- INSIGHTS: was in NO navigation at all --------------------------
  {
    label: "Insights",
    iconKey: "chart",
    children: [
      { label: "Reports", href: "/dashboard/insights", tab: "reports" },
      { label: "Strategy", href: "/dashboard/insights", tab: "strategy" },
      { label: "Analytics", href: "/dashboard/insights", tab: "analytics" },
      { label: "Optimization", href: "/dashboard/insights", tab: "optimization" },
      { label: "Research", href: "/dashboard/insights", tab: "research" },
      { label: "SEO", href: "/dashboard/insights", tab: "seo" },
    ],
  },

  // ---- DEPARTMENTS: the orphans, grouped so the list is scannable -----
  //
  // Collapsed by default. These are real pages that appeared in no
  // navigation; flat, they are a wall of eighteen. Grouped by what a
  // person would be trying to do, they are browsable.
  {
    label: "Departments",
    iconKey: "grid",
    defaultCollapsed: true,
    children: [
      {
        label: "Content & Social",
        children: [
          { label: "Content Marketing", href: "/dashboard/content-marketing" },
          { label: "Social Media", href: "/dashboard/social" },
          { label: "Email Marketing", href: "/dashboard/email" },
          { label: "WhatsApp Marketing", href: "/dashboard/whatsapp" },
          { label: "SEO", href: "/dashboard/seo" },
        ],
      },
      {
        label: "Creative",
        children: [
          { label: "Design Studio", href: "/dashboard/graphic-design" },
          { label: "Video Marketing", href: "/dashboard/video-marketing" },
          { label: "3D Studio", href: "/dashboard/3d-studio" },
          { label: "Brand Kit", href: "/dashboard/brand-building" },
        ],
      },
      {
        label: "Growth",
        children: [
          { label: "Paid Ads", href: "/dashboard/paid-ads" },
          { label: "Retargeting", href: "/dashboard/retargeting" },
          { label: "Influencer Marketing", href: "/dashboard/influencer-marketing" },
          { label: "Marketing Strategy", href: "/dashboard/strategy" },
          { label: "Growth Advisor", href: "/dashboard/growth-advisor" },
          { label: "CRO", href: "/dashboard/cro" },
        ],
      },
      {
        label: "Research",
        children: [
          { label: "Competitor Intel", href: "/dashboard/competitor-intel" },
          { label: "Research Agent", href: "/dashboard/research-agent" },
          { label: "Business Memory", href: "/dashboard/business-memory" },
        ],
      },
    ],
  },

  // ---- AGENCY: hidden unless the account is one ------------------------
  {
    label: "Agency",
    iconKey: "users",
    agencyOnly: true,
    defaultCollapsed: true,
    children: [
      { label: "Portfolio", href: "/dashboard/agency-portfolio" },
      { label: "Agency Branding", href: "/dashboard/agency-branding" },
      { label: "Agency Team", href: "/dashboard/agency-team" },
      { label: "Agency Billing", href: "/dashboard/agency-billing" },
      { label: "Client Limits", href: "/dashboard/agency-limits" },
    ],
  },

  { label: "Calling", href: "/dashboard/calling", iconKey: "phone", mode: "calling" },

  // ---- SETTINGS: last, because it is visited least ---------------------
  {
    label: "Settings",
    iconKey: "settings",
    defaultCollapsed: true,
    children: [
      { label: "Brand", href: "/dashboard/settings/brand" },
      { label: "Business Knowledge", href: "/dashboard/settings/knowledge-base" },
      { label: "Integrations", href: "/dashboard/settings/integrations" },
      { label: "Assets", href: "/dashboard/assets" },
      { label: "Team", href: "/dashboard/team" },
      { label: "Billing & Usage", href: "/dashboard/billing" },
      { label: "Security", href: "/dashboard/settings/security" },
      { label: "Audit Log", href: "/dashboard/audit-log" },
    ],
  },
];

/** The tree for this account — mode and agency gates applied. */
export function getNavTree(opts: { mode?: string | null; isAgency?: boolean }): NavSection[] {
  return NAV_TREE.filter((s) => {
    if (s.mode && s.mode !== opts.mode) return false;
    if (s.agencyOnly && !opts.isAgency) return false;
    return true;
  });
}

/** Every leaf, flattened — for tests and for "is this route navigable". */
export function flattenLeaves(nodes: (NavSection | NavNode)[] = NAV_TREE): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  for (const node of nodes) {
    if (node.children?.length) out.push(...flattenLeaves(node.children));
    else if (node.href) out.push({ label: node.label, href: tabHref(node.href, (node as NavNode).tab) });
  }
  return out;
}
