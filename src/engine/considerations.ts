import path from "node:path";
import {
  fileExists,
  findRepoFiles,
  piPackageMatches,
  piPackageSources,
  readFileContent,
} from "../pillars/utils.js";
import type { Consideration, HarnessId, ProjectInfo } from "../types/index.js";
import { harnessAdviceFor, type CriterionInfo } from "./recommender.js";

/**
 * Considerations are unscored, signal-driven suggestions: "this repo has X, so a
 * pi package / pi-lens rule / pi-warden rule for X would help". They never move
 * the level or pillar scores, because not having a custom package isn't a defect.
 *
 * Each detector looks for concrete evidence in the scanned repo and quotes it in
 * `signal`, so the suggestion is explainable. pi advice leads; other harnesses get
 * their equivalent when they're targeted.
 */

interface TaskCommand {
  source: string;
  name: string;
  body: string;
}

interface Context {
  repoPath: string;
  projectInfo: ProjectInfo;
  tasks: TaskCommand[];
  piPackages: string[];
  contextFile: { path: string; content: string } | null;
}

type Detector = (ctx: Context) => Promise<Consideration | null>;

const has = (ctx: Context, ...ids: HarnessId[]) =>
  ids.some((id) => ctx.projectInfo.harnesses.includes(id));

function make(
  ctx: Context,
  base: Omit<Consideration, "harnessAdvice">,
  harness: CriterionInfo["harness"],
): Consideration {
  return {
    ...base,
    harnessAdvice: harnessAdviceFor(harness, ctx.projectInfo.harnesses),
  };
}

const ADOPT_BEFORE_BUILD =
  "Has someone already packaged this for your stack? Search before you build.";

function preview(names: string[], max = 6): string {
  const shown = names.slice(0, max).join(", ");
  return names.length > max ? `${shown}, +${names.length - max} more` : shown;
}

// ---------------------------------------------------------------------------
// Task command discovery (package.json scripts, Makefile, mise, just)
// ---------------------------------------------------------------------------

export async function collectTaskCommands(
  repoPath: string,
): Promise<TaskCommand[]> {
  const tasks: TaskCommand[] = [];

  const pkg = await readFileContent(repoPath, "package.json");
  if (pkg) {
    try {
      const scripts = (JSON.parse(pkg) as { scripts?: Record<string, string> })
        .scripts;
      for (const [name, body] of Object.entries(scripts ?? {})) {
        tasks.push({ source: "package.json", name, body: String(body) });
      }
    } catch {
      // malformed package.json — other pillars report it
    }
  }

  const makefile = await readFileContent(repoPath, "Makefile");
  if (makefile) {
    const lines = makefile.split("\n");
    lines.forEach((line, i) => {
      const m = /^([A-Za-z0-9][A-Za-z0-9_.-]*)\s*:(?!=)/.exec(line);
      if (!m || m[1].startsWith(".")) return;
      const body: string[] = [];
      for (let j = i + 1; j < lines.length && lines[j].startsWith("\t"); j++) {
        body.push(lines[j].trim());
      }
      tasks.push({ source: "Makefile", name: m[1], body: body.join("; ") });
    });
  }

  for (const file of ["mise.toml", ".mise.toml"]) {
    const mise = await readFileContent(repoPath, file);
    if (!mise) continue;
    // [tasks.name] tables with a run = "..." / run = [...] body.
    const re = /^\[tasks\.("?)([^\]"]+)\1\]\s*$([\s\S]*?)(?=^\[|$(?![\s\S]))/gm;
    for (const m of mise.matchAll(re)) {
      const run = /^\s*run\s*=\s*([\s\S]*?)(?=^\s*\w+\s*=|$(?![\s\S]))/m.exec(
        m[3],
      );
      tasks.push({ source: file, name: m[2], body: run?.[1]?.trim() ?? "" });
    }
  }

  const justfile =
    (await readFileContent(repoPath, "justfile")) ??
    (await readFileContent(repoPath, "Justfile"));
  if (justfile) {
    const lines = justfile.split("\n");
    lines.forEach((line, i) => {
      const m = /^@?([A-Za-z0-9_-]+)(?:\s[^:=]*)?:(?!=)/.exec(line);
      if (!m) return;
      const body: string[] = [];
      for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) {
        body.push(lines[j].trim());
      }
      tasks.push({ source: "justfile", name: m[1], body: body.join("; ") });
    });
  }

  return tasks;
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

const DESTRUCTIVE_NAME =
  /^(publish|deploy|release|destroy|teardown|nuke)([:_-]|$)/i;
const DESTRUCTIVE_BODY: RegExp[] = [
  /\b(npm|pnpm|yarn|bun)\s+publish\b/,
  /\b(changeset|semantic-release)\s+publish\b/,
  /\bterraform\s+(apply|destroy)\b/,
  /\bkubectl\s+(apply|delete)\b/,
  /\bhelm\s+(upgrade|install|uninstall)\b/,
  /\brm\s+-[a-z]*r[a-z]*f\b|\brm\s+-[a-z]*f[a-z]*r\b/,
  /\bgit\s+push\b[^;&|]*\s(-f|--force)\b/,
  /\bprisma\s+migrate\s+reset\b|\bdropdb\b|\bdrop\s+database\b|\bdb:(reset|drop)\b/i,
];

/** Repo tasks that publish, deploy or destroy — candidates for holds/bans. */
const guardDestructiveTasks: Detector = async (ctx) => {
  const hits = ctx.tasks.filter(
    (t) =>
      DESTRUCTIVE_NAME.test(t.name) ||
      DESTRUCTIVE_BODY.some((re) => re.test(t.body)),
  );
  if (hits.length === 0) return null;
  const names = hits.map((t) => `${t.name} (${t.source})`);
  return make(
    ctx,
    {
      id: "guard-destructive-tasks",
      title: "Hold publish / deploy / destructive tasks",
      signal: `Irreversible tasks: ${preview(names)}`,
      description:
        "These tasks publish, deploy or delete. An agent running them by mistake can't be undone, so they should need a human yes.",
      explore: [
        "Which of these should never run without a human, and which are fine to run against a local or staging target?",
        "Are there other dangerous commands in this repo that aren't wrapped in a task (raw cloud CLIs, database clients)?",
      ],
    },
    {
      pi: "pi-warden holds irreversible commands out of the box (`pi install -l npm:pi-warden`); add repo-specific patterns for these tasks to .pi/aio-blocklist.json or .pi/hook/hooks.yaml, and state the policy in pi-warden.md",
      claude:
        "Add `permissions.ask` entries for these commands (e.g. `Bash(pnpm publish:*)`) in .claude/settings.json",
      codex: "Gate them with a PreToolUse hook in .codex/hooks.json",
      cursor:
        "Gate them with a beforeShellExecution hook in .cursor/hooks.json",
      gemini: "Gate them with a BeforeTool hook in .gemini/settings.json",
    },
  );
};

/** Many task commands and no repo-scoped prompts/skills → a custom package. */
const customWorkflowPackage: Detector = async (ctx) => {
  if (ctx.tasks.length < 6) return null;
  const existing = await fileExists(
    ctx.repoPath,
    ".pi/prompts/*.md",
    ".pi/skills/**",
    ".pi/extensions/**",
    ".agents/skills/**",
    ".claude/skills/**",
    ".claude/commands/**",
  );
  if (existing) return null;
  const sources = [...new Set(ctx.tasks.map((t) => t.source))].join(", ");
  return make(
    ctx,
    {
      id: "custom-workflow-package",
      title: "Package this repo's workflows for agents",
      signal: `${ctx.tasks.length} task commands across ${sources}: ${preview(ctx.tasks.map((t) => t.name))}`,
      description:
        "Agents re-derive which command to run, in what order, every session. Encode the recurring multi-step workflows (release, regenerate, verify) once as reusable agent capabilities.",
      explore: [
        "Which of these tasks do you (or the agent) run in a fixed sequence?",
        "Which ones does the agent get wrong, skip, or ask you about?",
        "Is the knowledge 'when to run what' (a skill or prompt), or a capability the agent lacks entirely (an extension or tool)?",
        ADOPT_BEFORE_BUILD,
      ],
    },
    {
      pi: "Build a project pi package: one .pi/prompts/<workflow>.md per multi-step flow, an .agents/skills/<repo>/SKILL.md saying when to run what, and a .pi/extensions/ tool for long or stateful tasks. If several repos share the stack, publish it (npm or git) and `pi install -l` it everywhere",
      claude: "Add one .claude/commands/<workflow>.md per multi-step flow",
      codex: "Add an Agent Skill under .agents/skills/<repo>/SKILL.md",
      cursor: "Add one .cursor/commands/<workflow>.md per multi-step flow",
      gemini: "Add .gemini/commands/<workflow>.toml per multi-step flow",
    },
  );
};

/** Terraform → plan/validate skill + apply/destroy guard. */
const terraformWorkflow: Detector = async (ctx) => {
  const tf = await findRepoFiles(ctx.repoPath, "**/*.tf");
  if (tf.length === 0) return null;
  return make(
    ctx,
    {
      id: "terraform-workflow",
      title: "Terraform workflow skill + apply guard",
      signal: `${tf.length} Terraform file(s), e.g. ${tf[0]}`,
      description:
        "Teach agents the safe loop (fmt → validate → plan, read the plan) and keep apply/destroy behind a human.",
      explore: [
        "Which environments can an agent safely plan against, and who approves applies today?",
        ADOPT_BEFORE_BUILD,
      ],
    },
    {
      pi: "Add an .agents/skills/terraform/SKILL.md (or a pi package extension) that runs `terraform fmt -check`, `validate` and `plan` and summarises the plan; hold `terraform apply|destroy` with pi-warden or .pi/aio-blocklist.json",
      claude:
        "Add a .claude/skills/terraform skill and `permissions.deny` for `Bash(terraform apply:*)` / `Bash(terraform destroy:*)`",
    },
  );
};

/** Helm charts → pi-lens can render-validate them (opt-in). */
const helmRenderValidation: Detector = async (ctx) => {
  if (!has(ctx, "pi")) return null;
  const charts = await findRepoFiles(ctx.repoPath, "**/Chart.yaml");
  if (charts.length === 0) return null;
  const lensConfigs = await findRepoFiles(ctx.repoPath, "**/.pi-lens.json");
  for (const f of lensConfigs) {
    const c = await readFileContent(ctx.repoPath, f);
    if (c && /renderValidation/.test(c)) return null;
  }
  return make(
    ctx,
    {
      id: "pi-lens-helm-render",
      title: "Let pi-lens render-validate Helm charts",
      signal: `${charts.length} Helm chart(s), e.g. ${charts[0]}`,
      description:
        "Template errors in Helm charts only surface at render time. pi-lens can render charts after edits, but rendering executes chart templates, so it is opt-in per chart.",
      explore: [
        "Do you trust these charts' templates enough to render them automatically?",
      ],
    },
    {
      pi: 'Set `"helm": { "renderValidation": { "enabled": true } }` in a .pi-lens.json at the chart\'s project root (also requires the host to trust the project)',
    },
  );
};

/** Database migrations → migration skill, schema MCP, reset guard. */
const databaseWorkflow: Detector = async (ctx) => {
  const found = await fileExists(
    ctx.repoPath,
    "prisma/schema.prisma",
    "**/schema.prisma",
    "alembic.ini",
    "drizzle.config.*",
    "knexfile.*",
    "sqlc.y*ml",
    "db/migrate/*",
    "**/migrations/*.{sql,py,ts,js}",
  );
  if (!found) return null;
  return make(
    ctx,
    {
      id: "database-workflow",
      title: "Database migration skill + schema context",
      signal: `Migrations/ORM config: ${found}`,
      description:
        "Agents writing migrations need the house rules (naming, reversibility, how to generate and apply) and live schema context, and must never reset a shared database.",
      explore: [
        "Which database can an agent safely read for schema context (local, a dev replica), and which must it never touch?",
        "What does a good migration look like here (naming, reversibility, data backfills)?",
        ADOPT_BEFORE_BUILD,
      ],
    },
    {
      pi: "Add an .agents/skills/migrations/SKILL.md covering create/apply/rollback for this repo, a read-only database MCP server in .pi/mcp.json for schema context, and hold reset/drop commands with pi-warden",
      claude:
        "Add a .claude/skills/migrations skill, a read-only DB server in .mcp.json, and `permissions.deny` for reset/drop commands",
    },
  );
};

/** API contracts → regenerate-clients workflow + don't hand-edit generated code. */
const apiContractCodegen: Detector = async (ctx) => {
  const found = await fileExists(
    ctx.repoPath,
    "buf.yaml",
    "buf.gen.yaml",
    "**/openapi.{yml,yaml,json}",
    "**/swagger.{yml,yaml,json}",
    "**/*.proto",
    "**/schema.graphql",
  );
  if (!found) return null;
  return make(
    ctx,
    {
      id: "api-contract-codegen",
      title: "Contract-first codegen workflow",
      signal: `API contract: ${found}`,
      description:
        "When the spec is the source of truth, agents should edit the spec and regenerate rather than patch generated clients by hand.",
      explore: [
        "Is the spec or the code the source of truth here, and does the agent know which?",
        ADOPT_BEFORE_BUILD,
      ],
    },
    {
      pi: 'Add a .pi/prompts/regen.md template (edit spec → regenerate → typecheck), and a pi-warden.md rule scoped with `paths:` to generated code: "Generated files are never edited by hand"',
      claude:
        "Add a .claude/commands/regen.md and deny Edit on generated paths in .claude/settings.json",
    },
  );
};

/** Committed generated code not marked as generated. */
const markGeneratedCode: Detector = async (ctx) => {
  const generated = await findRepoFiles(ctx.repoPath, [
    "**/*.gen.{ts,js,go,py}",
    "**/*_pb2.py",
    "**/*.pb.go",
    "**/__generated__/**",
    "**/generated/**",
  ]);
  if (generated.length === 0) return null;
  const attrs = await readFileContent(ctx.repoPath, ".gitattributes");
  if (attrs && /linguist-generated/.test(attrs)) return null;
  return make(
    ctx,
    {
      id: "mark-generated-code",
      title: "Mark generated code so agents leave it alone",
      signal: `${generated.length} generated file(s), e.g. ${generated[0]}, and no linguist-generated in .gitattributes`,
      description:
        'Unmarked generated files look like hand-written source; agents will "fix" them and the change is lost on the next regen. Mark them with `linguist-generated` in .gitattributes.',
      explore: [
        "Which of these files are regenerated, and from what source? Is the regen command documented?",
      ],
    },
    {
      pi: "Also add a pi-warden.md rule (`paths:` the generated globs) or a pi-lens ast-grep rule that flags edits there",
      claude:
        "Also deny Edit/Write on the generated globs in .claude/settings.json",
    },
  );
};

/** AGENTS.md "never/don't" lines are advisory; pi-warden makes them enforced. */
const promoteGotchasToRules: Detector = async (ctx) => {
  if (!has(ctx, "pi", "claude") || !ctx.contextFile) return null;
  if (await fileExists(ctx.repoPath, "pi-warden.md")) return null;
  const rules = ctx.contextFile.content
    .split("\n")
    .filter((l) => /\b(never|don['’]t|do not|must not|must never)\b/i.test(l));
  if (rules.length < 3) return null;
  return make(
    ctx,
    {
      id: "promote-gotchas-to-rules",
      title: "Turn context-file prohibitions into enforced rules",
      signal: `${rules.length} "never/don't" line(s) in ${ctx.contextFile.path}`,
      description:
        "Prohibitions in a context file are read once and easily lost in a long session. As enforced rules, each write is checked against them and the broken rule is quoted back to the agent.",
      explore: [
        "Which of these prohibitions has an agent actually broken? Start with those.",
        "Can any be expressed as a lint rule instead (cheaper and deterministic)? Keep the judgement-call ones as rules-file entries.",
      ],
    },
    {
      pi: "`pi install -l npm:pi-warden`, `/warden init`, then move each prohibition into pi-warden.md as a `#` rule (scope with `paths:` where it applies to part of the tree)",
      claude:
        "The same pi-warden.md also covers Claude Code edits via `pi-warden init claude --project`",
    },
  );
};

/** pi-lens is on but only runs generic rules → write codebase rules. */
const piLensProjectRules: Detector = async (ctx) => {
  if (!has(ctx, "pi")) return null;
  const lensOn =
    ctx.piPackages.some((p) => piPackageMatches(p, "pi-lens")) ||
    (await fileExists(ctx.repoPath, ".pi-lens.json")) !== null;
  if (!lensOn) return null;
  const rules = await fileExists(
    ctx.repoPath,
    "rules/ast-grep-rules/rules/**/*.{yml,yaml}",
    "rules/tree-sitter-queries/**/*.{yml,yaml}",
  );
  if (rules) return null;
  return make(
    ctx,
    {
      id: "pi-lens-project-rules",
      title: "Give pi-lens codebase-specific rules",
      signal:
        "pi-lens is enabled but the repo has no project ast-grep / tree-sitter rules",
      description:
        "pi-lens runs its built-in rules only. Project rules merge with them, so recurring review comments and AGENTS.md conventions become per-edit diagnostics.",
      explore: [
        "Which review comments recur on agent-written code?",
        "Which internal APIs are banned, deprecated, or must be wrapped?",
      ],
    },
    {
      pi: "Add rules under rules/ast-grep-rules/rules/<lang>/<id>.yml with fixtures in rules/ast-grep-rules/rule-tests/ (the pi-lens-write-ast-grep-rule skill scaffolds them), or tree-sitter queries under rules/tree-sitter-queries/<lang>/",
    },
  );
};

/** Monorepo packages without their own context file. */
const nestedContextFiles: Detector = async (ctx) => {
  const { isMonorepo, packages } = ctx.projectInfo;
  if (!isMonorepo || packages.length < 2) return null;
  const missing: string[] = [];
  for (const pkg of packages) {
    const found = await fileExists(
      path.join(ctx.repoPath, pkg),
      "AGENTS.md",
      "CLAUDE.md",
    );
    if (!found) missing.push(pkg);
  }
  if (missing.length === 0) return null;
  return make(
    ctx,
    {
      id: "nested-context-files",
      title: "Per-package context files",
      signal: `${missing.length}/${packages.length} workspace packages have no AGENTS.md: ${preview(missing)}`,
      description:
        "One root context file can't carry every package's commands and conventions. A short AGENTS.md per package gives agents local rules where they work.",
      explore: [
        "Which packages have their own commands, conventions or gotchas that the root file doesn't cover?",
      ],
    },
    {
      pi: "pi loads AGENTS.md from the working directory and every ancestor, so a package-level AGENTS.md adds to the root one",
      claude:
        "Claude Code loads nested CLAUDE.md files when it works in that directory",
    },
  );
};

const CONTEXT_FILE_BUDGET = 32 * 1024;

/** Oversized context file → move procedures into on-demand skills. */
const contextFileSize: Detector = async (ctx) => {
  if (!ctx.contextFile) return null;
  const bytes = Buffer.byteLength(ctx.contextFile.content);
  if (bytes <= CONTEXT_FILE_BUDGET) return null;
  return make(
    ctx,
    {
      id: "context-file-size",
      title: "Trim the always-loaded context file",
      signal: `${ctx.contextFile.path} is ${Math.round(bytes / 1024)} KB (budget ${CONTEXT_FILE_BUDGET / 1024} KB)`,
      description:
        "Everything in the context file costs tokens on every turn and dilutes the rules that matter. Keep it to commands, architecture and gotchas; move long procedures elsewhere.",
      explore: [
        "Which sections are needed every session, and which only for specific tasks?",
      ],
    },
    {
      pi: "Move procedures into skills (.agents/skills/<name>/SKILL.md), which pi loads only when relevant",
      claude: "Move procedures into .claude/skills, which load on demand",
    },
  );
};

const DETECTORS: Detector[] = [
  guardDestructiveTasks,
  promoteGotchasToRules,
  piLensProjectRules,
  customWorkflowPackage,
  databaseWorkflow,
  terraformWorkflow,
  helmRenderValidation,
  apiContractCodegen,
  markGeneratedCode,
  nestedContextFiles,
  contextFileSize,
];

export async function generateConsiderations(
  repoPath: string,
  projectInfo: ProjectInfo,
): Promise<Consideration[]> {
  const contextPath = await fileExists(repoPath, "AGENTS.md", "CLAUDE.md");
  const contextContent = contextPath
    ? await readFileContent(repoPath, contextPath)
    : null;

  const ctx: Context = {
    repoPath,
    projectInfo,
    tasks: await collectTaskCommands(repoPath),
    piPackages: piPackageSources(
      await readFileContent(repoPath, ".pi/settings.json"),
    ),
    contextFile:
      contextPath && contextContent !== null
        ? { path: contextPath, content: contextContent }
        : null,
  };

  const results = await Promise.all(DETECTORS.map((d) => d(ctx)));
  return results.filter((c): c is Consideration => c !== null);
}
