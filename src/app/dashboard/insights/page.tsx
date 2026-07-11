import { BarChart3, Gauge, FileText, Search, TrendingUp, Compass } from "lucide-react";
import HubTabs from "@/components/dashboard/HubTabs";
import AnalyticsPage from "../analytics/page";
import OptimizationPage from "../optimization/page";
import ReportsPage from "../reports/page";
import ResearchPage from "../research/page";
import SeoPage from "../seo/page";
import StrategyPage from "../strategy/page";

export default function InsightsHubPage() {
  const tabs = [
    { key: "reports", label: "Reports", icon: <FileText className="w-4 h-4" />, content: <ReportsPage /> },
    { key: "strategy", label: "Strategy", icon: <Compass className="w-4 h-4" />, content: <StrategyPage /> },
    { key: "analytics", label: "Analytics", icon: <BarChart3 className="w-4 h-4" />, content: <AnalyticsPage /> },
    { key: "optimization", label: "Optimization", icon: <Gauge className="w-4 h-4" />, content: <OptimizationPage /> },
    { key: "research", label: "Research", icon: <Search className="w-4 h-4" />, content: <ResearchPage /> },
    { key: "seo", label: "SEO", icon: <TrendingUp className="w-4 h-4" />, content: <SeoPage /> },
  ];

  return (
    <HubTabs
      title="Insights"
      description="Performance, recommendations, and market intelligence — in one place"
      icon={<BarChart3 className="w-5 h-5 text-purple-600" />}
      tabs={tabs}
    />
  );
}
