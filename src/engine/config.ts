import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { Config } from "../types/index.js";

export const DEFAULT_CONFIG_FILENAME = ".agent-profile.yml";

const CONFIG_FILENAMES = [
  DEFAULT_CONFIG_FILENAME,
  ".agent-profile.yaml",
];

/**
 * Loads an Agent Profile configuration file from the given repository path.
 *
 * Searches for `.agent-profile.yml` or `.agent-profile.yaml`. If no config file
 * exists, returns an empty object so callers can safely fall back to defaults.
 * Parse errors are logged as warnings and also result in an empty object.
 */
export async function loadConfig(repoPath: string): Promise<Config> {
  for (const filename of CONFIG_FILENAMES) {
    const filePath = path.join(repoPath, filename);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = YAML.parse(content) as Config | null;
      return parsed ?? {};
    } catch (err: unknown) {
      // If the file simply does not exist, try the next candidate.
      if (isNodeError(err) && err.code === "ENOENT") {
        continue;
      }

      // Any other error (permissions, YAML syntax, etc.) — warn and bail.
      console.warn(
        `Warning: failed to parse config file "${filePath}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {};
    }
  }

  // No config file found — perfectly fine.
  return {};
}

/**
 * Returns a well-documented YAML template that users can save as
 * `.agent-profile.yml` in their repository root.
 */
export function generateDefaultConfig(): string {
  return `# ──────────────────────────────────────────────────────────────
# Agent Profile configuration
# Place this file at the root of your repository as
#   .agent-profile.yml   or   .agent-profile.yaml
# ──────────────────────────────────────────────────────────────

# ── Pillars ──────────────────────────────────────────────────
# Toggle entire assessment pillars on or off.
# Set a pillar to false to skip all of its criteria.
# All pillars are enabled by default.
pillars:
  style-linting: true
  testing: true
  documentation: true
  dev-environment: true
  ci-cd: true
  code-health: true
  security: true
  architecture: true
  context: true

# ── Criteria ─────────────────────────────────────────────────
# Fine-grained toggles for individual criteria within pillars.
# Set a criterion to false to skip it during assessment.
# All criteria are enabled by default.
criteria:
  # Style & Linting
  linter: true
  formatter: true
  type-checker: true
  pre-commit-hooks: true
  editorconfig: true

  # Testing
  test-framework: true
  test-files-exist: true
  test-script: true
  coverage-config: true
  e2e-tests: true

  # Documentation
  readme: true
  contributing: true
  api-docs: true
  codeowners: true
  architecture-docs: true

  # Dev Environment
  lock-file: true
  containerization: true
  env-documentation: true
  setup-script: true
  version-pinned: true

  # CI / CD
  ci-config: true
  ci-runs-tests: true
  ci-runs-linters: true
  build-automated: true
  deploy-pipeline: true
  branch-protection: true

  # Code Health
  no-outdated-deps: true
  dead-code-detection: true
  bundle-analysis: true

  # Security
  license: true
  security-scanning: true
  secrets-detection: true
  security-policy: true
  dep-update-automation: true

  # Architecture & Methodology
  methodology-documented: true
  boundary-enforcement: true
  agent-harness-rules: true

  # Agent Context & Capabilities
  ai-context-file: true
  mcp-servers: true
  agent-skills: true
  agent-guardrails: true
  agent-edit-feedback: true

# ── Harnesses ────────────────────────────────────────────────
# Coding-agent harnesses to tailor advice to: pi, claude, codex, cursor, gemini.
# Scoring stays harness-agnostic; this only changes the how-to text in
# recommendations and considerations (e.g. pi-lens / pi-warden / pi packages
# for pi). When unset, harnesses are detected from committed files (.pi/,
# .claude/, .codex/, .cursor/, .gemini/), falling back to pi.
# harnesses: [pi]

# ── Paths ─────────────────────────────────────────────────────
# Point individual checks at where things actually live in this repo, keyed by
# criterion ID (see the criteria list above). Paths are repo-relative and may be
# globs. A directory runs the check inside it (e.g. find the linter config in
# each service); a file counts as evidence that the check is met. Mapped paths
# are only consulted when the check fails at the repo root and in workspaces.
# Use \`workspaces\` instead when a subdirectory should be scanned for ALL checks.
paths:
  # linter: services/*                     # each service has its own config
  # test-framework: [services/*, libs/*]
  # ci-config: platform/pipelines/main.yml   # non-standard CI location
  # ai-context-file: docs/agents/AGENTS.md

# ── Workspaces ───────────────────────────────────────────────
# Declare nested codebases when the repository root is a coordination layer
# rather than a package root. Each workspace is scanned as an additional root;
# a criterion passes if it passes at the repo root or in any configured
# workspace.
#
# The detector has opinionated defaults for common ecosystems:
# JavaScript/TypeScript, Python, Go, Rust, JVM, .NET, Ruby, PHP, Swift, and
# infrastructure-as-code. Use "languages" to add explicit labels when a repo
# uses uncommon framework conventions or generated manifests.
workspaces:
  # - name: worker
  #   path: worker
  #   description: Python Temporal worker
  #   languages: [python]
  #   knowledge:
  #     - Owns workflows, agents, and tool integrations.
  # - name: frontend
  #   path: apps/frontend
  #   description: JavaScript/TypeScript app or service
  #   languages: [node, typescript] # optional extra tags: react, nextjs, nestjs, hono, express, bun, deno

# ── Project Knowledge ────────────────────────────────────────
# Static business or architecture context that should travel with the report.
# This is background knowledge only; live health/state should still come from
# source systems and metrics.
knowledge:
  # - This repo optimizes for Locality of Behaviour.
  # - Keep shared platform substrate generic; workload details belong in
  #   owning agents/toolsets.

# ── Thresholds ───────────────────────────────────────────────
# Override the scoring thresholds used when computing maturity
# levels. Values are expressed as decimals between 0 and 1.
thresholds:
  # Minimum percentage of criteria that must pass to reach a level
  # level-pass: 0.8

# ── AI Settings ──────────────────────────────────────────────
# When AI is enabled, some criteria use an LLM to perform deeper
# analysis (e.g. reviewing documentation quality).
# aiEnabled: false
# apiKey: ""           # Or set AGENT_READINESS_API_KEY / OPENAI_API_KEY env variable
# apiBaseUrl: ""       # Custom endpoint for the LLM API
`;
}

// ── Helpers ──────────────────────────────────────────────────

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
