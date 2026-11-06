export type MaturityLevel = 1 | 2 | 3 | 4 | 5;

export const LEVEL_LABELS: Record<MaturityLevel, string> = {
  1: "Foundational",
  2: "Guided",
  3: "Structured",
  4: "Optimized",
  5: "Autonomous",
};

export const LEVEL_THRESHOLD = 0.8;

/** Coding-agent harnesses the repo can target. pi is the primary/default. */
export type HarnessId = "pi" | "claude" | "codex" | "cursor" | "gemini";

export const HARNESS_IDS: HarnessId[] = [
  "pi",
  "claude",
  "codex",
  "cursor",
  "gemini",
];

export const HARNESS_LABELS: Record<HarnessId, string> = {
  pi: "pi",
  claude: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  gemini: "Gemini CLI",
};

/** How the harness list was decided: `.agent-profile.yml`, repo files, or fallback. */
export type HarnessSource = "config" | "detected" | "default";

export interface ProjectInfo {
  detectedTypes: string[];
  isMonorepo: boolean;
  packages: string[];
  workspaces: ProjectWorkspaceInfo[];
  knowledge: string[];
  /** Harnesses advice is tailored to (scoring stays harness-agnostic). */
  harnesses: HarnessId[];
  harnessSource: HarnessSource;
}

export interface ProjectWorkspaceInfo {
  name: string;
  path: string;
  description?: string;
  detectedTypes: string[];
  knowledge: string[];
}

export interface CriterionResult {
  criterionId: string;
  pass: boolean;
  message: string;
  details?: string;
  skipped?: boolean;
}

export type CriterionCheckFn = (
  repoPath: string,
  projectInfo: ProjectInfo,
  llmClient?: LLMClient,
) => Promise<CriterionResult>;

export interface Criterion {
  id: string;
  name: string;
  description: string;
  pillarId: string;
  level: MaturityLevel;
  requiresLLM: boolean;
  check: CriterionCheckFn;
}

export interface Pillar {
  id: string;
  name: string;
  description: string;
  icon: string;
  criteria: Criterion[];
}

export interface PillarScore {
  pillarId: string;
  passed: number;
  total: number;
  percentage: number;
}

export interface LevelResult {
  level: MaturityLevel;
  nextLevelProgress: {
    current: number;
    needed: number;
    remaining: number;
    nextLevel: MaturityLevel | null;
  };
}

export interface HarnessAdvice {
  harness: HarnessId;
  advice: string;
}

export interface Recommendation {
  title: string;
  description: string;
  reason: string;
  /** Example starting points per targeted harness (pi first) — not the only answer. */
  harnessAdvice?: HarnessAdvice[];
  /** Questions that lead the user to the option that fits their repo. */
  explore?: string[];
  effort: "low" | "medium" | "high";
  impact: "high" | "medium" | "low";
  pillarId: string;
  criterionId: string;
}

export interface ReportData {
  repoName: string;
  repoPath: string;
  projectInfo: ProjectInfo;
  pillars: Pillar[];
  results: Map<string, CriterionResult[]>;
  levelResult: LevelResult;
  pillarScores: PillarScore[];
  recommendations: Recommendation[];
  considerations: Consideration[];
}

/**
 * Unscored, signal-driven suggestion (e.g. "this repo has Terraform — consider a
 * pi skill that wraps plan/validate"). Never affects the level or pillar scores.
 */
export interface Consideration {
  id: string;
  title: string;
  /** What in the repo triggered this suggestion. */
  signal: string;
  description: string;
  harnessAdvice?: HarnessAdvice[];
  /** Questions that lead the user to the option that fits their repo. */
  explore?: string[];
}

export interface Config {
  pillars?: Record<string, boolean>;
  criteria?: Record<string, boolean>;
  workspaces?: ConfigWorkspace[];
  knowledge?: string | string[];
  /** Harnesses to tailor advice to; overrides detection. */
  harnesses?: HarnessId[];
  /**
   * Per-criterion paths (repo-relative, globs allowed): a directory runs the
   * check there, a file counts as evidence. Keyed by criterion ID.
   */
  paths?: Record<string, string | string[]>;
  thresholds?: Record<string, number>;
  aiEnabled?: boolean;
  apiKey?: string;
  apiBaseUrl?: string;
}

export type ConfigWorkspace =
  | string
  | {
      name?: string;
      path: string;
      description?: string;
      languages?: string[];
      knowledge?: string | string[];
    };

export interface CLIOptions {
  path: string;
  ai: boolean;
  apiKey?: string;
  ci: boolean;
  format: "text" | "json";
  minLevel?: number;
  noColor: boolean;
  init: boolean;
  web: boolean;
  /** Path of checklist file to write (.md or .txt). */
  checklist?: string;
}

export interface RenderOptions {
  noColor: boolean;
  ci: boolean;
}

export interface LLMClient {
  evaluate(
    prompt: string,
    context: string,
  ): Promise<{ pass: boolean; message: string; details?: string }>;
}
