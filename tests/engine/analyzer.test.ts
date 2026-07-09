import { describe, expect, test, afterEach } from "vitest";
import { AnalysisEngine } from "../../src/engine/analyzer.js";
import type { Pillar } from "../../src/types/index.js";
import { cleanup, createTestDir, mockProjectInfo, writeFixtures } from "../helpers.js";

let dirs: string[] = [];

async function make(name: string, fixtures: Record<string, string> = {}) {
  const dir = await createTestDir(name);
  dirs.push(dir);
  if (Object.keys(fixtures).length > 0) {
    await writeFixtures(dir, fixtures);
  }
  return dir;
}

afterEach(async () => {
  for (const dir of dirs) await cleanup(dir);
  dirs = [];
});

describe("AnalysisEngine", () => {
  test("counts a criterion as passing when it passes in a configured workspace", async () => {
    const dir = await make("workspace-analysis", {
      "worker/pyproject.toml": "[project]\nname = 'worker'",
    });
    const pillar: Pillar = {
      id: "dev-environment",
      name: "Developer Environment",
      description: "test pillar",
      icon: "",
      criteria: [
        {
          id: "has-pyproject",
          name: "Has pyproject",
          description: "test criterion",
          pillarId: "dev-environment",
          level: 1,
          requiresLLM: false,
          check: async (repoPath) => ({
            criterionId: "has-pyproject",
            pass: repoPath.endsWith("worker"),
            message: repoPath.endsWith("worker") ? "pyproject found" : "missing",
          }),
        },
      ],
    };
    const engine = new AnalysisEngine(
      [pillar],
      dir,
      mockProjectInfo({
        workspaces: [
          {
            name: "worker",
            path: "worker",
            detectedTypes: ["python"],
            knowledge: [],
          },
        ],
      }),
    );

    const results = await engine.run();

    expect(results.get("dev-environment")).toEqual([
      {
        criterionId: "has-pyproject",
        pass: true,
        message: "[worker] pyproject found",
      },
    ]);
  });
});
