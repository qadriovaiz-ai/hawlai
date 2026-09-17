import { scoreNewLead } from "./leads/leadIntake";
import type { BusinessModel } from "./business/businessModel";

// Sample data for an empty account. Written for the kind of business
// this is (lib/business/businessModel.ts) — it used to be a two-wheeler
// and car dealership's leads, calls and test rides for every business.

const INTERESTS: Record<"general" | BusinessModel, string[]> = {
  general: ["General enquiry", "Pricing details", "Bulk order", "Custom request", "Gift options"],
  products: ["Bestseller range", "New arrivals", "Gift set", "Bulk order", "Custom order"],
  services: ["First consultation", "Monthly package", "One-time session", "Follow-up visit", "Premium package"],
  subscription: ["Monthly plan", "Annual plan", "Family plan", "Free trial", "Plan upgrade"],
  b2b: ["Bulk supply quote", "Annual contract", "Pilot order", "Custom solution", "Vendor onboarding"],
};

const COMPANIES = ["Sharma Traders", "Nair Foods Pvt Ltd", "Patel Logistics", "Iyer Consulting", "Verma Textiles"];
const COMPANY_SIZES = ["1-10", "11-50", "51-200"];
const CURRENT_SOLUTIONS = ["Another provider", "Nothing yet", "Doing it in-house"];

const NAMES = [
  "Rahul Sharma", "Priya Singh", "Amit Kumar", "Sunita Devi", "Rajesh Patel",
  "Anita Verma", "Vijay Gupta", "Kavitha Nair", "Suresh Reddy", "Meena Iyer",
  "Arun Mishra", "Deepa Pillai", "Sanjay Yadav", "Rekha Joshi", "Vikram Bose",
  "Pooja Rao", "Manoj Tiwari", "Geeta Chaudhary", "Rohit Dubey", "Ananya Das",
  "Kiran Kumar", "Shweta Singh", "Naveen Goel", "Pallavi Mehta", "Ravi Shankar",
  "Nisha Agarwal", "Ashok Sinha", "Divya Sharma", "Santosh Pandey", "Sneha Reddy",
  "Harish Nair", "Urmila Gupta", "Prakash Verma", "Lakshmi Pillai", "Dinesh Patel",
  "Vasantha Kumar", "Girish Iyer", "Manjula Rao", "Sunil Mishra", "Chitra Bose",
  "Ramesh Yadav", "Kamala Joshi", "Naresh Tiwari", "Sudha Chaudhary", "Balaji Das",
  "Sarita Goel", "Venkat Mehta", "Anand Shankar", "Malathi Agarwal", "Prabhu Sinha",
];

const SOURCES = ["csv_upload", "website", "referral", "walk_in", "social_media"];

function primaryModel(models: BusinessModel[]): "general" | BusinessModel {
  return (["b2b", "subscription", "services", "products"] as const).find((m) => models.includes(m)) ?? "general";
}

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

export function generateSeedLeads(dealershipId: string, models: BusinessModel[] = []) {
  const primary = primaryModel(models);
  return NAMES.map((name, i) => {
    const budget = pick([5000, 10000, 25000, 50000, 100000, 200000]);
    const phone = `+91${Math.floor(7000000000 + Math.random() * 2999999999)}`;
    const email = `${name.toLowerCase().replace(" ", ".")}@example.com`;
    const interest = INTERESTS[primary][i % INTERESTS[primary].length];
    const details: Record<string, string> = {};
    if (models.includes("b2b") && i % 2 === 0) {
      details.company = COMPANIES[i % COMPANIES.length];
      details.company_size = pick(COMPANY_SIZES);
    }
    if (models.includes("services") && i % 3 === 0) {
      const d = new Date();
      d.setDate(d.getDate() + 3 + (i % 10));
      details.preferred_date = d.toISOString().slice(0, 10);
    }
    if (models.includes("subscription") && i % 3 === 1) details.current_solution = pick(CURRENT_SOLUTIONS);
    const source = pick(SOURCES);
    const qualification = scoreNewLead({ phone, email, interest, budget, details, source }, models);

    return {
      dealership_id: dealershipId,
      name,
      phone,
      email,
      interest,
      details,
      budget,
      source,
      ai_score: qualification.score,
      lead_temperature: qualification.temperature,
      status: pick(["new", "ready_to_call", "called", "appointment_set"]),
      qualification_reason: qualification.reason,
    };
  });
}

export function generateSeedCalls(leadIds: string[], dealershipId: string) {
  const statuses = ["completed", "no_answer", "busy", "voicemail"] as const;
  const summaries = [
    "Customer is interested and wants to know more. Will visit or call back this weekend.",
    "No answer. Will retry tomorrow.",
    "Customer is busy, requested callback after 6 PM.",
    "Left voicemail. Customer will call back.",
    "Customer confirmed interest and asked for a quote. Budget confirmed.",
    "Customer needs time to discuss with family. Follow up in 2 weeks.",
    "Excellent call. Customer is ready to go ahead within 30 days.",
    "Customer already chose another provider. Mark as not interested.",
  ];

  const calls = [];
  const subset = leadIds.slice(0, Math.min(20, leadIds.length));

  for (const leadId of subset) {
    const status = pick(statuses);
    calls.push({
      lead_id: leadId,
      dealership_id: dealershipId,
      status,
      duration: status === "completed" ? Math.floor(Math.random() * 300 + 60) : 0,
      summary: pick(summaries),
      transcript: status === "completed" ? "Agent: Hello, may I speak with the customer?\nCustomer: Yes, speaking.\nAgent: I'm calling about the enquiry you sent us...\nCustomer: Oh yes, I was thinking about it.\nAgent: Great! Can I set up a time to talk it through?" : null,
    });
  }
  return calls;
}

export function generateSeedAppointments(leadIds: string[], dealershipId: string) {
  const types = ["meeting", "consultation"] as const;
  const statuses = ["scheduled", "completed", "cancelled"] as const;
  const appointments = [];
  const subset = leadIds.slice(0, Math.min(10, leadIds.length));

  for (const leadId of subset) {
    const daysOffset = Math.floor(Math.random() * 30 - 15);
    const appointmentDate = new Date();
    appointmentDate.setDate(appointmentDate.getDate() + daysOffset);
    appointmentDate.setHours(10 + Math.floor(Math.random() * 8), 0, 0, 0);

    appointments.push({
      lead_id: leadId,
      dealership_id: dealershipId,
      appointment_date: appointmentDate.toISOString(),
      appointment_type: pick(types),
      status: pick(statuses),
      notes: "Customer confirmed via phone call.",
    });
  }
  return appointments;
}
