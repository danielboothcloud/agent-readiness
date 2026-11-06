import { describe, expect, test } from "vitest";
import {
  CRITERION_INFO,
  generateRecommendations,
} from "../../src/engine/recommender.js";
import { ALL_PILLARS } from "../../src/pillars/index.js";
import type { CriterionResult } from "../../src/types/index.js";

function allFailing(): Map<string, CriterionResult[]> {
  return new Map(
    ALL_PILLARS.map((p) => [
      p.id,
      p.criteria.map((c) => ({
        criterionId: c.id,
        pass: false,
        message: "nope",
      })),
    ]),
  );
}

const level1 = {
  level: 1 as const,
  nextLevelProgress: {
    current: 0,
    needed: 1,
    remaining: 1,
    nextLevel: 2 as const,
  },
};

describe("CRITERION_INFO", () => {
  test("has actionable advice for every registered criterion", () => {
    const missing = ALL_PILLARS.flatMap((p) => p.criteria)
      .map((c) => c.id)
      .filter((id) => !CRITERION_INFO[id]);
    expect(missing).toEqual([]);
  });

  test("pi advice covers pi-lens, pi-warden and pi packages", () => {
    expect(CRITERION_INFO["agent-edit-feedback"].harness?.pi).toContain(
      "pi-lens",
    );
    expect(CRITERION_INFO["agent-guardrails"].harness?.pi).toContain(
      "pi-warden",
    );
    expect(CRITERION_INFO["agent-harness-rules"].harness?.pi).toContain(
      "pi-warden.md",
    );
    expect(CRITERION_INFO["agent-skills"].harness?.pi).toContain(
      "pi install -l",
    );
  });

  test("every criterion asks open questions", () => {
    const missing = ALL_PILLARS.flatMap((p) => p.criteria)
      .map((c) => c.id)
      .filter((id) => !(CRITERION_INFO[id].explore?.length ?? 0));
    expect(missing).toEqual([]);
  });

  test("agent-facing criteria ask questions, not just prescribe", () => {
    for (const id of [
      "ai-context-file",
      "mcp-servers",
      "agent-skills",
      "agent-guardrails",
      "agent-edit-feedback",
      "agent-harness-rules",
    ]) {
      expect(CRITERION_INFO[id].explore?.length ?? 0).toBeGreaterThan(0);
      expect(CRITERION_INFO[id].explore?.every((q) => q.includes("?"))).toBe(true);
    }
  });
});

describe("generateRecommendations", () => {
  test("returns every failing criterion, not just the top 10", () => {
    const recs = generateRecommendations(ALL_PILLARS, allFailing(), [], level1);
    const total = ALL_PILLARS.reduce((n, p) => n + p.criteria.length, 0);
    expect(recs).toHaveLength(total);
    expect(
      recs.every((r) => !r.description.startsWith("Address the failing")),
    ).toBe(true);
  });

  test("skipped criteria are not recommended", () => {
    const results = allFailing();
    results.set(
      "context",
      (results.get("context") ?? []).map((r) => ({ ...r, skipped: true })),
    );
    const recs = generateRecommendations(ALL_PILLARS, results, [], level1);
    expect(recs.some((r) => r.pillarId === "context")).toBe(false);
  });

  test("explore questions are carried onto recommendations", () => {
    const recs = generateRecommendations(ALL_PILLARS, allFailing(), [], level1);
    const skills = recs.find((r) => r.criterionId === "agent-skills");
    expect(skills?.explore?.some((q) => q.includes("Search before you build"))).toBe(
      true,
    );
  });

  test("harness advice is limited to targeted harnesses, pi first", () => {
    const recs = generateRecommendations(
      ALL_PILLARS,
      allFailing(),
      [],
      level1,
      ["pi", "claude"],
    );
    const feedback = recs.find((r) => r.criterionId === "agent-edit-feedback");
    expect(feedback?.harnessAdvice?.map((a) => a.harness)).toEqual([
      "pi",
      "claude",
    ]);

    const linter = recs.find((r) => r.criterionId === "linter");
    expect(linter?.harnessAdvice).toBeUndefined();
  });

  test("next-level criteria sort first", () => {
    const recs = generateRecommendations(ALL_PILLARS, allFailing(), [], level1);
    const levelOf = (id: string) =>
      ALL_PILLARS.flatMap((p) => p.criteria).find((c) => c.id === id)?.level;
    expect(levelOf(recs[0].criterionId)).toBe(2);
  });
});
