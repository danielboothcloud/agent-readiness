import type { Pillar } from "../types/index.js";
import { fileExists, findFiles, readFileContent } from "./utils.js";

// The subset of harness settings files (Claude Code / Cursor / Codex / Gemini CLI)
// that the guardrails check reads.
interface HarnessSettings {
  hooks?: Record<string, unknown>;
  permissions?: { deny?: unknown[]; ask?: unknown[] };
}

function parseSettings(content: string): HarnessSettings | null {
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed !== null && typeof parsed === "object"
      ? (parsed as HarnessSettings)
      : null;
  } catch {
    return null;
  }
}

// True when a JSON settings file declares a non-empty `hooks` block. Falls back to a
// regex when the file is not strict JSON (e.g. JSONC comments in .gemini/settings.json).
function declaresHooks(content: string): boolean {
  const settings = parseSettings(content);
  if (settings) return Object.keys(settings.hooks ?? {}).length > 0;
  return /"hooks"\s*:\s*\{\s*"/.test(content);
}

// Claude Code: deny/ask permission rules restrict what the agent may run unprompted.
// Allow-only rules loosen, not guard, so they don't count.
function declaresRestrictivePermissions(content: string): boolean {
  const settings = parseSettings(content);
  if (settings) {
    const { deny = [], ask = [] } = settings.permissions ?? {};
    return deny.length > 0 || ask.length > 0;
  }
  return /"(deny|ask)"\s*:\s*\[\s*"/.test(content);
}

// pi extension that intercepts tool calls and can block them.
function isBlockingPiExtension(content: string): boolean {
  return (
    /\.on\(\s*["'`]tool_call["'`]/.test(content) &&
    /\bblock\s*:\s*true\b/.test(content)
  );
}

// Agent Context & Capabilities — is the agent set up with the right context, tools and
// guardrails for THIS codebase: AI context files, MCP servers/connectors, skills, and
// hooks/permissions. Agnostic to which harness (Claude Code, Codex, pi, Cursor, …).
const context: Pillar = {
  id: "context",
  name: "Agent Context & Capabilities",
  description:
    "Verifies the repo gives coding agents the context, capabilities and guardrails they need — AI context files, MCP servers/connectors, skills, and hooks/permissions scoped to this codebase.",
  icon: "🧠",
  criteria: [
    {
      id: "ai-context-file",
      name: "AI context file present",
      description:
        "An agent context file exists (CLAUDE.md, AGENTS.md, .cursorrules, copilot-instructions, project-context.md).",
      pillarId: "context",
      level: 2,
      requiresLLM: false,
      check: async (repoPath) => {
        const found = await fileExists(
          repoPath,
          "CLAUDE.md",
          "AGENTS.md",
          "GEMINI.md",
          ".cursorrules",
          ".cursor/rules/**",
          ".github/copilot-instructions.md",
          "project-context.md",
          "**/project-context.md",
        );
        if (found) {
          return {
            criterionId: "ai-context-file",
            pass: true,
            message: `AI context file found: ${found}`,
          };
        }
        return {
          criterionId: "ai-context-file",
          pass: false,
          message: "No AI context file found.",
          details:
            "Add CLAUDE.md / AGENTS.md (cross-harness), .cursorrules, .github/copilot-instructions.md, or project-context.md so agents share the same context.",
        };
      },
    },
    {
      id: "mcp-servers",
      name: "MCP servers / connectors configured",
      description:
        "The repo declares the MCP servers or connectors the codebase needs (databases, APIs, domain tools).",
      pillarId: "context",
      level: 3,
      requiresLLM: false,
      check: async (repoPath) => {
        const found = await fileExists(
          repoPath,
          ".mcp.json",
          ".cursor/mcp.json",
          ".vscode/mcp.json",
          ".gemini/settings.json",
        );
        if (found) {
          return {
            criterionId: "mcp-servers",
            pass: true,
            message: `MCP configuration found: ${found}`,
          };
        }
        // mcpServers block inside a settings file.
        for (const f of [
          ".claude/settings.json",
          ".claude/settings.local.json",
          ".vscode/settings.json",
        ]) {
          const c = await readFileContent(repoPath, f);
          if (c && c.includes("mcpServers")) {
            return {
              criterionId: "mcp-servers",
              pass: true,
              message: `MCP servers configured in ${f}`,
            };
          }
        }
        return {
          criterionId: "mcp-servers",
          pass: false,
          message: "No MCP servers / connectors configured.",
          details:
            "If the codebase needs external context (DB, API, domain tools), declare the MCP servers/connectors (.mcp.json or an mcpServers block) so agents can reach them. Skip only if genuinely none are needed.",
        };
      },
    },
    {
      id: "agent-skills",
      name: "Agent skills & packages available",
      description:
        "Repo-scoped skills / commands / harness packages are present so agents have codebase-specific capabilities.",
      pillarId: "context",
      level: 3,
      requiresLLM: false,
      check: async (repoPath) => {
        const found = await fileExists(
          repoPath,
          ".claude/skills/**",
          ".agents/skills/**",
          ".claude/commands/**",
          ".cursor/commands/**",
          "pi.json",
          "pi.config.ts",
          ".pi/config.json",
          ".pi/packages.json",
          ".pi/extensions/**",
        );
        if (found) {
          return {
            criterionId: "agent-skills",
            pass: true,
            message: `Agent skills/packages found: ${found}`,
          };
        }
        return {
          criterionId: "agent-skills",
          pass: false,
          message: "No repo-scoped agent skills or packages found.",
          details:
            "Add skills/commands (.claude/skills, .agents/skills, .claude/commands) or pi packages/extensions (.pi/, pi install npm:<pkg>) for codebase-specific workflows agents should reuse.",
        };
      },
    },
    {
      id: "agent-guardrails",
      name: "Agent guardrails (hooks / permissions) configured",
      description:
        "Committed, repo-scoped hooks, permission rules or guard configs intercept agent tool calls (Claude Code, Cursor, Codex, Gemini CLI, pi hooks / blocklist / pi-warden).",
      pillarId: "context",
      level: 3,
      requiresLLM: false,
      check: async (repoPath) => {
        const found: string[] = [];

        // Claude Code. settings.local.json is per-user and gitignored by default, so it
        // doesn't count as a shared guardrail.
        const claude = await readFileContent(repoPath, ".claude/settings.json");
        if (claude) {
          if (declaresHooks(claude))
            found.push(".claude/settings.json (hooks)");
          if (declaresRestrictivePermissions(claude))
            found.push(".claude/settings.json (permissions)");
        }

        // Cursor, Codex and Gemini CLI hook configs.
        for (const f of [
          ".cursor/hooks.json",
          ".codex/hooks.json",
          ".gemini/settings.json",
        ]) {
          const c = await readFileContent(repoPath, f);
          if (c && declaresHooks(c)) found.push(f);
        }
        const codexToml = await readFileContent(repoPath, ".codex/config.toml");
        if (codexToml && /^\s*\[\[?hooks[.\]]/m.test(codexToml)) {
          found.push(".codex/config.toml (hooks)");
        }

        // pi: yaml hooks, aio blocklist, pi-warden project config. (pi-warden.md is a
        // rules file and is scored by architecture's agent-harness-rules instead.)
        for (const f of [
          ".pi/hook/hooks.yaml",
          ".pi/aio-blocklist.json",
          ".pi/pi-warden.json",
        ]) {
          if (await fileExists(repoPath, f)) found.push(f);
        }

        // pi extensions that block tool calls (pi.on("tool_call") → { block: true }).
        const extensions = await findFiles(
          repoPath,
          ".pi/extensions/**/*.{ts,js,mjs}",
        );
        for (const f of extensions.slice(0, 50)) {
          const c = await readFileContent(repoPath, f);
          if (c && isBlockingPiExtension(c)) found.push(f);
        }

        if (found.length > 0) {
          return {
            criterionId: "agent-guardrails",
            pass: true,
            message: `Agent guardrails found: ${found.join(", ")}`,
          };
        }
        return {
          criterionId: "agent-guardrails",
          pass: false,
          message:
            "No repo-scoped agent guardrails (hooks / permissions) found.",
          details:
            "Commit hooks or permission rules so every agent session on this repo is guarded: hooks or permissions.deny/ask in .claude/settings.json, .cursor/hooks.json, .codex/hooks.json, hooks in .gemini/settings.json, or pi's .pi/hook/hooks.yaml, .pi/aio-blocklist.json or .pi/pi-warden.json. User-level configs (~/.claude, ~/.pi/agent, pi-warden's user config) and .claude/settings.local.json are per-machine and don't count.",
        };
      },
    },
  ],
};

export default context;
