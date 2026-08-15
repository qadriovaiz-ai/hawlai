export type LeadTemperature = "hot" | "warm" | "cold";
export type LeadStatus =
  | "new"
  | "ready_to_call"
  | "called"
  | "appointment_set"
  | "converted"
  | "not_interested";
// "initiated" is a real, common state — triggerVapiCall() inserts every
// call row with this status, before the Vapi webhook reports back with
// the final outcome. getCallStatusColor()/getCallStatusLabel() must
// handle it or every in-flight call renders an unstyled/blank badge.
export type CallStatus = "initiated" | "completed" | "no_answer" | "busy" | "failed" | "voicemail";
export type AppointmentType = "test_ride" | "showroom_visit";
export type AppointmentStatus = "scheduled" | "completed" | "cancelled";

export interface Dealership {
  id: string;
  dealership_name: string;
  city: string | null;
  owner_id: string;
  created_at: string;
}

export interface Profile {
  id: string;
  dealership_id: string | null;
  full_name: string | null;
  role: string;
  created_at: string;
}

export interface Lead {
  id: string;
  dealership_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  vehicle: string | null;
  purchase_year: number | null;
  budget: number | null;
  source: string;
  meta_campaign_id: string | null;
  meta_ad_id: string | null;
  ai_score: number;
  lead_temperature: LeadTemperature;
  status: LeadStatus;
  qualification_reason: string | null;
  created_at: string;
  // Master audit Part C1.2/C1.3 — DPDP consent tracking + DND/opt-out.
  // dnd_opt_out is the only one enforced (blocks calls/auto-emails);
  // consent_status is tracked/visible only for now.
  dnd_opt_out: boolean;
  dnd_opt_out_at: string | null;
  dnd_opt_out_source: string | null;
  consent_status: "unknown" | "granted" | "withdrawn";
  consent_captured_at: string | null;
  consent_source: string | null;
  // AI-Intelligence Pillar 3 — behavioral score, recomputed daily.
  // Null until the first cron run scores this lead.
  predicted_conversion_score: number | null;
}

export interface Call {
  id: string;
  lead_id: string;
  dealership_id: string;
  status: CallStatus;
  duration: number;
  summary: string | null;
  transcript: string | null;
  created_at: string;
  leads?: Lead;
}

export interface Appointment {
  id: string;
  lead_id: string;
  dealership_id: string;
  appointment_date: string;
  appointment_type: AppointmentType;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
  leads?: Lead;
}

export interface AnalyticsData {
  totalLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  totalAppointments: number;
  totalCalls: number;
  qualificationRate: number;
  hotLeadPercentage: number;
  appointmentRate: number;
  temperatureDistribution: { name: string; value: number; color: string }[];
  monthlyGrowth: { month: string; leads: number }[];
  conversionFunnel: { stage: string; count: number }[];
}
