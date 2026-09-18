// Meta reads retry with real waits in production (src/lib/ads/metaRead.ts).
// Tests zero the waits so a transient-error test runs in milliseconds.
// The number of attempts and every outcome are unchanged: only the
// sleeping is removed. metaRead.test.ts checks the production defaults
// separately, so zeroing them here cannot hide a missing backoff.

import { beforeEach } from "vitest";
import { metaRetryTiming } from "@/lib/ads/metaRead";
import { claudeRetryTiming } from "@/lib/ai/claude";

beforeEach(() => {
  metaRetryTiming.delaysMs = [0, 0];
  metaRetryTiming.settleMs = [0, 0];
  // Same for Anthropic calls (lib/ai/claude.ts); tests/claudeClient.test.ts
  // checks the production defaults.
  claudeRetryTiming.defaultMs = 0;
  claudeRetryTiming.maxMs = 0;
});
