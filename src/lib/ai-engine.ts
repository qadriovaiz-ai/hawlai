import { LeadTemperature } from "@/types";

export interface QualificationResult {
  score: number;
  temperature: LeadTemperature;
  reason: string;
  breakdown: {
    vehicleAge: number;
    budget: number;
    phoneAvailable: number;
  };
}

export function qualifyLead(params: {
  purchaseYear: number | null;
  budget: number | null;
  phone: string | null;
}): QualificationResult {
  const currentYear = new Date().getFullYear();
  let vehicleAgePoints = 0;
  let budgetPoints = 0;
  let phonePoints = 0;
  const reasons: string[] = [];

  // Vehicle Age Scoring
  if (params.purchaseYear) {
    const age = currentYear - params.purchaseYear;
    if (age >= 10) {
      vehicleAgePoints = 50;
      reasons.push(`vehicle is ${age} years old (high replacement urgency)`);
    } else if (age >= 7) {
      vehicleAgePoints = 40;
      reasons.push(`vehicle is ${age} years old (moderate replacement need)`);
    } else if (age >= 5) {
      vehicleAgePoints = 30;
      reasons.push(`vehicle is ${age} years old (approaching replacement cycle)`);
    } else {
      reasons.push(`vehicle purchased in ${params.purchaseYear} (relatively new)`);
    }
  }

  // Budget Scoring
  if (params.budget) {
    if (params.budget >= 150000) {
      budgetPoints = 30;
      reasons.push(`budget of ₹${params.budget.toLocaleString("en-IN")} indicates premium purchase intent`);
    } else if (params.budget >= 100000) {
      budgetPoints = 20;
      reasons.push(`budget of ₹${params.budget.toLocaleString("en-IN")} indicates mid-range purchase intent`);
    } else if (params.budget >= 50000) {
      budgetPoints = 10;
      reasons.push(`budget of ₹${params.budget.toLocaleString("en-IN")} indicates entry-level purchase intent`);
    }
  }

  // Phone Availability
  if (params.phone && params.phone.trim().length >= 10) {
    phonePoints = 10;
    reasons.push("phone number available for direct contact");
  }

  const score = vehicleAgePoints + budgetPoints + phonePoints;

  let temperature: LeadTemperature;
  if (score >= 70) temperature = "hot";
  else if (score >= 40) temperature = "warm";
  else temperature = "cold";

  const reason =
    reasons.length > 0
      ? `${reasons.join(", ")}. AI confidence score: ${score}/100.`
      : "Insufficient data to generate detailed qualification reason.";

  return {
    score,
    temperature,
    reason,
    breakdown: {
      vehicleAge: vehicleAgePoints,
      budget: budgetPoints,
      phoneAvailable: phonePoints,
    },
  };
}
