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
      id: "test-framework",
      name: "Test framework configured",
      description: "",
      pillarId: "testing",
      level: 1,
      requiresLLM: false,
      check: async () => ({
        criterionId: "test-framework",
        pass: true,
        message: "ok",
      }),
    },
    {
      id: "coverage-config",
      name: "Coverage configured",
      description: "",
      pillarId: "testing",
      level: 2,
      requiresLLM: false,
      check: async () => ({
        criterionId: "coverage-config",
        pass: false,
        message: "no coverage",
      }),
    },
    {
      id: "test-quality",
      name: "Test quality (AI)",
      description: "",
      pillarId: "testing",
      level: 3,
      requiresLLM: true,
      check: async () => ({
        criterionId: "test-quality",
        pass: false,
        message: "needs --ai",
        skipped: true,
      }),
    },
  ],
};

const contextPillar: Pillar = {
  id: "context",
  name: "Agent Context & Capabilities",
  description: "",
  icon: "",
  criteria: [
    {
      id: "agent-edit-feedback",
      name: "In-edit code feedback for agents",
      description: "",
      pillarId: "context",
      level: 3,
      requiresLLM: false,
      check: async () => ({
        criterionId: "agent-edit-feedback",
        pass: true,
        message: "pi-lens found",
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
    harnesses: ["pi", "claude"],
    harnessSource: "detected",
  },
  pillars: [pillar, contextPillar],
  results: new Map([
    [
      "testing",
      [
        { criterionId: "test-framework", pass: true, message: "ok" },
        { criterionId: "coverage-config", pass: false, message: "no coverage" },
        {
          criterionId: "test-quality",
          pass: false,
          message: "needs --ai",
          skipped: true,
        },
      ],
    ],
    [
      "context",
      [{ criterionId: "agent-edit-feedback", pass: true, message: "pi-lens found" }],
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
      criterionId: "coverage-config",
      explore: ["How late do you find bugs today?"],
      harnessAdvice: [
        { harness: "pi", advice: "pi-lens does it" },
        { harness: "claude", advice: "PostToolUse hook" },
      ],
    },
  ],
  considerations: [
    {
      id: "guard-destructive-tasks",
      title: "Hold publish tasks",
      signal: "Irreversible tasks: publish (mise.toml)",
      description: "Publishing can't be undone.",
      explore: ["Which of these needs a human?"],
      harnessAdvice: [{ harness: "pi", advice: "Install pi-warden" }],
    },
  ],
};

describe("renderChecklist", () => {
  test("markdown output has checkboxes and statuses for every item", () => {
    const out = renderChecklist(data, "md");
    expect(out).toContain("# Agent Readiness Checklist: demo");
    expect(out).not.toContain("/tmp/demo"); // no machine-specific path in a committed file
    expect(out).toContain("## Testing (1/2, 50%)");
    expect(out).toContain("- [x] **Test framework configured** (L1, `test-framework`)");
    expect(out).toContain("  - Status: passing — ok");
    expect(out).toContain("- [ ] **Coverage configured** (L2, `coverage-config`)");
    expect(out).toContain("  - Status: failing — no coverage");
    expect(out).toContain("- [-] **Test quality (AI)**");
    expect(out).toContain("  - Status: skipped (needs --ai)");
  });

  test("every pillar explains why it matters and asks questions", () => {
    const out = renderChecklist(data, "md");
    for (const name of ["## Testing", "## Agent Context & Capabilities"]) {
      const section = out.slice(out.indexOf(name));
      expect(section).toMatch(/^## .*\n\n\*\*Why this matters:\*\* \S/);
      expect(section).toContain("**Questions for this area:**");
    }
  });

  test("passing, failing and skipped items all keep full guidance", () => {
    const out = renderChecklist(data, "md");
    const item = (id: string) => {
      const start = out.indexOf(`\`${id}\``);
      const next = out.indexOf("\n- [", start);
      return out.slice(start, next === -1 ? undefined : next);
    };
    for (const id of ["test-framework", "coverage-config", "test-quality"]) {
      const block = item(id);
      expect(block, id).toContain("  - Why it matters: ");
      expect(block, id).toContain("  - Goal: ");
      expect(block, id).toContain("  - Ask yourself:");
    }
    // Sizing: failing items show impact from the recommendation.
    expect(item("coverage-config")).toContain("(effort: low, impact: high)");
    expect(item("test-framework")).toMatch(/\(effort: \w+\)/);
  });

  test("passing agent criteria still show per-harness starting points", () => {
    const out = renderChecklist(data, "md");
    expect(out).toContain("Harnesses: pi, Claude Code (detected)");
    const start = out.indexOf("`agent-edit-feedback`");
    const block = out.slice(start, out.indexOf("\n## ", start));
    expect(block).toContain("  - Status: passing — pi-lens found");
    expect(block).toContain("  - Starting points (examples, not the only options):");
    expect(block).toContain("    - pi: `pi install -l npm:pi-lens`");
    expect(block).toContain("    - Claude Code: Add a PostToolUse hook");
    expect(block).not.toContain("    - Codex:");
  });

  test("renders unscored considerations section", () => {
    const out = renderChecklist(data, "md");
    expect(out).toContain("## Considerations (not scored)");
    expect(out).toContain("- [ ] **Hold publish tasks**");
    expect(out).toContain(
      "  - Signal: Irreversible tasks: publish (mise.toml)",
    );
    expect(out).toContain("    - Which of these needs a human?");
    expect(out).toContain("    - pi: Install pi-warden");
  });

  test("questions come before examples so users decide what fits", () => {
    const out = renderChecklist(data, "md");
    const start = out.indexOf("`agent-edit-feedback`");
    const ask = out.indexOf("  - Ask yourself:", start);
    const examples = out.indexOf("  - Starting points (examples", start);
    expect(ask).toBeGreaterThan(-1);
    expect(ask).toBeLessThan(examples);
  });

  test("ends with a self-directed discovery section", () => {
    const out = renderChecklist(data, "md");
    expect(out).toContain("## Find what fits this repo");
    expect(out).toContain("- [ ] Which systems outside the repo");
    expect(out).toContain("**Where to look** (adopt before you build):");
    expect(out).toContain(
      "- pi: Browse the pi package gallery (https://pi.dev/packages)",
    );
    expect(out).toContain("- Claude Code: Browse plugin marketplaces");
    expect(out).not.toContain("- Codex:");
    expect(out).toContain(
      "- Any harness: For external systems, check the official MCP registry",
    );
  });

  test("txt output uses plain text headings", () => {
    const out = renderChecklist(data, "txt");
    expect(out).not.toContain("#");
    expect(out).not.toContain("**");
    expect(out).toContain("- [ ] Coverage configured (L2, coverage-config)");
    expect(out).toContain("Why this matters: ");
  });

  test("format inferred from extension", () => {
    expect(checklistFormatFromPath("out.TXT")).toBe("txt");
    expect(checklistFormatFromPath("out.md")).toBe("md");
    expect(checklistFormatFromPath("out")).toBe("md");
  });
});
