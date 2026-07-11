import { Megaphone, Rocket, BarChart3, Clapperboard, Share2, Globe } from "lucide-react";
import HubTabs from "@/components/dashboard/HubTabs";
import LaunchAdPage from "../ads/full-launch/page";
import CampaignsPage from "../ads/campaigns/page";
import CreativeStudioPage from "../creative-studio/page";
import SocialPostPage from "../social/page";
import WebsitePage from "../website/page";

export default function MarketingHubPage() {
  const tabs = [
    { key: "launch", label: "Launch Ad", icon: <Rocket className="w-4 h-4" />, content: <LaunchAdPage /> },
    { key: "campaigns", label: "My Campaigns", icon: <BarChart3 className="w-4 h-4" />, content: <CampaignsPage /> },
    { key: "creative", label: "Creative Studio", icon: <Clapperboard className="w-4 h-4" />, content: <CreativeStudioPage /> },
    { key: "social", label: "Social Post", icon: <Share2 className="w-4 h-4" />, content: <SocialPostPage /> },
    { key: "website", label: "Website", icon: <Globe className="w-4 h-4" />, content: <WebsitePage /> },
  ];

  return (
    <HubTabs
      title="Marketing"
      description="Launch ads, manage campaigns, create content, and run your website — all in one place"
      icon={<Megaphone className="w-5 h-5 text-purple-600" />}
      tabs={tabs}
    />
  );
}
