import {
  LayoutDashboard, Brain, CalendarDays, Target, Users2, Building2, Palette,
  Clapperboard, Share2, Megaphone, Mail, MessageCircle, Users, Globe, TrendingUp,
  BarChart3, Zap, FolderOpen, ShieldCheck, CreditCard, Link2, PenTool, FileText, Layers, Film, Radio, UserCheck, Workflow, Radar, BookOpenText, Star, Compass,
} from "lucide-react";

export const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { href: "/chat", label: "Master Chat", icon: Brain },
      { href: "/dashboard/autopilot", label: "Autopilot", icon: Zap },
      { href: "/dashboard/overview", label: "Dashboard", icon: LayoutDashboard },
      { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Strategy & Brand",
    items: [
      { href: "/dashboard/strategy", label: "Marketing Strategy", icon: Target },
      { href: "/dashboard/audience", label: "Audience", icon: Users2 },
      { href: "/dashboard/research", label: "Competitors", icon: Building2 },
      { href: "/dashboard/competitor-intel", label: "Competitor Intelligence", icon: Radar },
      { href: "/dashboard/research-agent", label: "AI Research Agent", icon: BookOpenText },
      { href: "/dashboard/brand-building", label: "Brand Building", icon: PenTool },
      { href: "/dashboard/settings/brand", label: "Brand Voice", icon: Palette },
    ],
  },
  {
    label: "Create",
    items: [
      { href: "/dashboard/creative-studio", label: "Creative Studio", icon: Clapperboard },
      { href: "/dashboard/video-marketing", label: "Video Marketing", icon: Film },
      { href: "/dashboard/graphic-design", label: "Graphic Design", icon: Layers },
      { href: "/dashboard/content-marketing", label: "Content Marketing", icon: FileText },
      { href: "/dashboard/social", label: "Social Media", icon: Share2 },
      { href: "/dashboard/influencer-marketing", label: "Influencer Marketing", icon: Star },
    ],
  },
  {
    label: "Grow",
    items: [
      { href: "/dashboard/paid-ads", label: "Paid Advertising", icon: Radio },
      { href: "/dashboard/ads/campaigns", label: "Ads Manager", icon: Megaphone },
      { href: "/dashboard/email", label: "Email", icon: Mail },
      { href: "/dashboard/whatsapp", label: "WhatsApp", icon: MessageCircle },
      { href: "/dashboard/leads-hub", label: "CRM", icon: Users },
      { href: "/dashboard/crm-marketing", label: "CRM Marketing", icon: UserCheck },
      { href: "/dashboard/marketing-automation", label: "Marketing Automation", icon: Workflow },
      { href: "/dashboard/website", label: "Website", icon: Globe },
      { href: "/dashboard/seo", label: "SEO", icon: TrendingUp },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/dashboard/insights", label: "Analytics", icon: BarChart3 },
      { href: "/dashboard/growth-advisor", label: "AI Growth Advisor", icon: Compass },
      { href: "/dashboard/settings/automation", label: "Automation", icon: Zap },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/dashboard/assets", label: "Assets", icon: FolderOpen },
      { href: "/dashboard/approvals", label: "Approvals", icon: ShieldCheck },
      { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
      { href: "/dashboard/settings/integrations", label: "Integrations", icon: Link2 },
    ],
  },
];
