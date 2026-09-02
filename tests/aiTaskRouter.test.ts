// AI task router — restored from the harness written when
// business_intelligence was registered (commit b6513e7).
//
// The point of these is regression on COST and QUALITY: a task
// silently moving tier changes both. The business_intelligence
// assertions in particular guard a deliberate decision to keep a
// once-per-business task on Sonnet rather than saving a fraction of a
// rupee on the call that defines how the product sounds forever.

import { describe, it, expect } from "vitest";
import { getModel } from "@/lib/models";
import { classifyTask, modelForTask, modelForComplexity, TASK_COMPLEXITY } from "@/lib/aiTaskRouter";

describe("business_intelligence routing", () => {
  it("is classified normal", () => {
    expect(classifyTask("business_intelligence")).toBe("normal");
  });

  it("resolves to the same model the agent used before the router was wired in", () => {
    // Registering it must have been a zero-behaviour-change edit.
    expect(modelForTask("business_intelligence")).toBe(getModel("standard"));
  });

  it("is NOT downgraded to the fast tier", () => {
    expect(modelForTask("business_intelligence")).not.toBe(getModel("fast"));
  });

  it("is NOT upgraded to premium", () => {
    expect(modelForTask("business_intelligence")).not.toBe(getModel("premium"));
  });
});

describe("fallback behaviour", () => {
  it("treats an unregistered task as normal, never as cheap", () => {
    // Silently downgrading an unclassified task would undershoot
    // quality on work nobody has reasoned about yet.
    expect(classifyTask("some_task_nobody_registered")).toBe("normal");
    expect(modelForTask("some_task_nobody_registered")).toBe(getModel("standard"));
  });
});

describe("tier mapping", () => {
  it("maps simple to the fast tier", () => {
    expect(modelForComplexity("simple")).toBe(getModel("fast"));
  });

  it("maps normal and complex to the same standard tier", () => {
    // Deliberately not 1:1 with the four complexity levels — complex
    // work is still Sonnet-class, matching every existing call site.
    expect(modelForComplexity("complex")).toBe(modelForComplexity("normal"));
    expect(modelForComplexity("complex")).toBe(getModel("standard"));
  });

  it("maps critical to premium", () => {
    expect(modelForComplexity("critical")).toBe(getModel("premium"));
  });
});

describe("registered task identities", () => {
  it("keeps the high-frequency simple tasks on the fast tier", () => {
    for (const key of ["call_scoring", "dm_auto_reply", "comment_auto_reply", "broadcast"]) {
      expect(TASK_COMPLEXITY[key]).toBe("simple");
    }
  });

  it("keeps whole-business analysis on critical", () => {
    expect(TASK_COMPLEXITY.full_business_analysis).toBe("critical");
    expect(TASK_COMPLEXITY.deep_strategy).toBe("critical");
  });

  it("resolves every registered task to a real model string", () => {
    for (const key of Object.keys(TASK_COMPLEXITY)) {
      expect(modelForTask(key)).toBeTruthy();
    }
  });
});
