// Every platform the executor can actually run.
//
// THE FAILURE THIS EXISTS TO PREVENT, which happened: the registry was
// an object literal inline in the approve route, holding one entry.
// createPublishAction could be called with "meta", so a Meta campaign
// was proposed, previewed and approved exactly like a Shopify price
// change — and then the executor said "No platform module for 'meta'",
// AFTER the human had said yes.
//
// A missing entry is not a compile error. PlatformId lists four
// platforms; the registry held one; nothing anywhere connected the two.
// It surfaces only on the approve click, which is the last place you
// want to discover a feature was never wired.
//
// Exported as a function rather than left inline so a test can CALL it
// and read what is actually in it. Six bugs on this feature survived
// tests that read source text; this one is checkable by running it.

import type { PlatformId, PublishPlatform } from "./types";
import { createShopifyPlatform } from "./platforms/shopify";
import { shopifyCredentialsAdapter } from "./platforms/shopifyCredentials";
import { createMetaPlatform } from "./platforms/meta";

export function createPlatformRegistry(supabase: any): Partial<Record<PlatformId, PublishPlatform>> {
  return {
    shopify: createShopifyPlatform({ getCredentials: shopifyCredentialsAdapter }),
    meta: createMetaPlatform({ supabase }),
    // wordpress and woocommerce are declared in PlatformId but have no
    // producer — nothing calls createPublishAction with either, so no
    // card can reach approval for them. Deliberately ABSENT rather than
    // stubbed: a stub would make the executor claim success on a
    // publish that never happened, which is worse than the error.
  };
}
