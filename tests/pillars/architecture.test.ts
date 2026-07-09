import { describe, test, expect, afterEach } from "vitest";
import architecture from "../../src/pillars/architecture.js";
import {
  createTestDir,
  cleanup,
  writeFixtures,
  mockProjectInfo,
  getCheck,
} from "../helpers.js";

let dirs: string[] = [];

async function make(name: string, fixtures: Record<string, string> = {}) {
  const dir = await createTestDir(name);
  dirs.push(dir);
  if (Object.keys(fixtures).length > 0) await writeFixtures(dir, fixtures);
  return dir;
}

afterEach(async () => {
  for (const d of dirs) await cleanup(d);
  dirs = [];
});

const methodology = getCheck(architecture, "methodology-documented");
const boundary = getCheck(architecture, "boundary-enforcement");
const harness = getCheck(architecture, "agent-harness-rules");

describe("methodology-documented", () => {
  test("passes with docs/agent-readiness.md", async () => {
    const dir = await make("meth-ar", { "docs/agent-readiness.md": "# readiness" });
    expect((await methodology(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("passes with ARCHITECTURE.md", async () => {
    const dir = await make("meth-arch", { "ARCHITECTURE.md": "# arch" });
    expect((await methodology(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("fails empty", async () => {
    const dir = await make("meth-empty");
    expect((await methodology(dir, mockProjectInfo())).pass).toBe(false);
  });
});

describe("boundary-enforcement", () => {
  test("passes with .importlinter", async () => {
    const dir = await make("bnd-imp", { ".importlinter": "[importlinter]" });
    expect((await boundary(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("passes with depguard in golangci config", async () => {
    const dir = await make("bnd-dep", {
      ".golangci.yml": "linters-settings:\n  depguard:\n    rules: {}",
    });
    expect((await boundary(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("fails empty", async () => {
    const dir = await make("bnd-empty");
    expect((await boundary(dir, mockProjectInfo())).pass).toBe(false);
  });
});

describe("agent-harness-rules", () => {
  test("passes with .pi/readiness.rules.json", async () => {
    const dir = await make("harness", { ".pi/readiness.rules.json": "{}" });
    expect((await harness(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("fails empty", async () => {
    const dir = await make("harness-empty");
    expect((await harness(dir, mockProjectInfo())).pass).toBe(false);
  });
});
