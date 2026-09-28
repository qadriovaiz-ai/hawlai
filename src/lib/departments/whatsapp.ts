// The WhatsApp marketing tasks, as plain data.
//
// This lives apart from the agent that runs them because the picker UI is
// a client component: importing the agent for this one constant pulled the
// whole server module graph — Claude client, usage logging, the
// service-role Supabase client — into browser JavaScript. See
// tests/clientBundleBoundary.test.ts.
//
// Nothing here may import anything. That is the point.

export interface WhatsappTaskMeta {
  key: string;
  label: string;
  instructions: string;
}

export const WHATSAPP_TASKS: WhatsappTaskMeta[] = [
  { key: "broadcast", label: "Broadcast Message", instructions: "A short broadcast-style WhatsApp message (under 300 characters) for an announcement or update, using WhatsApp formatting (*bold*, _italic_ where it helps), 1-2 relevant emoji, ends with a clear next step. Return {message}." },
  { key: "chatbot_flow", label: "AI Chatbot Flow", instructions: "A WhatsApp chatbot conversation flow script for handling common inbound questions for this business: return {flow: [{trigger, response}]} — 6 common triggers (e.g. 'pricing', 'hours', 'location', greeting) each with the exact response text the bot/agent should send." },
  { key: "follow_up", label: "Follow-up Message", instructions: "A WhatsApp follow-up message for a lead who hasn't replied, casual and low-pressure, under 200 characters, gives an easy out. Return {message}." },
  { key: "order_update", label: "Order Update", instructions: "A WhatsApp order/booking status update message, clear and reassuring, under 200 characters, includes a placeholder like {status} or {date} where the real detail would be inserted. Return {message}." },
  { key: "promotion", label: "Promotion", instructions: "A WhatsApp promotional message, under 250 characters, WhatsApp formatting, clear CTA. Feature an offer only if the facts list an active one (use its code and terms exactly); otherwise promote the product itself. Return {message}." },
  { key: "cart_recovery", label: "Cart Recovery", instructions: "A WhatsApp message for someone who showed interest but didn't follow through, gentle nudge addressing likely hesitation, under 200 characters, soft CTA. Return {message}." },
  { key: "lead_nurturing", label: "Lead Nurturing Sequence", instructions: "A 3-message WhatsApp nurture sequence for a warm lead, each message short (under 150 characters) with a distinct angle (value, trust built only from real facts, gentle CTA), meant to be sent a few days apart. Return {messages: [{step, message}]}." },
];
