// The social management tasks, as plain data.
//
// This lives apart from the agent that runs them because the picker UI is
// a client component: importing the agent for this one constant pulled the
// whole server module graph — Claude client, usage logging, the
// service-role Supabase client — into browser JavaScript. See
// tests/clientBundleBoundary.test.ts.
//
// Nothing here may import anything. That is the point.

export interface SocialTaskMeta {
  key: string;
  label: string;
  needsInput: boolean; // whether this task takes a message/comment to reply to
  instructions: string;
}

export const SOCIAL_TASKS: SocialTaskMeta[] = [
  { key: "reply_suggestions", label: "Reply Suggestions", needsInput: true, instructions: "Given an incoming DM from a customer, write 3 reply variants (short, medium, and one with a follow-up question), friendly and on-brand, ready to send." },
  { key: "comment_replies", label: "Comment Replies", needsInput: true, instructions: "Given a public comment on a post, write 3 public-facing reply variants — warm, brief, and appropriate for a public audience (not just the commenter)." },
  { key: "dm_automation", label: "DM Automation Templates", needsInput: false, instructions: "5 auto-reply templates for common DM scenarios (greeting/first contact, pricing inquiry, availability/hours question, complaint, thank-you-for-purchase), each with {scenario, template} — template should have a natural placeholder like {name} where personalization fits." },
  { key: "community_management", label: "Community Management", needsInput: false, instructions: "A short community management playbook: 4 response-tone guidelines (do's/don'ts) and 3 example scenarios of when to take a conversation to DM instead of replying publicly. Return {guidelines: [], escalateToDm: []}." },
  { key: "growth_strategy", label: "Growth Strategy", needsInput: false, instructions: "A 5-tactic organic social growth strategy tailored to this business type and India, each with {tactic, howTo}, realistic for a small business with no ad budget." },
  { key: "engagement_analysis", label: "Engagement Analysis", needsInput: false, instructions: "6 practical tips to improve engagement on organic posts for this business type, each with {tip, why}." },
  { key: "viral_trends", label: "Viral Trend Detection", needsInput: false, instructions: "Search for current trending Instagram Reels/YouTube Shorts formats, audio, or hashtags in India relevant to this business category (this month). Return 5 trends as {trend, howToUse} — howToUse should explain how this specific business could adapt the trend. Base this on what you actually find via search, not guesses." },
];
