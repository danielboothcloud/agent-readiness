import type { Pillar } from "../types/index.js";
import { fileExists, readFileContent } from "./utils.js";

// Architecture & Methodology — methodology-agnostic. Checks that the project has
// DECLARED a methodology and ENFORCES it (boundaries + agent-harness rules), without
// caring which methodology it is (LoB, layered, hexagonal, DDD, feature-sliced, …).
const architecture: Pillar = {
  id: "architecture",
  name: "Architecture & Methodology",
  description:
    "Verifies the project declares a code-organisation methodology and enforces it mechanically, so agents follow a consistent structure.",
  icon: "🏛️",
  criteria: [
    {
      id: "methodology-documented",
      name: "Methodology documented",
      description:
        "The repo declares how code is organised (LoB, layered, hexagonal, DDD, feature-sliced, …) in a discoverable doc.",
      pillarId: "architecture",
      level: 2,
      requiresLLM: false,
      check: async (repoPath) => {
        const found = await fileExists(
          repoPath,
          "docs/agent-readiness.md",
          "ARCHITECTURE.md",
          "docs/ARCHITECTURE.md",
          "docs/architecture/**",
          "docs/adr/**",
          "docs/decisions/**",
        );
        if (found) {
          return {
            criterionId: "methodology-documented",
            pass: true,
            message: `Methodology/architecture documented: ${found}`,
          };
        }
        return {
          criterionId: "methodology-documented",
          pass: false,
          message: "No methodology/architecture doc found.",
          details:
            "Declare the repo's methodology (LoB, layered, hexagonal, DDD, feature-sliced, …) in docs/agent-readiness.md, ARCHITECTURE.md, or docs/adr so agents follow a consistent structure.",
        };
      },
    },
    {
      id: "boundary-enforcement",
      name: "Architecture boundaries enforced",
      description:
        "A tool mechanically enforces module/dependency boundaries (import-linter, dependency-cruiser, eslint-plugin-boundaries, go-arch-lint, depguard, ArchUnit, tflint).",
      pillarId: "architecture",
      level: 3,
      requiresLLM: false,
      check: async (repoPath) => {
        // Dedicated boundary/architecture linters by config file.
        const found = await fileExists(
          repoPath,
          ".importlinter",
          ".dependency-cruiser.js",
          ".dependency-cruiser.json",
          ".dependency-cruiser.cjs",
          ".dependency-cruiser.mjs",
          ".go-arch-lint.yml",
          ".go-arch-lint.yaml",
          ".tflint.hcl",
        );
        if (found) {
          return {
            criterionId: "boundary-enforcement",
            pass: true,
            message: `Boundary enforcement configured: ${found}`,
          };
        }

        // import-linter declared inline in Python config.
        const pyproject = await readFileContent(repoPath, "pyproject.toml");
        if (pyproject && pyproject.includes("importlinter")) {
          return { criterionId: "boundary-enforcement", pass: true, message: "import-linter configured in pyproject.toml" };
        }
        const setupCfg = await readFileContent(repoPath, "setup.cfg");
        if (setupCfg && setupCfg.includes("importlinter")) {
          return { criterionId: "boundary-enforcement", pass: true, message: "import-linter configured in setup.cfg" };
        }

        // depguard boundary rules inside golangci-lint config.
        for (const f of [".golangci.yml", ".golangci.yaml"]) {
          const c = await readFileContent(repoPath, f);
          if (c && c.includes("depguard")) {
            return { criterionId: "boundary-enforcement", pass: true, message: `depguard boundary rules configured in ${f}` };
          }
        }

        // eslint import-boundary rules.
        const eslint = await fileExists(repoPath, ".eslintrc", ".eslintrc.*", "eslint.config.*");
        if (eslint) {
          const c = await readFileContent(repoPath, eslint);
          if (c && (c.includes("boundaries") || c.includes("no-restricted-paths") || c.includes("import/no-restricted-paths"))) {
            return { criterionId: "boundary-enforcement", pass: true, message: `Import boundary rules configured in ${eslint}` };
          }
        }

        // ArchUnit (JVM) in build files.
        for (const f of ["build.gradle.kts", "build.gradle", "pom.xml"]) {
          const c = await readFileContent(repoPath, f);
          if (c && c.toLowerCase().includes("archunit")) {
            return { criterionId: "boundary-enforcement", pass: true, message: `ArchUnit configured in ${f}` };
          }
        }

        return {
          criterionId: "boundary-enforcement",
          pass: false,
          message: "No architecture/boundary enforcement found.",
          details:
            "Enforce your methodology's boundaries mechanically: import-linter (Python), dependency-cruiser or eslint-plugin-boundaries (JS/TS), go-arch-lint or golangci depguard (Go), ArchUnit (JVM), tflint (Terraform), or the language's native module system (e.g. Go internal/).",
        };
      },
    },
    {
      id: "agent-harness-rules",
      name: "Agent harness enforcement rules",
      description:
        "Coding agents get the same structure rules the CI enforces, via a harness rules file (.pi/readiness.rules.json or equivalent).",
      pillarId: "architecture",
      level: 3,
      requiresLLM: false,
      check: async (repoPath) => {
        const found = await fileExists(
          repoPath,
          ".pi/readiness.rules.json",
          ".pi/extensions/*.ts",
        );
        if (found) {
          return {
            criterionId: "agent-harness-rules",
            pass: true,
            message: `Agent harness enforcement found: ${found}`,
          };
        }
        return {
          criterionId: "agent-harness-rules",
          pass: false,
          message: "No agent harness enforcement rules found.",
          details:
            "Add .pi/readiness.rules.json (or your harness's equivalent) so coding agents get the same block-paths and feedback loop that CI enforces.",
        };
      },
    },
  ],
};

export default architecture;
