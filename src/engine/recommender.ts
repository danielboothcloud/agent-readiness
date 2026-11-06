import type {
  Pillar,
  CriterionResult,
  PillarScore,
  LevelResult,
  Recommendation,
  MaturityLevel,
  HarnessId,
  HarnessAdvice,
} from "../types/index.js";

/** How many recommendations the terminal report and dashboard headline. */
export const TOP_RECOMMENDATIONS = 10;

export interface CriterionInfo {
  description: string;
  reason: string;
  effort: Recommendation["effort"];
  /**
   * Harness-specific example starting points. Only the repo's targeted harnesses
   * are shown, framed as examples rather than the prescribed answer.
   */
  harness?: Partial<Record<HarnessId, string>>;
  /**
   * Questions that help the user work out what fits THEIR repo. Ask, don't
   * prescribe: the right tool depends on the stack, team and workflow.
   */
  explore?: string[];
}

// ---------------------------------------------------------------------------
// Actionable description + reason + effort, keyed by criterion ID.
// Keys MUST match the `id` of a criterion in src/pillars (tested).
// ---------------------------------------------------------------------------

export const CRITERION_INFO: Record<string, CriterionInfo> = {
  // Style & Linting
  linter: {
    description:
      "Add a linter like ESLint or Biome to enforce code style and catch common mistakes",
    reason:
      "Linters give agents instant feedback on style issues, preventing CI failures and reducing review churn",
    effort: "medium",
    explore: [
      "Which mistakes keep coming back in review that a rule could catch automatically?",
      "Is there a linter your language community treats as standard, and does one tool cover both linting and formatting here?",
    ],
  },
  formatter: {
    description:
      "Configure an auto-formatter such as Prettier or Biome so code style is applied automatically",
    reason:
      "Auto-formatting removes style debates and lets agents produce consistently formatted code without guesswork",
    effort: "medium",
    explore: [
      "How much review time goes on whitespace, quotes and import order today?",
      "Does the formatter's default style match what's already in the codebase, or would adopting it rewrite every file?",
    ],
  },
  "type-checker": {
    description:
      "Enable strict type checking (e.g. strict mode in tsconfig.json, mypy, or pyright)",
    reason:
      "Strict types help agents catch errors at compile time instead of at runtime, dramatically improving code reliability",
    effort: "medium",
    explore: [
      "Where do runtime type errors actually happen in this codebase — and would stricter settings have caught them?",
    ],
  },
  "pre-commit-hooks": {
    description:
      "Set up pre-commit hooks with Husky, Lefthook, or pre-commit to run checks before every commit",
    reason:
      "Pre-commit hooks provide a fast feedback loop so agents discover issues before pushing code",
    effort: "medium",
    explore: [
      "Which checks are fast enough to run on every commit, and which belong in CI only?",
    ],
  },
  editorconfig: {
    description:
      "Create an .editorconfig file to standardize indentation, line endings, and charset across editors",
    reason:
      "EditorConfig ensures agents produce files with correct whitespace and encoding regardless of tooling",
    effort: "low",
    explore: [
      "Do editors and agents on this team agree on indentation, line endings and final newlines, or do diffs show churn?",
    ],
  },
  "naming-conventions": {
    description:
      "Establish and document consistent naming conventions for files, functions, and variables",
    reason:
      "Consistent naming lets agents predict correct patterns when writing new code, reducing review friction",
    effort: "medium",
    explore: [
      "Could someone guess a new file's name and location from the existing ones?",
      "Where do naming styles disagree today, and which one should win?",
    ],
  },

  // Testing
  "test-framework": {
    description:
      "Configure a test framework such as Jest, Vitest, pytest, or Go testing with a config file",
    reason:
      "A configured test framework lets agents write and run tests to verify their changes automatically",
    effort: "medium",
    explore: [
      "How does someone know a change works today? What would make that check repeatable?",
      "Is there a test runner the stack treats as standard that fits how this code is structured?",
    ],
  },
  "test-files-exist": {
    description:
      "Add test files alongside source code following standard naming conventions (*.test.*, *.spec.*, etc.)",
    reason:
      "Existing tests give agents examples to follow and a safety net to validate new code against",
    effort: "medium",
    explore: [
      "Which parts of the code would you be most nervous to let an agent change without tests?",
      "Are there existing tests an agent could copy the pattern from?",
    ],
  },
  "test-script": {
    description:
      "Define a 'test' script in package.json or a test target in a Makefile so tests can be run with a single command",
    reason:
      "A standard test command allows agents to verify changes without guessing how to run the test suite",
    effort: "medium",
    explore: [
      "Could a new contributor (or agent) run one test file in one command? Is that command written down?",
    ],
  },
  "coverage-config": {
    description:
      "Set up code coverage reporting in your test framework configuration",
    reason:
      "Coverage metrics help agents understand which parts of the codebase are well-tested and which need attention",
    effort: "high",
    explore: [
      "Do you want coverage as a gate, or as a map of which areas are risky to change?",
      "Which untested areas get changed most often?",
    ],
  },
  "e2e-tests": {
    description:
      "Add end-to-end or integration tests using Playwright, Cypress, or a similar framework",
    reason:
      "E2E tests give agents confidence that the whole application works correctly after changes, not just individual units",
    effort: "high",
    explore: [
      "Which user journeys would hurt most if an agent broke them silently? Start there.",
    ],
  },
  "test-quality": {
    description:
      "Improve test quality: add descriptive names, cover edge cases, and test behavior rather than implementation",
    reason:
      "High-quality tests give agents confidence that their changes work correctly and don't break existing behavior",
    effort: "high",
    explore: [
      "Would the tests fail if the behaviour broke, or only if the implementation changed?",
      "Do test names explain the behaviour well enough for an agent to tell what it's protecting?",
    ],
  },

  // Documentation
  readme: {
    description:
      "Create a comprehensive README.md with project overview, setup instructions, and usage examples",
    reason:
      "A good README helps agents understand the project context, conventions, and how to get started quickly",
    effort: "low",
    explore: [
      "Could someone go from clone to a working change using only the README?",
      "What does a newcomer (or agent) need first: purpose, setup, or how to run it?",
    ],
  },
  contributing: {
    description:
      "Add a CONTRIBUTING.md with development workflow, coding standards, and PR guidelines",
    reason:
      "Contributing guidelines teach agents the team's workflow so their PRs match expectations from the start",
    effort: "low",
    explore: [
      "What does a change need before it's mergeable here (tests, changelog, commit style, review)? Is that written down?",
      "Which workflow mistakes keep coming up in pull requests?",
    ],
  },
  "api-docs": {
    description:
      "Add API documentation using OpenAPI/Swagger specs, JSDoc, TypeDoc, or a dedicated docs folder",
    reason:
      "API docs let agents understand available endpoints, data shapes, and contracts without reading every source file",
    effort: "medium",
    explore: [
      "Which interfaces do other code, teams or agents depend on, and where is their contract described?",
      "Would generated docs from the code be enough, or is the contract the source of truth?",
    ],
  },
  codeowners: {
    description:
      "Create a CODEOWNERS file to define ownership for different parts of the codebase",
    reason:
      "CODEOWNERS helps agents understand who to tag for reviews and which areas have strict oversight",
    effort: "low",
    explore: [
      "Which areas need a specific reviewer, and how would an agent (or newcomer) find out who?",
    ],
  },
  "architecture-docs": {
    description:
      "Create architecture documentation (ARCHITECTURE.md or docs/adr/) describing system design and decisions",
    reason:
      "Architecture docs help agents make design choices consistent with the existing system instead of guessing",
    effort: "high",
    explore: [
      "Which design decisions would someone reverse without knowing why they were made?",
      "Where do the main components meet, and is that boundary written down anywhere?",
    ],
  },
  "readme-quality": {
    description:
      "Improve your README content: add clear sections for installation, usage, architecture, and contributing",
    reason:
      "A high-quality README gives agents rich context about the project beyond just file presence",
    effort: "high",
    explore: [
      "Which questions about this project keep coming up that the README doesn't answer?",
    ],
  },
  "docs-agent-friendliness": {
    description:
      "Improve documentation to be more AI-agent-friendly: explain project structure, coding conventions, and testing patterns",
    reason:
      "Agent-friendly docs help autonomous coding agents make correct changes without constant human guidance",
    effort: "high",
    explore: [
      "If an agent read only the docs, which wrong assumption would it most likely make?",
      "Are the commands and paths in the docs still correct?",
    ],
  },

  // Dev Environment
  "lock-file": {
    description:
      "Commit a dependency lock file (package-lock.json, pnpm-lock.yaml, yarn.lock, poetry.lock, etc.)",
    reason:
      "Lock files ensure agents install the exact same dependency versions, preventing 'works on my machine' issues",
    effort: "low",
    explore: [
      "Would a fresh install today give the same dependency versions as yesterday's CI run?",
    ],
  },
  containerization: {
    description:
      "Add a Dockerfile, docker-compose.yml, or .devcontainer configuration for reproducible environments",
    reason:
      "Containerization gives agents a fully reproducible environment, eliminating setup discrepancies",
    effort: "high",
    explore: [
      "What does running this project need beyond the language runtime (databases, queues, system libraries)?",
      "Is a container the simplest way to make that reproducible here, or would a toolchain manager be enough?",
    ],
  },
  "env-documentation": {
    description:
      "Create a .env.example or .env.template documenting all required environment variables",
    reason:
      "Environment variable documentation lets agents understand required configuration without accessing secrets",
    effort: "low",
    explore: [
      "Which environment variables must be set for the app or tests to run, and where would someone find them?",
      "Which ones are secrets that should never appear in a committed file?",
    ],
  },
  "setup-script": {
    description:
      "Add a setup script (Makefile, mise task, scripts/setup.sh, or npm run setup) to automate development environment setup",
    reason:
      "A one-command setup lets agents bootstrap the project quickly and correctly every time",
    effort: "medium",
    explore: [
      "How long does a fresh clone take to get to green tests, and which steps are tribal knowledge?",
    ],
  },
  "version-pinned": {
    description:
      "Pin the runtime version with .nvmrc, .node-version, .python-version, .tool-versions, mise.toml, or .mise.toml",
    reason:
      "Pinned runtime versions prevent agents from hitting version incompatibilities during execution",
    effort: "low",
    explore: [
      "Which runtime and tool versions does this repo actually depend on, and what breaks on the wrong one?",
    ],
  },

  // CI/CD
  "ci-config": {
    description:
      "Set up a CI pipeline configuration (GitHub Actions, GitLab CI, CircleCI, or similar)",
    reason:
      "CI pipelines give agents automated feedback on whether their changes pass all quality gates",
    effort: "medium",
    explore: [
      "What should be true of every change before it merges, and who or what checks that today?",
    ],
  },
  "ci-runs-tests": {
    description:
      "Ensure your CI pipeline runs the test suite on every push and pull request",
    reason:
      "Running tests in CI means agents get immediate feedback if their changes break existing functionality",
    effort: "medium",
    explore: [
      "Do the tests that pass locally also run on every pull request, in the same way?",
    ],
  },
  "ci-runs-linters": {
    description: "Add linting and formatting checks to your CI pipeline",
    reason:
      "CI lint checks catch style issues agents may miss locally, keeping the codebase consistent",
    effort: "medium",
    explore: [
      "Which checks pass locally but are skipped in CI, or the other way round?",
    ],
  },
  "build-automated": {
    description:
      "Add an automated build step to your CI pipeline or package.json scripts",
    reason:
      "An automated build step verifies that agents' changes compile and bundle correctly before merging",
    effort: "medium",
    explore: [
      "Could a change pass tests but still fail to build or bundle? Where would that show up?",
    ],
  },
  "deploy-pipeline": {
    description:
      "Configure a deploy pipeline or stage in your CI/CD system for automated deployments",
    reason:
      "Automated deployments let agents' changes reach production safely through a controlled pipeline",
    effort: "high",
    explore: [
      "How does a merged change reach users today, and which steps are manual?",
      "Where should a human stay in the loop?",
    ],
  },
  "branch-protection": {
    description:
      "Document or configure branch protection rules requiring reviews and passing checks before merging",
    reason:
      "Branch protection ensures agents' PRs go through proper review and validation before reaching main",
    effort: "medium",
    explore: [
      "Can anything (or any agent) push straight to the main branch today?",
      "Which checks must pass before a merge, and are they enforced or just expected?",
    ],
  },

  // Code Health
  "no-outdated-deps": {
    description:
      "Update critically outdated dependencies to their latest stable versions",
    reason:
      "Current dependencies reduce compatibility issues agents encounter and ensure security patches are applied",
    effort: "medium",
    explore: [
      "Which dependencies are far enough behind that their docs no longer match how this repo uses them?",
      "Who notices when an update is overdue?",
    ],
  },
  "dead-code-detection": {
    description:
      "Configure dead code detection using Knip, ts-unused-exports, vulture, or a similar tool",
    reason:
      "Dead code detection helps agents avoid modifying unused code and keeps the codebase lean",
    effort: "medium",
    explore: [
      "How much code here is no longer called, and would an agent know not to extend it?",
    ],
  },
  "bundle-analysis": {
    description:
      "Set up bundle analysis with webpack-bundle-analyzer, @next/bundle-analyzer, or a similar tool",
    reason:
      "Bundle analysis helps agents understand the impact of adding dependencies on application size",
    effort: "high",
    explore: [
      "Does bundle size matter for this project's users? Who would notice a dependency that doubles it?",
    ],
  },

  // Security
  license: {
    description:
      "Add a LICENSE file specifying the project's open-source or proprietary license",
    reason:
      "A clear license file helps agents understand what code and dependencies they can use",
    effort: "low",
    explore: [
      "Under what terms can this code, and code an agent pulls in, be used and shared?",
    ],
  },
  "security-scanning": {
    description:
      "Configure security scanning with CodeQL, Snyk, Trivy, or Semgrep in your CI pipeline",
    reason:
      "Security scanning catches vulnerabilities agents might introduce before they reach production",
    effort: "high",
    explore: [
      "Which kinds of vulnerability matter most here (dependencies, injection, infrastructure misconfiguration), and what scans for them today?",
    ],
  },
  "secrets-detection": {
    description:
      "Set up secrets detection using Gitleaks, detect-secrets, or GitGuardian",
    reason:
      "Secrets detection prevents agents from accidentally committing API keys, tokens, or credentials",
    effort: "medium",
    explore: [
      "Which secrets could plausibly end up in a commit here (API keys, .env files, cloud credentials, test fixtures)?",
    ],
  },
  "security-policy": {
    description:
      "Create a SECURITY.md file describing how to report vulnerabilities",
    reason:
      "A security policy gives agents guidance on handling security-sensitive changes appropriately",
    effort: "low",
    explore: [
      "If someone finds a vulnerability, how should they report it, and who responds?",
    ],
  },
  "dep-update-automation": {
    description:
      "Configure automated dependency updates with Dependabot or Renovate",
    reason:
      "Automated dependency updates keep the project current so agents work with well-maintained libraries",
    effort: "medium",
    explore: [
      "How are dependency updates handled today, and who notices when one is overdue?",
    ],
  },

  // Architecture & Methodology
  "methodology-documented": {
    description:
      "Declare how code is organised (layered, hexagonal, DDD, feature-sliced, LoB, …) in ARCHITECTURE.md, docs/agent-readiness.md, or docs/adr/",
    reason:
      "A declared methodology tells agents where new code belongs instead of letting each session invent a structure",
    effort: "low",
    explore: [
      "When a new feature lands, how does a contributor decide which folder and layer it belongs in? Is that written anywhere?",
      "Which structural mistakes do you correct most often in review?",
    ],
  },
  "boundary-enforcement": {
    description:
      "Enforce module boundaries mechanically: dependency-cruiser or eslint-plugin-boundaries (JS/TS), import-linter (Python), go-arch-lint/depguard (Go), ArchUnit (JVM)",
    reason:
      "Boundary linters turn the documented architecture into a failing check, so agent drift is caught automatically",
    effort: "medium",
    explore: [
      "Which imports would you reject in review (UI → DB, domain → framework, package A → package B internals)?",
      "Does your language already have a boundary tool your team uses, or could a few lint rules express the same rules?",
    ],
  },
  "agent-harness-rules": {
    description:
      "Give agents your project rules as an enforced rules file, judged on every edit rather than only read once",
    reason:
      "Agents get feedback on rule violations while they edit instead of only after CI fails or review catches it",
    effort: "low",
    explore: [
      "Which rules do you find yourself repeating to the agent, or fixing after it?",
      "Which of those can a linter express, and which need judgement (naming, error handling, where code belongs)? The judgement ones are what a rules file is for.",
      "Do some rules apply only to part of the tree (API handlers, migrations, generated code)?",
    ],
    harness: {
      pi: 'Install pi-warden (`pi install -l npm:pi-warden`), run `/warden init` to write pi-warden.md, and move AGENTS.md "never/don\'t" gotchas into `#` rules (optionally scoped with `paths:`). Rule judging needs a TypeSafe key (`/warden enable`); `/warden improve` tunes rules from session history',
      claude:
        "Reuse the same pi-warden.md for Claude Code edits: `pi-warden init claude --project` (writes .claude/settings.json hooks)",
    },
  },

  // Agent Context & Capabilities
  "ai-context-file": {
    description:
      "Add an agent context file (AGENTS.md is read by most harnesses) with commands, architecture, conventions, and gotchas",
    reason:
      "AI context files give agents tailored instructions about architecture decisions, patterns to follow, and pitfalls to avoid",
    effort: "low",
    explore: [
      "What do you re-explain to the agent at the start of most sessions?",
      "Which commands, conventions and gotchas would a new teammate need on day one?",
      "Which harnesses does your team actually use — can one shared file (AGENTS.md) serve all of them?",
    ],
    harness: {
      pi: "Add AGENTS.md at the repo root (pi loads AGENTS.md / CLAUDE.md from the working directory and its ancestors); add nested AGENTS.md per package in monorepos",
      claude:
        "Add CLAUDE.md, or a one-line CLAUDE.md that imports @AGENTS.md to share one source",
      codex: "Codex reads AGENTS.md natively",
      cursor: "Add .cursor/rules/*.mdc, or rely on AGENTS.md",
      gemini:
        "Add GEMINI.md, or point `context.fileName` at AGENTS.md in .gemini/settings.json",
    },
  },
  "mcp-servers": {
    description:
      "Declare the MCP servers the codebase needs (databases, APIs, observability, domain tools) in a committed config",
    reason:
      "Committed MCP config gives every agent session the same external context instead of each user wiring it up",
    effort: "medium",
    explore: [
      "Which systems does a typical change touch outside the repo (database, cloud, tickets, docs, observability, design files)?",
      "Where does the agent currently guess or ask you to paste context in?",
      "Does an official server already exist for those systems (search an MCP registry), and should it be read-only for agents?",
    ],
    harness: {
      pi: "Declare project servers under `mcpServers` in .pi/mcp.json and validate with `pi mcp list` (loads after project trust)",
      claude: "Add servers to .mcp.json at the repo root",
      codex: "Add `[mcp_servers.<name>]` tables to Codex's config.toml",
      cursor: "Add servers to .cursor/mcp.json",
      gemini: "Add an `mcpServers` block to .gemini/settings.json",
    },
  },
  "agent-skills": {
    description:
      "Commit codebase-specific agent capabilities (skills, prompt templates, extensions, packages) so recurring workflows are reusable",
    reason:
      "Repo-scoped skills and packages encode how THIS codebase is built, tested and released, so agents stop rediscovering it",
    effort: "medium",
    explore: [
      "Which multi-step tasks do you walk the agent through repeatedly (release, migration, adding an endpoint, regenerating clients)?",
      "Which tools, scripts or internal services does this repo need that the agent can't call yet?",
      "Has someone already packaged this? Search before you build; if nothing fits, a small project prompt, skill or extension is cheap to write.",
      "Would other repos on the same stack benefit? Then it's worth publishing as a shared package.",
    ],
    harness: {
      pi: "Share packages with `pi install -l npm:<pkg>` (written to .pi/settings.json); add prompt templates in .pi/prompts/*.md, skills in .agents/skills/<name>/SKILL.md, or a custom extension in .pi/extensions/. See Considerations for stack-specific package ideas",
      claude:
        "Add .claude/skills/<name>/SKILL.md, .claude/commands/*.md, or .claude/agents/*.md",
      codex: "Add Agent Skills under .agents/skills/<name>/SKILL.md",
      cursor: "Add .cursor/commands/*.md",
      gemini: "Add .gemini/commands/*.toml",
    },
  },
  "agent-guardrails": {
    description:
      "Commit repo-scoped guardrails (hooks / permission rules) that block or hold destructive and off-policy agent actions",
    reason:
      "Repo-scoped guardrails protect every agent session, not just machines that happen to have user-level guards installed",
    effort: "medium",
    explore: [
      "What is the worst thing an agent could run in this repo (publish, deploy, drop a database, force-push, delete files)?",
      "Which of those should be blocked outright, and which just need a human to confirm?",
      "Are any secrets, credentials or production configs reachable from the working tree?",
    ],
    harness: {
      pi: "`pi install -l npm:pi-warden` — its offline guards hold irreversible commands (no key needed); commit .pi/pi-warden.json for project settings, and add repo-specific bans to .pi/aio-blocklist.json or .pi/hook/hooks.yaml",
      claude:
        "Add `permissions.deny`/`ask` rules and PreToolUse hooks to .claude/settings.json",
      codex: "Add PreToolUse hooks to .codex/hooks.json",
      cursor: "Add beforeShellExecution hooks to .cursor/hooks.json",
      gemini: "Add BeforeTool hooks to .gemini/settings.json",
    },
  },
  "agent-edit-feedback": {
    description:
      "Feed lint, type and structural diagnostics back to the agent right after each edit, not only in CI",
    reason:
      "Per-edit diagnostics let agents fix mistakes in the same turn instead of compounding them until CI fails",
    effort: "low",
    explore: [
      "How long after an agent writes a bug do you find out — the same turn, at CI, or in review?",
      "Which linters, type checkers or LSPs does this stack already have that could run on every edit?",
      "Which codebase-specific patterns (banned APIs, required wrappers, naming) could become a structural rule?",
    ],
    harness: {
      pi: "`pi install -l npm:pi-lens` (LSP, linters, ast-grep and tree-sitter diagnostics after every write); commit a .pi-lens.json for project toggles and codebase rules under rules/ast-grep-rules/rules/ (the pi-lens-write-ast-grep-rule skill scaffolds them)",
      claude:
        "Add a PostToolUse hook (matcher Edit|Write) to .claude/settings.json that runs lint/typecheck on the changed file",
      codex:
        "Add a PostToolUse hook to .codex/hooks.json running lint/typecheck",
      cursor: "Add an afterFileEdit hook to .cursor/hooks.json",
      gemini: "Add an AfterTool hook to .gemini/settings.json",
    },
  },

  // LLM-powered criteria (other pillars)
  "inline-docs-quality": {
    description:
      "Add meaningful inline documentation and comments to key modules and public APIs",
    reason:
      "Inline docs help agents understand intent and edge cases when modifying complex logic",
    effort: "high",
  },
  "code-structure": {
    description:
      "Organize code into a consistent folder structure with clear naming conventions",
    reason:
      "Consistent structure lets agents predict where to find and place code without trial and error",
    effort: "high",
  },
  "file-size": {
    description:
      "Break down large files and functions into smaller, focused modules",
    reason:
      "Smaller files are easier for agents to understand, modify, and test without unintended side effects",
    effort: "high",
  },
};

/** Advice for the targeted harnesses, in harness order (pi first). */
export function harnessAdviceFor(
  harnessMap: CriterionInfo["harness"],
  harnesses: HarnessId[],
): HarnessAdvice[] | undefined {
  if (!harnessMap) return undefined;
  const advice = harnesses
    .filter((h) => harnessMap[h])
    .map((h) => ({ harness: h, advice: harnessMap[h] as string }));
  return advice.length > 0 ? advice : undefined;
}

// ---------------------------------------------------------------------------
// Impact helpers
// ---------------------------------------------------------------------------

const IMPACT_ORDER: Record<Recommendation["impact"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const EFFORT_ORDER: Record<Recommendation["effort"], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function determineImpact(
  criterionLevel: MaturityLevel,
  currentLevel: MaturityLevel,
): Recommendation["impact"] {
  const nextLevel = currentLevel + 1;
  if (criterionLevel === nextLevel) return "high";
  if (criterionLevel === currentLevel + 2) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * One recommendation per failed (non-skipped) criterion, sorted next-level
 * first, then impact, then cheapest effort. Returns ALL of them so the
 * checklist can attach a fix to every failing item; headline views take the
 * first TOP_RECOMMENDATIONS.
 */
export function generateRecommendations(
  pillars: Pillar[],
  results: Map<string, CriterionResult[]>,
  _pillarScores: PillarScore[],
  levelResult: LevelResult,
  harnesses: HarnessId[] = ["pi"],
): Recommendation[] {
  const currentLevel = levelResult.level;
  const nextLevel = currentLevel + 1;

  const items: { rec: Recommendation; level: MaturityLevel }[] = [];

  for (const pillar of pillars) {
    const pillarResults = results.get(pillar.id) ?? [];

    for (const criterion of pillar.criteria) {
      const result = pillarResults.find((r) => r.criterionId === criterion.id);

      // Only consider criteria that explicitly failed (not skipped)
      if (!result || result.pass || result.skipped) continue;

      const info = CRITERION_INFO[criterion.id];
      items.push({
        level: criterion.level,
        rec: {
          title: criterion.name,
          description:
            info?.description ??
            `Address the failing "${criterion.id}" criterion to improve agent readiness`,
          reason:
            info?.reason ??
            "Meeting this criterion improves the codebase's readiness for autonomous AI agents",
          harnessAdvice: harnessAdviceFor(info?.harness, harnesses),
          explore: info?.explore,
          effort: info?.effort ?? "medium",
          impact: determineImpact(criterion.level, currentLevel),
          pillarId: pillar.id,
          criterionId: criterion.id,
        },
      });
    }
  }

  items.sort((a, b) => {
    // Criteria at the next reachable level come first
    const aIsNext = a.level === nextLevel ? 0 : 1;
    const bIsNext = b.level === nextLevel ? 0 : 1;
    if (aIsNext !== bIsNext) return aIsNext - bIsNext;

    const impactDiff = IMPACT_ORDER[a.rec.impact] - IMPACT_ORDER[b.rec.impact];
    if (impactDiff !== 0) return impactDiff;

    return EFFORT_ORDER[a.rec.effort] - EFFORT_ORDER[b.rec.effort];
  });

  return items.map((i) => i.rec);
}
