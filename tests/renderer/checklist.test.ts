import { describe, expect, test } from "vitest";
import {
  checklistFormatFromPath,
  renderChecklist,
} from "../../src/renderer/checklist.js";
import type { Pillar, ReportData } from "../../src/types/index.js";

const pillar: Pillar = {
  id: "testing",
  name: "Testing",
  description: "",
  icon: "",
  criteria: [
    {
      id: "has-tests",
      name: "Has tests",
      description: "",
      pillarId: "testing",
      level: 1,
      requiresLLM: false,
      check: async () => ({
        criterionId: "has-tests",
        pass: true,
        message: "ok",
      }),
    },
    {
      id: "coverage",
      name: "Coverage",
      description: "",
      pillarId: "testing",
      level: 2,
      requiresLLM: false,
      check: async () => ({
        criterionId: "coverage",
        pass: false,
        message: "no coverage",
      }),
    },
    {
      id: "ai-check",
      name: "AI check",
      description: "",
      pillarId: "testing",
      level: 3,
      requiresLLM: true,
      check: async () => ({
        criterionId: "ai-check",
        pass: false,
        message: "needs --ai",
        skipped: true,
      }),
    },
  ],
};

const data: ReportData = {
  repoName: "demo",
  repoPath: "/tmp/demo",
  projectInfo: {
    detectedTypes: ["typescript"],
    isMonorepo: false,
    packages: [],
    workspaces: [],
    knowledge: [],
  },
  pillars: [pillar],
  results: new Map([
    [
      "testing",
      [
        { criterionId: "has-tests", pass: true, message: "ok" },
        { criterionId: "coverage", pass: false, message: "no coverage" },
        {
          criterionId: "ai-check",
          pass: false,
          message: "needs --ai",
          skipped: true,
        },
      ],
    ],
  ]),
  levelResult: {
    level: 1,
    nextLevelProgress: { current: 0, needed: 1, remaining: 1, nextLevel: 2 },
  },
  pillarScores: [{ pillarId: "testing", passed: 1, total: 2, percentage: 50 }],
  recommendations: [
    {
      title: "Add coverage",
      description: "Configure coverage reporting",
      reason: "",
      effort: "low",
      impact: "high",
      pillarId: "testing",
      criterionId: "coverage",
    },
  ],
};

describe("renderChecklist", () => {
  test("markdown output has checkboxes, statuses and fixes", () => {
    const out = renderChecklist(data, "md");
    expect(out).toContain("# Agent Readiness Checklist: demo");
    expect(out).toContain("## Testing (1/2, 50%)");
    expect(out).toContain("- [x] **Has tests** (L1, `has-tests`)");
    expect(out).toContain("- [ ] **Coverage** (L2, `coverage`)");
    expect(out).toContain("Fix: Configure coverage reporting");
    expect(out).toContain("- [-] **AI check**");
  });

  test("txt output uses plain text headings", () => {
    const out = renderChecklist(data, "txt");
    expect(out).not.toContain("#");
    expect(out).not.toContain("**");
    expect(out).toContain("- [ ] Coverage (L2, coverage)");
  });

  test("format inferred from extension", () => {
    expect(checklistFormatFromPath("out.TXT")).toBe("txt");
    expect(checklistFormatFromPath("out.md")).toBe("md");
    expect(checklistFormatFromPath("out")).toBe("md");
  });
});
