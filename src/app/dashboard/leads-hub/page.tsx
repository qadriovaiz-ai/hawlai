import { Users, Kanban, Heart, PhoneCall, Phone, Calendar } from "lucide-react";
import HubTabs from "@/components/dashboard/HubTabs";
import LeadsPage from "../leads/page";
import PipelinePage from "../pipeline/page";
import RetentionPage from "../retention/page";
import QueuePage from "../queue/page";
import CallsPage from "../calls/page";
import AppointmentsPage from "../appointments/page";

export default function LeadsHubPage() {
  const tabs = [
    { key: "leads", label: "Leads", icon: <Users className="w-4 h-4" />, content: <LeadsPage searchParams={Promise.resolve({})} /> },
    { key: "pipeline", label: "Pipeline", icon: <Kanban className="w-4 h-4" />, content: <PipelinePage /> },
    { key: "retention", label: "Retention", icon: <Heart className="w-4 h-4" />, content: <RetentionPage /> },
    { key: "queue", label: "Call Queue", icon: <PhoneCall className="w-4 h-4" />, content: <QueuePage /> },
    { key: "calls", label: "Call History", icon: <Phone className="w-4 h-4" />, content: <CallsPage /> },
    { key: "appointments", label: "Appointments", icon: <Calendar className="w-4 h-4" />, content: <AppointmentsPage /> },
  ];

  return (
    <HubTabs
      title="Leads & Sales"
      description="Every lead, every stage, every follow-up — in one place"
      icon={<Users className="w-5 h-5 text-purple-600" />}
      tabs={tabs}
    />
  );
}
