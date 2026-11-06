import { afterEach, describe, expect, test } from "vitest";
import { AnalysisEngine } from "../../src/engine/analyzer.js";
import {
  normalizeCriterionPaths,
  resolveMappedPaths,
} from "../../src/engine/paths.js";
import styleLinting from "../../src/pillars/style-linting.js";
import ciCd from "../../src/pillars/ci-cd.js";
import type { Pillar } from "../../src/types/index.js";
import {
  cleanup,
  createTestDir,
  mockProjectInfo,
  writeFixtures,
} from "../helpers.js";

let dirs: string[] = [];

async function make(name: string, fixtures: Record<string, string> = {}) {
  const dir = await createTestDir(name);
  dirs.push(dir);
  await writeFixtures(dir, fixtures);
  return dir;
}

afterEach(async () => {
  for (const d of dirs) await cleanup(d);
  dirs = [];
});

const only = (pillar: Pillar, id: string): Pillar => ({
  ...pillar,
  criteria: pillar.criteria.filter((c) => c.id === id),
});

async function run(
  dir: string,
  pillar: Pillar,
  paths: Record<string, unknown>,
) {
  const ids = pillar.criteria.map((c) => c.id);
  const { paths: criterionPaths } = normalizeCriterionPaths(paths, ids);
  const engine = new AnalysisEngine([pillar], dir, mockProjectInfo(), {
    criterionPaths,
  });
  return (await engine.run()).get(pillar.id)?.[0];
}

describe("normalizeCriterionPaths", () => {
  test("accepts a string or list per known criterion", () => {
    const { paths, warnings } = normalizeCriterionPaths(
      { linter: "services/*", "ci-config": ["a.yml", "b.yml"] },
      ["linter", "ci-config"],
    );
    expect(paths).toEqual({
      linter: ["services/*"],
      "ci-config": ["a.yml", "b.yml"],
    });
    expect(warnings).toEqual([]);
  });

  test("warns on unknown IDs and paths outside the repo", () => {
    const { paths, warnings } = normalizeCriterionPaths(
      { lintr: "x", linter: ["../other", "/etc/x", "ok/"] },
      ["linter"],
    );
    expect(paths).toEqual({ linter: ["ok/"] });
    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toContain("unknown criterion ID");
    expect(warnings[1]).toContain("outside the repository");
  });

  test("rejects a non-object value", () => {
    expect(
      normalizeCriterionPaths(["linter"], ["linter"]).warnings,
    ).toHaveLength(1);
  });
});

describe("resolveMappedPaths", () => {
  test("splits globs into dirs, files and missing entries", async () => {
    const dir = await make("paths-resolve", {
      "services/api/x.ts": "",
      "services/web/x.ts": "",
      "deploy/ci.yml": "",
    });
    const r = await resolveMappedPaths(dir, [
      "services/*",
      "deploy/ci.yml",
      "nope/",
    ]);
    expect(r.dirs.sort()).toEqual(["services/api", "services/web"]);
    expect(r.files).toEqual(["deploy/ci.yml"]);
    expect(r.missing).toEqual(["nope/"]);
  });
});

describe("AnalysisEngine with mapped paths", () => {
  test("runs the real check inside a mapped directory", async () => {
    const dir = await make("paths-dir", {
      "services/billing/eslint.config.js": "export default [];",
    });
    const pillar = only(styleLinting, "linter");
    expect((await run(dir, pillar, {}))?.pass).toBe(false);

    const r = await run(dir, pillar, { linter: "services/*" });
    expect(r?.pass).toBe(true);
    expect(r?.message).toMatch(/^\[services\/billing\] /);
  });

  test("a mapped file counts as evidence", async () => {
    const dir = await make("paths-file", {
      "platform/pipelines/main.yml": "x",
    });
    const r = await run(dir, only(ciCd, "ci-config"), {
      "ci-config": "platform/pipelines/main.yml",
    });
    expect(r?.pass).toBe(true);
    expect(r?.message).toBe(
      "Mapped in .agent-profile.yml: platform/pipelines/main.yml",
    );
  });

  test("explains what was checked when mapped paths don't satisfy the check", async () => {
    const dir = await make("paths-fail", { "services/api/readme.txt": "" });
    const r = await run(dir, only(styleLinting, "linter"), {
      linter: ["services/*", "tools/lint"],
    });
    expect(r?.pass).toBe(false);
    expect(r?.message).toContain("checked: services/api");
    expect(r?.message).toContain("not found: tools/lint");
  });

  test("the list is exactly where the check looks: omit `.` to skip the root", async () => {
    const dir = await make("paths-exact", {
      "eslint.config.js": "export default [];",
      "services/api/readme.txt": "",
    });
    const pillar = only(styleLinting, "linter");
    expect((await run(dir, pillar, { linter: "services/api" }))?.pass).toBe(false);

    const withRoot = await run(dir, pillar, { linter: [".", "services/api"] });
    expect(withRoot?.pass).toBe(true);
    expect(withRoot?.message).not.toMatch(/^\[/); // passed at the root, no prefix
  });

  test("no entry means the root only, with an unchanged message", async () => {
    const dir = await make("paths-default", { "services/api/eslint.config.js": "" });
    const r = await run(dir, only(styleLinting, "linter"), {});
    expect(r?.pass).toBe(false);
    expect(r?.message).not.toContain(".agent-profile.yml");
  });

  test("subfolder checks use that folder's own languages", async () => {
    const dir = await make("paths-lang", {
      "package.json": "{}",
      "services/worker/go.mod": "module worker\n",
    });
    const r = await run(dir, only(styleLinting, "type-checker"), {
      "type-checker": [".", "services/worker"],
    });
    expect(r?.pass).toBe(true);
    expect(r?.message).toBe("[services/worker] Go has a built-in static type system");
  });
});
