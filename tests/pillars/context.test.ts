import { describe, test, expect, afterEach } from "vitest";
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
    const dir = await make("mcp-settings", {
      ".claude/settings.json": '{"mcpServers":{}}',
    });
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
    const dir = await make("sk-pi", {
      ".pi/extensions/x.ts": "export default () => {};",
    });
    expect((await skills(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("fails empty", async () => {
    const dir = await make("sk-empty");
    expect((await skills(dir, mockProjectInfo())).pass).toBe(false);
  });
});

const guardrails = getCheck(context, "agent-guardrails");

describe("agent-guardrails", () => {
  test("passes with Claude hooks", async () => {
    const dir = await make("gr-claude-hooks", {
      ".claude/settings.json": JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "Bash", hooks: [{ type: "command", command: "x" }] },
          ],
        },
      }),
    });
    const r = await guardrails(dir, mockProjectInfo());
    expect(r.pass).toBe(true);
    expect(r.message).toContain(".claude/settings.json (hooks)");
  });
  test("passes with Claude deny permissions", async () => {
    const dir = await make("gr-claude-deny", {
      ".claude/settings.json": JSON.stringify({
        permissions: { deny: ["Bash(rm -rf:*)"] },
      }),
    });
    expect((await guardrails(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("fails with allow-only Claude permissions and mcpServers", async () => {
    const dir = await make("gr-claude-allow", {
      ".claude/settings.json": JSON.stringify({
        permissions: { allow: ["Bash(ls)"] },
        mcpServers: {},
      }),
    });
    expect((await guardrails(dir, mockProjectInfo())).pass).toBe(false);
  });
  test("ignores per-user .claude/settings.local.json", async () => {
    const dir = await make("gr-claude-local", {
      ".claude/settings.local.json": JSON.stringify({
        permissions: { deny: ["Bash(rm:*)"] },
      }),
    });
    expect((await guardrails(dir, mockProjectInfo())).pass).toBe(false);
  });
  test("passes with .cursor/hooks.json", async () => {
    const dir = await make("gr-cursor", {
      ".cursor/hooks.json": JSON.stringify({
        version: 1,
        hooks: { beforeShellExecution: [{ command: "x" }] },
      }),
    });
    expect((await guardrails(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("fails with empty hooks block", async () => {
    const dir = await make("gr-cursor-empty", {
      ".cursor/hooks.json": '{"version":1,"hooks":{}}',
    });
    expect((await guardrails(dir, mockProjectInfo())).pass).toBe(false);
  });
  test("passes with inline hooks in .codex/config.toml", async () => {
    const dir = await make("gr-codex", {
      ".codex/config.toml":
        'model = "x"\n\n[[hooks.PreToolUse]]\nmatcher = "Bash"\n',
    });
    expect((await guardrails(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("passes with hooks in JSONC .gemini/settings.json", async () => {
    const dir = await make("gr-gemini", {
      ".gemini/settings.json":
        '{\n  // project hooks\n  "hooks": { "BeforeTool": [] }\n}',
    });
    expect((await guardrails(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("passes with pi yaml hooks", async () => {
    const dir = await make("gr-pi-hooks", {
      ".pi/hook/hooks.yaml": "hooks: []",
    });
    expect((await guardrails(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("passes with pi-warden project config", async () => {
    const dir = await make("gr-warden", {
      ".pi/pi-warden.json": '{"enabled":true}',
    });
    expect((await guardrails(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("passes with a blocking pi extension", async () => {
    const dir = await make("gr-pi-ext", {
      ".pi/extensions/guard.ts":
        'export default (pi) => { pi.on("tool_call", async () => ({ block: true, reason: "no" })); };',
    });
    expect((await guardrails(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("fails with a non-blocking pi extension", async () => {
    const dir = await make("gr-pi-ext-plain", {
      ".pi/extensions/x.ts": "export default () => {};",
    });
    expect((await guardrails(dir, mockProjectInfo())).pass).toBe(false);
  });
  test("fails empty", async () => {
    const dir = await make("gr-empty");
    expect((await guardrails(dir, mockProjectInfo())).pass).toBe(false);
  });
});
