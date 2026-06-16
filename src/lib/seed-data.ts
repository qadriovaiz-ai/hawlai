import { qualifyLead } from "./ai-engine";

const VEHICLES = [
  "Hero Splendor Plus",
  "Honda Activa 6G",
  "Bajaj Pulsar 150",
  "TVS Apache RTR 160",
  "Royal Enfield Classic 350",
  "Maruti Suzuki Swift",
  "Hyundai i20",
  "Tata Nexon",
  "Honda City",
  "Bajaj Avenger 220",
  "Hero HF Deluxe",
  "TVS Jupiter",
  "Maruti Alto K10",
  "Hyundai Venue",
  "Tata Tiago",
];

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

const CITIES = ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Pune", "Ahmedabad"];
const SOURCES = ["csv_upload", "website", "referral", "walk_in", "social_media"];

export function generateSeedLeads(dealershipId: string) {
  const currentYear = new Date().getFullYear();
  return NAMES.map((name, i) => {
    const purchaseYear = currentYear - Math.floor(Math.random() * 14 + 1);
    const budget = [40000, 60000, 80000, 100000, 120000, 150000, 200000][Math.floor(Math.random() * 7)];
    const phone = `+91${Math.floor(7000000000 + Math.random() * 2999999999)}`;
    const vehicle = VEHICLES[i % VEHICLES.length];
    const qualification = qualifyLead({ purchaseYear, budget, phone });

    return {
      dealership_id: dealershipId,
      name,
      phone,
      email: `${name.toLowerCase().replace(" ", ".")}@example.com`,
      vehicle,
      purchase_year: purchaseYear,
      budget,
      source: SOURCES[Math.floor(Math.random() * SOURCES.length)],
      ai_score: qualification.score,
      lead_temperature: qualification.temperature,
      status: ["new", "ready_to_call", "called", "appointment_set"][Math.floor(Math.random() * 4)],
      qualification_reason: qualification.reason,
    };
  });
}

export function generateSeedCalls(leadIds: string[], dealershipId: string) {
  const statuses = ["completed", "no_answer", "busy", "voicemail"] as const;
  const summaries = [
    "Customer is interested in upgrading. Will visit showroom this weekend.",
    "No answer. Will retry tomorrow.",
    "Customer is busy, requested callback after 6 PM.",
    "Left voicemail. Customer will call back.",
    "Customer confirmed interest in test ride. Budget confirmed.",
    "Customer needs time to discuss with family. Follow up in 2 weeks.",
    "Excellent call. Customer is ready to purchase within 30 days.",
    "Customer already bought from competitor. Mark as not interested.",
  ];

  const calls = [];
  const subset = leadIds.slice(0, Math.min(20, leadIds.length));

  for (const leadId of subset) {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    calls.push({
      lead_id: leadId,
      dealership_id: dealershipId,
      status,
      duration: status === "completed" ? Math.floor(Math.random() * 300 + 60) : 0,
      summary: summaries[Math.floor(Math.random() * summaries.length)],
      transcript: status === "completed" ? "Agent: Hello, may I speak with the customer?\nCustomer: Yes, speaking.\nAgent: I'm calling from your automobile dealership regarding your vehicle upgrade...\nCustomer: Oh yes, I was thinking about it.\nAgent: Great! Can I schedule a test ride for you?" : null,
    });
  }
  return calls;
}

export function generateSeedAppointments(leadIds: string[], dealershipId: string) {
  const types = ["test_ride", "showroom_visit"] as const;
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
      appointment_type: types[Math.floor(Math.random() * types.length)],
      status: statuses[Math.floor(Math.random() * statuses.length)],
      notes: "Customer confirmed via phone call. Bring RC book and Aadhar.",
    });
  }
  return appointments;
}
