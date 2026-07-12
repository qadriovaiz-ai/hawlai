import { Megaphone, Rocket, BarChart3, Clapperboard, Share2, Globe, Target } from "lucide-react";
import HubTabs from "@/components/dashboard/HubTabs";
import LaunchAdPage from "../ads/full-launch/page";
import CampaignsPage from "../ads/campaigns/page";
import CreativeStudioPage from "../creative-studio/page";
import SocialPostPage from "../social/page";
import WebsitePage from "../website/page";
import StrategyPage from "../strategy/page";

export default function MarketingHubPage() {
  const tabs = [
    { key: "strategy", label: "Strategy", icon: <Target className="w-4 h-4" />, content: <StrategyPage /> },
    { key: "launch", label: "Launch Ad", icon: <Rocket className="w-4 h-4" />, content: <LaunchAdPage /> },
    { key: "campaigns", label: "My Campaigns", icon: <BarChart3 className="w-4 h-4" />, content: <CampaignsPage /> },
    { key: "creative", label: "Creative Studio", icon: <Clapperboard className="w-4 h-4" />, content: <CreativeStudioPage /> },
    { key: "social", label: "Social Post", icon: <Share2 className="w-4 h-4" />, content: <SocialPostPage /> },
    { key: "website", label: "Website", icon: <Globe className="w-4 h-4" />, content: <WebsitePage /> },
  ];

  return (
    <HubTabs
      title="Marketing"
      description="Strategy, ads, campaigns, content, and your website — all in one place"
      icon={<Megaphone className="w-5 h-5 text-purple-400" />}
      tabs={tabs}
    />
  );
}
