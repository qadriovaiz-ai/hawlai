// ------------------------------------------------------------------
// Agent Personas — Multi-Agent Workforce, P3 piece 5
// ------------------------------------------------------------------
// Personas already existed implicitly across four separately-written
// prompts (outbound calls read as a salesperson, inbound as a
// receptionist, DMs as support, website chat as sales). Nobody chose
// those mappings — they emerged. This registry names them and lets a
// business owner reassign which persona handles which channel.
//
// Same plain-object-registry shape as executionPolicy.ts's
// ACTION_POLICIES, tasks/taskExecutors.ts's TASK_EXECUTORS, and
// events/eventHandlers.ts's EVENT_HANDLERS.
//
// DELIBERATELY configuration, not AI-chosen routing: nothing here
// classifies intent to pick a persona. That would be real new
// autonomous authority (a misroute means a complaint handled by a
// sales persona), so persona assignment stays a human decision —
// consistent with the suggest-and-approve principle used throughout.
//
// CHANNEL_DEFAULT_PERSONA below reproduces today's behavior exactly,
// so a business that never touches the setting sees no change at all.
// ------------------------------------------------------------------

export type PersonaKey = "sales" | "support" | "receptionist";
export type PersonaChannel = "call_outbound" | "call_inbound" | "dm" | "website_chat";

export interface AgentPersona {
  key: PersonaKey;
  label: string;
  description: string; // shown in the settings UI, plain-English
  // Injected into each surface's existing prompt in place of its
  // previously-hardcoded goals section.
  goals: string;
  // Which live-call tools this persona may use. Applied to calls only
  // — DM/website chat have no tool access at all today (a deliberate
  // scoping decision, see P3 20a), and granting them any is a separate
  // capability decision, not something this piece assumes.
  callTools: string[];
}

// Every live call tool that exists today (toolRegistry.ts, channels
// includes "call"). Named here rather than inlined so a persona's
// grant is readable as "everything" vs. an explicit subset.
const ALL_CALL_TOOLS = [
  "check_availability", "create_appointment", "update_lead",
  "check_order_status", "escalate_to_human", "log_complaint", "request_refund",
];

export const AGENT_PERSONAS: Record<PersonaKey, AgentPersona> = {
  sales: {
    key: "sales",
    label: "Sales",
    description: "Focused on moving interested people forward — understanding what they need, handling objections, and getting to a real next step.",
    goals: `1. Confirm you're speaking with the right person, briefly and naturally.
2. Understand what they're looking for or what stopped them from moving forward.
3. Answer questions honestly — if you don't have specific product/pricing details, say a team member will follow up with exact information rather than guessing or making up specifics.
4. If they're genuinely interested, offer a clear next step (a callback, a visit, more information sent to them, or a booked appointment if you have that tool) — don't try to close a sale on this call.
5. Keep the call natural and unhurried — this is a real conversation, not a script being read aloud.

If they're not interested, thank them politely and end the call — never pressure someone who says no.`,
    // No refund handling — a sales conversation isn't where a refund
    // decision belongs, and the persona has no context for judging one.
    callTools: ["check_availability", "create_appointment", "update_lead", "escalate_to_human"],
  },
  support: {
    key: "support",
    label: "Support",
    description: "Focused on solving problems for existing customers — order questions, complaints, and refund requests, without a sales angle.",
    goals: `1. Find out what's actually wrong or what they need help with, before trying to resolve anything.
2. Look up their real order/account details with your tools rather than asking them to repeat information you can find yourself.
3. If something genuinely went wrong, acknowledge it plainly — don't get defensive, don't over-promise a resolution you can't guarantee.
4. Log a complaint with real specifics whenever they raise one, so it's tracked and someone follows up.
5. Never try to upsell or redirect to a purchase — this person needs help, not a pitch.

If you can't resolve it, say so honestly and make sure a team member picks it up.`,
    callTools: ALL_CALL_TOOLS,
  },
  receptionist: {
    key: "receptionist",
    label: "Receptionist",
    description: "Front-desk first contact — finds out why someone's reaching out and routes them to the right place, without assuming they're a buyer.",
    goals: `1. Greet them and ask how you can help, naturally — you don't yet know who they are or why they're reaching out.
2. Understand what they need — a question, a booking, an order, a complaint — before trying to resolve it.
3. Answer honestly — if you don't have specific product/pricing/availability details, say a team member will follow up with exact information rather than guessing.
4. If it's something you can't resolve, take their details and confirm someone will get back to them, rather than leaving them without a next step.
5. Keep it natural and unhurried — this is a real conversation, not a script being read aloud.`,
    callTools: ALL_CALL_TOOLS,
  },
};

// Reproduces today's behavior exactly — see file header.
export const CHANNEL_DEFAULT_PERSONA: Record<PersonaChannel, PersonaKey> = {
  call_outbound: "sales",
  call_inbound: "receptionist",
  dm: "support",
  website_chat: "sales",
};

export const PERSONA_CHANNEL_LABELS: Record<PersonaChannel, string> = {
  call_outbound: "Outbound AI calls",
  call_inbound: "Inbound AI calls",
  dm: "Instagram / Facebook DMs",
  website_chat: "Website chat widget",
};

// Best-effort: a missing/unreadable setting always falls back to the
// channel default, so a lookup failure can never leave a live call or
// DM without a persona.
export async function resolvePersona(supabase: any, dealershipId: string, channel: PersonaChannel): Promise<AgentPersona> {
  try {
    const { data } = await supabase
      .from("agent_persona_settings")
      .select("persona")
      .eq("dealership_id", dealershipId)
      .eq("channel", channel)
      .maybeSingle();
    const key = (data?.persona as PersonaKey) ?? CHANNEL_DEFAULT_PERSONA[channel];
    return AGENT_PERSONAS[key] ?? AGENT_PERSONAS[CHANNEL_DEFAULT_PERSONA[channel]];
  } catch {
    return AGENT_PERSONAS[CHANNEL_DEFAULT_PERSONA[channel]];
  }
}
