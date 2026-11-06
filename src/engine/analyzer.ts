import type {
  Pillar,
  ProjectInfo,
  CriterionResult,
  LLMClient,
  ProjectWorkspaceInfo,
} from "../types/index.js";
import path from "node:path";
import { detectTypes } from "./detector.js";
import { type CriterionPaths, resolveMappedPaths } from "./paths.js";

export type OnPillarStart = (pillar: Pillar) => void;
export type OnPillarComplete = (
  pillar: Pillar,
  results: CriterionResult[],
) => void;

export interface AnalysisEngineOptions {
  aiEnabled?: boolean;
  llmClient?: LLMClient;
  onPillarStart?: OnPillarStart;
  onPillarComplete?: OnPillarComplete;
  /** Per-criterion locations from `paths:` in .agent-profile.yml (default: `.`). */
  criterionPaths?: CriterionPaths;
}

export class AnalysisEngine {
  private pillars: Pillar[];
  private repoPath: string;
  private projectInfo: ProjectInfo;
  private aiEnabled: boolean;
  private llmClient?: LLMClient;
  private onPillarStart?: OnPillarStart;
  private onPillarComplete?: OnPillarComplete;
  private criterionPaths: CriterionPaths;
  private subdirInfo = new Map<string, Promise<ProjectInfo>>();

  constructor(
    pillars: Pillar[],
    repoPath: string,
    projectInfo: ProjectInfo,
    options?: AnalysisEngineOptions,
  ) {
    this.pillars = pillars;
    this.repoPath = repoPath;
    this.projectInfo = projectInfo;
    this.aiEnabled = options?.aiEnabled ?? false;
    this.llmClient = options?.llmClient;
    this.onPillarStart = options?.onPillarStart;
    this.onPillarComplete = options?.onPillarComplete;
    this.criterionPaths = options?.criterionPaths ?? {};
  }

  async run(): Promise<Map<string, CriterionResult[]>> {
    const allResults = new Map<string, CriterionResult[]>();

    // Run pillars sequentially so we can report progress per pillar
    for (const pillar of this.pillars) {
      this.onPillarStart?.(pillar);

      // Run criteria within a pillar concurrently
      const criteriaResults = await Promise.all(
        pillar.criteria.map((criterion) => this.runCriterion(criterion)),
      );

      allResults.set(pillar.id, criteriaResults);
      this.onPillarComplete?.(pillar, criteriaResults);
    }

    return allResults;
  }

  private async runCriterion(
    criterion: Pillar["criteria"][number],
  ): Promise<CriterionResult> {
    // Skip LLM-required criteria when AI is not enabled
    if (criterion.requiresLLM && !this.aiEnabled) {
      return {
        criterionId: criterion.id,
        pass: false,
        message: "Requires --ai flag",
        skipped: true,
      };
    }

    try {
      return await this.runInLocations(criterion);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        criterionId: criterion.id,
        pass: false,
        message: `Check failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Run a check in each location from `paths:` (default: the repo root `.`).
   * A directory runs the real check inside it; a file counts as evidence.
   * Configured `workspaces` are tried after that, as extra roots for every check.
   */
  private async runInLocations(
    criterion: Pillar["criteria"][number],
  ): Promise<CriterionResult> {
    const configured = this.criterionPaths[criterion.id];
    const { dirs, files, missing } = configured
      ? await resolveMappedPaths(this.repoPath, configured)
      : { dirs: ["."], files: [] as string[], missing: [] as string[] };

    let firstFailure: CriterionResult | undefined;
    for (const dir of dirs) {
      const isRoot = dir === ".";
      const result = await criterion.check(
        isRoot ? this.repoPath : path.resolve(this.repoPath, dir),
        isRoot ? this.projectInfo : await this.subdirProjectInfo(dir),
        this.llmClient,
      );
      if (result.pass) {
        return isRoot ? result : { ...result, message: `[${dir}] ${result.message}` };
      }
      firstFailure ??= result;
    }

    if (files.length > 0) {
      return {
        criterionId: criterion.id,
        pass: true,
        message: `Mapped in .agent-profile.yml: ${files.join(", ")}`,
      };
    }

    for (const workspace of this.projectInfo.workspaces) {
      const workspaceResult = await criterion.check(
        path.resolve(this.repoPath, workspace.path),
        this.workspaceProjectInfo(workspace),
        this.llmClient,
      );
      if (workspaceResult.pass) {
        return {
          ...workspaceResult,
          message: `[${workspace.name}] ${workspaceResult.message}`,
        };
      }
    }

    const failure: CriterionResult = firstFailure ?? {
      criterionId: criterion.id,
      pass: false,
      message: "Not found in the paths configured for this check.",
    };
    const isDefault = !configured || (dirs.length === 1 && dirs[0] === ".");
    if (isDefault && missing.length === 0) return failure;

    const notes = [
      `checked: ${dirs.length > 0 ? dirs.join(", ") : "nothing"}`,
      missing.length > 0 ? `not found: ${missing.join(", ")}` : "",
    ].filter(Boolean);
    return {
      ...failure,
      message: `${failure.message} (paths in .agent-profile.yml — ${notes.join("; ")})`,
    };
  }

  /** Project info for a sub-folder: its own languages, the root's context. */
  private subdirProjectInfo(dir: string): Promise<ProjectInfo> {
    let cached = this.subdirInfo.get(dir);
    if (!cached) {
      cached = detectTypes(path.resolve(this.repoPath, dir)).then((types) => ({
        detectedTypes: types,
        isMonorepo: false,
        packages: [],
        workspaces: [],
        knowledge: this.projectInfo.knowledge,
        harnesses: this.projectInfo.harnesses,
        harnessSource: this.projectInfo.harnessSource,
      }));
      this.subdirInfo.set(dir, cached);
    }
    return cached;
  }

  private workspaceProjectInfo(workspace: ProjectWorkspaceInfo): ProjectInfo {
    return {
      detectedTypes: workspace.detectedTypes,
      isMonorepo: false,
      packages: [],
      workspaces: [],
      knowledge: [...this.projectInfo.knowledge, ...workspace.knowledge],
      harnesses: this.projectInfo.harnesses,
      harnessSource: this.projectInfo.harnessSource,
    };
  }
}
