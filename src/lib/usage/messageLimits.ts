// Fast daily message-limit check for Master Chat, backed by
// daily_message_usage (migration 079). Always goes through the
// service-role client, even when called from the authenticated web
// route — daily_message_usage has no RLS policy yet, so routing every
// read/write through service-role (scoped to an already-verified
// dealershipId) keeps this safe regardless of that gap.

import { createServiceClient } from "@/lib/supabase/service";
import { getEffectiveLimits } from "@/lib/usage/effectiveLimits";

export interface MessageLimitResult {
  allowed: boolean;
  messagesPerDay: number | null; // null = unlimited
  usedToday: number;
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Checks today's message count against the dealership's plan limit and,
 * if allowed, records the message. Not atomic — a rare concurrent-request
 * race could under-count by one — which is fine for a soft usage limit
 * like this; never worth blocking a real chat message over.
 */
export async function checkAndRecordMessageUsage(dealershipId: string): Promise<MessageLimitResult> {
  const service = createServiceClient();
  // Effective, not plan — applies any agency per-client override.
  const limits = await getEffectiveLimits(service, dealershipId);
  const usageDate = todayDateString();

  const { data: row } = await service
    .from("daily_message_usage")
    .select("message_count")
    .eq("dealership_id", dealershipId)
    .eq("usage_date", usageDate)
    .maybeSingle();
  const usedToday = row?.message_count ?? 0;

  if (limits.messagesPerDay != null && usedToday >= limits.messagesPerDay) {
    return { allowed: false, messagesPerDay: limits.messagesPerDay, usedToday };
  }

  await service
    .from("daily_message_usage")
    .upsert(
      { dealership_id: dealershipId, usage_date: usageDate, message_count: usedToday + 1 },
      { onConflict: "dealership_id,usage_date" }
    );

  return { allowed: true, messagesPerDay: limits.messagesPerDay, usedToday: usedToday + 1 };
}
