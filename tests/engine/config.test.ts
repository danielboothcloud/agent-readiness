import { afterEach, describe, expect, test } from "vitest";
import YAML from "yaml";
import { generateDefaultConfig } from "../../src/engine/config.js";
import { discoverSubprojects } from "../../src/engine/detector.js";
import { ALL_PILLARS } from "../../src/pillars/index.js";
import { cleanup, createTestDir, writeFixtures } from "../helpers.js";

let dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs) await cleanup(d);
  dirs = [];
});

const allIds = ALL_PILLARS.flatMap((p) => p.criteria.map((c) => c.id));

describe("generateDefaultConfig", () => {
  test("spells out every setting with the value in use, nothing commented out", () => {
    const text = generateDefaultConfig();
    const config = YAML.parse(text);

    expect(Object.keys(config.pillars)).toEqual(ALL_PILLARS.map((p) => p.id));
    expect(Object.keys(config.criteria)).toEqual(allIds);
    expect(Object.values(config.criteria).every((v) => v === true)).toBe(true);
    expect(Object.keys(config.paths)).toEqual(allIds);
    expect(config.paths.linter).toEqual(["."]);
    expect(config.harnesses).toEqual(["pi"]);
    expect(config.workspaces).toEqual([]);
    expect(config.knowledge).toEqual([]);
    expect(config.thresholds).toEqual({ "level-pass": 0.8 });
    expect(config.aiEnabled).toBe(false);
    expect(config.apiBaseUrl).toBe("https://api.openai.com/v1");
    expect(config.apiKey).toBeUndefined(); // never write secrets

    // No commented-out settings: comments are prose, not `# key: value`.
    const commentedSettings = text
      .split("\n")
      .filter((l) => /^\s*#\s*[\w-]+:\s*\S/.test(l) && !/^\s*# [A-Z]/.test(l));
    expect(commentedSettings).toEqual([]);
  });

  test("pre-fills every check with the root and detected sub-projects", () => {
    const config = YAML.parse(
      generateDefaultConfig({
        locations: [".", "services/api", "services/web"],
        harnesses: ["pi", "claude"],
      }),
    );
    for (const id of allIds) {
      expect(config.paths[id], id).toEqual([".", "services/api", "services/web"]);
    }
    expect(config.harnesses).toEqual(["pi", "claude"]);
  });
});

describe("discoverSubprojects", () => {
  test("finds manifest folders and workspace packages, skipping vendored dirs", async () => {
    const dir = await createTestDir("subprojects");
    dirs.push(dir);
    await writeFixtures(dir, {
      "package.json": JSON.stringify({ workspaces: ["packages/*"] }),
      "packages/ui/package.json": "{}",
      "services/billing/go.mod": "module billing",
      "services/worker/pyproject.toml": "",
      "infra/main.tf": "",
      "node_modules/x/package.json": "{}",
      "a/b/c/d/package.json": "{}", // deeper than 3 levels
    });
    expect(await discoverSubprojects(dir)).toEqual([
      "infra",
      "packages/ui",
      "services/billing",
      "services/worker",
    ]);
  });
});
