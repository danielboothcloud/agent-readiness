import { describe, test, expect, afterEach } from "bun:test";
import context from "../../src/pillars/context.js";
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

const aiContext = getCheck(context, "ai-context-file");
const mcp = getCheck(context, "mcp-servers");
const skills = getCheck(context, "agent-skills");

describe("ai-context-file", () => {
  test("passes with CLAUDE.md", async () => {
    const dir = await make("ai-claude", { "CLAUDE.md": "x" });
    expect((await aiContext(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("passes with project-context.md", async () => {
    const dir = await make("ai-ctx", { "project-context.md": "x" });
    expect((await aiContext(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("fails empty", async () => {
    const dir = await make("ai-empty");
    expect((await aiContext(dir, mockProjectInfo())).pass).toBe(false);
  });
});

describe("mcp-servers", () => {
  test("passes with .mcp.json", async () => {
    const dir = await make("mcp-file", { ".mcp.json": "{}" });
    expect((await mcp(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("passes with mcpServers in settings", async () => {
    const dir = await make("mcp-settings", { ".claude/settings.json": '{"mcpServers":{}}' });
    expect((await mcp(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("fails empty", async () => {
    const dir = await make("mcp-empty");
    expect((await mcp(dir, mockProjectInfo())).pass).toBe(false);
  });
});

describe("agent-skills", () => {
  test("passes with .claude/skills", async () => {
    const dir = await make("sk-claude", { ".claude/skills/foo/SKILL.md": "x" });
    expect((await skills(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("passes with a pi extension", async () => {
    const dir = await make("sk-pi", { ".pi/extensions/x.ts": "export default () => {};" });
    expect((await skills(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("fails empty", async () => {
    const dir = await make("sk-empty");
    expect((await skills(dir, mockProjectInfo())).pass).toBe(false);
  });
});
