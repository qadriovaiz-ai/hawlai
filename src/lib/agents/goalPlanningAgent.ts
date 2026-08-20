// ------------------------------------------------------------------
// Goal Planning Agent — P1 Wave 4 (8a)
// ------------------------------------------------------------------
// Takes a goal stated in plain language and decomposes it into a real,
// concrete plan: a mix of human tasks (existing `tasks` table, for
// work only a person can do) and agent tasks (`agent_tasks`, for work
// the AI can actually execute later via the Task Queue worker).
//
// Deliberately constrained to what's genuinely executable today rather
// than proposing anything that would sit forever unexecuted:
// - human tasks must use a role that's actually held by an active team
//   member (checked by the caller against ctx.team, not here — this
//   function doesn't know the team roster).
// - agent tasks must use action_type "generate_content" — the only
//   TASK_EXECUTOR registered so far. Extend both this prompt and
//   taskExecutors.ts together as more become real.
// ------------------------------------------------------------------

import { logClaudeUsage } from "../usage/logUsage";

export interface GoalPlanTask {
  type: "human" | "agent";
  title: string;
  brief: string;
  role?: string; // required when type === "human"
  contentType?: string; // required when type === "agent" (action_type is always generate_content today)
  topic?: string; // required when type === "agent"
}

export interface GoalPlan {
  title: string;
  description: string;
  target_metric: string | null;
  target_value: number | null;
  deadline: string | null; // YYYY-MM-DD or null
  tasks: GoalPlanTask[];
}

const VALID_CONTENT_TYPES = ["instagram_post", "facebook_post", "linkedin_post", "blog_post", "email_newsletter"];

export async function decomposeGoal(
  goalText: string,
  businessName: string,
  businessCategory: string,
  availableRoles: string[],
  logContext?: { supabase: any; dealershipId: string }
): Promise<GoalPlan | null> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        messages: [
          {
            role: "user",
            content: `A business owner at "${businessName}" (a ${businessCategory} business in India) stated this goal: "${goalText}"

Break this into a real, concrete plan. Return JSON only:
{
  "title": "short goal title",
  "description": "1-2 sentence restatement of the goal",
  "target_metric": "what's measured, e.g. 'leads' or 'revenue' — or null if not cleanly quantifiable",
  "target_value": number or null,
  "deadline": "YYYY-MM-DD" or null if no clear timeframe was implied,
  "tasks": [
    {"type": "human", "title": "...", "brief": "specific, actionable instructions", "role": "one of: ${availableRoles.length > 0 ? availableRoles.join(", ") : "none available — do not propose any human tasks"}"},
    {"type": "agent", "title": "...", "brief": "...", "contentType": "one of: ${VALID_CONTENT_TYPES.join(", ")}", "topic": "specific topic for the content"}
  ]
}

Rules:
- 2-5 tasks total, concrete and specific to this business — never generic filler like "improve marketing."
- "human" tasks are for work only a person can do (calls, in-person work, judgment calls) — role MUST be exactly one of the available roles listed above. If none are available, propose zero human tasks.
- "agent" tasks are ONLY for generating a piece of content (contentType MUST be exactly one of the values listed above) — this is the only thing the AI can execute automatically today. Don't propose an agent task for anything else.
- Prefer agent tasks when the work is genuinely just content generation — don't force a human task just because a role happens to exist.`,
          },
        ],
      }),
    });
    const data = await response.json();
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "goal_decomposition", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse((jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim());
    // Defensive filter — never trust the model to have followed the
    // constraints perfectly; drop anything that would create a task
    // referencing a role/contentType that isn't actually valid rather
    // than letting it insert and silently fail or misbehave later.
    parsed.tasks = (parsed.tasks ?? []).filter((t: GoalPlanTask) =>
      t.type === "human" ? availableRoles.includes(t.role ?? "") : VALID_CONTENT_TYPES.includes(t.contentType ?? "")
    );
    return parsed;
  } catch (err: any) {
    console.error("[goal-planning-agent] decomposeGoal error:", err.message);
    return null;
  }
}
