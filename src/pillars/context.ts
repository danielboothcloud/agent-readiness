import type { Pillar } from "../types/index.js";
import { fileExists, readFileContent } from "./utils.js";

// Agent Context & Capabilities — is the agent set up with the right context and tools
// for THIS codebase: AI context files, MCP servers/connectors, and skills. Agnostic to
// which harness (Claude Code, Codex, pi, Cursor, …).
const context: Pillar = {
  id: "context",
  name: "Agent Context & Capabilities",
  description:
    "Verifies the repo gives coding agents the context and capabilities they need — AI context files, MCP servers/connectors, and skills scoped to this codebase.",
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
          return { criterionId: "ai-context-file", pass: true, message: `AI context file found: ${found}` };
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
          return { criterionId: "mcp-servers", pass: true, message: `MCP configuration found: ${found}` };
        }
        // mcpServers block inside a settings file.
        for (const f of [".claude/settings.json", ".claude/settings.local.json", ".vscode/settings.json"]) {
          const c = await readFileContent(repoPath, f);
          if (c && c.includes("mcpServers")) {
            return { criterionId: "mcp-servers", pass: true, message: `MCP servers configured in ${f}` };
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
          return { criterionId: "agent-skills", pass: true, message: `Agent skills/packages found: ${found}` };
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
  ],
};

export default context;
