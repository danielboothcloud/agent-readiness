import { afterEach, describe, expect, test } from "vitest";
import { detectHarnesses } from "../../src/engine/harness.js";
import { cleanup, createTestDir, writeFixtures } from "../helpers.js";

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

describe("detectHarnesses", () => {
  test("defaults to pi when nothing is committed", async () => {
    const dir = await make("h-empty", { "AGENTS.md": "x" });
    expect(await detectHarnesses(dir)).toEqual({
      harnesses: ["pi"],
      harnessSource: "default",
    });
  });

  test("detects harnesses from committed files, pi first", async () => {
    const dir = await make("h-detect", {
      "CLAUDE.md": "x",
      ".cursor/rules/a.mdc": "x",
      "pi-warden.md": "# rule",
    });
    expect(await detectHarnesses(dir)).toEqual({
      harnesses: ["pi", "claude", "cursor"],
      harnessSource: "detected",
    });
  });

  test("pi-lens project rules count as a pi signal", async () => {
    const dir = await make("h-lens", {
      "rules/ast-grep-rules/rules/ts/no-x.yml": "id: no-x",
    });
    expect((await detectHarnesses(dir)).harnesses).toEqual(["pi"]);
  });

  test("config overrides detection and normalizes aliases", async () => {
    const dir = await make("h-config", { "CLAUDE.md": "x" });
    expect(await detectHarnesses(dir, ["claude-code", "pi", "bogus"])).toEqual({
      harnesses: ["pi", "claude"],
      harnessSource: "config",
    });
  });
});
