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
  test("passes with pi's .pi/mcp.json", async () => {
    const dir = await make("mcp-pi", { ".pi/mcp.json": '{"mcpServers":{}}' });
    const r = await mcp(dir, mockProjectInfo());
    expect(r.pass).toBe(true);
    expect(r.message).toContain(".pi/mcp.json");
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
  test("passes with pi prompt templates", async () => {
    const dir = await make("sk-pi-prompts", { ".pi/prompts/release.md": "x" });
    expect((await skills(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("passes with pi packages declared in .pi/settings.json", async () => {
    const dir = await make("sk-pi-pkgs", {
      ".pi/settings.json": JSON.stringify({
        packages: ["npm:pi-lens", { source: "git:github.com/acme/pi-tools" }],
      }),
    });
    const r = await skills(dir, mockProjectInfo());
    expect(r.pass).toBe(true);
    expect(r.message).toContain("npm:pi-lens, git:github.com/acme/pi-tools");
  });
  test("fails with an empty pi packages list", async () => {
    const dir = await make("sk-pi-nopkgs", {
      ".pi/settings.json": '{"packages":[]}',
    });
    expect((await skills(dir, mockProjectInfo())).pass).toBe(false);
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
  test("passes with pi-warden installed as a project package", async () => {
    const dir = await make("gr-warden-pkg", {
      ".pi/settings.json": JSON.stringify({
        packages: ["npm:pi-warden@1.2.0"],
      }),
    });
    const r = await guardrails(dir, mockProjectInfo());
    expect(r.pass).toBe(true);
    expect(r.message).toContain("pi-warden package");
  });
  test("other pi packages are not guardrails", async () => {
    const dir = await make("gr-pkg-other", {
      ".pi/settings.json": JSON.stringify({
        packages: ["npm:pi-warden-extra"],
      }),
    });
    expect((await guardrails(dir, mockProjectInfo())).pass).toBe(false);
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

const editFeedback = getCheck(context, "agent-edit-feedback");

describe("agent-edit-feedback", () => {
  test("passes with a .pi-lens.json", async () => {
    const dir = await make("ef-lens-cfg", { ".pi-lens.json": "{}" });
    const r = await editFeedback(dir, mockProjectInfo());
    expect(r.pass).toBe(true);
    expect(r.message).toContain("(pi-lens)");
  });
  test("passes with pi-lens project ast-grep rules", async () => {
    const dir = await make("ef-lens-rules", {
      "rules/ast-grep-rules/rules/typescript/no-any.yml": "id: no-any",
    });
    expect((await editFeedback(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("passes with pi-lens as a project package (object or git form)", async () => {
    const dir = await make("ef-lens-pkg", {
      ".pi/settings.json": JSON.stringify({
        packages: [{ source: "git:github.com/someone/pi-lens@main" }],
      }),
    });
    const r = await editFeedback(dir, mockProjectInfo());
    expect(r.pass).toBe(true);
    expect(r.message).toContain("pi-lens package");
  });
  test("passes with a Claude PostToolUse hook", async () => {
    const dir = await make("ef-claude", {
      ".claude/settings.json": JSON.stringify({
        hooks: { PostToolUse: [{ matcher: "Edit|Write", hooks: [] }] },
      }),
    });
    expect((await editFeedback(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("passes with a Cursor afterFileEdit hook", async () => {
    const dir = await make("ef-cursor", {
      ".cursor/hooks.json": '{"version":1,"hooks":{"afterFileEdit":[]}}',
    });
    expect((await editFeedback(dir, mockProjectInfo())).pass).toBe(true);
  });
  test("PreToolUse-only hooks are guardrails, not edit feedback", async () => {
    const dir = await make("ef-pre-only", {
      ".claude/settings.json": JSON.stringify({
        hooks: { PreToolUse: [{ matcher: "Bash", hooks: [] }] },
      }),
    });
    expect((await editFeedback(dir, mockProjectInfo())).pass).toBe(false);
  });
  test("fails empty, pointing at pi-lens", async () => {
    const dir = await make("ef-empty");
    const r = await editFeedback(dir, mockProjectInfo());
    expect(r.pass).toBe(false);
    expect(r.details).toContain("pi install -l npm:pi-lens");
  });
});
